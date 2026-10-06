import { createPublicKey, verify as cryptoVerify } from "node:crypto";

// Verifies an EC P-256 signature produced by the Android Keystore
// (Signature.getInstance("SHA256withECDSA")) against the device's public key.
// Java's Signature class always emits DER-encoded (r,s) and PublicKey.getEncoded()
// for an EC key is X.509 SubjectPublicKeyInfo DER - both match Node's crypto
// defaults exactly, so no format conversion is needed on either side.
export function verifyDeviceSignature(
  publicKeySpkiB64: string,
  signatureB64: string,
  signedString: string
): boolean {
  try {
    const keyObject = createPublicKey({
      key: Buffer.from(publicKeySpkiB64, "base64"),
      format: "der",
      type: "spki",
    });
    return cryptoVerify(
      "sha256",
      Buffer.from(signedString, "utf8"),
      { key: keyObject, dsaEncoding: "der" },
      Buffer.from(signatureB64, "base64")
    );
  } catch {
    // Malformed key/signature/base64 -> treat as an invalid signature, not a crash.
    return false;
  }
}
