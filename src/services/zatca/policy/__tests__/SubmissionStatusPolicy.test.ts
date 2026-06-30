import { describe, it, expect } from 'vitest';
import {
  deriveSubmissionProjection,
  deriveSubmissionStatus,
  submissionFactsFromLogRow,
} from '../SubmissionStatusPolicy';

describe('deriveSubmissionProjection — status rules', () => {
  it('validation ERROR → rejected (overrides any clearance value)', () => {
    expect(
      deriveSubmissionProjection({
        validationStatus: 'ERROR',
        clearanceStatus: 'CLEARED',
      }).status
    ).toBe('rejected');
  });

  it('CLEARED → cleared', () => {
    expect(
      deriveSubmissionProjection({ clearanceStatus: 'CLEARED' }).status
    ).toBe('cleared');
  });

  it('REPORTED → reported', () => {
    expect(
      deriveSubmissionProjection({ reportingStatus: 'REPORTED' }).status
    ).toBe('reported');
  });

  it('indeterminate disposition → null (do not force a value)', () => {
    expect(deriveSubmissionProjection({ validationStatus: 'PASS' }).status).toBeNull();
    expect(deriveSubmissionProjection({}).status).toBeNull();
    expect(
      deriveSubmissionProjection({ clearanceStatus: 'NOT_CLEARED' }).status
    ).toBeNull();
  });

  it('deriveSubmissionStatus is the same single source', () => {
    expect(deriveSubmissionStatus({ clearanceStatus: 'CLEARED' })).toBe('cleared');
    expect(deriveSubmissionStatus({})).toBeNull();
  });
});

describe('submissionFactsFromLogRow — log → neutral facts', () => {
  it('maps a CLEARED success row to clearance facts', () => {
    const facts = submissionFactsFromLogRow({
      zatca_status: 'PASS',
      zatca_response_code: 'CLEARED',
      success: true,
    });
    expect(facts).toEqual({
      validationStatus: 'PASS',
      clearanceStatus: 'CLEARED',
      reportingStatus: undefined,
    });
    expect(deriveSubmissionStatus(facts)).toBe('cleared');
  });

  it('maps a REPORTED row to reporting facts', () => {
    const facts = submissionFactsFromLogRow({
      zatca_status: 'PASS',
      zatca_response_code: 'REPORTED',
    });
    expect(facts.reportingStatus).toBe('REPORTED');
    expect(deriveSubmissionStatus(facts)).toBe('reported');
  });

  it('maps an ERROR row to rejected', () => {
    const facts = submissionFactsFromLogRow({
      zatca_status: 'ERROR',
      zatca_response_code: null,
      success: false,
    });
    expect(deriveSubmissionStatus(facts)).toBe('rejected');
  });

  it('a non-terminal code (e.g. NOT_CLEARED) yields no clearance/reporting fact', () => {
    const facts = submissionFactsFromLogRow({
      zatca_status: 'PASS',
      zatca_response_code: 'NOT_CLEARED',
    });
    expect(facts.clearanceStatus).toBeUndefined();
    expect(facts.reportingStatus).toBeUndefined();
    expect(deriveSubmissionStatus(facts)).toBeNull();
  });

  it('round-trip: a CLEARED log row derives cleared', () => {
    expect(
      deriveSubmissionStatus(
        submissionFactsFromLogRow({ zatca_response_code: 'CLEARED', zatca_status: 'PASS' })
      )
    ).toBe('cleared');
  });
});
