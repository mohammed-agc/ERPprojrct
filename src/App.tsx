import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErpSessionProvider } from "@/contexts/ErpSessionContext";
import AppLayout from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/erp/ErrorBoundary";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

// Route-level code splitting — heavy modules load on demand.
const Customers = lazy(() => import("./pages/Customers"));
const Contacts = lazy(() => import("./pages/Contacts"));
const ContactDetail = lazy(() => import("./pages/ContactDetail"));
const Vehicles = lazy(() => import("./pages/Vehicles"));
const VehicleDetail = lazy(() => import("./pages/VehicleDetail"));
const Procurement = lazy(() => import("./pages/Procurement"));
const SalesOrders = lazy(() => import("./pages/SalesOrders"));
const SalesOrderDetail = lazy(() => import("./pages/SalesOrderDetail"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Accounts = lazy(() => import("./pages/Accounts"));
const AccountDetail = lazy(() => import("./pages/AccountDetail"));
const Journals = lazy(() => import("./pages/Journals"));
const JournalDetail = lazy(() => import("./pages/JournalDetail"));
const GeneralLedger = lazy(() => import("./pages/GeneralLedger"));
const TrialBalance = lazy(() => import("./pages/TrialBalance"));
const AccountsReceivable = lazy(() => import("./pages/AccountsReceivable"));
const CustomerStatement = lazy(() => import("./pages/CustomerStatement"));
const AccountsPayable = lazy(() => import("./pages/AccountsPayable"));
const FinanceCenter = lazy(() => import("./pages/FinanceCenter"));
const IncomeStatementPage = lazy(() => import("./pages/IncomeStatement"));
const BalanceSheetPage = lazy(() => import("./pages/BalanceSheet"));
const CashFlow = lazy(() => import("./pages/CashFlow"));
const UsersAdmin = lazy(() => import("./pages/UsersAdmin"));
const Organization = lazy(() => import("./pages/Organization"));
const Permissions = lazy(() => import("./pages/Permissions"));
const Treasury = lazy(() => import("./pages/Treasury"));
const TreasuryAccounts = lazy(() => import("./pages/TreasuryAccounts"));
const TreasuryAccountDetail = lazy(() => import("./pages/TreasuryAccountDetail"));
const VouchersPage = lazy(() => import("./pages/Vouchers"));
const Transfers = lazy(() => import("./pages/Transfers"));
const BankReconciliation = lazy(() => import("./pages/BankReconciliation"));
const CostCenters = lazy(() => import("./pages/CostCenters"));
const FinancialDimensions = lazy(() => import("./pages/FinancialDimensions"));
const DepartmentProfitability = lazy(() => import("./pages/CenterProfitability").then(m => ({ default: m.DepartmentProfitability })));
const BranchProfitability = lazy(() => import("./pages/CenterProfitability").then(m => ({ default: m.BranchProfitability })));
const FinancialAnalysis = lazy(() => import("./pages/FinancialAnalysis"));
const CostAllocation = lazy(() => import("./pages/CostAllocation"));
const GovernanceDashboard = lazy(() => import("./pages/GovernanceDashboard"));
const FinancialPeriods = lazy(() => import("./pages/FinancialPeriods"));
const MonthlyClosing = lazy(() => import("./pages/MonthlyClosing"));
const YearEndClosing = lazy(() => import("./pages/YearEndClosing"));
const ApprovalsPage = lazy(() => import("./pages/Approvals"));
const AuditCenter = lazy(() => import("./pages/AuditCenter"));
const ComingSoon = lazy(() => import("./pages/ComingSoon"));
const ActivityFeed = lazy(() => import("./pages/ActivityFeed"));
const PurchasingDashboard = lazy(() => import("./pages/purchasing/PurchasingDashboard"));
const PurchaseRequests = lazy(() => import("./pages/purchasing/PurchaseRequests"));
const PurchaseOrders = lazy(() => import("./pages/purchasing/PurchaseOrders"));
const PurchaseInvoices = lazy(() => import("./pages/purchasing/PurchaseInvoices"));
const SupplierCredit = lazy(() => import("./pages/purchasing/SupplierCredit"));
const SupplierIncentives = lazy(() => import("./pages/purchasing/SupplierIncentives"));
const Shipments = lazy(() => import("./pages/purchasing/Shipments"));
const Receiving = lazy(() => import("./pages/purchasing/Receiving"));
const Inspection = lazy(() => import("./pages/purchasing/Inspection"));
const SalesDashboard = lazy(() => import("./pages/sales/SalesDashboard"));
const SalesQuotations = lazy(() => import("./pages/sales/Quotations"));
const SalesReservations = lazy(() => import("./pages/sales/Reservations"));
const SalesDeliveries = lazy(() => import("./pages/sales/Deliveries"));
const SalesFinancing = lazy(() => import("./pages/sales/Financing"));
const SalesAnalytics = lazy(() => import("./pages/sales/SalesAnalytics"));
const CustomerTimeline = lazy(() => import("./pages/sales/CustomerTimeline"));
const InventoryDashboard = lazy(() => import("./pages/inventory/InventoryDashboard"));
const InventoryWarehouses = lazy(() => import("./pages/inventory/Warehouses"));
const InventoryVehicles = lazy(() => import("./pages/inventory/VehicleInventory"));
const InventoryParts = lazy(() => import("./pages/inventory/PartsInventory"));
const InventoryMovements = lazy(() => import("./pages/inventory/Movements"));
const InventoryReservations = lazy(() => import("./pages/inventory/Reservations"));
const InventoryTransfers = lazy(() => import("./pages/inventory/Transfers"));


import { ErpAuthError } from "@/services/erp";

const PageLoader = () => (
  <div className="flex items-center justify-center py-20 text-xs text-muted-foreground" aria-busy="true">
    <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't hammer the backend on auth failures — let the UI surface a re-login.
      retry: (failureCount, error) => {
        if (error instanceof ErpAuthError) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: (failureCount, error) => {
        if (error instanceof ErpAuthError) return false;
        return failureCount < 1;
      },
    },
  },
});

const App = () => (
  <ErrorBoundary scope="app">
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-center" dir="rtl" />
      <BrowserRouter>
        <AuthProvider>
          <ErpSessionProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/contacts/:id" element={<ContactDetail />} />
              <Route path="/vehicles" element={<Vehicles />} />
              <Route path="/vehicles/:id" element={<VehicleDetail />} />
              <Route path="/procurement" element={<Procurement />} />
              <Route path="/purchasing" element={<PurchasingDashboard />} />
              <Route path="/purchasing/requests" element={<PurchaseRequests />} />
              <Route path="/purchasing/orders" element={<PurchaseOrders />} />
              <Route path="/purchasing/invoices" element={<PurchaseInvoices />} />
              <Route path="/purchasing/credit" element={<SupplierCredit />} />
              <Route path="/purchasing/incentives" element={<SupplierIncentives />} />
              <Route path="/purchasing/shipments" element={<Shipments />} />
              <Route path="/purchasing/receiving" element={<Receiving />} />
              <Route path="/purchasing/inspection" element={<Inspection />} />
              <Route path="/sales" element={<SalesDashboard />} />
              <Route path="/sales/quotations" element={<SalesQuotations />} />
              <Route path="/sales/reservations" element={<SalesReservations />} />
              <Route path="/sales/deliveries" element={<SalesDeliveries />} />
              <Route path="/sales/financing" element={<SalesFinancing />} />
              <Route path="/sales/analytics" element={<SalesAnalytics />} />
              <Route path="/sales/customer-timeline" element={<CustomerTimeline />} />
              <Route path="/sales-orders" element={<SalesOrders />} />
              <Route path="/sales-orders/:id" element={<SalesOrderDetail />} />
              <Route path="/invoices" element={<Invoices />} />

              <Route path="/accounts" element={<Accounts />} />
              <Route path="/accounts/:id" element={<AccountDetail />} />
              <Route path="/finance" element={<FinanceCenter />} />
              <Route path="/income-statement" element={<IncomeStatementPage />} />
              <Route path="/balance-sheet" element={<BalanceSheetPage />} />
              <Route path="/cash-flow" element={<CashFlow />} />
              <Route path="/journals" element={<Journals />} />
              <Route path="/journals/:id" element={<JournalDetail />} />
              <Route path="/general-ledger" element={<GeneralLedger />} />
              <Route path="/trial-balance" element={<TrialBalance />} />
              <Route path="/ar" element={<AccountsReceivable />} />
              <Route path="/ar/:id" element={<CustomerStatement />} />
              <Route path="/ap" element={<AccountsPayable />} />
              <Route path="/treasury" element={<Treasury />} />
              <Route path="/treasury/accounts" element={<TreasuryAccounts />} />
              <Route path="/treasury/accounts/:id" element={<TreasuryAccountDetail />} />
              <Route path="/treasury/receipts" element={<VouchersPage type="receipt" />} />
              <Route path="/treasury/payments" element={<VouchersPage type="payment" />} />
              <Route path="/treasury/transfers" element={<Transfers />} />
              <Route path="/treasury/reconciliation" element={<BankReconciliation />} />
              <Route path="/costing" element={<FinancialAnalysis />} />
              <Route path="/costing/centers" element={<CostCenters />} />
              <Route path="/costing/dimensions" element={<FinancialDimensions />} />
              <Route path="/costing/departments" element={<DepartmentProfitability />} />
              <Route path="/costing/branches" element={<BranchProfitability />} />
              <Route path="/costing/allocation" element={<CostAllocation />} />
              <Route path="/governance" element={<GovernanceDashboard />} />
              <Route path="/governance/periods" element={<FinancialPeriods />} />
              <Route path="/governance/monthly-close" element={<MonthlyClosing />} />
              <Route path="/governance/year-end-close" element={<YearEndClosing />} />
              <Route path="/governance/approvals" element={<ApprovalsPage scope="journal" />} />
              <Route path="/governance/audit" element={<AuditCenter />} />
              <Route path="/activity" element={<ActivityFeed />} />
              <Route path="/users" element={<UsersAdmin />} />
              <Route path="/organization" element={<Organization />} />
              <Route path="/permissions" element={<Permissions />} />
              <Route path="/spare-parts" element={<ComingSoon title="قطع الغيار" />} />
              <Route path="/workshop" element={<ComingSoon title="الورشة والصيانة" />} />
              <Route path="/inventory" element={<ComingSoon title="المخزون" />} />
              <Route path="/inventory" element={<InventoryDashboard />} />
              <Route path="/inventory/warehouses" element={<InventoryWarehouses />} />
              <Route path="/inventory/vehicles" element={<InventoryVehicles />} />
              <Route path="/inventory/parts" element={<InventoryParts />} />
              <Route path="/inventory/movements" element={<InventoryMovements />} />
              <Route path="/inventory/reservations" element={<InventoryReservations />} />
              <Route path="/inventory/transfers" element={<InventoryTransfers />} />
              <Route path="/reports" element={<ComingSoon title="التقارير والإحصاءات" />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </ErpSessionProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
