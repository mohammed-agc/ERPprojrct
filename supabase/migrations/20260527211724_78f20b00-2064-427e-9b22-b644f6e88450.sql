
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'employee');
CREATE TYPE public.department_code AS ENUM ('vehicles', 'spare_parts', 'workshop', 'accounting', 'inventory', 'purchasing', 'sales', 'crm');
CREATE TYPE public.order_status AS ENUM ('draft', 'confirmed', 'invoiced', 'cancelled');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'posted', 'paid', 'cancelled');
CREATE TYPE public.vehicle_status AS ENUM ('available', 'reserved', 'sold');
CREATE TYPE public.account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');

-- ============ DEPARTMENTS ============
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code public.department_code NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read departments" ON public.departments FOR SELECT TO authenticated USING (true);

INSERT INTO public.departments (code, name_ar, name_en) VALUES
  ('vehicles', 'إدارة المركبات', 'Vehicles'),
  ('spare_parts', 'قطع الغيار', 'Spare Parts'),
  ('workshop', 'الورشة والصيانة', 'Workshop'),
  ('accounting', 'المحاسبة', 'Accounting'),
  ('inventory', 'المخزون', 'Inventory'),
  ('purchasing', 'المشتريات', 'Purchasing'),
  ('sales', 'المبيعات', 'Sales'),
  ('crm', 'علاقات العملاء', 'CRM');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  employee_no TEXT,
  department_id UUID REFERENCES public.departments(id),
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user updates own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "user inserts own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read user_roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.user_department(_user_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT department_id FROM public.profiles WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','manager'))
$$;

-- Auto-create profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ CHART OF ACCOUNTS ============
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  type public.account_type NOT NULL,
  parent_id UUID REFERENCES public.accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.accounts TO authenticated;
GRANT INSERT, UPDATE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read accounts" ON public.accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "accounting manages accounts" ON public.accounts FOR ALL TO authenticated
USING (public.is_manager_or_admin(auth.uid()) OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code='accounting'))
WITH CHECK (public.is_manager_or_admin(auth.uid()) OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code='accounting'));

-- Seed Saudi chart of accounts
INSERT INTO public.accounts (code, name_ar, name_en, type) VALUES
  ('1000', 'الأصول', 'Assets', 'asset'),
  ('1100', 'النقدية والبنوك', 'Cash & Banks', 'asset'),
  ('1200', 'العملاء المدينون', 'Accounts Receivable', 'asset'),
  ('1300', 'المخزون', 'Inventory', 'asset'),
  ('1400', 'ضريبة القيمة المضافة - مدخلات', 'VAT Input', 'asset'),
  ('2000', 'الالتزامات', 'Liabilities', 'liability'),
  ('2100', 'الموردون الدائنون', 'Accounts Payable', 'liability'),
  ('2200', 'ضريبة القيمة المضافة - مستحقة', 'VAT Payable', 'liability'),
  ('3000', 'حقوق الملكية', 'Equity', 'equity'),
  ('3100', 'رأس المال', 'Capital', 'equity'),
  ('4000', 'الإيرادات', 'Revenue', 'revenue'),
  ('4100', 'إيرادات بيع المركبات', 'Vehicle Sales Revenue', 'revenue'),
  ('4200', 'إيرادات قطع الغيار', 'Spare Parts Revenue', 'revenue'),
  ('4300', 'إيرادات الورشة', 'Workshop Revenue', 'revenue'),
  ('5000', 'المصروفات', 'Expenses', 'expense'),
  ('5100', 'تكلفة المبيعات', 'Cost of Goods Sold', 'expense');

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  vat_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manages customers" ON public.customers FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- ============ VEHICLES ============
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INT NOT NULL,
  vin TEXT UNIQUE,
  color TEXT,
  mileage INT DEFAULT 0,
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  sale_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  status public.vehicle_status NOT NULL DEFAULT 'available',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read vehicles" ON public.vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "vehicles dept manages" ON public.vehicles FOR ALL TO authenticated
USING (public.is_manager_or_admin(auth.uid()) OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code='vehicles'))
WITH CHECK (public.is_manager_or_admin(auth.uid()) OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code='vehicles'));

-- ============ SALES ORDERS ============
CREATE TABLE public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  department_code public.department_code NOT NULL DEFAULT 'vehicles',
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.order_status NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_orders TO authenticated;
GRANT ALL ON public.sales_orders TO service_role;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read sales_orders" ON public.sales_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept manages sales_orders" ON public.sales_orders FOR ALL TO authenticated
USING (public.is_manager_or_admin(auth.uid()) OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = sales_orders.department_code))
WITH CHECK (public.is_manager_or_admin(auth.uid()) OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code = sales_orders.department_code));

CREATE TABLE public.sales_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  vehicle_id UUID REFERENCES public.vehicles(id),
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  vat_pct NUMERIC(5,2) NOT NULL DEFAULT 15,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_order_lines TO authenticated;
GRANT ALL ON public.sales_order_lines TO service_role;
ALTER TABLE public.sales_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read order_lines" ON public.sales_order_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage order_lines" ON public.sales_order_lines FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales_orders so WHERE so.id = order_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.sales_orders so WHERE so.id = order_id));

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  sales_order_id UUID REFERENCES public.sales_orders(id),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  posted_at TIMESTAMPTZ,
  posted_by UUID REFERENCES auth.users(id),
  qr_code TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage invoices" ON public.invoices FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TABLE public.invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_pct NUMERIC(5,2) NOT NULL DEFAULT 15,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_lines TO authenticated;
GRANT ALL ON public.invoice_lines TO service_role;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read invoice_lines" ON public.invoice_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage invoice_lines" ON public.invoice_lines FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id));

-- ============ JOURNAL ENTRIES (double-entry) ============
CREATE TABLE public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_no TEXT NOT NULL UNIQUE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,
  description TEXT,
  is_posted BOOLEAN NOT NULL DEFAULT false,
  source_type TEXT,
  source_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read journals" ON public.journal_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "accounting manages journals" ON public.journal_entries FOR ALL TO authenticated
USING (public.is_manager_or_admin(auth.uid()) OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code='accounting'))
WITH CHECK (public.is_manager_or_admin(auth.uid()) OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code='accounting'));

CREATE TABLE public.journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  debit NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT,
  CONSTRAINT debit_or_credit CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0) OR (debit = 0 AND credit = 0))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entry_lines TO authenticated;
GRANT ALL ON public.journal_entry_lines TO service_role;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read journal_lines" ON public.journal_entry_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "accounting manages journal_lines" ON public.journal_entry_lines FOR ALL TO authenticated
USING (public.is_manager_or_admin(auth.uid()) OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code='accounting'))
WITH CHECK (public.is_manager_or_admin(auth.uid()) OR public.user_department(auth.uid()) = (SELECT id FROM public.departments WHERE code='accounting'));

-- Prevent edits to posted journal entries
CREATE OR REPLACE FUNCTION public.prevent_posted_journal_edit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') AND OLD.is_posted = true THEN
    RAISE EXCEPTION 'لا يمكن تعديل أو حذف قيد مرحّل';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_prevent_posted_edit
  BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_posted_journal_edit();

CREATE OR REPLACE FUNCTION public.prevent_posted_line_edit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_posted BOOLEAN;
BEGIN
  SELECT is_posted INTO v_posted FROM public.journal_entries WHERE id = COALESCE(NEW.entry_id, OLD.entry_id);
  IF v_posted = true THEN
    RAISE EXCEPTION 'لا يمكن تعديل بنود قيد مرحّل';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_prevent_posted_line_edit
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.prevent_posted_line_edit();

-- Ensure debit = credit before posting
CREATE OR REPLACE FUNCTION public.validate_balanced_entry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_debit NUMERIC; v_credit NUMERIC;
BEGIN
  IF NEW.is_posted = true AND (OLD.is_posted IS DISTINCT FROM true) THEN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_debit, v_credit
    FROM public.journal_entry_lines WHERE entry_id = NEW.id;
    IF v_debit <> v_credit OR v_debit = 0 THEN
      RAISE EXCEPTION 'القيد غير متوازن: مدين=% دائن=%', v_debit, v_credit;
    END IF;
    NEW.created_by = COALESCE(NEW.created_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_balanced BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_balanced_entry();

-- Updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER t_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_vehicles_updated BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_so_updated BEFORE UPDATE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_inv_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
