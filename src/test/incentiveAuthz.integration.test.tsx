/**
 * Integration tests: Supplier Incentive Programs + Claims authorization UI.
 *
 * Mocks the auth context (department/roles), the authoritative backend
 * authz gate (`incentiveAuthzApi`), and the local data service. Renders
 * the real `SupplierIncentives` report page and the `IncentivePrograms`
 * card under different authorization states and asserts that:
 *
 *   - Unauthorized users see the Arabic denial reason and no controls.
 *   - Authorized Purchasing/Accounting users see the create/edit controls.
 *   - Non-manager users do NOT see the approve action on pending claims.
 *   - Manager users DO see the approve action.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---------- Mocks ----------
const mockAuthState: any = {
  user: { id: "u1" },
  session: {},
  profile: { id: "u1", full_name: "Test User", department_id: "d1", phone: null },
  department: { id: "d1", code: "purchasing", name_ar: "المشتريات" },
  roles: [],
  loading: false,
  isAdmin: false,
  isManager: false,
  canAccessDept: () => true,
  signOut: async () => {},
  refresh: async () => {},
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuthState,
  AuthProvider: ({ children }: any) => children,
}));

const mockAuthz = {
  allowed: true as boolean,
  reason: undefined as string | undefined,
  permissions: { canView: true, canManage: true, canApprove: false },
};

vi.mock("@/lib/incentiveAuthzApi", () => ({
  checkIncentiveAccess: vi.fn(async () => mockAuthz),
  ensureIncentiveAccess: vi.fn(async () => {
    if (!mockAuthz.allowed) throw new Error(mockAuthz.reason ?? "غير مصرّح");
  }),
  clearIncentiveAuthzCache: vi.fn(),
}));

const SUPPLIER = { id: "sup1", code: "S001", name: "Toyota KSA" };
const PROGRAM = {
  id: "p1",
  supplier_id: "sup1",
  name: "Q2 Hilux Push",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  target_vehicles: 10,
  incentive_per_vehicle: 1000,
  brand: "Toyota",
  model: "Hilux",
  status: "active" as const,
  notes: "",
};
const PENDING_CLAIM = {
  id: "c1",
  code: "IC-0001",
  program_id: "p1",
  amount: 5000,
  mode: "claim" as const,
  status: "pending" as const,
  requested_by: "Test User",
};

vi.mock("@/services/erp/purchasing", async () => {
  const fmtSAR = (n: number) => `${n} ر.س`;
  const fmtDate = (s: string) => s;
  return {
    fmtSAR,
    fmtDate,
    purchasingService: {
      listSuppliers: () => [SUPPLIER],
      listIncentivePrograms: (_supplierId?: string) => [PROGRAM],
      programPerformance: () => ({
        target: 10,
        purchased: 10,
        remaining: 0,
        achievement: 100,
        earned: 10000,
        claimed: 0,
        pending: 5000,
        remaining_incentive: 5000,
        eligible: true,
        pendingClaims: [PENDING_CLAIM],
      }),
      deleteIncentiveProgram: vi.fn(),
      upsertIncentiveProgram: vi.fn(),
      createIncentiveClaim: vi.fn(),
      approveIncentiveClaim: vi.fn(),
      rejectIncentiveClaim: vi.fn(),
    },
  };
});

// Imports MUST come after vi.mock calls
import SupplierIncentives from "@/pages/purchasing/SupplierIncentives";
import { IncentivePrograms } from "@/components/erp/IncentivePrograms";

const DENY_DEPT = "هذا الإجراء مقصور على قسم المشتريات/المحاسبة";

function renderReport() {
  return render(
    <MemoryRouter>
      <SupplierIncentives />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // reset to authorized purchasing user with manage rights, no approve
  mockAuthState.department = { id: "d1", code: "purchasing", name_ar: "المشتريات" };
  mockAuthState.roles = [];
  mockAuthState.isAdmin = false;
  mockAuthState.isManager = false;
  mockAuthz.allowed = true;
  mockAuthz.reason = undefined;
  mockAuthz.permissions = { canView: true, canManage: true, canApprove: false };
});

describe("SupplierIncentives report — authorization gating", () => {
  it("shows the report for an authorized Purchasing user", async () => {
    renderReport();
    await waitFor(() => {
      expect(screen.getByText("Q2 Hilux Push")).toBeInTheDocument();
    });
    expect(screen.queryByText(/لا تملك صلاحية الوصول/)).not.toBeInTheDocument();
  });

  it("shows the report for an authorized Accounting user", async () => {
    mockAuthState.department = { id: "d2", code: "accounting", name_ar: "المحاسبة" };
    renderReport();
    await waitFor(() => {
      expect(screen.getByText("Q2 Hilux Push")).toBeInTheDocument();
    });
  });

  it("denies a Sales user and surfaces the Arabic backend reason", async () => {
    mockAuthState.department = { id: "d3", code: "sales", name_ar: "المبيعات" };
    mockAuthz.allowed = false;
    mockAuthz.reason = DENY_DEPT;
    mockAuthz.permissions = { canView: false, canManage: false, canApprove: false };

    renderReport();
    await waitFor(() => {
      expect(screen.getByText("لا تملك صلاحية الوصول")).toBeInTheDocument();
    });
    expect(screen.getByText(DENY_DEPT)).toBeInTheDocument();
    expect(screen.queryByText("Q2 Hilux Push")).not.toBeInTheDocument();
  });
});

describe("IncentivePrograms card — controls visibility by role", () => {
  it("hides the card body and shows a denial for users without view rights", () => {
    mockAuthState.department = { id: "d3", code: "sales", name_ar: "المبيعات" };
    render(<IncentivePrograms supplierId="sup1" />);
    expect(screen.getByText("لا تملك صلاحية عرض برامج الحوافز.")).toBeInTheDocument();
    expect(screen.queryByText(/برنامج جديد/)).not.toBeInTheDocument();
  });

  it("renders create/edit controls for an authorized Purchasing user", () => {
    render(<IncentivePrograms supplierId="sup1" />);
    expect(screen.getByRole("button", { name: /برنامج جديد/ })).toBeInTheDocument();
    // pending claim row is rendered without an approve button (no approve right)
    expect(screen.getByText("IC-0001")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /اعتماد/ })).not.toBeInTheDocument();
    expect(screen.getByText(/بانتظار المدير/)).toBeInTheDocument();
  });

  it("shows the approve action for a manager", () => {
    mockAuthState.roles = ["manager"];
    mockAuthState.isManager = true;
    render(<IncentivePrograms supplierId="sup1" />);
    expect(screen.getByRole("button", { name: /اعتماد/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /رفض/ })).toBeInTheDocument();
  });
});
