// 왼쪽 무대.
// 원칙: 무대는 언제나 "게임의 한 순간"을 그대로 보여 준다. 여러 모습을 반투명하게 겹쳐 그리지 않는다.
//   - 어떤 순간인지는 위의 "지금 보는 상황"(물건마다 상태)으로 고른다. 처음엔 게임을 시작할 때와 같다.
//   - 겹친 곳을 누르면, 그 자리에 있는 물건들을 목록으로 보여 주고 고르게 한다.
//   - 누르면 고르고, 끌면 옮기고, 파란 모서리를 끌면 크기, Delete 키로 지운다 (모드 없음). 새 물건은 '＋ 새 물건 그리기'.
import * as M from "./model.js";
import {
  S, h, $, asset, toast, names, catRoom, objectOf, roomData, markDirty, hasLogic, evalCond, rectOf, isRemoved, boundsOf, isGroupBox,
  things, thingName, thumbOf, readCond, syncCreated, CLICKABLE, snapSettings, setSnap, snapOn, snapV, SNAP_SIZES, ask,
} from "./core.js";
import { renderPanel } from "./editor.js";
import { josa } from "./words.js";
import { attachStage } from "./create.js";
import { firstFrame } from "./anims.js";

const MIN = 16;
let hooks = { select: () => {}, rerender: () => {}, renderSim: () => {} };
export function stageHooks(h2) { hooks = h2; }

// ------------------------------------------------------------------ 지금 상황에서 보이나

function drawerOf(n, room) {
  const parts = n.path.split("/");
  if (parts[parts.length - 1] !== "Contents") return null;
  const d = room.views.flatMap((v) => v.nodes).find((x) => x.path === parts.slice(0, -1).join("/"));
  return d && d.kind === "drawer" ? d : null;
}
function visibleSelf(n, room) {
  if (isRemoved(n.path)) return false;
  const o = objectOf(n.path);
  const d = drawerOf(n, room);
  if (d) return !!S.sim.flags[d.flag];
  if (o && (o.show_if || []).length) return o.show_if.every(evalCond);
  if (n.hidden) return false;
  return true;
}
// 이 물건과 그 위(묶음)가 모두 보여야 보인다
export function visibleNow(n, view, room = catRoom()) {
  if (isRemoved(n.path)) return false;
  let p = n.path;
  while (p && p !== view.path && p.includes("/")) {
    const x = room.views.flatMap((v) => v.nodes).find((y) => y.path === p);
    if (x && !visibleSelf(x, room)) return false;
    p = p.split("/").slice(0, -1).join("/");
  }
  return true;
}
export function lookNow(n) {
  const o = objectOf(n.path);
  let texture = n.texture, tint = null, anim = null;
  if (o && o.looks) {
    const l = o.looks.find((x) => (x.if || []).every(evalCond));
    if (l) { if (l.texture) texture = l.texture; if (l.tint) tint = l.tint; if (l.anim && firstFrame(l.anim)) { anim = l.anim; texture = firstFrame(l.anim); } }
  }
  return { texture, tint, anim };
}
function brightness(hex) {
  const c = String(hex).replace("#", "");
  return ((parseInt(c.slice(0, 2), 16) + parseInt(c.slice(2, 4), 16) + parseInt(c.slice(4, 6), 16)) / 3 / 255).toFixed(2);
}

// 이 물건이 보이는 상황으로 바꾼다 (상태/기록/아이템 조건만). 바꿨으면 true.
export function showSituationFor(path, view) {
  const room = catRoom();
  let changed = false;
  const want = (c) => {
    const r = readCond(c);
    if (r && !r.t.missing) {
      const v = r.not ? r.t.values.find((x) => x !== r.value) : r.value;
      if (r.t.flag) S.sim.flags[r.t.key] = v === r.t.values[1]; else S.sim.states[r.t.key] = v;
      return (changed = true);
    }
    if ("flag" in c) { S.sim.flags[c.flag] = c.on !== false; return (changed = true); }
    if ("has" in c) { S.sim.items[c.has] = c.on !== false; return (changed = true); }
    if (c.all) return c.all.forEach(want);
    if (c.any && c.any.length) return want(c.any[0]);
    return false;
  };
  let p = path;
  while (p && p !== view.path && p.includes("/")) {
    const n = room.views.flatMap((v) => v.nodes).find((x) => x.path === p);
    const o = objectOf(p);
    if (n) { const d = drawerOf(n, room); if (d) { S.sim.flags[d.flag] = true; changed = true; } }
    for (const c of (o && o.show_if) || []) want(c);
    p = p.split("/").slice(0, -1).join("/");
  }
  return changed;
}

// ------------------------------------------------------------------ 위쪽: 모드와 상황

// 칸 맞추기 켜고 끄기, 칸 크기
export function snapControl(rerender) {
  const { on, size } = snapSettings();
  return h("span", { class: "snap-ctl", title: "옮기거나 크기를 바꾸거나 새로 그릴 때 칸에 맞춥니다. Alt 를 누른 채 끌면 잠깐 끕니다." },
    h("label", { class: "toggle" }, h("input", { type: "checkbox", checked: on, onchange: (e) => { setSnap(e.target.checked, size); rerender(); } }), " 칸 맞추기"),
    h("select", { disabled: !on, onchange: (e) => { setSnap(true, +e.target.value); rerender(); } },
      SNAP_SIZES.map((s) => h("option", { value: s, selected: s === size }, s + " 픽셀"))));
}

export function drawButton(rerender) {
  return h("button", { class: "draw-btn" + (S.drawing ? " on" : ""), title: "화면에 네모를 그려서 새 물건을 만듭니다",
    onclick: () => { S.drawing = !S.drawing; if (S.drawing) toast("화면에서 끌어서 네모를 그리세요. 그 자리에 새 물건이 생깁니다. (Esc 로 취소)", "info", 5000); rerender(); } },
    S.drawing ? "✕ 그리기 그만" : "＋ 새 물건 그리기");
}

// 이 화면에 관계있는 물건 상태 (이 화면 안의 물건이거나, 이 화면 물건의 조건에 나오는 것)
function relevantThings(view) {
  const keys = new Set();
  const look = (list) => { for (const c of list || []) { const r = readCond(c); if (r && !r.t.missing) keys.add((r.t.flag ? "f:" : "s:") + r.t.key); for (const k of ["any", "all", "not"]) look(c[k]); } };
  for (const n of view.nodes) { const o = objectOf(n.path); if (o) { look(o.show_if); for (const l of o.looks || []) look(l.if); } }
  return things().filter((t) => (t.room === S.roomId && view.nodes.some((n) => n.path === t.path)) || keys.has((t.flag ? "f:" : "s:") + t.key));
}

export function situationBar(view, rerender) {
  const list = relevantThings(view);
  const now = (t) => (t.flag ? t.values[S.sim.flags[t.key] ? 1 : 0] : (S.sim.states[t.key] ?? t.values[0]));
  const atStart = !Object.values(S.sim.flags).some(Boolean) && !Object.keys(S.sim.states).length && !Object.values(S.sim.items).some(Boolean);
  return h("div", { class: "situation" },
    h("span", { class: "sit-title", title: "왼쪽 화면은 언제나 게임의 한 순간을 보여 줍니다. 여기서 물건의 상태를 바꾸면 그 순간의 모습이 보입니다." }, "지금 보는 상황"),
    list.length ? list.map((t) => h("span", { class: "sit-thing" }, h("b", {}, thingName(t)),
      t.values.map((v) => h("button", { class: "sit-btn" + (now(t) === v ? " on" : ""), onclick: () => {
        S.stateSel = S.stateSel || {}; S.stateSel[t.key] = v;
        if (t.flag) S.sim.flags[t.key] = v === t.values[1]; else S.sim.states[t.key] = v;
        rerender(); hooks.renderSim(); renderPanel();
      } }, v)))) : h("span", { class: "muted" }, "이 화면에는 상태가 있는 물건이 없습니다."),
    !atStart && list.length && hooks.canHappen && hooks.canHappen(list, now) === false
      ? h("span", { class: "sit-warn", title: "막힘 검사로 이 방에서 일어날 수 있는 상황을 모두 찾아봤는데, 지금 고른 상태들이 한꺼번에 이렇게 되는 경우는 없었습니다. 모습을 확인하는 데는 써도 됩니다." }, "게임에서는 나오지 않는 조합")
      : null,
    h("span", { class: "spacer" }),
    atStart ? h("span", { class: "muted" }, "(게임 시작 때 모습)") : h("button", { class: "ghost small", onclick: () => { S.sim = { flags: {}, states: {}, numbers: {}, items: {} }; S.stateSel = {}; rerender(); hooks.renderSim(); renderPanel(); } }, "처음 상황으로"),
    h("button", { class: "ghost small", title: "아이템, 기록, 다른 방의 물건까지 골라 봅니다", onclick: () => { S.simOpen = !S.simOpen; hooks.renderSim(); } }, S.simOpen ? "상황 더 고르기 ▴" : "상황 더 고르기 ▾"));
}

// ------------------------------------------------------------------ 무대

const pct = (r, W, H) => ({ left: (r[0] / W * 100) + "%", top: (r[1] / H * 100) + "%", width: (r[2] / W * 100) + "%", height: (r[3] / H * 100) + "%" });

export function buildStage(view, rerender) {
  const room = catRoom();
  const [W, H] = S.catalog.screen;
  const stage = h("div", { class: "stage" });
  const shown = [];   // 지금 보이는 물건 (그리는 순서 = 뒤에서 앞으로)
  for (const n of view.nodes) {
    if (!n.rect || n.path === view.path) continue;
    if (!visibleNow(n, view, room)) continue;
    const r = rectOf(n);
    shown.push({ n, r });
    const { texture, tint, anim } = lookNow(n);
    const pos = pct(r, W, H);
    if (texture) stage.append(h("img", { class: "sprite", src: asset(texture), "data-path": n.path, draggable: "false", alt: "", ...(anim ? { "data-anim": anim } : {}),
      style: { ...pos, filter: tint ? `brightness(${brightness(tint)})` : "", transform: n.flip ? "scaleX(-1)" : "", objectFit: n.created ? "contain" : "" } }));
    else if (n.text) stage.append(h("div", { class: n.kind === "label" ? "text-node" : "button-node", "data-path": n.path, style: pos }, n.text));
    else if (n.created) stage.append(h("div", { class: "created-empty", "data-path": n.path, style: pos }));
  }
  // 누를 수 있는 물건 (+ '그림도 고르기'면 그림도). 묶음(창문 = 닫힌 그림 + 열린 그림)은 아래 목록에서 고른다.
  const pickable = (n) => CLICKABLE.has(n.kind) || (S.showAll && n.kind !== "group");
  const toGame = (e, box) => [(e.clientX - box.left) / box.width * W, (e.clientY - box.top) / box.height * H];
  const at = (x, y) => shown.filter(({ n, r }) => pickable(n) && x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]).reverse();

  // 게임에서 가방이 놓이는 오른쪽 띠 (배경 그림은 여기까지 오지 않는다)
  if (S.catalog.inventoryWidth !== 0) {
    const iw = S.catalog.inventoryWidth || 200;
    stage.append(h("div", { class: "inv-zone", style: { left: ((W - iw) / W * 100) + "%", width: (iw / W * 100) + "%" }, title: "게임에서는 이 자리에 가방(아이템 칸)이 보입니다. 배경 그림은 왼쪽 1720까지만 덮습니다." }, h("span", {}, "가방 자리")));
  }
  if (S.showAllBoxes) for (const { n, r } of shown) if (pickable(n)) stage.append(h("div", { class: "all-box", style: pct(r, W, H) }));

  // 칸 (끌거나 그리는 동안만 보인다)
  snapSettings();
  const g = S.snapSize;
  const grid = h("div", { class: "snap-grid", hidden: true, style: { backgroundSize: `${g / W * 100}% ${g / H * 100}%` } });
  stage.append(grid);
  stage.snapGrid = grid;

  // 마우스를 올린 것
  const hover = h("div", { class: "hover-box", hidden: true }, h("span", { class: "box-label" }));
  stage.append(hover);

  // 고른 것: 테두리 + 크기 손잡이
  const selNode = S.selected && view.nodes.find((x) => x.path === S.selected);
  const selOk = !!(selNode && selNode.rect && selNode.path !== view.path);
  const selVisible = selOk && visibleNow(selNode, view, room);
  const selMovable = selOk && !isRemoved(selNode.path);
  if (selOk) {
    const removed = isRemoved(selNode.path);
    const sel = h("div", { class: "sel-box" + (selVisible ? "" : " hidden-now"), "data-sel": "1", style: pct(boundsOf(selNode), W, H) },
      h("span", { class: "box-label" }, names.object(selNode.path) + (removed ? " (지움)" : selVisible ? "" : " (지금 상황에서는 안 보임)")));
    if (selMovable && !isGroupBox(selNode)) {   // 묶음은 크기 대신 통째로 옮기기만
      const handle = h("div", { class: "resize-handle", title: "끌어서 크기 바꾸기" });
      sel.append(handle);
      handle.addEventListener("mousedown", (e) => { e.stopPropagation(); press(e, selNode, "resize"); });
    }
    stage.append(sel);
  }

  // 누르기 → 그대로 떼면 고르기, 끌면 옮기기 (고르지 않은 것도 바로 끌어서 옮길 수 있다)
  let justDragged = false;
  function press(e, node, kind) {
    if (e.button !== 0) return;
    e.preventDefault();
    const box = stage.getBoundingClientRect();
    if (!box.width) return;
    const [sx, sy] = toGame(e, box);
    const r0 = [...rectOf(node)];
    const b0 = [...boundsOf(node)];   // 보이는 네모 (묶음이면 안의 그림들을 감싼 것)
    let r = r0, moving = false, ghost = null;
    const els = [...stage.querySelectorAll("[data-path]")].filter((el) => el.dataset.path === node.path || el.dataset.path.startsWith(node.path + "/"));
    const move = (ev) => {
      const [x, y] = toGame(ev, box);
      const dx = x - sx, dy = y - sy;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      // 손이 조금 떨린 것은 끌기로 치지 않는다 (화면에서 5픽셀)
      if (!moving && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return;
      if (!moving) {
        moving = true;
        hover.hidden = true;
        ghost = stage.querySelector("[data-sel]");
        if (ghost && node !== selNode) { ghost.remove(); ghost = null; }
        if (!ghost) { ghost = h("div", { class: "sel-box" }, h("span", { class: "box-label" }, names.object(node.path))); stage.append(ghost); }
      }
      // 칸 맞추기: 옮길 때는 왼쪽 위 모서리를, 크기를 바꿀 때는 오른쪽 아래 모서리를 칸에 맞춘다
      grid.hidden = !snapOn(ev);
      if (kind === "move") { const bx = snapV(b0[0] + dx, ev) - b0[0], by = snapV(b0[1] + dy, ev) - b0[1]; r = [r0[0] + bx, r0[1] + by, r0[2], r0[3]]; }
      else r = [r0[0], r0[1], Math.max(MIN, snapV(r0[0] + r0[2] + dx, ev) - r0[0]), Math.max(MIN, snapV(r0[1] + r0[3] + dy, ev) - r0[1])];
      r = r.map(Math.round);
      Object.assign(ghost.style, pct(kind === "move" ? [b0[0] + r[0] - r0[0], b0[1] + r[1] - r0[1], b0[2], b0[3]] : r, W, H));
      for (const el of els) {
        if (kind === "move") el.style.translate = `${(r[0] - r0[0]) / W * 100}cqw ${(r[1] - r0[1]) / H * 100 * 9 / 16}cqw`;
        else if (el.dataset.path === node.path) Object.assign(el.style, { width: r[2] / W * 100 + "%", height: r[3] / H * 100 + "%" });
      }
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      grid.hidden = true;
      if (!moving) return;
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 0);
      S.selected = node.path;
      placeNode(node, r);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  if (S.drawing) attachStage(stage, view);
  else {
    stage.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.target.closest(".overlap-menu")) return;
      const [x, y] = toGame(e, stage.getBoundingClientRect());
      // 고른 것 위면 그것을, 아니면 맨 앞의 것을 끈다
      if (selMovable && insideBox(selNode, x, y)) return press(e, selNode, "move");
      const top = at(x, y)[0];
      if (top && !isRemoved(top.n.path)) press(e, top.n, "move");
    });
    stage.addEventListener("mousemove", (e) => {
      if (e.buttons) return;
      const [x, y] = toGame(e, stage.getBoundingClientRect());
      const list = at(x, y);
      const top = list[0];
      stage.style.cursor = (selMovable && insideBox(selNode, x, y)) || top ? "move" : "";
      if (!top || (selNode && top.n.path === selNode.path && list.length === 1)) { hover.hidden = true; return; }
      hover.hidden = false;
      Object.assign(hover.style, pct(top.r, W, H));
      hover.firstChild.textContent = names.object(top.n.path) + (list.length > 1 ? `  (여기 겹친 물건 ${list.length}개. 누르면 목록이 뜹니다)` : "");
    });
    stage.addEventListener("mouseleave", () => { hover.hidden = true; });
    stage.addEventListener("click", (e) => {
      if (justDragged || e.target.closest(".overlap-menu")) return;
      const box = stage.getBoundingClientRect();
      const [x, y] = toGame(e, box);
      const list = at(x, y);
      if (!list.length) return hooks.select(null);
      if (list.length === 1) return hooks.select(list[0].n.path);
      chooser(stage, e, box, list);
    });
  }
  return stage;
}
const insideBox = (n, x, y) => { const r = boundsOf(n); return r && x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]; };
const inside = (n, x, y) => { const r = rectOf(n); return r && x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]; };

// 겹친 곳: 그 자리의 물건들을 앞에서부터 보여 주고 고르게 한다
function chooser(stage, e, box, list) {
  const old = stage.querySelector(".overlap-menu");
  if (old) old.remove();
  const menu = h("div", { class: "overlap-menu", style: { left: Math.min(e.clientX - box.left, box.width - 230) + "px", top: Math.min(e.clientY - box.top, box.height - 40 - list.length * 40) + "px" } },
    h("div", { class: "om-head" }, `여기에 겹친 물건 ${list.length}개 (위에 있을수록 앞)`),
    list.map(({ n }) => h("button", { class: "om-item" + (n.path === S.selected ? " on" : ""), onmouseenter: () => flash(stage, n), onclick: (ev) => { ev.stopPropagation(); menu.remove(); hooks.select(n.path); } },
      thumbOf(n.path) ? h("img", { src: asset(thumbOf(n.path)), alt: "" }) : h("span", { class: "om-noimg" }),
      h("span", {}, names.object(n.path)), h("small", {}, M.KIND_LABEL[n.kind] || ""))));
  menu.addEventListener("click", (ev) => ev.stopPropagation());
  menu.addEventListener("mousemove", (ev) => ev.stopPropagation());
  stage.append(menu);
  const away = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("mousedown", away, true); } };
  setTimeout(() => document.addEventListener("mousedown", away, true), 0);
}
function flash(stage, n) {
  const [W, H] = S.catalog.screen;
  const hover = stage.querySelector(".hover-box");
  hover.hidden = false;
  Object.assign(hover.style, pct(rectOf(n), W, H));
  hover.firstChild.textContent = names.object(n.path);
}

// ------------------------------------------------------------------ 배치 바꾸기 (패널과 무대가 같이 씀)

export function placeNode(n, r) {
  r = r.map((v) => Math.round(v));
  if (n.created) {
    const o = objectOf(n.path);
    o.create.rect = r;
    syncCreated();
  } else {
    const o = objectOf(n.path, true);
    // 원래 자리와 같으면 배치 정보를 지운다 (위의 묶음을 옮겼으면 그만큼 밀린 자리가 '원래')
    o.layout = { rect: r };
    const base = (() => { const saved = o.layout; delete o.layout; const b = rectOf(n); o.layout = saved; return b; })();
    if (base && base.every((v, i) => Math.abs(v - r[i]) < 1)) delete o.layout;
  }
  markDirty();
  hooks.rerender();
  renderPanel();
}

export function deleteNode(n) {
  const o = objectOf(n.path);
  const label = names.object(n.path);
  const finish = () => {
    S.selected = null;
    markDirty();
    syncCreated();
    hooks.rerender();
    renderPanel();
    toast(`${josa(label, "을/를")} 지웠습니다.`, "good");
  };
  if (n.created) {
    ask("물건 지우기", `${josa(label, "을/를")} 지울까요? 되돌리기(Ctrl+Z)로 되살릴 수 있습니다.`, "지우기", () => {
      const d = roomData();
      d.objects = d.objects.filter((x) => x !== o);
      finish();
    }, { danger: true });
  } else {
    const logic = hasLogic(o);
    ask("게임에서 빼기", `${josa(label, "을/를")} 게임에서 뺄까요?${logic ? " 이 물건에 정한 것(누르면 할 일 등)도 함께 쓰이지 않게 됩니다." : ""} 왼쪽 목록의 '지운 물건'에서 언제든 되살릴 수 있습니다.`, "빼기", () => {
      objectOf(n.path, true).removed = true;
      finish();
    }, { danger: true });
  }
  return true;
}

export function restoreNode(path) {
  const o = objectOf(path);
  if (!o) return;
  delete o.removed;
  if (Object.keys(o).every((k) => ["node", "name"].includes(k)) && !o.name) roomData().objects = roomData().objects.filter((x) => x !== o);
  markDirty();
  hooks.rerender();
  renderPanel();
}

// ------------------------------------------------------------------ 아래 목록

export function nodeList(view) {
  const room = catRoom();
  const list = h("div", { class: "node-list" }, h("div", { class: "list-head" }, "이 화면에 있는 것. 흐린 것은 지금 상황에서 안 보이는 물건이고, 누르면 그 물건이 보이는 상황으로 바꿉니다."));
  const base = view.path.split("/").length;
  const removedRoots = [];
  for (const n of view.nodes) {
    if (n.path === view.path) continue;
    if (isRemoved(n.path)) { const o = objectOf(n.path); if (o && o.removed) removedRoots.push(n); continue; }
    const depth = n.path.split("/").length - base;
    const obj = objectOf(n.path);
    const vis = visibleNow(n, view, room);
    list.append(h("div", { class: "node-row" + (n.path === S.selected ? " on" : "") + (vis ? "" : " off"), style: { paddingLeft: 8 + depth * 14 + "px" },
      title: vis ? "" : "지금 보는 상황에서는 보이지 않습니다. 누르면 보이는 상황으로 바꿉니다.",
      onclick: () => { if (!vis && showSituationFor(n.path, view)) { hooks.renderSim(); toast("이 물건이 보이는 상황으로 바꿨습니다.", "info"); } hooks.select(n.path); } },
      h("span", { class: "kind k-" + n.kind }, M.KIND_LABEL[n.kind] || n.kind), " ",
      obj && obj.name ? h("b", {}, obj.name) : names.object(n.path),
      n.created ? h("span", { class: "tag" }, "새로 만듦") : null,
      obj && obj.layout ? h("span", { class: "tag" }, "옮김") : null,
      hasLogic(obj) ? h("span", { class: "dot inline" }) : null));
  }
  if (removedRoots.length) {
    list.append(h("div", { class: "list-head" }, `지운 물건 (${removedRoots.length})`));
    for (const n of removedRoots) list.append(h("div", { class: "node-row off" },
      names.object(n.path), " ", h("button", { class: "small", onclick: (e) => { e.stopPropagation(); restoreNode(n.path); toast(`${josa(names.object(n.path), "을/를")} 되살렸습니다.`, "good"); } }, "되살리기")));
  }
  return list;
}

// Delete 키: 고른 물건 지우기 (글자 칸에 쓰는 중이 아닐 때)
export function keyDelete(e) {
  if (!["Delete", "Backspace"].includes(e.key) || !S.selected) return;
  if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) return;
  const n = catRoom().views.flatMap((v) => v.nodes).find((x) => x.path === S.selected);
  if (!n || !n.rect) return;
  e.preventDefault();
  deleteNode(n);
}

// 물건 칸: 위치와 크기, 원래 자리로, 지우기 (씬에 있던 물건도, 새로 만든 물건도)
export function layoutSection(n, section) {
  if (!n.rect) return null;
  const o = objectOf(n.path);
  const r = rectOf(n);
  if (isRemoved(n.path)) return section("배치", null, h("p", { class: "hint warn" }, "지운 물건입니다. 게임에 나오지 않습니다."),
    (o && o.removed) ? h("button", { onclick: () => restoreNode(n.path) }, "되살리기") : h("p", { class: "muted" }, "이 물건을 담은 묶음을 지웠습니다."));
  // 묶음은 안의 그림들을 감싼 네모로 보이고, 위치만 바꾼다 (안의 것이 같이 움직임)
  const group = isGroupBox(n);
  const b = group ? boundsOf(n) : r;
  const num = (i, label) => h("label", { class: "field small-field" }, h("span", {}, label),
    h("input", { type: "number", value: Math.round(b[i]), onchange: (e) => {
      const v = parseInt(e.target.value || "0", 10);
      const nr = [...r];
      if (group) nr[i] = r[i] + ((v || 0) - b[i]);
      else nr[i] = i >= 2 ? Math.max(MIN, v || MIN) : (v || 0);
      placeNode(n, nr);
    } }));
  return section("배치", group ? "묶음 전체의 위치 (안에 든 그림들을 감싼 네모의 왼쪽 위, 게임 화면 1920×1080 기준). 화면에서 끌어서 옮겨도 됩니다. Delete 키를 누르면 지웁니다."
      : "위치와 크기 (게임 화면 1920×1080 기준). 화면에서 끌어서 옮기거나 파란 모서리를 끌어 크기를 바꿔도 됩니다. Delete 키를 누르면 지웁니다.",
    h("div", { class: "row" }, num(0, "왼쪽"), num(1, "위"), group ? null : num(2, "가로"), group ? null : num(3, "세로")),
    h("div", { class: "row" },
      !n.created && o && o.layout ? h("button", { onclick: () => { delete o.layout; markDirty(); hooks.rerender(); renderPanel(); } }, "원래 자리로") : null,
      h("button", { class: "danger", onclick: () => deleteNode(n) }, n.created ? "이 물건 지우기" : "이 물건 게임에서 빼기")));
}
