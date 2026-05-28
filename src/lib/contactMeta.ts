/**
 * Contact / Party extended metadata helper.
 *
 * Backend `customers` table is a thin record (code, name, vat_number,
 * phone, email, city, address, notes). To deliver the ERP-grade
 * Contacts/Parties operational contract without schema changes, all
 * extended ERP master data (entity type, multi-role flags, Saudi
 * national address, compliance docs, financial limits, multiple
 * addresses, related contacts) is encoded as a JSON envelope inside
 * the existing `notes` column:
 *
 *   ###CMETA###{...json...}
 *   (optional free-form text on following lines)
 *
 * When the backend later promotes these fields to real columns, swap
 * this helper without touching the UI.
 */

export type ContactType =
  | "individual"
  | "company"
  | "government"
  | "insurance"
  | "fleet";

export type ContactRole =
  | "vehicle_customer"
  | "spare_parts_customer"
  | "maintenance_customer"
  | "vendor"
  | "fleet_customer"
  | "insurance_partner";

export type RiskClass = "low" | "medium" | "high" | "blocked" | "";
export type PaymentMethod = "cash" | "bank" | "card" | "cheque" | "credit" | "";

export type SaudiAddress = {
  country?: string;          // default: "SA"
  city?: string;
  district?: string;         // الحي
  street?: string;           // الشارع
  building_number?: string;  // رقم المبنى (4 digits)
  additional_number?: string;// الرقم الإضافي (4 digits)
  postal_code?: string;      // الرمز البريدي (5 digits)
  unit_number?: string;      // رقم الوحدة
  short_address?: string;    // العنوان الوطني المختصر (e.g. RRRD2929)
  po_box?: string;
  lat?: number;
  lng?: number;
};

export type AddressEntry = {
  id: string;
  label: string;             // free text e.g. "فرع الرياض"
  kind: "primary" | "billing" | "shipping" | "service" | "branch";
  address: SaudiAddress;
};

export type RelatedContact = {
  id: string;
  name: string;
  role: string;              // e.g. "محاسب", "مدير مشتريات", "سائق"
  phone?: string;
  email?: string;
  note?: string;
};

export type ContactMeta = {
  // classification
  contact_type?: ContactType;
  roles?: ContactRole[];

  // identifiers / compliance
  national_id?: string;
  id_issue_date?: string;
  id_expiry_date?: string;
  cr_number?: string;        // سجل تجاري
  cr_issue_date?: string;
  cr_expiry_date?: string;
  vat_registered?: boolean;
  tax_exempt?: boolean;

  // financial
  payment_terms_days?: number;       // net X days
  credit_limit?: number;

  // supplier linkage (when this contact has the vendor role)
  supplier_link_id?: string;         // links to purchasingService supplier id

  preferred_payment?: PaymentMethod;
  risk_class?: RiskClass;
  opening_balance?: number;

  // additional contact data
  mobile?: string;
  whatsapp?: string;
  website?: string;

  // primary Saudi national address (quick fields)
  primary_address?: SaudiAddress;

  // multi-address book
  addresses?: AddressEntry[];

  // related contacts (sub-contacts, employees of the company)
  related?: RelatedContact[];

  // free notes
  remarks?: string;
};

const MARKER = "###CMETA###";

export function parseContactMeta(notes: string | null | undefined): {
  meta: ContactMeta;
  freeText: string;
} {
  if (!notes) return { meta: {}, freeText: "" };
  const idx = notes.indexOf(MARKER);
  if (idx === -1) return { meta: {}, freeText: notes };
  const after = notes.slice(idx + MARKER.length);
  const newline = after.indexOf("\n");
  const jsonPart = newline === -1 ? after : after.slice(0, newline);
  const freeText = newline === -1 ? "" : after.slice(newline + 1);
  try {
    return { meta: JSON.parse(jsonPart) as ContactMeta, freeText };
  } catch {
    return { meta: {}, freeText: notes };
  }
}

export function serializeContactMeta(meta: ContactMeta, freeText = ""): string {
  const json = JSON.stringify(meta);
  const tail = freeText ? `\n${freeText}` : "";
  return `${MARKER}${json}${tail}`;
}

// ---------- Labels ----------

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  individual: "فرد",
  company: "شركة",
  government: "جهة حكومية",
  insurance: "شركة تأمين",
  fleet: "شركة أسطول",
};

export const ROLE_LABELS: Record<ContactRole, string> = {
  vehicle_customer: "عميل مركبات",
  spare_parts_customer: "عميل قطع غيار",
  maintenance_customer: "عميل صيانة",
  vendor: "مورّد",
  fleet_customer: "أسطول",
  insurance_partner: "شريك تأمين",
};

export const ROLE_CLASSES: Record<ContactRole, string> = {
  vehicle_customer: "bg-blue-100 text-blue-800 border-blue-200",
  spare_parts_customer: "bg-amber-100 text-amber-800 border-amber-200",
  maintenance_customer: "bg-purple-100 text-purple-800 border-purple-200",
  vendor: "bg-emerald-100 text-emerald-800 border-emerald-200",
  fleet_customer: "bg-indigo-100 text-indigo-800 border-indigo-200",
  insurance_partner: "bg-rose-100 text-rose-800 border-rose-200",
};

export const RISK_LABELS: Record<Exclude<RiskClass, "">, string> = {
  low: "منخفض",
  medium: "متوسط",
  high: "مرتفع",
  blocked: "محظور",
};

export const RISK_CLASSES: Record<Exclude<RiskClass, "">, string> = {
  low: "bg-success/15 text-success border-success/30",
  medium: "bg-warning/15 text-warning-foreground border-warning/30",
  high: "bg-destructive/15 text-destructive border-destructive/30",
  blocked: "bg-destructive text-destructive-foreground border-destructive",
};

export const ADDRESS_KIND_LABELS: Record<AddressEntry["kind"], string> = {
  primary: "رئيسي",
  billing: "فوترة",
  shipping: "شحن",
  service: "صيانة",
  branch: "فرع",
};

// ---------- Helpers ----------

export function formatSaudiAddress(a?: SaudiAddress): string {
  if (!a) return "";
  const parts = [
    a.building_number,
    a.street,
    a.district,
    a.city,
    a.postal_code,
    a.additional_number,
    a.country || "SA",
  ].filter(Boolean);
  return parts.join("، ");
}

export function shortAddressCode(a?: SaudiAddress): string {
  return a?.short_address?.toUpperCase() ?? "";
}

export function hasRole(meta: ContactMeta, role: ContactRole): boolean {
  return (meta.roles ?? []).includes(role);
}

export function toggleRole(meta: ContactMeta, role: ContactRole): ContactRole[] {
  const set = new Set(meta.roles ?? []);
  if (set.has(role)) set.delete(role);
  else set.add(role);
  return Array.from(set);
}

/** Compliance health: simple operational score (0-100) for the detail header. */
export function complianceScore(meta: ContactMeta): number {
  let s = 0, total = 0;
  const add = (cond: boolean) => { total += 1; if (cond) s += 1; };
  add(!!meta.contact_type);
  add(!!(meta.roles?.length));
  add(!!meta.primary_address?.city);
  add(!!meta.primary_address?.postal_code);
  add(!!meta.primary_address?.building_number);
  add(meta.contact_type === "individual" ? !!meta.national_id : !!meta.cr_number);
  return Math.round((s / total) * 100);
}
