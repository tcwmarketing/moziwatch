import { publicEnv } from "./env";

export function absoluteUrl(path = "") {
  const base = publicEnv.appUrl.endsWith("/")
    ? publicEnv.appUrl
    : `${publicEnv.appUrl}/`;
  return new URL(path.replace(/^\//, ""), base).toString();
}
