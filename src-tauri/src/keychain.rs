//! System keyring access via the `keyring` crate (port of `electron/keychain-service.ts`).

use keyring::Entry;

const SERVICE: &str = "fortivpngui";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| format!("keyring entry: {e}"))
}

/// Returns `None` when the secret is missing or on error (matches TS `keytarGet` try/catch).
pub fn get(key: &str) -> Option<String> {
    let e = entry(key).ok()?;
    e.get_password().ok()
}

pub fn set(key: &str, val: &str) -> Result<(), String> {
    entry(key)?
        .set_password(val)
        .map_err(|e| format!("keyring set: {e}"))
}

pub fn delete(key: &str) -> Result<(), String> {
    let e = entry(key)?;
    match e.delete_credential() {
        Ok(()) => Ok(()),
        Err(err) => {
            let msg = err.to_string().to_ascii_lowercase();
            if msg.contains("no entry") || msg.contains("not found") || msg.contains("no data") {
                Ok(())
            } else {
                Err(format!("keyring delete: {err}"))
            }
        }
    }
}

/// Best-effort delete (ignores errors), matching TS `.catch(() => {})`.
pub fn delete_ignore(key: &str) {
    let _ = delete(key);
}
