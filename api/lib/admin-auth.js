import crypto from "crypto";

const COOKIE_NAME = "sa_admin";
const SESSION_HOURS = 12;

function getString(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function getUsers() {
  const raw = getString(process.env.ADMIN_USERS) || "eddy,raudel";
  return raw
    .split(/[;,]/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function getPassword() {
  return getString(process.env.ADMIN_PASSWORD);
}

function getSecret() {
  const secret = getString(process.env.ADMIN_SESSION_SECRET);
  if (secret) return secret;
  // Fallback only so local/dev can set password alone; production should set ADMIN_SESSION_SECRET.
  const password = getPassword();
  return password ? `sa-admin-${password}` : "";
}

function b64urlEncode(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64").toString("utf8");
}

function sign(payloadB64) {
  const secret = getSecret();
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

export function createSessionToken(username) {
  const exp = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = b64urlEncode(JSON.stringify({ u: username.toLowerCase(), exp }));
  const sig = sign(payload);
  if (!sig) return null;
  return `${payload}.${sig}`;
}

export function verifySessionToken(token) {
  const raw = getString(token);
  if (!raw || !raw.includes(".")) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (!expected || sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(b64urlDecode(payload));
    if (!data || typeof data.u !== "string" || typeof data.exp !== "number") return null;
    if (Date.now() > data.exp) return null;
    if (!getUsers().includes(data.u.toLowerCase())) return null;
    return { username: data.u.toLowerCase(), exp: data.exp };
  } catch {
    return null;
  }
}

export function validateCredentials(username, password) {
  const user = getString(username).toLowerCase();
  const pass = getString(password);
  const expectedPass = getPassword();
  if (!expectedPass) {
    return { ok: false, error: "Admin login is not configured on the server." };
  }
  if (!user || !getUsers().includes(user)) {
    return { ok: false, error: "Invalid username or password." };
  }
  const a = Buffer.from(pass);
  const b = Buffer.from(expectedPass);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "Invalid username or password." };
  }
  return { ok: true, username: user };
}

export function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header || typeof header !== "string") return {};
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

export function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

function isProduction() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export function sessionCookieHeader(token, { clear = false } = {}) {
  const secure = isProduction() ? "; Secure" : "";
  if (clear) {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  }
  const maxAge = SESSION_HOURS * 60 * 60;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export { COOKIE_NAME };
