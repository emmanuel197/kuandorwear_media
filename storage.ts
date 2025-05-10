import { useQuery } from "@tanstack/react-query";
import AdminSidebar from "@/components/admin/sidebar";
import StatCard from "@/components/admin/stat-card";
import SalesChart from "@/components/admin/sales-chart";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import { BarChart3, ShoppingBag, Users, Truck, DollarSign } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PriceDisplay from "@/components/price-display";

export default function AdminDashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();

  // Fetch admin stats
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/admin/stats"],
  });

  // Fetch recent orders
  const { data: recentOrders, isLoading: isLoadingOrders } = useQuery({
    queryKey: ["/api/orders"],
  });

  if (!user || user.role !== "admin") {
    return null; // Protected by ProtectedRoute component
  }

  const orderStatusColors: Record<string, string> = {
    "pending": "bg-amber-100 text-amber-800",
    "processing": "bg-blue-100 text-blue-800",
    "shipped": "bg-indigo-100 text-indigo-800",
    "delivered": "bg-green-100 text-green-800",
    "cancelled": "bg-red-100 text-red-800"
  };

  const orderColumns = [
    {
      accessorKey: "id",
      header: t("admin.dashboard.orders.id"),
    },
    {
      accessorKey: "customerId",
      header: t("admin.dashboard.orders.customer"),
    },
    {
      accessorKey: "totalAmount",
      header: t("admin.dashboard.orders.amount"),
      cell: ({ row }: any) => (
        <PriceDisplay 
          amount={Number(row.getValue("totalAmount"))}
          className="font-medium"
        />
      ),
    },
    {
      accessorKey: "status",
      header: t("admin.dashboard.orders.status"),
      cell: ({ row }: any) => {
        const status = row.getValue("status") as string;
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${orderStatusColors[status] || "bg-gray-100"}`}>
            {status}
          </span>
        );
      },
    },
    {
      accessorKey: "orderDate",
      header: t("admin.dashboard.orders.date"),
      cell: ({ row }: any) => {
        const date = new Date(row.getValue("orderDate"));
        return date.toLocaleDateString();
      },
    },
  ];

  return (
    <div className="flex">
      <AdminSidebar />

      <div className="flex-1 p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">{t("admin.dashboard.title")}</h1>
          <span className="text-sm text-gray-500">
            {new Date().toLocaleDateString()} | {user.fullName}
          </span>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {isLoading ? (
            <>
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </>
          ) : (
            <>
              <StatCard 
                title={t("admin.dashboard.stats.sales")}
                value={stats?.totalSales ? 
                  new Intl.NumberFormat('en-GH', {
                    style: 'currency',
                    currency: 'GHS',
                    minimumFractionDigits: 2,
                  }).format(stats.totalSales) : "GHS 0.00"
                }
                icon={<DollarSign className="h-8 w-8 text-primary" />}
              />
              <StatCard 
                title={t("admin.dashboard.stats.orders")}
                value={stats?.totalOrders.toString() || "0"}
                description={`${stats?.pendingOrders || 0} pending`}
                icon={<ShoppingBag className="h-8 w-8 text-amber-500" />}
              />
              <StatCard 
                title={t("admin.dashboard.stats.customers")}
                value={stats?.totalCustomers.toString() || "0"}
                icon={<Users className="h-8 w-8 text-indigo-500" />}
              />
              <StatCard 
                title={t("admin.dashboard.stats.products")}
                value={stats?.totalProducts.toString() || "0"}
                icon={<Truck className="h-8 w-8 text-green-500" />}
              />
            </>
          )}
        </div>

        {/* Sales Analytics */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{t("admin.dashboard.salesAnalytics")}</CardTitle>
            <CardDescription>{t("admin.dashboard.salesDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <SalesChart />
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.dashboard.recentOrders")}</CardTitle>
            <CardDescription>{t("admin.dashboard.recentOrdersDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingOrders ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <DataTable 
                columns={orderColumns} 
                data={recentOrders?.slice(0, 5) || []} 
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
