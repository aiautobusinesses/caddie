/**
 * Application-layer AES-256-GCM encryption for sensitive values stored in the DB.
 *
 * Format: `enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 * The `enc:v1:` prefix makes encrypted values unambiguously distinguishable from
 * legacy plaintext values (Anthropic keys start with `sk-ant-`).
 *
 * Server-side only. Never import this module in client components.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto"
import { getEncryptionKey } from "@/lib/env"

const PREFIX = "enc:v1:"
const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16

export function encrypt(plaintext: string): string {
  const keyHex = getEncryptionKey()
  const key = Buffer.from(keyHex, "hex")
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`
}

export function decrypt(ciphertext: string): string {
  const keyHex = getEncryptionKey()
  const key = Buffer.from(keyHex, "hex")
  const body = ciphertext.slice(PREFIX.length)
  const parts = body.split(":")
  if (parts.length !== 3) throw new Error("Invalid ciphertext format")
  const [ivHex, authTagHex, encryptedHex] = parts
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const encryptedData = Buffer.from(encryptedHex, "hex")
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encryptedData).toString("utf8") + decipher.final("utf8")
}

/** Returns true if the value was encrypted by this module (not a legacy plaintext key). */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX)
}
