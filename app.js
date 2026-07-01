const DEFAULTS = {
  sleepHours: 7.6,
  sleepQuality: 82,
  trainingLoad: 72,
  soreness: 3,
  ftp: 245,
  targetFtp: 270,
  meals: 3,
  hydration: 2.8,
  targetCarbs: 300,
  targetProtein: 120,
  targetFluids: 2800,
  targetCalories: 2400
};

function freshDailyMeals() {
  return { breakfast: null, lunch: null, dinner: null, other: null };
}

const state = { ...DEFAULTS, dailyMeals: freshDailyMeals() };
const auth = { token: null, email: null };

const els = {
  scoreRing: document.querySelector(".score-ring"),
  readinessScore: document.querySelector("#readinessScore"),
  sessionTitle: document.querySelector("#sessionTitle"),
  sessionCopy: document.querySelector("#sessionCopy"),
  sleepMetric: document.querySelector("#sleepMetric"),
  sleepStatus: document.querySelector("#sleepStatus"),
  fuelMetric: document.querySelector("#fuelMetric"),
  fuelStatus: document.querySelector("#fuelStatus"),
  hydrationMetric: document.querySelector("#hydrationMetric"),
  hydrationStatus: document.querySelector("#hydrationStatus"),
  ftpMetric: document.querySelector("#ftpMetric"),
  ftpStatus: document.querySelector("#ftpStatus"),
  weeklyLoad: document.querySelector("#weeklyLoad"),
  loadBar: document.querySelector("#loadBar"),
  mainSet: document.querySelector("#mainSet"),
  mainSetCopy: document.querySelector("#mainSetCopy"),
  ftpLevel: document.querySelector("#ftpLevel"),
  ftpGap: document.querySelector("#ftpGap"),
  sweetSpotZone: document.querySelector("#sweetSpotZone"),
  thresholdZone: document.querySelector("#thresholdZone"),
  vo2Zone: document.querySelector("#vo2Zone"),
  todayBar: document.querySelector("#todayBar"),
  bedtime: document.querySelector("#bedtime"),
  sleepNeed: document.querySelector("#sleepNeed"),
  carbActual: document.querySelector("#carbActual"),
  proteinActual: document.querySelector("#proteinActual"),
  fluidActual: document.querySelector("#fluidActual"),
  calorieActual: document.querySelector("#calorieActual"),
  carbFuelBox: document.querySelector("#carbFuelBox"),
  proteinFuelBox: document.querySelector("#proteinFuelBox"),
  fluidFuelBox: document.querySelector("#fluidFuelBox"),
  calorieFuelBox: document.querySelector("#calorieFuelBox"),
  carbTargetLabel: document.querySelector("#carbTargetLabel"),
  proteinTargetLabel: document.querySelector("#proteinTargetLabel"),
  fluidTargetLabel: document.querySelector("#fluidTargetLabel"),
  calorieTargetLabel: document.querySelector("#calorieTargetLabel"),
  rideResult: document.querySelector("#rideResult"),
  sleepResult: document.querySelector("#sleepResult"),
  foodResult: document.querySelector("#foodResult"),
  foodPreview: document.querySelector("#foodPreview"),
  coachNotes: document.querySelector("#coachNotes"),
  dailyMealRows: {
    breakfast: document.querySelector("#mealSummary-breakfast"),
    lunch: document.querySelector("#mealSummary-lunch"),
    dinner: document.querySelector("#mealSummary-dinner"),
    other: document.querySelector("#mealSummary-other")
  },
  dailyMealTotal: document.querySelector("#mealSummary-total"),
  historyRides: document.querySelector("#historyRides"),
  historySleep: document.querySelector("#historySleep"),
  historyNutrition: document.querySelector("#historyNutrition")
};

const inputs = {
  sleepHours: document.querySelector("#sleepHours"),
  sleepQuality: document.querySelector("#sleepQuality"),
  trainingLoad: document.querySelector("#trainingLoad"),
  soreness: document.querySelector("#soreness"),
  ftp: document.querySelector("#ftp"),
  targetFtp: document.querySelector("#targetFtp"),
  targetCarbs: document.querySelector("#targetCarbs"),
  targetProtein: document.querySelector("#targetProtein"),
  targetFluids: document.querySelector("#targetFluids"),
  targetCalories: document.querySelector("#targetCalories")
};

const labels = {
  sleepHours: document.querySelector("#sleepValue"),
  sleepQuality: document.querySelector("#qualityValue"),
  trainingLoad: document.querySelector("#loadValue"),
  soreness: document.querySelector("#sorenessValue"),
  ftp: document.querySelector("#ftpValue"),
  targetFtp: document.querySelector("#targetFtpValue"),
  targetCarbs: document.querySelector("#targetCarbsValue"),
  targetProtein: document.querySelector("#targetProteinValue"),
  targetFluids: document.querySelector("#targetFluidsValue"),
  targetCalories: document.querySelector("#targetCaloriesValue")
};

let currentUser = null;
let selectedMealType = "breakfast";
let currentNutritionTab = "photo";
let historyData = { rides: [], sleep: [], nutrition: [], coach: [] };
const HISTORY_KEYS = { ride: "rides", sleep: "sleep", nutrition: "nutrition", coach: "coach" };

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function formatSleep(hours) {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return `${whole}h ${minutes}m`;
}

function fileSizeMb(file) {
  return Math.max(file.size / 1024 / 1024, 0.05);
}

function numberFromText(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

function summarizeFile(file) {
  return `${escapeHtml(file.name)} - ${fileSizeMb(file).toFixed(1)} MB`;
}

function estimateRide(file, text = "") {
  const lower = `${file.name} ${text}`.toLowerCase();
  const distance =
    numberFromText(lower, [/distance[^0-9]*(\d+(?:\.\d+)?)/, /(\d+(?:\.\d+)?)\s?km/]) ||
    clamp(Math.round(fileSizeMb(file) * 16), 18, 125);
  const minutes =
    numberFromText(lower, [/duration[^0-9]*(\d+(?:\.\d+)?)/, /moving_time[^0-9]*(\d+(?:\.\d+)?)/]) ||
    clamp(Math.round(distance * 2.7), 35, 260);
  const calories =
    numberFromText(lower, [/calories[^0-9]*(\d+(?:\.\d+)?)/, /kcal[^0-9]*(\d+(?:\.\d+)?)/]) ||
    Math.round(minutes * 9.5);
  const twentyMinutePower = numberFromText(lower, [/20[_ -]?min(?:ute)?[_ -]?power[^0-9]*(\d+(?:\.\d+)?)/, /best_20[^0-9]*(\d+(?:\.\d+)?)/]);
  const normalizedPower = numberFromText(lower, [/normalized[_ -]?power[^0-9]*(\d+(?:\.\d+)?)/, /\bnp[^0-9]*(\d+(?:\.\d+)?)/]);
  const averagePower = numberFromText(lower, [/average[_ -]?power[^0-9]*(\d+(?:\.\d+)?)/, /avg[_ -]?power[^0-9]*(\d+(?:\.\d+)?)/, /\bpower[^0-9]*(\d+(?:\.\d+)?)/]);
  const ftpEstimate =
    twentyMinutePower ? Math.round(twentyMinutePower * 0.95) :
    normalizedPower ? Math.round(normalizedPower * 0.9) :
    averagePower && minutes >= 35 ? Math.round(averagePower * 0.88) :
    null;
  const load = clamp(Math.round(minutes * 0.55 + distance * 0.5 + calories / 70), 25, 170);
  return { distance, minutes, calories, load, ftpEstimate };
}

function estimateSleep(file, text = "") {
  const lower = `${file.name} ${text}`.toLowerCase();
  const duration =
    numberFromText(lower, [/sleep[^0-9]*(\d+(?:\.\d+)?)/, /duration[^0-9]*(\d+(?:\.\d+)?)/, /(\d+(?:\.\d+)?)\s?h/]) ||
    clamp(6.4 + fileSizeMb(file) * 0.45, 5.3, 8.9);
  const deep = numberFromText(lower, [/deep[^0-9]*(\d+(?:\.\d+)?)/]) || duration * 0.18;
  const rem = numberFromText(lower, [/rem[^0-9]*(\d+(?:\.\d+)?)/]) || duration * 0.22;
  const quality = clamp(Math.round(48 + duration * 4.5 + deep * 5 + rem * 3), 42, 96);
  return { duration, deep, rem, quality };
}

function estimateFood(file) {
  const lower = file.name.toLowerCase();
  let carbs = 58, protein = 26, fluids = 620;
  if (/rice|pasta|bread|oat|banana|potato|pizza/.test(lower)) carbs += 28;
  if (/chicken|fish|egg|beef|protein|yogurt/.test(lower)) protein += 18;
  if (/salad|fruit|soup|smoothie|drink|juice|water/.test(lower)) fluids += 180;
  if (/dessert|cake|cookie|sweet/.test(lower)) carbs += 22;
  const sizeFactor = clamp(fileSizeMb(file), 0.2, 6);
  carbs = Math.round(clamp(carbs + sizeFactor * 3, 22, 140));
  protein = Math.round(clamp(protein + sizeFactor * 1.3, 8, 70));
  fluids = Math.round(clamp(fluids + sizeFactor * 18, 300, 1200));
  const calories = Math.round(clamp(carbs * 4 + protein * 4 + 120, 180, 1100));
  return { carbs, protein, fluids, calories };
}

// ── Daily meal totals ────────────────────────────────────────────────────────

function dailyMealsLogged() {
  return Object.values(state.dailyMeals).some(Boolean);
}

function dailyTotals() {
  return Object.values(state.dailyMeals).reduce((sum, meal) => {
    if (!meal) return sum;
    return {
      carbs: sum.carbs + meal.carbs,
      protein: sum.protein + meal.protein,
      fluids: sum.fluids + meal.fluids,
      calories: sum.calories + meal.calories
    };
  }, { carbs: 0, protein: 0, fluids: 0, calories: 0 });
}

function calculateReadiness() {
  const sleepScore = clamp(((state.sleepHours - 4) / 5.5) * 100, 0, 100);
  const qualityScore = state.sleepQuality;
  const loadScore = clamp(105 - state.trainingLoad * 0.5, 18, 100);
  const sorenessScore = clamp(100 - state.soreness * 8.5, 10, 100);
  const fuelScore = 55 + state.meals * 11;
  return Math.round(
    sleepScore * 0.28 + qualityScore * 0.22 + loadScore * 0.18 +
    sorenessScore * 0.18 + fuelScore * 0.14
  );
}

function ftpLevel(ftp) {
  if (ftp >= 360) return "Elite";
  if (ftp >= 310) return "Advanced";
  if (ftp >= 260) return "Strong";
  if (ftp >= 210) return "Developing";
  return "Base";
}

function formatZone(low, high) {
  return `${Math.round(state.ftp * low)}-${Math.round(state.ftp * high)} W`;
}

function recommendation(score) {
  const ftpGap = state.targetFtp - state.ftp;
  if (score >= 82) {
    return {
      title: ftpGap > 5 ? "FTP builder intervals" : "Threshold maintenance",
      copy: ftpGap > 5
        ? "Recovery is strong enough to chase FTP growth. Keep the work controlled, repeatable, and close to threshold."
        : "You are near target FTP. Maintain threshold durability without forcing extra fatigue.",
      main: ftpGap > 5 ? "4 x 8 min" : "3 x 10 min",
      detail: ftpGap > 5 ? `Threshold work at ${formatZone(0.96, 1.02)}` : `Steady threshold at ${formatZone(0.92, 0.98)}`,
      bar: "78%", tone: "ready"
    };
  }
  if (score >= 65) {
    return {
      title: ftpGap > 5 ? "Sweet spot build" : "Endurance ride",
      copy: ftpGap > 5
        ? "Build FTP with controlled pressure below threshold. Finish with strength left."
        : "Keep it aerobic. Your recovery signals support steady work without chasing peak power.",
      main: ftpGap > 5 ? "3 x 12 min" : "65 min",
      detail: ftpGap > 5 ? `Sweet spot at ${formatZone(0.88, 0.94)}` : "Conversational endurance, no surges",
      bar: "54%", tone: "steady"
    };
  }
  if (score >= 48) {
    return {
      title: "Recovery spin",
      copy: "Protect tomorrow. Easy circulation and mobility will give you more than extra stress today.",
      main: "35 min", detail: "Zone 1 spin with high cadence", bar: "28%", tone: "warning"
    };
  }
  return {
    title: "Rest day",
    copy: "Recovery is the workout today. Prioritize sleep, fluids, and a complete meal before adding load.",
    main: "0-20 min", detail: "Optional walk or easy mobility", bar: "12%", tone: "alert"
  };
}

function buildNotes(score) {
  const notes = [];
  const ftpGap = state.targetFtp - state.ftp;
  if (state.sleepHours < 6.5) {
    notes.push(["alert", "Sleep is the main limiter. Keep intensity off the calendar until you clear 7+ hours."]);
  } else {
    notes.push(["", "Sleep duration supports adaptation. Keep tonight's wind-down routine boring and repeatable."]);
  }
  if (state.trainingLoad > 115) {
    notes.push(["warning", "Yesterday's ride was costly. Reduce today's main set or cap it at endurance power."]);
  } else {
    notes.push(["", "Training load is in a workable range for aerobic development."]);
  }
  if (ftpGap > 0) {
    notes.push(["", `FTP goal: ${ftpGap} W to target. Prioritize two quality threshold sessions each week, not more.`]);
  } else {
    notes.push(["", "FTP target reached. Hold the gain with threshold maintenance and fresh legs."]);
  }
  if (dailyMealsLogged()) {
    const totals = dailyTotals();
    const shortfalls = [];
    if (totals.carbs < state.targetCarbs) shortfalls.push(`carbs (${totals.carbs}g vs ${state.targetCarbs}g/day target)`);
    if (totals.protein < state.targetProtein) shortfalls.push(`protein (${totals.protein}g vs ${state.targetProtein}g/day target)`);
    if (totals.fluids < state.targetFluids) shortfalls.push(`fluids (${totals.fluids}ml vs ${state.targetFluids}ml/day target)`);
    if (totals.calories < state.targetCalories) shortfalls.push(`calories (${totals.calories} kcal vs ${state.targetCalories} kcal/day target)`);
    if (shortfalls.length) {
      notes.push(["alert", `Focus here: today's logged meals are short on ${shortfalls.join(", ")}. Log your remaining meals or close this gap before your next ride.`]);
    } else {
      notes.push(["", `Today's logged meals total ${totals.carbs}g carbs, ${totals.protein}g protein, ${totals.fluids}ml fluids, ${totals.calories} kcal — all meeting your daily targets.`]);
    }
  } else if (state.meals < 3) {
    notes.push(["warning", "Fuel readiness is incomplete. Add carbs before the ride and protein after."]);
  } else {
    notes.push(["", "Nutrition is close. Log Breakfast, Lunch, and Dinner in the Nutrition tab to check today's totals against your targets. Not sure what to set your targets to? Ask your AI Coach."]);
  }
  if (score < 50) notes.push(["alert", "Low readiness means the best gain comes from restraint. Bank recovery today."]);
  return notes;
}

function updateTargets(score) {
  const weeklyLoad = Math.round(260 + state.trainingLoad * 1.22);
  const fuelPercent = clamp(55 + state.meals * 11, 0, 100);
  const sleepNeed = clamp(7.4 + state.trainingLoad / 190 + state.soreness / 14, 7.5, 9.1);
  const totals = dailyMealsLogged() ? dailyTotals() : null;
  const carbActual = totals ? totals.carbs : score > 80 ? 320 : score > 64 ? 280 : 220;
  const proteinActual = totals ? totals.protein : state.trainingLoad > 95 ? 140 : 110;
  const fluidActual = totals ? totals.fluids : state.trainingLoad > 95 ? 3200 : 2600;
  const calorieActual = totals ? totals.calories : score > 80 ? 2600 : score > 64 ? 2300 : 1900;

  els.weeklyLoad.textContent = `${weeklyLoad} TSS`;
  els.loadBar.style.width = `${clamp(weeklyLoad / 6, 20, 100)}%`;
  els.fuelMetric.textContent = `${fuelPercent}%`;
  els.fuelStatus.textContent = fuelPercent >= 85 ? "Carbs and protein on track" : "Add one fuel checkpoint";
  els.hydrationMetric.textContent = `${state.hydration.toFixed(1)} L`;
  els.hydrationStatus.textContent = state.hydration >= 3 ? "Hydration target met" : "Finish one more bottle";
  els.ftpMetric.textContent = `${state.ftp} W`;
  els.ftpStatus.textContent = state.targetFtp > state.ftp ? `${state.targetFtp - state.ftp} W to target` : "Target reached";
  els.ftpLevel.textContent = ftpLevel(state.ftp);
  els.ftpGap.textContent = state.targetFtp > state.ftp ? `${state.targetFtp - state.ftp} W to target` : "Target reached";
  els.sweetSpotZone.textContent = formatZone(0.88, 0.94);
  els.thresholdZone.textContent = formatZone(0.95, 1.05);
  els.vo2Zone.textContent = formatZone(1.06, 1.2);
  els.sleepNeed.textContent = `Aim for ${formatSleep(sleepNeed)} after today's load`;
  els.carbActual.textContent = `${carbActual}g`;
  els.proteinActual.textContent = `${proteinActual}g`;
  els.fluidActual.textContent = `${fluidActual}ml`;
  els.calorieActual.textContent = `${calorieActual} kcal`;
  els.carbTargetLabel.textContent = `Target ${state.targetCarbs}g/day`;
  els.proteinTargetLabel.textContent = `Target ${state.targetProtein}g/day`;
  els.fluidTargetLabel.textContent = `Target ${state.targetFluids}ml/day`;
  els.calorieTargetLabel.textContent = `Target ${state.targetCalories} kcal/day`;

  const nutritionLogged = Boolean(totals);
  els.carbFuelBox.classList.toggle("under-target", nutritionLogged && carbActual < state.targetCarbs);
  els.proteinFuelBox.classList.toggle("under-target", nutritionLogged && proteinActual < state.targetProtein);
  els.fluidFuelBox.classList.toggle("under-target", nutritionLogged && fluidActual < state.targetFluids);
  els.calorieFuelBox.classList.toggle("under-target", nutritionLogged && calorieActual < state.targetCalories);

  const wakeHour = 6.0;
  let bedtimeHour = wakeHour + 24 - sleepNeed;
  if (bedtimeHour >= 24) bedtimeHour -= 24;
  const hour = Math.floor(bedtimeHour);
  const minute = Math.round((bedtimeHour - hour) * 60);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  els.bedtime.textContent = `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const persistProfile = debounce(async () => {
  if (!currentUser) return;
  try {
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentUser.token}` },
      body: JSON.stringify({ profile: { ...state } })
    });
  } catch {}
}, 1500);

function syncInputs() {
  for (const [key, input] of Object.entries(inputs)) {
    input.value = state[key];
  }
}

function applyProfile(profile) {
  Object.assign(state, profile ? profile : DEFAULTS);
  // Profiles saved before daily nutrition targets existed have no targetCalories
  // field and carry the old per-ride-hour target scale (e.g. 80g instead of 300g/day).
  if (!profile || profile.targetCalories === undefined) {
    state.targetCarbs = DEFAULTS.targetCarbs;
    state.targetProtein = DEFAULTS.targetProtein;
    state.targetFluids = DEFAULTS.targetFluids;
    state.targetCalories = DEFAULTS.targetCalories;
  }
  if (!profile || !profile.dailyMeals) {
    state.dailyMeals = freshDailyMeals();
  }
  syncInputs();
}

function switchNutritionTab(tab) {
  currentNutritionTab = tab;
  document.getElementById("nutrition-photo-panel").style.display = tab === "photo" ? "" : "none";
  document.getElementById("nutrition-manual-panel").style.display = tab === "manual" ? "" : "none";
  document.getElementById("tab-photo").classList.toggle("active", tab === "photo");
  document.getElementById("tab-manual").classList.toggle("active", tab === "manual");
  // The meal-type selector only matters for the single-target photo upload —
  // manual entry has its own labeled section per meal, so hide it there.
  const mealTypeBar = document.querySelector(".meal-type-bar");
  const mealTypeHint = document.querySelector(".meal-type-hint");
  if (mealTypeBar) mealTypeBar.style.display = tab === "photo" ? "" : "none";
  if (mealTypeHint) mealTypeHint.style.display = tab === "photo" ? "" : "none";
}

function renderMealResult(resultEl, meal, summary, coachTip, usedAi, headerText) {
  const label = usedAi ? "AI" : "Estimated";
  resultEl.innerHTML = `
    ${headerText ? `<span>${headerText}</span>` : ""}
    <strong>${label}: ${meal.carbs}g carbs · ${meal.protein}g protein · ${meal.fluids}ml fluids · ${meal.calories} kcal</strong>
    ${summary   ? `<em>${escapeHtml(summary)}</em>`   : ""}
    ${coachTip  ? `<small>${escapeHtml(coachTip)}</small>` : ""}
  `;
  resultEl.style.display = "";
}

async function analyzeFoodText(mealType) {
  const textarea = document.getElementById(`foodTextInput-${mealType}`);
  const text = textarea.value.trim();
  if (!text) return;
  const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
  const btn = document.getElementById(`analyzeFoodBtn-${mealType}`);
  const resultEl = document.getElementById(`foodResult-${mealType}`);
  btn.disabled = true;
  btn.textContent = "Analysing…";
  resultEl.style.display = "";
  resultEl.classList.add("analyzing");
  resultEl.innerHTML = `<strong>AI is analysing your ${mealLabel}…</strong>`;
  const content = `Meal type: ${mealLabel}\nFood: ${text}`;
  const { meal, summary, coachTip, usedAi } = await applyFoodEstimate({ name: `${mealLabel} (manual)`, size: 0 }, content, mealType);
  resultEl.classList.remove("analyzing");
  renderMealResult(resultEl, meal, summary, coachTip, usedAi);
  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14H11v-2h2zm0-4H11V7h2z"/></svg> Analyse with AI`;
}

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  btn.querySelector(".pw-eye").style.display = isHidden ? "none" : "";
  btn.querySelector(".pw-eye-off").style.display = isHidden ? "" : "none";
  btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
}

function showAuthForm(which) {
  ["register-form", "login-form", "forgot-form", "reset-form"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === `${which}-form` ? "" : "none";
  });
  ["register-error", "login-error", "forgot-error", "forgot-success", "reset-error", "reset-success"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

function onAuthSuccess(user) {
  currentUser = user;
  document.getElementById("landing-page").style.display = "none";
  document.getElementById("app").style.display = "block";
  document.getElementById("nav-user").textContent = user.email;
  applyProfile(user.profile);
  render();
  fetchHistory();
}

function doSignOut() {
  currentUser = null;
  localStorage.removeItem("cr_token");
  document.getElementById("app").style.display = "none";
  document.getElementById("landing-page").style.display = "block";
  document.getElementById("login-email").value = "";
  document.getElementById("login-password").value = "";
  showAuthForm("register");
  applyProfile(null);
  historyData = { rides: [], sleep: [], nutrition: [], coach: [] };
  renderHistory();
  renderCoachHistory();
}

function showAuthError(formId, msg) {
  const el = document.getElementById(formId + "-error");
  el.textContent = msg;
  el.style.display = "block";
}

function setAuthLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  btn.disabled = loading;
  const labels = {
    "login-btn":    ["Signing in…",       "Sign in"],
    "register-btn": ["Creating account…", "Create free account"],
    "forgot-btn":   ["Sending…",          "Send reset link"],
    "reset-btn":    ["Updating…",         "Set new password"],
  };
  const [loadingText, defaultText] = labels[btnId] || ["Loading…", "Submit"];
  btn.textContent = loading ? loadingText : defaultText;
}

async function submitRegister(e) {
  e.preventDefault();
  const email    = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const confirm  = document.getElementById("reg-confirm").value;
  document.getElementById("register-error").style.display = "none";
  if (password !== confirm) { showAuthError("register", "Passwords do not match."); return; }
  setAuthLoading("register-btn", true);
  try {
    const res  = await fetch("/api/signup", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { showAuthError("register", data.error || "Registration failed."); return; }
    localStorage.setItem("cr_token", data.token);
    onAuthSuccess({ token: data.token, email: data.email, profile: null });
  } catch {
    showAuthError("register", "Network error. Please try again.");
  } finally {
    setAuthLoading("register-btn", false);
  }
}

async function submitLogin(e) {
  e.preventDefault();
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  document.getElementById("login-error").style.display = "none";
  setAuthLoading("login-btn", true);
  try {
    const res  = await fetch("/api/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { showAuthError("login", data.error || "Login failed."); return; }
    localStorage.setItem("cr_token", data.token);
    onAuthSuccess({ token: data.token, email: data.email, profile: data.profile });
  } catch {
    showAuthError("login", "Network error. Please try again.");
  } finally {
    setAuthLoading("login-btn", false);
  }
}

async function checkSession() {
  const token = localStorage.getItem("cr_token");
  if (!token) return;
  try {
    const res  = await fetch("/api/profile", { headers: { "Authorization": `Bearer ${token}` } });
    const data = await res.json();
    if (res.ok) {
      onAuthSuccess({ token, email: data.email || "", profile: data.profile });
    } else {
      localStorage.removeItem("cr_token");
    }
  } catch {}
}

// ── AI analysis via server proxy ──────────────────────────────────────────────

async function analyzeWithAI(type, file, text) {
  if (!currentUser) return null;
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentUser.token}`
      },
      body: JSON.stringify({ type, filename: file.name, content: text || "" })
    });
    const json = await res.json();
    return json.ok ? json.data : null;
  } catch {
    return null;
  }
}

// ── Ride / sleep / food upload helpers ───────────────────────────────────────

async function applyRideEstimate(file, text) {
  els.rideResult.classList.add("analyzing");
  const fallback = estimateRide(file, text);
  const ai = await analyzeWithAI("ride", file, text);
  els.rideResult.classList.remove("analyzing");

  const distance   = ai?.distance_km    ?? fallback.distance;
  const minutes    = ai?.duration_min   ?? fallback.minutes;
  const calories   = ai?.calories       ?? fallback.calories;
  const tss        = ai?.tss            ?? fallback.load;
  const ftpWatts   = ai?.ftp_watts      ?? fallback.ftpEstimate;
  const sessionTitle = ai?.session_title;
  const sessionNote  = ai?.session_note;
  const coachTip     = ai?.coach_tip;

  state.trainingLoad = clamp(Math.round(tss), 5, 200);
  if (ftpWatts) {
    state.ftp = clamp(Math.round(ftpWatts), 120, 430);
    state.targetFtp = Math.max(state.targetFtp, state.ftp + 20);
    inputs.ftp.value = state.ftp;
    inputs.targetFtp.value = state.targetFtp;
  }
  state.hydration = clamp(2.4 + minutes / 130, 2.4, 4.2);
  inputs.trainingLoad.value = state.trainingLoad;

  const label = ai ? "AI" : "Estimated";
  els.rideResult.innerHTML = `
    <span>${summarizeFile(file)}</span>
    <strong>${label}: ${Math.round(distance)} km · ${Math.round(minutes)} min · ${Math.round(calories)} kcal · ${state.trainingLoad} TSS${ftpWatts ? ` · ${state.ftp} W FTP` : ""}</strong>
    ${sessionTitle ? `<em>${escapeHtml(sessionTitle)} — ${escapeHtml(sessionNote || "")}</em>` : ""}
    ${coachTip ? `<small>${escapeHtml(coachTip)}</small>` : ""}
  `;
  render();

  saveHistoryRecord("ride", {
    distance: Math.round(distance),
    minutes: Math.round(minutes),
    calories: Math.round(calories),
    tss: state.trainingLoad,
    ftpWatts: ftpWatts ? state.ftp : null,
    sessionTitle: sessionTitle || null,
    sessionNote: sessionNote || null,
    coachTip: coachTip || null,
    filename: file.name,
    source: ai ? "ai" : "estimated"
  });
}

async function applySleepEstimate(file, text) {
  els.sleepResult.classList.add("analyzing");
  const fallback = estimateSleep(file, text);
  const ai = await analyzeWithAI("sleep", file, text);
  els.sleepResult.classList.remove("analyzing");

  const duration  = ai?.duration_hours      ?? fallback.duration;
  const deep      = ai?.deep_sleep_hours    ?? fallback.deep;
  const rem       = ai?.rem_hours           ?? fallback.rem;
  const quality   = ai?.sleep_quality_pct   ?? fallback.quality;
  const recovNote = ai?.recovery_note;
  const coachTip  = ai?.coach_tip;

  state.sleepHours   = Number(Math.min(duration, 12).toFixed(1));
  state.sleepQuality = clamp(Math.round(quality), 20, 100);
  inputs.sleepHours.value  = state.sleepHours;
  inputs.sleepQuality.value = state.sleepQuality;

  const label = ai ? "AI" : "Estimated";
  els.sleepResult.innerHTML = `
    <span>${summarizeFile(file)}</span>
    <strong>${label}: ${formatSleep(duration)} sleep · ${formatSleep(deep)} deep · ${formatSleep(rem)} REM · ${state.sleepQuality}% quality</strong>
    ${recovNote ? `<em>${escapeHtml(recovNote)}</em>` : ""}
    ${coachTip  ? `<small>${escapeHtml(coachTip)}</small>`  : ""}
  `;
  render();

  saveHistoryRecord("sleep", {
    duration: state.sleepHours,
    deep: Number(deep.toFixed(1)),
    rem: Number(rem.toFixed(1)),
    quality: state.sleepQuality,
    recoveryNote: recovNote || null,
    coachTip: coachTip || null,
    filename: file.name,
    source: ai ? "ai" : "estimated"
  });
}

async function applyFoodEstimate(file, text, mealType) {
  const fallback = estimateFood(file);
  const ai = await analyzeWithAI("nutrition", file, text || "");

  const carbs    = ai?.carbs_g    ?? ai?.carbs_g_per_hour ?? fallback.carbs;
  const protein  = ai?.protein_g  ?? fallback.protein;
  const fluids   = ai?.fluids_ml  ?? fallback.fluids;
  const calories = ai?.calories   ?? fallback.calories;
  const summary  = ai?.meal_summary;
  const coachTip = ai?.coach_tip;

  const meal = { carbs: Math.round(carbs), protein: Math.round(protein), fluids: Math.round(fluids), calories: Math.round(calories) };
  state.dailyMeals[mealType] = meal;
  state.meals = Object.values(state.dailyMeals).filter(Boolean).length;
  state.hydration = clamp(fluids / 250, 2.4, 4.2);
  render();

  saveHistoryRecord("nutrition", {
    mealType,
    ...meal,
    summary: summary || null,
    coachTip: coachTip || null,
    source: ai ? "ai" : "estimated"
  });

  return { meal, summary, coachTip, usedAi: Boolean(ai) };
}

function readUploadedText(file, callback) {
  if (!/\.(csv|json|txt|tcx|gpx)$/i.test(file.name)) { callback(""); return; }
  const reader = new FileReader();
  reader.addEventListener("load", () => callback(String(reader.result || "")));
  reader.addEventListener("error", () => callback(""));
  reader.readAsText(file);
}

// ── History (saved rides / sleep / nutrition records) ───────────────────────

function formatHistoryDate(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

async function fetchHistory() {
  if (!currentUser) return;
  try {
    const res = await fetch("/api/history", {
      headers: { "Authorization": `Bearer ${currentUser.token}` }
    });
    const data = await res.json();
    if (res.ok) {
      historyData = {
        rides: data.rides || [],
        sleep: data.sleep || [],
        nutrition: data.nutrition || [],
        coach: data.coach || []
      };
      renderHistory();
      renderCoachHistory();
    }
  } catch { /* history stays as last known state */ }
}

async function saveHistoryRecord(type, record) {
  if (!currentUser) return;
  const key = HISTORY_KEYS[type];
  try {
    const res = await fetch("/api/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentUser.token}`
      },
      body: JSON.stringify({ type, record })
    });
    const data = await res.json();
    if (data.ok) {
      historyData[key].unshift(data.record);
      renderHistory();
    }
  } catch { /* saving to history is best-effort; the estimate itself already applied */ }
}

async function deleteHistoryRecord(type, id) {
  if (!currentUser) return;
  const key = HISTORY_KEYS[type];
  try {
    const res = await fetch(`/api/history/${type}/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${currentUser.token}` }
    });
    if (res.ok) {
      historyData[key] = historyData[key].filter((r) => r.id !== id);
      renderHistory();
    }
  } catch { /* leave the record visible if the delete failed */ }
}

function renderHistoryList(container, type, records, emptyText, formatItem) {
  if (!container) return;
  if (!records.length) {
    container.innerHTML = `<p class="history-empty">${emptyText}</p>`;
    return;
  }
  container.innerHTML = records.map((record) => `
    <div class="history-item">
      <div class="history-item-main">
        <strong>${formatItem(record)}</strong>
        <span>${formatHistoryDate(record.timestamp)}${record.filename ? ` · ${escapeHtml(record.filename)}` : ""}</span>
      </div>
      <button class="history-delete" type="button" onclick="deleteHistoryRecord('${type}','${record.id}')" aria-label="Delete record">×</button>
    </div>
  `).join("");
}

function renderHistory() {
  renderHistoryList(els.historyRides, "ride", historyData.rides, "No rides logged yet.", (r) =>
    `${r.distance} km · ${r.minutes} min · ${r.calories} kcal · ${r.tss} TSS${r.ftpWatts ? ` · ${r.ftpWatts} W FTP` : ""}`
  );
  renderHistoryList(els.historySleep, "sleep", historyData.sleep, "No sleep records logged yet.", (r) =>
    `${formatSleep(r.duration)} sleep · ${formatSleep(r.deep)} deep · ${formatSleep(r.rem)} REM · ${r.quality}% quality`
  );
  renderHistoryList(els.historyNutrition, "nutrition", historyData.nutrition, "No meals logged yet.", (r) =>
    `${r.mealType.charAt(0).toUpperCase() + r.mealType.slice(1)} · ${r.carbs}g carbs · ${r.protein}g protein · ${r.fluids}ml fluids · ${r.calories} kcal`
  );
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderNutritionSummary() {
  for (const type of Object.keys(state.dailyMeals)) {
    const row = els.dailyMealRows[type];
    const meal = state.dailyMeals[type];
    const rowWrap = document.getElementById(`mealSummaryRow-${type}`);
    if (row && meal) {
      row.textContent = `${meal.carbs}g carbs · ${meal.protein}g protein · ${meal.fluids}ml fluids · ${meal.calories} kcal`;
    }
    if (rowWrap) rowWrap.style.display = meal ? "" : "none";
    const pill = document.querySelector(`.meal-pill[data-meal="${type}"]`);
    if (pill) pill.classList.toggle("logged", Boolean(meal));
    const manualEntry = document.querySelector(`.manual-food-entry[data-meal="${type}"]`);
    if (manualEntry) manualEntry.classList.toggle("logged", Boolean(meal));
  }
  if (els.dailyMealTotal) {
    if (dailyMealsLogged()) {
      const totals = dailyTotals();
      els.dailyMealTotal.textContent = `${totals.carbs}g carbs · ${totals.protein}g protein · ${totals.fluids}ml fluids · ${totals.calories} kcal`;
    } else {
      els.dailyMealTotal.textContent = "Log a meal below to see today's total";
    }
  }
}

function render() {
  const score = calculateReadiness();
  const rec = recommendation(score);

  labels.sleepHours.textContent = `${state.sleepHours.toFixed(1)}h`;
  labels.sleepQuality.textContent = `${state.sleepQuality}%`;
  labels.trainingLoad.textContent = `${state.trainingLoad} TSS`;
  labels.soreness.textContent = `${state.soreness}/10`;
  labels.ftp.textContent = `${state.ftp} W`;
  labels.targetFtp.textContent = `${state.targetFtp} W`;
  labels.targetCarbs.textContent = `${state.targetCarbs}g/day`;
  labels.targetProtein.textContent = `${state.targetProtein}g/day`;
  labels.targetFluids.textContent = `${state.targetFluids}ml/day`;
  labels.targetCalories.textContent = `${state.targetCalories} kcal/day`;

  els.scoreRing.style.setProperty("--score", score);
  els.readinessScore.textContent = score;
  els.sessionTitle.textContent = rec.title;
  els.sessionCopy.textContent = rec.copy;
  els.mainSet.textContent = rec.main;
  els.mainSetCopy.textContent = rec.detail;
  els.todayBar.style.setProperty("--h", rec.bar);
  els.sleepMetric.textContent = formatSleep(state.sleepHours);
  els.sleepStatus.textContent = state.sleepHours >= 7.2 ? "Strong recovery window" : "Extend tonight's target";

  updateTargets(score);
  renderNutritionSummary();

  els.coachNotes.innerHTML = buildNotes(score)
    .map(([tone, text]) => `<li class="${tone}">${text}</li>`)
    .join("");

  updateCoachSidebar();
  persistProfile();
}

// ── Event listeners ───────────────────────────────────────────────────────────

Object.entries(inputs).forEach(([key, input]) => {
  input.addEventListener("input", () => { state[key] = Number(input.value); render(); });
});

document.querySelectorAll(".meal-type-radio").forEach((radio) => {
  radio.addEventListener("change", () => {
    if (radio.checked) selectedMealType = radio.value;
  });
});

function showPhotoPreview(previewEl, dataUrl, filename) {
  previewEl.classList.add("active");
  previewEl.innerHTML = dataUrl
    ? `<img src="${dataUrl}" alt="Preview"><span>${escapeHtml(filename)}</span>`
    : `<span>${escapeHtml(filename)}</span>`;
}

function isImageFile(file) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|gif|bmp)$/i.test(file.name);
}

document.querySelector("#rideUpload").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const preview = document.querySelector("#ridePhotoPreview");
  if (isImageFile(file)) {
    els.rideResult.innerHTML = `<span>${summarizeFile(file)}</span><strong>AI is reading your ride screenshot…</strong>`;
    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      showPhotoPreview(preview, reader.result, file.name);
      await applyRideEstimate(file, "");
    });
    reader.addEventListener("error", async () => {
      showPhotoPreview(preview, null, file.name);
      await applyRideEstimate(file, "");
    });
    reader.readAsDataURL(file);
  } else {
    els.rideResult.innerHTML = `<span>${summarizeFile(file)}</span><strong>Sending to AI for analysis…</strong>`;
    readUploadedText(file, async (text) => {
      els.rideResult.innerHTML = `<span>${summarizeFile(file)}</span><strong>AI is reading your ride data…</strong>`;
      await applyRideEstimate(file, text);
    });
  }
});

document.querySelector("#sleepUpload").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const preview = document.querySelector("#sleepPhotoPreview");
  if (isImageFile(file)) {
    els.sleepResult.innerHTML = `<span>${summarizeFile(file)}</span><strong>AI is reading your sleep screenshot…</strong>`;
    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      showPhotoPreview(preview, reader.result, file.name);
      await applySleepEstimate(file, "");
    });
    reader.addEventListener("error", async () => {
      showPhotoPreview(preview, null, file.name);
      await applySleepEstimate(file, "");
    });
    reader.readAsDataURL(file);
  } else {
    els.sleepResult.innerHTML = `<span>${summarizeFile(file)}</span><strong>Sending to AI for analysis…</strong>`;
    readUploadedText(file, async (text) => {
      els.sleepResult.innerHTML = `<span>${summarizeFile(file)}</span><strong>AI is reading your sleep record…</strong>`;
      await applySleepEstimate(file, text);
    });
  }
});

document.querySelector("#foodUpload").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const mealType = selectedMealType;
  const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1);
  els.foodResult.classList.add("analyzing");
  els.foodResult.innerHTML = `<span>${summarizeFile(file)}</span><strong>AI is analyzing your ${mealLabel} photo…</strong>`;
  const reader = new FileReader();
  reader.addEventListener("load", async () => {
    showPhotoPreview(els.foodPreview, reader.result, file.name);
    readUploadedText(file, async (text) => {
      const { meal, summary, coachTip, usedAi } = await applyFoodEstimate(file, text, mealType);
      els.foodResult.classList.remove("analyzing");
      renderMealResult(els.foodResult, meal, summary, coachTip, usedAi, `${mealLabel} logged — ${summarizeFile(file)}`);
    });
  });
  reader.addEventListener("error", async () => {
    showPhotoPreview(els.foodPreview, null, file.name);
    const { meal, summary, coachTip, usedAi } = await applyFoodEstimate(file, "", mealType);
    els.foodResult.classList.remove("analyzing");
    renderMealResult(els.foodResult, meal, summary, coachTip, usedAi, `${mealLabel} logged — ${summarizeFile(file)}`);
  });
  reader.readAsDataURL(file);
});

function switchView(viewName) {
  const button = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  const target = document.querySelector(`#${viewName}`);
  if (!button || !target) return;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  button.classList.add("active");
  target.classList.add("active");
  const isToday = viewName === "today";
  document.querySelector(".hero").style.display = isToday ? "" : "none";
  document.querySelector(".top-grid").style.display = isToday ? "" : "none";
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

function askCoachAboutTargets() {
  switchView("coach");
  const input = document.getElementById("coachChatInput");
  if (input) {
    input.value = "What should my daily carb, protein, fluid, and calorie targets be?";
    input.focus();
  }
  const row = document.getElementById("coachSuggestedRow");
  if (row) row.style.display = "none";
}

document.querySelector("#optimizeBtn").addEventListener("click", () => {
  inputs.sleepHours.value = 8.1;
  inputs.sleepQuality.value = 88;
  inputs.trainingLoad.value = 58;
  inputs.soreness.value = 2;
  inputs.targetFtp.value = Math.max(state.ftp + 20, state.targetFtp);
  state.sleepHours = 8.1;
  state.sleepQuality = 88;
  state.trainingLoad = 58;
  state.soreness = 2;
  state.targetFtp = Math.max(state.ftp + 20, state.targetFtp);
  render();
});

// ── Forgot / Reset password ───────────────────────────────────────────────────

let pendingResetToken = null;

async function submitForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById("forgot-email").value.trim();
  document.getElementById("forgot-error").style.display = "none";
  document.getElementById("forgot-success").style.display = "none";
  setAuthLoading("forgot-btn", true);
  try {
    const res = await fetch("/api/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    const successEl = document.getElementById("forgot-success");
    if (data.resetToken) {
      const resetUrl = `${location.origin}${location.pathname}?reset=${data.resetToken}`;
      successEl.innerHTML = `Reset link generated (valid 1 hour):<br><a href="${resetUrl}" class="auth-reset-link">${escapeHtml(resetUrl)}</a>`;
    } else {
      successEl.textContent = "If an account exists for that email, a reset link has been generated.";
    }
    successEl.style.display = "block";
  } catch {
    showAuthError("forgot", "Network error. Please try again.");
  } finally {
    setAuthLoading("forgot-btn", false);
  }
}

async function submitResetPassword(e) {
  e.preventDefault();
  const password = document.getElementById("reset-password").value;
  const confirm  = document.getElementById("reset-confirm").value;
  document.getElementById("reset-error").style.display = "none";
  if (password !== confirm) { showAuthError("reset", "Passwords do not match."); return; }
  setAuthLoading("reset-btn", true);
  try {
    const res = await fetch("/api/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: pendingResetToken, password })
    });
    const data = await res.json();
    if (!res.ok) { showAuthError("reset", data.error || "Reset failed."); return; }
    history.replaceState({}, "", location.pathname);
    pendingResetToken = null;
    const successEl = document.getElementById("reset-success");
    successEl.textContent = "Password updated! You can now sign in.";
    successEl.style.display = "block";
    setTimeout(() => showAuthForm("login"), 2000);
  } catch {
    showAuthError("reset", "Network error. Please try again.");
  } finally {
    setAuthLoading("reset-btn", false);
  }
}

// ── Coach chat ────────────────────────────────────────────────────────────────

const coachMessages = [];

function formatChatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatChatDay(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function renderCoachMessages() {
  const container = document.getElementById("coachChatMessages");
  if (!container) return;
  if (coachMessages.length === 0) {
    container.innerHTML = `<div class="coach-chat-empty"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>Ask your coach anything about training, recovery, or nutrition</p></div>`;
    return;
  }
  container.innerHTML = coachMessages.map(msg => {
    const time = msg.ts ? `<time class="coach-msg-time">${formatChatTime(msg.ts)}</time>` : "";
    if (msg.role === "user") {
      return `<div class="coach-msg coach-msg-user"><span>${escapeHtml(msg.text)}</span>${time}</div>`;
    }
    if (msg.role === "typing") {
      return `<div class="coach-msg coach-msg-coach"><div class="coach-msg-avatar"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div><span class="coach-typing"><span></span><span></span><span></span></span></div>`;
    }
    if (msg.role === "error") {
      return `<div class="coach-msg coach-msg-error"><span>${escapeHtml(msg.text)}</span>${time}</div>`;
    }
    return `<div class="coach-msg coach-msg-coach"><div class="coach-msg-avatar"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div><span>${escapeHtml(msg.text)}</span>${time}</div>`;
  }).join("");
  container.scrollTop = container.scrollHeight;
}

let showingCoachHistory = false;

function renderCoachHistory() {
  const container = document.getElementById("coachChatHistory");
  if (!container) return;
  const turns = [...historyData.coach].sort((a, b) => a.timestamp - b.timestamp);
  if (turns.length === 0) {
    container.innerHTML = `<div class="coach-chat-empty"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>No past conversations yet</p></div>`;
    return;
  }
  let lastDay = null;
  const parts = [];
  for (const turn of turns) {
    const day = formatChatDay(turn.timestamp);
    if (day !== lastDay) {
      parts.push(`<div class="coach-history-date">${day}</div>`);
      lastDay = day;
    }
    parts.push(`<div class="coach-msg coach-msg-user"><span>${escapeHtml(turn.message)}</span><time class="coach-msg-time">${formatChatTime(turn.timestamp)}</time></div>`);
    parts.push(`<div class="coach-msg coach-msg-coach"><div class="coach-msg-avatar"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div><span>${escapeHtml(turn.response)}</span><time class="coach-msg-time">${formatChatTime(turn.timestamp)}</time></div>`);
  }
  container.innerHTML = parts.join("");
  container.scrollTop = container.scrollHeight;
}

function toggleCoachHistory() {
  showingCoachHistory = !showingCoachHistory;
  const liveEl = document.getElementById("coachChatMessages");
  const histEl = document.getElementById("coachChatHistory");
  const btn = document.getElementById("coachHistoryToggle");
  if (liveEl) liveEl.style.display = showingCoachHistory ? "none" : "";
  if (histEl) histEl.style.display = showingCoachHistory ? "" : "none";
  if (btn) btn.classList.toggle("active", showingCoachHistory);
  if (showingCoachHistory) renderCoachHistory();
}

function useSuggestion(btn) {
  const input = document.getElementById("coachChatInput");
  if (input) { input.value = btn.textContent; input.focus(); }
  const row = document.getElementById("coachSuggestedRow");
  if (row) row.style.display = "none";
}

function updateCoachSidebar() {
  const ftp   = document.getElementById("coachCtxFtp");
  const ready = document.getElementById("coachCtxReadiness");
  const sleep = document.getElementById("coachCtxSleep");
  const load  = document.getElementById("coachCtxLoad");
  const sore  = document.getElementById("coachCtxSoreness");
  if (ftp)   ftp.textContent   = `${state.ftp} W`;
  if (ready) ready.textContent = String(calculateReadiness());
  if (sleep) sleep.textContent = `${state.sleepHours.toFixed(1)}h`;
  if (load)  load.textContent  = `${state.trainingLoad} TSS`;
  if (sore)  sore.textContent  = `${state.soreness}/10`;
}

async function sendCoachMessage() {
  if (!currentUser) return;
  const input = document.getElementById("coachChatInput");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  if (showingCoachHistory) toggleCoachHistory();
  const sendBtn = document.getElementById("coachChatSend");
  sendBtn.disabled = true;
  const sugRow = document.getElementById("coachSuggestedRow");
  if (sugRow) sugRow.style.display = "none";
  coachMessages.push({ role: "user", text: message, ts: Date.now() });
  coachMessages.push({ role: "typing" });
  renderCoachMessages();
  try {
    const context = {
      ftp: state.ftp,
      targetFtp: state.targetFtp,
      readiness: calculateReadiness(),
      sleepHours: state.sleepHours,
      sleepQuality: state.sleepQuality,
      trainingLoad: state.trainingLoad,
      soreness: state.soreness
    };
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentUser.token}` },
      body: JSON.stringify({ message, context })
    });
    const data = await res.json();
    coachMessages.pop();
    coachMessages.push(data.ok
      ? { role: "coach", text: data.response, ts: Date.now() }
      : { role: "error", text: data.error || "Could not reach AI coach.", ts: Date.now() }
    );
    if (data.ok) fetchHistory();
  } catch {
    coachMessages.pop();
    coachMessages.push({ role: "error", text: "Network error. Please try again.", ts: Date.now() });
  }
  renderCoachMessages();
  sendBtn.disabled = false;
  input.focus();
}

// ── Init ──────────────────────────────────────────────────────────────────────

render();
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  const resetToken = params.get("reset");
  if (resetToken) {
    pendingResetToken = resetToken;
    showAuthForm("reset");
    document.getElementById("auth-section").scrollIntoView({ behavior: "smooth" });
  } else {
    checkSession();
  }

  const coachForm = document.getElementById("coachChatForm");
  if (coachForm) {
    coachForm.addEventListener("submit", (e) => {
      e.preventDefault();
      sendCoachMessage(null);
    });
  }

  const coachInput = document.getElementById("coachChatInput");
  if (coachInput) {
    coachInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendCoachMessage(null);
      }
    });
  }
});
