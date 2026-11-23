export const STORAGE_KEY = "sixbirds.bailu-cinema.v1";
export const BACKUP_VERSION = 1;
export const DEFAULT_TICKET_CODE = "0414";
export const MAX_NEWS = 120;
export const MAX_DIARY = 500;
export const MAX_QUOTES = 200;
export const MAX_LINEUP = 50;
export const MAX_RECENT_MEDIA = 24;
export const MAX_PHOTO_DATA_LENGTH = 900000;
export const NEWS_TYPES = Object.freeze(["official", "work", "event", "media", "source", "note"]);
export const MOODS = Object.freeze(["期待", "开心", "感动", "平静", "想哭", "元气"]);
export const LINEUP_KINDS = Object.freeze(["photo", "video"]);
export const ROOMS = Object.freeze([
  { id: "today", label: "今日放映", kicker: "TODAY" },
  { id: "roles", label: "角色宇宙", kicker: "ROLES" },
  { id: "gallery", label: "胶片仓库", kicker: "ARCHIVE" },
  { id: "quotes", label: "鹿语邮局", kicker: "WORDS" },
  { id: "diary", label: "我们的场记", kicker: "DIARY" }
]);

const PHOTO_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function text(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

export function singleLine(value) {
  return text(value).replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
}

export function charLength(value) {
  return [...String(value ?? "")].length;
}

export function toLocalDateKey(now = new Date()) {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDate(value) {
  const raw = singleLine(value);
  if (!DATE_PATTERN.test(raw)) return raw || "未标注日期";
  return raw.replace(/-/g, ".");
}

export function formatLongDate(value) {
  const raw = singleLine(value);
  if (!DATE_PATTERN.test(raw)) return raw || "未标注日期";
  const [year, month, day] = raw.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export function getWeekLabel(now = new Date()) {
  const date = new Date(now);
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function createId(prefix = "id", now = new Date(), random = Math.random) {
  const stamp = new Date(now).getTime().toString(36);
  const suffix = Math.floor(random() * 0xffffff).toString(36).padStart(5, "0");
  return `${prefix}_${stamp}_${suffix}`;
}

export function normalizeUrl(value) {
  const raw = singleLine(value);
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function validDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

export function normalizeNewsItem(input = {}, now = new Date()) {
  const date = singleLine(input.date);
  return {
    id: singleLine(input.id) || createId("news", now),
    date: validDate(date) ? date : toLocalDateKey(now),
    title: singleLine(input.title).slice(0, 80),
    summary: text(input.summary).slice(0, 500),
    source: singleLine(input.source).slice(0, 40),
    url: normalizeUrl(input.url),
    type: NEWS_TYPES.includes(input.type) ? input.type : "note",
    verified: input.verified !== false,
    featured: Boolean(input.featured)
  };
}

export function validateNewsItem(item) {
  const errors = {};
  if (charLength(item.title) < 2) errors.title = "标题至少 2 个字";
  if (charLength(item.title) > 80) errors.title = "标题不能超过 80 字";
  if (!validDate(item.date)) errors.date = "日期必须是 YYYY-MM-DD";
  if (charLength(item.source) < 1) errors.source = "必须写来源";
  if (charLength(item.summary) > 500) errors.summary = "摘要不能超过 500 字";
  if (singleLine(item.url) && !normalizeUrl(item.url)) errors.url = "链接必须是 http 或 https";
  return errors;
}

export function buildNewsItem(input = {}, now = new Date()) {
  const item = normalizeNewsItem(input, now);
  const errors = validateNewsItem(item);
  if (Object.keys(errors).length) {
    const error = new Error("片单内容不完整");
    error.fields = errors;
    throw error;
  }
  return item;
}

function newsKey(item) {
  return item.url ? `url:${item.url}` : `title:${item.date}:${item.title}`;
}

export function sortNews(left, right) {
  const byDate = String(right.date).localeCompare(String(left.date));
  if (byDate) return byDate;
  return String(right.id).localeCompare(String(left.id));
}

export function mergeNews(existing = [], incoming = [], now = new Date()) {
  const map = new Map();
  for (const value of existing) {
    const item = normalizeNewsItem(value, now);
    if (!Object.keys(validateNewsItem(item)).length) map.set(newsKey(item), item);
  }
  for (const value of incoming) {
    const item = normalizeNewsItem(value, now);
    if (Object.keys(validateNewsItem(item)).length) continue;
    const key = newsKey(item);
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].sort(sortNews).slice(0, MAX_NEWS);
}

export function validateNewsPack(payload) {
  if (!payload || typeof payload !== "object") return { ok: false, error: "片单文件不是有效对象" };
  if (!Array.isArray(payload.items)) return { ok: false, error: "片单文件缺少 items 数组" };
  if (payload.items.length > MAX_NEWS) return { ok: false, error: `一次最多导入 ${MAX_NEWS} 条` };
  const items = [];
  for (const [index, raw] of payload.items.entries()) {
    const item = normalizeNewsItem(raw);
    const errors = validateNewsItem(item);
    if (Object.keys(errors).length) {
      return { ok: false, error: `第 ${index + 1} 条：${Object.values(errors)[0]}` };
    }
    items.push(item);
  }
  return {
    ok: true,
    week: singleLine(payload.week) || getWeekLabel(),
    generatedAt: singleLine(payload.generatedAt),
    items
  };
}

export function normalizeLineupItem(input = {}, now = new Date()) {
  const kind = LINEUP_KINDS.includes(input.kind) ? input.kind : "photo";
  return {
    id: singleLine(input.id) || createId("lineup", now),
    kind,
    ref: singleLine(input.ref).slice(0, 400),
    name: singleLine(input.name).slice(0, 80) || (kind === "video" ? "视频" : "照片"),
    src: singleLine(input.src).slice(0, 400),
    addedAt: singleLine(input.addedAt) || new Date(now).toISOString()
  };
}

export function lineupKey(item = {}) {
  return `${item.kind === "video" ? "video" : "photo"}:${singleLine(item.ref) || singleLine(item.src)}`;
}

export function validateLineupItem(item) {
  const errors = {};
  if (!LINEUP_KINDS.includes(item.kind)) errors.kind = "类型只能是照片或视频";
  if (charLength(item.name) < 1) errors.name = "缺少标题";
  if (charLength(item.name) > 80) errors.name = "标题不能超过 80 字";
  if (!singleLine(item.ref) && !singleLine(item.src)) errors.ref = "缺少媒体标识";
  return errors;
}

export function mergeLineup(existing = [], incoming = [], now = new Date()) {
  const map = new Map();
  for (const value of existing) {
    const item = normalizeLineupItem(value, now);
    if (!Object.keys(validateLineupItem(item)).length) map.set(lineupKey(item), item);
  }
  for (const value of incoming) {
    const item = normalizeLineupItem(value, now);
    if (Object.keys(validateLineupItem(item)).length) continue;
    const key = lineupKey(item);
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].slice(0, MAX_LINEUP);
}

export function validateLineupPack(payload) {
  if (!payload || typeof payload !== "object") return { ok: false, error: "片单文件不是有效对象" };
  if (payload.kind !== "my-lineup") return { ok: false, error: "不是「我的本周片单」文件" };
  if (!Array.isArray(payload.items)) return { ok: false, error: "片单文件缺少 items 数组" };
  if (payload.items.length > MAX_LINEUP) return { ok: false, error: `一次最多导入 ${MAX_LINEUP} 条` };
  const items = [];
  for (const [index, raw] of payload.items.entries()) {
    const source = raw && typeof raw === "object" ? raw : {};
    const item = normalizeLineupItem(source);
    if (!singleLine(item.ref) && !singleLine(item.src)) item.ref = "imported";
    const errors = validateLineupItem(item);
    if (Object.keys(errors).length) {
      return { ok: false, error: `第 ${index + 1} 条：${Object.values(errors)[0]}` };
    }
    const dataUrl = typeof source.dataUrl === "string" ? source.dataUrl.trim() : "";
    if (dataUrl) {
      if (charLength(dataUrl) > MAX_PHOTO_DATA_LENGTH) {
        return { ok: false, error: `第 ${index + 1} 条：照片太大` };
      }
      if (!PHOTO_PATTERN.test(dataUrl)) {
        return { ok: false, error: `第 ${index + 1} 条：照片格式不支持` };
      }
    }
    items.push({ ...item, dataUrl, localOnly: Boolean(source.localOnly) });
  }
  return { ok: true, items };
}

export function buildLineupPack(items = [], meta = {}, now = new Date()) {
  return {
    app: "白鹿放映厅",
    kind: "my-lineup",
    version: 1,
    exportedAt: new Date(now).toISOString(),
    ticketCode: singleLine(meta.ticketCode).slice(0, 8),
    items: items.slice(0, MAX_LINEUP)
  };
}

export function normalizeRecentMedia(input = {}) {
  const kind = LINEUP_KINDS.includes(input.kind) ? input.kind : "";
  const ref = singleLine(input.ref).slice(0, 400);
  if (!kind || !ref) return null;
  return {
    kind,
    ref,
    at: singleLine(input.at) || new Date().toISOString()
  };
}

export function pickDailyCard(items = [], now = new Date(), offset = 0) {
  if (!items.length) return null;
  const sorted = [...items].sort(sortNews);
  const featured = sorted.find((item) => item.featured);
  if (featured && offset === 0) return featured;
  const seed = Number(toLocalDateKey(now).replace(/-/g, ""));
  const index = ((seed + Math.max(0, Number(offset) || 0)) % sorted.length + sorted.length) % sorted.length;
  return sorted[index];
}

export function filterRoles(roles = [], filters = {}) {
  const query = singleLine(filters.query).toLowerCase();
  const status = filters.status || "all";
  const watched = new Set(filters.watched || []);
  return [...roles]
    .filter((role) => {
      const isWatched = watched.has(role.id);
      if (status === "watched" && !isWatched) return false;
      if (status === "unwatched" && isWatched) return false;
      if (!query) return true;
      return [role.title, role.role, role.year, role.tagline, role.description, ...(role.tags || [])]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((left, right) => Number(right.year) - Number(left.year) || String(left.title).localeCompare(String(right.title)));
}

export function computeStats(data = {}) {
  const roles = data.roles || [];
  const watched = new Set(data.watched || []);
  const watchedCount = roles.filter((role) => watched.has(role.id)).length;
  return {
    news: (data.news || []).length,
    roles: roles.length,
    watched: watchedCount,
    progress: roles.length ? Math.round((watchedCount / roles.length) * 100) : 0,
    quotes: (data.quotes || []).length,
    diary: (data.diary || []).length,
    photos: (data.photos || []).length,
    videos: (data.videos || []).length
  };
}

export function normalizeQuote(input = {}, now = new Date()) {
  return {
    id: singleLine(input.id) || createId("quote", now),
    text: text(input.text).slice(0, 240),
    source: singleLine(input.source).slice(0, 50) || "未标注来源",
    kind: ["台词", "访谈", "角色关键词", "自己的话"].includes(input.kind) ? input.kind : "自己的话",
    createdAt: singleLine(input.createdAt) || new Date(now).toISOString(),
    seed: Boolean(input.seed)
  };
}

export function validateQuote(quote) {
  const errors = {};
  if (charLength(quote.text) < 2) errors.text = "至少写 2 个字";
  if (charLength(quote.text) > 240) errors.text = "不能超过 240 字";
  if (charLength(quote.source) > 50) errors.source = "来源不能超过 50 字";
  return errors;
}

export function buildQuote(input = {}, now = new Date()) {
  const quote = normalizeQuote(input, now);
  const errors = validateQuote(quote);
  if (Object.keys(errors).length) {
    const error = new Error("鹿语内容不完整");
    error.fields = errors;
    throw error;
  }
  return quote;
}

export function pickQuote(quotes = [], now = new Date(), offset = 0) {
  if (!quotes.length) return null;
  const seed = Number(toLocalDateKey(now).replace(/-/g, ""));
  const index = ((seed + Math.max(0, Number(offset) || 0)) % quotes.length + quotes.length) % quotes.length;
  return quotes[index];
}

export function normalizeDiaryEntry(input = {}, now = new Date()) {
  const rawDate = singleLine(input.date);
  return {
    id: singleLine(input.id) || createId("diary", now),
    date: validDate(rawDate) ? rawDate : toLocalDateKey(now),
    mood: MOODS.includes(input.mood) ? input.mood : "平静",
    title: singleLine(input.title).slice(0, 60),
    text: text(input.text).slice(0, 2000),
    photo: text(input.photo),
    createdAt: singleLine(input.createdAt) || new Date(now).toISOString()
  };
}

export function validateDiaryEntry(entry) {
  const errors = {};
  if (!validDate(entry.date)) errors.date = "日期必须是 YYYY-MM-DD";
  if (charLength(entry.text) < 2) errors.text = "至少写 2 个字";
  if (charLength(entry.text) > 2000) errors.text = "不能超过 2000 字";
  if (charLength(entry.title) > 60) errors.title = "标题不能超过 60 字";
  if (entry.photo) {
    if (charLength(entry.photo) > MAX_PHOTO_DATA_LENGTH) errors.photo = "照片太大，请重新选择";
    else if (!PHOTO_PATTERN.test(entry.photo)) errors.photo = "只支持本地 JPG、PNG、WebP";
  }
  return errors;
}

export function buildDiaryEntry(input = {}, now = new Date()) {
  const entry = normalizeDiaryEntry(input, now);
  const errors = validateDiaryEntry(entry);
  if (Object.keys(errors).length) {
    const error = new Error("场记内容不完整");
    error.fields = errors;
    throw error;
  }
  return entry;
}

export function sortDiary(entries = []) {
  return [...entries].sort((left, right) => {
    const byDate = String(right.date).localeCompare(String(left.date));
    if (byDate) return byDate;
    return String(right.createdAt).localeCompare(String(left.createdAt));
  });
}

export function verifyTicket(code, expected = DEFAULT_TICKET_CODE) {
  const value = singleLine(code).replace(/\s+/g, "");
  const target = singleLine(expected).replace(/\s+/g, "") || DEFAULT_TICKET_CODE;
  if (!value) return { ok: false, easterEgg: false, reason: "请先输入场次号" };
  if (value === target || value === String(Number(target))) {
    return { ok: true, easterEgg: false };
  }
  if (value === "0923") return { ok: true, easterEgg: true };
  return { ok: false, easterEgg: false, reason: "这张票不是这一场的" };
}

export function buildBackup(state, extras = {}, now = new Date()) {
  return {
    app: "白鹿放映厅",
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    state: JSON.parse(JSON.stringify(state)),
    media: extras.media || { photos: [], videos: [] }
  };
}

export function validateBackup(payload) {
  if (!payload || typeof payload !== "object") return { ok: false, error: "备份文件不是有效对象" };
  if (payload.app !== "白鹿放映厅") return { ok: false, error: "不是白鹿放映厅的备份" };
  if (!payload.state || typeof payload.state !== "object") return { ok: false, error: "备份缺少 state" };
  return { ok: true };
}

export function sanitizeFilename(value, fallback = "白鹿放映厅") {
  const clean = singleLine(value)
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return clean || fallback;
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function truncate(value, max = 90) {
  const chars = [...text(value)];
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : chars.join("");
}
