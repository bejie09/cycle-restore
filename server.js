const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const OLLAMA_HOST = "http://localhost:11434";
const AI_MODEL = "qwen3:8b";

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
    return `/no_think\nYou are a sports nutritionist advising a cyclist. Analyze this meal and return ONLY a single-line JSON object with no markdown, no explanation, no extra text. Estimate realistic values based on typical portion sizes.\nFilename: ${filename}\nContent:\n${snip}\n\nReturn exactly this structure:\n{"carbs_g_per_hour":number,"protein_g":number,"fluids_ml":number,"meal_summary":"string 1 sentence describing the meal","coach_tip":"string 1 sentence cycling-specific fuel advice"}`;
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

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
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
  console.log(`CycleRestore running on http://localhost:${PORT}`);
});
