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
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

// Route-level code splitting — heavy modules load on demand.
const Customers = lazy(() => import("./pages/Customers"));
const Contacts = lazy(() => import("./pages/Contacts"));
const ContactDetail = lazy(() => import("./pages/ContactDetail"));
const Vehicles = lazy(() => import("./pages/Vehicles"));
const VehicleDetail = lazy(() => import("./pages/VehicleDetail"));
const SalesOrders = lazy(() => import("./pages/SalesOrders"));
const SalesOrderDetail = lazy(() => import("./pages/SalesOrderDetail"));
const Invoices = lazy(() => import("./pages/Invoices"));
const InvoiceDetail = lazy(() => import("./pages/InvoiceDetail"));
const ERPReports = lazy(() => import("./pages/ERPReports"));
const VehicleCatalog = lazy(() => import("./pages/VehicleCatalog"));
const CreditNotes = lazy(() => import("./pages/sales/CreditNotes"));
const CreditNoteDetail = lazy(() => import("./pages/sales/CreditNoteDetail"));
const Accounts = lazy(() => import("./pages/Accounts"));
const AccountDetail = lazy(() => import("./pages/AccountDetail"));
const Journals = lazy(() => import("./pages/Journals"));
const JournalDetail = lazy(() => import("./pages/JournalDetail"));
const GeneralLedger = lazy(() => import("./pages/GeneralLedger"));
const TrialBalance = lazy(() => import("./pages/TrialBalance"));
const AccountsReceivable = lazy(() => import("./pages/AccountsReceivable"));
const ARReconciliation = lazy(() => import("./pages/ARReconciliation"));
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
const VehicleProfitability = lazy(() => import("./pages/VehicleProfitability"));
const FinancialAnalysis = lazy(() => import("./pages/FinancialAnalysis"));
const CostAllocation = lazy(() => import("./pages/CostAllocation"));
const GovernanceDashboard = lazy(() => import("./pages/GovernanceDashboard"));
const GovernanceLog = lazy(() => import("./pages/governance/GovernanceLog"));
const FinancialPeriods = lazy(() => import("./pages/FinancialPeriods"));
const MonthlyClosing = lazy(() => import("./pages/MonthlyClosing"));
const YearEndClosing = lazy(() => import("./pages/YearEndClosing"));
const ApprovalsPage = lazy(() => import("./pages/Approvals"));
const AuditCenter = lazy(() => import("./pages/AuditCenter"));
const ComingSoon = lazy(() => import("./pages/ComingSoon"));
const ActivityFeed = lazy(() => import("./pages/ActivityFeed"));
const PurchasingDashboard = lazy(() => import("./pages/purchasing/PurchasingDashboard"));
const PurchaseRequests = lazy(() => import("./pages/purchasing/PurchaseRequests"));
const PurchaseRequestDetail = lazy(() => import("./pages/purchasing/PurchaseRequestDetail"));
const PurchaseOrders = lazy(() => import("./pages/purchasing/PurchaseOrders"));
const PurchaseOrderDetail = lazy(() => import("./pages/purchasing/PurchaseOrderDetail"));
const PurchaseInvoices = lazy(() => import("./pages/purchasing/PurchaseInvoices"));
const IncentiveManagement = lazy(() => import("./pages/purchasing/IncentiveManagement"));

const SupplierCredit = lazy(() => import("./pages/purchasing/SupplierCredit"));
const SupplierIncentives = lazy(() => import("./pages/purchasing/SupplierIncentives"));
const PurchaseInvoiceDetail = lazy(() => import("./pages/purchasing/PurchaseInvoiceDetail"));
const Allocations = lazy(() => import("./pages/purchasing/Allocations"));
const AllocationDetail = lazy(() => import("./pages/purchasing/AllocationDetail"));
const AllocationConfirmations = lazy(() => import("./pages/purchasing/AllocationConfirmations"));
const AllocationConfirmationDetail = lazy(() => import("./pages/purchasing/AllocationConfirmationDetail"));
const Shipments = lazy(() => import("./pages/purchasing/Shipments"));
const Receiving = lazy(() => import("./pages/purchasing/Receiving"));
const ReceivingWorkbench = lazy(() => import("./pages/purchasing/ReceivingWorkbench"));

const Inspection = lazy(() => import("./pages/purchasing/Inspection"));
const InspectionDetail = lazy(() => import("./pages/purchasing/InspectionDetail"));
const SalesDashboard = lazy(() => import("./pages/sales/SalesDashboard"));
const SalesQuotations = lazy(() => import("./pages/sales/Quotations"));
const QuotationNew = lazy(() => import("./pages/sales/QuotationNew"));
const QuotationDetail = lazy(() => import("./pages/sales/QuotationDetail"));
const QuotationPrint = lazy(() => import("./pages/sales/QuotationPrint"));
const InvoicePrint = lazy(() => import("./pages/InvoicePrint"));
const SalesReservations = lazy(() => import("./pages/sales/Reservations"));
const SalesDeliveries = lazy(() => import("./pages/sales/Deliveries"));
const SalesFinancing = lazy(() => import("./pages/sales/Financing"));
const CustomerTimeline = lazy(() => import("./pages/sales/CustomerTimeline"));
const SalesAnalytics = lazy(() => import("./pages/sales/SalesAnalytics"));
const CustomerCredit = lazy(() => import("./pages/sales/CustomerCredit"));
const CustomerPayments = lazy(() => import("./pages/sales/CustomerPayments"));
const InventoryDashboard = lazy(() => import("./pages/inventory/InventoryDashboard"));
const InventoryWarehouses = lazy(() => import("./pages/inventory/Warehouses"));
const InventoryVehicles = lazy(() => import("./pages/inventory/VehicleInventory"));
const InventoryParts = lazy(() => import("./pages/inventory/PartsInventory"));
const InventoryMovements = lazy(() => import("./pages/inventory/Movements"));
const InventoryReservations = lazy(() => import("./pages/inventory/Reservations"));
const InventoryTransfers = lazy(() => import("./pages/inventory/Transfers"));

const ProductsMaster = lazy(() => import("./pages/master/Products"));
const ColorsMaster = lazy(() => import("./pages/master/Colors"));
const PurchaseInvoicesRegistry = lazy(() => import("./pages/accounting/PurchaseInvoicesRegistry"));
const PurchaseInvoiceAccountingDetail = lazy(() => import("./pages/accounting/PurchaseInvoiceAccountingDetail"));
const SalesInvoicesRegistry = lazy(() => import("./pages/accounting/SalesInvoicesRegistry"));

// Admin module
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminRoles = lazy(() => import("./pages/admin/Roles"));
const AdminRolesManager = lazy(() => import("./pages/admin/RolesManager"));
const AdminSessions = lazy(() => import("./pages/admin/Sessions"));
const AdminLoginHistory = lazy(() => import("./pages/admin/LoginHistory"));
const AdminAuditLog = lazy(() => import("./pages/admin/AuditLog"));
const AdminMasterDataHub = lazy(() => import("./pages/admin/MasterDataHub"));
const AdminUatTools = lazy(() => import("./pages/admin/UatTools"));
const AdminSettingsCompany = lazy(() => import("./pages/admin/settings/Company"));
const AdminSettingsBranches = lazy(() => import("./pages/admin/settings/Branches"));
const AdminSettingsAccountDetermination = lazy(() => import("./pages/admin/settings/AccountDetermination"));
const AdminSettingsAccountGroups = lazy(() => import("./pages/admin/settings/AccountGroups"));
const AdminSettingsCommunications = lazy(() => import("./pages/admin/settings/Communications"));
const HRDashboard = lazy(() => import("./pages/hr/HRDashboard"));
const HREmployees = lazy(() => import("./pages/hr/Employees"));
const HREmployeeDetail = lazy(() => import("./pages/hr/EmployeeDetail"));
const HRJobPositions = lazy(() => import("./pages/hr/JobPositions"));
const HRLeaveTypes = lazy(() => import("./pages/hr/LeaveTypes"));
const HRSalaryComponents = lazy(() => import("./pages/hr/SalaryComponents"));
const HRLeaves = lazy(() => import("./pages/hr/Leaves"));
const HRPayroll = lazy(() => import("./pages/hr/Payroll"));
const HREmployeeSalary = lazy(() => import("./pages/hr/EmployeeSalary"));
const HREmployeeLoans = lazy(() => import("./pages/hr/EmployeeLoans"));
const HRPayrollRunDetail = lazy(() => import("./pages/hr/PayrollRunDetail"));
const AdminSettingsWarehouses = lazy(() => import("./pages/admin/settings/Warehouses"));
const AdminSettingsTax = lazy(() => import("./pages/admin/settings/Tax"));
const AdminSettingsSequences = lazy(() => import("./pages/admin/settings/Sequences"));
const AdminSettingsTemplates = lazy(() => import("./pages/admin/settings/Templates"));

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
            <Route path="/print/quotations/:id" element={<QuotationPrint />} />
            <Route path="/print/invoices/:id" element={<InvoicePrint />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/contacts/:id" element={<ContactDetail />} />
              <Route path="/vehicles" element={<Vehicles />} />
              <Route path="/vehicles/:id" element={<VehicleDetail />} />
              <Route path="/purchasing" element={<PurchasingDashboard />} />
              <Route path="/purchasing/requests" element={<PurchaseRequests />} />
              <Route path="/purchasing/requests/:id" element={<PurchaseRequestDetail />} />
              <Route path="/purchasing/orders" element={<PurchaseOrders />} />
              <Route path="/purchasing/orders/:id" element={<PurchaseOrderDetail />} />
              <Route path="/purchasing/invoices" element={<PurchaseInvoices />} />
              <Route path="/incentives" element={<IncentiveManagement />} />
              <Route path="/purchasing/invoices/:id" element={<PurchaseInvoiceDetail />} />
              <Route path="/purchasing/allocations" element={<Allocations />} />
              <Route path="/purchasing/allocations/:id" element={<AllocationDetail />} />
              <Route path="/purchasing/allocation-confirmations" element={<AllocationConfirmations />} />
              <Route path="/purchasing/allocation-confirmations/:id" element={<AllocationConfirmationDetail />} />

              <Route path="/purchasing/credit" element={<SupplierCredit />} />
              <Route path="/purchasing/incentives" element={<SupplierIncentives />} />
              <Route path="/purchasing/shipments" element={<Shipments />} />
              <Route path="/purchasing/receiving" element={<Receiving />} />
              <Route path="/purchasing/receiving/workbench" element={<ReceivingWorkbench />} />
              <Route path="/purchasing/inspection" element={<Inspection />} />
              <Route path="/purchasing/inspection/:id" element={<InspectionDetail />} />
              <Route path="/hr" element={<HRDashboard />} />
              <Route path="/hr/employees" element={<HREmployees />} />
              <Route path="/hr/employees/:id" element={<HREmployeeDetail />} />
              <Route path="/hr/positions" element={<HRJobPositions />} />
              <Route path="/hr/leave-types" element={<HRLeaveTypes />} />
              <Route path="/hr/salary-components" element={<HRSalaryComponents />} />
              <Route path="/hr/leaves" element={<HRLeaves />} />
              <Route path="/hr/payroll" element={<HRPayroll />} />
              <Route path="/hr/payroll/:id" element={<HRPayrollRunDetail />} />
              <Route path="/hr/employees/:id/salary" element={<HREmployeeSalary />} />
              <Route path="/hr/loans" element={<HREmployeeLoans />} />
              <Route path="/sales" element={<SalesDashboard />} />
              <Route path="/sales/quotations" element={<SalesQuotations />} />
              <Route path="/sales/quotations/new" element={<QuotationNew />} />
              <Route path="/sales/quotations/:id" element={<QuotationDetail />} />
              <Route path="/sales/quotations/:id/print" element={<QuotationPrint />} />
              <Route path="/sales/reservations" element={<SalesReservations />} />
              <Route path="/sales/deliveries" element={<SalesDeliveries />} />
              <Route path="/sales/financing" element={<SalesFinancing />} />
              <Route path="/sales/customer-timeline" element={<CustomerTimeline />} />
              <Route path="/sales/analytics" element={<SalesAnalytics />} />
              <Route path="/sales/customer-credit" element={<CustomerCredit />} />
              <Route path="/sales/customer-payments" element={<CustomerPayments />} />
              <Route path="/sales-orders" element={<SalesOrders />} />
              <Route path="/sales-orders/:id" element={<SalesOrderDetail />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/invoices/:id" element={<InvoiceDetail />} />
              <Route path="/sales/credit-notes" element={<CreditNotes />} />
              <Route path="/sales/credit-notes/:id" element={<CreditNoteDetail />} />

              <Route path="/accounts" element={<Accounts />} />
              <Route path="/accounting/purchase-invoices" element={<PurchaseInvoicesRegistry />} />
              <Route path="/accounting/purchase-invoices/:id" element={<PurchaseInvoiceAccountingDetail />} />
              <Route path="/accounting/sales-invoices" element={<SalesInvoicesRegistry />} />
              <Route path="/accounts/:id" element={<AccountDetail />} />
              <Route path="/finance" element={<FinanceCenter />} />
              <Route path="/erp-reports" element={<ERPReports />} />
              <Route path="/vehicle-catalog" element={<VehicleCatalog />} />
              <Route path="/income-statement" element={<IncomeStatementPage />} />
              <Route path="/balance-sheet" element={<BalanceSheetPage />} />
              <Route path="/cash-flow" element={<CashFlow />} />
              <Route path="/journals" element={<Journals />} />
              <Route path="/journals/:id" element={<JournalDetail />} />
              <Route path="/general-ledger" element={<GeneralLedger />} />
              <Route path="/trial-balance" element={<TrialBalance />} />
              <Route path="/ar" element={<AccountsReceivable />} />
              <Route path="/ar/reconciliation" element={<ARReconciliation />} />
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
              <Route path="/costing/vehicles" element={<VehicleProfitability />} />
              <Route path="/costing/allocation" element={<CostAllocation />} />
              <Route path="/governance" element={<GovernanceDashboard />} />
              <Route path="/governance/periods" element={<FinancialPeriods />} />
              <Route path="/governance/monthly-close" element={<MonthlyClosing />} />
              <Route path="/governance/year-end-close" element={<YearEndClosing />} />
              <Route path="/governance/approvals" element={<ApprovalsPage scope="journal" />} />
              <Route path="/governance/audit" element={<AuditCenter />} />
              <Route path="/governance/credit-decisions" element={<GovernanceLog />} />
              <Route path="/activity" element={<ActivityFeed />} />
              <Route path="/users" element={<UsersAdmin />} />
              <Route path="/organization" element={<Organization />} />
              <Route path="/permissions" element={<Permissions />} />
              <Route path="/spare-parts" element={<ComingSoon title="قطع الغيار" />} />
              <Route path="/workshop" element={<ComingSoon title="الورشة والصيانة" />} />
              
              <Route path="/inventory" element={<InventoryDashboard />} />
              <Route path="/inventory/warehouses" element={<InventoryWarehouses />} />
              <Route path="/inventory/vehicles" element={<InventoryVehicles />} />
              <Route path="/inventory/parts" element={<InventoryParts />} />
              <Route path="/inventory/movements" element={<InventoryMovements />} />
              <Route path="/inventory/reservations" element={<InventoryReservations />} />
              <Route path="/inventory/transfers" element={<InventoryTransfers />} />
              <Route path="/master/products" element={<ProductsMaster />} />
              <Route path="/master/colors" element={<ColorsMaster />} />
              <Route path="/reports" element={<ComingSoon title="التقارير والإحصاءات" />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="roles" element={<AdminRoles />} />
                <Route path="roles-manager" element={<AdminRolesManager />} />
                <Route path="permissions" element={<Permissions />} />
                <Route path="sessions" element={<AdminSessions />} />
                <Route path="login-history" element={<AdminLoginHistory />} />
                <Route path="audit" element={<AdminAuditLog />} />
                <Route path="settings/company" element={<AdminSettingsCompany />} />
                <Route path="settings/branches" element={<AdminSettingsBranches />} />
                <Route path="settings/account-determination" element={<AdminSettingsAccountDetermination />} />
                <Route path="settings/account-groups" element={<AdminSettingsAccountGroups />} />
                <Route path="settings/communications" element={<AdminSettingsCommunications />} />
                <Route path="settings/warehouses" element={<AdminSettingsWarehouses />} />
                <Route path="settings/tax" element={<AdminSettingsTax />} />
                <Route path="settings/sequences" element={<AdminSettingsSequences />} />
                <Route path="settings/templates" element={<AdminSettingsTemplates />} />
                <Route path="master-data" element={<AdminMasterDataHub />} />
                <Route path="uat" element={<AdminUatTools />} />
              </Route>
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






