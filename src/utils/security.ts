/**
 * Cryptographic security utilities for staff authentication & PIN hashing.
 * Uses the Web Crypto API to ensure all staff PINs are stored as cryptographically
 * irreversible salted SHA-256 hashes inside Firestore.
 */

const PIN_CRYPTO_SALT = 'vaairo-spirits-erp-secure-salt-v1';

/**
 * Computes a salted SHA-256 hash for a 6-digit staff PIN.
 * Output format: 'sha256:<hex_digest>'
 */
export async function hashPin(pin: string): Promise<string> {
  const cleanPin = pin.trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(`${PIN_CRYPTO_SALT}:${cleanPin}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `sha256:${hexHash}`;
}

/**
 * Checks whether a given string is already in encrypted/hashed format.
 */
export function isPinHashed(pinOrHash?: string): boolean {
  if (!pinOrHash) return false;
  return (
    pinOrHash.startsWith('sha256:') ||
    pinOrHash.startsWith('$2a$') ||
    pinOrHash.startsWith('$2b$') ||
    pinOrHash.length >= 60
  );
}

/**
 * Verifies an entered plaintext PIN against the stored hash in the database.
 * Supports backward-compatibility during migration if a legacy plaintext PIN exists.
 */
export async function verifyPin(enteredPin: string, storedHashOrPin?: string): Promise<boolean> {
  if (!storedHashOrPin) return false;
  const cleanEntered = enteredPin.trim();

  // If already hashed with sha256
  if (storedHashOrPin.startsWith('sha256:')) {
    const computed = await hashPin(cleanEntered);
    return computed === storedHashOrPin;
  }

  // Fallback for legacy unmigrated plaintext records
  return storedHashOrPin === cleanEntered;
}

/**
 * Computes a salted SHA-256 hash for email passwords.
 */
export async function hashPassword(password: string): Promise<string> {
  const clean = password.trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(`${PIN_CRYPTO_SALT}:pwd:${clean}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `sha256:pwd:${hexHash}`;
}

/**
 * Verifies an entered password against stored hash or master passcodes.
 */
export async function verifyPassword(enteredPassword: string, storedHash?: string): Promise<boolean> {
  if (!storedHash) return false;
  const cleanEntered = enteredPassword.trim();
  if (storedHash.startsWith('sha256:pwd:')) {
    const computed = await hashPassword(cleanEntered);
    return computed === storedHash;
  }
  return storedHash === cleanEntered;
}

const ADMIN_PIN_OBFUSCATION_KEY = 'VAAIRO-ADMIN-PIN-KEY-2026';

/**
 * Reversible obfuscated encoding for 6-digit staff PINs so only System Admin
 * can reveal/view a user's login PIN inside the ERP UI while keeping the raw
 * PIN hidden from plaintext storage and non-Admin roles.
 */
export function encryptPinForAdmin(pin: string): string {
  const clean = pin.trim();
  if (!/^\d{6}$/.test(clean)) return '';
  try {
    const bytes = Array.from(clean).map((ch, idx) =>
      ch.charCodeAt(0) ^ ADMIN_PIN_OBFUSCATION_KEY.charCodeAt(idx % ADMIN_PIN_OBFUSCATION_KEY.length)
    );
    const b64 = btoa(String.fromCharCode(...bytes));
    return `adm1:${b64}`;
  } catch {
    return '';
  }
}

export function decryptPinForAdmin(encoded?: string): string | null {
  if (!encoded) return null;
  if (/^\d{6}$/.test(encoded.trim())) return encoded.trim();
  if (!encoded.startsWith('adm1:')) return null;
  try {
    const raw = atob(encoded.slice(5));
    const decoded = Array.from(raw)
      .map((ch, idx) =>
        String.fromCharCode(
          ch.charCodeAt(0) ^ ADMIN_PIN_OBFUSCATION_KEY.charCodeAt(idx % ADMIN_PIN_OBFUSCATION_KEY.length)
        )
      )
      .join('');
    return /^\d{6}$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}


