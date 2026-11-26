// 물건의 상태 — 편집기의 중심.
// 작업자는 "어떤 물건이 어떤 상태일 때 → 무엇을 한다" 로만 생각하면 된다.
//   1) 물건에 상태를 만든다 (예: 창문 → 닫힘, 열림)
//   2) 조건: 「창문」이 「열림」 상태이면    할 일: 「창문」을 다음 상태로 바꾼다
// 서랍/퍼즐/받침대 같은 장치는 스스로 상태가 있다 (게임 안에서는 '일어난 일' 기록, 편집기에서는 상태로 보임).
import * as M from "./model.js";
import {
  S, h, toast, modal, names, asset, allNodes, objectOf, markDirty, roomPath, things, thingName, thumbOf, viewOf,
  readCond, condFor, readAct, actFor, uniqueStateKey, renameStateValue, stateValueUses, stateKeyUses,
  thingOfNode, convertFlagToState, K, allRoomData, walkActions, CLICKABLE, roomData, gameFile, rectOf, evalCond, boundsOf, stateNameOf,
  ask, matchText,
} from "./core.js";
import { firstFrame, startAnimTicker } from "./anims.js";
import { renderPanel, ui, actLines, condLines } from "./editor.js";
import { condsSentence, actSentence, josa } from "./words.js";
import { timelineField } from "./timeline.js";

const replaceWith = (target, fresh) => { for (const k of Object.keys(target)) delete target[k]; Object.assign(target, fresh); };
const thumb = (tex, cls = "thumb small") => (tex ? h("img", { class: cls, src: asset(tex), alt: "" }) : h("div", { class: cls + " empty" }));

// 자주 쓰는 상태 이름 묶음 (누르면 채워짐)
export const STATE_PRESETS = [["닫힘", "열림"], ["잠김", "열림"], ["꺼짐", "켜짐"], ["덮임", "걷힘"], ["그대로", "바뀜"], ["없음", "있음"], ["처음", "중간", "끝"]];

// ------------------------------------------------------------------ 물건 + 상태 고르기

// mode: "cond" (조건) | "act" (할 일). onPick(t, value, {not, next})
export function pickState(mode, onPick, opts = {}) {
  let not = !!opts.not;
  let close;
  const search = h("input", { placeholder: "물건 이름으로 찾기", style: { flex: 1 } });
  const body = h("div", { class: "thing-list" });
  const done = (t, value, next = false) => { close(); onPick(t, value, { not, next }); };
  const row = (t) => {
    const cur = opts.current && opts.current.t.key === t.key ? opts.current : null;
    return h("div", { class: "thing-row" + (cur ? " on" : "") },
      thumb(thumbOf(t.path, t.room)),
      h("div", { class: "thing-main" },
        h("div", {}, h("b", {}, thingName(t)), t.builtIn ? h("span", { class: "muted" }, "  (스스로 바뀌는 장치)") : null),
        h("div", { class: "state-btns" },
          t.values.map((v, i) => h("button", { class: "state-btn" + (cur && !cur.next && cur.value === v ? " on" : ""), onclick: () => done(t, v) },
            v, i === 0 ? h("small", {}, " 처음") : null)),
          mode === "act" ? h("button", { class: "state-btn next" + (cur && cur.next ? " on" : ""), title: "누를 때마다 차례로 바뀝니다. 마지막 상태 다음에는 처음 상태로 돌아갑니다.", onclick: () => done(t, "", true) }, "다음 상태로") : null)));
  };
  const groupByView = (list, roomId) => {
    const groups = new Map();
    for (const t of list) {
      const v = viewOf(t.path, roomId);
      const label = v ? names.object(v.path, roomId) : "기타";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(t);
    }
    return [...groups].map(([label, ts]) => h("div", {}, h("div", { class: "list-head" }, label), ts.map(row)));
  };
  const draw = () => {
    const q = search.value.trim();
    const all = things().filter((t) => matchText(thingName(t), q) || t.values.some((v) => matchText(v, q)));
    const here = all.filter((t) => t.room === S.roomId);
    const others = all.filter((t) => t.room !== S.roomId);
    const byRoom = new Map();
    for (const t of others) { if (!byRoom.has(t.room)) byRoom.set(t.room, []); byRoom.get(t.room).push(t); }
    body.replaceChildren(
      here.length ? h("div", {}, groupByView(here, S.roomId)) : h("p", { class: "muted" }, q ? "이 방에는 찾는 물건이 없습니다." : "이 방에는 아직 상태가 있는 물건이 없습니다. 아래에서 만드세요."),
      byRoom.size ? h("details", { class: "other-rooms", open: !!q || !here.length },
        h("summary", {}, `다른 방의 물건 (${others.length})`),
        [...byRoom].map(([rid, ts]) => h("div", {}, h("div", { class: "list-head room" }, names.room(rid)), groupByView(ts, rid)))) : null,
      h("div", { class: "pick-more" },
        h("button", { class: "add", onclick: () => { close(); pickObject("상태를 만들 물건 고르기", (path) => makeStatesDialog(path, S.roomId, () => pickState(mode, onPick, opts))); } },
          "＋ 다른 물건에 상태 만들기")));
  };
  search.addEventListener("input", draw);
  draw();
  const top = h("div", { class: "row" }, search,
    mode === "cond" ? h("label", { class: "check" }, h("input", { type: "checkbox", checked: not, onchange: (e) => { not = e.target.checked; } }), " 그 상태가 '아닐 때'") : null);
  close = modal(mode === "cond" ? "어떤 물건이 어떤 상태일 때?" : "어떤 물건을 어떤 상태로 바꿀까요?",
    h("div", { class: "pick-wrap" },
      h("p", { class: "help" }, mode === "cond" ? "물건을 찾아서 상태를 누르세요." : "물건을 찾아서 바꿀 상태를 누르세요. '다음 상태로'를 고르면 누를 때마다 차례로 바뀝니다."),
      top, body));
  setTimeout(() => search.focus(), 0);
}

// 이 방의 물건 하나 고르기 (그림을 보고). filter(n) 으로 거를 수 있다.
export function pickObject(title, onPick, filter = null, allowThings = false) {
  let close;
  const search = h("input", { placeholder: "물건 이름으로 찾기", style: { width: "100%" } });
  const body = h("div", {});
  const room = S.roomId;
  const ok = (n) => n.rect && (n.kind === "group" || n.texture || CLICKABLE.has(n.kind)) && !n.path.endsWith("/Contents") && (allowThings || !thingOfNode(n.path)) && (!filter || filter(n));
  const draw = () => {
    const q = search.value.trim();
    const r = S.catalog.rooms.find((x) => x.id === room);
    body.replaceChildren(...(r ? r.views : []).map((v) => {
      const list = v.nodes.filter((n) => ok(n) && n.path !== v.path && matchText(names.object(n.path), q));
      if (!list.length) return "";
      return h("div", {}, h("div", { class: "list-head" }, names.object(v.path)),
        h("div", { class: "gallery-grid" }, list.map((n) => h("button", { class: "gallery-item", title: names.object(n.path), onclick: () => { close(); onPick(n.path); } },
          thumb(thumbOf(n.path), "g-img"), h("span", {}, names.object(n.path))))));
    }));
  };
  search.addEventListener("input", draw);
  draw();
  close = modal(title, h("div", { class: "gallery-wrap" }, search, body), [{ label: "닫기", onclick: (c) => c() }]);
}

// 물건에 상태 만들기: 이름들을 적는다 (첫 번째가 처음 상태)
export function makeStatesDialog(path, roomId, after) {
  const rows = h("div", { class: "state-inputs" });
  const addRow = (v = "") => {
    const i = rows.childElementCount;
    const inp = h("input", { value: v, placeholder: i === 0 ? "처음 상태 (예: 닫힘)" : i === 1 ? "다음 상태 (예: 열림)" : "그다음 상태" });
    rows.append(h("div", { class: "row" }, h("span", { class: "num" }, String(i + 1)), inp));
    return inp;
  };
  addRow(); addRow();
  const fill = (vals) => { rows.replaceChildren(); vals.forEach((v) => addRow(v)); };
  const presets = h("div", { class: "chips" }, STATE_PRESETS.map((p) => h("button", { class: "chip-btn", onclick: () => fill(p) }, p.join(", "))));
  modal(`${names.object(path, roomId)}의 상태 만들기`, h("div", {},
    h("p", { class: "help" }, "이 물건이 될 수 있는 모습(상태)을 적으세요. 첫 번째가 게임을 시작할 때의 상태입니다."),
    rows,
    h("button", { class: "add", onclick: () => addRow().focus() }, "＋ 상태 하나 더"),
    h("div", { class: "sub-title" }, "자주 쓰는 것 (누르면 채워짐)"), presets), [
    { label: "만들기", kind: "primary", onclick: (close) => {
      const vals = [...rows.querySelectorAll("input")].map((x) => x.value.trim()).filter(Boolean);
      if (vals.length < 2) return toast("상태를 두 개 이상 적어 주세요.", "warn");
      if (new Set(vals).size !== vals.length) return toast("같은 이름이 두 번 있습니다.", "warn");
      const obj = objectOf(path, true, roomId);
      obj.name = uniqueStateKey(obj.name || names.object(path, roomId), roomId, obj);
      obj.states = vals;
      markDirty(roomPath(roomId));
      close();
      toast(`${obj.name}에 상태 ${vals.length}개를 만들었습니다.`, "good");
      if (after) after(thingOfNode(path, roomId));
    } },
    { label: "취소", onclick: (c) => c() },
  ]);
  setTimeout(() => rows.querySelector("input").focus(), 0);
}

// ------------------------------------------------------------------ 아이템 고르기

export function pickItem(title, onPick) {
  let close;
  const search = h("input", { placeholder: "아이템 이름으로 찾기", style: { width: "100%" } });
  const body = h("div", { class: "gallery-grid" });
  const draw = () => {
    const q = search.value.trim();
    body.replaceChildren(...S.catalog.items.filter((i) => matchText(names.item(i.id), q)).map((i) =>
      h("button", { class: "gallery-item", onclick: () => { close(); onPick(i.id); } }, thumb(i.icon, "g-img"), h("span", {}, names.item(i.id)))));
  };
  search.addEventListener("input", draw);
  draw();
  close = modal(title, h("div", { class: "gallery-wrap" }, search, body), [{ label: "닫기", onclick: (c) => c() }]);
}

// ------------------------------------------------------------------ 조건 고르기 / 할 일 고르기

const card = (icon, title, ex, onclick) => h("button", { class: "pick-card", onclick }, icon ? h("span", { class: "pc-icon" }, icon) : null, h("span", { class: "pc-text" }, h("b", {}, title), h("small", {}, ex)));
const smallBtn = (label, onclick) => h("button", { class: "pick-small", onclick }, label);

// onPick(조건, 열어서 더 고칠지)
export function pickCondition(onPick) {
  let close;
  const go = (fn) => () => { close(); fn(); };
  const OTHER = M.CONDITIONS.filter((t) => !["state", "has", "clicks"].includes(t.id));
  close = modal("어떤 때?", h("div", { class: "pick-wrap" },
    h("div", { class: "pick-cards" },
      card(null, "물건이 어떤 상태일 때", "예: 창문이 열림 상태일 때", go(() => pickState("cond", (t, v, o) => onPick(condFor(t, v, o.not))))),
      card(null, "아이템이 있을 때", "예: 열쇠를 가지고 있을 때", go(() => pickItem("어떤 아이템?", (id) => chooseHas(id, onPick)))),
      card(null, "몇 번째로 누를 때", "예: 처음 누를 때, 두 번째부터", go(() => chooseClicks(onPick)))),
    h("div", { class: "sub-title" }, "그 밖에"),
    h("div", { class: "pick-smalls" }, OTHER.map((t) => smallBtn(t.label, go(() => onPick(t.make(), true)))))));
}

function chooseHas(id, onPick) {
  const it = names.item(id);
  const close = modal(`${it}`, h("div", { class: "pick-smalls col" },
    smallBtn("가지고 있을 때", () => { close(); onPick({ has: id }); }),
    smallBtn("가지고 있지 않을 때", () => { close(); onPick({ has: id, on: false }); }),
    smallBtn("지금은 없어도, 한 번이라도 얻었을 때", () => { close(); onPick({ has: id, ever: true }); })));
}

function chooseClicks(onPick) {
  const close = modal("몇 번째로 누를 때?", h("div", { class: "pick-smalls col" },
    smallBtn("처음 누를 때", () => { close(); onPick({ clicks: 1 }); }),
    smallBtn("두 번째부터 계속", () => { close(); onPick({ clicks: 2, or_more: true }); }),
    smallBtn("직접 정하기…", () => { close(); onPick({ clicks: 3 }, true); })));
}

// onPick(할 일, 열어서 더 고칠지)
export function pickAction(onPick) {
  let close;
  const go = (fn) => () => { close(); fn(); };
  const make = (id) => M.ACTIONS.find((t) => t.id === id).make();
  const SPECIAL = new Set(["state", "stateNext", "set", "unset", "toggle", "say", "give"]);
  const groups = M.ACTION_GROUPS.map((g) => [g, M.ACTIONS.filter((t) => t.group === g && !SPECIAL.has(t.id))]).filter(([, l]) => l.length);
  close = modal("무엇을 할까요?", h("div", { class: "pick-wrap" },
    h("div", { class: "pick-cards" },
      card(null, "자막 보여주기", "예: \"잠겨 있다.\"", go(() => onPick(make("say"), true))),
      card(null, "물건 상태 바꾸기", "예: 창문을 열림 상태로", go(() => pickState("act", (t, v, o) => onPick(actFor(t, v, o.next))))),
      card(null, "아이템 주기", "예: 열쇠를 얻는다", go(() => pickItem("어떤 아이템을 줄까요?", (id) => onPick({ give: id }))))),
    ...groups.map(([g, list]) => h("div", {}, h("div", { class: "sub-title" }, g), h("div", { class: "pick-smalls" }, list.map((t) => smallBtn(t.label, go(() => onPick(t.make(), true))))))),
    h("div", { class: "sub-title" }, "기록 (물건 상태로 나타낼 수 없는 일에만)"),
    h("div", { class: "pick-smalls" }, ["set", "unset", "toggle"].map((id) => smallBtn(M.ACTIONS.find((t) => t.id === id).label, go(() => onPick(make(id), true)))))));
}

// ------------------------------------------------------------------ 줄 안에서 고치기 (물건 상태 조건 / 할 일)

export function stateCondEditor(c, onCh, rerender) {
  const r = readCond(c);
  const set = (fresh) => { replaceWith(c, fresh); S.open.set(c, true); onCh(); rerender(); };
  const who = h("button", { class: "thing-pick", onclick: () => pickState("cond", (t, v, o) => set(condFor(t, v, o.not)), { current: r, not: r.not }) },
    thumb(r.t.path ? thumbOf(r.t.path, r.t.room) : null), r.t.missing ? (r.t.key ? `${r.t.key} (지금은 없는 물건)` : "물건 고르기") : thingName(r.t), " ▾");
  return h("div", { class: "state-edit" },
    h("div", { class: "row" }, h("span", { class: "se-label" }, "물건"), who),
    r.t.values.length ? h("div", { class: "state-btns" }, h("span", { class: "se-label" }, "상태"), r.t.values.map((v) => h("button", { class: "state-btn" + (v === r.value ? " on" : ""), onclick: () => set(condFor(r.t, v, r.not)) }, v))) : null,
    !r.t.flag && r.t.values.length ? h("label", { class: "check" }, h("input", { type: "checkbox", checked: r.not, onchange: (e) => set(condFor(r.t, r.value || r.t.values[0], e.target.checked)) }), " 이 상태가 아닐 때") : null);
}

export function stateActEditor(a, onCh, rerender) {
  const r = readAct(a);
  const set = (fresh) => { replaceWith(a, fresh); S.open.set(a, true); onCh(); rerender(); };
  const who = h("button", { class: "thing-pick", onclick: () => pickState("act", (t, v, o) => set(actFor(t, v, o.next)), { current: r }) },
    thumb(r.t.path ? thumbOf(r.t.path, r.t.room) : null), r.t.missing ? (r.t.key ? `${r.t.key} (지금은 없는 물건)` : "물건 고르기") : thingName(r.t), " ▾");
  return h("div", { class: "state-edit" },
    h("div", { class: "row" }, h("span", { class: "se-label" }, "물건"), who),
    h("div", { class: "state-btns" }, h("span", { class: "se-label" }, "바꿀 상태"),
      r.t.values.map((v) => h("button", { class: "state-btn" + (!r.next && v === r.value ? " on" : ""), onclick: () => set(actFor(r.t, v)) }, v)),
      r.t.values.length ? h("button", { class: "state-btn next" + (r.next ? " on" : ""), onclick: () => set(actFor(r.t, "", true)) }, "다음 상태로") : null));
}

// ------------------------------------------------------------------ 물건 칸: 상태 카드

// 이 물건이 상태를 가진 물건의 일부인지 (예: 「창문 (닫힌 모습)」 → 「창문」). 가장 가까운 위쪽.
export function ownerThing(path, roomId = S.roomId) {
  let p = path;
  while (p.includes("/")) {
    const t = thingOfNode(p, roomId);
    if (t) return t;
    p = p.split("/").slice(0, -1).join("/");
  }
  return null;
}

// 상태마다 보이는 것: show_if 가 이 물건 상태만으로 되어 있으면 읽고 쓴다. 다른 조건이 섞여 있으면 null.
function visibleIn(path, t) {
  const si = (objectOf(path) || {}).show_if || [];
  if (!si.length) return new Set(t.values);
  if (si.length !== 1) return null;
  const r = readCond(si[0]);
  if (r && r.t.key === t.key) return new Set(t.values.filter((v) => (r.not ? v !== r.value : v === r.value)));
  const any = si[0].any;
  if (any && any.length && any.every((c) => { const x = readCond(c); return x && x.t.key === t.key && !x.not; })) return new Set(any.map((c) => readCond(c).value));
  return null;
}
function setVisibleIn(path, t, set) {
  const o = objectOf(path, true);
  const list = t.values.filter((v) => set.has(v));
  if (list.length === t.values.length) delete o.show_if;
  else if (list.length === 1) o.show_if = [condFor(t, list[0])];
  else o.show_if = [{ any: list.map((v) => condFor(t, v)) }];
}

// 상태 하나의 모습(그림): looks 중 조건이 「이 물건 = 그 상태」 하나뿐인 것
function lookFor(obj, t, v) {
  return (obj.looks || []).find((l) => (l.if || []).length === 1 && (() => { const r = readCond(l.if[0]); return r && r.t.key === t.key && !r.not && r.value === v; })());
}

// ------------------------------------------------------------------ 상태 한눈에 (물건 칸 맨 위)
// 물건을 고르면 그 물건(또는 그 물건이 속한 묶음)의 상태를 상태마다 카드로 보여 준다:
//   이름 / 그 상태의 모습 / 어떻게 그 상태가 되나 / 그 상태가 되는 순간 할 일(연출) / 그 상태일 때 누르면

// 할 일 목록 안의 모든 할 일 (타이머 안, 선택지 안까지)
function deepActs(list, fn) {
  walkActions(list, (a) => { fn(a); if (Array.isArray(a.do)) deepActs(a.do, fn); });
}

// 이 물건의 상태를 바꾸는 곳들: [{room, node, label, value, next, from}]
//   from: 어느 상태에서 바뀔 수 있나 (Set). null 이면 어느 상태에서나.
//   경우의 조건과, 누르는 물건이 보이는 조건(그 물건과 위쪽 묶음의 '이럴 때만 보인다')을 함께 본다.
//   예) 닫힌 창문 그림은 창문이 닫힘일 때만 보이므로, 그것을 누르는 '다음 상태로'는 닫힘에서 열림으로만 간다.
function allowedFrom(t, conds) {
  let set = null;
  const meet = (s) => { set = set ? new Set([...set].filter((v) => s.has(v))) : s; };
  for (const c of conds || []) {
    const r = readCond(c);
    if (r && r.t.key === t.key && !!r.t.flag === !!t.flag) meet(new Set(t.values.filter((v) => (r.not ? v !== r.value : v === r.value))));
    if (c.any && c.any.length) {
      const parts = c.any.map((x) => readCond(x));
      if (parts.every((x) => x && x.t.key === t.key)) meet(new Set(t.values.filter((v) => parts.some((x) => (x.not ? v !== x.value : v === x.value)))));
    }
  }
  return set;
}
function visibleFrom(t, d, path) {
  const conds = [];
  for (let p = path; p && p.includes("/"); p = p.split("/").slice(0, -1).join("/")) {
    const o = (d.objects || []).find((x) => x.node === p);
    if (o && o.show_if) conds.push(...o.show_if);
  }
  return conds;
}
export function stateSources(t) {
  const out = [];
  // 한 목록 안의 할 일은 차례로 실행되므로, 앞에서 바꾼 상태가 다음 바꾸기의 출발점이 된다
  // (예: 퍼즐을 풀면 그대로, 색 입힘, 열쇠 그림자, 열쇠 나타남 순서로)
  const scan = (list, info, start = info.from) => {
    let cur = start;
    for (const a of list || []) {
      const r = readAct(a);
      if (r && r.t.key === t.key && !!r.t.flag === !!t.flag) {
        out.push({ ...info, from: cur, value: r.next ? null : r.value, next: r.next, act: a });
        if (r.next) cur = cur ? new Set([...cur].map((v) => t.values[(t.values.indexOf(v) + 1) % t.values.length])) : null;
        else cur = new Set([r.value]);
      }
      for (const ch of a.choices || []) scan(ch.do, { ...info, rule: null }, cur);
      if (Array.isArray(a.do)) scan(a.do, { ...info, rule: null }, null);   // 타이머: 몇 초 뒤라 그때의 상태는 모름
    }
  };
  for (const d of allRoomData()) {
    const here = d.room === S.roomId ? "" : `[${names.room(d.room)}] `;
    scan(d.on_first_enter, { room: d.room, label: here + "방에 처음 들어올 때", from: null });
    scan(d.on_enter, { room: d.room, label: here + "방에 들어올 때마다", from: null });
    for (const o of d.objects || []) {
      const nm = names.object(o.node, d.room);
      const vis = visibleFrom(t, d, o.node);
      const base = { room: d.room, node: o.node };
      for (const r of o.rules || []) {
        const when = r.item !== undefined ? `${nm}에 ${josa(names.item(r.item), "을/를")} 쓰면` : `${josa(nm, "을/를")} 누르면`;
        const cond = (r.if || []).length ? ` (${condsSentence(r.if, names)})` : "";
        scan(r.do, { ...base, short: when, label: here + when + cond, from: allowedFrom(t, [...vis, ...(r.if || [])]), rule: r, holder: o });
      }
      const from = allowedFrom(t, vis);
      scan(o.on_solved, { ...base, short: `${josa(nm, "을/를")} 풀면`, label: here + `${josa(nm, "을/를")} 풀면`, from });
      scan(o.on_wrong, { ...base, short: `${josa(nm, "을/를")} 틀리면`, label: here + `${josa(nm, "을/를")} 틀리면`, from });
      scan(o.on_placed, { ...base, short: `${nm}에 놓으면`, label: here + `${nm}에 아이템을 놓으면`, from });
      const same = d.room === t.room && o.node === t.path && Array.isArray(o.states) && stateNameOf(o) === t.key && !t.flag;
      for (const [v, l] of Object.entries(o.on_state || {})) {
        scan(l, { ...base, short: `${v} 상태가 되면`, label: here + `${josa(nm, "이/가")} ${v} 상태가 되면`, from: same ? new Set([v]) : null });
      }
      // 저절로 바뀌기 (조건이 맞는 순간)
      for (const e of o.auto || []) {
        const cond = (e.if || []).length ? `: ${condsSentence(e.if, names)}` : "";
        if (same) out.push({ ...base, short: "저절로" + (e.if && e.if.length ? ` (${condsSentence(e.if, names)})` : ""), label: here + "조건이 맞는 순간 저절로" + cond, from: e.from ? new Set([e.from]) : null, value: e.to, next: false, auto: e, holder: o });
        scan(e.do, { ...base, short: "저절로 바뀐 뒤", label: here + `${josa(nm, "이/가")} 저절로 바뀐 뒤`, from: null }, same ? new Set([e.to]) : null);
      }
    }
  }
  const g = gameFile().data;
  for (const c of g.combos || []) scan(c.do, { short: "조합하면", label: `${josa(names.item(c.a), "과/와")} ${josa(names.item(c.b), "을/를")} 조합하면`, from: null });
  for (const [id, e] of Object.entries(g.items || {})) scan(e.on_inspect, { short: "살펴보면", label: `${josa(names.item(id), "을/를")} 살펴보면`, from: null });
  // 장치는 스스로 바뀐다
  if (t.builtIn) {
    const how = t.values[1] === "풀림" ? "풀면" : t.values[1] === "놓임" ? "알맞은 아이템을 놓으면" : t.values[1] === "열림" ? "누르면" : "조건이 모두 맞으면";
    out.push({ room: t.room, node: t.path, short: how, label: `${josa(thingName(t), "을/를")} ${how}`, value: t.values[1], next: false, from: new Set([t.values[0]]), self: true });
  }
  return out;
}
const editable = (s) => !!(s.rule || s.auto);

// 상태가 바뀌는 길: [{from, to, srcs}]. 같은 길은 하나로 묶는다.
export function stateEdges(t, sources = stateSources(t)) {
  const map = new Map();
  const n = t.values.length;
  for (const s of sources) {
    if (!s.from && !s.next && n > 2) {
      const k = "*\u0000" + s.value;
      if (!map.has(k)) map.set(k, { from: "*", to: s.value, srcs: [] });
      map.get(k).srcs.push(s);
      continue;
    }
    const froms = s.from ? [...s.from] : t.values;
    for (const f of froms) {
      const i = t.values.indexOf(f);
      if (i < 0) continue;
      const to = s.next ? t.values[(i + 1) % n] : s.value;
      if (!to || to === f || !t.values.includes(to)) continue;
      const k = f + "\u0000" + to;
      if (!map.has(k)) map.set(k, { from: f, to, srcs: [] });
      map.get(k).srcs.push(s);
    }
  }
  return [...map.values()];
}

// 상태 그래프: 상태는 그림이 든 칸, 바뀌는 길은 화살표.
//   상태 칸을 누르면 왼쪽 화면이 그 상태로 바뀐다.
//   상태 칸의 ＋ 를 끌어 다른 상태 칸에 놓으면 바뀌는 길이 생긴다. 화살표를 누르면 그 길을 고친다.
function stateGraph(t, allEdges, selected = null) {
  let edges = allEdges;
  const canEdit = !t.builtIn && !!t.obj;
  const n = t.values.length;
  const VW = 1000;
  const NW = Math.min(300, VW / n - 70), NH = 250;
  const span = (e) => Math.abs(t.values.indexOf(e.to) - t.values.indexOf(e.from));
  const anyEdges = edges.filter((e) => e.from === "*");
  edges = edges.filter((e) => e.from !== "*");
  const up = edges.filter((e) => t.values.indexOf(e.to) > t.values.indexOf(e.from));
  const down = edges.filter((e) => t.values.indexOf(e.to) < t.values.indexOf(e.from));
  const maxUp = Math.max(0, ...up.map(span)), maxDown = Math.max(0, ...down.map(span));
  const TOP = 30 + (up.length ? 70 + 45 * maxUp + (up.length > 1 ? 30 : 0) : 0);
  const VH = TOP + NH + 30 + Math.max(down.length ? 70 + 45 * maxDown + (down.length > 1 ? 30 : 0) : 0, anyEdges.length ? 110 : 0);
  const cx = (i) => (i + 0.5) * VW / n;
  const now = t.flag ? t.values[S.sim.flags[t.key] ? 1 : 0] : (S.sim.states[t.key] ?? t.values[0]);
  const ns = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, ...kids) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids); return e; };
  const svg = el("svg", { viewBox: `0 0 ${VW} ${VH}`, class: "sg-svg" },
    el("defs", {}, el("marker", { id: "sg-arrow", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" }, el("path", { d: "M0,0 L10,5 L0,10 z", fill: "currentColor" }))));
  const go = (s) => { if (!s.node) return; if (s.room && s.room !== S.roomId) ui.selectRoom(s.room, false); ui.select(s.node); };
  const openEdge = (e) => {
    const ed = e.srcs.filter(editable);
    const from = e.from === "*" ? "" : e.from;
    if (canEdit && ed.length === 1) return openTransition(t, { src: ed[0], from, to: e.to });
    if (canEdit && ed.length > 1) return chooseSource(t, e, ed, from);
    go(e.srcs.find((s) => s.node) || {});
  };
  // 이름표 글자 수: 화살표가 걸친 칸 사이 너비에 들어가는 만큼 (글자 하나 약 26)
  const labelOf = (e, prefix = "", room = VW / n * Math.max(1, span(e))) => {
    const text = prefix + (e.srcs.length === 1 ? (e.srcs[0].short || e.srcs[0].label) : `${e.srcs.length}가지`);
    const max = Math.max(4, Math.floor(room / 26) - 1);
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
  };
  const stagger = new Map();   // 같은 쪽(위/아래)에 있는 이름표들: 이웃하면 한 줄 비켜 놓는다
  [up, down].forEach((list) => [...list].sort((a, b) => Math.min(t.values.indexOf(a.from), t.values.indexOf(a.to)) - Math.min(t.values.indexOf(b.from), t.values.indexOf(b.to)))
    .forEach((e, k) => stagger.set(e, k % 2 ? 30 : 0)));
  for (const e of edges) {
    const i = t.values.indexOf(e.from), j = t.values.indexOf(e.to);
    const goingUp = j > i;
    const x1 = cx(i) + (goingUp ? 18 : -18), x2 = cx(j) + (goingUp ? -18 : 18);
    const y = goingUp ? TOP : TOP + NH;
    const lift = 55 + 45 * (span(e) - 1);
    const yc = goingUp ? y - lift * 2 : y + lift * 2;
    const g = el("g", { class: "sg-path" },
      el("path", { d: `M${x1},${y} Q${(x1 + x2) / 2},${yc} ${x2},${y}`, class: "sg-hit" }),
      el("path", { d: `M${x1},${y} Q${(x1 + x2) / 2},${yc} ${x2},${y}`, class: "sg-edge", "marker-end": "url(#sg-arrow)" }),
      el("text", { x: (x1 + x2) / 2, y: goingUp ? y - lift - 8 - stagger.get(e) : y + lift + 22 + stagger.get(e), class: "sg-label link", "text-anchor": "middle" }, labelOf(e)),
      el("title", {}, `${e.from}에서 ${josa(e.to, "으로/로")} 바뀌는 때:\n` + e.srcs.map((s) => s.label).join("\n") + (canEdit ? "\n\n누르면 이 길을 고칩니다." : "")));
    g.addEventListener("click", () => openEdge(e));
    svg.append(g);
  }
  for (const e of anyEdges) {
    const x = cx(t.values.indexOf(e.to)), y = TOP + NH;
    const g = el("g", { class: "sg-path" },
      el("path", { d: `M${x},${y + 80} L${x},${y + 4}`, class: "sg-hit" }),
      el("path", { d: `M${x},${y + 80} L${x},${y + 4}`, class: "sg-edge any", "marker-end": "url(#sg-arrow)" }),
      el("text", { x, y: y + 104, class: "sg-label link", "text-anchor": "middle" }, labelOf(e, "어느 상태에서나: ")),
      el("title", {}, `어느 상태에서나 ${josa(e.to, "으로/로")} 바뀌는 때:\n` + e.srcs.map((s2) => s2.label).join("\n")));
    g.addEventListener("click", () => openEdge(e));
    svg.append(g);
  }
  // 끌어서 길 만들기: 끄는 동안 점선
  const ghost = el("path", { class: "sg-edge ghost", d: "" });
  svg.append(ghost);
  const toView = (ev) => { const r = svg.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * VW, (ev.clientY - r.top) / r.height * VH]; };
  const startLink = (ev, i) => {
    ev.preventDefault(); ev.stopPropagation();
    const x0 = cx(i), y0 = TOP + NH / 2;
    const move = (m) => { const [x, y] = toView(m); ghost.setAttribute("d", `M${x0},${y0} L${x},${y}`); };
    const upFn = (m) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", upFn);
      ghost.setAttribute("d", "");
      const hit = document.elementFromPoint(m.clientX, m.clientY);
      const node = hit && hit.closest && hit.closest(".sg-node");
      const to = node ? node.dataset.v : null;
      if (to && to !== t.values[i]) openTransition(t, { from: t.values[i], to });
      else if (!to) toast("다른 상태 칸 위에 놓아야 길이 생깁니다.", "info");
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", upFn);
  };
  const nodes = t.values.map((v, i) => {
    const pic = statePreview(t, v);
    const handle = canEdit ? h("span", { class: "sg-handle", title: "끌어서 다른 상태 칸에 놓으면, 이 상태에서 그 상태로 바뀌는 길을 만듭니다" }, "+") : null;
    if (handle) { handle.addEventListener("mousedown", (ev) => startLink(ev, i)); handle.addEventListener("click", (ev) => ev.stopPropagation()); }
    return h("div", { class: "sg-node" + (v === now ? " now" : "") + (v === selected ? " sel" : "") + (i === 0 ? " first" : ""), "data-v": v, role: "button",
      title: "누르면 이 상태를 자세히 보고, 왼쪽 화면도 이 상태로 바뀝니다",
      style: { left: (cx(i) - NW / 2) / VW * 100 + "%", top: TOP / VH * 100 + "%", width: NW / VW * 100 + "%", height: NH / VH * 100 + "%" },
      onclick: () => {
        S.stateSel = S.stateSel || {};
        S.stateSel[t.key] = v;
        if (t.flag) S.sim.flags[t.key] = v === t.values[1]; else S.sim.states[t.key] = v;
        if (ui.renderStage) ui.renderStage();
        renderPanel();
      } },
      h("span", { class: "sg-name" }, v), i === 0 ? h("span", { class: "sg-tag" }, "처음") : null, v === now ? h("span", { class: "sg-tag now" }, "지금 화면") : null,
      pic ? h("span", { class: "sg-pic" }, pic) : null, handle);
  });
  const lonely = t.values.filter((v, i) => i > 0 && !edges.some((e) => e.to === v) && !anyEdges.some((e) => e.to === v));
  return h("div", { class: "sg-wrap" },
    h("div", { class: "sg", style: { aspectRatio: `${VW} / ${VH}` } }, svg, nodes),   // 글쓰기 규칙 예외
    h("p", { class: "sec-help" }, canEdit
      ? "상태 칸을 누르면 아래에서 그 상태를 고치고, 왼쪽 화면도 그 상태로 바뀝니다. 칸의 + 를 다른 칸으로 끌면 바뀌는 길이 생기고, 화살표를 누르면 그 길을 고칩니다."
      : "화살표는 상태가 바뀌는 길입니다. 상태 칸을 누르면 왼쪽 화면이 그 상태로 바뀝니다."),
    lonely.length ? h("p", { class: "warn-text small" }, `${lonely.join(", ")} 상태로 가는 길이 없습니다. 게임에서 이 상태가 될 수 없습니다.`) : null);
}

// 한 화살표에 길이 여럿이면 어느 것을 고칠지 고른다
function chooseSource(t, e, list, from) {
  const close = modal(`${e.from === "*" ? "어느 상태" : e.from}에서 ${josa(e.to, "으로/로")} 바뀌는 길 ${list.length}가지`, h("div", { class: "pick-smalls col" },
    list.map((s) => h("button", { class: "pick-small", onclick: () => { close(); openTransition(t, { src: s, from, to: e.to }); } }, s.label))),
    [{ label: "닫기", onclick: (c) => c() }]);
}

// ------------------------------------------------------------------ 바뀌는 길 (상태 전이) 고치기
// 길 하나 = 어느 상태에서 어느 상태로, 무엇을 하면, 어떤 조건일 때, 그때 할 일.
// 데이터로는 누르기와 아이템 쓰기는 그 물건의 '누르면' 경우 하나, 저절로는 상태를 가진 물건의 auto 하나다.
const TRIGGERS = [["click", "물건을 누르면"], ["item", "물건에 아이템을 쓰면"], ["auto", "조건이 맞는 순간 저절로"]];

// 새 길의 누를 물건: 그 물건이 누를 수 있으면 그것, 아니면 출발 상태에서 보이는 안의 물건
function defaultTrigger(t, from) {
  const nodes = allNodes(t.room);
  const self = nodes.find((n) => n.path === t.path);
  if (self && CLICKABLE.has(self.kind)) return t.path;
  const kids = nodes.filter((n) => n.path.startsWith(t.path + "/") && CLICKABLE.has(n.kind));
  const shownIn = (k) => { const v = visibleIn(k.path, t); return !v || !from || v.has(from); };
  const best = kids.find((k) => { const v = visibleIn(k.path, t); return v && from && v.has(from) && v.size < t.values.length; }) || kids.find(shownIn);
  return best ? best.path : null;
}

function modelOf(t, src, from, to) {
  if (src && src.auto) {
    return { kind: "auto", from: src.auto.from || "", to: src.auto.to, item: "", trigger: null, hasFromCond: true, next: false,
      extra: [...(src.auto.if || [])], effects: [...(src.auto.do || [])], auto: src.auto, holder: src.holder };
  }
  if (src && src.rule) {
    const r = src.rule;
    const fromCond = (r.if || []).find((c) => { const x = readCond(c); return x && x.t.key === t.key && !x.not; });
    const ra = src.act && readAct(src.act);
    return { kind: r.item !== undefined ? "item" : "click", item: r.item || "", trigger: src.node, from, to,
      hasFromCond: !!fromCond, next: !!(ra && ra.next),
      extra: (r.if || []).filter((c) => c !== fromCond), effects: (r.do || []).filter((a) => a !== src.act),
      rule: r, holder: src.holder, act: src.act };
  }
  return { kind: "click", item: "", trigger: defaultTrigger(t, from), from, to, hasFromCond: true, next: false, extra: [], effects: [], fresh: true };
}

// 모델을 데이터에 쓴다 (있던 자리에서 빼고 다시 넣는다. 같은 물건이면 같은 순서에)
function writeTransition(t, m) {
  const owner = t.obj;
  m.extra = m.extra || [];
  m.effects = m.effects || [];
  let at = -1, oldHolder = null;
  if (m.rule && m.holder) {
    oldHolder = m.holder;
    at = (m.holder.rules || []).indexOf(m.rule);
    m.holder.rules = (m.holder.rules || []).filter((x) => x !== m.rule);
    if (!m.holder.rules.length) delete m.holder.rules;
  }
  if (m.auto) { owner.auto = (owner.auto || []).filter((x) => x !== m.auto); if (!owner.auto.length) delete owner.auto; }
  m.rule = null; m.auto = null;
  if (m.deleted) return;
  if (m.kind === "auto") {
    if (!m.extra.length) { m.holder = null; return; }   // 조건 없는 저절로는 바로 바뀌어 버리므로 조건을 넣기 전에는 쓰지 않는다
    const e = { ...(m.from ? { from: m.from } : {}), to: m.to, if: [...m.extra], do: [...m.effects] };
    owner.auto = [...(owner.auto || []), e];
    m.auto = e; m.holder = owner;
    return;
  }
  if (!m.trigger) { m.holder = null; return; }   // 누를 물건을 고르기 전에는 쓰지 않는다
  const holder = objectOf(m.trigger, true, t.room);
  const stateAct = m.next && m.act ? m.act : actFor(t, m.to);
  const r = { ...(m.kind === "item" ? { item: m.item || "" } : {}), if: [...(m.hasFromCond && m.from ? [condFor(t, m.from)] : []), ...m.extra], do: [stateAct, ...m.effects] };
  if (!r.if.length) delete r.if;
  holder.rules = holder.rules || [];
  if (holder === oldHolder && at >= 0) holder.rules.splice(at, 0, r);
  else {
    const elseAt = holder.rules.findIndex((x) => x.item === undefined && !(x.if || []).length);
    if (elseAt >= 0) holder.rules.splice(elseAt, 0, r); else holder.rules.push(r);
  }
  m.rule = r; m.holder = holder; m.act = stateAct;
}

export function openTransition(t, init) {
  const m = modelOf(t, init.src, init.from, init.to);
  if (m.fresh) { writeTransition(t, m); markDirty(roomPath(t.room)); }   // 끌어서 만든 길은 바로 생긴다
  // 구조가 바뀌면 다시 그리고, 글자를 고칠 때는 조용히 저장하고 정리 문장만 바꾼다 (입력 칸이 사라지지 않게)
  const quiet = () => { writeTransition(t, m); markDirty(roomPath(t.room)); refresh(); };
  const save = () => { writeTransition(t, m); markDirty(roomPath(t.room)); draw(); };
  const body = h("div", { class: "tr-edit" });
  const noteBox = h("div", {});
  const sumBox = h("div", { class: "tr-summary" });
  let refresh = () => {};
  const select = (val, opts, onch) => h("select", { onchange: (e) => onch(e.target.value) }, opts.map(([v, l]) => h("option", { value: v, selected: v === val }, l)));
  const step = (num, title, ...kids) => h("div", { class: "tr-step" }, h("div", { class: "tr-num" }, num), h("div", { class: "tr-body" }, h("div", { class: "tr-title" }, title), ...kids));
  const draw = () => {
    refresh = () => {
    const nodeName = m.trigger ? names.object(m.trigger, t.room) : null;
    const it = m.item ? S.catalog.items.find((x) => x.id === m.item) : null;
    // 알려 줄 것
    const notes = [];
    if (m.kind !== "auto" && !m.trigger) notes.push(["warn", "누를 물건을 고르세요. 고르기 전에는 저장되지 않습니다."]);
    if (m.kind === "item" && !m.item) notes.push(["warn", "쓸 아이템을 고르세요."]);
    if (m.kind !== "auto" && m.trigger && m.from) {
      const v = visibleIn(m.trigger, t);
      if (v && !v.has(m.from)) notes.push(["warn", `${josa(nodeName, "은/는")} ${m.from} 상태일 때 보이지 않아서 누를 수 없습니다. 다른 물건을 고르세요.`]);
    }
    if (m.kind === "auto" && !m.extra.length) notes.push(["warn", "어떤 조건이 맞으면 바뀔지 아래에 넣으세요. 조건을 넣기 전에는 저장되지 않습니다."]);
    if (m.next) notes.push(["info", "이 길은 '다음 상태로 바꾸기'로 만들어져 있습니다. 바뀔 상태를 직접 고르면 이 길만 따로 정해집니다."]);
    // 한 문장으로 정리
    const fromText = m.from ? `${josa(thingName(t), "이/가")} ${m.from} 상태일 때 ` : "";
    const extraText = m.extra.length ? `${condsSentence(m.extra, names)}, ` : "";
    const how = m.kind === "auto" ? "조건이 맞는 순간 저절로" : m.kind === "item" ? `${nodeName || "(물건)"}에 ${josa(it ? names.item(m.item) : "(아이템)", "을/를")} 쓰면` : `${josa(nodeName || "(물건)", "을/를")} 누르면`;
    const summary = `${fromText}${extraText}${how} ${josa(thingName(t), "이/가")} ${m.to} 상태로 바뀝니다.` + (m.effects.length ? ` 그때 ${m.effects.map((a) => actSentence(a, names)).join(", ")}.` : "");
    noteBox.replaceChildren(...notes.map(([k, text]) => h("p", { class: k === "warn" ? "warn-text small" : "help small" }, text)));
    sumBox.replaceChildren(h("b", {}, "정리: "), summary);
    };
    refresh();
    const nodeName = m.trigger ? names.object(m.trigger, t.room) : null;
    const it = m.item ? S.catalog.items.find((x) => x.id === m.item) : null;
    body.replaceChildren(
      h("div", { class: "tr-head" },
        select(m.from, [["", "어느 상태에서나"], ...t.values.map((v) => [v, v])], (v) => { m.from = v; save(); }),
        h("span", { class: "tr-word" }, "상태에서"),
        select(m.to, t.values.map((v) => [v, v]), (v) => { m.to = v; m.next = false; save(); }),
        h("span", { class: "tr-word" }, "상태로 바뀝니다")),
      step("1", "무엇을 하면 바뀌나요?",
        h("div", { class: "tr-kinds" }, TRIGGERS.map(([k, l]) => h("button", { class: "tr-kind" + (m.kind === k ? " on" : ""),
          onclick: () => { if (k !== "auto" && !m.trigger) m.trigger = defaultTrigger(t, m.from); m.kind = k; save(); } }, l))),
        m.kind !== "auto" ? h("div", { class: "row" }, h("span", { class: "se-label" }, "누를 물건"),
          h("button", { class: "thing-pick", onclick: () => pickObject("누를 물건 고르기", (p) => { m.trigger = p; save(); }, (n) => CLICKABLE.has(n.kind), true) },
            thumb(m.trigger ? thumbOf(m.trigger, t.room) : null), nodeName || "물건 고르기", " ▾")) : null,
        m.kind === "item" ? h("div", { class: "row" }, h("span", { class: "se-label" }, "쓸 아이템"),
          h("button", { class: "thing-pick", onclick: () => pickItem("어떤 아이템을 쓰면 바뀌나요?", (id) => { m.item = id; save(); }) },
            thumb(it && it.icon), it ? names.item(m.item) : "아이템 고르기", " ▾")) : null,
        m.kind === "auto" ? h("p", { class: "help small" }, "아래 조건이 모두 맞는 순간, 누르지 않아도 저절로 바뀝니다. 예: 열쇠를 가지고 있을 때, 다른 물건이 어떤 상태일 때.") : null),
      step("2", m.kind === "auto" ? "어떤 조건이 맞으면?" : "그리고 이럴 때만 (없어도 됨)",
        condLines(m, "extra", quiet, m.kind === "auto" ? "아직 조건이 없습니다" : "조건 없음", "＋ 조건")),
      step("3", "바뀔 때 할 일 (연출, 대사)",
        timelineField(m, "effects", quiet, { target: t.path.split("/").pop() })),
      noteBox, sumBox);
  };
  draw();
  modal("바뀌는 길", body, [
    { label: "이 길 지우기", kind: "danger", onclick: (close) => {
      ask("길 지우기", "이 길을 지울까요? 되돌리기로 되살릴 수 있습니다.", "지우기", () => { m.deleted = true; writeTransition(t, m); markDirty(roomPath(t.room)); close(); }, { danger: true });
    } },
    { label: "다 됐어요", kind: "primary", onclick: (close) => {
      // 아직 저장되지 않은 길이면 무엇이 빠졌는지 알려 주고 창을 닫지 않는다
      const missing = m.kind === "auto" && !m.extra.length ? "어떤 조건이 맞으면 바뀔지 2번에 조건을 넣어야 길이 생깁니다."
        : m.kind !== "auto" && !m.trigger ? "1번에서 누를 물건을 골라야 길이 생깁니다."
        : m.kind === "item" && !m.item ? "1번에서 쓸 아이템을 골라야 합니다." : null;
      if (!missing) return close();
      ask("아직 길이 만들어지지 않았습니다", missing + " 이대로 닫으면 이 길은 없어집니다.", "그래도 닫기", () => close(), { noLabel: "계속 고치기" });
    } },
  ], () => renderPanel());
}

// 이 상태일 때 누르면: 같은 방에서 조건에 「이 물건 = 그 상태」가 들어간 경우들
function rulesIn(t, v) {
  const out = [];
  const d = roomData(t.room);
  for (const o of d.objects || []) (o.rules || []).forEach((r) => {
    const hit = (r.if || []).some((c) => { const x = readCond(c); return x && x.t.key === t.key && (x.not ? x.value !== v : x.value === v); });
    if (hit) out.push({ node: o.node, r });
  });
  return out;
}

// 그 상태일 때의 모습: 물건(묶음) 자리를 작게 그리고, 그 상태에서 보이는 것만
// 물건(묶음이면 안에 든 그림까지)이 지금 상황에서 어떻게 보이는지 작게 그린다.
//   setup 을 주면 잠깐 그 상황으로 바꿔서 그리고 되돌린다 (상태마다의 모습).
//   maxH: 높이 한도(픽셀). 지금 상황에서 안 보이면 원래 그림을 흐리게.
function drawPreview(roomId, rootPath, maxH = 160, setup = null) {
  const room = S.catalog.rooms.find((r) => r.id === roomId);
  const nodes = room ? room.views.flatMap((x) => x.nodes) : [];
  const own = nodes.find((x) => x.path === rootPath);
  const R = own && boundsOf(own, roomId);
  if (!R || !R[2] || !R[3]) return null;
  const save = { states: { ...S.sim.states }, flags: { ...S.sim.flags } };
  if (setup) setup();
  const parts = [];
  try {
    for (const n of nodes) {
      if (!(n.path === rootPath || n.path.startsWith(rootPath + "/")) || !n.rect) continue;
      // 이 물건 안의 경로가 모두 보여야
      let ok = true;
      for (let p = n.path; ok && (p === rootPath || p.startsWith(rootPath + "/")); p = p.split("/").slice(0, -1).join("/")) {
        const x = nodes.find((y) => y.path === p);
        const o = objectOf(p, false, roomId);
        if (o && o.removed) ok = false;
        else if (o && (o.show_if || []).length) ok = o.show_if.every(evalCond);
        else if (x && x.hidden && p !== rootPath) ok = false;
      }
      if (!ok) continue;
      const o = objectOf(n.path, false, roomId);
      let tex = n.texture;
      const l = o && (o.looks || []).find((x) => (x.if || []).every(evalCond));
      if (l && l.texture) tex = l.texture;
      if (l && l.anim && firstFrame(l.anim)) tex = firstFrame(l.anim);
      if (!tex) continue;
      const r = rectOf(n, roomId);
      parts.push(h("img", { src: asset(tex), alt: "", ...(l && l.anim ? { "data-anim": l.anim } : {}), style: { left: (r[0] - R[0]) / R[2] * 100 + "%", top: (r[1] - R[1]) / R[3] * 100 + "%", width: r[2] / R[2] * 100 + "%", height: r[3] / R[3] * 100 + "%", filter: l && l.tint ? "brightness(.6)" : "" } }));
    }
  } finally { S.sim.states = save.states; S.sim.flags = save.flags; }
  const hidden = !parts.length;
  if (hidden && own.texture) parts.push(h("img", { src: asset(own.texture), alt: "", class: "pv-hidden", style: { left: 0, top: 0, width: "100%", height: "100%" } }));
  // 비율을 지키며 높이 한도 안에 들어가게
  if (!parts.length) return h("div", { class: "state-pic no-pic" }, h("span", { class: "muted" }, "그림 없음"));
  return h("div", { class: "state-pic" + (hidden ? " hidden-now" : ""), title: hidden ? "지금 보는 상황에서는 보이지 않습니다" : "",
    style: { aspectRatio: `${R[2]} / ${R[3]}`, width: `min(100%, ${Math.round(maxH * R[2] / R[3])}px)` } },   // 글쓰기 규칙 예외
    parts.length ? parts : h("span", { class: "muted" }, "보이는 그림 없음"));
}
function statePreview(t, v) {
  return drawPreview(t.room, t.path, 160, () => { if (t.flag) S.sim.flags[t.key] = v === t.values[1]; else S.sim.states[t.key] = v; });
}
// 지금 보는 상황의 모습 (물건 칸 머리 그림)
export function previewNow(path, roomId = S.roomId, maxH = 56) {
  return drawPreview(roomId, path, maxH);
}

// 그 상태가 되는 순간의 연출: 자주 쓰는 것 바로 넣기
const EFFECTS = [["sound", "효과음"], ["animate", "움직이기"], ["shake", "흔들기"], ["flash", "번쩍"], ["say", "자막"]];

// ctx: { section, input, n, obj, onCh }
// 상태 칸: 그래프 하나와, 그래프에서 고른 상태 하나의 자세한 칸.
//   상태마다 할 수 있는 일(모습, 그 순간의 연출)은 고른 상태에서만 보여서 칸이 길어지지 않는다.
//   어떻게 그 상태가 되는지는 그래프의 화살표가, 그 상태일 때 누르면 무엇을 하는지는 '누르면' 칸이 맡는다.
export function statesCard(ctx) {
  const { section, input, n } = ctx;
  const own = thingOfNode(n.path);
  const t = own || ownerThing(n.path.split("/").slice(0, -1).join("/"));
  if (!t) {
    return section({ key: "states", title: "상태" }, null,
      h("div", { class: "empty-state" },
        h("p", {}, "여러 모습을 거치는 물건이면 상태를 만드세요. 창문이라면 닫힘과 열림, 화분이라면 씨앗, 싹, 꽃입니다."),
        h("button", { class: "btn primary", onclick: () => makeStatesDialog(n.path, S.roomId, () => renderPanel()) }, "＋ 상태 만들기")));
  }
  const isOwner = !!own;
  const obj = t.obj;
  const editable = !t.builtIn && obj;
  const change = () => markDirty(roomPath(t.room));
  const edges = stateEdges(t);
  // 자세히 볼 상태: 그래프에서 고른 것 (처음엔 왼쪽 화면이 보여 주는 상태)
  S.stateSel = S.stateSel || {};
  const now = t.flag ? t.values[S.sim.flags[t.key] ? 1 : 0] : (S.sim.states[t.key] ?? t.values[0]);
  const v = t.values.includes(S.stateSel[t.key]) ? S.stateSel[t.key] : now;
  const i = t.values.indexOf(v);

  let partNote = null;
  if (!isOwner) {
    const vis = visibleIn(n.path, t);
    partNote = h("p", { class: "note" }, "이 그림은 ", h("a", { onclick: () => ui.select(t.path) }, thingName(t)), "의 일부입니다. ",
      vis ? (vis.size === t.values.length ? "모든 상태에서 보입니다." : `${[...vis].join(", ")} 상태일 때 보입니다.`) : "다른 조건에 따라 보입니다.");
  }

  // 고른 상태 하나의 칸
  let detail = null;
  if (editable) {
    const ownNode = allNodes(t.room).find((x) => x.path === t.path);
    const canLook = ownNode && (ownNode.keys || []).includes("looks") && ownNode.texture;
    const look = lookFor(obj, t, v);
    const l = look || {};
    // 모습(그림, 애니메이션, 색) 가운데 하나라도 있으면 모습 목록에 두고, 다 비면 뺀다
    const lookCh = () => {
      obj.looks = obj.looks || [];
      const has = l.texture || l.anim || l.tint;
      if (has && !obj.looks.includes(l)) obj.looks.unshift(Object.assign(l, { if: [condFor(t, v)] }));
      if (!has && obj.looks.includes(l)) obj.looks = obj.looks.filter((x) => x !== l);
      if (!obj.looks.length) delete obj.looks;
      change(); renderPanel();
    };
    obj.on_state = obj.on_state || {};
    const addFx = (id) => {
      const a = M.ACTIONS.find((x) => x.id === id).make();
      S.justAdded = a;
      (obj.on_state[v] = obj.on_state[v] || []).push(a);
      change(); renderPanel();
    };
    detail = h("div", { class: "state-detail" },
      h("div", { class: "sd-head" },
        h("span", { class: "sd-label" }, i === 0 ? "처음 상태" : `${i + 1}번째 상태`),
        h("input", { class: "sd-name", value: v, title: "상태 이름. 고치면 이 상태를 쓰던 곳도 모두 바뀝니다.", onchange: (e) => {
          const nv = e.target.value.trim();
          if (!nv || nv === v) { e.target.value = v; return; }
          if (obj.states.includes(nv)) { toast("같은 이름의 상태가 이미 있습니다.", "warn"); e.target.value = v; return; }
          obj.states[i] = nv;
          const c = renameStateValue(t.key, v, nv);
          S.stateSel[t.key] = nv;
          if (S.sim.states[t.key] === v) S.sim.states[t.key] = nv;
          change();
          if (c) toast(`이 상태를 쓰던 ${c}곳도 ${josa(nv, "으로/로")} 바꿨습니다.`, "good");
          renderPanel();
        } }),
        h("span", { class: "spacer" }),
        h("button", { class: "btn icon", title: "앞으로 (맨 앞이 처음 상태)", disabled: i === 0, onclick: () => { [obj.states[i - 1], obj.states[i]] = [obj.states[i], obj.states[i - 1]]; change(); renderPanel(); } }, "←"),   // 글쓰기 규칙 예외
        h("button", { class: "btn icon", title: "뒤로", disabled: i === t.values.length - 1, onclick: () => { [obj.states[i + 1], obj.states[i]] = [obj.states[i], obj.states[i + 1]]; change(); renderPanel(); } }, "→"),   // 글쓰기 규칙 예외
        h("button", { class: "btn icon danger", title: "이 상태 지우기", onclick: () => {
          const uses = stateValueUses(t.key, v);
          const doIt = () => {
            obj.states.splice(i, 1);
            if (obj.on_state) delete obj.on_state[v];
            if (look) obj.looks = obj.looks.filter((x) => x !== look);
            if (obj.auto) { obj.auto = obj.auto.filter((e) => e.to !== v && e.from !== v); if (!obj.auto.length) delete obj.auto; }
            if (!obj.states.length) delete obj.states;
            change(); renderPanel();
          };
          if (!uses) return doIt();
          ask("상태 지우기", `${v} 상태를 ${uses}곳에서 쓰고 있습니다. 지우면 그곳들이 오류가 됩니다. 지울까요?`, "지우기", doIt, { danger: true });
        } }, "✕")),
      h("div", { class: "form" },
        canLook ? h("div", { class: "f-row" }, h("span", { class: "f-label" }, "모습"),
          h("div", { class: "f-ctl" }, input({ key: "texture", type: "image", optional: true }, l, lookCh), h("span", { class: "f-hint" }, i === 0 ? "비우면 원래 그림. 처음 상태의 모습입니다." : "비우면 원래 그림"))) : null,
        canLook ? h("div", { class: "f-row" }, h("span", { class: "f-label" }, "움직임"),
          h("div", { class: "f-ctl" }, input({ key: "anim", type: "anim", optional: true }, l, lookCh), h("span", { class: "f-hint" }, "고르면 이 상태일 때 그림 대신 애니메이션이 계속 돕니다. 촛불, 시계추처럼."))) : h("div", { class: "f-row" }, h("span", { class: "f-label" }, "모습"),
          h("span", { class: "f-hint" }, ownNode && !ownNode.texture ? "이 물건에는 그림이 없어서 상태마다 모습을 바꿀 수 없습니다. 안에 든 그림을 고르거나, 아래 '상태마다 보이는 그림'을 쓰세요." : "이 물건은 상태마다 그림을 바꿀 수 없습니다.")),
        null),
      h("div", { class: "block" }, h("div", { class: "block-title" }, "이 상태가 될 때 (타임라인)"), timelineField(obj.on_state, v, change, { target: t.path.split("/").pop() })));
  }

  // 안에 든 그림들: 상태마다 보이나 (묶음일 때)
  let matrix = null;
  if (editable) {
    const kids = allNodes(t.room).filter((x) => x.path.startsWith(t.path + "/") && (x.keys || []).includes("show_if") && x.path.split("/").length === t.path.split("/").length + 1);
    if (kids.length) matrix = h("details", { class: "subsec" },
      h("summary", {}, "상태마다 보이는 그림"),
      h("table", { class: "matrix" },
        h("tr", {}, h("th", {}, ""), t.values.map((x) => h("th", {}, x))),
        kids.map((k) => {
          const vis = visibleIn(k.path, t);
          return h("tr", {},
            h("td", { class: "m-name" }, h("a", { onclick: () => ui.select(k.path) }, thumb(k.texture), " ", names.object(k.path))),
            vis ? t.values.map((x) => h("td", {}, h("input", { type: "checkbox", checked: vis.has(x), onchange: (e) => {
              const s = new Set(vis);
              if (e.target.checked) s.add(x); else s.delete(x);
              if (!s.size) { e.target.checked = true; return toast("적어도 한 상태에서는 보여야 합니다.", "warn"); }
              setVisibleIn(k.path, t, s); change(); renderPanel();
            } }))) : h("td", { colspan: t.values.length, class: "muted" }, "다른 조건으로 정해짐"));
        })));
  }

  const actions = editable ? [
    h("button", { class: "btn small", onclick: () => openTransition(t, { from: t.values[0], to: t.values[1] }) }, "＋ 바뀌는 길"),
  ] : null;
  return section({ key: "states", title: isOwner ? "상태" : `${thingName(t)}의 상태`, count: `${t.values.length}개`, actions },
    t.builtIn ? "이 장치는 게임 안에서 스스로 상태가 바뀝니다. 다른 물건의 조건에서 이 상태를 고를 수 있습니다." : null,
    partNote,
    stateGraph(t, edges, v),
    detail,
    editable ? h("div", { class: "row sec-foot" },
      h("button", { class: "btn small", onclick: () => {
        let nv = "상태 " + (obj.states.length + 1);
        for (let k = 2; obj.states.includes(nv); k++) nv = "상태 " + (obj.states.length + k);
        obj.states.push(nv); S.stateSel[t.key] = nv; change(); renderPanel();
      } }, "＋ 상태 추가"),
      h("span", { class: "spacer" }),
      h("button", { class: "btn link danger", onclick: () => {
        const uses = stateKeyUses(t.key);
        ask("상태 없애기", uses ? `이 물건의 상태를 ${uses}곳에서 쓰고 있습니다. 상태를 모두 없애면 그곳들은 오류가 됩니다. 없앨까요?` : "이 물건의 상태를 모두 없앨까요? 되돌리기로 되살릴 수 있습니다.", "없애기", () => {
          delete obj.states; delete obj.on_state; delete obj.auto;
          change(); renderPanel();
        }, { danger: true });
      } }, "상태 없애기")) : null,
    matrix,
    !isOwner ? h("button", { class: "btn link", onclick: () => makeStatesDialog(n.path, S.roomId, () => renderPanel()) }, "이 그림에 따로 상태 만들기") : null);
}

// 규칙 빠른 만들기 (누르는 물건 + 자신이나 위쪽 물건에 상태가 있을 때)
export function quickRuleButtons(n, obj, onCh, rerender) {
  const t = thingOfNode(n.path) || ownerThing(n.path);
  if (!t || t.builtIn) return null;
  const name = thingName(t);
  return h("div", { class: "quick-rules" },
    h("button", { class: "add", title: `누를 때마다 ${name}의 상태가 ${t.values.join(", ")} 순서로 바뀌고, 끝나면 처음으로 돌아갑니다`, onclick: () => {
      obj.rules = obj.rules || [];
      obj.rules.push({ do: [actFor(t, "", true)] });
      onCh(); rerender();
    } }, `누를 때마다 ${name} 다음 상태로`),
    h("button", { class: "add", title: "상태마다 '만약 이 상태이면' 경우를 하나씩 만듭니다", onclick: () => {
      obj.rules = obj.rules || [];
      const has = (v) => obj.rules.some((r) => (r.if || []).length === 1 && (() => { const x = readCond(r.if[0]); return x && x.t.key === t.key && x.value === v && !x.not; })());
      const elseAt = obj.rules.findIndex((r) => r.item === undefined && !(r.if || []).length);
      const add = t.values.filter((v) => !has(v)).map((v) => ({ if: [condFor(t, v)], do: [] }));
      if (!add.length) return toast("이미 상태마다 경우가 있습니다.", "info");
      if (elseAt >= 0) obj.rules.splice(elseAt, 0, ...add); else obj.rules.push(...add);
      onCh(); rerender();
    } }, "상태마다 따로 정하기"));
}

// ------------------------------------------------------------------ 방 칸: 이 방의 물건 상태 한눈에

export function roomStates(section) {
  const list = things().filter((t) => t.room === S.roomId);
  return section({ key: "room-states", title: "상태가 있는 물건", count: `${list.length}개`, actions: [h("button", { class: "btn small", onclick: () => pickObject("상태를 만들 물건 고르기", (path) => makeStatesDialog(path, S.roomId, () => { ui.select(path); })) }, "＋ 상태 만들기")] }, null,
    list.length ? h("div", { class: "thing-list compact" }, list.map((t) => h("div", { class: "thing-row click", onclick: () => ui.select(t.path) },
      thumb(thumbOf(t.path)),
      h("div", { class: "thing-main" }, h("b", {}, thingName(t)), t.builtIn ? h("span", { class: "muted" }, "  장치") : null,
        h("div", { class: "chips" }, t.values.map((v, i) => h("span", { class: "chip" + (i === 0 ? " first" : "") }, v))))))) : h("p", { class: "muted" }, "아직 없습니다."));
}

// ------------------------------------------------------------------ '일어난 일' → 물건 상태로

// 기록을 쓰는 방 (켜는 곳이 있는 방)
function flagRoom(flag) {
  for (const d of allRoomData()) {
    let found = false;
    const look = (list) => walkActions(list, (a) => { if (!("number" in a) && [a.set, a.unset, a.toggle].includes(flag)) found = true; });
    look(d.on_first_enter); look(d.on_enter);
    for (const o of d.objects || []) { for (const r of o.rules || []) look(r.do); for (const k of ["on_solved", "on_wrong", "on_placed"]) look(o[k]); }
    if (found) return d.room;
  }
  return S.roomId;
}

// 이 기록을 물건 상태로 바꿀 수 있나: 방 데이터에서 켜고 끄는 기록만 (장치가 스스로 켜는 것은 안 됨)
export function convertibleFlag(flag) {
  if (flag.startsWith("visited_") || flag.startsWith("collect/")) return false;
  if (things().some((t) => t.flag && t.key === flag)) return false;
  let written = false;
  for (const d of allRoomData()) {
    const look = (list) => walkActions(list, (a) => { if (!("number" in a) && [a.set, a.unset, a.toggle].includes(flag)) written = true; });
    look(d.on_first_enter); look(d.on_enter);
    for (const o of d.objects || []) { for (const r of o.rules || []) look(r.do); for (const k of ["on_solved", "on_wrong", "on_placed"]) look(o[k]); }
  }
  return written;
}

export function flagToStateDialog(flag) {
  const roomId = flagRoom(flag);
  if (roomId !== S.roomId) ui.selectRoom(roomId, false);
  pickObject(`${josa(names.flag(flag), "을/를")} 어느 물건의 상태로 바꿀까요?`, (path) => {
    const off = h("input", { value: "아직" });
    const on = h("input", { value: names.flag(flag) });
    modal("상태 이름 정하기", h("div", {},
      h("p", { class: "help" }, `${names.object(path)}에 상태 두 개를 만들고, ${names.flag(flag)} 기록을 쓰던 곳을 모두 이 상태로 바꿉니다.`),
      h("label", { class: "field" }, h("span", {}, "그 일이 일어나기 전 (처음 상태)"), off),
      h("label", { class: "field" }, h("span", {}, "그 일이 일어난 뒤"), on)), [
      { label: "바꾸기", kind: "primary", onclick: (close) => {
        const a = off.value.trim(), b = on.value.trim();
        if (!a || !b || a === b) return toast("서로 다른 이름 두 개를 적어 주세요.", "warn");
        const obj = objectOf(path, true);
        obj.name = uniqueStateKey(obj.name || names.object(path), S.roomId, obj);
        obj.states = [a, b];
        const count = convertFlagToState(flag, obj.name, [a, b]);
        markDirty();
        close();
        toast(`${count}곳을 ${obj.name}의 상태로 바꿨습니다.`, "good", 6000);
        ui.select(path);
      } },
      { label: "취소", onclick: (c) => c() },
    ]);
  });
}

