import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Vehicles from "./pages/Vehicles";
import SalesOrders from "./pages/SalesOrders";
import SalesOrderDetail from "./pages/SalesOrderDetail";
import Invoices from "./pages/Invoices";
import Accounts from "./pages/Accounts";
import Journals from "./pages/Journals";
import UsersAdmin from "./pages/UsersAdmin";
import Organization from "./pages/Organization";
import Permissions from "./pages/Permissions";
import ComingSoon from "./pages/ComingSoon";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-center" dir="rtl" />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/vehicles" element={<Vehicles />} />
              <Route path="/sales-orders" element={<SalesOrders />} />
              <Route path="/sales-orders/:id" element={<SalesOrderDetail />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/journals" element={<Journals />} />
              <Route path="/users" element={<UsersAdmin />} />
              <Route path="/organization" element={<Organization />} />
              <Route path="/permissions" element={<Permissions />} />
              <Route path="/spare-parts" element={<ComingSoon title="قطع الغيار" />} />
              <Route path="/workshop" element={<ComingSoon title="الورشة والصيانة" />} />
              <Route path="/inventory" element={<ComingSoon title="المخزون" />} />
              <Route path="/reports" element={<ComingSoon title="التقارير والإحصاءات" />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
