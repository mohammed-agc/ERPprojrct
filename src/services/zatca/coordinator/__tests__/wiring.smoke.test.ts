import { describe, it, expect } from 'vitest';
import { createInvoiceSigningCoordinator } from '../createInvoiceSigningCoordinator';
import { createInvoiceSigningComposer } from '../../composer/createInvoiceSigningComposer';

/**
 * Composition roots are verified end-to-end by the first real invoke, not by
 * isolated unit logic. This smoke test does the one thing worth checking in CI:
 * importing both factories forces the ENTIRE wiring import chain to resolve
 * (every authority module, every path), catching a mis-wired import before the
 * E2E. It deliberately does not construct the vault (that needs a real key dir).
 */
describe('S5 composition roots — smoke', () => {
  it('both factories are importable; the full wiring chain resolves', () => {
    expect(typeof createInvoiceSigningCoordinator).toBe('function');
    expect(typeof createInvoiceSigningComposer).toBe('function');
  });

  it('the coordinator factory takes (vaultConfig, options?)', () => {
    // arity is the vault config; options has a Sprint A default.
    expect(createInvoiceSigningCoordinator.length).toBeGreaterThanOrEqual(1);
  });
});
