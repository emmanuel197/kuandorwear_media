import { 
  User, InsertUser, Product, InsertProduct, 
  Order, InsertOrder, OrderItem, InsertOrderItem,
  Cart, InsertCart, SupplierInventory, InsertSupplierInventory,
  CartItem, UserRole,
  users, products, orders, orderItems, carts, supplierInventory,
  reviews, InsertReview, Review
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from 'drizzle-orm';
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

// Create PostgreSQL session store
const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsersByRole(role: UserRole): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;

  // Product management
  getProduct(id: number): Promise<Product | undefined>;
  getProducts(filters?: {
    category?: string;
    supplierId?: number;
    isActive?: boolean;
  }): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<Product>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;

  // Order management
  getOrder(id: number): Promise<Order | undefined>;
  getOrders(filters?: {
    customerId?: number;
    status?: string;
  }): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: number, order: Partial<Order>): Promise<Order | undefined>;
  deleteOrder(id: number): Promise<boolean>;
  getOrderItems(orderId: number): Promise<OrderItem[]>;
  addOrderItem(orderItem: InsertOrderItem): Promise<OrderItem>;

  // Cart management
  getCart(userId: number): Promise<Cart | undefined>;
  updateCart(userId: number, items: CartItem[]): Promise<Cart>;

  // Supplier inventory management
  getInventory(supplierId: number): Promise<SupplierInventory[]>;
  updateInventory(supplierId: number, productId: number, stock: number): Promise<SupplierInventory | undefined>;

  // Review management
  createReview(review: InsertReview): Promise<Review>;
  getReviews(productId?: number): Promise<Review[]>;
  getTopReviews(limit?: number): Promise<Review[]>;
  deleteReview(id: number): Promise<boolean>;

  // Product recommendations
  getTrendingProducts(limit?: number): Promise<Product[]>;
  getTopSellingProducts(limit?: number): Promise<Product[]>;

  // Session store for authentication
  sessionStore: session.Store;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private products: Map<number, Product>;
  private orders: Map<number, Order>;
  private orderItems: Map<number, OrderItem>;
  private carts: Map<number, Cart>;
  private supplierInventories: Map<number, SupplierInventory>;
  private reviews: Map<number, Review>;

  private userIdCounter: number;
  private productIdCounter: number;
  private orderIdCounter: number;
  private orderItemIdCounter: number;
  private cartIdCounter: number;
  private inventoryIdCounter: number;
  private reviewIdCounter: number;

  sessionStore: session.Store;

  constructor() {
    this.users = new Map();
    this.products = new Map();
    this.orders = new Map();
    this.orderItems = new Map();
    this.carts = new Map();
    this.supplierInventories = new Map();
    this.reviews = new Map();

    this.userIdCounter = 1;
    this.productIdCounter = 1;
    this.orderIdCounter = 1;
    this.orderItemIdCounter = 1;
    this.cartIdCounter = 1;
    this.inventoryIdCounter = 1;
    this.reviewIdCounter = 1;

    // Create memory store for sessions
    const MemoryStore = require("memorystore")(session);
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // 24 hours
    });

    // Initialize with demo data
    this.initializeDemoData();
  }

  // User management
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUsersByRole(role: UserRole): Promise<User[]> {
    return Array.from(this.users.values()).filter(
      (user) => user.role === role,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const createdAt = new Date();
    const user: User = { ...insertUser, id, createdAt };
    this.users.set(id, user);
    return user;
  }

  // Product management
  async getProduct(id: number): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async getProducts(filters?: {
    category?: string;
    supplierId?: number;
    isActive?: boolean;
    comingSoon?: boolean;
  }): Promise<Product[]> {
    let products = Array.from(this.products.values());

    if (filters) {
      if (filters.category) {
        products = products.filter(p => p.category === filters.category);
      }
      if (filters.supplierId) {
        products = products.filter(p => p.supplierId === filters.supplierId);
      }
      if (filters.isActive !== undefined) {
        products = products.filter(p => p.isActive === filters.isActive);
      }
      if (filters.comingSoon !== undefined) {
        products = products.filter(p => 
          // Handle products that might not have the comingSoon property yet
          (p.comingSoon !== undefined ? p.comingSoon === filters.comingSoon : false)
        );
      }
    }

    return products;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const id = this.productIdCounter++;
    const newProduct: Product = { ...product, id };
    this.products.set(id, newProduct);
    return newProduct;
  }

  async updateProduct(id: number, product: Partial<Product>): Promise<Product | undefined> {
    const existingProduct = this.products.get(id);
    if (!existingProduct) return undefined;

    const updatedProduct = { ...existingProduct, ...product };
    this.products.set(id, updatedProduct);
    return updatedProduct;
  }

  async deleteProduct(id: number): Promise<boolean> {
    return this.products.delete(id);
  }

  // Order management
  async getOrder(id: number): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async getOrders(filters?: {
    customerId?: number;
    status?: string;
  }): Promise<Order[]> {
    let orders = Array.from(this.orders.values());

    if (filters) {
      if (filters.customerId) {
        orders = orders.filter(o => o.customerId === filters.customerId);
      }
      if (filters.status) {
        orders = orders.filter(o => o.status === filters.status);
      }
    }

    return orders;
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const id = this.orderIdCounter++;
    const orderDate = new Date();
    const newOrder: Order = { ...order, id, orderDate };
    this.orders.set(id, newOrder);
    return newOrder;
  }

  async updateOrder(id: number, order: Partial<Order>): Promise<Order | undefined> {
    const existingOrder = this.orders.get(id);
    if (!existingOrder) return undefined;

    const updatedOrder = { ...existingOrder, ...order };
    this.orders.set(id, updatedOrder);
    return updatedOrder;
  }

  async deleteOrder(id: number): Promise<boolean> {
    // Delete order items associated with this order first
    const orderItems = await this.getOrderItems(id);
    for (const item of orderItems) {
      this.orderItems.delete(item.id);
    }

    // Then delete the order itself
    return this.orders.delete(id);
  }

  async getOrderItems(orderId: number): Promise<OrderItem[]> {
    return Array.from(this.orderItems.values()).filter(
      item => item.orderId === orderId
    );
  }

  async addOrderItem(orderItem: InsertOrderItem): Promise<OrderItem> {
    const id = this.orderItemIdCounter++;
    const newOrderItem: OrderItem = { ...orderItem, id };
    this.orderItems.set(id, newOrderItem);
    return newOrderItem;
  }

  // Cart management
  async getCart(userId: number): Promise<Cart | undefined> {
    return Array.from(this.carts.values()).find(
      cart => cart.userId === userId
    );
  }

  async updateCart(userId: number, items: CartItem[]): Promise<Cart> {
    let cart = await this.getCart(userId);

    if (!cart) {
      const id = this.cartIdCounter++;
      cart = {
        id,
        userId,
        items,
        updatedAt: new Date()
      };
    } else {
      cart = {
        ...cart,
        items,
        updatedAt: new Date()
      };
    }

    this.carts.set(cart.id, cart);
    return cart;
  }

  // Supplier inventory management
  async getInventory(supplierId: number): Promise<SupplierInventory[]> {
    return Array.from(this.supplierInventories.values()).filter(
      inventory => inventory.supplierId === supplierId
    );
  }

  async updateInventory(supplierId: number, productId: number, stock: number): Promise<SupplierInventory | undefined> {
    const inventory = Array.from(this.supplierInventories.values()).find(
      inv => inv.supplierId === supplierId && inv.productId === productId
    );

    if (!inventory) {
      const id = this.inventoryIdCounter++;
      const newInventory: SupplierInventory = {
        id,
        supplierId,
        productId,
        availableStock: stock,
        updatedAt: new Date()
      };
      this.supplierInventories.set(id, newInventory);
      return newInventory;
    }

    const updatedInventory: SupplierInventory = {
      ...inventory,
      availableStock: stock,
      updatedAt: new Date()
    };

    this.supplierInventories.set(inventory.id, updatedInventory);

    // Update product stock
    const product = await this.getProduct(productId);
    if (product) {
      await this.updateProduct(productId, { stock });
    }

    return updatedInventory;
  }

  async createReview(review: InsertReview): Promise<Review> {
    const id = this.reviewIdCounter++;
    const createdAt = new Date();

    // Handle case where a review doesn't have a customerId (admin-created general review)
    const reviewData = {
      ...review,
      customerId: review.customerId && review.customerId > 0 ? review.customerId : null
    };

    const newReview: Review = {...reviewData, id, createdAt};
    this.reviews.set(id, newReview);
    return newReview;
  }

  async getReviews(productId?: number): Promise<Review[]> {
    let reviews = Array.from(this.reviews.values());

    if (productId !== undefined) {
      reviews = reviews.filter(r => r.productId === productId);
    }

    // Sort by newest first
    return reviews.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getTopReviews(limit: number = 5): Promise<Review[]> {
    // Get all reviews and sort by rating (highest first)
    const reviews = Array.from(this.reviews.values())
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);

    return reviews;
  }

  async deleteReview(id: number): Promise<boolean> {
    return this.reviews.delete(id);
  }

  async getTrendingProducts(limit: number = 4): Promise<Product[]> {
    // For in-memory storage, we'll simulate trending products based on highest rating
    const reviewAverages = new Map<number, { total: number, count: number }>();

    // Calculate average ratings for each product
    Array.from(this.reviews.values()).forEach(review => {
      const current = reviewAverages.get(review.productId) || { total: 0, count: 0 };
      reviewAverages.set(review.productId, {
        total: current.total + review.rating,
        count: current.count + 1
      });
    });

    // Get products with their average ratings
    const productsWithRatings = Array.from(this.products.values())
      .map(product => {
        const rating = reviewAverages.get(product.id);
        return {
          product,
          avgRating: rating ? rating.total / rating.count : 0
        };
      })
      .filter(item => item.product.isActive) // Only include active products
      .sort((a, b) => b.avgRating - a.avgRating) // Sort by rating
      .slice(0, limit)
      .map(item => item.product);

    return productsWithRatings;
  }

  async getTopSellingProducts(limit: number = 4): Promise<Product[]> {
    // Create a map to track product sales count
    const salesCount = new Map<number, number>();

    // Count occurrences of products in order items
    Array.from(this.orderItems.values()).forEach(item => {
      const current = salesCount.get(item.productId) || 0;
      salesCount.set(item.productId, current + item.quantity);
    });

    // Get products with their sales counts
    const topSellingProducts = Array.from(this.products.values())
      .map(product => {
        return {
          product,
          salesCount: salesCount.get(product.id) || 0
        };
      })
      .filter(item => item.product.isActive) // Only include active products
      .sort((a, b) => b.salesCount - a.salesCount) // Sort by sales count
      .slice(0, limit)
      .map(item => item.product);

    return topSellingProducts;
  }

  // Initialize demo data
  private async initializeDemoData() {
    // Create demo users
    await this.createUser({
      username: "admin",
      password: "password123", // Will be hashed in auth.ts
      email: "admin@example.com",
      fullName: "Admin User",
      role: "admin"
    });

    await this.createUser({
      username: "supplier",
      password: "password123", // Will be hashed in auth.ts
      email: "supplier@example.com",
      fullName: "Supplier User",
      role: "supplier"
    });

    await this.createUser({
      username: "customer",
      password: "password123", // Will be hashed in auth.ts
      email: "customer@example.com",
      fullName: "Customer User",
      role: "customer"
    });

    // Create initial products with discounts
    const tShirt1 = await this.createProduct({
      name: "Urban Art Tee",
      description: "Premium cotton tee with exclusive urban art design",
      price: 29.99,
      discount: 5, // Added discount
      category: "t-shirts",
      imageUrls: ["https://images.unsplash.com/photo-1503341733017-1901578f9f1e?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=600&h=600"],
      availableSizes: ["S", "M", "L", "XL"],
      availableColors: ["Black", "Blue", "Red"],
      supplierId: 2,
      stock: 100,
      isActive: true
    });

    const tShirt2 = await this.createProduct({
      name: "Graphic Designer Tee",
      description: "Limited edition graphic design inspired tee",
      price: 34.99,
      discount: 7.50, // Added discount
      category: "t-shirts",
      imageUrls: ["https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=600&h=600"],
      availableSizes: ["S", "M", "L", "XL"],
      availableColors: ["Gray", "White"],
      supplierId: 2,
      stock: 80,
      isActive: true
    });

    const tShirt3 = await this.createProduct({
      name: "Vintage Pattern Collection",
      description: "Classic patterns with a modern twist",
      price: 39.99,
      discount: 10, // Added discount
      category: "t-shirts",
      imageUrls: ["https://images.unsplash.com/photo-1529374255404-311a2a4f1fd9?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=600&h=600"],
      availableSizes: ["S", "M", "L", "XL"],
      availableColors: ["Brown", "Green"],
      supplierId: 2,
      stock: 60,
      isActive: true
    });

    const tShirt4 = await this.createProduct({
      name: "Premium Essentials Pack",
      description: "Bundle of 3 premium basic tees - subscriber exclusive",
      price: 79.99,
      discount: 15, // Added discount
      category: "t-shirts",
      imageUrls: ["https://images.unsplash.com/photo-1508427953056-b00b8d78ebf5?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=600&h=600"],
      availableSizes: ["S", "M", "L", "XL"],
      availableColors: ["Black", "White", "Gray"],
      supplierId: 2,
      stock: 40,
      isActive: true
    });

    // Initialize supplier inventory
    await this.updateInventory(2, tShirt1.id, 100);
    await this.updateInventory(2, tShirt2.id, 80);
    await this.updateInventory(2, tShirt3.id, 60);
    await this.updateInventory(2, tShirt4.id, 40);

    // Add dummy reviews
    const dummyReviews = [
      { productId: tShirt1.id, customerId: 3, rating: 5, comment: "Great quality and design!" },
      { productId: tShirt1.id, customerId: 3, rating: 4, comment: "Fits perfectly, love the material" },
      { productId: tShirt2.id, customerId: 3, rating: 5, comment: "Amazing graphic design, very unique" },
      { productId: tShirt3.id, customerId: 3, rating: 4, comment: "Classic patterns, good quality" },
      { productId: tShirt4.id, customerId: 3, rating: 5, comment: "Perfect essential pack, great value" }
    ];

    for (const review of dummyReviews) {
      await this.createReview(review);
    }
  }
}

export class DatabaseStorage implements Partial<IStorage> {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  // User management
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUsersByRole(role: UserRole): Promise<User[]> {
    return await db.select().from(users).where(eq(users.role, role));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Product management
  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select({
      id: products.id,
      name: products.name,
      description: products.description,
      price: products.price,
      category: products.category,
      imageUrls: products.imageUrls,
      availableSizes: products.availableSizes,
      availableColors: products.availableColors,
      supplierId: products.supplierId,
      stock: products.stock,
      discount: products.discount,
      isActive: products.isActive
    }).from(products).where(eq(products.id, id));

    if (!product) return undefined;

    // Return the product with comingSoon and releaseDate properties
    return {
      ...product,
      comingSoon: false, // Default value
      releaseDate: null
    };
  }

  async getProducts(filters?: {
    category?: string;
    supplierId?: number;
    isActive?: boolean;
    comingSoon?: boolean;
  }): Promise<Product[]> {
    // Explicitly select only the columns we know exist in the database
    let query = db.select({
      id: products.id,
      name: products.name,
      description: products.description,
      price: products.price,
      category: products.category,
      imageUrls: products.imageUrls,
      availableSizes: products.availableSizes,
      availableColors: products.availableColors,
      supplierId: products.supplierId,
      stock: products.stock,
      discount: products.discount,
      isActive: products.isActive
    }).from(products);

    if (filters) {
      if (filters.category) {
        query = query.where(eq(products.category, filters.category));
      }
      if (filters.supplierId) {
        query = query.where(eq(products.supplierId, filters.supplierId));
      }
      if (filters.isActive !== undefined) {
        query = query.where(eq(products.isActive, filters.isActive));
      }
      // Skip comingSoon filter for database implementation as the column doesn't exist yet
      // We'll handle this in memory for now
    }

    let productList = await query;

    // Add comingSoon property to each product
    productList = productList.map(product => ({
      ...product,
      comingSoon: false, // Default value
      releaseDate: null
    }));

    // If comingSoon filter is specified, manually filter results in memory
    if (filters?.comingSoon !== undefined) {
      // For now, we have a dummy implementation until the DB schema is updated
      // We'll return an empty array for comingSoon=true as no products have been set as coming soon
      // When we have real data, we'll need to remove this
      return filters.comingSoon ? [] : productList;
    }

    return productList;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    // Remove comingSoon and releaseDate fields for database insertion since they don't exist in the schema yet
    const { comingSoon, releaseDate, ...dbProduct } = product as any;

    const [newProduct] = await db
      .insert(products)
      .values(dbProduct)
      .returning();

    // Add the comingSoon property back to the returned object
    return { 
      ...newProduct, 
      comingSoon: comingSoon || false,
      releaseDate: releaseDate || null
    };
  }

  async updateProduct(id: number, product: Partial<Product>): Promise<Product | undefined> {
    try {
      // Convert camelCase property names to snake_case for DB
      const updateData: Record<string, any> = {};

      if (product.name !== undefined) updateData.name = product.name;
      if (product.description !== undefined) updateData.description = product.description;
      if (product.price !== undefined) updateData.price = product.price;
      if (product.category !== undefined) updateData.category = product.category;
      if (product.imageUrls !== undefined) updateData.image_urls = product.imageUrls;
      if (product.availableSizes !== undefined) updateData.available_sizes = product.availableSizes;
      if (product.availableColors !== undefined) updateData.available_colors = product.availableColors;
      if (product.supplierId !== undefined) updateData.supplier_id = product.supplierId;
      if (product.stock !== undefined) updateData.stock = product.stock;
      if (product.discount !== undefined) updateData.discount = product.discount;
      if (product.isActive !== undefined) updateData.is_active = product.isActive;
      if (product.comingSoon !== undefined) updateData.coming_soon = product.comingSoon;
      if (product.releaseDate !== undefined) updateData.release_date = product.releaseDate;

      // Only proceed if there are fields to update
      if (Object.keys(updateData).length === 0) {
        const existingProduct = await this.getProduct(id);
        return existingProduct; 
      }

      const [updatedProduct] = await db
        .update(products)
        .set(updateData)
        .where(eq(products.id, id))
        .returning();

      return updatedProduct || undefined;
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  }

  async deleteProduct(id: number): Promise<boolean> {
    try {
      // First delete related entries in supplier_inventory
      await db
        .delete(supplierInventory)
        .where(eq(supplierInventory.productId, id));

      // Delete any reviews associated with the product
      await db
        .delete(reviews)
        .where(eq(reviews.productId, id));

      // Then delete the product itself
      const [deleted] = await db
        .delete(products)
        .where(eq(products.id, id))
        .returning();

      return !!deleted;
    } catch (error) {
      console.error("Error in deleteProduct:", error);
      return false;
    }
  }

  // Order management
  async getOrder(id: number): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order || undefined;
  }

  async getOrders(filters?: {
    customerId?: number;
    status?: string;
  }): Promise<Order[]> {
    let query = db.select().from(orders);

    if (filters) {
      if (filters.customerId) {
        query = query.where(eq(orders.customerId, filters.customerId));
      }
      if (filters.status) {
        query = query.where(eq(orders.status, filters.status));
      }
    }

    return await query;
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db
      .insert(orders)
      .values(order)
      .returning();
    return newOrder;
  }

  async updateOrder(id: number, order: Partial<Order>): Promise<Order | undefined> {
    const [updatedOrder] = await db
      .update(orders)
      .set(order)
      .where(eq(orders.id, id))
      .returning();
    return updatedOrder || undefined;
  }

  async deleteOrder(id: number): Promise<boolean> {
    try {
      // Delete all order items first
      await db.delete(orderItems).where(eq(orderItems.orderId, id));

      // Then delete the order itself
      const [deleted] = await db
        .delete(orders)
        .where(eq(orders.id, id))
        .returning();

      return !!deleted;
    } catch (error) {
      console.error("Error deleting order:", error);
      return false;
    }
  }

  async getOrderItems(orderId: number): Promise<OrderItem[]> {
    return await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }

  async addOrderItem(orderItem: InsertOrderItem): Promise<OrderItem> {
    const [newOrderItem] = await db
      .insert(orderItems)
      .values(orderItem)
      .returning();
    return newOrderItem;
  }

  // Cart management
  async getCart(userId: number): Promise<Cart | undefined> {
    const [cart] = await db.select().from(carts).where(eq(carts.userId, userId));
    return cart || undefined;
  }

  async updateCart(userId: number, items: CartItem[]): Promise<Cart> {
    const [existingCart] = await db.select().from(carts).where(eq(carts.userId, userId));

    if (!existingCart) {
      const [newCart] = await db
        .insert(carts)
        .values({
          userId,
          items,
          updatedAt: new Date()
        })
        .returning();
      return newCart;
    } else {
      const [updatedCart] = await db
        .update(carts)
        .set({
          items,
          updatedAt: new Date()
        })
        .where(eq(carts.userId, userId))
        .returning();
      return updatedCart;
    }
  }

  // Supplier inventory management
  async getInventory(supplierId: number): Promise<SupplierInventory[]> {
    return await db.select().from(supplierInventory).where(eq(supplierInventory.supplierId, supplierId));
  }

  async updateInventory(supplierId: number, productId: number, stock: number): Promise<SupplierInventory | undefined> {
    const [existingInventory] = await db
      .select()
      .from(supplierInventory)
      .where(
        and(
          eq(supplierInventory.supplierId, supplierId),
          eq(supplierInventory.productId, productId)
        )
      );

    if (!existingInventory) {
      const [newInventory] = await db
        .insert(supplierInventory)
        .values({
          supplierId,
          productId,
          availableStock: stock,
          updatedAt: new Date()
        })
        .returning();

      // Update product stock
      await this.updateProduct(productId, { stock });

      return newInventory;
    } else {
      const [updatedInventory] = await db
        .update(supplierInventory)
        .set({
          availableStock: stock,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(supplierInventory.supplierId, supplierId),
            eq(supplierInventory.productId, productId)
          )
        )
        .returning();

      // Update product stock
      await this.updateProduct(productId, { stock });

      return updatedInventory || undefined;
    }
  }

  async createReview(review: InsertReview): Promise<Review> {
    // Handle case where a review doesn't have a customerId (admin-created general review)
    const reviewData = {
      ...review,
      customerId: review.customerId && review.customerId > 0 ? review.customerId : null
    };

    const [newReview] = await db
      .insert(reviews)
      .values(reviewData)
      .returning();
    return newReview;
  }

  async getReviews(productId?: number): Promise<Review[]> {
    let query = db.select().from(reviews);

    if (productId !== undefined) {
      query = query.where(eq(reviews.productId, productId));
    }

    // Order by most recent
    return await query.orderBy(desc(reviews.createdAt));
  }

  async getTopReviews(limit: number = 5): Promise<Review[]> {
    // Get highest rated reviews
    return await db
      .select()
      .from(reviews)
      .orderBy(desc(reviews.rating))
      .limit(limit);
  }

  async deleteReview(id: number): Promise<boolean> {
    try {
      const [deleted] = await db
        .delete(reviews)
        .where(eq(reviews.id, id))
        .returning();
      return !!deleted;
    } catch (error) {
      console.error("Error deleting review:", error);
      return false;
    }
  }


  // Initialize demo data for development
  async initializeDemoData() {
    // Create demo users
    await this.createUser({
      username: "admin",
      password: "password123", // Will be hashed in auth.ts
      email: "admin@example.com",
      fullName: "Admin User",
      role: "admin"
    });

    await this.createUser({
      username: "supplier",
      password: "password123", // Will be hashed in auth.ts
      email: "supplier@example.com",
      fullName: "Supplier User",
      role: "supplier"
    });

    await this.createUser({
      username: "customer",
      password: "password123", // Will be hashed in auth.ts
      email: "customer@example.com",
      fullName: "Customer User",
      role: "customer"
    });

    // Create initial products with discounts
    const tShirt1 = await this.createProduct({
      name: "Urban Art Tee",
      description: "Premium cotton tee with exclusive urban art design",
      price: 29.99,
      discount: 5, // Added discount
      category: "t-shirts",
      imageUrls: ["https://images.unsplash.com/photo-1503341733017-1901578f9f1e?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=600&h=600"],
      availableSizes: ["S", "M", "L", "XL"],
      availableColors: ["Black", "Blue", "Red"],
      supplierId: 2,
      stock: 100,
      isActive: true
    });

    const tShirt2 = await this.createProduct({
      name: "Graphic Designer Tee",
      description: "Limited edition graphic design inspired tee",
      price: 34.99,
      discount: 7.50, // Added discount
      category: "t-shirts",
      imageUrls: ["https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=600&h=600"],
      availableSizes: ["S", "M", "L", "XL"],
      availableColors: ["Gray", "White"],
      supplierId: 2,
      stock: 80,
      isActive: true
    });

    const tShirt3 = await this.createProduct({
      name: "Vintage Pattern Collection",
      description: "Classic patterns with a modern twist",
      price: 39.99,
      discount: 10, // Added discount
      category: "t-shirts",
      imageUrls: ["https://images.unsplash.com/photo-1529374255404-311a2a4f1fd9?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=600&h=600"],
      availableSizes: ["S", "M", "L", "XL"],
      availableColors: ["Brown", "Green"],
      supplierId: 2,
      stock: 60,
      isActive: true
    });

    const tShirt4 = await this.createProduct({
      name: "Premium Essentials Pack",
      description: "Bundle of 3 premium basic tees - subscriber exclusive",
      price: 79.99,
      discount: 15, // Added discount
      category: "t-shirts",
      imageUrls: ["https://images.unsplash.com/photo-1508427953056-b00b8d78ebf5?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=600&h=600"],
      availableSizes: ["S", "M", "L", "XL"],
      availableColors: ["Black", "White", "Gray"],
      supplierId: 2,
      stock: 40,
      isActive: true
    });

    // Initialize supplier inventory
    await this.updateInventory(2, tShirt1.id, 100);
    await this.updateInventory(2, tShirt2.id, 80);
    await this.updateInventory(2, tShirt3.id, 60);
    await this.updateInventory(2, tShirt4.id, 40);

    // Add dummy reviews
    const dummyReviews = [
      { productId: tShirt1.id, customerId: 3, rating: 5, comment: "Great quality and design!" },
      { productId: tShirt1.id, customerId: 3, rating: 4, comment: "Fits perfectly, love the material" },
      { productId: tShirt2.id, customerId: 3, rating: 5, comment: "Amazing graphic design, very unique" },
      { productId: tShirt3.id, customerId: 3, rating: 4, comment: "Classic patterns, good quality" },
      { productId: tShirt4.id, customerId: 3, rating: 5, comment: "Perfect essential pack, great value" }
    ];

    for (const review of dummyReviews) {
      await this.createReview(review);
    }
  }
}

// Change from MemStorage to DatabaseStorage
export const storage = new DatabaseStorage();
