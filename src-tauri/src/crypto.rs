//! AES-128-CBC then Base64, compatible with OpenFortiGUI `vpnHelper::Qaes128_encrypt`
//! (port of `electron/crypto-aes.ts`).

use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use aes::Aes128;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use cbc::{Decryptor, Encryptor};

type Aes128CbcEnc = Encryptor<Aes128>;
type Aes128CbcDec = Decryptor<Aes128>;

/// Match Node `Buffer.from(keyStr.slice(0, 16), "utf8")` for ASCII keys (defaults are 16 chars).
fn key_iv_bytes(key_str: &str, iv_str: &str) -> ([u8; 16], [u8; 16]) {
    let key_s: String = key_str.chars().take(16).collect();
    let iv_s: String = iv_str.chars().take(16).collect();
    let mut key = [0u8; 16];
    let mut iv = [0u8; 16];
    let kb = key_s.as_bytes();
    let ib = iv_s.as_bytes();
    let klen = kb.len().min(16);
    let ilen = ib.len().min(16);
    key[..klen].copy_from_slice(&kb[..klen]);
    iv[..ilen].copy_from_slice(&ib[..ilen]);
    (key, iv)
}

/// AES-128-CBC encrypt + Base64. Empty plaintext → empty string.
pub fn aes128_encrypt(plain: &str, key_str: &str, iv_str: &str) -> String {
    if plain.is_empty() {
        return String::new();
    }
    let (key, iv) = key_iv_bytes(key_str, iv_str);
    let ciphertext =
        Aes128CbcEnc::new(&key.into(), &iv.into()).encrypt_padded_vec_mut::<Pkcs7>(plain.as_bytes());
    BASE64.encode(ciphertext)
}

/// AES-128-CBC decrypt from Base64. Empty input → empty string.
pub fn aes128_decrypt(b64: &str, key_str: &str, iv_str: &str) -> Result<String, String> {
    if b64.is_empty() {
        return Ok(String::new());
    }
    let (key, iv) = key_iv_bytes(key_str, iv_str);
    let raw = BASE64
        .decode(b64.trim())
        .map_err(|e| format!("base64 decode: {e}"))?;
    let decrypted = Aes128CbcDec::new(&key.into(), &iv.into())
        .decrypt_padded_vec_mut::<Pkcs7>(&raw)
        .map_err(|e| format!("aes decrypt: {e}"))?;
    String::from_utf8(decrypted).map_err(|e| format!("utf8: {e}"))
}
