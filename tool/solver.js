// 막힘 검사: 방 데이터를 보고 플레이어가 할 수 있는 행동을 모두 따라가 본다.
//  - 목표에 갈 수 있는지, 가장 짧은 풀이
//  - "더는 목표에 갈 수 없는 상태"(막힘)에 빠지는 행동 순서
//  - 한 번도 보이지 않는 물건, 한 번도 실행되지 않는 경우, 얻을 수 없는 아이템
// 게임(Game.interact, Pickup, Drawer, ItemSocket, WhenAll ...)의 동작을 그대로 흉내 낸다.
// 화면에서 손으로 푸는 퍼즐(순서, 스위치, 자물쇠, 미로 ...)은 "보이면 풀 수 있다"고 본다.
import * as M from "./model.js";
import { josa } from "./words.js";

const MAX_STATES = 40000;
const CLICKABLE = new Set(["hotspot", "pickup", "drawer", "socket", "puzzle", "button"]);

// ------------------------------------------------------------------ 준비

// ctx: { catalog, rooms: {id: 방 데이터}, game: game.json 데이터 }
export function prepare(ctx) {
  const P = { ...ctx, stateDefaults: {}, stateSteps: {}, onState: {}, autoRules: {}, numRange: {}, clickCap: {}, clickTracked: new Set() };
  for (const d of Object.values(ctx.rooms)) for (const o of d.objects || []) {
    if (Array.isArray(o.states) && o.states.length) { const k = o.name || o.node.split("/").pop(); P.stateDefaults[k] = o.states[0]; P.stateSteps[k] = o.states; if (o.on_state) P.onState[k] = o.on_state; if (o.auto) (P.autoRules[d.room] = P.autoRules[d.room] || []).push(...o.auto.map((a) => ({ ...a, key: k, path: o.node }))); }
  }
  // 숫자와 누른 횟수는 조건에 나오는 값 근처까지만 센다 (끝없이 늘어나지 않게)
  const seeCond = (c, roomId, nodePath) => {
    const t = M.conditionType(c);
    if (!t) return;
    if (t.id === "number") {
      const o = M.NUMBER_OPS.find((x) => x in c) || ">=";
      const r = (P.numRange[c.number] = P.numRange[c.number] || [0, 0]);
      r[0] = Math.min(r[0], c[o] - 1); r[1] = Math.max(r[1], c[o] + 1);
    }
    if (t.id === "clicks") {
      const key = `${roomId}/${c.of || nodePath}`;
      P.clickTracked.add(key);
      P.clickCap[key] = Math.max(P.clickCap[key] || 0, (c.clicks || 1) + 1);
    }
    for (const k of ["any", "all", "not"]) for (const x of c[k] || []) seeCond(x, roomId, nodePath);
  };
  for (const [id, d] of Object.entries(ctx.rooms)) for (const o of d.objects || []) {
    for (const r of o.rules || []) { for (const c of r.if || []) seeCond(c, id, o.node); for (const a of r.do || []) for (const ch of a.choices || []) for (const c of ch.if || []) seeCond(c, id, o.node); }
    for (const k of ["show_if", "when"]) for (const c of o[k] || []) seeCond(c, id, o.node);
    for (const l of o.looks || []) for (const c of l.if || []) seeCond(c, id, o.node);
  }
  for (const c of [...(ctx.game.hints || {}).list || []].flatMap((x) => [...(x.if || []), ...(x.done || [])])) seeCond(c, "", "");
  // 방마다 물건 찾기 표
  P.room = {};
  for (const r of ctx.catalog.rooms) {
    const byPath = {};
    const viewOf = {};
    for (const v of r.views) for (const n of v.nodes) { byPath[n.path] = n; viewOf[n.path] = v; }
    for (const v of r.views) if (!byPath[v.path]) byPath[v.path] = { path: v.path, name: v.name, kind: "group", keys: [] };
    const data = ctx.rooms[r.id] || { objects: [] };
    const obj = {};
    for (const o of data.objects || []) obj[o.node] = o;
    // 편집기에서 게임에서 뺀 물건(과 그 안의 것)은 없는 것으로
    const gone = (data.objects || []).filter((o) => o.removed && !o.create).map((o) => o.node);
    const alive = (n) => !gone.some((g) => n.path === g || n.path.startsWith(g + "/"));
    P.room[r.id] = { cat: r, byPath, viewOf, data, obj, nodes: r.views.flatMap((v) => v.nodes).filter(alive) };
  }
  P.combos = ctx.game.combos || [];
  P.timerDo = {};
  P.items = ctx.game.items || {};
  return P;
}

// ------------------------------------------------------------------ 상태

function newState(roomId) {
  return { room: roomId, closeup: null, flags: new Set(), states: {}, nums: {}, items: new Set(), ever: new Set(), picked: new Set(), notes: new Set(), ended: null };
}
function clone(s) {
  return { room: s.room, closeup: s.closeup, flags: new Set(s.flags), states: { ...s.states }, nums: { ...s.nums },
    items: new Set(s.items), ever: new Set(s.ever), picked: new Set(s.picked), notes: new Set(s.notes), ended: s.ended, left: s.left };
}
function keyOf(s) {
  const st = Object.keys(s.states).sort().map((k) => k + "=" + s.states[k]).join(",");
  const nu = Object.keys(s.nums).sort().filter((k) => s.nums[k]).map((k) => k + "=" + s.nums[k]).join(",");
  return [s.room, s.closeup || "", [...s.flags].sort().join(","), st, nu, [...s.items].sort().join(","), [...s.ever].sort().join(","),
    [...s.picked].sort().join(","), [...s.notes].sort().join(","), s.ended || "", s.left || ""].join("|");
}

// ------------------------------------------------------------------ 조건

function cond(P, c, s, here) {
  const t = M.conditionType(c);
  if (!t) return true;
  switch (t.id) {
    case "flag": return s.flags.has(c.flag) === (c.on !== false);
    case "has": { const have = c.ever ? s.ever.has(c.has) : s.items.has(c.has); return have === (c.on !== false); }
    case "state": { const now = s.states[c.state] ?? P.stateDefaults[c.state]; return "is_not" in c ? now !== c.is_not : now === c.is; }
    case "number": {
      const o = M.NUMBER_OPS.find((x) => x in c) || ">=";
      const a = s.nums[c.number] || 0, b = c[o];
      return { "=": a === b, "!=": a !== b, ">=": a >= b, "<=": a <= b, ">": a > b, "<": a < b }[o];
    }
    case "clicks": { const n = s.nums["clicks/" + s.room + "/" + (c.of || here)] || 0; return c.or_more ? n >= c.clicks : n === c.clicks; }
    case "room": return s.room === c.room;
    case "timer": return s.flags.has("⏱" + c.timer) === (c.on !== false);   // 글쓰기 규칙 예외
    case "collected": return s.flags.has("collect/" + c.collected) === (c.on !== false);
    case "collectedCount": return [...s.flags].filter((f) => f.startsWith("collect/")).length >= c.collected_count;
    case "achieved": return s.flags.has("achieve/" + c.achieved) === (c.on !== false);   // 이번 플레이에서 달성한 것만 본다
    case "note": return s.notes.has(c.note) === (c.on !== false);
    case "any": return (c.any || []).some((x) => cond(P, x, s, here));
    case "all": return (c.all || []).every((x) => cond(P, x, s, here));
    case "not": return !(c.not || []).every((x) => cond(P, x, s, here));
  }
  return true;
}
const all = (P, list, s, here) => (list || []).every((c) => cond(P, c, s, here));

// ------------------------------------------------------------------ 할 일 (talk 선택지는 갈래가 생겨 여러 결과)

function clampNum(P, name, v) {
  if (name.startsWith("clicks/")) return v;
  const r = P.numRange[name] || [-1, 1];
  return Math.max(r[0], Math.min(r[1], v));
}

function enterRoom(P, s, roomId) {
  s.room = roomId; s.closeup = null;
  for (const f of [...s.flags]) if (f.startsWith("⏱")) s.flags.delete(f);   // 타이머는 그 방 안에서만   // 글쓰기 규칙 예외
  const R = P.room[roomId];
  if (!R) return [s];
  const first = !s.flags.has("visited_" + roomId);
  s.flags.add("visited_" + roomId);
  let out = [s];
  if (first) out = out.flatMap((x) => run(P, R.data.on_first_enter, x, ""));
  return out.flatMap((x) => run(P, R.data.on_enter, x, ""));
}

function run(P, list, s0, here, fired) {
  let states = [s0];
  for (const a of list || []) {
    const next = [];
    for (const s of states) {
      if (s.ended || s.left) { next.push(s); continue; }
      const t = M.actionType(a);
      if (!t) { next.push(s); continue; }
      switch (t.id) {
        case "set": s.flags.add(a.set); break;
        case "unset": s.flags.delete(a.unset); break;
        case "toggle": if (s.flags.has(a.toggle)) s.flags.delete(a.toggle); else s.flags.add(a.toggle); break;
        case "state":
        case "stateNext": {
          const before = s.states[a.state] ?? P.stateDefaults[a.state];
          if (a.next) { const st = P.stateSteps[a.state] || []; const i = st.indexOf(before); if (st.length) s.states[a.state] = st[(i + 1) % st.length]; } else s.states[a.state] = a.to;
          // 그 상태가 되면 할 일 (게임과 같이 바로 이어서)
          const after = s.states[a.state];
          const then = after !== before && P.onState[a.state] && P.onState[a.state][after];
          if (then && then.length) { next.push(...run(P, then, s, here, fired)); continue; }
          break;
        }
        case "numberAdd": s.nums[a.number] = clampNum(P, a.number, (s.nums[a.number] || 0) + (a.add ?? 1)); break;
        case "numberSet": s.nums[a.number] = clampNum(P, a.number, a.set); break;
        case "give": s.items.add(a.give); s.ever.add(a.give); break;
        case "take": s.items.delete(a.take); break;
        case "note": s.notes.add(a.note); break;
        case "closeup": s.closeup = a.closeup; break;
        case "closeCloseup": s.closeup = null; break;
        case "go": s.left = a.go; break;
        case "ending": s.ended = a.ending || "엔딩"; break;
        case "timer": s.flags.add("⏱" + a.timer); P.timerDo[a.timer] = a.do || []; break;   // 글쓰기 규칙 예외
        case "stopTimer": s.flags.delete("⏱" + a.stop_timer); break;   // 글쓰기 규칙 예외
        case "collect": s.flags.add("collect/" + a.collect); break;
        case "achieve": s.flags.add("achieve/" + a.achieve); break;
        case "timeline": {
          // 시각 순서대로 실행한 것과 같다고 본다
          const items = [...(a.timeline || [])].sort((x, y) => (+x.at || 0) - (+y.at || 0));
          next.push(...run(P, items, s, here, fired));
          continue;
        }
        case "talk": {
          const choices = (a.choices || []).filter((ch) => all(P, ch.if, s, here));
          if (choices.length) {
            for (const ch of choices) next.push(...run(P, ch.do, clone(s), here, fired).map((x) => { x.choice = ch.text; return x; }));
            continue;
          }
          break;
        }
      }
      next.push(s);
    }
    states = next;
  }
  return states;
}

// WhenAll, 받침대 퍼즐: 조건이 맞는 순간 저절로
function watchers(P, s, fired) {
  const R = P.room[s.room];
  if (!R) return [s];
  let out = [s];
  for (let loop = 0; loop < 10; loop++) {
    let changed = false;
    const next = [];
    for (const x of out) {
      let done = false;
      for (const n of R.nodes) {
        const o = R.obj[n.path] || {};
        if (n.kind === "whenall" && n.flag && !x.flags.has(n.flag) && (o.when || []).length && all(P, o.when, x, n.path)) {
          x.flags.add(n.flag);
          fired.add(n.path + "#solved");
          next.push(...run(P, o.on_solved, x, n.path, fired)); done = true; changed = true; break;
        }
        if (n.kind === "puzzle" && n.auto && n.flag && !x.flags.has(n.flag)) {
          const sockets = R.nodes.filter((m) => m.kind === "socket" && m.path.startsWith(n.path + "/"));
          if (sockets.length && sockets.every((m) => x.flags.has(m.flag))) {
            x.flags.add(n.flag);
            fired.add(n.path + "#solved");
            next.push(...run(P, o.on_solved, x, n.path, fired)); done = true; changed = true; break;
          }
        }
      }
      // 저절로 바뀌기 (방 데이터의 auto)
      if (!done) for (const a of P.autoRules[x.room] || []) {
        const now = x.states[a.key] ?? P.stateDefaults[a.key];
        if (now === a.to || (a.from && now !== a.from)) continue;
        if (!all(P, a.if || [], x, a.path)) continue;
        next.push(...run(P, [{ state: a.key, to: a.to }, ...(a.do || [])], x, a.path, fired)); done = true; changed = true; break;
      }
      if (!done) next.push(x);
    }
    out = next;
    if (!changed) break;
  }
  return out;
}

// ------------------------------------------------------------------ 보이기

function visibleSelf(P, R, n, s) {
  const o = R.obj[n.path];
  if (o && o.removed && !o.create) return false;   // 편집기에서 지운 물건
  // 주운 아이템(한 번이라도 가진 아이템)의 줍는 물건은 사라진다 (게임: GameState.was_picked)
  if (n.kind === "pickup") { const it = (o && o.pickup) || n.item; if (it ? s.ever.has(it) : s.picked.has(n.path)) return false; }
  // 서랍 안의 것: 서랍이 열려 있어야 (Contents 는 처음엔 숨겨져 있다)
  const parts = n.path.split("/");
  if (parts[parts.length - 1] === "Contents") {
    const drawer = R.byPath[parts.slice(0, -1).join("/")];
    if (drawer && drawer.kind === "drawer") return s.flags.has(drawer.flag);
  }
  if (o && (o.show_if || []).length) return all(P, o.show_if, s, n.path);
  if (n.hidden) return false;
  return true;
}
function visible(P, R, n, s) {
  const v = R.viewOf[n.path];
  if (!v) return false;
  if (v.closeup ? s.closeup !== v.name : s.closeup !== null) return false;
  let path = n.path;
  // 벽/크게 보기 화면 자체는 처음에 숨겨져 있어도 (돌아보거나 열면 보이므로) 보지 않는다
  while (path && path.includes("/") && path !== v.path) {
    const node = R.byPath[path];
    if (node && !visibleSelf(P, R, node, s)) return false;
    path = path.split("/").slice(0, -1).join("/");
  }
  return true;
}

// ------------------------------------------------------------------ 행동 목록

function moves(P, s, fired) {
  const R = P.room[s.room];
  const out = [];
  if (!R) return out;
  const tick = (x, n) => {
    const key = s.room + "/" + n.path;
    if (P.clickTracked.has(key)) x.nums["clicks/" + key] = Math.min((x.nums["clicks/" + key] || 0) + 1, P.clickCap[key]);
  };
  for (const n of R.nodes) {
    if (!CLICKABLE.has(n.kind) || !visible(P, R, n, s)) continue;
    const o = R.obj[n.path] || {};
    const rules = o.rules || [];
    // 그냥 누르기
    if (n.kind === "puzzle") {
      if (!n.auto && n.flag && !s.flags.has(n.flag)) {
        const x = clone(s); x.flags.add(n.flag); fired.add(n.path + "#solved");
        out.push({ move: { type: "solve", path: n.path }, states: run(P, o.on_solved, x, n.path, fired) });
      }
    } else if (n.kind === "socket") {
      // 아이템을 들고 누를 때만 뭔가 한다
    } else {
      const x = clone(s);
      tick(x, n);
      let pre = [x];
      if (n.kind === "pickup") {
        const it = o.pickup || n.item;
        if (it ? s.ever.has(it) : s.picked.has(n.path)) continue;
        x.picked.add(n.path);
        if (it) { x.items.add(it); x.ever.add(it); }
      }
      if (n.kind === "drawer" && n.flag) { if (x.flags.has(n.flag)) x.flags.delete(n.flag); else x.flags.add(n.flag); }
      const i = rules.findIndex((r) => r.item === undefined && all(P, r.if, x, n.path));
      if (i >= 0) { fired.add(n.path + "#" + i); pre = run(P, rules[i].do, x, n.path, fired); }
      out.push({ move: { type: "click", path: n.path }, states: pre });
    }
    // 아이템을 들고 누르기
    for (const it of s.items) {
      if (n.kind === "socket") {
        if (n.accepts === it && n.flag && !s.flags.has(n.flag)) {
          const x = clone(s);
          if (n.consume !== false) x.items.delete(it);
          x.flags.add(n.flag); fired.add(n.path + "#placed");
          out.push({ move: { type: "use", path: n.path, item: it }, states: run(P, o.on_placed, x, n.path, fired) });
        }
        continue;
      }
      const i = rules.findIndex((r) => r.item === it && all(P, r.if, s, n.path));
      if (i < 0) continue;
      const x = clone(s);
      tick(x, n);
      // 누른 횟수를 센 뒤 조건을 다시 본다 (게임도 그렇게 한다)
      const j = rules.findIndex((r) => r.item === it && all(P, r.if, x, n.path));
      if (j < 0) continue;
      fired.add(n.path + "#" + j);
      out.push({ move: { type: "use", path: n.path, item: it }, states: run(P, rules[j].do, x, n.path, fired) });
    }
  }
  // 조합
  const held = [...s.items];
  for (const c of P.combos) {
    if (!c.a || !c.b || c.a === c.b || !s.items.has(c.a) || !s.items.has(c.b)) continue;
    const x = clone(s);
    if (!c.keep_a) x.items.delete(c.a);
    if (!c.keep_b) x.items.delete(c.b);
    if (c.result) { x.items.add(c.result); x.ever.add(c.result); }
    out.push({ move: { type: "combine", a: c.a, b: c.b }, states: run(P, c.do, x, "", fired) });
  }
  // 조사
  for (const it of held) {
    const e = P.items[it];
    if (e && (e.on_inspect || []).length) out.push({ move: { type: "inspect", item: it }, states: run(P, e.on_inspect, clone(s), "", fired) });
  }
  if (s.closeup) { const x = clone(s); x.closeup = null; out.push({ move: { type: "back" }, states: [x] }); }
  // 타이머: 시간이 다 될 때까지 기다리기
  for (const f of s.flags) if (f.startsWith("⏱")) {   // 글쓰기 규칙 예외
    const name = f.slice(1);
    const x = clone(s); x.flags.delete(f);
    out.push({ move: { type: "wait", timer: name }, states: run(P, P.timerDo[name], x, "", fired) });
  }
  return out;
}

// ------------------------------------------------------------------ 방 하나 검사

// goal: 조건 목록 (방 데이터의 "goal"). 없으면 다른 방으로 가거나 엔딩을 보는 것.
export function analyzeRoom(P, roomId) {
  const R = P.room[roomId];
  const goalConds = (R && R.data.goal) || null;
  const hasExit = JSON.stringify(R ? R.data : {}).match(/"(go|ending)":/);
  const goalKind = goalConds && goalConds.length ? "set" : hasExit ? "exit" : "none";
  const isGoal = (s) => s.ended || s.left || (goalKind === "set" && all(P, goalConds, s, ""));
  const fired = new Set();
  const start = enterRoom(P, newState(roomId), roomId).flatMap((x) => watchers(P, x, fired));
  const seen = new Map();           // 상태 열쇠 → {state, parent, move, children: []}
  const queue = [];
  for (const s of start) { const k = keyOf(s); if (!seen.has(k)) { seen.set(k, { s, parent: null, move: null, kids: new Set() }); queue.push(k); } }
  const everVisible = new Set();
  let truncated = false;
  const goals = [];
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    const rec = seen.get(k);
    const s = rec.s;
    for (const n of R.nodes) if (visible(P, R, n, s)) everVisible.add(n.path);
    if (isGoal(s)) { goals.push(k); if (s.left || s.ended) continue; }   // 다른 방으로 갔거나 엔딩이면 거기서 끝 (방 안 목표는 그 뒤도 본다)
    for (const m of moves(P, s, fired)) {
      for (let x of m.states) {
        for (x of watchers(P, x, fired)) {
          const kk = keyOf(x);
          rec.kids.add(kk);
          if (seen.has(kk)) continue;
          if (seen.size >= MAX_STATES) { truncated = true; continue; }
          seen.set(kk, { s: x, parent: k, move: { ...m.move, choice: x.choice }, kids: new Set() });
          queue.push(kk);
        }
      }
    }
  }
  const pathTo = (k) => { const out = []; while (k && seen.get(k).move) { out.unshift(seen.get(k).move); k = seen.get(k).parent; } return out; };
  const statesTo = (k) => { const out = []; while (k && seen.get(k).move) { out.unshift(exportState(seen.get(k).s)); k = seen.get(k).parent; } return out; };
  const result = { roomId, goalKind, states: seen.size, truncated, goalReachable: goals.length > 0, solution: null, deadEnd: null,
    reach: [...seen.values()].map((rec) => ({ states: rec.s.states, flags: rec.s.flags })) };   // 게임에서 나올 수 있는 상황들 (지금 보는 상황 확인용)
  if (goals.length) { result.solution = pathTo(goals[0]); result.solutionStates = statesTo(goals[0]); }
  // 막힘: 목표에 갈 수 없는 상태 (목표가 있을 때만)
  if (goalKind !== "none" && goals.length && !truncated) {
    const canReach = new Set(goals);
    const parents = new Map();
    for (const [k, rec] of seen) for (const kk of rec.kids) { if (!parents.has(kk)) parents.set(kk, []); parents.get(kk).push(k); }
    const stack = [...goals];
    while (stack.length) { const k = stack.pop(); for (const p of parents.get(k) || []) if (!canReach.has(p)) { canReach.add(p); stack.push(p); } }
    const dead = queue.find((k) => !canReach.has(k));
    if (dead) {
      const path = pathTo(dead);
      result.deadEnd = { path, states: statesTo(dead), count: queue.filter((k) => !canReach.has(k)).length };
    }
  }
  // 한 번도 안 되는 것
  // 누를 일이 있는 것만 (규칙이 있거나, 줍거나, 놓거나, 푸는 것)
  const matters = (n) => (R.obj[n.path] && (R.obj[n.path].rules || []).length) || ["pickup", "socket"].includes(n.kind) || (n.kind === "puzzle" && !n.auto);
  result.neverVisible = R.nodes.filter((n) => CLICKABLE.has(n.kind) && matters(n) && !everVisible.has(n.path)).map((n) => n.path);
  result.neverFired = [];
  for (const o of R.data.objects || []) {
    if (!everVisible.has(o.node)) continue;
    (o.rules || []).forEach((r, i) => { if (!fired.has(o.node + "#" + i)) result.neverFired.push({ path: o.node, index: i, item: r.item }); });
  }
  result.neverPicked = R.nodes.filter((n) => n.kind === "pickup" && everVisible.has(n.path) && ![...seen.values()].some((rec) => rec.s.picked.has(n.path))).map((n) => n.path);
  return result;
}

// 게임에 넘길 상황 (Game.apply_start 가 읽는 모양)
export function exportState(s) {
  const nums = {};
  for (const [k, v] of Object.entries(s.nums)) if (v) nums[k.startsWith("clicks/") ? k : k] = v;
  return { flags: [...s.flags], states: { ...s.states }, numbers: nums, items: [...s.items], ever: [...s.ever], notes: [...s.notes], closeup: s.closeup || "" };
}

// ------------------------------------------------------------------ 문장으로

export function moveText(m, names) {
  switch (m.type) {
    case "click": return `${josa(names.object(m.path), "을/를")} 누른다` + (m.choice ? `, 선택지 '${m.choice}'` : "");
    case "use": return `${josa(names.item(m.item), "을/를")} 들고 ${josa(names.object(m.path), "을/를")} 누른다` + (m.choice ? `, 선택지 '${m.choice}'` : "");
    case "solve": return `${josa(names.object(m.path), "을/를")} 푼다`;
    case "combine": return `${josa(names.item(m.a), "과/와")} ${josa(names.item(m.b), "을/를")} 조합한다`;
    case "inspect": return `${josa(names.item(m.item), "을/를")} 조사한다`;
    case "back": return "크게 보기를 닫는다";
    case "wait": return `${m.timer} 타이머가 끝날 때까지 기다린다`;
  }
  return "?";
}

// 시험용: 할 일 목록을 처음 상황에서 실행해 본 결과
export function __test_run(P, list, roomId) { return run(P, list, newState(roomId), "", new Set()); }
export function __test_watch(P, s) { return watchers(P, s, new Set()); }
