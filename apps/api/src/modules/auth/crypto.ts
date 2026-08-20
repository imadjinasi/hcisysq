import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PASSWORD_KEY_LENGTH = 64;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

interface ScryptParams {
  n: number;
  r: number;
  p: number;
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

function derivePasswordKey(
  password: string,
  salt: Buffer,
  params: ScryptParams,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      PASSWORD_KEY_LENGTH,
      {
        N: params.n,
        r: params.r,
        p: params.p,
        maxmem: SCRYPT_MAXMEM,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const params = { n: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P };
  const derived = await derivePasswordKey(password, salt, params);

  return [
    "scrypt",
    String(params.n),
    String(params.r),
    String(params.p),
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, nRaw, rRaw, pRaw, saltRaw, hashRaw] = encoded.split("$");
  if (!algorithm || algorithm !== "scrypt" || !nRaw || !rRaw || !pRaw || !saltRaw || !hashRaw) {
    return false;
  }

  const params = {
    n: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw),
  };

  if (
    !Number.isInteger(params.n) ||
    !Number.isInteger(params.r) ||
    !Number.isInteger(params.p) ||
    params.n < 2 ||
    params.r < 1 ||
    params.p < 1
  ) {
    return false;
  }

  const expected = Buffer.from(hashRaw, "base64url");
  if (expected.length !== PASSWORD_KEY_LENGTH) return false;

  const actual = await derivePasswordKey(password, Buffer.from(saltRaw, "base64url"), params);
  return timingSafeEqual(actual, expected);
}

function parseEncryptionKey(hex: string): Buffer {
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) {
    throw new Error("AUTH_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters");
  }

  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("AUTH_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

export function encryptSecret(secret: string, encryptionKeyHex: string): EncryptedSecret {
  const key = parseEncryptionKey(encryptionKeyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptSecret(
  encrypted: EncryptedSecret,
  encryptionKeyHex: string,
): string {
  const key = parseEncryptionKey(encryptionKeyHex);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encrypted.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(value >>> bits) & 31];
      value &= (1 << bits) - 1;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input: string): Buffer {
  const normalized = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 value");

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
      value &= (1 << bits) - 1;
    }
  }

  return Buffer.from(output);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function buildTotpUri(email: string, secret: string): string {
  const issuer = "HCIS YSQ";
  const label = `${issuer}:${email}`;

  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(
    issuer,
  )}&algorithm=SHA1&digits=6&period=30`;
}

export function generateTotp(secret: string, timestamp = Date.now()): string {
  const counter = BigInt(Math.floor(timestamp / 30_000));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);

  const digest = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret: string, code: string, timestamp = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;

  for (const offset of [-1, 0, 1]) {
    const expected = generateTotp(secret, timestamp + offset * 30_000);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return true;
  }

  return false;
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z2-7]/g, "");
}

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(10));
    return raw.match(/.{1,4}/g)?.join("-") ?? raw;
  });
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

export function generateSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
