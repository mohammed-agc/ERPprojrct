// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { NodeCryptoCertificateMetadataLoader, CertificateMetadataError } from '../CertificateMetadataLoader';

// A real secp256k1 self-signed certificate (generated with openssl for tests).
//   subject: C=SA, O=Ard, CN=egs-test
//   notAfter: Jun 30 2028
const CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIBrjCCAVSgAwIBAgIUQxMtnIDTuSLymeAnBwj/HwO82z4wCgYIKoZIzj0EAwIw
LjELMAkGA1UEBhMCU0ExDDAKBgNVBAoMA0FyZDERMA8GA1UEAwwIZWdzLXRlc3Qw
HhcNMjYwNzAxMTU0NjMwWhcNMjgwNjMwMTU0NjMwWjAuMQswCQYDVQQGEwJTQTEM
MAoGA1UECgwDQXJkMREwDwYDVQQDDAhlZ3MtdGVzdDBWMBAGByqGSM49AgEGBSuB
BAAKA0IABKaMcUPi/lV469xlKf0ne6UgEN4R8Sdu2Uv4GqUnrQnKRxgjKdPOZ2UB
wXefbmkSvwtFKdFH1/w/0WHfpLcKRwijUzBRMB0GA1UdDgQWBBRHDPGDEprTceFA
XQnN3jv712zriDAfBgNVHSMEGDAWgBRHDPGDEprTceFAXQnN3jv712zriDAPBgNV
HRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIQDR8LCleS56AVD2JXMqMPrz
ll6G+9FPQh/o8eJzUCMLhwIge9fwqlUNhrl5Sqlb8cSdY1IPrUsiN8NgWZ/xAN6L
ns8=
-----END CERTIFICATE-----`;

const loader = new NodeCryptoCertificateMetadataLoader();

describe('CertificateMetadataLoader', () => {
  it('extracts a colon-free lowercase SHA-256 fingerprint', () => {
    const m = loader.loadMetadata(CERT_PEM);
    expect(m.certificateFingerprint).toMatch(/^[0-9a-f]{64}$/);
    // matches the openssl fingerprint, colons stripped, lowercased
    expect(m.certificateFingerprint).toBe(
      '1fa13ce1f74d9703e2f365cb6688e31bc544077d198d887a8fefac52821fb1d2'
    );
  });

  it('extracts the expiry as an ISO timestamp', () => {
    const m = loader.loadMetadata(CERT_PEM);
    expect(m.certificateExpiryAt).toBe('2028-06-30T15:46:30.000Z');
  });

  it('extracts serial, subject, and issuer', () => {
    const m = loader.loadMetadata(CERT_PEM);
    expect(m.certificateSerial.length).toBeGreaterThan(0);
    expect(m.certificateSubject).toContain('CN=egs-test');
    expect(m.certificateIssuer).toContain('CN=egs-test'); // self-signed
  });

  it('throws CertificateMetadataError on unparseable input', () => {
    expect(() => loader.loadMetadata('not a certificate')).toThrow(
      CertificateMetadataError
    );
  });
});
