import keytar from "keytar";

const SERVICE = "fortivpngui";

export async function keytarGet(key: string): Promise<string | null> {
  try {
    return await keytar.getPassword(SERVICE, key);
  } catch {
    return null;
  }
}

export async function keytarSet(key: string, val: string): Promise<void> {
  await keytar.setPassword(SERVICE, key, val);
}

export async function keytarDelete(key: string): Promise<void> {
  await keytar.deletePassword(SERVICE, key);
}
