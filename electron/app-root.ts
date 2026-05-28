import path from "path";

/** Project root when main runs from `dist-electron/electron/main.js`. */
export function appRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

export function fromAppRoot(...segments: string[]): string {
  return path.join(appRoot(), ...segments);
}
