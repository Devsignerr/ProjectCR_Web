// 편집기의 바탕: 상태, 데이터 접근, 이름, 검사, 되돌리기.
import * as M from "./model.js";
import { checkAnims } from "./anims.js";
import { checkScenes } from "./scenes.js";
import { josa } from "./words.js";
import * as L from "./labels.js";

export const REPO = { owner: "Devsignerr", repo: "ProjectCR_Data", branch: "main" };
export const GAME_URL = "../";
export const ROOM_DIR = "Data/Rooms/";
export const GAME_FILE = "Data/game.json";
export const LOCAL = typeof location !== "undefined" && new URLSearchParams(location.search).has("local");   // 시험용: ./local/ 의 파일을 읽기만 한다
export const CLICKABLE = new Set(["hotspot", "pickup", "drawer", "socket", "puzzle", "button"]);

export const S = {
  catalog: null,
  files: {},            // 경로 → {data, sha, dirty, orig(처음 읽은 JSON 글자)}
  roomId: null,
  viewPath: null,
  selected: null,       // 노드 경로 / null(방) / "__game" / "__problems"
  images: {},           // 편집기에서 올린 그림
  preview: false,
  showAll: false,
  sim: { flags: {}, states: {}, numbers: {}, items: {} },
  gh: null,
  problems: [],
  open: new WeakMap(),  // 펼친 줄
  justAdded: null,
};

// ------------------------------------------------------------------ DOM 도우미

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (sel) => document.querySelector(sel);
export const IMAGE_DIR = "Data/Images/";   // 편집기에서 올린 그림 (방 데이터 저장소)
export const asset = (res) => {
  const p = String(res).replace(/^res:\/\//, "");
  if (S.images && S.images[p]) return S.images[p].url;
  return "assets/" + p;
};

// 편집기에서 올린 그림: 경로 → {base64, url, pending(아직 저장 안 함)}
export function addImage(path, base64, pending) {
  const ext = path.split(".").pop().toLowerCase();
  const type = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  let url = "";
  if (typeof Blob !== "undefined" && typeof URL !== "undefined" && URL.createObjectURL) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    url = URL.createObjectURL(new Blob([bytes], { type }));
  }
  S.images[path] = { base64, url, pending };
}
export const pendingImages = () => Object.entries(S.images).filter(([, i]) => i.pending);
// 그 그림을 쓰는 곳 수 (방 데이터와 게임 공통. 그림 이름표는 빼고)
export function imageUses(res) {
  let n = 0;
  for (const f of Object.values(S.files)) {
    const d = f.data.names && f.data.names.files ? { ...f.data, names: { ...f.data.names, files: {} } } : f.data;
    n += JSON.stringify(d).split(JSON.stringify(res)).length - 1;
  }
  return n;
}

// 방 데이터의 "create"(편집기에서 만든 물건)를 카탈로그의 화면 목록에 넣는다 (씬에 없으므로)
export const CREATE_KEYS = { hotspot: ["show_if", "looks", "rules"], image: ["show_if", "looks"], pickup: ["show_if", "looks", "rules", "pickup"] };
export const CREATE_KIND = { hotspot: "누르는 곳", image: "그림 (누를 수 없음)", pickup: "줍는 아이템" };
export function syncCreated() {
  if (!S.catalog) return;
  for (const r of S.catalog.rooms) {
    const f = S.files[roomPath(r.id)];
    // 카탈로그를 만들 때 이미 게임에 들어간 새 물건도 있으므로, 같은 경로는 모두 빼고 데이터대로 다시 넣는다
    const made = new Set(f ? (f.data.objects || []).filter((o) => o.create).map((o) => o.node) : []);
    for (const v of r.views) v.nodes = v.nodes.filter((n) => !n.created && !made.has(n.path));
    if (!f) continue;
    for (const o of f.data.objects || []) {
      if (!o.create) continue;
      const parent = o.node.split("/").slice(0, -1).join("/");
      const v = r.views.find((x) => x.path === parent) || r.views.find((x) => x.nodes.some((n) => n.path === parent));
      if (!v) continue;
      const c = o.create;
      const kind = c.kind || "hotspot";
      const it = kind === "pickup" ? S.catalog.items.find((i) => i.id === c.item) : null;
      v.nodes.push({ path: o.node, name: o.node.split("/").pop(), kind, keys: CREATE_KEYS[kind] || [], rect: Array.isArray(c.rect) && c.rect.length === 4 ? c.rect.map((v) => (Number.isFinite(v) ? v : 0)) : [0, 0, 100, 100],
        texture: c.texture || (it && it.icon) || undefined, item: c.item, created: true, flip: !!c.flip });
    }
  }
}
export const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } },
  del: (k) => { try { localStorage.removeItem(k); } catch (_) { /* 저장 불가 */ } },
};

export function toast(msg, kind = "info", ms = 4000) {
  const t = h("div", { class: "toast " + kind }, msg);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), ms);
}

// 가운데 뜨는 창. buttons = [{label, kind, onclick(close)}]
export function modal(title, body, buttons = [], onClose = null) {
  const close = () => { if (!back.isConnected) return; back.remove(); if (onClose) onClose(); };
  const back = h("div", { class: "modal-back", onclick: (e) => { if (e.target === back) close(); } },
    h("div", { class: "modal" },
      h("div", { class: "modal-head" }, h("h2", {}, title), h("button", { class: "icon", onclick: close }, "✕")),
      h("div", { class: "modal-body" }, body),
      buttons.length ? h("div", { class: "modal-foot" }, buttons.map((b) => h("button", { class: b.kind || "", onclick: () => b.onclick(close) }, b.label))) : null));
  document.body.append(back);
  return close;
}

// 예/아니오를 묻는 편집기 창 (브라우저 기본 확인 창 대신). 예를 누르면 onYes.
export function ask(title, text, yesLabel, onYes, { danger = false, noLabel = "취소" } = {}) {
  modal(title, h("p", { class: "ask-text" }, text), [
    { label: noLabel, onclick: (c) => c() },
    { label: yesLabel, kind: danger ? "danger" : "primary", onclick: (c) => { c(); onYes(); } },
  ]);
  setTimeout(() => { const b = document.querySelector(".modal-back:last-child .modal-foot button:last-child"); if (b) b.focus(); }, 0);
}

// 한글 찾기: 글자를 자모로 풀어서 비교한다 ("초"로 "촛대"를, "ㅊㄷ"로 "촛대"를 찾는다)
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
function jamo(str, initialsOnly = false) {
  let out = "";
  for (const ch of String(str || "").toLowerCase()) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) { out += ch; continue; }
    const cho = Math.floor(c / 588), jung = Math.floor((c % 588) / 28), jong = c % 28;
    out += initialsOnly ? CHO[cho] : CHO[cho] + String.fromCharCode(0x314f + jung) + (jong ? String.fromCharCode(0x3130 + jong) : "");
  }
  return out;
}
export function matchText(hay, q) {
  q = String(q || "").trim().toLowerCase();
  if (!q) return true;
  const text = String(hay || "").toLowerCase();
  if (text.includes(q)) return true;
  if (/^[ㄱ-ㅎ]+$/.test(q)) return jamo(text, true).replace(/\s/g, "").includes(q);
  return jamo(text).includes(jamo(q));
}

// ------------------------------------------------------------------ 데이터 접근

export const roomPath = (id) => ROOM_DIR + id + ".json";
export const catRoom = (id = S.roomId) => S.catalog.rooms.find((r) => r.id === id);
export const allNodes = (id = S.roomId) => (catRoom(id) ? catRoom(id).views.flatMap((v) => v.nodes) : []);
export const catNode = (path, id = S.roomId) => allNodes(id).find((n) => n.path === path);

export function roomFile(id = S.roomId) {
  const p = roomPath(id);
  if (!S.files[p]) S.files[p] = { data: { version: 1, room: id, objects: [] }, sha: null, dirty: false, orig: null };
  return S.files[p];
}
export const roomData = (id = S.roomId) => roomFile(id).data;
export function gameFile() {
  if (!S.files[GAME_FILE]) S.files[GAME_FILE] = { data: { version: 1 }, sha: null, dirty: false, orig: null };
  return S.files[GAME_FILE];
}
export function allRoomData() {
  return Object.entries(S.files).filter(([p]) => p.startsWith(ROOM_DIR)).map(([, f]) => f.data);
}

export function objectOf(path, create = false, id = S.roomId) {
  const data = roomData(id);
  data.objects = data.objects || [];
  let obj = data.objects.find((o) => o.node === path);
  if (!obj && create) {
    obj = { node: path };
    data.objects.push(obj);
  }
  return obj || null;
}

// 화면을 다시 그리는 함수들 (app.js 가 채운다)
export const hooks = { afterChange: () => {} };

let changeTimer = 0;
export function markDirty(path = roomPath(S.roomId)) {
  const f = S.files[path] || roomFile();
  f.dirty = hooks.isDirty ? hooks.isDirty(f) : true;   // 고쳤다가 원래대로 돌아왔으면 '고침'이 아니다
  history.record();
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => hooks.afterChange(), 150);
}

// ------------------------------------------------------------------ 훑기

export function walkActions(list, fn) {
  for (const a of list || []) {
    fn(a);
    if (a.choices) for (const c of a.choices) walkActions(c.do, fn);
    if (Array.isArray(a.timeline)) walkActions(a.timeline, fn);   // 타임라인 안의 할 일
  }
}
export function walkConditions(list, fn) {
  for (const c of list || []) {
    fn(c);
    for (const k of ["any", "all", "not"]) if (c[k]) walkConditions(c[k], fn);
  }
}
// 물건 하나의 모든 할 일 / 조건
export function objectActions(o, fn) {
  for (const r of o.rules || []) walkActions(r.do, fn);
  for (const l of Object.values(o.on_state || {})) walkActions(l, fn);
  for (const a of o.auto || []) walkActions(a.do, fn);
  for (const k of ["on_solved", "on_wrong", "on_placed"]) walkActions(o[k], fn);
}
export function objectConditions(o, fn) {
  for (const r of o.rules || []) { walkConditions(r.if, fn); walkActions(r.do, (a) => { for (const c of a.choices || []) walkConditions(c.if, fn); }); }
  walkConditions(o.show_if, fn);
  walkConditions(o.when, fn);
  for (const l of o.looks || []) walkConditions(l.if, fn);
  for (const a of o.auto || []) walkConditions(a.if, fn);
}
export function everyAction(fn) {
  for (const d of allRoomData()) {
    walkActions(d.on_first_enter, fn);
    walkActions(d.on_enter, fn);
    for (const o of d.objects || []) objectActions(o, fn);
  }
  const g = gameFile().data;
  walkActions(g.item_default, fn);
  for (const e of Object.values(g.items || {})) { walkActions(e.on_inspect, fn); walkActions(e.on_wrong_use, fn); }
  for (const c of g.combos || []) walkActions(c.do, fn);
}
export function everyCondition(fn) {
  for (const d of allRoomData()) for (const o of d.objects || []) objectConditions(o, fn);
  for (const hint of (gameFile().data.hints || {}).list || []) { walkConditions(hint.if, fn); walkConditions(hint.done, fn); }
  for (const a of gameFile().data.achievements || []) walkConditions(a.if, fn);
}

// ------------------------------------------------------------------ 이름 목록

export const K = {
  flags() {
    const s = new Set(S.catalog.flags.filter((f) => !f.startsWith("visited_")));
    everyAction((a) => { for (const k of ["set", "unset", "toggle"]) if (k in a && !("number" in a)) s.add(a[k]); });
    everyCondition((c) => { if ("flag" in c) s.add(c.flag); });
    return [...s].filter(Boolean).sort();
  },
  writtenFlags() {
    const s = new Set(S.catalog.flags);
    everyAction((a) => { for (const k of ["set", "unset", "toggle"]) if (k in a && !("number" in a)) s.add(a[k]); });
    return s;
  },
  states() {
    const out = {};
    for (const d of allRoomData()) for (const o of d.objects || []) {
      if (Array.isArray(o.states) && o.states.length) out[stateNameOf(o)] = o.states;
    }
    return out;
  },
  numbers() {
    const s = new Set();
    everyAction((a) => { if ("number" in a) s.add(a.number); });
    everyCondition((c) => { if ("number" in c) s.add(c.number); });
    return [...s].filter(Boolean).sort();
  },
  timers() {
    const s = new Set();
    everyAction((a) => { if ("timer" in a) s.add(a.timer); });
    return [...s].filter(Boolean).sort();
  },
  notes() {
    const s = new Set();
    everyAction((a) => { if ("note" in a && !("number" in a)) s.add(a.note); });
    return [...s].filter(Boolean).sort();
  },
};

export const stateNameOf = (o) => o.name || o.node.split("/").pop();

// ------------------------------------------------------------------ 물건의 상태 (편집기의 중심)
// 상태가 있는 물건:
//  (1) 방 데이터에서 states 를 정한 물건. 게임은 물건 이름으로 상태를 기억한다.
//  (2) 스스로 상태가 바뀌는 장치(서랍, 퍼즐, 받침대 ...). 게임 안에서는 '일어난 일' 기록이지만 편집기에서는 상태로 보인다.
export const BUILTIN_STATES = { drawer: ["닫힘", "열림"], puzzle: ["안 풀림", "풀림"], socket: ["비어 있음", "놓임"], whenall: ["아직", "다 맞음"] };

// 그림이 없는 묶음이면 안에 든 첫 그림
export function thumbOf(path, roomId = S.roomId) {
  const nodes = allNodes(roomId);
  const n = nodes.find((x) => x.path === path);
  if (n && n.texture) return n.texture;
  const kid = nodes.find((x) => x.path.startsWith(path + "/") && x.texture);
  return kid ? kid.texture : null;
}
export function viewOf(path, roomId = S.roomId) {
  const r = catRoom(roomId);
  if (!r) return null;
  return r.views.find((v) => v.path === path) || r.views.find((v) => v.nodes.some((n) => n.path === path)) || null;
}

export function things() {
  const out = [];
  if (!S.catalog) return out;
  for (const r of S.catalog.rooms) for (const v of r.views) for (const n of v.nodes) {
    if (n.flag && BUILTIN_STATES[n.kind] && !isRemoved(n.path, r.id)) out.push({ room: r.id, path: n.path, key: n.flag, flag: true, values: BUILTIN_STATES[n.kind], builtIn: true });
  }
  for (const d of allRoomData()) for (const o of d.objects || []) {
    if (Array.isArray(o.states) && o.states.length && !(o.removed && !o.create)) out.push({ room: d.room, path: o.node, key: stateNameOf(o), flag: false, values: o.states, obj: o });
  }
  return out;
}
export const thingByState = (key) => things().find((t) => !t.flag && t.key === key) || null;
export const thingByFlag = (flag) => things().find((t) => t.flag && t.key === flag) || null;
export const thingName = (t) => (t.path ? names.object(t.path, t.room) : t.key);
export const thingOfNode = (path, roomId = S.roomId) => things().find((t) => t.room === roomId && t.path === path) || null;

// 조건 → {t(물건), value(상태), not}. 물건 상태가 아니면 null.
export function readCond(c) {
  const ty = M.conditionType(c);
  if (ty && ty.id === "state") {
    const t = thingByState(c.state) || { key: c.state, values: [], flag: false, missing: true };
    return { t, value: c.is ?? c.is_not ?? "", not: "is_not" in c };
  }
  if (ty && ty.id === "flag") {
    const t = thingByFlag(c.flag);
    if (t) return { t, value: t.values[c.on === false ? 0 : 1], not: false };
  }
  return null;
}
export function condFor(t, value, not = false) {
  if (t.flag) { const on = value === t.values[1]; return (not ? !on : on) ? { flag: t.key } : { flag: t.key, on: false }; }
  return not ? { state: t.key, is_not: value } : { state: t.key, is: value };
}
// 할 일 → {t, value, next}. 물건 상태 바꾸기가 아니면 null.
export function readAct(a) {
  const ty = M.actionType(a);
  if (!ty) return null;
  if (ty.id === "state" || ty.id === "stateNext") {
    const t = thingByState(a.state) || { key: a.state, values: [], flag: false, missing: true };
    return { t, value: a.to || "", next: !!a.next };
  }
  for (const k of ["set", "unset", "toggle"]) if (ty.id === k) {
    const t = thingByFlag(a[k]);
    if (t) return { t, value: t.values[k === "unset" ? 0 : 1], next: k === "toggle" };
  }
  return null;
}
export function actFor(t, value, next = false) {
  if (t.flag) return next ? { toggle: t.key } : value === t.values[1] ? { set: t.key } : { unset: t.key };
  return next ? { state: t.key, next: true } : { state: t.key, to: value };
}

// 한 파일(방 또는 게임 공통)의 모든 조건과 할 일 (타이머 안, 선택지까지)
function deepActs(list, fn) {
  walkActions(list, (a) => { fn(a); if (Array.isArray(a.do)) deepActs(a.do, fn); });
}
function eachIn(data, onCond, onAct) {
  const acts = (l) => deepActs(l, onAct);
  const conds = (l) => walkConditions(l, onCond);
  const choiceConds = (l) => deepActs(l, (a) => { for (const c of a.choices || []) conds(c.if); });
  if ("room" in data || "objects" in data) {
    acts(data.on_first_enter); acts(data.on_enter); conds(data.goal);
    choiceConds(data.on_first_enter); choiceConds(data.on_enter);
    for (const o of data.objects || []) {
      for (const r of o.rules || []) { conds(r.if); acts(r.do); choiceConds(r.do); }
      for (const k of ["on_solved", "on_wrong", "on_placed"]) { acts(o[k]); choiceConds(o[k]); }
      for (const l of Object.values(o.on_state || {})) { acts(l); choiceConds(l); }
      for (const a of o.auto || []) { conds(a.if); acts(a.do); choiceConds(a.do); }
      conds(o.show_if); conds(o.when);
      for (const l of o.looks || []) conds(l.if);
    }
  } else {
    acts(data.item_default);
    for (const e of Object.values(data.items || {})) { acts(e.on_inspect); acts(e.on_wrong_use); }
    for (const c of data.combos || []) acts(c.do);
    for (const hint of (data.hints || {}).list || []) { conds(hint.if); conds(hint.done); }
    for (const a of data.achievements || []) conds(a.if);
  }
}
// 모든 파일에 fn 을 하고, 바뀐 파일은 저장할 것으로 표시. fn 이 돌려준 수의 합.
function touchAll(fn) {
  let count = 0;
  for (const f of Object.values(S.files)) {
    const before = JSON.stringify(f.data);
    count += fn(f.data) || 0;
    if (JSON.stringify(f.data) !== before) f.dirty = hooks.isDirty ? hooks.isDirty(f) : true;
  }
  return count;
}

// 상태의 이름(= 물건 이름)이 바뀌면 그것을 쓰는 모든 곳도. 바꾼 곳 수.
export function renameStateKey(from, to) {
  if (!from || from === to) return 0;
  return touchAll((d) => {
    let n = 0;
    eachIn(d, (c) => { if (c.state === from) { c.state = to; n++; } }, (a) => { if ("state" in a && a.state === from) { a.state = to; n++; } });
    return n;
  });
}
// 상태 하나의 이름이 바뀌면 (예: 열림 → 활짝 열림)
export function renameStateValue(key, from, to) {
  if (!from || from === to) return 0;
  return touchAll((d) => {
    let n = 0;
    eachIn(d, (c) => {
      if (c.state !== key) return;
      if (c.is === from) { c.is = to; n++; }
      if (c.is_not === from) { c.is_not = to; n++; }
    }, (a) => { if (a.state === key && a.to === from) { a.to = to; n++; } });
    // '이 상태가 되면' 할 일의 이름표도
    for (const o of d.objects || []) if (o.on_state && o.on_state[from] && stateNameOf(o) === key) { o.on_state[to] = o.on_state[from]; delete o.on_state[from]; }
    for (const o of d.objects || []) if (stateNameOf(o) === key) for (const a of o.auto || []) { if (a.from === from) a.from = to; if (a.to === from) a.to = to; }
    return n;
  });
}
// 상태 하나를 쓰는 곳 수
export function stateValueUses(key, value) {
  let n = 0;
  for (const f of Object.values(S.files)) eachIn(f.data, (c) => { if (c.state === key && (c.is === value || c.is_not === value)) n++; }, (a) => { if (a.state === key && a.to === value) n++; });
  return n;
}
export function stateKeyUses(key) {
  let n = 0;
  for (const f of Object.values(S.files)) eachIn(f.data, (c) => { if (c.state === key) n++; }, (a) => { if ("state" in a && a.state === key) n++; });
  return n;
}
// 게임 전체에서 겹치지 않는 상태 이름 (물건 이름이 같으면 방 이름을 붙인다)
export function uniqueStateKey(name, roomId, self = null) {
  const taken = new Set(things().filter((t) => !t.flag && t.obj !== self).map((t) => t.key));
  if (!taken.has(name)) return name;
  let k = `${name} (${names.room(roomId)})`;
  for (let i = 2; taken.has(k); i++) k = `${name} ${i}`;
  return k;
}

// '일어난 일' 하나를 물건 상태로 바꾼다. values = [안 일어났을 때, 일어났을 때]
// 켜기 → 두 번째 상태로, 끄기 → 첫 번째로, 켜고 끄기 번갈아 → 다음 상태로. 바꾼 곳 수.
export function convertFlagToState(flag, key, values) {
  const [off, on] = values;
  const fresh = (x, v) => { for (const k of Object.keys(x)) delete x[k]; Object.assign(x, v); };
  const n = touchAll((d) => {
    let c = 0;
    eachIn(d, (x) => {
      if (!("flag" in x) || x.flag !== flag) return;
      fresh(x, { state: key, is: x.on === false ? off : on }); c++;
    }, (a) => {
      if ("number" in a) return;
      if (a.set === flag) { fresh(a, { state: key, to: on }); c++; }
      else if (a.unset === flag) { fresh(a, { state: key, to: off }); c++; }
      else if (a.toggle === flag) { fresh(a, { state: key, next: true }); c++; }
    });
    return c;
  });
  const g = gameFile().data;
  if (g.names && g.names.flags && g.names.flags[flag]) {
    delete g.names.flags[flag];
    if (!Object.keys(g.names.flags).length) delete g.names.flags;
    if (!Object.keys(g.names).length) delete g.names;
    gameFile().dirty = true;
  }
  return n;
}

// 한글 이름 (물건 이름이 있으면 그것)
// 사람이 붙인 한글 이름이 먼저, 없으면 자동 한글 이름(labels.js), 그것도 없으면 종류 이름.
// 영어 아이디(Room01, IA_Drawer01, bed01_lifted ...)는 화면에 보이지 않게 한다.
const nameStore = () => { const d = gameFile().data; return d.names || {}; };
export function setGameName(kind, id, value) {
  const d = gameFile().data;
  d.names = d.names || {};
  d.names[kind] = d.names[kind] || {};
  if (value) d.names[kind][id] = value; else delete d.names[kind][id];
  if (!Object.keys(d.names[kind]).length) delete d.names[kind];
  if (!Object.keys(d.names).length) delete d.names;
  markDirty(GAME_FILE);
}
// 오브젝트에 기능(규칙, 조건 ...)이 정해져 있는지. 이름만 있는 것은 아니다.
export const hasLogic = (o) => !!o && Object.keys(o).some((k) => !["node", "name", "memo", "layout", "removed"].includes(k));

// ------------------------------------------------------------------ 칸 맞추기 (그리드 스냅)
// 옮기거나 크기를 바꾸거나 새로 그릴 때 위치와 크기를 칸(게임 화면 픽셀)에 맞춘다. Alt 를 누른 채 끌면 잠깐 끈다.
export const SNAP_SIZES = [10, 20, 40, 80];
export const snapSettings = () => {
  if (!S.snapLoaded) {
    S.snapLoaded = true;
    try { const v = JSON.parse(store.get("projectcr-tool-snap") || "null"); if (v) { S.snapOn = !!v.on; S.snapSize = v.size; } } catch (_) { /* 처음 */ }
    if (S.snapOn === undefined) S.snapOn = true;
    if (!SNAP_SIZES.includes(S.snapSize)) S.snapSize = 20;
  }
  return { on: S.snapOn, size: S.snapSize };
};
export function setSnap(on, size) {
  S.snapOn = on; S.snapSize = size;
  store.set("projectcr-tool-snap", JSON.stringify({ on, size }));
}
// e: 마우스 이벤트 (Alt 면 맞추지 않음)
export const snapOn = (e) => snapSettings().on && !(e && e.altKey);
export const snapV = (v, e) => (snapOn(e) ? Math.round(v / S.snapSize) * S.snapSize : Math.round(v));

// ------------------------------------------------------------------ 배치 (옮기기, 크기, 지우기)
const goodRect = (r) => Array.isArray(r) && r.length === 4 && r.every((v) => Number.isFinite(v));
const parentOf = (p) => p.split("/").slice(0, -1).join("/");
// 지금 화면에서의 위치 [x, y, 가로, 세로] (게임 화면 1920x1080 기준). 옮긴 것과, 옮긴 묶음 안에 든 것까지 반영.
export function rectOf(n, roomId = S.roomId) {
  if (!n || !n.rect) return null;
  if (n.created) return n.rect;
  const o = objectOf(n.path, false, roomId);
  if (o && o.layout && goodRect(o.layout.rect)) return o.layout.rect;
  const [dx, dy] = shiftOf(parentOf(n.path), roomId);
  return [n.rect[0] + dx, n.rect[1] + dy, n.rect[2], n.rect[3]];
}
function shiftOf(path, roomId) {
  if (!path) return [0, 0];
  const n = catNode(path, roomId);
  if (!n || !n.rect) return shiftOf(parentOf(path), roomId);
  const e = rectOf(n, roomId);
  return [e[0] - n.rect[0], e[1] - n.rect[1]];
}
// 눈에 보이는 영역: 그림이 없는 묶음(예: 창문 = 닫힌 그림 + 열린 그림)이면 안에 든 그림들을 모두 감싸는 네모
export function boundsOf(n, roomId = S.roomId) {
  const own = rectOf(n, roomId);
  if (!own || n.texture || n.text || n.created) return own;
  const kids = allNodes(roomId).filter((x) => x.path.startsWith(n.path + "/") && x.rect && (x.texture || x.text) && !isRemoved(x.path, roomId)).map((x) => rectOf(x, roomId));
  if (!kids.length) return own;
  const x0 = Math.min(...kids.map((r) => r[0])), y0 = Math.min(...kids.map((r) => r[1]));
  const x1 = Math.max(...kids.map((r) => r[0] + r[2])), y1 = Math.max(...kids.map((r) => r[1] + r[3]));
  return [x0, y0, x1 - x0, y1 - y0];
}
const isGroupBox = (n) => !n.texture && !n.text && !n.created;
export { isGroupBox };

// 편집기에서 지운 물건이거나 지운 것 안에 들었나
export function isRemoved(path, roomId = S.roomId) {
  for (const o of roomData(roomId).objects || []) {
    if (o.removed && !o.create && (path === o.node || path.startsWith(o.node + "/"))) return true;
  }
  return false;
}

export const names = {
  room(id) {
    if (!id) return "?";
    const f = S.files[roomPath(id)];
    if (f && f.data && f.data.title) return f.data.title;
    const auto = L.autoRoom(id);
    if (auto !== "이름 없는 방" || !S.catalog) return auto;
    // 이름 없는 방이 여럿이면 번호로 구분한다 (방 칸에서 이름을 정하면 사라진다)
    const unnamed = S.catalog.rooms.filter((r) => { const g = S.files[roomPath(r.id)]; return !(g && g.data && g.data.title) && L.autoRoom(r.id) === auto; });
    return unnamed.length > 1 ? `${auto} ${unnamed.findIndex((r) => r.id === id) + 1}` : auto;
  },
  item(id) {
    if (!id) return "?";
    const it = S.catalog.items.find((i) => i.id === id);
    if (!it) return L.autoName(id) || "없는 아이템";
    const own = ((gameFile().data.items || {})[id] || {}).name;
    const name = own || it.name || L.autoName(id) || "이름 없는 아이템";
    // 같은 이름의 아이템이 또 있으면 번호를 붙인다 (열쇠 1, 열쇠 2). 이름은 '아이템' 화면에서 바꿀 수 있다.
    const nameOf = (x) => ((gameFile().data.items || {})[x.id] || {}).name || x.name || L.autoName(x.id) || "";
    const same = S.catalog.items.filter((x) => nameOf(x) === name);
    return same.length > 1 ? `${name} ${same.indexOf(it) + 1}` : name;
  },
  object(path, roomId = S.roomId) {
    const o = objectOf(path, false, roomId);
    if (o && o.name) return o.name;
    const n = catNode(path, roomId);
    const raw = String(path || "?").split("/").pop();
    const siblings = allNodes(roomId).filter((x) => L.baseKey(x.name) === L.baseKey(raw) && x.name !== raw).length > 0;
    return L.autoName(raw, siblings) || (n ? (M.KIND_LABEL[n.kind] || "물건") : "물건");
  },
  closeup(viewName) {
    const v = (catRoom() ? catRoom().views : []).find((x) => x.name === viewName);
    return v ? names.object(v.path) : (L.autoName(viewName) || "크게 보기 화면");
  },
  node(nameOrPath) {
    if (!nameOrPath) return "?";
    if (String(nameOrPath).includes("/")) return names.object(nameOrPath);
    const n = allNodes().find((x) => x.name === nameOrPath);
    return n ? names.object(n.path) : (L.autoName(nameOrPath) || "물건");
  },
  // 장치의 상태로 보이는 '일어난 일' → {name, values}
  thingFlag(id) { const t = thingByFlag(id); return t ? { name: thingName(t), values: t.values } : null; },
  flag(id) {
    if (!id) return "?";
    const own = (nameStore().flags || {})[id];
    if (own) return own;
    if (!L.hasLatin(id)) return id;                 // 한글로 만든 것은 그대로
    return L.autoFlag(id, names.room) || "이름 없는 일";
  },
  anim(id) { const a = ((gameFile().data.animations || {})[id]); return a ? a.name || "이름 없는 애니메이션" : id ? "없는 애니메이션" : "?"; },
  scene(id) { const s = ((gameFile().data.scenes || {})[id]); return s ? s.name || "이름 없는 장면" : id ? "없는 장면" : "?"; },
  collectible(id) { const c = (gameFile().data.collectibles || []).find((x) => x.id === id); return (c && c.title) || id || "?"; },
  achievement(id) { const a = (gameFile().data.achievements || []).find((x) => x.id === id); return (a && a.title) || id || "?"; },
  file(path) {
    if (!path) return "?";
    const own = (nameStore().files || {})[path];
    if (own) return own;
    // 그림이면 그 그림을 쓰는 물건의 이름
    for (const r of S.catalog.rooms) for (const v of r.views) for (const n of v.nodes) if (n.texture === path) return names.object(n.path, r.id);
    return L.autoFile(path) || (/.(wav|ogg|mp3)$/i.test(path) ? "이름 없는 소리" : "이름 없는 파일");
  },
};

// ------------------------------------------------------------------ 검사

function similar(word, list) {
  const w = String(word || "").toLowerCase();
  if (!w) return null;
  let best = null, bestScore = 0;
  for (const x of list) {
    const s = String(x).toLowerCase();
    let common = 0;
    for (const ch of new Set(w)) if (s.includes(ch)) common++;
    const score = common / Math.max(w.length, s.length);
    if (score > bestScore) { best = x; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

const KEY_WORD = { rules: "누르면", show_if: "보이는 조건", looks: "모습 바꾸기", pickup: "줍는 아이템", on_solved: "풀었을 때", on_wrong: "틀렸을 때", on_placed: "놓았을 때", when: "지켜보는 조건" };

// 할 일 / 조건 검사기 (방마다, 그리고 게임 공통에서 같이 쓴다)
function makeChecks(id, closeups, add, itemSet, itemHint, states, rooms, written) {
    const checkActs = (list, node, where) => walkActions(list, (a) => {
      const t = M.actionType(a);
      if (!t) return add("err", id, node, `${where}: 알 수 없는 할 일`);
      for (const k of ["give", "take"]) if (k in a && !itemSet.has(a[k])) add("err", id, node, a[k] ? `${where}: 없는 아이템입니다` : `${where}: 아이템을 고르지 않았습니다`, itemHint(a[k]));
      if (t.id === "stateNext" && !states[a.state]) add("err", id, node, a.state ? `${where}: ${josa(a.state, "이라는/라는")} 상태가 없습니다` : `${where}: 상태를 바꿀 물건을 고르지 않았습니다`, "물건에 상태를 먼저 만드세요.");
      if (t.id === "state") {
        if (!states[a.state]) add("err", id, node, a.state ? `${where}: ${josa(a.state, "이라는/라는")} 상태가 없습니다` : `${where}: 상태를 바꿀 물건을 고르지 않았습니다`, "물건에 상태를 먼저 만드세요.");
        else if (!states[a.state].includes(a.to)) add("err", id, node, a.to ? `${where}: ${a.state}에는 ${josa(a.to, "이라는/라는")} 상태가 없습니다` : `${where}: 바꿀 상태를 고르지 않았습니다`, `${a.state}의 상태: ${states[a.state].join(", ")}`);
      }
      if ("go" in a && !rooms.has(a.go)) add("err", id, node, a.go ? `${where}: 갈 방이 없는 방입니다` : `${where}: 갈 방을 고르지 않았습니다`);
      if ("closeup" in a && !closeups.includes(a.closeup)) add("err", id, node, a.closeup ? `${where}: 크게 볼 화면이 이 방에 없습니다` : `${where}: 크게 볼 화면을 고르지 않았습니다`);
      for (const k of ["set", "unset", "toggle"]) if (t.id === k && !a[k]) add("err", id, node, `${where}: 기록 이름이 비어 있습니다`);
      if (t.id === "say" && !String(a.say).trim()) add("warn", id, node, `${where}: 말할 내용이 비어 있습니다`);
      if (t.id === "ending" && !a.ending) add("err", id, node, `${where}: 엔딩 이름이 비어 있습니다`);
      const G = gameFile().data;
      if (t.id === "collect" && !(G.collectibles || []).some((c) => c.id === a.collect)) add("err", id, node, `${where}: 수집품을 고르세요. 목록은 '아이템, 힌트, 업적' 화면에 있습니다`);
      if (t.id === "achieve" && !(G.achievements || []).some((c) => c.id === a.achieve)) add("err", id, node, `${where}: 업적을 고르세요. 목록은 '아이템, 힌트, 업적' 화면에 있습니다`);
      if (t.id === "play") {
        if (!(G.animations || {})[a.play]) add("err", id, node, a.play ? `${where}: 없는 애니메이션입니다` : `${where}: 틀 애니메이션을 고르지 않았습니다`, "애니메이션 편집기(게임 메뉴)에서 만들거나 고르세요.");
        if (!a.on) add("err", id, node, `${where}: 애니메이션을 틀 물건을 고르지 않았습니다`);
        else if (id && !allNodes(id).some((x) => x.name === a.on)) add("err", id, node, `${where}: 애니메이션을 틀 물건이 이 방에 없습니다`);
      }
      if (t.id === "scene" && !(G.scenes || {})[a.scene]) add("err", id, node, a.scene ? `${where}: 없는 장면입니다` : `${where}: 틀 장면을 고르지 않았습니다`, "장면 편집기(게임 메뉴)에서 만들거나 고르세요.");
      if (t.id === "timer" && (!a.timer || !(a.seconds > 0))) add("err", id, node, `${where}: 타이머 이름과 시간을 정하세요. 시간은 0초보다 커야 합니다`);
    });
    const checkConds = (list, node, where) => walkConditions(list, (c) => {
      const t = M.conditionType(c);
      if (!t) return add("err", id, node, `${where}: 알 수 없는 조건`);
      if ("has" in c && !itemSet.has(c.has)) add("err", id, node, c.has ? `${where}: 없는 아이템입니다` : `${where}: 아이템을 고르지 않았습니다`, itemHint(c.has));
      if (t.id === "state") {
        const v = c.is ?? c.is_not;
        if (!states[c.state]) add("err", id, node, c.state ? `${where}: ${josa(c.state, "이라는/라는")} 상태가 없습니다` : `${where}: 어느 물건의 상태인지 고르지 않았습니다`, "물건에 상태를 먼저 만드세요.");
        else if (!states[c.state].includes(v)) add("err", id, node, v ? `${where}: ${c.state}에는 ${josa(v, "이라는/라는")} 상태가 없습니다` : `${where}: 상태를 고르지 않았습니다`, `${c.state}의 상태: ${states[c.state].join(", ")}`);
      }
      if (t.id === "flag" && c.flag && !written.has(c.flag)) {
        const s = similar(c.flag, [...written]);
        add("warn", id, node, `${where}: '${names.flag(c.flag)}' 기록을 남기는 곳이 없습니다. 이름에 오타가 있을 수 있습니다`, s ? `혹시 '${names.flag(s)}' 기록을 말한 것인가요?` : null);
      }
      if (t.id === "room" && !rooms.has(c.room)) add("err", id, node, `${where}: 없는 방입니다`);
      const G = gameFile().data;
      if (t.id === "collected" && !(G.collectibles || []).some((x) => x.id === c.collected)) add("err", id, node, `${where}: 수집품을 고르세요`);
      if (t.id === "achieved" && !(G.achievements || []).some((x) => x.id === c.achieved)) add("err", id, node, `${where}: 업적을 고르세요`);
    });
    return { checkActs, checkConds };
}

export function validate() {
  const out = [];
  const items = S.catalog.items.map((i) => i.id);
  const itemSet = new Set(items);
  const rooms = new Set(S.catalog.rooms.map((r) => r.id));
  const states = K.states();
  const written = K.writtenFlags();
  const seenStates = {};
  const add = (level, roomId, node, msg, hint) => out.push({ level, roomId, node, msg, hint });
  const itemHint = (id) => { const s = similar(id, items); return s ? `혹시 ${names.item(s)}?` : "아이템 목록에서 다시 고르세요."; };

  for (const d of allRoomData()) {
    const id = d.room;
    const cr = catRoom(id);
    const closeups = cr ? cr.views.filter((v) => v.closeup).map((v) => v.name) : [];
    const { checkActs, checkConds } = makeChecks(id, closeups, add, itemSet, itemHint, states, rooms, written);
    checkActs(d.on_first_enter, null, "처음 들어올 때");
    checkActs(d.on_enter, null, "들어올 때마다");
    for (const o of d.objects || []) {
      const n = cr && cr.views.flatMap((v) => v.nodes).find((x) => x.path === o.node);
      const label = names.object(o.node, id);
      if (o.create) {
        const c = o.create;
        if (!["hotspot", "image", "pickup"].includes(c.kind || "hotspot")) add("err", id, o.node, `${label}: 종류를 고르세요`);
        if (!Array.isArray(c.rect) || c.rect.length !== 4 || !c.rect.every((v) => Number.isFinite(v))) add("err", id, o.node, `${label}: 위치와 크기가 없습니다`);
        if (c.kind === "pickup" && !itemSet.has(c.item)) add("err", id, o.node, `${label}: 줍는 아이템을 고르세요`);
        if (c.kind === "image" && !c.texture) add("warn", id, o.node, `${label}: 그림을 고르지 않아 아무것도 보이지 않습니다`);
        if (c.texture && !S.catalog.assets.images.includes(c.texture) && !S.images[String(c.texture).replace(/^res:\/\//, "")]) add("err", id, o.node, `${label}: 그림 파일이 없습니다`);
      }
      if (o.layout && !goodRect(o.layout.rect)) add("err", id, o.node, `${label}: 옮긴 위치가 잘못되었습니다`, "물건을 고르고 '원래 자리로'를 누르거나 다시 옮기세요.");
      if (!n) { add("err", id, o.node, `${josa(label, "이/가")} 게임 화면에 없습니다`, "게임 화면 파일에서 지워졌거나 이름이 바뀌었습니다. 개발이나 아트 담당에게 물어보세요."); continue; }
      for (const k of Object.keys(o)) {
        if (["node", "name", "states", "on_state", "auto", "memo", "fade_in", "fade_out", "blend", "create", "layout", "removed"].includes(k)) continue;
        if (!n.keys.includes(k)) add("err", id, o.node, `${label}: 이 물건에는 ${josa(KEY_WORD[k] || k, "을/를")} 정할 수 없습니다`);
      }
      if (o.states) {
        if (seenStates[label]) add("err", id, o.node, `${seenStates[label]}에도 같은 이름 ${josa(label, "이/가")} 있습니다`, "상태가 있는 물건은 게임 전체에서 이름이 겹치면 안 됩니다.");
        seenStates[label] = names.room(id);
        if (new Set(o.states).size !== o.states.length) add("err", id, o.node, `${label}: 같은 상태 이름이 두 번 있습니다`);
      }
      const normals = (o.rules || []).filter((r) => !r.item);
      normals.forEach((r, i) => {
        if (!(r.if || []).length && i < normals.length - 1) add("warn", id, o.node, `${label}: 조건 없는 경우가 맨 아래에 있지 않아서 그 아래 경우는 실행되지 않습니다`, "'그 밖에는'은 맨 아래로 옮기세요.");
      });
      (o.rules || []).forEach((r, i) => {
        const w = `${label} 경우 ${i + 1}`;
        if (!(r.do || []).length) add("err", id, o.node, `${w}: 할 일이 없습니다`);
        if (r.item && !itemSet.has(r.item)) add("err", id, o.node, `${w}: 없는 아이템입니다`, itemHint(r.item));
        checkConds(r.if, o.node, w);
        checkActs(r.do, o.node, w);
      });
      checkConds(o.show_if, o.node, `${label} 보이는 조건`);
      checkConds(o.when, o.node, `${label} 지켜보는 조건`);
      (o.looks || []).forEach((l, i) => {
        checkConds(l.if, o.node, `${label} 모습 ${i + 1}`);
        if (l.anim && !(gameFile().data.animations || {})[l.anim]) add("err", id, o.node, `${label} 모습 ${i + 1}: 없는 애니메이션입니다`);
      });
      for (const k of ["on_solved", "on_wrong", "on_placed"]) checkActs(o[k], o.node, `${label}`);
      for (const [v, l] of Object.entries(o.on_state || {})) {
        if (!(o.states || []).includes(v)) add("err", id, o.node, `${label}: ${josa(v, "이라는/라는")} 상태는 없는데, 그 상태가 되면 할 일이 남아 있습니다`, "상태 이름이 바뀌었거나 지워졌습니다.");
        checkActs(l, o.node, `${josa(label, "이/가")} ${v} 상태가 되면`);
      }
      (o.auto || []).forEach((a, i) => {
        const w = `${label}의 저절로 바뀌기 ${i + 1}`;
        if (!(o.states || []).includes(a.to)) add("err", id, o.node, `${w}: 바뀔 상태를 고르세요`);
        if (a.from && !(o.states || []).includes(a.from)) add("err", id, o.node, `${w}: ${josa(a.from, "이라는/라는")} 상태가 없습니다`);
        if (!(a.if || []).length) add("warn", id, o.node, `${w}: 조건이 없어서 그 상태가 되자마자 바로 바뀝니다`);
        checkConds(a.if, o.node, w);
        checkActs(a.do, o.node, w);
      });
      if (o.pickup && !itemSet.has(o.pickup)) add("err", id, o.node, `${label}: 없는 아이템입니다`, itemHint(o.pickup));
    }
  }
  // 게임 공통: 아이템, 조합, 힌트 (문제를 누르면 아이템 화면으로)
  const g = gameFile().data;
  const gAdd = (level, roomId, node, msg, hint) => out.push({ level, roomId: null, node: "__items", msg, hint });
  const allCloseups = S.catalog.rooms.flatMap((r) => r.views.filter((v) => v.closeup).map((v) => v.name));
  const gc = makeChecks(null, allCloseups, gAdd, itemSet, itemHint, states, rooms, written);
  for (const [iid, e] of Object.entries(g.items || {})) {
    const label = `아이템 ${names.item(iid)}`;
    if (!itemSet.has(iid)) gAdd("warn", null, null, `${label}: 게임에 없는 아이템입니다. 지워졌거나 이름이 바뀌었습니다`);
    gc.checkActs(e.on_inspect, null, label + " 조사할 때");
    gc.checkActs(e.on_wrong_use, null, label + " 맞지 않는 곳에 썼을 때");
  }
  (g.combos || []).forEach((c, i) => {
    const w = `조합 ${i + 1}`;
    if (!itemSet.has(c.a) || !itemSet.has(c.b)) gAdd("err", null, null, `${w}: 조합할 아이템 두 개를 모두 고르세요`);
    else if (c.a === c.b) gAdd("err", null, null, `${w}: 같은 아이템끼리는 조합할 수 없습니다`);
    if (c.result && !itemSet.has(c.result)) gAdd("err", null, null, `${w}: 없는 아이템입니다`);
    if (!c.result && !(c.do || []).length) gAdd("warn", null, null, `${w}: 결과 아이템도 할 일도 없어 조합해도 아무 일이 없습니다`);
    gc.checkActs(c.do, null, w);
  });
  ((g.hints || {}).list || []).forEach((hint, i) => {
    const w = `힌트 ${i + 1}${hint.note ? " (" + hint.note + ")" : ""}`;
    if (!(hint.lines || []).length) gAdd("err", null, null, `${w}: 힌트 문장이 없습니다`);
    gc.checkConds(hint.if, null, w + " 보이는 조건");
    gc.checkConds(hint.done, null, w + " 끝나는 조건");
  });
  (g.achievements || []).forEach((a, i) => {
    const w = `업적 ${i + 1}${a.title ? " (" + a.title + ")" : ""}`;
    if (!a.title) gAdd("warn", null, null, `${w}: 이름이 없습니다`);
    gc.checkConds(a.if, null, w);
  });
  (g.chapters || []).forEach((c, i) => { if (!rooms.has(c.room)) gAdd("err", null, null, `장 ${i + 1}${c.title ? " (" + c.title + ")" : ""}: 첫 방을 고르세요`); });
  (g.collectibles || []).forEach((c, i) => { if (!c.title) gAdd("warn", null, null, `수집품 ${i + 1}: 이름이 없습니다`); });
  // 애니메이션
  checkAnims(gAdd, (f) => S.catalog.assets.images.includes(f) || !!S.images[String(f).slice("res://".length)]);
  // 장면
  checkScenes(gAdd, (f) => S.catalog.assets.images.includes(f) || !!S.images[String(f).replace(/^res:\/\//, "")], (f) => S.catalog.assets.sounds.includes(f));
  // 이름이 같은 아이템: 고를 때 헷갈리므로 알려 준다 (지금은 '열쇠 1', '열쇠 2'처럼 번호로 구분해서 보인다)
  const byName = {};
  for (const it of S.catalog.items) { const nm = ((g.items || {})[it.id] || {}).name || it.name; if (nm) (byName[nm] = byName[nm] || []).push(it.id); }
  for (const [nm, ids] of Object.entries(byName)) if (ids.length > 1) gAdd("info", null, null, `${josa(nm, "이라는/라는")} 이름의 아이템이 ${ids.length}개 있습니다`, "'아이템' 화면에서 서로 다른 이름을 붙이면 고르기 쉽습니다. 그 전까지는 번호를 붙여 구분합니다.");
  S.problems = out;
  return out;
}

// ------------------------------------------------------------------ 미리보기 계산

export function evalCond(c) {
  const t = M.conditionType(c);
  if (!t) return true;
  switch (t.id) {
    case "flag": return !!S.sim.flags[c.flag] === (c.on !== false);
    case "has": return !!S.sim.items[c.has] === (c.on !== false);
    case "state": {
      const st = K.states()[c.state] || [];
      const now = S.sim.states[c.state] ?? st[0];
      return "is_not" in c ? now !== c.is_not : now === c.is;
    }
    case "number": {
      const o = M.NUMBER_OPS.find((x) => x in c) || ">=";
      const a = S.sim.numbers[c.number] || 0, b = c[o];
      return { "=": a === b, "!=": a !== b, ">=": a >= b, "<=": a <= b, ">": a > b, "<": a < b }[o];
    }
    case "clicks": return false;
    case "room": return c.room === S.roomId;
    case "note": return c.on === false;
    case "any": return (c.any || []).some(evalCond);
    case "all": return (c.all || []).every(evalCond);
    case "not": return !(c.not || []).every(evalCond);
  }
  return true;
}

// ------------------------------------------------------------------ 되돌리기 / 자동 보관

const WORK_KEY = "projectcr-tool-work";

function snapshot() {
  const out = {};
  for (const [p, f] of Object.entries(S.files)) out[p] = { data: JSON.stringify(f.data), dirty: f.dirty };
  return out;
}

export const history = {
  past: [],
  future: [],
  last: 0,
  current: null,
  savedAt: -1,      // 저장한 때의 past 길이. 그보다 앞으로 되돌리면 저장한 내용까지 되돌린다는 것을 알린다
  reset() { this.past = []; this.future = []; this.current = snapshot(); this.savedAt = -1; },
  markSaved() { this.current = snapshot(); this.savedAt = this.past.length; },
  // 바뀔 때마다. 짧은 시간 안의 연속 입력은 한 번으로 묶는다.
  record() {
    const now = Date.now();
    const snap = snapshot();
    if (this.current && now - this.last > 800) {
      this.past.push(this.current);
      if (this.past.length > 100) this.past.shift();
    }
    this.current = snap;
    this.future = [];
    this.last = now;
    saveWork();
  },
  restore(snap) {
    for (const [p, s] of Object.entries(snap)) {
      if (!S.files[p]) S.files[p] = { sha: null, orig: null };
      S.files[p].data = JSON.parse(s.data);
      S.files[p].dirty = hooks.isDirty ? hooks.isDirty(S.files[p]) : s.dirty;
    }
    this.current = snap;
    saveWork();
  },
  undo() {
    if (!this.past.length) return false;
    if (this.past.length === this.savedAt) toast("이미 저장한 내용을 되돌립니다. 게임에도 되돌리려면 다시 저장하세요. 다시 하기(Ctrl+Y)로 되살릴 수 있습니다.", "warn", 8000);
    this.future.push(this.current);
    this.restore(this.past.pop());
    this.last = 0;
    return true;
  },
  redo() {
    if (!this.future.length) return false;
    this.past.push(this.current);
    this.restore(this.future.pop());
    this.last = 0;
    return true;
  },
};

// 저장 안 한 작업을 브라우저에 보관 (새로고침해도 남게)
export function saveWork() {
  const dirty = Object.entries(S.files).filter(([, f]) => f.dirty);
  if (!dirty.length) return store.del(WORK_KEY);
  const files = {};
  for (const [p, f] of dirty) files[p] = { data: f.data, sha: f.sha };
  store.set(WORK_KEY, JSON.stringify({ time: Date.now(), files }));
}
export function loadWork() {
  try { return JSON.parse(store.get(WORK_KEY) || "null"); } catch (_) { return null; }
}
export function clearWork() { store.del(WORK_KEY); }
