// 장면 (짧은 연출 장면): 그림 몇 장과 가벼운 움직임으로 만든다 (러스티 레이크 방식). 게임 공통 데이터의 "scenes" 에 둔다.
//   "scenes": {"r5_owl_wakes": {"name": "부엉이가 깨어남", "letterbox": true, "skip": true, "shots": [컷, ...]}}
//   컷: {"bg": 그림 경로 | "@room" (지금 게임 화면) | "#000000" (색), "anim": 애니메이션, "time": 길이(초),
//        "in": "cut" | "fade" | "black", "in_time": 초, "camera": {"from": [x, y, 배율], "to": [...], "ease", "at", "time"},
//        "layers": [{"image" | "anim", "rect": [x, y, 가로, 세로], "to", "at", "time", "end", "fade_in", "fade_out", "flip", "ease"}],
//        "say": [{"at", "text", "time"}], "sound": [{"at", "path", "volume"}], "shake": [{"at", "strength", "time"}], "flash": [{"at", "color", "time"}]}
// 할 일: {"scene": "아이디"} (장면 틀기). 게임 쪽은 Scripts/hud/story_scene.gd (계산), Scripts/hud/story_scene_player.gd (재생).
// 아래의 계산(normScene, frameAt, cameraAt, layerAt, sayAt ...)은 게임과 같아야 한다. 하나를 고치면 다른 쪽도 고친다.
import { S, h, toast, modal, ask, asset, gameFile, markDirty, GAME_FILE, names, matchText } from "./core.js";
import { josa } from "./words.js";
import { animOf, frameAt as animFrameAt, animField, animName, animHooks, pickAnim } from "./anims.js";

// 빈 칸(null)은 빼고 채운다
const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));

export const W = 1720, H = 1080;
export const INTRO = 0.45, OUTRO = 0.5, SKIP_OUTRO = 0.25, BAR = 110;
export const EASES = ["linear", "in", "out", "inout"];
export const INS = ["cut", "fade", "black"];
const EASE_LABEL = { inout: "부드럽게", out: "천천히 멈춤", in: "천천히 시작", linear: "고르게" };
const IN_LABEL = { cut: "바로", fade: "스며들기", black: "검게 바뀌기" };
const IN_HELP = {
  cut: "앞 컷에서 바로 바뀝니다.",
  fade: "앞 컷 위로 서서히 겹치며 바뀝니다. 첫 컷이면 게임 화면에서 스며듭니다.",
  black: "앞 컷이 검게 어두워졌다가 이 컷이 밝아집니다.",
};
const secs = (v) => `${Math.round(v * 100) / 100}초`;
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const validColor = (c) => /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c);

export const scenesData = () => gameFile().data.scenes || {};
export const sceneOf = (id) => (id ? scenesData()[id] || null : null);
export const sceneName = (id) => { const s = sceneOf(id); return s ? s.name || "이름 없는 장면" : id ? "없는 장면" : "?"; };

// ------------------------------------------------------------------ 계산 (게임의 StoryScene 과 같다)

export function ease(x, kind) {
  x = clamp(x, 0, 1);
  if (kind === "linear") return x;
  if (kind === "in") return 1 - Math.cos(x * Math.PI * 0.5);
  if (kind === "out") return Math.sin(x * Math.PI * 0.5);
  return (1 - Math.cos(x * Math.PI)) * 0.5;
}
// 그림 테두리 밖이 보이지 않게 카메라를 막는다. 배율은 1 이상.
export function clampCamera(c) {
  const z = Math.max(c[2], 1), hw = W * 0.5 / z, hh = H * 0.5 / z;
  return [clamp(c[0], hw, W - hw), clamp(c[1], hh, H - hh), z];
}
// 카메라가 보는 네모 [x, y, 가로, 세로]
export function cameraRect(c) {
  c = clampCamera(c);
  const w = W / c[2], hh = H / c[2];
  return [c[0] - w / 2, c[1] - hh / 2, w, hh];
}
const rectOfArr = (v) => (Array.isArray(v) && v.length === 4 && v.every(isNum) ? [v[0], v[1], Math.max(1, v[2]), Math.max(1, v[3])] : null);
const camOfArr = (v) => (Array.isArray(v) && v.length === 3 && v.every(isNum) ? clampCamera(v) : null);
const easeOf = (v) => (EASES.includes(v) ? v : "inout");

// 데이터의 컷 하나를 게임과 같은 기본값으로 채운다
export function normShot(d) {
  d = d || {};
  let time = num(d.time, 3);
  if (time <= 0) time = 0.1;
  const bg = String(d.bg || "").trim();
  let bgKind = "none", bgColor = "#000000";
  if (bg === "@room") bgKind = "room";
  else if (bg.startsWith("#")) { if (validColor(bg)) { bgKind = "color"; bgColor = bg; } }
  else if (bg) bgKind = "image";
  const cam = d.camera && typeof d.camera === "object" && !Array.isArray(d.camera) ? d.camera : {};
  const from = camOfArr(cam.from) || [860, 540, 1];
  const to = "to" in cam ? camOfArr(cam.to) || [860, 540, 1] : from;
  const camAt = clamp(num(cam.at, 0), 0, time);
  const s = {
    time, start: 0, bg, bgKind, bgColor, anim: d.anim || "", in: INS.includes(d.in) ? d.in : "cut", inTime: clamp(num(d.in_time, 0.6), 0, time),
    camFrom: from, camTo: to, camAt, camTime: Math.max(0, num(cam.time, time - camAt)), camEase: easeOf(cam.ease),
    layers: [], say: [], sound: [], shake: [], flash: [],
  };
  for (const l of Array.isArray(d.layers) ? d.layers : []) {
    if (!l || typeof l !== "object") continue;
    const rect = rectOfArr(l.rect) || [0, 0, 100, 100];
    const at = clamp(num(l.at, 0), 0, time);
    const end = clamp(num(l.end, time), at, time);
    s.layers.push({ image: l.image || "", anim: l.anim || "", rect, to: "to" in l ? rectOfArr(l.to) || rect : rect, at, end, time: Math.max(0, num(l.time, end - at)),
      fadeIn: Math.max(0, num(l.fade_in, 0)), fadeOut: Math.max(0, num(l.fade_out, 0)), flip: !!l.flip, ease: easeOf(l.ease) });
  }
  const evs = (k) => (Array.isArray(d[k]) ? d[k] : []).filter((e) => e && typeof e === "object");
  s.say = evs("say").map((e) => ({ at: Math.max(0, num(e.at, 0)), text: String(e.text || ""), time: Math.max(0, num(e.time, 0)) }));
  s.sound = evs("sound").map((e) => ({ at: Math.max(0, num(e.at, 0)), path: e.path || "", volume: num(e.volume, 1) }));
  s.shake = evs("shake").map((e) => ({ at: Math.max(0, num(e.at, 0)), strength: num(e.strength, 12), time: num(e.time, 0.4) }));
  s.flash = evs("flash").map((e) => ({ at: Math.max(0, num(e.at, 0)), color: typeof e.color === "string" && validColor(e.color) ? e.color : "#ffffff", time: num(e.time, 0.4) }));
  for (const k of ["say", "sound", "shake", "flash"]) s[k].sort((a, b) => a.at - b.at);
  return s;
}
export function normScene(sc) {
  const shots = (sc && Array.isArray(sc.shots) ? sc.shots : []).map(normShot);
  let t = 0;
  for (const s of shots) { s.start = t; t += s.time; }
  return { name: (sc && sc.name) || "", letterbox: !sc || sc.letterbox !== false, skip: !sc || sc.skip !== false, hold: !!(sc && sc.hold), shots, length: t };
}
// 장면이 걸리는 시간 (게임 화면으로 돌아오는 시간까지)
export const sceneLength = (sc) => normScene(sc).length;
export const sceneDuration = (sc) => (sc ? normScene(sc).length + OUTRO : 0);

// 장면 시각 t 에 보일 것 (게임의 StoryScene.frame_at)
export function frameAt(n, t) {
  const out = { cur: -1, curT: 0, curAlpha: 1, prev: -1, prevT: 0, black: 0 };
  if (!n.shots.length) return out;
  let i = n.shots.length - 1;
  for (let k = 0; k < n.shots.length; k++) if (t < n.shots[k].start + n.shots[k].time) { i = k; break; }
  const s = n.shots[i];
  const lt = clamp(t - s.start, 0, s.time);
  out.cur = i; out.curT = lt;
  const it = Math.min(s.inTime, s.time);
  if (i > 0) out.prevT = n.shots[i - 1].time;
  if (s.in === "cut" || it <= 0 || lt >= it) return out;
  if (s.in === "fade") { out.prev = i - 1; out.curAlpha = lt / it; }
  else if (s.in === "black") {
    const half = it * 0.5;
    if (lt < half) { out.prev = i - 1; out.curAlpha = 0; out.black = lt / half; }
    else out.black = 1 - (lt - half) / half;
  }
  return out;
}
export function cameraAt(s, t) {
  const p = s.camTime <= 0 ? 1 : (t - s.camAt) / s.camTime;
  const e = ease(p, s.camEase);
  return clampCamera([0, 1, 2].map((k) => s.camFrom[k] + (s.camTo[k] - s.camFrom[k]) * e));
}
export function layerAt(l, t) {
  if (t < l.at || t > l.end) return { visible: false, rect: l.rect, alpha: 0, t: 0 };
  const p = l.time <= 0 ? 1 : (t - l.at) / l.time;
  const e = ease(p, l.ease);
  const rect = [0, 1, 2, 3].map((k) => l.rect[k] + (l.to[k] - l.rect[k]) * e);
  let alpha = 1;
  if (l.fadeIn > 0) alpha = Math.min(alpha, (t - l.at) / l.fadeIn);
  if (l.fadeOut > 0) alpha = Math.min(alpha, (l.end - t) / l.fadeOut);
  return { visible: true, rect, alpha: clamp(alpha, 0, 1), t: t - l.at };
}
export function sayAt(s, t) {
  let text = "", at = 0;
  for (const e of s.say) {
    if (t >= e.at && (e.time <= 0 || t < e.at + e.time)) { text = e.text; at = e.at; }
    else if (t >= e.at) text = "";
  }
  return { text, since: t - at };
}
export function flashAt(s, t) {
  let out = null;
  for (const f of s.flash) {
    const d = Math.max(f.time, 0.01);
    if (t >= f.at && t < f.at + d) { const a = 1 - (t - f.at) / d; if (!out || a > out.a) out = { color: f.color, a }; }
  }
  return out;
}
export function shakeAt(s, t) {
  let amp = 0;
  for (const e of s.shake) { const d = Math.max(e.time, 0.01); if (t >= e.at && t < e.at + d) amp = Math.max(amp, e.strength * (1 - (t - e.at) / d)); }
  return amp;
}

// ------------------------------------------------------------------ 그리기 (캔버스. 게임과 같은 모습)

const imgCache = new Map();
let redrawAll = null;   // 그림이 다 읽히면 다시 그린다
function img(path) {
  if (!path || typeof Image === "undefined") return null;
  let im = imgCache.get(path);
  if (!im) {
    im = new Image();
    im.onload = () => { roomCache.key = ""; if (redrawAll) redrawAll(); };
    im.src = asset(path);
    imgCache.set(path, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}
// 테두리를 덮게 (가운데 맞춤, 넘치는 쪽은 잘림)
function drawCover(ctx, im, w = W, hh = H) {
  if (!im) return;
  const k = Math.max(w / im.naturalWidth, hh / im.naturalHeight);
  const dw = im.naturalWidth * k, dh = im.naturalHeight * k;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, hh); ctx.clip();
  ctx.drawImage(im, (w - dw) / 2, (hh - dh) / 2, dw, dh);
  ctx.restore();
}
function animImage(id, t) {
  const a = animOf(id);
  if (!a || !(a.frames || []).length) return null;
  return img(a.frames[Math.max(0, animFrameAt(a, t))]);
}

// 지금 게임 화면("@room")의 흉내: 편집기에서 지금 고른 방 화면을 그림으로 그린다 (app.js 가 sceneHooks.roomSprites 를 채운다)
export const sceneHooks = { roomSprites: null, afterClose: null };
const roomCache = { key: "", canvas: null };
function roomCanvas() {
  if (typeof document === "undefined") return null;
  const sprites = sceneHooks.roomSprites ? sceneHooks.roomSprites() : [];
  const key = JSON.stringify(sprites);
  if (roomCache.key === key && roomCache.canvas) return roomCache.canvas;
  const c = roomCache.canvas || document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#3a3530"; ctx.fillRect(0, 0, W, H);
  let missing = !sprites.length;
  for (const sp of sprites) {
    const im = img(sp.texture);
    if (!im) { missing = true; continue; }
    ctx.save();
    if (sp.flip) { ctx.translate(sp.rect[0] * 2 + sp.rect[2], 0); ctx.scale(-1, 1); }
    ctx.drawImage(im, sp.rect[0], sp.rect[1], sp.rect[2], sp.rect[3]);
    ctx.restore();
  }
  if (!sprites.length) {
    ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.font = "40px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("지금 게임 화면", W / 2, H / 2);
  }
  roomCache.canvas = c;
  roomCache.key = missing ? "" : key;   // 아직 안 읽힌 그림이 있으면 다음에 다시
  return c;
}

// 컷 하나의 그림 (그림 좌표 그대로. 카메라는 부르는 쪽이 정한다)
function drawWorld(ctx, s, lt, ghost = -1) {
  ctx.fillStyle = s.bgKind === "color" ? s.bgColor : "#000";
  ctx.fillRect(0, 0, W, H);
  if (s.bgKind === "image") drawCover(ctx, img(s.bg));
  else if (s.bgKind === "room") { const rc = roomCanvas(); if (rc) ctx.drawImage(rc, 0, 0, W, H); }
  if (s.anim) drawCover(ctx, animImage(s.anim, lt));
  s.layers.forEach((l, k) => {
    let st = layerAt(l, lt);
    // 고치는 레이어는 아직 나오기 전이거나 사라진 뒤여도 흐리게 보여 준다
    if (k === ghost && (!st.visible || st.alpha < 0.35)) st = { visible: true, rect: st.visible ? st.rect : lt < l.at ? l.rect : l.to, alpha: 0.35, t: Math.max(0, lt - l.at) };
    if (!st.visible || st.alpha <= 0) return;
    const im = l.anim ? animImage(l.anim, st.t) : img(l.image);
    if (!im) return;
    const [x, y, w, hh] = st.rect;
    ctx.save();
    ctx.globalAlpha *= st.alpha;
    if (l.flip) { ctx.translate(x * 2 + w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(im, x, y, w, hh);
    ctx.restore();
  });
}
function drawShotCam(ctx, s, lt, amp, sceneT) {
  const c = cameraAt(s, lt);
  const z = c[2] * (1 + amp / 540 * 1.05);
  let sx = 0, sy = 0;
  if (amp > 0) {
    sx = (Math.sin(sceneT * 71) * 0.7 + Math.sin(sceneT * 37) * 0.3) * amp;
    sy = (Math.cos(sceneT * 59) * 0.7 + Math.sin(sceneT * 43) * 0.3) * amp;
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.translate(W / 2 - c[0] * z + sx, H / 2 - c[1] * z + sy);
  ctx.scale(z, z);
  drawWorld(ctx, s, lt);
  ctx.restore();
}

let viewCanvas = null;
// 게임에서 보이는 그대로 (그림 영역만): 장면 시각 t, 돌아오기를 시작한 시각 endAt (-1 = 아직)
export function drawPlay(ctx, n, t, endAt = -1, outroLen = OUTRO) {
  const tc = endAt < 0 ? t : Math.min(t, endAt);
  let presence = ease(t / INTRO, "out"), fade = 0;
  if (endAt >= 0) { const q = (t - endAt) / outroLen; presence *= 1 - ease(q / 0.6, "inout"); fade = ease((q - 0.35) / 0.65, "inout"); }
  const rc = roomCanvas();
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  if (rc) ctx.drawImage(rc, 0, 0, W, H);
  const f = frameAt(n, tc);
  if (f.cur < 0) return { caption: "" };
  if (!viewCanvas) { viewCanvas = document.createElement("canvas"); viewCanvas.width = W; viewCanvas.height = H; }
  const v = viewCanvas.getContext("2d");
  v.clearRect(0, 0, W, H);
  const s = n.shots[f.cur];
  if (f.prev >= 0) drawShotCam(v, n.shots[f.prev], f.prevT, 0, tc);
  if (f.curAlpha > 0) { v.globalAlpha = f.curAlpha; drawShotCam(v, s, f.curT, shakeAt(s, f.curT), tc); v.globalAlpha = 1; }
  if (f.black > 0) { v.fillStyle = `rgba(0,0,0,${f.black})`; v.fillRect(0, 0, W, H); }
  const fl = f.curAlpha > 0 ? flashAt(s, f.curT) : null;
  if (fl) { v.globalAlpha = fl.a * colorAlpha(fl.color); v.fillStyle = fl.color.slice(0, 7); v.fillRect(0, 0, W, H); v.globalAlpha = 1; }
  ctx.globalAlpha = 1 - fade;
  ctx.drawImage(viewCanvas, 0, 0);
  ctx.globalAlpha = 1;
  // 검은 띠와 자막
  const say = endAt < 0 && f.curAlpha >= 0.5 ? sayAt(s, f.curT) : { text: "" };
  const capA = say.text ? clamp(say.since / 0.18, 0, 1) : 0;
  if (n.letterbox) {
    const bar = BAR * presence;
    ctx.fillStyle = "#030202";
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
    if (capA > 0) caption(ctx, say.text, H - bar + BAR / 2, capA);
  } else if (capA > 0) {
    ctx.fillStyle = `rgba(0,0,0,${0.62 * capA})`;
    ctx.fillRect(0, 975, W, 80);
    caption(ctx, say.text, 1015, capA);
  }
  return { caption: say.text, shot: f.cur };
}
function colorAlpha(c) { return c.length === 9 ? parseInt(c.slice(7, 9), 16) / 255 : c.length === 5 ? parseInt(c[4] + c[4], 16) / 255 : 1; }
function caption(ctx, text, y, a) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = "34px 'Malgun Gothic', 'Noto Sans KR', sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = 6; ctx.strokeStyle = "rgba(0,0,0,.85)"; ctx.lineJoin = "round";
  ctx.strokeText(text, W / 2, y);
  ctx.fillStyle = "#e6dbc7";
  ctx.fillText(text, W / 2, y);
  ctx.restore();
}
// 고칠 때 보는 모습: 그림 전체 (카메라 없이), 컷 안의 시각 lt
export function drawEdit(ctx, s, lt, ghost = -1) {
  drawWorld(ctx, s, lt, ghost);
}
// 작은 그림 (목록, 컷 줄): 카메라 시작 화면, 컷 가운데 시각
function drawThumb(canvas, s) {
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.scale(canvas.width / W, canvas.height / H);
  drawShotCam(ctx, s, Math.min(s.time * 0.5, 1.5), 0, 0);
  ctx.restore();
}

// ------------------------------------------------------------------ 쓰는 곳, 고르기

export function sceneUses(id) {
  let n = 0;
  for (const f of Object.values(S.files)) n += JSON.stringify(f.data).split(`"scene":${JSON.stringify(id)}`).length - 1;
  return n;
}
function setScenes(all) {
  const g = gameFile().data;
  if (Object.keys(all).length) g.scenes = all; else delete g.scenes;
  markDirty(GAME_FILE);
}
function newId() { return "scene_" + Date.now().toString(36) + Math.floor(Math.random() * 100); }
const thumbCanvas = (sc, cls) => {
  const c = h("canvas", { class: cls, width: 160, height: 100 });
  const n = normScene(sc);
  if (n.shots.length) try { drawThumb(c, n.shots[0]); } catch (_) { /* 그림을 못 그림 */ }
  return c;
};

export function pickScene(current, onPick, { allowNone = true } = {}) {
  let close;
  const search = h("input", { placeholder: "이름으로 찾기", style: { width: "100%" } });
  const body = h("div", { class: "gallery-grid" });
  const draw = () => {
    const list = Object.entries(scenesData()).filter(([, s]) => matchText(s.name || "", search.value));
    body.replaceChildren(...list.map(([id, s]) => h("button", { class: "gallery-item" + (id === current ? " on" : ""), onclick: () => { close(); onPick(id); } },
      thumbCanvas(s, "sn-gthumb"), h("span", {}, `${s.name || "이름 없음"} (${secs(sceneDuration(s))})`))));
    if (!list.length) body.append(h("p", { class: "muted" }, Object.keys(scenesData()).length ? "찾는 이름이 없습니다." : "아직 장면이 없습니다. 아래 '새로 만들기'를 누르세요."));
  };
  search.addEventListener("input", draw);
  draw();
  close = modal("장면 고르기", h("div", { class: "gallery-wrap" }, search, body), [
    allowNone ? { label: "장면 없애기", onclick: (c) => { c(); onPick(""); } } : null,
    { label: "새로 만들기", onclick: (c) => { c(); openSceneEditor(null, (id) => onPick(id)); } },
    { label: "닫기", onclick: (c) => c() },
  ].filter(Boolean));
}
// 고르기 단추 (할 일 칸에서 쓴다)
export function sceneField(val, set) {
  const wrap = h("div", { class: "image-pick" });
  const draw = (v) => {
    fill(wrap,
      h("button", { onclick: (e) => { e.preventDefault(); pickScene(v, (id) => { set(id); draw(id); }); } }, v ? sceneName(v) + " (바꾸기)" : "장면 고르기"),
      v && sceneOf(v) ? h("span", { class: "muted small" }, secs(sceneDuration(sceneOf(v)))) : null,
      v ? h("button", { class: "btn link", onclick: (e) => { e.preventDefault(); openSceneEditor(v); } }, "고치기") : null);
  };
  draw(val);
  return wrap;
}

// ------------------------------------------------------------------ 장면 편집기 (화면 전체를 덮는 창)
// 말 정리
//   장면: 컷 여러 개로 된 짧은 연출.  컷: 바탕 하나와 그 위의 움직임으로 된 한 화면.  레이어: 바탕 위에 겹쳐 놓는 그림.
//   카메라: 그림의 어디를 얼마나 크게 보여 줄지. 시작 화면에서 끝 화면으로 움직인다.
// 자리
//   왼쪽: 장면 목록과 이 장면 설정(이름, 검은 띠, 건너뛰기, 관리).  가운데: 미리 보기, 재생 단추, 컷 줄.
//   오른쪽: 고른 컷의 설정 (바탕, 길이, 들어오는 방식, 카메라, 레이어, 자막, 효과음, 흔들기, 번쩍).

export function openSceneEditor(id = null, onDone = null) {
  const all0 = { ...scenesData() };
  let cur = id && all0[id] ? id : null;
  const made = new Set();
  if (!cur && !id) {
    cur = newId();
    all0[cur] = { name: `새 장면 ${Object.keys(all0).length + 1}`, letterbox: true, skip: true, shots: [{ bg: "@room", time: 3 }] };
    made.add(cur);
    setScenes(all0);
  }
  const st = { shot: 0, layer: -1, focus: "camera", lt: 0, play: null, camView: false };
  const data = () => scenesData()[cur];
  const shotData = () => { const sc = data(); return sc && sc.shots ? sc.shots[Math.min(st.shot, sc.shots.length - 1)] : null; };
  const save = () => markDirty(GAME_FILE);
  const root = h("div", { class: "anim-editor scene-editor" });
  let raf = 0;
  const sounds = [];
  const stopSounds = () => { for (const a of sounds.splice(0)) { try { a.pause(); } catch (_) { /* 이미 멈춤 */ } } };

  const close = () => {
    stop();
    cancelAnimationFrame(raf); root.remove(); document.removeEventListener("keydown", keys);
    redrawAll = null;
    if (onDone && cur && scenesData()[cur]) onDone(cur);
    if (sceneHooks.afterClose) sceneHooks.afterClose();
  };
  const keys = (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "") || document.querySelector(".modal-back")) return;
    if (e.key === "Escape") close();
    else if (e.key === " ") { e.preventDefault(); if (st.play) stop(); else play(true); }
  };
  document.addEventListener("keydown", keys);

  // ---- 재생
  const play = (fromShot) => {
    const sc = data();
    if (!sc || !(sc.shots || []).length) return;
    const n = normScene(sc);
    const T0 = fromShot ? n.shots[Math.min(st.shot, n.shots.length - 1)].start : 0;
    stopSounds();
    st.play = { t0: performance.now() - T0 * 1000, endAt: -1, n, fired: new Set(), from: T0 };
    // 시작 시각 앞의 효과음은 내지 않는다
    n.shots.forEach((s, i) => s.sound.forEach((e, j) => { if (s.start + e.at < T0) st.play.fired.add(i + "/" + j); }));
    drawPlayer(); drawStrip(); drawOverlay();
  };
  const stop = () => {
    if (!st.play) return;
    const p = st.play;
    st.play = null;
    stopSounds();
    const T = (performance.now() - p.t0) / 1000;
    if (p.endAt < 0 && T < p.n.length) {   // 멈춘 곳의 컷과 시각을 고른다
      const f = frameAt(p.n, T);
      st.shot = f.cur; st.lt = Math.round(f.curT * 10) / 10;
    }
    if (root.isConnected) draw();
  };
  const skip = () => { if (st.play && st.play.endAt < 0) { stopSounds(); st.play.endAt = (performance.now() - st.play.t0) / 1000; st.play.outro = SKIP_OUTRO; } };

  // ---- 미리 보기 (캔버스 + 끌어서 고치는 네모)
  const canvas = h("canvas", { class: "sn-canvas", width: W, height: H });
  const ctx = canvas.getContext("2d");
  const overlay = h("div", { class: "sn-overlay" });
  const stageBox = h("div", { class: "sn-stage" }, canvas, overlay);
  const stageWrap = h("div", { class: "sn-stage-wrap" }, stageBox);
  const timeLabel = h("span", { class: "ae-count sn-time" });
  const tick = () => {
    const sc = data();
    if (st.play) {
      const p = st.play;
      const T = (performance.now() - p.t0) / 1000;
      if (p.endAt < 0 && T >= p.n.length) p.endAt = p.n.length;
      if (p.endAt >= 0 && T >= p.endAt + (p.outro || OUTRO)) { stop(); raf = requestAnimationFrame(tick); return; }
      if (p.endAt < 0) p.n.shots.forEach((s, i) => s.sound.forEach((e, j) => {
        const key = i + "/" + j;
        if (!p.fired.has(key) && s.start + e.at <= T) {
          p.fired.add(key);
          if (e.path) try { const a = new Audio(asset(e.path)); a.volume = clamp(e.volume, 0, 1); a.play().catch(() => {}); sounds.push(a); } catch (_) { /* 재생 불가 */ }
        }
      }));
      const r = drawPlay(ctx, p.n, T, p.endAt, p.outro || OUTRO);
      const text = `${secs(Math.min(T, p.n.length))} (모두 ${secs(p.n.length)})`;
      if (timeLabel.textContent !== text) timeLabel.textContent = text;
      root.querySelectorAll(".sn-cell").forEach((c, k) => c.classList.toggle("now", k === r.shot));
    } else if (sc && (sc.shots || []).length) {
      const n = normScene(sc);
      const s = n.shots[Math.min(st.shot, n.shots.length - 1)];
      const lt = Math.min(st.lt, s.time);
      if (st.camView) drawPlay(ctx, n, s.start + lt);
      else { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); drawEdit(ctx, s, lt, st.focus === "layer" ? st.layer : -1); }
    } else { ctx.fillStyle = "#15161a"; ctx.fillRect(0, 0, W, H); }
    raf = requestAnimationFrame(tick);
  };
  let imgTimer = 0;
  redrawAll = () => { clearTimeout(imgTimer); imgTimer = setTimeout(() => { if (root.isConnected) { drawList(); drawStrip(); } }, 120); };

  // 끌어서 옮기는 네모. rect 는 그림 좌표 [x, y, 가로, 세로]. onMove(새 네모) 는 고친 네모를 돌려준다.
  const pctStyle = (r) => ({ left: r[0] / W * 100 + "%", top: r[1] / H * 100 + "%", width: r[2] / W * 100 + "%", height: r[3] / H * 100 + "%" });
  const dragBox = (rect, cls, label, onMove, { keepAspect = true, onDone: done = null } = {}) => {
    const el = h("div", { class: "sn-box " + cls, style: pctStyle(rect), title: "끌어서 옮기고, 오른쪽 아래 모서리를 끌어 크기를 바꿉니다" },
      h("span", { class: "sn-box-label" }, label), h("span", { class: "sn-grip" }));
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      const grip = e.target.classList.contains("sn-grip");
      const k = W / overlay.getBoundingClientRect().width;
      const r0 = [...rect], x0 = e.clientX, y0 = e.clientY;
      el.classList.add("dragging");
      const mv = (ev) => {
        const dx = (ev.clientX - x0) * k, dy = (ev.clientY - y0) * k;
        let r;
        if (!grip) r = [r0[0] + dx, r0[1] + dy, r0[2], r0[3]];
        else {
          const w = Math.max(12, r0[2] + dx);
          r = [r0[0], r0[1], w, keepAspect && !ev.shiftKey ? w * r0[3] / r0[2] : Math.max(12, r0[3] + dy)];
        }
        rect = onMove(r.map((v) => Math.round(v)));
        Object.assign(el.style, pctStyle(rect));
      };
      const up = () => { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); el.classList.remove("dragging"); save(); if (done) done(); else drawProps(); drawStrip(); };
      el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    });
    return el;
  };
  const drawOverlay = () => {
    const d = shotData();
    if (st.play || st.camView || !d) { fill(overlay); return; }
    const s = normShot(d);
    const boxes = [];
    if (st.focus === "layer" && d.layers && d.layers[st.layer]) {
      const l = d.layers[st.layer];
      const nl = s.layers[st.layer];
      boxes.push(dragBox(nl.rect, "from layer", l.to ? "처음 자리" : "자리", (r) => { l.rect = r; return r; }));
      if (l.to) boxes.push(dragBox(nl.to, "to layerto", "끝 자리", (r) => { l.to = r; return r; }));
    } else {
      const cam = () => (d.camera = d.camera || {});
      const toRect = (r) => { const z = clamp(W / r[2], 1, 8); return clampCamera([r[0] + r[2] / 2, r[1] + r[3] / 2, z]); };
      const round = (c) => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2] * 100) / 100];
      boxes.push(dragBox(cameraRect(s.camFrom), "from", d.camera && d.camera.to ? "시작 화면" : "카메라 화면", (r) => { cam().from = round(toRect(r)); return cameraRect(cam().from); }));
      if (d.camera && d.camera.to) boxes.push(dragBox(cameraRect(s.camTo), "to", "끝 화면", (r) => { cam().to = round(toRect(r)); return cameraRect(cam().to); }));
    }
    fill(overlay, boxes);
  };

  // ---- 재생 단추와 시각
  const player = h("div", { class: "ae-player sn-player" });
  const scrub = h("input", { type: "range", min: 0, max: 3, step: 0.05, class: "sn-scrub" });
  scrub.addEventListener("input", () => { stop(); st.lt = +scrub.value; drawOverlay(); updateTime(); });
  const updateTime = () => {
    const d = shotData();
    if (!d || st.play) return;
    const s = normShot(d);
    scrub.max = s.time; scrub.value = Math.min(st.lt, s.time);
    timeLabel.textContent = `이 컷의 ${secs(Math.min(st.lt, s.time))} (컷 길이 ${secs(s.time)})`;
  };
  const drawPlayer = () => {
    const sc = data();
    const none = !sc || !(sc.shots || []).length;
    fill(player,
      h("button", { class: "btn primary", disabled: none, title: "처음부터 게임과 같은 모습으로 틀어 봅니다 (스페이스는 이 컷부터)", onclick: () => (st.play ? stop() : play(false)) }, st.play ? "멈춤" : "처음부터 재생"),
      h("button", { class: "btn", disabled: none || !!st.play, onclick: () => play(true) }, "이 컷부터 재생"),
      st.play && st.play.n.skip ? h("button", { class: "btn small", title: "게임의 건너뛰기 단추와 같습니다", onclick: skip }, "건너뛰기") : null,
      h("span", { class: "spacer" }),
      st.play ? null : h("span", { class: "sn-scrub-wrap", title: "고른 컷 안의 시각. 레이어와 자막이 그 시각의 모습으로 보입니다." }, scrub),
      timeLabel);
    updateTime();
  };

  // ---- 왼쪽: 장면 목록과 이 장면 설정
  const list = h("div", { class: "ae-list" });
  const drawList = () => {
    const items = Object.entries(scenesData());
    const sc = data();
    const uses = cur ? sceneUses(cur) : 0;
    fill(list,
      h("div", { class: "ae-col-title" }, "장면 목록"),
      h("button", { class: "btn primary ae-new", onclick: () => {
        const a2 = { ...scenesData() };
        const nid = newId();
        a2[nid] = { name: `새 장면 ${items.length + 1}`, letterbox: true, skip: true, shots: [{ bg: "@room", time: 3 }] };
        made.add(nid);
        setScenes(a2); cur = nid; st.shot = 0; st.layer = -1; st.lt = 0; stop(); draw();
      } }, "＋ 새 장면"),
      ...items.map(([k, s]) => h("div", { class: "ae-item" + (k === cur ? " on" : ""), onclick: () => { stop(); cur = k; st.shot = 0; st.layer = -1; st.lt = 0; draw(); } },
        thumbCanvas(s, "ae-thumb sn-thumb"),
        h("div", { class: "ae-item-text" }, h("b", {}, s.name || "이름 없음"),
          h("div", { class: "muted small" }, `컷 ${(s.shots || []).length}개, ${secs(sceneDuration(s))}`)))),
      items.length ? null : h("p", { class: "muted small" }, "아직 없습니다."),
      sc ? h("div", { class: "sn-scene-props" },
        h("div", { class: "ae-col-title" }, "이 장면"),
        h("label", { class: "field" }, h("span", { class: "ae-gtitle" }, "이름"),
          h("input", { class: "name-input", value: sc.name || "", oninput: (e) => { sc.name = e.target.value; save(); for (const b of list.querySelectorAll(".ae-item.on b")) b.textContent = sc.name || "이름 없음"; } })),
        h("label", { class: "check", title: "위아래에 검은 띠가 미끄러져 들어옵니다. 자막은 아래 띠 안에 나옵니다." },
          h("input", { type: "checkbox", checked: sc.letterbox !== false, onchange: (e) => { sc.letterbox = e.target.checked; save(); } }), " 위아래 검은 띠"),
        h("label", { class: "check", title: "오른쪽 아래에 작은 건너뛰기 단추가 나옵니다. 누르면 바로 끝나고 뒤의 할 일은 그대로 이어집니다." },
          h("input", { type: "checkbox", checked: sc.skip !== false, onchange: (e) => { sc.skip = e.target.checked; save(); } }), " 건너뛰기 단추"),
        h("label", { class: "check", title: "끝나도 게임 화면으로 돌아오지 않고 마지막 화면을 띄운 채 다음 할 일로 넘어갑니다. 장면 바로 뒤에 엔딩이 올 때 켭니다." },
          h("input", { type: "checkbox", checked: !!sc.hold, onchange: (e) => { if (e.target.checked) sc.hold = true; else delete sc.hold; save(); } }), " 마지막 화면에 머물기"),
        h("div", { class: "ae-stats" },
          h("div", {}, `컷 ${(sc.shots || []).length}개, 모두 ${secs(sceneLength(sc))}`),
          h("div", {}, uses ? `${uses}곳에서 틉니다.` : "아직 어디서도 틀지 않습니다."),
          h("div", { class: "muted small" }, "틀려면 할 일에서 '장면 틀기'를 고르거나 타임라인의 '장면' 단추를 누릅니다.")),
        h("div", { class: "ae-group ae-manage" },
          h("div", { class: "ae-gtitle" }, "관리"),
          h("div", { class: "row" },
            h("button", { class: "btn small", onclick: () => { const a2 = { ...scenesData() }; const nid = newId(); a2[nid] = JSON.parse(JSON.stringify({ ...sc, name: (sc.name || "") + " 사본" })); setScenes(a2); cur = nid; stop(); draw(); } }, "이 장면 복제"),
            h("button", { class: "btn small danger", onclick: () => {
              if (uses) return toast(`${uses}곳에서 틀고 있어서 지울 수 없습니다. 틀던 곳에서 먼저 빼세요.`, "warn", 7000);
              ask("장면 지우기", `${josa(sc.name || "이 장면", "을/를")} 지울까요? 되돌리기로 되살릴 수 있습니다.`, "지우기", () => {
                const a2 = { ...scenesData() }; delete a2[cur]; setScenes(a2); cur = Object.keys(a2)[0] || null; st.shot = 0; stop(); draw();
              }, { danger: true });
            } }, "이 장면 지우기")))) : null);
  };

  // ---- 가운데 아래: 컷 줄
  const strip = h("div", { class: "ae-strip" });
  const drawStrip = () => {
    const sc = data();
    if (!sc) { fill(strip); return; }
    sc.shots = sc.shots || [];
    let dragFrom = -1;
    const n = normScene(sc);
    const cells = n.shots.map((s, i) => {
      const c = h("canvas", { width: 160, height: 100 });
      try { drawThumb(c, s); } catch (_) { /* 그림을 못 그림 */ }
      const cell = h("div", { class: "ae-cell sn-cell" + (i === st.shot ? " sel" : ""), draggable: "true", title: "누르면 이 컷을 고치고, 끌면 순서를 바꿉니다",
        onclick: () => { stop(); st.shot = i; st.layer = -1; st.focus = "camera"; st.lt = 0; draw(); } },
        h("div", { class: "ae-cell-pic sn-cell-pic" }, c),
        h("div", { class: "ae-cell-foot" }, h("b", {}, String(i + 1)), h("span", {}, secs(s.time))),
        s.in !== "cut" && i > 0 ? h("span", { class: "sn-in" }, IN_LABEL[s.in]) : null);
      cell.addEventListener("dragstart", (e) => { dragFrom = i; e.dataTransfer.effectAllowed = "move"; cell.classList.add("dragging"); });
      cell.addEventListener("dragend", () => cell.classList.remove("dragging"));
      cell.addEventListener("dragover", (e) => { e.preventDefault(); cell.classList.add("over"); });
      cell.addEventListener("dragleave", () => cell.classList.remove("over"));
      cell.addEventListener("drop", (e) => {
        e.preventDefault();
        if (dragFrom < 0 || dragFrom === i) return;
        const [x] = sc.shots.splice(dragFrom, 1); sc.shots.splice(i, 0, x);
        st.shot = i; save(); draw();
      });
      return cell;
    });
    const addShot = () => {
      const prev = sc.shots[sc.shots.length - 1];
      sc.shots.push({ bg: prev ? prev.bg || "#000000" : "@room", time: 3, ...(prev ? { in: "fade", in_time: 0.6 } : {}) });
      st.shot = sc.shots.length - 1; st.layer = -1; st.lt = 0; save(); draw();
    };
    cells.push(h("button", { class: "ae-cell ae-add-cell sn-add-cell", title: "컷 더하기", onclick: addShot }, "＋"));
    const i = Math.min(st.shot, sc.shots.length - 1);
    const tools = i >= 0 ? h("div", { class: "ae-tools" },
      h("b", { class: "ae-tools-title" }, `${i + 1}번 컷`),
      h("div", { class: "ae-tgroup" },
        h("button", { class: "btn small", disabled: i === 0, onclick: () => { [sc.shots[i - 1], sc.shots[i]] = [sc.shots[i], sc.shots[i - 1]]; st.shot = i - 1; save(); draw(); } }, "앞으로 옮기기"),
        h("button", { class: "btn small", disabled: i === sc.shots.length - 1, onclick: () => { [sc.shots[i + 1], sc.shots[i]] = [sc.shots[i], sc.shots[i + 1]]; st.shot = i + 1; save(); draw(); } }, "뒤로 옮기기")),
      h("div", { class: "ae-tgroup" },
        h("button", { class: "btn small", onclick: () => { sc.shots.splice(i + 1, 0, JSON.parse(JSON.stringify(sc.shots[i]))); st.shot = i + 1; save(); draw(); } }, "이 컷 복제")),
      h("span", { class: "spacer" }),
      h("button", { class: "btn small danger", disabled: sc.shots.length <= 1, title: sc.shots.length <= 1 ? "장면에는 컷이 하나는 있어야 합니다" : "", onclick: () => { sc.shots.splice(i, 1); st.shot = Math.max(0, i - 1); st.layer = -1; save(); draw(); } }, "이 컷 빼기"))
      : null;
    fill(strip,
      h("div", { class: "ae-strip-head" },
        h("b", {}, "컷"), h("span", { class: "muted small" }, `${sc.shots.length}개, 모두 ${secs(n.length)}. 끌어서 순서를 바꿉니다.`),
        h("span", { class: "spacer" }),
        h("button", { class: "btn primary small", onclick: addShot }, "＋ 컷 더하기")),
      h("div", { class: "ae-cells" }, cells),
      tools);
  };

  // ---- 오른쪽: 고른 컷의 설정
  const props = h("div", { class: "ae-props sn-props" });
  const touch = () => { save(); drawOverlay(); updateTime(); drawStripSoon(); };
  let stripTimer = 0;
  const drawStripSoon = () => { clearTimeout(stripTimer); stripTimer = setTimeout(() => { if (root.isConnected) { drawStrip(); drawList(); } }, 250); };
  const numIn = (obj, key, def, { min = 0, max = 600, step = 0.1, after = null, optional = false, width = 64 } = {}) =>
    h("input", { type: "number", class: "num-in", min, max, step, style: { width: width + "px" }, value: obj[key] ?? (optional ? "" : def), placeholder: optional ? String(def) : "",
      oninput: (e) => {
        const v = parseFloat(e.target.value);
        if (e.target.value === "" && optional) delete obj[key];
        else if (Number.isFinite(v)) obj[key] = clamp(Math.round(v * 100) / 100, min, max);
        touch(); if (after) after();
      } });
  const group = (title, help, ...kids) => h("div", { class: "ae-group sn-group" }, h("div", { class: "ae-gtitle" }, title), help ? h("p", { class: "help small" }, help) : null, ...kids);
  const seg = (options, val, onPick) => h("div", { class: "seg wide" }, options.map(([v, l]) => h("button", { class: "seg-btn" + (val === v ? " on" : ""), onclick: () => onPick(v) }, l)));
  const easeSel = (obj, key) => h("select", { onchange: (e) => { if (e.target.value === "inout") delete obj[key]; else obj[key] = e.target.value; touch(); } },
    EASES.slice().reverse().map((v) => h("option", { value: v, selected: (obj[key] || "inout") === v }, EASE_LABEL[v])));
  const pickImage = (current, onPick) => { if (animHooks.pickImage) animHooks.pickImage(current, (p) => onPick(p)); };

  const drawProps = () => {
    const sc = data();
    const d = shotData();
    if (!sc || !d) { fill(props, h("p", { class: "muted" }, "왼쪽에서 장면을 고르거나 새로 만드세요.")); return; }
    const i = Math.min(st.shot, sc.shots.length - 1);
    const s = normShot(d);
    const bgMode = s.bgKind === "room" ? "room" : s.bgKind === "color" ? "color" : d.bg ? "image" : d.anim ? "anim" : "image";
    // 바탕
    const bgBox = group("바탕", null,
      seg([["image", "그림"], ["room", "지금 화면"], ["color", "색"]], bgMode === "anim" ? "" : bgMode, (v) => {
        if (v === "room") d.bg = "@room";
        else if (v === "color") d.bg = s.bgKind === "color" ? d.bg : "#000000";
        else return pickImage(s.bgKind === "image" ? d.bg : "", (p) => { if (p) d.bg = p; else delete d.bg; save(); draw(); });
        save(); draw();
      }),
      bgMode === "image" && d.bg ? h("div", { class: "image-pick" },
        h("button", { onclick: () => pickImage(d.bg, (p) => { if (p) d.bg = p; else delete d.bg; save(); draw(); }) }, names.file(d.bg) + " (바꾸기)")) : null,
      bgMode === "room" ? h("p", { class: "help small" }, "장면이 시작될 때의 게임 화면을 그대로 떠서 씁니다. 지금 보던 물건으로 카메라가 다가가는 연출에 씁니다. 여기서는 편집기에서 지금 고른 방 화면으로 보여 줍니다.") : null,
      bgMode === "color" ? h("div", { class: "row" }, h("input", { type: "color", value: s.bgColor.slice(0, 7), oninput: (e) => { d.bg = e.target.value; touch(); } }), h("span", { class: "muted small" }, "한 가지 색으로 채웁니다.")) : null,
      h("label", { class: "field" }, h("span", { class: "muted small" }, "애니메이션 (고르면 바탕 위에서 계속 돕니다. 비 내리는 창밖처럼)"),
        animField(d.anim || "", (v) => { if (v) d.anim = v; else delete d.anim; save(); draw(); })),
      h("p", { class: "help small" }, "그림은 1720 x 1080 칸을 덮습니다. 비율이 다르면 넘치는 쪽이 잘립니다. 카메라로 크게 당길 컷은 더 크게 그리면 또렷합니다."));
    // 길이와 들어오는 방식
    const timeBox = group("길이와 들어오는 방식", null,
      h("div", { class: "row" }, h("span", {}, "이 컷의 길이"), numIn(d, "time", 3, { min: 0.2, max: 60, after: () => { if (!d.camera || d.camera.time === undefined) drawOverlay(); } }), h("span", {}, "초")),
      seg(INS.map((v) => [v, IN_LABEL[v]]), d.in || "cut", (v) => { if (v === "cut") { delete d.in; delete d.in_time; } else d.in = v; save(); draw(); }),
      h("p", { class: "help small" }, IN_HELP[d.in || "cut"]),
      d.in && d.in !== "cut" ? h("div", { class: "row" }, h("span", {}, "바뀌는 시간"), numIn(d, "in_time", 0.6, { min: 0.05, max: 10 }), h("span", {}, "초 (이 컷의 길이 안에 듭니다)")) : null);
    // 카메라
    const cam = d.camera || {};
    const setCam = (k, v) => { d.camera = d.camera || {}; if (v === undefined) delete d.camera[k]; else d.camera[k] = v; if (!Object.keys(d.camera).length) delete d.camera; save(); draw(); };
    const camNums = (k, c) => h("div", { class: "row sn-camnums" }, h("span", { class: "sn-dot " + (k === "to" ? "to" : "from") }), h("span", {}, k === "to" ? "끝" : "시작"),
      ["가운데 x", "가운데 y", "배율"].map((lbl, j) => h("label", { class: "sn-mini" }, h("small", {}, lbl), h("input", { type: "number", class: "num-in", step: j === 2 ? 0.05 : 10, min: j === 2 ? 1 : 0, value: j === 2 ? Math.round(c[j] * 100) / 100 : Math.round(c[j]), onchange: (e) => {
        const v = [...c]; v[j] = parseFloat(e.target.value) || (j === 2 ? 1 : 0); d.camera = d.camera || {}; const cc = clampCamera(v); d.camera[k] = [Math.round(cc[0]), Math.round(cc[1]), Math.round(cc[2] * 100) / 100]; save(); draw();
      } }))));
    const camBox = group("카메라", "미리 보기 위의 네모가 카메라가 보는 곳입니다. 끌어서 옮기고, 오른쪽 아래 모서리를 끌면 크게 당기거나 넓게 봅니다. 그림 밖은 보이지 않게 저절로 막습니다.",
      st.focus !== "camera" ? h("button", { class: "btn small", onclick: () => { st.focus = "camera"; st.layer = -1; draw(); } }, "미리 보기에서 카메라 네모 보기") : null,
      camNums("from", s.camFrom),
      cam.to ? camNums("to", s.camTo) : null,
      h("div", { class: "row wrap" },
        cam.to ? h("button", { class: "btn small", title: "끝 화면을 없애고 시작 화면에 머뭅니다", onclick: () => setCam("to") }, "움직이지 않기")
          : h("button", { class: "btn small primary", title: "카메라가 시작 화면에서 끝 화면으로 천천히 움직입니다", onclick: () => { const c = s.camFrom; setCam("to", [Math.round(c[0]), Math.round(c[1]), Math.round(Math.min(8, c[2] * 1.3) * 100) / 100]); } }, "＋ 끝 화면 정하기 (움직이기)"),
        cam.to ? h("button", { class: "btn small", onclick: () => { d.camera.from = cam.to; d.camera.to = s.camFrom; save(); draw(); } }, "시작과 끝 바꾸기") : null,
        h("button", { class: "btn small", onclick: () => { delete d.camera; save(); draw(); } }, "그림 전체로")),
      cam.to ? h("div", { class: "row wrap" }, h("span", {}, "움직이는 방식"), easeSel(d.camera, "ease")) : null,
      cam.to ? h("div", { class: "row wrap" }, h("span", {}, "시작"), numIn(d.camera, "at", 0, { optional: true, max: 60 }), h("span", {}, "초부터"),
        numIn(d.camera, "time", Math.round((s.time - s.camAt) * 100) / 100, { optional: true, max: 60 }), h("span", {}, "초 동안 (비우면 컷 끝까지)")) : null);
    // 레이어
    const layers = d.layers || [];
    const addLayer = (l) => { d.layers = d.layers || []; d.layers.push(l); st.layer = d.layers.length - 1; st.focus = "layer"; save(); draw(); };
    const fitRect = (path, cb) => {
      const fallback = [660, 440, 400, 200];
      if (typeof Image === "undefined") return cb(fallback);
      const im = new Image();
      im.onload = () => { const k = Math.min(1, 860 / im.naturalWidth, 540 / im.naturalHeight); const w = Math.round(im.naturalWidth * k), hh = Math.round(im.naturalHeight * k); cb([Math.round(860 - w / 2), Math.round(540 - hh / 2), w, hh]); };
      im.onerror = () => cb(fallback);
      im.src = asset(path);
    };
    const L = layers[st.layer];
    const nl = L ? s.layers[st.layer] : null;
    const layerForm = L ? h("div", { class: "sn-layer-form" },
      h("div", { class: "row" }, h("input", { class: "name-input", placeholder: "레이어 이름 (나만 보는 것)", value: L.name || "", oninput: (e) => { if (e.target.value) L.name = e.target.value; else delete L.name; save(); } })),
      h("div", { class: "row wrap" },
        L.anim ? animField(L.anim, (v) => { if (v) L.anim = v; save(); draw(); })
          : h("div", { class: "image-pick" }, h("button", { onclick: () => pickImage(L.image, (p) => { if (p) L.image = p; save(); draw(); }) }, L.image ? names.file(L.image) + " (바꾸기)" : "그림 고르기"))),
      h("div", { class: "row wrap" }, h("span", {}, "자리"),
        ["x", "y", "가로", "세로"].map((lbl, j) => h("label", { class: "sn-mini" }, h("small", {}, lbl), h("input", { type: "number", class: "num-in", value: nl.rect[j], onchange: (e) => { const r = [...nl.rect]; r[j] = Math.round(parseFloat(e.target.value) || 0); L.rect = r; save(); draw(); } })))),
      L.to ? h("div", { class: "row wrap" }, h("span", {}, "끝 자리"),
        ["x", "y", "가로", "세로"].map((lbl, j) => h("label", { class: "sn-mini" }, h("small", {}, lbl), h("input", { type: "number", class: "num-in", value: nl.to[j], onchange: (e) => { const r = [...nl.to]; r[j] = Math.round(parseFloat(e.target.value) || 0); L.to = r; save(); draw(); } })))) : null,
      h("div", { class: "row wrap" },
        L.to ? h("button", { class: "btn small", onclick: () => { delete L.to; delete L.time; delete L.ease; save(); draw(); } }, "움직이지 않기")
          : h("button", { class: "btn small primary", title: "처음 자리에서 끝 자리로 움직입니다. 크기도 바뀝니다.", onclick: () => { L.to = [nl.rect[0] + 80, nl.rect[1], nl.rect[2], nl.rect[3]]; save(); draw(); } }, "＋ 끝 자리 정하기 (움직이기)"),
        h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!L.flip, onchange: (e) => { if (e.target.checked) L.flip = true; else delete L.flip; touch(); } }), " 좌우 뒤집기")),
      h("div", { class: "row wrap" }, h("span", {}, "나오는 시각"), numIn(L, "at", 0, { optional: true, max: 60 }), h("span", {}, "초, 사라지는 시각"), numIn(L, "end", s.time, { optional: true, max: 60 }), h("span", {}, "초")),
      h("div", { class: "row wrap" }, h("span", {}, "서서히 나타남"), numIn(L, "fade_in", 0, { optional: true, max: 10 }), h("span", {}, "초, 서서히 사라짐"), numIn(L, "fade_out", 0, { optional: true, max: 10 }), h("span", {}, "초")),
      L.to ? h("div", { class: "row wrap" }, h("span", {}, "움직이는 시간"), numIn(L, "time", Math.round((nl.end - nl.at) * 100) / 100, { optional: true, max: 60 }), h("span", {}, "초,"), easeSel(L, "ease")) : null,
      h("div", { class: "row wrap" },
        h("button", { class: "btn small", disabled: st.layer === 0, title: "뒤로 보내기 (먼저 그림)", onclick: () => { [layers[st.layer - 1], layers[st.layer]] = [layers[st.layer], layers[st.layer - 1]]; st.layer--; save(); draw(); } }, "뒤로 보내기"),
        h("button", { class: "btn small", disabled: st.layer === layers.length - 1, title: "앞으로 가져오기 (나중에 그림)", onclick: () => { [layers[st.layer + 1], layers[st.layer]] = [layers[st.layer], layers[st.layer + 1]]; st.layer++; save(); draw(); } }, "앞으로 가져오기"),
        h("button", { class: "btn small", onclick: () => { layers.splice(st.layer + 1, 0, JSON.parse(JSON.stringify(L))); st.layer++; save(); draw(); } }, "복제"),
        h("span", { class: "spacer" }),
        h("button", { class: "btn small danger", onclick: () => { layers.splice(st.layer, 1); if (!layers.length) delete d.layers; st.layer = -1; st.focus = "camera"; save(); draw(); } }, "빼기"))) : null;
    const layerBox = group("레이어", "바탕 위에 겹쳐 놓는 그림입니다. 고르면 미리 보기의 초록 네모(처음 자리)와 보라 네모(끝 자리)를 끌어 자리를 정합니다. 카메라와 함께 움직입니다.",
      h("div", { class: "sn-rows" }, layers.map((l, k) => h("div", { class: "sn-row" + (k === st.layer && st.focus === "layer" ? " on" : ""), onclick: () => { st.layer = k; st.focus = "layer"; const nk = s.layers[k]; if (nk && (st.lt < nk.at || st.lt > nk.end)) st.lt = Math.round(Math.min(nk.end, nk.at + nk.fadeIn) * 100) / 100; draw(); } },
        h("span", { class: "sn-row-num" }, String(k + 1)),
        h("span", { class: "sn-row-text" }, l.name || (l.anim ? "애니메이션 " + animName(l.anim) : l.image ? names.file(l.image) : "그림 없음")),
        h("span", { class: "muted small" }, l.to ? "움직임" : "")))),
      h("div", { class: "row wrap" },
        h("button", { class: "btn small", onclick: () => pickImage("", (p) => { if (p) fitRect(p, (r) => addLayer({ image: p, rect: r })); }) }, "＋ 그림 레이어"),
        h("button", { class: "btn small", onclick: () => pickAnim("", (id) => {
          if (!id) return;
          const f = ((animOf(id) || {}).frames || [])[0];
          if (f) fitRect(f, (r) => addLayer({ anim: id, rect: r })); else addLayer({ anim: id, rect: [660, 440, 400, 200] });
        }, { allowNone: false }) }, "＋ 애니메이션 레이어")),
      layerForm);
    // 자막, 효과음, 흔들기, 번쩍
    const evRows = (key, title, help, make, cols) => {
      const list2 = d[key] || [];
      return group(title, help,
        h("div", { class: "sn-evs" }, list2.map((e, k) => h("div", { class: "sn-ev" },
          h("label", { class: "sn-mini" }, h("small", {}, "시각(초)"), numIn(e, "at", 0, { max: 60, width: 58 })),
          ...cols(e),
          h("button", { class: "icon sn-x", title: "빼기", onclick: () => { list2.splice(k, 1); if (!list2.length) delete d[key]; save(); draw(); } }, "✕")))),
        h("button", { class: "btn small", onclick: () => { d[key] = d[key] || []; d[key].push({ at: Math.round(Math.min(st.lt, s.time - 0.1) * 10) / 10, ...make() }); save(); draw(); } }, "＋ " + title));
    };
    const sayBox = evRows("say", "자막", "아래 검은 띠에 나오는 글입니다. 다음 자막이 나오거나 컷이 끝나면 사라집니다. 보이는 시간을 적으면 그만큼만 보입니다.", () => ({ text: "" }), (e) => [
      h("label", { class: "sn-mini grow" }, h("small", {}, "글"), h("input", { value: e.text || "", oninput: (ev) => { e.text = ev.target.value; touch(); } })),
      h("label", { class: "sn-mini" }, h("small", {}, "보이는 시간"), numIn(e, "time", 0, { optional: true, max: 60, width: 58 }))]);
    const soundBox = evRows("sound", "효과음", "장면 안의 효과음은 건너뛰면 바로 멈춥니다.", () => ({ path: S.catalog.assets.sounds[0] || "" }), (e) => [
      h("label", { class: "sn-mini grow" }, h("small", {}, "소리"), h("select", { onchange: (ev) => { e.path = ev.target.value; touch(); } },
        h("option", { value: "" }, "(소리 고르기)"),
        S.catalog.assets.sounds.map((p) => h("option", { value: p, selected: p === e.path }, names.file(p))),
        e.path && !S.catalog.assets.sounds.includes(e.path) ? h("option", { value: e.path, selected: true }, `${e.path} (없음!)`) : null)),
      h("button", { class: "icon", title: "들어 보기", onclick: () => { if (e.path) new Audio(asset(e.path)).play().catch(() => toast("이 브라우저에서는 소리를 재생할 수 없습니다.", "warn")); } }, "듣기"),
      h("label", { class: "sn-mini" }, h("small", {}, "크기"), numIn(e, "volume", 1, { optional: true, max: 2, width: 52 }))]);
    const shakeBox = evRows("shake", "흔들기", null, () => ({ strength: 12, time: 0.4 }), (e) => [
      h("label", { class: "sn-mini" }, h("small", {}, "세기(픽셀)"), numIn(e, "strength", 12, { max: 80, step: 1, width: 58 })),
      h("label", { class: "sn-mini" }, h("small", {}, "시간(초)"), numIn(e, "time", 0.4, { max: 10, width: 58 }))]);
    const flashBox = evRows("flash", "번쩍", null, () => ({ color: "#ffffff", time: 0.3 }), (e) => [
      h("label", { class: "sn-mini" }, h("small", {}, "색"), h("input", { type: "color", value: String(e.color || "#ffffff").slice(0, 7), oninput: (ev) => { e.color = ev.target.value; touch(); } })),
      h("label", { class: "sn-mini" }, h("small", {}, "사라지는 시간"), numIn(e, "time", 0.4, { max: 10, width: 58 }))]);
    fill(props,
      h("div", { class: "ae-col-title" }, `${i + 1}번 컷 설정`),
      bgBox, timeBox, camBox, layerBox, sayBox, soundBox, shakeBox, flashBox);
  };

  const draw = () => { drawList(); drawPlayer(); drawStrip(); drawProps(); drawOverlay(); };

  root.append(
    h("div", { class: "ae-head" }, h("b", {}, "장면 편집기"),
      h("span", { class: "muted small" }, "그림 몇 장과 카메라, 레이어의 움직임으로 짧은 연출 장면을 만듭니다. 고친 것은 편집기의 '저장'을 누를 때 함께 저장됩니다."),
      h("span", { class: "spacer" }), h("button", { class: "btn", onclick: close }, "닫기")),
    h("div", { class: "ae-body sn-body" }, list,
      h("div", { class: "ae-main" }, h("div", { class: "sn-view-opts" },
        h("label", { class: "ae-chip", title: "멈춰 있을 때 카메라로 본 모습(게임에서 보이는 모습)을 봅니다. 끄면 그림 전체와 고치는 네모가 보입니다." },
          h("input", { type: "checkbox", checked: st.camView, onchange: (e) => { st.camView = e.target.checked; drawOverlay(); } }), " 카메라로 보기")), stageWrap, player, strip),
      props));
  document.body.append(root);
  draw();
  raf = requestAnimationFrame(tick);
  return { close };
}

// 검사: 장면 자체 (그림 없는 컷, 없는 그림 파일, 없는 애니메이션, 없는 소리, 늦은 시각)
export function checkScenes(add, imageExists, soundExists = () => true) {
  const anims = gameFile().data.animations || {};
  for (const [id, sc] of Object.entries(scenesData())) {
    const w = `장면 ${(sc && sc.name) || id}`;
    if (!sc || !Array.isArray(sc.shots) || !sc.shots.length) { add("warn", null, null, `${w}: 컷이 하나도 없습니다`); continue; }
    sc.shots.forEach((d, i) => {
      const sw = `${w} ${i + 1}번 컷`;
      if (!d || typeof d !== "object") return add("err", null, null, `${sw}: 읽을 수 없습니다`);
      const s = normShot(d);
      if (!d.bg && !d.anim) add("err", null, null, `${sw}: 바탕이 없습니다`, "그림, 지금 화면, 색, 애니메이션 가운데 하나를 정하세요.");
      if (s.bgKind === "image" && !imageExists(d.bg)) add("err", null, null, `${sw}: 바탕 그림 파일이 없습니다`);
      if (String(d.bg || "").startsWith("#") && s.bgKind !== "color") add("err", null, null, `${sw}: 바탕 색을 읽을 수 없습니다`);
      if (d.anim && !anims[d.anim]) add("err", null, null, `${sw}: 없는 애니메이션입니다`, "애니메이션 편집기(게임 메뉴)에서 만들거나 고르세요.");
      if (d.camera && [d.camera.from, d.camera.to].some((c) => Array.isArray(c) && c[2] < 1)) add("err", null, null, `${sw}: 카메라 배율은 1 이상이어야 합니다`);
      (d.layers || []).forEach((l, k) => {
        const lw = `${sw} 레이어 ${k + 1}`;
        if (!l.image && !l.anim) add("err", null, null, `${lw}: 그림이나 애니메이션을 고르세요`);
        if (l.image && !imageExists(l.image)) add("err", null, null, `${lw}: 그림 파일이 없습니다`);
        if (l.anim && !anims[l.anim]) add("err", null, null, `${lw}: 없는 애니메이션입니다`);
        if (!rectOfArr(l.rect)) add("err", null, null, `${lw}: 자리가 없습니다`);
      });
      (d.sound || []).forEach((e, k) => { if (!e.path || !soundExists(e.path)) add("err", null, null, `${sw} 효과음 ${k + 1}: ${e.path ? "소리 파일이 없습니다" : "소리를 고르세요"}`); });
      (d.say || []).forEach((e, k) => { if (!String(e.text || "").trim()) add("warn", null, null, `${sw} 자막 ${k + 1}: 글이 비어 있습니다`); });
      for (const [key, word] of [["say", "자막"], ["sound", "효과음"], ["shake", "흔들기"], ["flash", "번쩍"]])
        (d[key] || []).forEach((e, k) => { if (num(e.at, 0) >= s.time) add("warn", null, null, `${sw} ${word} ${k + 1}: 컷이 끝난 뒤라 나오지 않습니다`, "시각을 줄이거나 컷 길이를 늘리세요."); });
    });
  }
}
