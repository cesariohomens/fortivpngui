import crypto from "crypto";

/** AES-128-CBC then Base64, compatible with OpenFortiGUI vpnHelper::Qaes128_encrypt */
export function aes128Encrypt(plain: string, keyStr: string, ivStr: string): string {
  if (!plain) return "";
  const key = Buffer.from(keyStr.slice(0, 16), "utf8");
  const iv = Buffer.from(ivStr.slice(0, 16), "utf8");
  const c = crypto.createCipheriv("aes-128-cbc", key, iv);
  const out = Buffer.concat([c.update(Buffer.from(plain, "utf8")), c.final()]);
  return out.toString("base64");
}

export function aes128Decrypt(b64: string, keyStr: string, ivStr: string): string {
  if (!b64) return "";
  const key = Buffer.from(keyStr.slice(0, 16), "utf8");
  const iv = Buffer.from(ivStr.slice(0, 16), "utf8");
  const raw = Buffer.from(b64, "base64");
  const d = crypto.createDecipheriv("aes-128-cbc", key, iv);
  const out = Buffer.concat([d.update(raw), d.final()]);
  return out.toString("utf8");
}
