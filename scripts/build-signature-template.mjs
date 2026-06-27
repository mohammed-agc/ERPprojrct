import { readFileSync, writeFileSync } from 'node:fs';

const xml = readFileSync('src/services/zatca/__fixtures__/zatca-golden/Standard_Invoice_Signed.xml', 'utf8').replace(/\r\n/g, '\n');
const block = xml.substring(xml.indexOf('<ext:UBLExtension>'), xml.indexOf('</ext:UBLExtensions>'));

const between = (s, a, b) => { const i = s.indexOf(a) + a.length; return s.substring(i, s.indexOf(b, i)); };

const sp     = block.substring(block.indexOf('<xades:SignedProperties '), block.indexOf('</xades:SignedProperties>') + '</xades:SignedProperties>'.length);
const ref1   = 'w3MZKM0CTHawhhST7Q2qD0mi9Dc/Xc2pD1ASiXFwpJY=';
const ref2   = 'ZTkzMGNkNmExMTRjMGExNTA5NTYxMmE0NmJkYjJhMTY0OGI5NzIyOGZjNmM3ZmQ0MjhmZTZhMGUzZDA1Nzc2Mg==';
const sigval = between(block, '<ds:SignatureValue>', '</ds:SignatureValue>');
const cert   = between(block, '<ds:X509Certificate>', '</ds:X509Certificate>');

const tpl = block
  .replace(sp, '{{SIGNED_PROPERTIES}}')
  .replace(ref1, '{{REF1_DIGEST}}')
  .replace(ref2, '{{REF2_DIGEST}}')
  .replace(sigval, '{{SIGNATURE_VALUE}}')
  .replace(cert, '{{X509_CERT}}');

const filled = tpl
  .replace('{{SIGNED_PROPERTIES}}', sp)
  .replace('{{REF1_DIGEST}}', ref1)
  .replace('{{REF2_DIGEST}}', ref2)
  .replace('{{SIGNATURE_VALUE}}', sigval)
  .replace('{{X509_CERT}}', cert);

const slots = ['{{SIGNED_PROPERTIES}}','{{REF1_DIGEST}}','{{REF2_DIGEST}}','{{SIGNATURE_VALUE}}','{{X509_CERT}}'];
console.log('all slots present:', slots.every((p) => tpl.includes(p)));
console.log('round-trip byte-exact:', filled === block);
console.log('template length:', tpl.length);

const ts = '/**\n * signatureTemplate — S3.3 — byte-exact ds:Signature template derived from\n * the ZATCA golden reference (Standard_Invoice_Signed.xml). Regenerate via\n * scripts/build-signature-template.mjs; do NOT hand-edit.\n */\nexport const SIGNATURE_TEMPLATE = ' + String.fromCharCode(96) + tpl + String.fromCharCode(96) + ';\n';
writeFileSync('src/services/zatca/xades/signatureTemplate.ts', ts);
console.log('wrote signatureTemplate.ts');