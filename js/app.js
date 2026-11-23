import {
  STORAGE_KEY,
  DEFAULT_TICKET_CODE,
  MAX_LINEUP,
  MAX_RECENT_MEDIA,
  MAX_PHOTO_DATA_LENGTH,
  MOODS,
  ROOMS,
  text,
  singleLine,
  toLocalDateKey,
  formatDate,
  formatLongDate,
  createId,
  normalizeUrl,
  mergeNews,
  validateNewsPack,
  normalizeLineupItem,
  lineupKey,
  mergeLineup,
  validateLineupPack,
  buildLineupPack,
  normalizeRecentMedia,
  pickDailyCard,
  filterRoles,
  computeStats,
  buildQuote,
  pickQuote,
  buildDiaryEntry,
  sortDiary,
  verifyTicket,
  buildBackup,
  validateBackup,
  sanitizeFilename
} from "./core.js?v=86625895b422";
import { SEED, OFFICIAL_SOURCES } from "./seed.js?v=86625895b422";
import { MEDIA } from "./media.js?v=86625895b422";
import {
  getAll,
  put,
  remove,
  clearMedia,
  compressImage,
  readJSONFile,
  downloadBlob,
  downloadJSON,
  downloadDataUrl
} from "./storage.js?v=86625895b422";

const $ = (id) => document.getElementById(id);
const TYPE_LABELS = {
  official: "官方",
  work: "作品",
  event: "活动",
  media: "媒体",
  source: "入口",
  note: "说明"
};
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

let state = loadState();
let media = { photos: [], videos: [] };
let dailyOffset = 0;
let quoteOffset = 0;
let roleFilterStatus = "all";
let roleQuery = "";
let galleryTab = "photos";
let diaryPhotoData = "";
let confirmResolver = null;
let lightboxMedia = null;
let lightboxBlobUrl = "";
let recentMediaCache = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeState(raw) {
  const base = clone(SEED);
  const value = raw && typeof raw === "object" ? raw : {};
  const news = Array.isArray(value.news) ? value.news : base.news;
  return {
    ...base,
    ...value,
    version: 1,
    news: mergeNews(base.news, news),
    roles: Array.isArray(value.roles) && value.roles.length ? value.roles : base.roles,
    quotes: Array.isArray(value.quotes) ? value.quotes : base.quotes,
    diary: Array.isArray(value.diary) ? value.diary : base.diary,
    watched: Array.isArray(value.watched) ? [...new Set(value.watched)] : [],
    myLineup: Array.isArray(value.myLineup)
      ? mergeLineup([], value.myLineup)
      : [],
    recentMedia: Array.isArray(value.recentMedia)
      ? value.recentMedia.map(normalizeRecentMedia).filter(Boolean).slice(0, MAX_RECENT_MEDIA)
      : [],
    favorites: {
      quotes: [],
      photos: [],
      videos: [],
      ...(value.favorites || {})
    },
    settings: {
      motion: "full",
      ...(value.settings || {})
    }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeState(clone(SEED));
    return normalizeState(JSON.parse(raw));
  } catch {
    return normalizeState(clone(SEED));
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    toast("本地存储空间不足，先导出场记并清理旧照片。");
    return false;
  }
}

function el(tag, className = "", value = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== "") node.textContent = value;
  return node;
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function typeLabel(type) {
  return TYPE_LABELS[type] || "说明";
}

function setPill(node, type) {
  node.className = `pill type-${TYPE_LABELS[type] ? type : "note"}`;
  node.textContent = typeLabel(type);
}

function isLocalMediaSrc(src) {
  const value = String(src || "");
  return value.startsWith("data:") || value.startsWith("media/") || value.startsWith("./media/") || value.startsWith("../media/");
}

function toast(message) {
  const node = $("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2600);
}

function isWeChat() {
  return /MicroMessenger/i.test(navigator.userAgent);
}

async function copyText(value) {
  const content = String(value || "").trim();
  if (!content) return false;
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = content;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

function mediaDescriptor(kind, item) {
  if (!item) return null;
  const curated = Boolean(item.curated);
  const ref = curated ? String(item.src || "") : String(item.id || "");
  if (!ref) return null;
  return {
    kind,
    ref,
    name: item.name || (kind === "video" ? "视频" : "照片"),
    src: String(item.src || ""),
    curated
  };
}

function isInLineup(kind, ref) {
  return state.myLineup.some((entry) => entry.kind === kind && entry.ref === ref);
}

function addToLineup(descriptor) {
  if (!descriptor?.ref) return false;
  if (isInLineup(descriptor.kind, descriptor.ref)) {
    toast("已经在本周片单里了");
    return false;
  }
  state.myLineup.unshift(
    normalizeLineupItem({
      kind: descriptor.kind,
      ref: descriptor.ref,
      name: descriptor.name,
      src: descriptor.curated ? descriptor.src : ""
    })
  );
  state.myLineup = state.myLineup.slice(0, MAX_LINEUP);
  saveState();
  renderMyLineup();
  toast("已收进我的本周片单");
  return true;
}

function rememberRecent(kind, ref) {
  const item = normalizeRecentMedia({ kind, ref });
  if (!item) return;
  state.recentMedia = [
    item,
    ...state.recentMedia.filter((entry) => !(entry.kind === item.kind && entry.ref === item.ref))
  ].slice(0, MAX_RECENT_MEDIA);
  saveState();
  renderRecentStrip();
}

function resolveLineupEntry(entry) {
  if (entry.kind === "photo") {
    const found = allPhotos().find((photo) => (photo.curated ? photo.src === entry.ref : photo.id === entry.ref));
    return { entry, media: found, available: Boolean(found) };
  }
  const found = allVideos().find((video) => (video.curated ? video.src === entry.ref : video.id === entry.ref));
  return { entry, media: found, available: Boolean(found) };
}

function openResolvedMedia(kind, item) {
  const descriptor = mediaDescriptor(kind, item);
  openLightbox(item.src, item.name, descriptor);
}

async function attachVideoSource(node, source) {
  if (!source) return false;
  if (source.startsWith("blob:")) {
    node.src = source;
    return true;
  }
  try {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`视频加载失败：${response.status}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    node.src = url;
    if (node.id === "lightboxVideo") lightboxBlobUrl = url;
    return true;
  } catch {
    node.src = source;
    return false;
  }
}

function showApp() {
  $("app").hidden = false;
  $("introOverlay").classList.add("is-hidden");
  $("letterStage").classList.add("is-hidden");
  renderAll();
}

function showIntro() {
  $("app").hidden = true;
  $("letterStage").classList.add("is-hidden");
  $("introOverlay").classList.remove("is-hidden");
  $("ticketError").textContent = "";
  $("ticketCode").value = "";
  setTimeout(() => $("ticketCode").focus(), 80);
}

function showLetter(easterEgg = false) {
  $("letterTitle").textContent = state.letterTitle || "写给你的一封信";
  $("letterBody").textContent = state.letterBody || "";
  $("letterSign").textContent = easterEgg
    ? `第 ${state.ticketCode || DEFAULT_TICKET_CODE} 号观众 · 生日彩蛋场`
    : `第 ${state.ticketCode || DEFAULT_TICKET_CODE} 号观众 · 首映日`;
  $("letterStage").classList.remove("is-hidden");
  setTimeout(() => $("enterCinemaBtn").focus(), 80);
}

function navigate(room) {
  const allowed = ROOMS.some((item) => item.id === room) ? room : "today";
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.dataset.view === allowed);
  });
  document.querySelectorAll("#roomNav button").forEach((button) => {
    if (button.dataset.room === allowed) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (allowed === "gallery") requestAnimationFrame(schedulePhotoLoad);
}

async function loadMedia() {
  try {
    const photos = await getAll("photos");
    const videos = await getAll("videos");
    for (const video of media.videos) {
      if (video.url) URL.revokeObjectURL(video.url);
    }
    media.photos = photos.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    media.videos = videos
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .map((video) => ({ ...video, url: URL.createObjectURL(video.blob) }));
  } catch {
    media = { photos: [], videos: [] };
  }
}

function allPhotos() {
  const curated = (MEDIA.photos || [])
    .filter((photo) => photo && isLocalMediaSrc(photo.src))
    .map((photo) => ({
      id: photo.id || `curated-${photo.src}`,
      name: photo.name || photo.caption || "官方照片",
      src: photo.src,
      thumb: photo.thumb || photo.src,
      blur: photo.blur || "",
      curated: true,
      createdAt: photo.createdAt || ""
    }));
  const user = media.photos.map((photo) => ({
    ...photo,
    src: photo.dataUrl,
    curated: false
  }));
  return [...curated, ...user];
}

function allVideos() {
  const curated = (MEDIA.videos || [])
    .filter((video) => video && isLocalMediaSrc(video.src))
    .map((video) => ({
      id: video.id || `curated-${video.src}`,
      name: video.name || video.caption || "官方视频",
      src: video.src,
      poster: video.poster || "",
      original: video.original || video.src,
      curated: true,
      createdAt: video.createdAt || ""
    }));
  const user = media.videos.map((video) => ({
    ...video,
    src: video.url,
    curated: false
  }));
  return [...curated, ...user];
}

function statData() {
  return computeStats({
    ...state,
    photos: allPhotos(),
    videos: allVideos()
  });
}
function renderStats() {
  const stats = statData();
  $("statRoles").textContent = String(stats.roles);
  $("statWatched").textContent = String(stats.watched);
  $("statNews").textContent = String(stats.news);
  $("statDiary").textContent = String(stats.diary);
  $("roleProgress").textContent = `${stats.progress}%`;
  $("roleProgressBar").style.width = `${stats.progress}%`;
  $("roleProgressText").textContent = `角色观看进度 ${stats.progress}% · ${stats.watched}/${stats.roles}`;
}

function renderToday() {
  $("todayDate").textContent = formatLongDate(toLocalDateKey());
  const feature = pickDailyCard(state.news, new Date(), dailyOffset);
  if (!feature) {
    $("featureType").className = "pill type-note";
    $("featureType").textContent = "休映";
    $("featureTitle").textContent = "今日休映";
    $("featureSummary").textContent = "本周还没有值得放进片单的内容。可以导入一张新片单，或者让今天空着。";
    $("featureSource").textContent = "放映厅说明";
    $("featureDate").textContent = "";
    $("featureLink").hidden = true;
  } else {
    setPill($("featureType"), feature.type);
    $("featureTitle").textContent = feature.title;
    $("featureSummary").textContent = feature.summary || "这条片单没有摘要，点开来源慢慢看。";
    $("featureSource").textContent = feature.source;
    $("featureDate").textContent = formatDate(feature.date);
    const url = normalizeUrl(feature.url);
    $("featureLink").hidden = !url;
    if (url) $("featureLink").href = url;
  }
  renderNews();
}

function renderNews() {
  const grid = $("newsGrid");
  clearNode(grid);
  const items = [...state.news].sort((left, right) => String(right.date).localeCompare(String(left.date)));
  $("newsMeta").textContent = items.length
    ? `${items.length} 条 · 最近更新 ${formatDate(items[0].date)}`
    : "还没有导入片单";
  if (!items.length) {
    const empty = el("div", "empty-state");
    empty.append(
      el("strong", "", "今日休映"),
      el("p", "", "把官方发布的图片、短视频和链接整理成一张片单。没有值得发的资讯时，就让今天空着。")
    );
    const button = el("button", "btn", "导入第一张片单");
    button.type = "button";
    button.addEventListener("click", () => $("newsFileInput").click());
    empty.append(button);
    grid.append(empty);
    return;
  }

  for (const item of items.slice(0, 12)) {
    const card = el("article", "news-card");
    const top = el("div", "news-card-top");
    const pill = el("span", `pill type-${TYPE_LABELS[item.type] ? item.type : "note"}`, typeLabel(item.type));
    top.append(pill, el("span", "news-date", formatDate(item.date)));
    const title = el("h3", "", item.title);
    const summary = el("p", "", item.summary || "点开来源查看原文。");
    const foot = el("div", "news-card-foot");
    foot.append(el("span", "", item.source));
    const url = normalizeUrl(item.url);
    if (url) {
      const link = el("a", "", "查看来源 ↗");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      foot.append(link);
    } else {
      foot.append(el("span", "", "本地片单"));
    }
    card.append(top, title, summary, foot);
    grid.append(card);
  }
}

function renderOfficialSources() {
  const box = $("officialBox");
  if (!box) return;
  clearNode(box);
  box.append(el("h3", "", "官方资讯入口"));
  box.append(
    el(
      "p",
      "official-hint",
      isWeChat()
        ? "微信里打不开时，点「复制」，再到对应 App 里粘贴或搜索。"
        : "点开是各平台官方主页；打不开时点「复制」。"
    )
  );
  for (const source of OFFICIAL_SOURCES) {
    const row = el("div", "official-row");
    const link = el("a", "official-link");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const copy = el("span", "official-copy");
    copy.append(el("span", "official-platform", source.platform));
    const titleRow = el("span", "official-title");
    titleRow.append(el("strong", "official-label", source.label));
    if (source.verified) titleRow.append(el("em", "official-verified", "已认证"));
    copy.append(titleRow);
    copy.append(el("span", "official-note", source.note));
    link.append(copy, el("span", "official-arrow", "↗"));
    const button = el("button", "official-copy-btn", "复制");
    button.type = "button";
    button.dataset.copySource = source.id;
    button.setAttribute("aria-label", `复制${source.platform}${source.label}的链接或账号`);
    row.append(link, button);
    box.append(row);
  }
}

function lineupThumb(kind, item) {
  const button = el("button", "lineup-thumb");
  button.type = "button";
  button.setAttribute("aria-label", item.name || "打开媒体");
  if (kind === "photo") {
    const image = document.createElement("img");
    image.alt = item.name || "照片";
    image.loading = "lazy";
    image.src = item.curated ? item.thumb || item.src : item.dataUrl;
    button.append(image);
  } else if (item.poster) {
    const image = document.createElement("img");
    image.alt = item.name || "视频封面";
    image.loading = "lazy";
    image.src = item.poster;
    button.append(image);
  } else {
    button.append(el("span", "lineup-play", "▶"));
  }
  return button;
}

function renderMyLineup() {
  const grid = $("myLineupGrid");
  const meta = $("myLineupMeta");
  if (!grid || !meta) return;
  meta.textContent = `${state.myLineup.length} 条 · 只保存在这台设备`;
  clearNode(grid);
  if (!state.myLineup.length) {
    const empty = el("div", "empty-state");
    empty.append(
      el("strong", "", "还没有收进片单"),
      el("p", "", "在胶片仓库或最近看过里，点「＋片单」；也可以从手机上传自己的照片和视频。这里的内容不会同步到公网。")
    );
    grid.append(empty);
    renderRecentStrip();
    return;
  }
  for (const entry of state.myLineup) {
    const resolved = resolveLineupEntry(entry);
    const card = el("article", `lineup-card${resolved.available ? "" : " missing"}`);
    if (resolved.available) {
      const mediaItem = resolved.media;
      const thumb = lineupThumb(entry.kind, mediaItem);
      thumb.addEventListener("click", () => openResolvedMedia(entry.kind, mediaItem));
      const info = el("div", "lineup-info");
      info.append(el("strong", "", mediaItem.name || entry.name));
      info.append(el("span", "", entry.kind === "photo" ? "照片" : "视频"));
      const remove = el("button", "text-btn", "移出");
      remove.type = "button";
      remove.dataset.lineupRemove = entry.id;
      card.append(thumb, info, remove);
    } else {
      const missing = el("div", "lineup-thumb lineup-thumb-missing", "已下架");
      const info = el("div", "lineup-info");
      info.append(el("strong", "", entry.name || "未命名"));
      info.append(el("span", "", "文件已删除，建议移出"));
      const remove = el("button", "text-btn", "移出");
      remove.type = "button";
      remove.dataset.lineupRemove = entry.id;
      card.append(missing, info, remove);
    }
    grid.append(card);
  }
  renderRecentStrip();
}

function renderRecentStrip() {
  const wrap = $("recentStripWrap");
  const strip = $("recentStrip");
  if (!wrap || !strip) return;
  clearNode(strip);
  recentMediaCache = [];
  for (const entry of state.recentMedia) {
    if (isInLineup(entry.kind, entry.ref)) continue;
    const resolved = resolveLineupEntry(entry);
    if (!resolved.available) continue;
    const descriptor = mediaDescriptor(entry.kind, resolved.media);
    if (!descriptor) continue;
    const index = recentMediaCache.length;
    recentMediaCache.push(descriptor);
    const button = el("button", "recent-item");
    button.type = "button";
    button.dataset.recentIndex = String(index);
    button.setAttribute("aria-label", `把${descriptor.name}收进片单`);
    if (entry.kind === "photo") {
      const image = document.createElement("img");
      image.alt = descriptor.name;
      image.loading = "lazy";
      image.src = resolved.media.curated ? resolved.media.thumb || resolved.media.src : resolved.media.dataUrl;
      button.append(image);
    } else if (resolved.media.poster) {
      const image = document.createElement("img");
      image.alt = descriptor.name;
      image.loading = "lazy";
      image.src = resolved.media.poster;
      button.append(image);
    } else {
      button.append(el("span", "recent-play", "▶"));
    }
    button.append(el("span", "recent-add", "＋"));
    strip.append(button);
    if (recentMediaCache.length >= 8) break;
  }
  wrap.hidden = recentMediaCache.length === 0;
}

function renderRoles() {
  const grid = $("roleGrid");
  clearNode(grid);
  const roles = filterRoles(state.roles, {
    status: roleFilterStatus,
    query: roleQuery,
    watched: state.watched
  });
  document.querySelectorAll("#roleFilters [data-status]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.status === roleFilterStatus));
  });
  $("roleSearch").value = roleQuery;

  if (!roles.length) {
    const empty = el("div", "empty-state");
    empty.append(
      el("strong", "", "没有找到角色"),
      el("p", "", "换一个关键词，或者把筛选切回“全部”。")
    );
    grid.append(empty);
    return;
  }

  for (const role of roles) {
    const card = el("article", "role-card");
    const poster = el("div", "role-poster");
    poster.append(el("span", "role-year", String(role.year)), el("strong", "", role.title));
    const body = el("div", "role-body");
    body.append(
      el("p", "role-name", role.role),
      el("p", "role-tagline", role.tagline),
      el("p", "role-desc", role.description)
    );
    const tags = el("div", "tag-row");
    for (const tag of role.tags || []) tags.append(el("span", "tag", tag));
    const actions = el("div", "role-actions");
    const watched = state.watched.includes(role.id);
    const button = el("button", "watched-btn", watched ? "已看 ✓" : "标记已看");
    button.type = "button";
    button.setAttribute("aria-pressed", String(watched));
    button.dataset.watchId = role.id;
    actions.append(button);
    const source = normalizeUrl(role.source);
    if (source) {
      const link = el("a", "role-source", "作品资料 ↗");
      link.href = source;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      actions.append(link);
    }
    body.append(tags, actions);
    card.append(poster, body);
    grid.append(card);
  }
}

function updateLightboxLineupButton() {
  const button = $("lightboxLineupBtn");
  if (!button) return;
  if (!lightboxMedia) {
    button.hidden = true;
    return;
  }
  const added = isInLineup(lightboxMedia.kind, lightboxMedia.ref);
  button.hidden = false;
  button.textContent = added ? "✓ 已在本周片单" : "＋ 加入本周片单";
  button.setAttribute("aria-pressed", String(added));
}

function openLightbox(src, alt, descriptor = null) {
  if (!src) return;
  lightboxMedia = descriptor;
  const bar = $("lightboxBar");
  if (bar) bar.hidden = !descriptor;
  const image = $("lightboxImage");
  const video = $("lightboxVideo");
  if (descriptor?.kind === "video") {
    image.hidden = true;
    image.removeAttribute("src");
    video.hidden = false;
    video.pause();
    if (lightboxBlobUrl) {
      URL.revokeObjectURL(lightboxBlobUrl);
      lightboxBlobUrl = "";
    }
    attachVideoSource(video, src).then(() => video.play().catch(() => {}));
  } else {
    video.pause();
    video.hidden = true;
    video.removeAttribute("src");
    if (lightboxBlobUrl) {
      URL.revokeObjectURL(lightboxBlobUrl);
      lightboxBlobUrl = "";
    }
    image.hidden = false;
    image.src = src;
    image.alt = alt || "照片大图";
  }
  $("lightboxTitle").textContent = alt || "";
  updateLightboxLineupButton();
  $("lightbox").classList.remove("is-hidden");
  if (descriptor) rememberRecent(descriptor.kind, descriptor.ref);
}

function closeLightbox() {
  const video = $("lightboxVideo");
  if (video) {
    video.pause();
    video.hidden = true;
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      /* 忽略旧浏览器 */
    }
  }
  if (lightboxBlobUrl) {
    URL.revokeObjectURL(lightboxBlobUrl);
    lightboxBlobUrl = "";
  }
  lightboxMedia = null;
  $("lightbox").classList.add("is-hidden");
}

const PHOTO_EAGER_COUNT = 8;
const PHOTO_LOAD_MARGIN = 800;
let photoLoadTimer = 0;

function loadPhotoElement(image) {
  if (!image?.dataset.src) return;
  const src = image.dataset.src;
  delete image.dataset.src;
  const rect = image.getBoundingClientRect();
  image.fetchPriority = rect.bottom > 0 && rect.top < window.innerHeight ? "high" : "low";
  image.src = src;
}

function loadPhotosNearViewport() {
  const view = document.querySelector("#view-gallery");
  if (!view?.classList.contains("active")) return;
  const viewportCenter = window.innerHeight / 2;
  const candidates = [];
  for (const image of document.querySelectorAll("#photoGrid img[data-src]")) {
    const rect = image.getBoundingClientRect();
    if (rect.bottom >= -PHOTO_LOAD_MARGIN && rect.top <= window.innerHeight + PHOTO_LOAD_MARGIN) {
      candidates.push({
        image,
        distance: Math.abs((rect.top + rect.bottom) / 2 - viewportCenter)
      });
    }
  }
  candidates.sort((left, right) => left.distance - right.distance);
  for (const candidate of candidates) loadPhotoElement(candidate.image);
}

function schedulePhotoLoad() {
  clearTimeout(photoLoadTimer);
  photoLoadTimer = setTimeout(() => {
    photoLoadTimer = 0;
    loadPhotosNearViewport();
  }, 220);
}

function registerPhotoElement(image, src, eager) {
  image.loading = eager ? "eager" : "lazy";
  image.decoding = "async";
  image.fetchPriority = eager ? "high" : "auto";
  if (eager) {
    image.src = src;
    return;
  }
  image.dataset.src = src;
}

function renderGallery() {
  const photos = allPhotos();
  const videos = allVideos();
  $("photoCount").textContent = String(photos.length);
  $("videoCount").textContent = String(videos.length);

  document.querySelectorAll("#view-gallery [data-gallery]").forEach((button) => {
    const active = button.dataset.gallery === galleryTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("#view-gallery [data-gallery-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.galleryPanel === galleryTab);
  });

  const photoGrid = $("photoGrid");
  clearNode(photoGrid);
  if (!photos.length) {
    const empty = el("div", "empty-state");
    empty.append(
      el("strong", "", "胶片仓库还是空的"),
      el("p", "", "家人还没有发布照片。网页里添加的照片只保存在这台设备；要让所有设备都看到，请把照片交给发布工具。")
    );
    const button = el("button", "btn", "添加第一张照片");
    button.type = "button";
    button.addEventListener("click", () => $("photoFileInput").click());
    empty.append(button);
    photoGrid.append(empty);
  } else {
    photos.forEach((photo, index) => {
      const card = el("article", "media-card photo");
      const image = document.createElement("img");
      image.alt = photo.name || "照片";
      image.style.color = "transparent";
      if (photo.blur) {
        image.style.backgroundImage = `url("${photo.blur}")`;
        image.style.backgroundSize = "cover";
        image.style.backgroundPosition = "center";
      }
      image.fetchPriority = index < 4 ? "high" : "auto";
      registerPhotoElement(image, photo.thumb || photo.src, index < PHOTO_EAGER_COUNT || !photo.curated);
      image.addEventListener("click", () => openLightbox(photo.src, photo.name, mediaDescriptor("photo", photo)));
      image.addEventListener("error", () => {
        image.replaceWith(el("div", "media-placeholder", "照片文件未找到\n请检查 media/photos"));
      });
      const overlay = el("div", "media-overlay");
      overlay.append(el("span", "", photo.name || "未命名照片"));
      const buttons = el("span", "");
      const add = el("button", "", "＋");
      add.type = "button";
      add.title = "加入本周片单";
      add.setAttribute("aria-label", "把这张照片加入我的本周片单");
      add.addEventListener("click", (event) => {
        event.stopPropagation();
        addToLineup(mediaDescriptor("photo", photo));
      });
      buttons.append(add);
      const favorite = el("button", "", isFavorite("photos", photo.id) ? "♥" : "♡");
      favorite.type = "button";
      favorite.setAttribute("aria-label", "收藏照片");
      favorite.setAttribute("aria-pressed", String(isFavorite("photos", photo.id)));
      favorite.dataset.photoFav = photo.id;
      buttons.append(favorite);
      if (!photo.curated) {
        const del = el("button", "", "×");
        del.type = "button";
        del.setAttribute("aria-label", "删除照片");
        del.dataset.photoDel = photo.id;
        buttons.append(del);
      }
      overlay.append(buttons);
      card.append(image, overlay);
      photoGrid.append(card);
    });
  }

  requestAnimationFrame(schedulePhotoLoad);

  const videoGrid = $("videoGrid");
  clearNode(videoGrid);
  if (!videos.length) {
    const empty = el("div", "empty-state");
    empty.append(
      el("strong", "", "还没有视频"),
      el("p", "", "家人还没有发布视频。网页里添加的视频只保存在这台设备；要让所有设备都看到，请把视频交给发布工具。")
    );
    const button = el("button", "btn", "添加第一段视频");
    button.type = "button";
    button.addEventListener("click", () => $("videoFileInput").click());
    empty.append(button);
    videoGrid.append(empty);
  } else {
    for (const video of videos) {
      const card = el("article", "media-card video");
      const node = document.createElement("video");
      node.dataset.src = video.src;
      node.controls = false;
      node.preload = "none";
      node.playsInline = true;
      node.setAttribute("playsinline", "");
      node.setAttribute("webkit-playsinline", "");
      node.setAttribute("x5-playsinline", "");
      if (galleryTab === "videos" && video.poster) node.poster = video.poster;
      const playBadge = el("span", "video-play-badge", "▶ 点击播放");
      const startVideo = async () => {
        if (node.src || !node.dataset.src) return;
        const source = node.dataset.src;
        delete node.dataset.src;
        node.controls = true;
        playBadge.textContent = "正在加载…";
        await attachVideoSource(node, source);
        playBadge.remove();
        node.play().catch(() => {});
        const descriptor = mediaDescriptor("video", video);
        if (descriptor) rememberRecent("video", descriptor.ref);
      };
      node.addEventListener("click", startVideo);
      node.setAttribute("aria-label", video.name || "视频");
      const overlay = el("div", "media-overlay");
      overlay.append(el("span", "", video.name || "未命名视频"));
      const buttons = el("span", "");
      const add = el("button", "", "＋");
      add.type = "button";
      add.title = "加入本周片单";
      add.setAttribute("aria-label", "把这段视频加入我的本周片单");
      add.addEventListener("click", (event) => {
        event.stopPropagation();
        addToLineup(mediaDescriptor("video", video));
      });
      buttons.append(add);
      const favorite = el("button", "", isFavorite("videos", video.id) ? "♥" : "♡");
      favorite.type = "button";
      favorite.setAttribute("aria-label", "收藏视频");
      favorite.setAttribute("aria-pressed", String(isFavorite("videos", video.id)));
      favorite.dataset.videoFav = video.id;
      buttons.append(favorite);
      if (!video.curated) {
        const download = el("button", "", "↓");
        download.type = "button";
        download.setAttribute("aria-label", "下载视频");
        download.dataset.videoDownload = video.id;
        buttons.append(download);
        const del = el("button", "", "×");
        del.type = "button";
        del.setAttribute("aria-label", "删除视频");
        del.dataset.videoDel = video.id;
        buttons.append(del);
      }
      overlay.append(buttons);
      card.append(node, playBadge, overlay);
      videoGrid.append(card);
    }
  }
}

function isFavorite(kind, id) {
  const list = state.favorites?.[kind] || [];
  return list.includes(id);
}

function toggleFavorite(kind, id) {
  if (!state.favorites[kind]) state.favorites[kind] = [];
  const list = state.favorites[kind];
  const index = list.indexOf(id);
  if (index >= 0) list.splice(index, 1);
  else list.push(id);
  saveState();
  renderGallery();
  renderQuotes();
}

function renderQuotes() {
  const quote = pickQuote(state.quotes, new Date(), quoteOffset);
  if (quote) {
    $("quoteFeatureText").textContent = quote.text;
    $("quoteFeatureMeta").textContent = `${quote.kind} · ${quote.source}`;
  } else {
    $("quoteFeatureText").textContent = "还没有收藏句子。先放一句进来。";
    $("quoteFeatureMeta").textContent = "鹿语邮局";
  }
  $("quoteMeta").textContent = `${state.quotes.length} 句`;
  const grid = $("quoteGrid");
  clearNode(grid);
  if (!state.quotes.length) {
    grid.append(el("div", "empty-state", "邮局还没有信。"));
    return;
  }
  for (const item of state.quotes) {
    const card = el("article", "quote-card");
    const content = el("p", "", item.text);
    const foot = el("footer");
    foot.append(el("span", "", `${item.kind} · ${item.source}`));
    const actions = el("span", "");
    const favorite = el("button", "", isFavorite("quotes", item.id) ? "♥" : "♡");
    favorite.type = "button";
    favorite.setAttribute("aria-label", "收藏句子");
    favorite.setAttribute("aria-pressed", String(isFavorite("quotes", item.id)));
    favorite.dataset.quoteFav = item.id;
    actions.append(favorite);
    if (!item.seed) {
      const del = el("button", "", "×");
      del.type = "button";
      del.setAttribute("aria-label", "删除句子");
      del.dataset.quoteDel = item.id;
      actions.append(del);
    }
    foot.append(actions);
    card.append(content, foot);
    grid.append(card);
  }
}

function renderDiary() {
  const list = $("diaryList");
  clearNode(list);
  const entries = sortDiary(state.diary);
  if (!entries.length) {
    const empty = el("div", "empty-state");
    empty.append(
      el("strong", "", "场记本还是空的"),
      el("p", "", "写下第一场。这里不需要写得好，只要写下来。")
    );
    list.append(empty);
    return;
  }
  for (const entry of entries) {
    const card = el("article", "diary-entry");
    const left = el("div", "diary-date");
    left.append(el("span", "", formatDate(entry.date)), el("span", "diary-mood", entry.mood));
    const content = el("div", "diary-content");
    content.append(el("h3", "", entry.title || "无题"), el("p", "", entry.text));
    if (entry.photo) {
      const image = document.createElement("img");
      image.className = "diary-photo";
      image.src = entry.photo;
      image.alt = `${entry.title || "场记"}的照片`;
      image.loading = "lazy";
      image.addEventListener("click", () => openLightbox(entry.photo, entry.title || "场记照片"));
      content.append(image);
    }
    const foot = el("div", "diary-entry-foot");
    const del = el("button", "text-btn", "删除这场");
    del.type = "button";
    del.dataset.diaryDel = entry.id;
    foot.append(del);
    content.append(foot);
    card.append(left, content);
    list.append(card);
  }
}

function renderTicketLabels() {
  const code = state.ticketCode || DEFAULT_TICKET_CODE;
  $("brandCode").textContent = `PRIVATE SCREENING ROOM · NO.${code}`;
  $("footerTicket").textContent = `白鹿私人放映厅 · 第 ${code} 号观众`;
  $("introReelCode").textContent = "NO.1";
  $("introFoot").textContent = "仅限家人 · 请勿转发链接";
  document.title = `白鹿私人放映厅 · 第 ${code} 号观众`;
}

function renderSettings() {
  $("settingsName").value = state.daughterName || "";
  $("settingsCode").value = state.ticketCode || DEFAULT_TICKET_CODE;
  $("settingsLetterTitle").value = state.letterTitle || "";
  $("settingsLetterBody").value = state.letterBody || "";
  renderTicketLabels();
}

function renderAll() {
  renderToday();
  renderOfficialSources();
  renderMyLineup();
  renderStats();
  renderRoles();
  renderGallery();
  renderQuotes();
  renderDiary();
  renderSettings();
}
function askConfirm(title, message) {
  $("confirmTitle").textContent = title;
  $("confirmText").textContent = message;
  $("confirmModal").classList.remove("is-hidden");
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function finishConfirm(value) {
  $("confirmModal").classList.add("is-hidden");
  if (confirmResolver) {
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve(value);
  }
}

function closeSettings() {
  $("settingsModal").classList.add("is-hidden");
}

async function deletePhoto(id) {
  const ok = await askConfirm("删除这张照片？", "照片会从本机媒体库删除，操作不可撤销。");
  if (!ok) return;
  await remove("photos", id);
  await loadMedia();
  renderGallery();
  renderStats();
  toast("照片已删除");
}

async function deleteVideo(id) {
  const ok = await askConfirm("删除这段视频？", "视频会从本机媒体库删除，操作不可撤销。");
  if (!ok) return;
  await remove("videos", id);
  await loadMedia();
  renderGallery();
  renderStats();
  toast("视频已删除");
}

async function addPhotoFile(file, options = {}) {
  if (!file) return null;
  try {
    let dataUrl = await compressImage(file, { maxWidth: 1600, quality: 0.82 });
    if (dataUrl.length > MAX_PHOTO_DATA_LENGTH) {
      dataUrl = await compressImage(file, { maxWidth: 1200, quality: 0.72 });
    }
    if (dataUrl.length > MAX_PHOTO_DATA_LENGTH) throw new Error("照片压缩后仍然太大，请换一张更小的图");
    const created = {
      id: createId("photo"),
      name: file.name || "本地照片",
      dataUrl,
      createdAt: new Date().toISOString(),
      size: file.size
    };
    await put("photos", created);
    await loadMedia();
    galleryTab = "photos";
    renderGallery();
    renderStats();
    if (options.addToLineup) addToLineup(mediaDescriptor("photo", created));
    toast(options.addToLineup ? "照片已加入我的本周片单" : "照片已放进胶片仓库");
    return created;
  } catch (error) {
    toast(error.message || "照片添加失败");
    return null;
  }
}

async function addVideoFile(file, options = {}) {
  if (!file) return null;
  if (file.size > MAX_VIDEO_BYTES) {
    toast("视频超过 300MB，请放进 media/videos 文件夹管理");
    return null;
  }
  try {
    const created = {
      id: createId("video"),
      name: file.name || "本地视频",
      blob: file,
      size: file.size,
      type: file.type || "video/mp4",
      createdAt: new Date().toISOString()
    };
    await put("videos", created);
    await loadMedia();
    galleryTab = "videos";
    renderGallery();
    renderStats();
    if (options.addToLineup) addToLineup(mediaDescriptor("video", created));
    toast(options.addToLineup ? "视频已加入我的本周片单" : "视频已放进胶片仓库");
    return created;
  } catch (error) {
    toast(error.message || "视频添加失败");
    return null;
  }
}

async function importNewsFile(file) {
  if (!file) return;
  try {
    const payload = await readJSONFile(file);
    const result = validateNewsPack(payload);
    if (!result.ok) throw new Error(result.error);
    const before = state.news.length;
    state.news = mergeNews(state.news, result.items);
    saveState();
    dailyOffset = 0;
    renderAll();
    toast(`本周片单已导入，新增 ${Math.max(0, state.news.length - before)} 条`);
  } catch (error) {
    toast(error.message || "片单导入失败");
  }
}

function exportMyLineup() {
  if (!state.myLineup.length) {
    toast("我的片单还是空的");
    return;
  }
  const items = [];
  let missing = 0;
  let localVideos = 0;
  for (const entry of state.myLineup) {
    const resolved = resolveLineupEntry(entry);
    if (!resolved.available) {
      missing += 1;
      continue;
    }
    const mediaItem = resolved.media;
    if (entry.kind === "photo" && !mediaItem.curated) {
      items.push({ kind: "photo", name: mediaItem.name, dataUrl: mediaItem.dataUrl });
    } else if (entry.kind === "video" && !mediaItem.curated) {
      items.push({ kind: "video", name: mediaItem.name, localOnly: true });
      localVideos += 1;
    } else {
      items.push({ kind: entry.kind, name: mediaItem.name, src: entry.ref });
    }
  }
  const payload = buildLineupPack(items, { ticketCode: state.ticketCode });
  downloadJSON(`白鹿我的片单-${toLocalDateKey()}.json`, payload);
  toast(
    missing
      ? `片单已导出；${missing} 条已下架的内容没有写入`
      : localVideos
        ? `片单已导出；${localVideos} 段本机视频只记录名称，换设备后需要重新上传`
        : "片单已导出"
  );
}

async function importLineupFile(file) {
  if (!file) return;
  try {
    const payload = await readJSONFile(file);
    const result = validateLineupPack(payload);
    if (!result.ok) throw new Error(result.error);
    const existing = new Set(state.myLineup.map((entry) => lineupKey(entry)));
    let added = 0;
    let skipped = 0;
    for (const item of result.items) {
      if (item.localOnly) {
        skipped += 1;
        continue;
      }
      let ref = item.ref || item.src;
      if (item.dataUrl) {
        const created = {
          id: createId("photo"),
          name: item.name,
          dataUrl: item.dataUrl,
          createdAt: new Date().toISOString(),
          size: 0
        };
        await put("photos", created);
        ref = created.id;
      }
      if (!ref) {
        skipped += 1;
        continue;
      }
      const key = `${item.kind}:${ref}`;
      if (existing.has(key)) {
        skipped += 1;
        continue;
      }
      state.myLineup.push(
        normalizeLineupItem({ kind: item.kind, ref, name: item.name, src: item.src })
      );
      existing.add(key);
      added += 1;
    }
    state.myLineup = state.myLineup.slice(0, MAX_LINEUP);
    await loadMedia();
    saveState();
    renderAll();
    toast(`片单已导入：新增 ${added} 条${skipped ? `，跳过 ${skipped} 条` : ""}`);
  } catch (error) {
    toast(error.message || "片单导入失败");
  }
}

function exportAllData() {
  const videosMeta = media.videos.map(({ id, name, size, type, createdAt }) => ({ id, name, size, type, createdAt }));
  const payload = buildBackup(state, {
    media: {
      photos: media.photos,
      videos: videosMeta
    }
  });
  downloadJSON(`白鹿放映厅-备份-${toLocalDateKey()}.json`, payload);
  toast("备份已导出；视频请另外在胶片仓库逐个下载");
}

async function importBackupFile(file) {
  if (!file) return;
  try {
    const payload = await readJSONFile(file);
    const check = validateBackup(payload);
    if (!check.ok) throw new Error(check.error);
    const nextState = normalizeState(payload.state);
    nextState.unlocked = true;
    state = nextState;
    saveState();
    await clearMedia();
    const photos = Array.isArray(payload.media?.photos) ? payload.media.photos : [];
    for (const photo of photos) {
      if (!photo?.dataUrl || !String(photo.dataUrl).startsWith("data:") || !String(photo.dataUrl).includes(";base64,")) continue;
      await put("photos", {
        id: photo.id || createId("photo"),
        name: photo.name || "备份照片",
        dataUrl: photo.dataUrl,
        createdAt: photo.createdAt || new Date().toISOString(),
        size: photo.size || 0
      });
    }
    await loadMedia();
    renderAll();
    showApp();
    toast("备份已恢复；视频文件需要从原文件夹重新放入");
  } catch (error) {
    toast(error.message || "备份恢复失败");
  }
}

function exportMediaFiles() {
  const photos = media.photos;
  const videos = media.videos;
  if (!photos.length && !videos.length) {
    toast("还没有需要导出的本地媒体");
    return;
  }
  for (const photo of photos) {
    const name = sanitizeFilename(photo.name || "照片").replace(/\.(jpe?g|png|webp)$/i, "");
    downloadDataUrl(`${name}.jpg`, photo.dataUrl);
  }
  for (const video of videos) {
    downloadBlob(sanitizeFilename(video.name || "视频", "视频.mp4"), video.blob);
  }
  toast("已开始导出本地媒体；浏览器可能会询问是否允许多个下载");
}

async function clearAllData() {
  const ok = await askConfirm(
    "清空全部数据？",
    "会删除本机保存的片单、角色进度、鹿语、场记、照片和视频。操作不可撤销，建议先导出备份。"
  );
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  await clearMedia();
  for (const video of media.videos) if (video.url) URL.revokeObjectURL(video.url);
  state = normalizeState(clone(SEED));
  state.unlocked = false;
  media = { photos: [], videos: [] };
  saveState();
  renderAll();
  showIntro();
  toast("放映厅已清空，可以从头开始");
}

function saveSettings() {
  const code = singleLine($("settingsCode").value).replace(/\s+/g, "") || DEFAULT_TICKET_CODE;
  if (!/^[0-9A-Za-z]{1,8}$/.test(code)) {
    toast("场次号只能是 1–8 位数字或字母");
    return;
  }
  state.daughterName = singleLine($("settingsName").value) || "亲爱的女儿";
  state.ticketCode = code;
  state.letterTitle = singleLine($("settingsLetterTitle").value) || "写给你的一封信";
  state.letterBody = text($("settingsLetterBody").value) || clone(SEED).letterBody;
  saveState();
  renderSettings();
  closeSettings();
  toast("设置已保存；票根上的场次号也要改成一致");
}

function printDiary() {
  const month = toLocalDateKey().slice(0, 7);
  const entries = sortDiary(state.diary).filter((entry) => String(entry.date).startsWith(month));
  if (!entries.length) {
    toast("本月还没有场记");
    return;
  }
  const area = $("printArea");
  clearNode(area);
  const title = el("h1", "", `${state.daughterName}的观影场记`);
  const meta = el("p", "", `${month.replace("-", "年")}月 · 共 ${entries.length} 场 · 仅限家庭私密打印`);
  area.append(title, meta);
  for (const entry of entries) {
    const block = el("div", "print-entry");
    block.append(el("h2", "", entry.title || "无题"), el("p", "", `${formatLongDate(entry.date)} · ${entry.mood}`));
    const content = el("p", "", entry.text);
    block.append(content);
    if (entry.photo) {
      const image = document.createElement("img");
      image.src = entry.photo;
      image.alt = entry.title || "场记照片";
      image.style.maxWidth = "120mm";
      image.style.maxHeight = "100mm";
      image.style.marginTop = "4mm";
      block.append(image);
    }
    area.append(block);
  }
  window.print();
}

function handleTicketSubmit(event) {
  event.preventDefault();
  const result = verifyTicket($("ticketCode").value, state.ticketCode);
  if (!result.ok) {
    $("ticketError").textContent = result.reason || "场次号不正确";
    $("ticketCode").select();
    return;
  }
  state.unlocked = true;
  state.introSeen = true;
  saveState();
  $("introOverlay").classList.add("is-hidden");
  showLetter(result.easterEgg);
}

function bindEvents() {
  $("ticketForm").addEventListener("submit", handleTicketSubmit);
  $("enterCinemaBtn").addEventListener("click", showApp);
  document.addEventListener("scroll", schedulePhotoLoad, { passive: true, capture: true });
  window.addEventListener("resize", schedulePhotoLoad, { passive: true });
  $("roomNav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-room]");
    if (button) navigate(button.dataset.room);
  });

  $("brandHome").addEventListener("click", (event) => {
    event.preventDefault();
    navigate("today");
  });

  $("shuffleBtn").addEventListener("click", () => {
    dailyOffset += 1;
    renderToday();
  });

  $("quoteShuffleBtn").addEventListener("click", () => {
    quoteOffset += 1;
    renderQuotes();
  });

  $("importNewsBtn").addEventListener("click", () => $("newsFileInput").click());
  $("openUpdateBtn").addEventListener("click", () => $("newsFileInput").click());
  $("newsFileInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    await importNewsFile(file);
    event.target.value = "";
  });
  $("openLineupBtn").addEventListener("click", () => {
    navigate("today");
    $("myLineupSection").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("lineupPhotoBtn").addEventListener("click", () => $("lineupPhotoInput").click());
  $("lineupVideoBtn").addEventListener("click", () => $("lineupVideoInput").click());
  $("lineupPhotoInput").addEventListener("change", async (event) => {
    await addPhotoFile(event.target.files?.[0], { addToLineup: true });
    event.target.value = "";
  });
  $("lineupVideoInput").addEventListener("change", async (event) => {
    await addVideoFile(event.target.files?.[0], { addToLineup: true });
    event.target.value = "";
  });
  $("exportLineupBtn").addEventListener("click", exportMyLineup);
  $("importLineupBtn").addEventListener("click", () => $("lineupFileInput").click());
  $("lineupFileInput").addEventListener("change", async (event) => {
    await importLineupFile(event.target.files?.[0]);
    event.target.value = "";
  });
  $("myLineupGrid").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-lineup-remove]");
    if (!removeButton) return;
    state.myLineup = state.myLineup.filter((entry) => entry.id !== removeButton.dataset.lineupRemove);
    saveState();
    renderMyLineup();
    toast("已从我的片单移出");
  });
  $("recentStrip").addEventListener("click", (event) => {
    const button = event.target.closest("[data-recent-index]");
    if (!button) return;
    const descriptor = recentMediaCache[Number(button.dataset.recentIndex)];
    if (descriptor) addToLineup(descriptor);
  });
  $("officialBox").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-source]");
    if (!button) return;
    const source = OFFICIAL_SOURCES.find((item) => item.id === button.dataset.copySource);
    if (!source) return;
    const value = source.copy || source.url;
    const ok = await copyText(value);
    toast(
      ok
        ? source.copyKind === "id"
          ? `已复制${source.platform}号：${value}，去 App 搜索`
          : `已复制链接：${value}`
        : "复制失败，请长按链接手动复制"
    );
  });

  $("settingsBtn").addEventListener("click", () => {
    renderSettings();
    $("settingsModal").classList.remove("is-hidden");
  });
  $("closeSettingsBtn").addEventListener("click", closeSettings);
  $("closeSettingsBtn2").addEventListener("click", closeSettings);
  $("settingsModal").addEventListener("click", (event) => {
    if (event.target === $("settingsModal")) closeSettings();
  });
  $("saveSettingsBtn").addEventListener("click", saveSettings);
  $("replayIntroBtn").addEventListener("click", () => {
    closeSettings();
    state.unlocked = false;
    saveState();
    showIntro();
  });
  $("exportAllBtn").addEventListener("click", exportAllData);
  $("exportAllBtnInline").addEventListener("click", exportAllData);
  $("importBackupBtn").addEventListener("click", () => $("backupFileInput").click());
  $("backupFileInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    await importBackupFile(file);
    event.target.value = "";
  });
  $("exportMediaBtn").addEventListener("click", exportMediaFiles);
  $("clearAllBtn").addEventListener("click", clearAllData);

  $("roleFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-status]");
    if (!button) return;
    roleFilterStatus = button.dataset.status || "all";
    renderRoles();
  });
  $("roleSearch").addEventListener("input", (event) => {
    roleQuery = event.target.value;
    renderRoles();
  });
  $("roleGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-watch-id]");
    if (!button) return;
    const id = button.dataset.watchId;
    const index = state.watched.indexOf(id);
    if (index >= 0) state.watched.splice(index, 1);
    else state.watched.push(id);
    saveState();
    renderRoles();
    renderStats();
  });

  document.querySelectorAll("#view-gallery [data-gallery]").forEach((button) => {
    button.addEventListener("click", () => {
      galleryTab = button.dataset.gallery || "photos";
      renderGallery();
    });
  });
  $("addPhotoBtn").addEventListener("click", () => $("photoFileInput").click());
  $("addVideoBtn").addEventListener("click", () => $("videoFileInput").click());
  $("photoFileInput").addEventListener("change", async (event) => {
    await addPhotoFile(event.target.files?.[0]);
    event.target.value = "";
  });
  $("videoFileInput").addEventListener("change", async (event) => {
    await addVideoFile(event.target.files?.[0]);
    event.target.value = "";
  });
  $("photoGrid").addEventListener("click", (event) => {
    const fav = event.target.closest("[data-photo-fav]");
    if (fav) {
      toggleFavorite("photos", fav.dataset.photoFav);
      return;
    }
    const del = event.target.closest("[data-photo-del]");
    if (del) deletePhoto(del.dataset.photoDel);
  });
  $("videoGrid").addEventListener("click", (event) => {
    const fav = event.target.closest("[data-video-fav]");
    if (fav) {
      toggleFavorite("videos", fav.dataset.videoFav);
      return;
    }
    const download = event.target.closest("[data-video-download]");
    if (download) {
      const video = media.videos.find((item) => item.id === download.dataset.videoDownload);
      if (video) downloadBlob(sanitizeFilename(video.name || "视频.mp4"), video.blob);
      return;
    }
    const del = event.target.closest("[data-video-del]");
    if (del) deleteVideo(del.dataset.videoDel);
  });

  $("quoteForm").addEventListener("submit", (event) => {
    event.preventDefault();
    $("quoteTextError").textContent = "";
    try {
      const quote = buildQuote({
        text: $("quoteText").value,
        source: $("quoteSource").value,
        kind: $("quoteKind").value
      });
      state.quotes.unshift(quote);
      saveState();
      $("quoteForm").reset();
      renderQuotes();
      renderStats();
      toast("已放进鹿语邮局");
    } catch (error) {
      $("quoteTextError").textContent = error.fields?.text || error.message || "内容不完整";
    }
  });
  $("quoteGrid").addEventListener("click", async (event) => {
    const fav = event.target.closest("[data-quote-fav]");
    if (fav) {
      toggleFavorite("quotes", fav.dataset.quoteFav);
      return;
    }
    const del = event.target.closest("[data-quote-del]");
    if (!del) return;
    const ok = await askConfirm("删除这句话？", "这句话会从本机收藏中移除。");
    if (!ok) return;
    state.quotes = state.quotes.filter((item) => item.id !== del.dataset.quoteDel);
    saveState();
    renderQuotes();
    renderStats();
    toast("已删除");
  });

  $("chooseDiaryPhotoBtn").addEventListener("click", () => $("diaryPhotoInput").click());
  $("diaryPhotoInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      diaryPhotoData = await compressImage(file, { maxWidth: 1400, quality: 0.78 });
      if (diaryPhotoData.length > MAX_PHOTO_DATA_LENGTH) throw new Error("照片太大，请换一张");
      $("diaryPhotoPreview").src = diaryPhotoData;
      $("diaryPhotoPreview").hidden = false;
      $("removeDiaryPhotoBtn").hidden = false;
    } catch (error) {
      toast(error.message || "照片读取失败");
    }
  });
  $("removeDiaryPhotoBtn").addEventListener("click", () => {
    diaryPhotoData = "";
    $("diaryPhotoPreview").hidden = true;
    $("diaryPhotoPreview").removeAttribute("src");
    $("removeDiaryPhotoBtn").hidden = true;
  });
  $("diaryForm").addEventListener("submit", (event) => {
    event.preventDefault();
    $("diaryTextError").textContent = "";
    try {
      const entry = buildDiaryEntry({
        date: $("diaryDate").value,
        mood: $("diaryMood").value,
        title: $("diaryTitle").value,
        text: $("diaryText").value,
        photo: diaryPhotoData
      });
      state.diary.unshift(entry);
      saveState();
      resetDiaryForm();
      renderDiary();
      renderStats();
      toast("这场已记下");
    } catch (error) {
      $("diaryTextError").textContent = error.fields?.text || error.message || "内容不完整";
    }
  });
  $("diaryForm").addEventListener("reset", () => setTimeout(resetDiaryForm, 0));
  $("diaryList").addEventListener("click", async (event) => {
    const del = event.target.closest("[data-diary-del]");
    if (!del) return;
    const ok = await askConfirm("删除这场场记？", "删除后不可恢复。");
    if (!ok) return;
    state.diary = state.diary.filter((entry) => entry.id !== del.dataset.diaryDel);
    saveState();
    renderDiary();
    renderStats();
    toast("已删除这场");
  });
  $("printDiaryBtn").addEventListener("click", printDiary);

  $("confirmCancel").addEventListener("click", () => finishConfirm(false));
  $("confirmOk").addEventListener("click", () => finishConfirm(true));
  $("confirmModal").addEventListener("click", (event) => {
    if (event.target === $("confirmModal")) finishConfirm(false);
  });
  $("lightboxClose").addEventListener("click", closeLightbox);
  $("lightbox").addEventListener("click", (event) => {
    if (event.target === $("lightbox")) closeLightbox();
  });
  $("lightboxLineupBtn").addEventListener("click", () => {
    if (!lightboxMedia) return;
    addToLineup(lightboxMedia);
    updateLightboxLineupButton();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeLightbox();
    closeSettings();
    if (confirmResolver) finishConfirm(false);
  });
}

function resetDiaryForm() {
  $("diaryForm").reset();
  $("diaryDate").value = toLocalDateKey();
  $("diaryMood").value = "期待";
  $("diaryTextError").textContent = "";
  diaryPhotoData = "";
  $("diaryPhotoPreview").hidden = true;
  $("diaryPhotoPreview").removeAttribute("src");
  $("removeDiaryPhotoBtn").hidden = true;
}

async function init() {
  const params = new URLSearchParams(location.search);
  if (params.has("demo")) {
    state = normalizeState(clone(SEED));
    saveState();
  }
  await loadMedia();
  bindEvents();
  resetDiaryForm();
  $("todayDate").textContent = formatLongDate(toLocalDateKey());
  if (state.unlocked) showApp();
  else showIntro();
}

init();
