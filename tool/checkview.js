// 막힘 검사 화면 + 흐름도.
import * as M from "./model.js";
import { S, h, modal, names, roomData, gameFile, catRoom, stateNameOf } from "./core.js";
import { prepare, analyzeRoom, moveText } from "./solver.js";
import { condSentence, actSentence, josa } from "./words.js";
import { ui } from "./editor.js";

// 편집기의 지금 데이터(저장 안 한 것 포함)로 검사 준비
export function solverContext() {
  const rooms = {};
  for (const r of S.catalog.rooms) rooms[r.id] = roomData(r.id);
  return prepare({ catalog: S.catalog, rooms, game: gameFile().data });
}

export function checkRoom(roomId) {
  return analyzeRoom(solverContext(), roomId);
}

const goTo = (roomId, path) => (e) => { e.preventDefault(); if (roomId !== S.roomId) ui.selectRoom(roomId, false); ui.select(path); };

// 검사 결과 한 덩어리
export function resultView(res) {
  const R = res.roomId;
  const out = h("div", { class: "solve-result" });
  // 각 단계 뒤에 "여기서부터 해 보기": 그 단계까지 한 상황으로 게임을 연다
  const moveLine = (m, i, list, states) => h("li", {}, moveText(m, names),
    states && states[i] ? h("button", { class: "ghost small play-from", title: "이 단계까지 마친 상황에서 게임을 엽니다", onclick: () => { if (R !== S.roomId) ui.selectRoom(R, false); ui.playDraft(states[i]); } }, "여기서부터 해 보기") : null);
  if (res.goalKind === "none") {
    out.append(h("p", { class: "hint warn" }, "이 방에는 목표가 없어서 '끝까지 갈 수 있는지'는 볼 수 없습니다. 방 화면(물건을 고르지 않은 상태)의 '이 방의 목표'를 정해 주세요."));
  } else if (!res.goalReachable) {
    out.append(h("p", { class: "bad-text" }, res.truncated ? "경우의 수가 너무 많아서 끝까지 보지 못했고, 그 안에서는 목표까지 가는 길을 찾지 못했습니다." : "목표까지 갈 방법이 없습니다."),
      h("p", { class: "help" }, "아래 '한 번도 보이지 않는 것'과 '실행되지 않는 경우'에서 원인을 찾아보세요."));
  } else {
    out.append(h("p", { class: "good-text" }, `목표까지 갈 수 있습니다. 가장 짧은 풀이는 ${res.solution.length}단계입니다.`),
      h("details", {}, h("summary", {}, "가장 짧은 풀이 보기"), h("ol", { class: "solution" }, res.solution.map((m, i, l) => moveLine(m, i, l, res.solutionStates)))));
    if (res.deadEnd) {
      out.append(h("div", { class: "problem err" },
        h("div", {}, h("b", {}, "막힘: "), "이 순서대로 하면 더는 목표까지 갈 수 없습니다."),
        h("ol", { class: "solution" }, res.deadEnd.path.map((m, i, l) => moveLine(m, i, l, res.deadEnd.states))),
        h("div", { class: "hint" }, "마지막 행동을 한 뒤에 되돌릴 방법이 없어서 생깁니다. 크게 보기를 닫았는데 다시 열 수 없거나, 아이템을 써 버렸는데 다시 얻을 수 없는 경우가 흔합니다.")));
    } else if (!res.truncated) {
      out.append(h("p", { class: "good-text" }, "어떤 순서로 해도 막히지 않습니다."));
    }
  }
  if (res.truncated && res.goalReachable) out.append(h("p", { class: "hint warn" }, `경우의 수가 많아 ${res.states.toLocaleString()}가지 상황까지만 봤습니다. 막힘은 확인하지 못했습니다.`));
  const list = (title, items, fn) => items.length ? h("div", { class: "problem warn" }, h("div", {}, h("b", {}, title)), h("ul", {}, items.map(fn))) : null;
  out.append(...[
    list("한 번도 보이지 않는 것 (누를 수 없음)", res.neverVisible, (p) => h("li", {}, h("a", { href: "#", onclick: goTo(R, p) }, names.object(p, R)))),
    res.neverFired.length && res.goalReachable ? h("p", { class: "help small" }, "아래 '한 번도 실행되지 않는 경우'는 목표(엔딩, 다른 방으로 가기)를 이룬 뒤에만 올 수 있는 경우일 수도 있습니다. 그렇다면 그대로 둬도 됩니다.") : null,
    list("한 번도 실행되지 않는 경우", res.neverFired, (x) => h("li", {}, h("a", { href: "#", onclick: goTo(R, x.path) }, names.object(x.path, R)), `의 ${x.index + 1}번째 경우${x.item ? ` (${josa(names.item(x.item), "을/를")} 들고)` : ""}`)),
    list("보이지만 주울 수 없는 아이템", res.neverPicked, (p) => h("li", {}, h("a", { href: "#", onclick: goTo(R, p) }, names.object(p, R)))),
    h("p", { class: "help small" }, `살펴본 상황: ${res.states.toLocaleString()}가지. 손으로 푸는 퍼즐(순서, 자물쇠, 미로 등)은 보이면 풀 수 있다고 봅니다.`)].filter(Boolean));
  return out;
}

export function solverSection() {
  const box = h("div", { class: "solver" });
  const runOne = (id) => {
    const t = performance.now();
    const res = checkRoom(id);
    box.append(h("h4", {}, `${names.room(id)} `, h("span", { class: "muted" }, `(${Math.round(performance.now() - t)}ms)`)), resultView(res));
  };
  box.append(h("div", { class: "row" },
    h("button", { class: "primary", onclick: () => { clear(); runOne(S.roomId); } }, "이 방 막힘 검사"),
    h("button", { onclick: () => { clear(); for (const r of S.catalog.rooms) runOne(r.id); } }, "모든 방"),
    h("button", { onclick: () => openFlow(S.roomId) }, "흐름도")));
  const clear = () => { while (box.children.length > 1) box.lastChild.remove(); };
  return box;
}

// ------------------------------------------------------------------ 흐름도 (무엇이 무엇을 여는가)

function factsOfConds(list, out) {
  for (const c of list || []) {
    const t = M.conditionType(c);
    if (!t) continue;
    if (t.id === "flag" && c.on !== false) out.add("flag:" + c.flag);
    if (t.id === "has" && c.on !== false) out.add("item:" + c.has);
    if (t.id === "state" && "is" in c) out.add(`state:${c.state}=${c.is}`);
    if (t.id === "note" && c.on !== false) out.add("note:" + c.note);
    if (t.id === "all") factsOfConds(c.all, out);
  }
  return out;
}
function factsOfActs(list, out) {
  for (const a of list || []) {
    const t = M.actionType(a);
    if (!t) continue;
    if (t.id === "set" || (t.id === "toggle")) out.add("flag:" + (a.set || a.toggle));
    if (t.id === "state") out.add(`state:${a.state}=${a.to}`);
    if (t.id === "give") out.add("item:" + a.give);
    if (t.id === "closeup") out.add("view:" + a.closeup);
    if (t.id === "go") out.add("room:" + a.go);
    if (t.id === "ending") out.add("ending:" + (a.ending || ""));
    if (t.id === "note") out.add("note:" + a.note);
    for (const ch of a.choices || []) factsOfActs(ch.do, out);
    if (Array.isArray(a.timeline)) factsOfActs(a.timeline, out);
    if (Array.isArray(a.do)) factsOfActs(a.do, out);
  }
  return out;
}

export function buildFlow(roomId) {
  const P = solverContext();
  const R = P.room[roomId];
  const steps = [];
  const add = (label, path, needs, gives) => { if (gives.size) steps.push({ label, path, needs, gives }); };
  const visNeeds = (n) => {
    const out = new Set();
    const v = R.viewOf[n.path];
    if (v && v.closeup) out.add("view:" + v.name);
    let p = n.path;
    while (p && p !== (v && v.path)) {
      const node = R.byPath[p];
      const o = R.obj[p];
      if (o) factsOfConds(o.show_if, out);
      const parts = p.split("/");
      if (parts[parts.length - 1] === "Contents") { const d = R.byPath[parts.slice(0, -1).join("/")]; if (d && d.flag) out.add("flag:" + d.flag); }
      p = parts.slice(0, -1).join("/");
      if (!node) break;
    }
    return out;
  };
  for (const n of R.nodes) {
    const o = R.obj[n.path] || {};
    const nm = names.object(n.path, roomId);
    const base = visNeeds(n);
    if (n.kind === "pickup") {
      const it = o.pickup || n.item;
      const gives = new Set(it ? ["item:" + it] : []);
      for (const r of o.rules || []) factsOfActs(r.do, gives);
      add(`${josa(nm, "을/를")} 줍기`, n.path, base, gives);
      continue;
    }
    if (n.kind === "drawer" && n.flag) add(`${josa(nm, "을/를")} 열기`, n.path, base, new Set(["flag:" + n.flag]));
    if (n.kind === "puzzle") {
      const needs = new Set(base);
      if (n.auto) for (const m of R.nodes) if (m.kind === "socket" && m.path.startsWith(n.path + "/")) needs.add("flag:" + m.flag);
      const gives = factsOfActs(o.on_solved, new Set(n.flag ? ["flag:" + n.flag] : []));
      add(`${josa(nm, "을/를")} ${n.auto ? "완성" : "풀기"}`, n.path, needs, gives);
    }
    if (n.kind === "socket" && n.accepts) {
      add(`${josa(names.item(n.accepts), "을/를")} ${nm}에 놓기`, n.path, new Set([...base, "item:" + n.accepts]), factsOfActs(o.on_placed, new Set([n.flag && "flag:" + n.flag].filter(Boolean))));
    }
    if (n.kind === "whenall") add(`${nm} (저절로)`, n.path, factsOfConds(o.when, new Set()), factsOfActs(o.on_solved, new Set(n.flag ? ["flag:" + n.flag] : [])));
    (o.rules || []).forEach((r) => {
      if (n.kind === "pickup") return;
      const needs = factsOfConds(r.if, new Set(base));
      if (r.item) needs.add("item:" + r.item);
      add(r.item ? `${josa(names.item(r.item), "을/를")} 들고 ${nm}` : `${nm} 누르기`, n.path, needs, factsOfActs(r.do, new Set()));
    });
  }
  // 저절로 바뀌기: 조건이 맞으면 일어나는 단계
  for (const o of roomData(roomId).objects || []) {
    if (!Array.isArray(o.states)) continue;
    const key = stateNameOf(o);
    for (const e of o.auto || []) {
      const needs = factsOfConds(e.if, new Set());
      if (e.from) needs.add(`state:${key}=${e.from}`);
      add(`${josa(names.object(o.node, roomId), "이/가")} 저절로 ${e.to} 상태`, o.node, needs, factsOfActs(e.do, new Set([`state:${key}=${e.to}`])));
    }
  }
  // 어떤 상태가 되면 할 일: 그 상태를 만드는 단계의 결과에 더한다
  for (const o of roomData(roomId).objects || []) {
    if (!Array.isArray(o.states) || !o.on_state) continue;
    const key = stateNameOf(o);
    for (const [v, list] of Object.entries(o.on_state)) {
      const more = factsOfActs(list, new Set());
      if (!more.size) continue;
      for (const st of steps) if (st.gives.has(`state:${key}=${v}`)) for (const f of more) st.gives.add(f);
    }
  }
  // 조합: 이 방에서 나오는 아이템을 쓰는 것만
  const roomItems = new Set(steps.flatMap((st) => [...st.gives]).filter((f) => f.startsWith("item:")).map((f) => f.slice(5)));
  for (const c of P.combos) if (c.a && c.b && (roomItems.has(c.a) || roomItems.has(c.b))) add(`${names.item(c.a)} + ${names.item(c.b)} 조합`, null, new Set(["item:" + c.a, "item:" + c.b]), factsOfActs(c.do, new Set(c.result ? ["item:" + c.result] : [])));
  // 이 방에서 쓰이는 것만 남긴다
  const produced = new Set(steps.flatMap((s) => [...s.gives]));
  for (const s of steps) s.needs = new Set([...s.needs].filter((f) => produced.has(f)));
  // 층: 행동은 필요한 것이 모두 나온 다음 열, 결과는 그것을 처음 만드는 행동 바로 뒤 열
  let factLayer = {};
  const stepLayer = new Map();
  for (let it = 0; it < 60; it++) {
    for (const st of steps) stepLayer.set(st, Math.max(0, ...[...st.needs].map((f) => (factLayer[f] ?? -1) + 1)));
    const next = {};
    for (const st of steps) for (const f of st.gives) if (!st.needs.has(f)) next[f] = Math.min(next[f] ?? 1e9, stepLayer.get(st));
    for (const st of steps) for (const f of st.gives) if (next[f] === undefined) next[f] = stepLayer.get(st);
    const same = JSON.stringify(next) === JSON.stringify(factLayer);
    factLayer = next;
    if (same) break;
  }
  return { steps, stepLayer, factLayer };
}

function factLabel(f) {
  const [kind, rest] = [f.slice(0, f.indexOf(":")), f.slice(f.indexOf(":") + 1)];
  if (kind === "item") return "아이템: " + names.item(rest);
  if (kind === "flag") return "기록: " + names.flag(rest);
  if (kind === "state") { const [a, b] = rest.split("="); return `◆ ${a}: ${b}`; }
  if (kind === "view") return names.closeup(rest) + " 크게 보기";
  if (kind === "room") return josa(names.room(rest), "으로/로") + " 이동";
  if (kind === "ending") return "엔딩";
  if (kind === "note") return "수첩: " + rest;
  return rest;
}

export function openFlow(roomId) {
  const { steps, stepLayer, factLayer } = buildFlow(roomId);
  if (!steps.length) return modal("흐름도", h("p", {}, "이 방에는 아직 무언가를 여는 규칙이 없습니다."), [{ label: "닫기", onclick: (c) => c() }]);
  // 열: 행동(짝수 열) → 결과(홀수 열)
  const cols = [];
  const put = (col, node) => { (cols[col] = cols[col] || []).push(node); };
  const factNodes = {};
  for (const s of steps) put(stepLayer.get(s) * 2, { type: "step", s });
  for (const f of Object.keys(factLayer)) { const n = { type: "fact", f }; factNodes[f] = n; put(factLayer[f] * 2 + 1, n); }
  const W = 210, GAP = 70, RH = 46;
  const pos = new Map();
  let maxRows = 0;
  cols.forEach((col, ci) => { (col || []).forEach((n, ri) => pos.set(n, { x: 20 + ci * (W + GAP), y: 20 + ri * RH })); maxRows = Math.max(maxRows, (col || []).length); });
  const width = 40 + cols.length * (W + GAP), height = 40 + maxRows * RH;
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text) e.textContent = text; return e; };
  const svg = el("svg", { width, height, class: "flow-svg" });
  const edge = (a, b) => {
    const p = pos.get(a), q = pos.get(b);
    if (!p || !q) return;
    const x1 = p.x + W, y1 = p.y + 17, x2 = q.x, y2 = q.y + 17;
    svg.append(el("path", { d: `M${x1},${y1} C${x1 + GAP / 2},${y1} ${x2 - GAP / 2},${y2} ${x2},${y2}`, class: "flow-edge" + (x2 < x1 ? " back" : "") }));
  };
  for (const s of steps) {
    const sn = cols[stepLayer.get(s) * 2].find((n) => n.s === s);
    for (const f of s.needs) if (factNodes[f]) edge(factNodes[f], sn);
    for (const f of s.gives) if (factNodes[f]) edge(sn, factNodes[f]);
  }
  for (const [n, p] of pos) {
    const g = el("g", { class: "flow-node " + n.type, transform: `translate(${p.x},${p.y})` });
    const label = n.type === "step" ? n.s.label : factLabel(n.f);
    g.append(el("rect", { width: W, height: 34, rx: n.type === "step" ? 6 : 17 }), el("text", { x: W / 2, y: 22, "text-anchor": "middle" }, label.length > 17 ? label.slice(0, 16) + "…" : label));
    g.append(el("title", {}, label));
    if (n.type === "step" && n.s.path) { g.style.cursor = "pointer"; g.addEventListener("click", () => { close(); if (roomId !== S.roomId) ui.selectRoom(roomId, false); ui.select(n.s.path); }); }
    svg.append(g);
  }
  const close = modal(`${names.room(roomId)} 흐름도`, h("div", { class: "flow-wrap" },
    h("p", { class: "help" }, "왼쪽에서 오른쪽으로 읽습니다. 네모는 플레이어가 하는 일이고, 둥근 칸은 그 결과(얻는 아이템, 기록, 상태, 열리는 화면)입니다. 네모를 누르면 그 물건으로 갑니다."),
    h("div", { class: "flow-scroll" }, svg)), [{ label: "닫기", onclick: (c) => c() }]);
}
