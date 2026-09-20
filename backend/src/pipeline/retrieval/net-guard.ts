import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type UrlCheck =
  | { ok: true; url: URL }
  | { ok: false; reason: "invalid_url" | "blocked_host" | "unreachable"; message: string };

// "acme.com" -> "https://acme.com"; anything with a scheme is left alone
export function withScheme(raw: string): string {
  const trimmed = raw.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isPrivateV4(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateV6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;

  const mappedDotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mappedDotted?.[1]) return isPrivateV4(mappedDotted[1]);

  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
  if (mappedHex?.[1] && mappedHex[2]) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }

  // fc00::/7 unique-local, fe80::/10 link-local, ff00::/8 multicast
  return /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff");
}

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateV4(ip);
  if (family === 6) return isPrivateV6(ip);
  return true; // unparseable: block
}

// Validates scheme and host. Resolves DNS and rejects private/loopback targets unless allowed
export async function checkUrl(raw: string, allowPrivate: boolean): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url", message: `Not a valid URL: ${raw}` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "invalid_url", message: `Unsupported protocol ${url.protocol}` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "invalid_url", message: "URLs with credentials are not allowed" };
  }
  if (allowPrivate) return { ok: true, url };

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    return {
      ok: false,
      reason: "blocked_host",
      message: "Private and loopback hosts are not allowed",
    };
  }

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      return { ok: false, reason: "unreachable", message: `Host could not be resolved: ${host}` };
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    return {
      ok: false,
      reason: "blocked_host",
      message: "Private and loopback hosts are not allowed",
    };
  }
  return { ok: true, url };
}
