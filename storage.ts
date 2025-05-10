import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage as dbStorage } from "./storage";
import { setupAuth } from "./auth";
import { 
  insertProductSchema, 
  insertOrderSchema, 
  insertOrderItemSchema,
  loginSchema,
  CartItem,
  insertReviewSchema // Added import for review schema
} from "@shared/schema";
import { ZodError } from "zod";
import Paystack from "paystack-node";
import multer from "multer";
import path from "path";
import fs from "fs-extra";

declare global {
  namespace Express {
    interface Request {
      requireRole(roles: string[]): (req: Request, res: Response, next: NextFunction) => void;
    }
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  setupAuth(app);

  // Initialize Paystack API client
  if (!process.env.PAYSTACK_SECRET_KEY) {
    console.error("Missing PAYSTACK_SECRET_KEY environment variable");
  }
  const paystackClient = new Paystack(process.env.PAYSTACK_SECRET_KEY || "");

  // Check if Paystack client is properly initialized
  if (!paystackClient || !paystackClient.transaction) {
    console.error("Failed to initialize Paystack client properly");
  }
  
  // Configure multer for image upload
  // Ensure upload directory exists
  const uploadDir = path.join(process.cwd(), 'uploads', 'products');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  const multerStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, 'product-' + uniqueSuffix + ext);
    }
  });
  
  const upload = multer({ 
    storage: multerStorage,
    limits: { 
      fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
      // Accept only image files
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    }
  });

  // Role-based authorization middleware
  const requireRole = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userRole = req.user?.role;
      if (!userRole || !roles.includes(userRole)) {
        return res.status(403).json({ message: "Forbidden: Insufficient permissions" });
      }

      next();
    };
  };

  // Error handler for Zod validation errors
  const handleZodError = (error: unknown, res: Response) => {
    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors,
      });
    }

    console.error("Unexpected error:", error);
    return res.status(500).json({ message: "Internal server error" });
  };
  
  // Helper function to safely access req.user properties with TypeScript safety
  const safeUser = (req: Request) => {
    if (!req.isAuthenticated() || !req.user) {
      return null;
    }
    return req.user;
  };

  // Products API
  app.get("/api/products", async (req, res) => {
    try {
      const { category, supplierId, comingSoon } = req.query;
      const filters: any = {
        isActive: true,
      };

      if (category) filters.category = category;
      if (supplierId) filters.supplierId = Number(supplierId);
      if (comingSoon !== undefined) filters.comingSoon = comingSoon === 'true';

      const products = await dbStorage.getProducts(filters);
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });
  
  // Endpoint to get coming soon products
  app.get("/api/coming-soon-products", async (req, res) => {
    try {
      const comingSoonProducts = await dbStorage.getProducts({ comingSoon: true });
      
      // If no coming soon products in the database, return the mock product for demo purposes
      if (comingSoonProducts.length === 0) {
        const mockComingSoonProduct = {
          id: 9999, // Using an ID that won't conflict with existing products
          name: "Limited Edition Collection 2025",
          description: "Our upcoming exclusive limited edition design - be the first to know when it launches!",
          price: 49.99,
          discount: 0,
          category: "t-shirts",
          imageUrls: ["https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=600&h=600"],
          availableSizes: ["S", "M", "L", "XL"],
          availableColors: ["Black", "White", "Red"],
          supplierId: 2,
          stock: 0,
          isActive: false,
          comingSoon: true,
          releaseDate: new Date(2025, 5, 15) // June 15, 2025
        };
        
        return res.json([mockComingSoonProduct]);
      }
      
      res.json(comingSoonProducts);
    } catch (error) {
      console.error("Error fetching coming soon products:", error);
      res.status(500).json({ message: "Failed to fetch coming soon products" });
    }
  });
  
  // Create coming soon product
  app.post("/api/products/coming-soon", requireRole(["admin", "supplier"]), async (req, res) => {
    try {
      // Set stock to 0, isActive to false and comingSoon to true
      const productData = {
        ...req.body,
        stock: 0,
        isActive: false,
        comingSoon: true
      };
      
      // If supplier is creating product, ensure supplierId is their own ID
      const productUser = safeUser(req);
      if (productUser?.role === "supplier") {
        productData.supplierId = productUser.id;
      }
      
      const product = await dbStorage.createProduct(productData);
      res.status(201).json(product);
    } catch (error) {
      handleZodError(error, res);
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      
      // Special case for our mock coming soon product
      if (productId === 9999) {
        return res.json({
          id: 9999,
          name: "Limited Edition Collection 2025",
          description: "Our upcoming exclusive limited edition design - be the first to know when it launches!",
          price: 49.99,
          discount: 0,
          category: "t-shirts",
          imageUrls: ["https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=600&h=600"],
          availableSizes: ["S", "M", "L", "XL"],
          availableColors: ["Black", "White", "Red"],
          supplierId: 2,
          stock: 0,
          isActive: false,
          comingSoon: true,
          releaseDate: new Date(2025, 5, 15) // June 15, 2025
        });
      }
      
      const product = await dbStorage.getProduct(productId);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  app.post("/api/products", requireRole(["admin", "supplier"]), async (req, res) => {
    try {
      // Add default false value for comingSoon if not provided 
      const productData = insertProductSchema.parse({
        ...req.body,
        comingSoon: req.body.comingSoon || false
      });

      // If supplier is creating product, ensure supplierId is their own ID
      const user = safeUser(req);
      if (user?.role === "supplier") {
        productData.supplierId = user.id;
      }

      const product = await dbStorage.createProduct(productData);

      // Initialize inventory for the supplier
      await dbStorage.updateInventory(product.supplierId, product.id, product.stock);

      res.status(201).json(product);
    } catch (error) {
      handleZodError(error, res);
    }
  });

  app.put("/api/products/:id", requireRole(["admin", "supplier"]), async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const product = await dbStorage.getProduct(productId);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Suppliers can only update their own products
      const user = safeUser(req);
      if (user?.role === "supplier" && product.supplierId !== user.id) {
        return res.status(403).json({ message: "You can only update your own products" });
      }

      const updatedProduct = await dbStorage.updateProduct(productId, req.body);

      // Update inventory if stock changed
      if (req.body.stock !== undefined) {
        await dbStorage.updateInventory(product.supplierId, productId, req.body.stock);
      }

      res.json(updatedProduct);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  app.delete("/api/products/:id", requireRole(["admin"]), async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const deleted = await dbStorage.deleteProduct(productId);

      if (!deleted) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // Orders API
  app.get("/api/orders", requireRole(["admin", "customer", "supplier"]), async (req, res) => {
    try {
      const filters: any = {};

      // Customers can only see their own orders
      const currentUser = safeUser(req);
      if (currentUser?.role === "customer") {
        filters.customerId = currentUser.id;
      } else if (req.query.customerId) {
        filters.customerId = Number(req.query.customerId);
      }

      if (req.query.status) {
        filters.status = req.query.status;
      }

      const orders = await dbStorage.getOrders(filters);

      // If supplier, filter orders that contain products they supply
      const supplierUser = safeUser(req);
      if (supplierUser?.role === "supplier") {
        // Get all products by the supplier
        const supplierProducts = await dbStorage.getProducts({ supplierId: supplierUser.id });
        const supplierProductIds = supplierProducts.map(product => product.id);

        // For each order, get the items and check if any product is supplied by this supplier
        const supplierOrders = await Promise.all(
          orders.map(async (order) => {
            const orderItems = await dbStorage.getOrderItems(order.id);
            const hasSupplierItems = orderItems.some(item => 
              supplierProductIds.includes(item.productId)
            );

            if (hasSupplierItems) {
              return {
                ...order,
                items: orderItems.filter(item => supplierProductIds.includes(item.productId))
              };
            }
            return null;
          })
        );

        // Filter out null values (orders without supplier items)
        const filteredOrders = supplierOrders.filter(order => order !== null);
        return res.json(filteredOrders);
      }

      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/:id", requireRole(["admin", "customer", "supplier"]), async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const order = await dbStorage.getOrder(orderId);

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Customers can only view their own orders
      const orderUser = safeUser(req);
      if (orderUser?.role === "customer" && order.customerId !== orderUser.id) {
        return res.status(403).json({ message: "You can only view your own orders" });
      }

      // Get order items
      const orderItems = await dbStorage.getOrderItems(orderId);

      // Suppliers can only view orders containing their products
      const itemsUser = safeUser(req);
      if (itemsUser?.role === "supplier") {
        // Get all products by the supplier
        const supplierProducts = await dbStorage.getProducts({ supplierId: itemsUser.id });
        const supplierProductIds = supplierProducts.map(product => product.id);

        // Check if any order item is from this supplier
        const hasSupplierItems = orderItems.some(item => 
          supplierProductIds.includes(item.productId)
        );

        if (!hasSupplierItems) {
          return res.status(403).json({ message: "You can only view orders containing your products" });
        }

        // Filter order items to only include supplier's products
        const filteredItems = orderItems.filter(item => 
          supplierProductIds.includes(item.productId)
        );

        return res.json({ ...order, items: filteredItems });
      }

      res.json({ ...order, items: orderItems });
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  app.post("/api/orders", requireRole(["customer"]), async (req, res) => {
    try {
      const createOrderUser = safeUser(req);
      if (!createOrderUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const orderData = insertOrderSchema.parse({
        ...req.body,
        customerId: createOrderUser.id
      });

      // Create the order
      const order = await dbStorage.createOrder(orderData);

      // Add order items
      const orderItems = req.body.items || [];
      for (const item of orderItems) {
        const orderItemData = insertOrderItemSchema.parse({
          ...item,
          orderId: order.id
        });

        await dbStorage.addOrderItem(orderItemData);

        // Update product stock
        const product = await dbStorage.getProduct(item.productId);
        if (product) {
          const newStock = Math.max(0, product.stock - item.quantity);
          await dbStorage.updateProduct(item.productId, { stock: newStock });
          await dbStorage.updateInventory(product.supplierId, product.id, newStock);
        }
      }

      // Clear user's cart
      const cartUser = safeUser(req);
      if (cartUser) {
        await dbStorage.updateCart(cartUser.id, []);
      }

      res.status(201).json(order);
    } catch (error) {
      handleZodError(error, res);
    }
  });

  app.put("/api/orders/:id", requireRole(["admin"]), async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const order = await dbStorage.getOrder(orderId);

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const updatedOrder = await dbStorage.updateOrder(orderId, req.body);
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({ message: "Failed to update order" });
    }
  });

  // PATCH endpoint for suppliers to update order status
  app.patch("/api/orders/:id", requireRole(["admin", "supplier"]), async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const order = await dbStorage.getOrder(orderId);

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only allow updating order status
      if (!req.body.status) {
        return res.status(400).json({ message: "Order status is required" });
      }

      // Validate order status
      const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled"];
      if (!validStatuses.includes(req.body.status)) {
        return res.status(400).json({ message: "Invalid order status" });
      }

      // For suppliers, we need to check if this order contains their products
      const orderUser = safeUser(req);
      if (orderUser?.role === "supplier") {
        const orderItems = await dbStorage.getOrderItems(orderId);
        const supplierProducts = await dbStorage.getProducts({ supplierId: orderUser.id });
        const supplierProductIds = supplierProducts.map(product => product.id);

        // Check if any order item is from this supplier
        const hasSupplierItems = orderItems.some(item => 
          supplierProductIds.includes(item.productId)
        );

        if (!hasSupplierItems) {
          return res.status(403).json({ message: "You can only update orders containing your products" });
        }
      }

      const updatedOrder = await dbStorage.updateOrder(orderId, { status: req.body.status });
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // Cart API
  app.get("/api/cart", requireRole(["customer"]), async (req, res) => {
    try {
      const cartViewUser = safeUser(req);
      if (!cartViewUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const cart = await dbStorage.getCart(cartViewUser.id);
      res.json(cart || { userId: cartViewUser.id, items: [] });
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });

  app.put("/api/cart", requireRole(["customer"]), async (req, res) => {
    try {
      const items = req.body.items as CartItem[];
      const updateCartUser = safeUser(req);
      if (!updateCartUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const cart = await dbStorage.updateCart(updateCartUser.id, items);
      res.json(cart);
    } catch (error) {
      console.error("Error updating cart:", error);
      res.status(500).json({ message: "Failed to update cart" });
    }
  });

  // Supplier inventory API
  app.get("/api/inventory", requireRole(["supplier"]), async (req, res) => {
    try {
      const inventoryUser = safeUser(req);
      if (!inventoryUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const inventory = await dbStorage.getInventory(inventoryUser.id);
      res.json(inventory);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ message: "Failed to fetch inventory" });
    }
  });

  app.put("/api/inventory/:productId", requireRole(["supplier"]), async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const { stock } = req.body;

      if (typeof stock !== 'number' || stock < 0) {
        return res.status(400).json({ message: "Invalid stock value" });
      }

      const product = await dbStorage.getProduct(productId);

      // Check if product exists and belongs to the supplier
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const inventoryUser = safeUser(req);
      if (!inventoryUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      if (product.supplierId !== inventoryUser.id) {
        return res.status(403).json({ message: "You can only update your own inventory" });
      }

      const inventory = await dbStorage.updateInventory(inventoryUser.id, productId, stock);

      // Also update the product stock
      await dbStorage.updateProduct(productId, { stock });

      res.json(inventory);
    } catch (error) {
      console.error("Error updating inventory:", error);
      res.status(500).json({ message: "Failed to update inventory" });
    }
  });

  // Admin users management
  app.get("/api/admin/customers", requireRole(["admin"]), async (req, res) => {
    try {
      const customers = await dbStorage.getUsersByRole("customer");

      // Add metadata like order count if needed
      const customersWithMetadata = await Promise.all(
        customers.map(async (customer) => {
          const customerOrders = await dbStorage.getOrders({ customerId: customer.id });
          return {
            ...customer,
            orderCount: customerOrders.length,
          };
        })
      );

      res.json(customersWithMetadata);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  app.get("/api/admin/suppliers", requireRole(["admin"]), async (req, res) => {
    try {
      const suppliers = await dbStorage.getUsersByRole("supplier");

      // Add metadata like product count
      const suppliersWithMetadata = await Promise.all(
        suppliers.map(async (supplier) => {
          const supplierProducts = await dbStorage.getProducts({ supplierId: supplier.id });
          return {
            ...supplier,
            productCount: supplierProducts.length,
          };
        })
      );

      res.json(suppliersWithMetadata);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      res.status(500).json({ message: "Failed to fetch suppliers" });
    }
  });

  // Endpoint to clear all orders (admin only)
  app.delete("/api/admin/orders", requireRole(["admin"]), async (req, res) => {
    try {
      // Get all orders
      const orders = await dbStorage.getOrders();

      // Delete each order
      for (const order of orders) {
        // Delete order items first
        const orderItems = await dbStorage.getOrderItems(order.id);
        // In a real database we would use transactions, but for this demo we'll loop
        for (const item of orderItems) {
          // Here we would delete the order items, but our storage interface doesn't have this method
          // For now, we'll just continue with the order deletion
        }

        // Delete the order
        await dbStorage.deleteOrder(order.id);
      }

      res.status(200).json({ message: "All orders have been cleared" });
    } catch (error) {
      console.error("Error clearing orders:", error);
      res.status(500).json({ message: "Failed to clear orders" });
    }
  });

  // Get supplier inventory details
  app.get("/api/supplier/inventory/:supplierId", requireRole(["admin", "supplier"]), async (req, res) => {
    try {
      const supplierId = parseInt(req.params.supplierId);

      // Check if the user has permission to access this data
      if (req.user?.role !== "admin" && req.user?.id !== supplierId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const inventory = await dbStorage.getInventory(supplierId);

      // Fetch product details for each inventory item
      const inventoryWithProductDetails = await Promise.all(
        inventory.map(async (item) => {
          const product = await dbStorage.getProduct(item.productId);
          return {
            ...item,
            product
          };
        })
      );

      res.json(inventoryWithProductDetails);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ message: "Failed to fetch inventory" });
    }
  });

  // Get individual user details
  app.get("/api/users/:id", requireRole(["admin"]), async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await dbStorage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Paystack Payment Integration
  app.post("/api/payments/initialize", requireRole(["customer"]), async (req, res) => {
    try {
      const { amount, email, paymentMethod, orderId, callbackUrl } = req.body;

      if (!amount || !email || !paymentMethod) {
        return res.status(400).json({ message: "Missing required payment details" });
      }

      // Format amount to kobo (smallest currency unit in Nigeria - 100 kobo = 1 NGN)
      // Paystack's default currency is NGN, and we'll use this for payment processing
      const amountInKobo = Math.floor(amount * 100);

      // For Paystack processing, we'll use NGN which is widely supported
      const currency = "NGN";

      // Create payment reference
      const reference = `order_${orderId || 'temp'}_${Date.now()}`;

      // Prepare channels based on selected payment method
      let channels: string[] = [];

      switch (paymentMethod) {
        case 'credit_card':
          channels = ['card'];
          break;
        case 'mtn_mobile':
          channels = ['mobile_money'];
          break;
        case 'telecel':
          channels = ['mobile_money'];
          break;
        case 'bank_transfer':
          channels = ['bank_transfer'];
          break;
        default:
          channels = ['card', 'mobile_money', 'bank_transfer']; 
      }

      // Check if Paystack client is properly initialized
      if (!paystackClient || !paystackClient.transaction || !paystackClient.transaction.initialize) {
        console.error("Paystack client not properly initialized or missing 'transaction.initialize' method");

        // For development/testing, continue with mock implementation
        console.log("Using mock implementation for payment initialization");
      }

      // For development/testing, just return a success response with dummy values
      // This allows us to continue testing the flow without actual Paystack integration
      // Remove this in production
      const mockPaystackResponse = {
        success: true,
        authorizationUrl: `${req.protocol}://${req.get('host')}/payment-success?reference=${reference}`,
        reference: reference
      };

      // Return mock response
      return res.json(mockPaystackResponse);

      /* Uncomment this for actual Paystack integration
      try {
        const initResult = await paystackClient.transaction.initialize({
          amount: amountInKobo, 
          email,
          reference,
          currency,
          callback_url: callbackUrl || `${req.protocol}://${req.get('host')}/payment-success`,
          channels,
          metadata: {
            orderId,
            userId: req.user?.id,
            paymentMethod
          }
        });

        if (initResult.body.status) {
          // Return authorization URL to the client
          return res.json({
            success: true,
            authorizationUrl: initResult.body.data.authorization_url,
            reference: initResult.body.data.reference
          });
        } else {
          return res.status(400).json({
            success: false,
            message: initResult.body.message
          });
        }
      } catch (error) {
        console.error("Paystack initialization error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to initialize payment"
        });
      }
      */
    } catch (error) {
      console.error("Payment initialization error:", error);
      res.status(500).json({ message: "Failed to initialize payment" });
    }
  });

  // Verify Paystack payment
  app.get("/api/payments/verify/:reference", async (req, res) => {
    try {
      const { reference } = req.params;

      if (!reference) {
        return res.status(400).json({ message: "Payment reference is required" });
      }

      // Check if reference contains order ID (format: order_X_timestamp)
      const orderIdMatch = reference.match(/order_(\d+)_/);
      let orderId = null;

      if (orderIdMatch && orderIdMatch[1]) {
        orderId = parseInt(orderIdMatch[1]);

        // Update order in database if found
        const order = await dbStorage.getOrder(orderId);
        if (order) {
          await dbStorage.updateOrder(orderId, { 
            paymentStatus: "paid",
            status: "processing" 
          });
        }
      }

      // For development/testing, return a success response with mock data
      return res.json({
        success: true,
        data: {
          status: "success",
          reference: reference,
          amount: 10000, // 100.00 in the smallest currency unit
          metadata: {
            orderId: orderId,
            paymentMethod: "mtn_mobile" // or whatever was selected
          }
        }
      });

      /* Uncomment this for actual Paystack integration
      // Check if Paystack client is properly initialized
      if (!paystackClient || !paystackClient.transaction || !paystackClient.transaction.verify) {
        console.error("Paystack client not properly initialized or missing 'transaction.verify' method");
        return res.status(500).json({
          success: false,
          message: "Payment service unavailable"
        });
      }

      const verifyResult = await paystackClient.transaction.verify({ reference });

      if (verifyResult.body.status && verifyResult.body.data.status === "success") {
        const metadata = verifyResult.body.data.metadata;

        // If this is associated with an order, update the order payment status
        if (metadata && metadata.orderId) {
          const orderId = parseInt(metadata.orderId);
          const order = await dbStorage.getOrder(orderId);

          if (order) {
            await dbStorage.updateOrder(orderId, { 
              paymentStatus: "paid",
              status: "processing" 
            });
          }
        }

        return res.json({
          success: true,
          data: verifyResult.body.data
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "Payment verification failed",
          data: verifyResult.body.data
        });
      }
      */
    } catch (error) {
      console.error("Payment verification error:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to verify payment" 
      });
    }
  });

  // Admin dashboard stats
  app.get("/api/admin/stats", requireRole(["admin"]), async (req, res) => {
    try {
      const orders = await dbStorage.getOrders();
      const products = await dbStorage.getProducts();
      const customers = await dbStorage.getUsersByRole("customer");
      const suppliers = await dbStorage.getUsersByRole("supplier");

      // Calculate total sales
      const totalSales = orders.reduce((sum, order) => sum + order.totalAmount, 0);

      // Calculate pending orders
      const pendingOrders = orders.filter(order => order.status === "pending").length;

      // Group orders by status
      const ordersByStatus = orders.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      res.json({
        totalSales,
        totalOrders: orders.length,
        pendingOrders,
        totalProducts: products.length,
        totalCustomers: customers.length,
        totalSuppliers: suppliers.length,
        ordersByStatus
      });
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ message: "Failed to fetch admin stats" });
    }
  });

  // Admin-only: Clear all orders
  app.delete("/api/admin/orders", requireRole(["admin"]), async (req, res) => {
    try {
      // Get all orders
      const orders = await dbStorage.getOrders();

      // Delete each order
      for (const order of orders) {
        await dbStorage.deleteOrder(order.id);
      }

      res.json({ success: true, message: "All orders have been deleted" });
    } catch (error) {
      console.error("Error clearing orders:", error);
      res.status(500).json({ error: "Failed to clear orders" });
    }
  });

  // Reviews API
  app.post("/api/products/:id/reviews", requireRole(["customer"]), async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const reviewUser = safeUser(req);
      if (!reviewUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const review = insertReviewSchema.parse({
        ...req.body,
        productId,
        customerId: reviewUser.id,
      });

      const newReview = await dbStorage.createReview(review);
      res.status(201).json(newReview);
    } catch (error) {
      handleZodError(error, res);
    }
  });
  
  // Get reviews for a product
  app.get("/api/products/:id/reviews", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const reviews = await dbStorage.getReviews(productId);
      res.json(reviews);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });
  
  // Get top reviews for the home page
  app.get("/api/reviews/top", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const reviews = await dbStorage.getTopReviews(limit);
      
      // Get product details for each review
      const reviewsWithProducts = await Promise.all(
        reviews.map(async (review) => {
          const product = await dbStorage.getProduct(review.productId);
          let customer = null;
          if (review.customerId !== null) {
            customer = await dbStorage.getUser(review.customerId);
          }
          
          return {
            ...review,
            product: product ? { 
              id: product.id,
              name: product.name,
              imageUrl: product.imageUrls[0] 
            } : null,
            customer: customer ? {
              id: customer.id,
              fullName: customer.fullName
            } : null
          };
        })
      );
      
      res.json(reviewsWithProducts);
    } catch (error) {
      console.error("Error fetching top reviews:", error);
      res.status(500).json({ message: "Failed to fetch top reviews" });
    }
  });

  // Admin review endpoints
  app.get("/api/admin/reviews", requireRole(["admin"]), async (req, res) => {
    try {
      const reviews = await dbStorage.getReviews();
      
      // Get product details for each review
      const reviewsWithDetails = await Promise.all(
        reviews.map(async (review) => {
          const product = await dbStorage.getProduct(review.productId);
          let customer = null;
          if (review.customerId !== null) {
            customer = await dbStorage.getUser(review.customerId);
          }
          
          return {
            ...review,
            product: product ? { 
              id: product.id,
              name: product.name,
              imageUrl: product.imageUrls[0] 
            } : null,
            customer: customer ? {
              id: customer.id,
              fullName: customer.fullName
            } : null
          };
        })
      );
      
      res.json(reviewsWithDetails);
    } catch (error) {
      console.error("Error fetching all reviews:", error);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  // Delete a review (admin only)
  app.delete("/api/admin/reviews/:id", requireRole(["admin"]), async (req, res) => {
    try {
      const reviewId = parseInt(req.params.id);
      if (isNaN(reviewId)) {
        return res.status(400).json({ message: "Invalid review ID" });
      }

      const deleted = await dbStorage.deleteReview(reviewId);
      if (!deleted) {
        return res.status(404).json({ message: "Review not found" });
      }
      
      res.status(200).json({ message: "Review deleted successfully" });
    } catch (error) {
      console.error("Error deleting review:", error);
      res.status(500).json({ message: "Failed to delete review" });
    }
  });
  
  // Image upload endpoint
  app.post("/api/upload/product-image", requireRole(["admin", "supplier"]), upload.single('image'), async (req: Request & { file?: Express.Multer.File }, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      // Create URL for uploaded image
      // Use relative URL path to avoid hardcoded domain issues
      const imageUrl = `/uploads/products/${req.file.filename}`;
      
      res.status(201).json({ 
        url: imageUrl,
        filename: req.file.filename,
        message: "Image uploaded successfully" 
      });
    } catch (error) {
      console.error("Error uploading image:", error);
      res.status(500).json({ message: "Failed to upload image" });
    }
  });
  
  // Serve uploaded files statically
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  const httpServer = createServer(app);
  return httpServer;
}
