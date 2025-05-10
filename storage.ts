import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect } from "wouter";
import { ReactNode } from "react";

type ProtectedRouteProps = {
  children: ReactNode;
  roles?: string[];
  role?: string;
};

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return <Redirect to="/auth" />;
  }

  // Role check
  if (roles && !roles.includes(user.role)) {
    // Redirect based on role
    if (user.role === "admin") {
      return <Redirect to="/admin" />;
    } else if (user.role === "supplier") {
      return <Redirect to="/supplier" />;
    } else {
      return <Redirect to="/" />;
    }
  }

  return <>{children}</>;
}
