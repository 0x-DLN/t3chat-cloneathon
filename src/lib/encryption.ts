import crypto from "crypto";
import { env } from "~/env";

const algorithm = "aes-256-gcm";

const key = crypto
  .createHash("sha256")
  .update(String(env.BETTER_AUTH_SECRET))
  .digest("base64")
  .substring(0, 32);

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Combine iv, authTag, and encrypted data into one string, separated by '.'
  return `${iv.toString("base64")}.${authTag.toString(
    "base64"
  )}.${encrypted.toString("base64")}`;
}

export function decrypt(cipherText: string): string {
  try {
    const parts = cipherText.split(".");
    if (parts.length !== 3) {
      console.log("parts", parts);
      throw new Error("Invalid encrypted text format.");
    }
    const [iv_b64, authTag_b64, encrypted_b64] = parts;

    const iv = Buffer.from(iv_b64, "base64");
    const authTag = Buffer.from(authTag_b64, "base64");
    const encrypted = Buffer.from(encrypted_b64, "base64");

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Decryption failed:", error);
    throw new Error("Failed to decrypt data.");
  }
}
