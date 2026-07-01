const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const OLLAMA_HOST = "http://localhost:11434";
const AI_MODEL = "qwen3:8b";
const WEBUI_HOST = "http://localhost:8081";

function ollamaGenerate(prompt, timeoutMs = 180000, extraOpts = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: AI_MODEL, prompt, stream: false, ...extraOpts });
    const req = http.request(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (res) => {
      let raw = "";
      res.on("data", c => { raw += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error("Ollama parse error")); }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("Ollama timeout")); });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function buildPrompt(type, filename, content) {
  const snip = content.slice(0, 4000);
  if (type === "ride") {
    return `/no_think\nYou are a cycling data analyst. Analyze this ride data and return ONLY a single-line JSON object with no markdown, no explanation, no extra text.\nFilename: ${filename}\nContent:\n${snip}\n\nReturn exactly this structure (use null if unknown):\n{"distance_km":number,"duration_min":number,"calories":number,"tss":number,"avg_power_watts":number,"ftp_watts":number,"session_title":"string","session_note":"string","coach_tip":"string"}`;
  }
  if (type === "sleep") {
    return `/no_think\nYou are a sleep science analyst. Analyze this sleep record and return ONLY a single-line JSON object with no markdown, no explanation, no extra text.\nFilename: ${filename}\nContent:\n${snip}\n\nReturn exactly this structure (use null if unknown):\n{"duration_hours":number,"deep_sleep_hours":number,"rem_hours":number,"light_sleep_hours":number,"sleep_quality_pct":number,"bedtime":"string","wake_time":"string","recovery_note":"string","coach_tip":"string"}`;
  }
  if (type === "nutrition") {
    return `/no_think\nYou are a sports nutritionist advising a cyclist. Analyze this single meal and return ONLY a single-line JSON object with no markdown, no explanation, no extra text. Estimate realistic totals for this meal alone, based on typical portion sizes.\nFilename: ${filename}\nContent:\n${snip}\n\nReturn exactly this structure:\n{"carbs_g":number,"protein_g":number,"fluids_ml":number,"calories":number,"meal_summary":"string 1 sentence describing the meal","coach_tip":"string 1 sentence cycling-specific fuel advice"}`;
  }
  return null;
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

const PORT = 5500;
const ROOT = __dirname;
const DB_FILE = path.join(__dirname, "users.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return { users: {} }; }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function hashPassword(password, salt) {
  return crypto.createHmac("sha256", salt).update(password).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

function getToken(req) {
  return (req.headers.authorization || "").replace("Bearer ", "").trim();
}

function userByToken(db, token) {
  if (!token) return null;
  return Object.values(db.users).find(u => u.token === token) || null;
}

// ---- Ride / sleep / nutrition history ---------------------------------------

const HISTORY_TYPES = { ride: "rides", sleep: "sleep", nutrition: "nutrition", coach: "coach" };

function ensureHistory(user) {
  if (!user.history) user.history = { rides: [], sleep: [], nutrition: [], coach: [] };
  if (!user.history.coach) user.history.coach = [];
  return user.history;
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ---- Open WebUI mirroring --------------------------------------------------

async function webuiFetch(pathname, method, token, body, timeoutMs = 8000) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${WEBUI_HOST}${pathname}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const raw = await res.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { /* non-JSON body */ }
    if (!res.ok) {
      const err = new Error(`WebUI ${method} ${pathname} -> ${res.status}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Returns { userId, jwt } or throws (network error, or signup also failed
// e.g. because the email already exists on WebUI under a DIFFERENT password).
async function webuiSigninOrSignup(email, password) {
  try {
    const s = await webuiFetch("/api/v1/auths/signin", "POST", null, { email, password });
    return { userId: s.id, jwt: s.token };
  } catch {
    // Signin failed: either no such account yet, or wrong password. Try to create it.
    // If this also throws, let it propagate to the caller (nothing more we can do).
    const s = await webuiFetch("/api/v1/auths/signup", "POST", null, {
      name: email.split("@")[0],
      email,
      password
    });
    return { userId: s.id, jwt: s.token };
  }
}

// Called from /api/signup and /api/login (both already have plaintext password
// in scope). Never throws — always logs and returns. Mutates `user.webui` and
// persists via the existing saveDB(db) only on success.
async function ensureWebuiLink(user, password, db) {
  try {
    const { userId, jwt } = await webuiSigninOrSignup(user.email, password);
    user.webui = user.webui || { chatId: null };
    user.webui.userId = userId;
    user.webui.jwt = jwt;
    if (user.webui.chatId === undefined) user.webui.chatId = null;
    saveDB(db);
  } catch (err) {
    console.warn(`[webui-link] ${user.email}: link/refresh failed (status=${err.status ?? "network"}): ${err.message}`);
    // user.webui left untouched (absent if never linked before) — Coach keeps
    // working via Ollama regardless; mirroring simply stays inactive until the
    // next successful signup/login call retries this.
  }
}

function buildMessagePair(userText, assistantText) {
  const userId = crypto.randomUUID();
  const assistantId = crypto.randomUUID();
  const ts = Math.floor(Date.now() / 1000); // Open WebUI message timestamps are second epoch
  const userMsg = {
    id: userId, parentId: null, childrenIds: [assistantId],
    role: "user", content: userText, timestamp: ts
  };
  const assistantMsg = {
    id: assistantId, parentId: userId, childrenIds: [],
    role: "assistant", content: assistantText, timestamp: ts + 1,
    model: AI_MODEL, models: [AI_MODEL]
  };
  return { userMsg, assistantMsg };
}

async function createCoachChat(jwt, userMsg, assistantMsg) {
  const chat = {
    title: "Coach",
    models: [AI_MODEL],
    history: {
      messages: { [userMsg.id]: userMsg, [assistantMsg.id]: assistantMsg },
      currentId: assistantMsg.id
    },
    messages: [userMsg, assistantMsg],
    tags: [],
    timestamp: Date.now() // chat-level timestamp is ms epoch (different unit than message.timestamp)
  };
  const created = await webuiFetch("/api/v1/chats/new", "POST", jwt, { chat });
  return created.id;
}

async function appendToCoachChat(jwt, chatId, userMsg, assistantMsg) {
  const existing = await webuiFetch(`/api/v1/chats/${chatId}`, "GET", jwt);
  const chat = existing.chat;
  // Defensive: tolerate a malformed/legacy chat blob rather than throwing.
  if (!chat.history) chat.history = { messages: {}, currentId: null };
  if (!Array.isArray(chat.messages)) chat.messages = [];
  const prevId = chat.history.currentId;
  userMsg.parentId = prevId || null; // overwrite the null default from buildMessagePair
  if (prevId && chat.history.messages[prevId]) {
    chat.history.messages[prevId].childrenIds.push(userMsg.id);
  }
  chat.history.messages[userMsg.id] = userMsg;
  chat.history.messages[assistantMsg.id] = assistantMsg;
  chat.history.currentId = assistantMsg.id;
  chat.messages.push(userMsg, assistantMsg);
  chat.timestamp = Date.now();
  // `chat` here is fetch-then-mutate-in-place, so title/models/tags/etc. are
  // all still present verbatim -> the server's shallow top-level merge
  // {...existing, ...chat} preserves them automatically.
  await webuiFetch(`/api/v1/chats/${chatId}`, "POST", jwt, { chat });
}

// A 401 from a chat GET/POST is ambiguous: expired JWT, or a chat that was
// deleted (WebUI returns 401, not 404, for a missing/not-owned chat id —
// confirmed empirically). Disambiguate by hitting an endpoint that only cares
// about the JWT itself: 200 means the JWT is fine and it's the chat that's
// gone; 401 means the JWT itself is the problem.
async function isWebuiJwtValid(jwt) {
  try {
    await webuiFetch("/api/v1/auths/", "GET", jwt);
    return true;
  } catch {
    return false;
  }
}

// Top-level entry point called from /api/chat. Never throws.
async function appendCoachTurnToWebui(user, db, userMessage, assistantMessage) {
  if (!user.webui || !user.webui.jwt) return; // never linked (WebUI was down at last signup/login)
  const { userMsg, assistantMsg } = buildMessagePair(userMessage, assistantMessage);
  try {
    if (!user.webui.chatId) {
      user.webui.chatId = await createCoachChat(user.webui.jwt, userMsg, assistantMsg);
      saveDB(db);
    } else {
      await appendToCoachChat(user.webui.jwt, user.webui.chatId, userMsg, assistantMsg);
    }
  } catch (err) {
    console.warn(`[webui-mirror] ${user.email}: turn not mirrored (status=${err.status ?? "network"}): ${err.message}`);
    // Reset chatId only when the chat itself is confirmed gone (404, or a 401
    // where the JWT still independently checks out) so a fresh thread starts.
    // Leave chatId alone on a genuinely expired/invalid JWT or on
    // network/5xx errors (transient — resetting would needlessly fragment
    // the "one continuous chat" requirement; next login/signup refreshes the
    // JWT and mirroring resumes into the same thread).
    const chatConfirmedGone =
      err.status === 404 || (err.status === 401 && (await isWebuiJwtValid(user.webui.jwt)));
    if (chatConfirmedGone && user.webui.chatId) {
      user.webui.chatId = null;
      saveDB(db);
      // Don't drop this turn: start the fresh thread with it right away.
      try {
        user.webui.chatId = await createCoachChat(user.webui.jwt, userMsg, assistantMsg);
        saveDB(db);
      } catch (retryErr) {
        console.warn(`[webui-mirror] ${user.email}: retry-create after chat-gone failed: ${retryErr.message}`);
      }
    }
  }
}

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");

  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  if (pathname === "/api/signup" && req.method === "POST") {
    const { email, password } = await parseBody(req);
    if (!email || !password || password.length < 6)
      return json(res, 400, { error: "Valid email and password (min 6 characters) required" });
    const db = loadDB();
    const key = email.toLowerCase().trim();
    if (db.users[key])
      return json(res, 409, { error: "An account with this email already exists" });
    const salt = crypto.randomBytes(16).toString("hex");
    const token = generateToken();
    db.users[key] = { email: key, salt, hash: hashPassword(password, salt), token, profile: null };
    saveDB(db);
    await ensureWebuiLink(db.users[key], password, db);
    return json(res, 200, { token, email: key, profile: null });
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const { email, password } = await parseBody(req);
    const db = loadDB();
    const key = (email || "").toLowerCase().trim();
    const user = db.users[key];
    if (!user || hashPassword(password || "", user.salt) !== user.hash)
      return json(res, 401, { error: "Invalid email or password" });
    user.token = generateToken();
    saveDB(db);
    await ensureWebuiLink(user, password, db);
    return json(res, 200, { token: user.token, email: key, profile: user.profile });
  }

  if (pathname === "/api/profile" && req.method === "GET") {
    const db = loadDB();
    const user = userByToken(db, getToken(req));
    if (!user) return json(res, 401, { error: "Unauthorized" });
    return json(res, 200, { email: user.email, profile: user.profile });
  }

  if (pathname === "/api/profile" && req.method === "POST") {
    const db = loadDB();
    const user = userByToken(db, getToken(req));
    if (!user) return json(res, 401, { error: "Unauthorized" });
    const { profile } = await parseBody(req);
    user.profile = profile;
    saveDB(db);
    return json(res, 200, { ok: true });
  }

  if (pathname === "/api/forgot-password" && req.method === "POST") {
    const { email } = await parseBody(req);
    const db = loadDB();
    const key = (email || "").toLowerCase().trim();
    const user = db.users[key];
    if (user) {
      user.resetToken = generateToken();
      user.resetExpiry = Date.now() + 3600000; // 1 hour
      saveDB(db);
      return json(res, 200, { ok: true, resetToken: user.resetToken });
    }
    return json(res, 200, { ok: true, resetToken: null });
  }

  if (pathname === "/api/reset-password" && req.method === "POST") {
    const { token, password } = await parseBody(req);
    if (!token || !password || password.length < 6)
      return json(res, 400, { error: "Valid token and password (min 6 characters) required" });
    const db = loadDB();
    const user = Object.values(db.users).find(u => u.resetToken === token && u.resetExpiry > Date.now());
    if (!user) return json(res, 400, { error: "Reset link is invalid or has expired" });
    const salt = crypto.randomBytes(16).toString("hex");
    user.hash = hashPassword(password, salt);
    user.salt = salt;
    user.token = generateToken();
    delete user.resetToken;
    delete user.resetExpiry;
    saveDB(db);
    return json(res, 200, { ok: true });
  }

  if (pathname === "/api/chat" && req.method === "POST") {
    const db = loadDB();
    const user = userByToken(db, getToken(req));
    if (!user) return json(res, 401, { error: "Unauthorized" });
    const { message, context } = await parseBody(req);
    if (!message) return json(res, 400, { error: "Message required" });
    const ctx = context || {};
    const contextStr = `Athlete context:\n- FTP: ${ctx.ftp || "unknown"} W (target: ${ctx.targetFtp || "unknown"} W)\n- Readiness score: ${ctx.readiness || "unknown"}/100\n- Sleep: ${ctx.sleepHours || "unknown"}h at ${ctx.sleepQuality || "unknown"}% quality\n- Training load (yesterday): ${ctx.trainingLoad || "unknown"} TSS\n- Muscle soreness: ${ctx.soreness || "unknown"}/10`;
    const prompt = `/no_think\nYou are an expert AI cycling coach. Answer the cyclist's question with specific, actionable advice. Be concise and direct. Use plain text with no markdown.\n${contextStr}\n\nQuestion: ${message}\n\nAnswer:`;
    try {
      const result = await ollamaGenerate(prompt, 180000, { think: false });
      const text = (result.response || "").trim();
      ensureHistory(user).coach.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        message,
        response: text
      });
      saveDB(db);
      try {
        await appendCoachTurnToWebui(user, db, message, text);
      } catch (mirrorErr) {
        // appendCoachTurnToWebui already catches internally and should never
        // reach here; this is defense-in-depth so a mirroring bug can never
        // cause a successful Ollama reply to be reported as ok:false.
        console.warn(`[webui-mirror] unexpected error for ${user.email}: ${mirrorErr.message}`);
      }
      return json(res, 200, { ok: true, response: text });
    } catch (err) {
      return json(res, 200, { ok: false, error: err.message });
    }
  }

  if (pathname === "/api/analyze" && req.method === "POST") {
    const db = loadDB();
    const user = userByToken(db, getToken(req));
    if (!user) return json(res, 401, { error: "Unauthorized" });
    const { type, content, filename } = await parseBody(req);
    if (!type || !["ride","sleep","nutrition"].includes(type))
      return json(res, 400, { error: "Invalid type" });
    const prompt = buildPrompt(type, filename || "file", content || "");
    try {
      const result = await ollamaGenerate(prompt);
      const data = extractJson(result.response || "");
      if (!data) return json(res, 200, { ok: false, error: "Could not parse AI response", raw: result.response });
      return json(res, 200, { ok: true, data });
    } catch (err) {
      return json(res, 200, { ok: false, error: err.message });
    }
  }

  if (pathname === "/api/history" && req.method === "GET") {
    const db = loadDB();
    const user = userByToken(db, getToken(req));
    if (!user) return json(res, 401, { error: "Unauthorized" });
    const history = ensureHistory(user);
    return json(res, 200, {
      rides: [...history.rides].sort((a, b) => b.timestamp - a.timestamp),
      sleep: [...history.sleep].sort((a, b) => b.timestamp - a.timestamp),
      nutrition: [...history.nutrition].sort((a, b) => b.timestamp - a.timestamp),
      coach: [...history.coach].sort((a, b) => b.timestamp - a.timestamp)
    });
  }

  if (pathname === "/api/history" && req.method === "POST") {
    const db = loadDB();
    const user = userByToken(db, getToken(req));
    if (!user) return json(res, 401, { error: "Unauthorized" });
    const { type, record } = await parseBody(req);
    const key = HISTORY_TYPES[type];
    if (!key || !record || typeof record !== "object")
      return json(res, 400, { error: "Invalid type or record" });
    const history = ensureHistory(user);
    const saved = { id: crypto.randomUUID(), timestamp: Date.now(), ...record };
    history[key].push(saved);
    saveDB(db);
    return json(res, 200, { ok: true, record: saved });
  }

  const historyDeleteMatch = pathname.match(/^\/api\/history\/([^/]+)\/([^/]+)$/);
  if (historyDeleteMatch && req.method === "DELETE") {
    const db = loadDB();
    const user = userByToken(db, getToken(req));
    if (!user) return json(res, 401, { error: "Unauthorized" });
    const [, type, id] = historyDeleteMatch;
    const key = HISTORY_TYPES[type];
    if (!key) return json(res, 400, { error: "Invalid type" });
    const history = ensureHistory(user);
    const before = history[key].length;
    history[key] = history[key].filter(r => r.id !== id);
    if (history[key].length === before) return json(res, 404, { error: "Record not found" });
    saveDB(db);
    return json(res, 200, { ok: true });
  }

  // Static file serving
  const safePath = path.normalize(pathname === "/" ? "/index.html" : pathname);
  const filePath = path.join(ROOT, safePath);
  if (!filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403); return res.end("Forbidden");
  }

  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`EnduraCore running on http://localhost:${PORT}`);
});
