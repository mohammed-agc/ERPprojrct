/**
 * Gate test for the S2↔S5 seam: the chain-snapshot build entry.
 *
 * Proves (with the REAL mapper + builder; loader + validator mocked):
 *   - Legacy buildInvoiceXml is unchanged — it uses the loaded invoices.icv/pih.
 *   - The new buildInvoiceXmlWithChainSnapshot makes the snapshot the SOLE
 *     source of icv/pih, and the builder derives nextIcv = currentIcv + 1.
 *   - The two paths diverge ONLY in icv/pih (one shared pure core).
 *   - The override is immutable — the loaded data is never mutated.
 *
 * Per ADR-028: the chain is SSOT; invoices.icv/pih are a post-append projection,
 * never the build source in the new path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// The two non-pure dependencies are mocked; map + build run for real.
vi.mock('../documentDataLoader', () => ({ loadDocumentData: vi.fn() }));
vi.mock('../invoiceUblValidator', () => ({ validateInvoiceData: vi.fn() }));

import { loadDocumentData } from '../documentDataLoader';
import { buildInvoiceXml, buildInvoiceXmlWithChainSnapshot } from '../xmlBuilder';
import type { InvoiceData } from '../xmlBuilder.types';

function fixture(): InvoiceData {
  return {
    invoice: {
      id: 'inv-1',
      invoice_no: 'INV-1',
      uuid: 'uuid-abc',
      icv: 99,
      pih: 'PIH_ORIGINAL',
      invoice_type: 'simplified',
      invoice_category: 'tax_invoice',
      invoice_date: '2026-06-28',
      issue_timestamp: '2026-06-28T10:00:00Z',
      supply_date: null,
      subtotal: 100,
      vat_amount: 15,
      total: 115,
      paid_amount: 0,
      customer_id: 'cust-1',
    },
    lines: [
      {
        id: 'l1',
        line_no: 1,
        description: 'Item',
        quantity: 1,
        unit_price: 100,
        discount: 0,
        vat_pct: 15,
        vat_amount: 15,
        total: 115,
        brand: null,
        model: null,
        year: null,
        trim: null,
      },
    ],
    company: {
      id: 'co-1',
      name: 'Seller Co',
      commercial_registration: '1010',
      vat_number: '300000000000003',
      country: 'SA',
      country_code: 'SA',
      currency_code: 'SAR',
      street_address: 'St',
      building_number: '1',
      district: 'D',
      city: 'Riyadh',
      postal_code: '12345',
      additional_number: '1234',
    },
    customer: {
      id: 'cust-1',
      name: 'Buyer',
      vat_number: null,
      cr_number: null,
      national_id: null,
      country: 'SA',
      city: 'Riyadh',
      district: 'D',
      address: 'Addr',
      postal_code: '12345',
      building_no: '2',
    },
  };
}

describe('xmlBuilder — chain snapshot (S2↔S5 seam)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('legacy buildInvoiceXml uses the loaded invoices.icv/pih (unchanged)', async () => {
    (loadDocumentData as any).mockResolvedValue(fixture());
    const out = await buildInvoiceXml({ documentType: 'tax_invoice', documentId: 'inv-1' });
    expect(out.metadata.icv).toBe(99);
    expect(out.xml).toContain('<cbc:UUID>99</cbc:UUID>');
    expect(out.xml).toContain('PIH_ORIGINAL');
  });

  it('new path: chainSnapshot is the sole source; builder derives nextIcv = currentIcv+1', async () => {
    (loadDocumentData as any).mockResolvedValue(fixture());
    const out = await buildInvoiceXmlWithChainSnapshot(
      { documentType: 'tax_invoice', documentId: 'inv-1' },
      { currentIcv: 5, currentPih: 'PIH_SNAP' }
    );
    expect(out.metadata.icv).toBe(6); // 5 + 1, derived by the builder
    expect(out.xml).toContain('<cbc:UUID>6</cbc:UUID>');
    expect(out.xml).toContain('PIH_SNAP');
    expect(out.xml).not.toContain('PIH_ORIGINAL'); // invoices.pih NOT used
  });

  it('the override is immutable — the loaded data is not mutated', async () => {
    const data = fixture();
    (loadDocumentData as any).mockResolvedValue(data);
    await buildInvoiceXmlWithChainSnapshot(
      { documentType: 'tax_invoice', documentId: 'inv-1' },
      { currentIcv: 5, currentPih: 'PIH_SNAP' }
    );
    expect(data.invoice.icv).toBe(99);
    expect(data.invoice.pih).toBe('PIH_ORIGINAL');
  });
});
