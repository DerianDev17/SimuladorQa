// ATMIso8583.GetDataEMV appends the TLV byte count at offset 2 of its
// 01 00 00 prefix. Confirmed against approved CB QA frame 218 (219 = 3 + 216).
// The outer ISOBASEI variable-field length is a separate single byte.
export function encodeVisaEmvField(tlv: Uint8Array): Buffer {
  if (!(tlv instanceof Uint8Array) || !tlv.length || tlv.length > 252)
    throw Error('QA_EMV_FIELD_LENGTH_INVALID');
  return Buffer.concat([Buffer.of(tlv.length + 3, 1, 0, tlv.length), tlv]);
}
