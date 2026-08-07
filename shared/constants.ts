import pkg from "../package.json";

export const CHANGELOG_REV = 7;
export const APP_NAME = "FortiVPN GUI";
export const APP_VERSION = pkg.version;

export const APP_REPOSITORY =
  typeof pkg.homepage === "string" && pkg.homepage.length > 0 ? pkg.homepage : "https://github.com/cesariohomens/fortivpngui";

const author = pkg.author as { name?: string } | string | undefined;
export const APP_AUTHOR =
  typeof author === "object" && author?.name ? author.name : typeof author === "string" ? author : "";

export const APP_LICENSE = typeof pkg.license === "string" ? pkg.license : "MIT";
