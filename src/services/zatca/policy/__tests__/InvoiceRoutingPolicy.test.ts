import { describe, it, expect } from 'vitest';
import {
  deriveSubmissionTarget,
  InvoiceRoutingError,
} from '../InvoiceRoutingPolicy';

describe('InvoiceRoutingPolicy.deriveSubmissionTarget', () => {
  it('standard (B2B) → clearance', () => {
    expect(deriveSubmissionTarget('standard')).toBe('clearance');
  });

  it('simplified (B2C) → reporting', () => {
    expect(deriveSubmissionTarget('simplified')).toBe('reporting');
  });

  it('throws on an unknown invoice type (no silent default)', () => {
    expect(() => deriveSubmissionTarget('weird')).toThrow(InvoiceRoutingError);
    expect(() => deriveSubmissionTarget('weird')).toThrow(/unknown invoice_type "weird"/);
  });

  it('is exact-match (does not coerce casing/whitespace)', () => {
    expect(() => deriveSubmissionTarget('Standard')).toThrow(InvoiceRoutingError);
    expect(() => deriveSubmissionTarget(' standard ')).toThrow(InvoiceRoutingError);
    expect(() => deriveSubmissionTarget('')).toThrow(InvoiceRoutingError);
  });
});
