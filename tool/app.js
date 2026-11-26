// ProjectCR 방 편집기 — 시작, 위 막대, 방 화면, 저장, 해 보기.
import * as M from "./model.js";
import { GitHub } from "./github.js";
import {
  S, h, $, asset, hasLogic, syncCreated, things, thingName, thingByFlag, pendingImages, addImage, IMAGE_DIR, store, toast, modal, ask, imageUses, REPO, GAME_URL, ROOM_DIR, GAME_FILE, LOCAL, CLICKABLE,
  roomPath, catRoom, catNode, roomFile, gameFile, objectOf, names, markDirty, validate, evalCond, K, hooks, history, loadWork, clearWork,
  snapSettings, setSnap, SNAP_SIZES, rectOf,
} from "./core.js";
import { renderPanel, refreshSummaries, refreshHead, ui } from "./editor.js";
import { checkRoom } from "./checkview.js";
import { situationBar, buildStage, nodeList, stageHooks, keyDelete, deleteNode, visibleNow, lookNow } from "./stage.js";
import { openFlow } from "./checkview.js";
import { moveText } from "./solver.js";
import { merge3 } from "./merge.js";
import { openAnimEditor, startAnimTicker, animsData } from "./anims.js";
import { openSceneEditor, scenesData, sceneHooks } from "./scenes.js";
const firstAnimId = () => Object.keys(animsData())[0] || null;

const TOKEN_KEY = "projectcr-tool-token";
const DRAFT_KEY = "projectcr-draft";        // 게임이 읽는 "저장 전 수정본"
// 파일 경로 → 보이는 이름 (게임 공통 / 방 이름)
const fileLabel = (p) => p === GAME_FILE ? "게임 공통" : p.startsWith(IMAGE_DIR) ? names.file("res://" + p) : names.room(p.replace(ROOM_DIR, "").replace(".json", ""));
// 저장 기록 제목: 방과 게임 공통은 이름으로, 그림은 몇 장인지로
function commitLabel(paths) {
  const imgs = paths.filter((p) => p.startsWith(IMAGE_DIR));
  const rest = paths.filter((p) => !p.startsWith(IMAGE_DIR)).map(fileLabel);
  if (imgs.length) rest.push(`그림 ${imgs.length}장`);
  return rest.join(", ");
}
const NAME_KEY = "projectcr-tool-name";   // 저장 기록에 남길 이름
const TOUR_KEY = "projectcr-tool-tour-done";

// 배포할 때 넣어 둔 저장용 열쇠 (tool/token.js). 있으면 토큰을 넣지 않고 바로 쓴다.
// 지금은 주소를 아는 사람이면 누구나 저장할 수 있다 — 나중에 로그인 방식으로 바꿀 자리.
async function builtInToken() {
  try {
    const { T } = await import("./token.js");
    return T ? [...atob(T)].reverse().join("") : "";
  } catch (_) {
    return "";   // 파일이 없음 (내 컴퓨터에서 시험할 때 등)
  }
}

hooks.afterChange = () => { syncCreated(); validate(); renderTop(); renderStage(); refreshSummaries(); refreshHead(); };
ui.select = select;
ui.selectRoom = selectRoom;
ui.renderTop = renderTop;
ui.playDraft = playDraft;
ui.renderStage = () => renderStage();
stageHooks({ select: (p) => select(p), rerender: () => renderStage(), renderSim: () => renderSim(), canHappen: (l, n) => hooks.canHappen(l, n) });
window.addEventListener("keydown", keyDelete);
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.drawing) { S.drawing = false; renderStage(); } });

// ------------------------------------------------------------------ 메뉴 줄과 도구 줄
// 맨 위: 메뉴 줄 (파일, 편집, 보기, 게임, 검사, 도움말). 그 아래: 자주 쓰는 것만 모은 도구 줄.

let openMenu = null;   // 열린 메뉴 이름
function closeMenus() { openMenu = null; document.querySelectorAll(".menu-drop").forEach((d) => d.remove()); document.querySelectorAll(".menu-btn.open").forEach((b) => b.classList.remove("open")); }
document.addEventListener("mousedown", (e) => { if (openMenu && !e.target.closest(".menu-drop") && !e.target.closest(".menu-btn")) closeMenus(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openMenu) closeMenus(); });

function menus() {
  const sn = snapSettings();
  const sel = S.selected && catNode(S.selected);
  const item = (label, run, opts = {}) => ({ label, run, ...opts });
  return [
    ["파일", [
      item("저장", save, { key: "Ctrl+S", disabled: !dirtyCount() }),
      item("이 방 해 보기", () => playDraft(), { hint: "저장하지 않아도 지금 고친 그대로" }),
      item("게임 열기", () => window.open(GAME_URL, "_blank")),
      "-",
      item("저장 기록", () => select("__history"), { hint: "누가 언제 무엇을 저장했나, 되돌리기" }),
    ]],
    ["편집", [
      item("되돌리기", undo, { key: "Ctrl+Z", disabled: !history.past.length }),
      item("다시 하기", redo, { key: "Ctrl+Y", disabled: !history.future.length }),
      "-",
      item("새 물건 그리기", () => { S.drawing = true; renderStage(); toast("화면에서 끌어서 네모를 그리세요. Esc 로 취소합니다.", "info", 4000); }),
      item("고른 물건 지우기", () => sel && deleteNode(sel), { key: "Delete", disabled: !sel || !sel.rect }),
    ]],
    ["보기", [
      item("칸 맞추기", () => { setSnap(!sn.on, sn.size); renderStage(); }, { check: sn.on, hint: "옮기거나 그릴 때 칸에 맞춤" }),
      item("그림도 고르기", () => { S.showAll = !S.showAll; renderStage(); }, { check: !!S.showAll, hint: "누를 수 없는 그림도 고를 수 있게" }),
      item("테두리 모두 보기", () => { S.showAllBoxes = !S.showAllBoxes; renderStage(); }, { check: !!S.showAllBoxes }),
      "-",
      item("상황 더 고르기", () => { S.simOpen = !S.simOpen; renderSim(); }, { check: !!S.simOpen }),
      item("처음 상황으로", () => { S.sim = { flags: {}, states: {}, numbers: {}, items: {} }; S.stateSel = {}; renderStage(); renderSim(); renderPanel(); }),
    ]],
    ["게임", [
      item("애니메이션 편집기", () => openAnimEditor(firstAnimId()), { hint: "그림 여러 장을 넘겨 움직이는 그림 만들기" }),
      item("장면 편집기", () => openSceneEditor(Object.keys(scenesData())[0] || null), { hint: "그림 몇 장과 움직임으로 짧은 연출 장면 만들기" }),
      item("아이템, 힌트, 업적", () => select("__items")),
      item("게임 공통", () => select("__game"), { hint: "기록 목록, 소리 이름 등" }),
      item("대사 모아 보기", () => select("__lines")),
    ]],
    ["검사", [
      item("검사 결과", () => select("__problems")),
      item("이 방 흐름도", () => openFlow(S.roomId)),
    ]],
    ["도움말", [
      item("사용법", () => tour()),
      item("마스터 가이드", () => window.open("../guide/", "_blank")),
    ]],
  ];
}

function renderMenubar() {
  const bar = $("#menubar");
  bar.innerHTML = "";
  bar.append(h("span", { class: "brand" }, "방 편집기"));
  for (const [name, items] of menus()) {
    const btn = h("button", { class: "menu-btn" + (openMenu === name ? " open" : "") }, name);
    const show = () => {
      closeMenus();
      openMenu = name;
      btn.classList.add("open");
      const r = btn.getBoundingClientRect();
      const drop = h("div", { class: "menu-drop", style: { left: r.left + "px", top: r.bottom + 2 + "px" } },
        items.map((it) => it === "-" ? h("div", { class: "menu-sep" }) :
          h("button", { class: "menu-item", disabled: !!it.disabled, title: it.hint || "", onclick: () => { closeMenus(); it.run(); } },
            h("span", { class: "mi-check" }, it.check === undefined ? "" : it.check ? "✓" : ""),
            h("span", { class: "mi-label" }, it.label),
            h("span", { class: "mi-key" }, it.key || ""))));
      document.body.append(drop);
    };
    btn.addEventListener("click", () => (openMenu === name ? closeMenus() : show()));
    btn.addEventListener("mouseenter", () => { if (openMenu && openMenu !== name) show(); });
    bar.append(btn);
  }
  bar.append(h("span", { class: "spacer" }), LOCAL ? h("span", { class: "badge" }, "시험 모드") : "");
}

const dirtyCount = () => Object.values(S.files).filter((f) => f.dirty).length + pendingImages().length;

function renderToolbar() {
  const bar = $("#toolbar");
  bar.innerHTML = "";
  const n = dirtyCount();
  const errs = S.problems.filter((p) => p.level === "err").length;
  const warns = S.problems.length - errs;
  bar.append(
    h("div", { class: "tb-group" },
      h("span", { class: "tb-label" }, "방"),
      h("select", { class: "room-select", title: "고칠 방", onchange: (e) => selectRoom(e.target.value) },
        S.catalog.rooms.map((r) => h("option", { value: r.id, selected: r.id === S.roomId }, names.room(r.id) + ((S.files[roomPath(r.id)] || {}).dirty ? " (고침)" : ""))))),
    h("div", { class: "tb-sep" }),
    h("div", { class: "tb-group" },
      h("button", { class: "tb-btn icon", title: "되돌리기 (Ctrl+Z)", disabled: !history.past.length, onclick: undo }, "↶"),
      h("button", { class: "tb-btn icon", title: "다시 하기 (Ctrl+Y)", disabled: !history.future.length, onclick: redo }, "↷")),
    h("div", { class: "tb-sep" }),
    h("button", { class: "tb-btn play", title: "저장하지 않아도 지금 고친 그대로 이 방을 해 봅니다", onclick: () => playDraft() }, "▶  이 방 해 보기"),   // 글쓰기 규칙 예외
    h("span", { class: "spacer" }),
    h("button", { class: "tb-btn status " + (errs ? "bad" : warns ? "warn" : "good"), title: "검사 결과 보기", onclick: () => select("__problems") },
      h("span", { class: "dot-mark" }), errs ? `오류 ${errs}개` : warns ? `확인할 것 ${warns}개` : "검사 통과"),
    h("button", { class: "tb-btn primary", disabled: !n, title: "Ctrl+S", onclick: save }, n ? `저장 (${n})` : "저장됨"),
    !LOCAL && !S.builtIn ? h("button", { class: "tb-btn", onclick: logout, title: "이 브라우저에서 GitHub 토큰 지우기" }, "로그아웃") : "",
  );
}

function renderTop() { renderMenubar(); renderToolbar(); renderStatus(); }

// 맨 아래 상태 줄: 지금 할 수 있는 일 안내
function renderStatus() {
  const bar = $("#statusbar");
  if (!bar) return;
  const sel = S.selected && catNode(S.selected);
  const tip = S.drawing ? "새 물건 그리기: 화면에서 끌어서 네모를 그리세요. Esc 로 취소합니다."
    : "누르면 고르고, 끌면 옮기고, 파란 모서리를 끌면 크기를 바꿉니다. 겹친 곳을 누르면 그 자리의 물건 목록이 나옵니다. Delete 키로 지웁니다.";
  bar.replaceChildren(h("span", { class: "sb-tip" }, tip), h("span", { class: "spacer" }),
    h("span", {}, sel ? `고른 물건: ${names.object(sel.path)}` : `방: ${names.room(S.roomId)}`),
    h("span", {}, dirtyCount() ? `저장하지 않은 파일 ${dirtyCount()}개` : "모두 저장됨"));
}

function undo() { if (history.undo()) afterHistory("되돌렸습니다"); }
function redo() { if (history.redo()) afterHistory("다시 했습니다"); }
function afterHistory(msg) {
  syncCreated();
  validate(); renderTop(); renderStage(); renderPanel();
  toast(msg, "info", 1200);
}

document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || !S.catalog || !$("#toolbar")) return;
  const k = e.key.toLowerCase();
  if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
  else if (k === "s") { e.preventDefault(); save(); }
});

// ------------------------------------------------------------------ 방 화면

function renderStage() {
  const room = catRoom();
  const wrap = $("#stage-wrap");
  const vbar = $("#viewbar");
  const hier = $("#hier");
  wrap.innerHTML = "";
  vbar.innerHTML = "";
  hier.innerHTML = "";
  if (!room) return;
  if (!room.views.find((v) => v.path === S.viewPath)) S.viewPath = room.views[0] && room.views[0].path;
  const view = room.views.find((v) => v.path === S.viewPath);
  const sn = snapSettings();
  const toggle = (label, on, run, title) => h("button", { class: "vb-toggle" + (on ? " on" : ""), title, onclick: run }, label);
  // 화면 위 줄: 왼쪽은 벽과 크게 보기 화면, 오른쪽은 도구와 보기 설정
  vbar.append(
    h("div", { class: "vb-tabs" }, room.views.map((v) => h("button", { class: "vb-tab" + (v.path === S.viewPath ? " on" : "") + (v.closeup ? " closeup" : ""),
      title: v.closeup ? "크게 보기 화면" : "벽", onclick: () => { S.viewPath = v.path; renderStage(); } }, names.object(v.path)))),
    h("span", { class: "spacer" }),
    h("div", { class: "vb-group" }, h("span", { class: "vb-label" }, "도구"),
      h("button", { class: "vb-toggle" + (S.drawing ? " on" : ""), title: "화면에 네모를 그려서 새 물건을 만듭니다", onclick: () => { S.drawing = !S.drawing; renderStage(); renderStatus(); } }, "＋ 새 물건 그리기")),
    h("div", { class: "vb-group" }, h("span", { class: "vb-label" }, "보기"),
      toggle("칸 맞추기", sn.on, () => { setSnap(!sn.on, sn.size); renderStage(); }, "옮기거나 크기를 바꾸거나 그릴 때 칸에 맞춥니다. Alt 를 누른 채 끌면 잠깐 꺼집니다."),
      h("select", { class: "vb-select", disabled: !sn.on, title: "칸 크기 (게임 화면 픽셀)", onchange: (e) => { setSnap(true, +e.target.value); renderStage(); } },
        SNAP_SIZES.map((s) => h("option", { value: s, selected: s === sn.size }, s + "px"))),
      toggle("그림도 고르기", !!S.showAll, () => { S.showAll = !S.showAll; renderStage(); }, "누를 수 없는 그림도 골라서 옮기거나 보이는 조건과 모습을 정합니다"),
      toggle("테두리", !!S.showAllBoxes, () => { S.showAllBoxes = !S.showAllBoxes; renderStage(); }, "누를 수 있는 곳의 테두리를 모두 보여 줍니다"),
      toggle("움직임", !S.animsPaused, () => { S.animsPaused = !S.animsPaused; renderStage(); }, "애니메이션이 붙은 물건을 화면에서 움직여 보여 줍니다. 끄면 첫 장으로 멈춥니다.")));
  if (!view) return;
  if (view.closeup) wrap.append(h("div", { class: "closeup-name" }, h("span", { class: "vb-label" }, "이 화면 이름"), closeupNameInput(view)));
  wrap.append(situationBar(view, renderStage));
  wrap.append(h("div", { class: "stage-frame" }, buildStage(view, renderStage)));
  // 왼쪽: 이 화면에 있는 것 (유니티의 하이어라키처럼)
  hier.append(h("div", { class: "pane-head", title: "흐린 것은 지금 상황에서 안 보이는 물건입니다. 누르면 그 물건이 보이는 상황으로 바꿉니다." }, h("span", {}, "이 화면에 있는 것"), h("span", { class: "pane-sub" }, names.object(view.path))), nodeList(view));
  renderStatus();
}

// 크게 보기 화면에 한글 이름 붙이기 (그 화면 노드의 이름)
function closeupNameInput(view) {
  const obj = objectOf(view.path);
  return h("input", { class: "view-name", value: (obj && obj.name) || "", placeholder: "이 화면 이름 (예: 자물쇠)", title: "크게 보기 화면의 이름. 할 일에서 이 이름으로 보입니다.",
    onchange: (e) => {
      const o = objectOf(view.path, true);
      o.name = e.target.value.trim();
      if (!o.name) delete o.name;
      markDirty();
      renderStage();
    } });
}


function renderSim() {
  const box = $("#sim");
  box.innerHTML = "";
  box.hidden = !S.simOpen;
  if (!S.simOpen) return;
  const rerender = () => { renderStage(); renderPanel(); };
  box.append(h("div", { class: "list-head" }, "상황 고르기. 바꾸면 위 화면이 그 상황대로 보입니다."));
  const grid = h("div", { class: "sim-grid" });
  // 물건 상태 (이 방 것 먼저). 장치의 상태는 게임 안에서 기록이므로 기록으로 바꾼다.
  const ts = things().sort((a, b) => (a.room === S.roomId ? 0 : 1) - (b.room === S.roomId ? 0 : 1));
  for (const t of ts) {
    const now = t.flag ? t.values[S.sim.flags[t.key] ? 1 : 0] : (S.sim.states[t.key] ?? t.values[0]);
    grid.append(h("label", {}, h("b", {}, thingName(t) + (t.room !== S.roomId ? ` (${names.room(t.room)})` : "")), " ",
      h("select", { onchange: (e) => { if (t.flag) S.sim.flags[t.key] = e.target.value === t.values[1]; else S.sim.states[t.key] = e.target.value; rerender(); } },
        t.values.map((v) => h("option", { value: v, selected: now === v }, v)))));
  }
  for (const f of K.flags().filter((f) => !thingByFlag(f))) {
    grid.append(h("label", {}, h("input", { type: "checkbox", checked: !!S.sim.flags[f], onchange: (e) => { S.sim.flags[f] = e.target.checked; rerender(); } }), ` '${names.flag(f)}' 기록 있음`));
  }
  for (const it of S.catalog.items) {
    grid.append(h("label", {}, h("input", { type: "checkbox", checked: !!S.sim.items[it.id], onchange: (e) => { S.sim.items[it.id] = e.target.checked; rerender(); } }), ` ${names.item(it.id)} 가지고 있음`));
  }
  box.append(grid);
  box.append(h("button", { class: "play", onclick: () => playDraft(simStart()) }, "이 상황으로 해 보기"));
}

// "상황별로 보기"에서 고른 것 → 게임 시작 상황
function simStart() {
  const items = Object.keys(S.sim.items).filter((k) => S.sim.items[k]);
  return { flags: Object.keys(S.sim.flags).filter((k) => S.sim.flags[k]), states: { ...S.sim.states }, numbers: { ...S.sim.numbers }, items, ever: items, notes: [], closeup: "" };
}

// ------------------------------------------------------------------ 고르기

function select(path) {
  S.selected = path;
  if (path && catNode(path)) {
    const view = catRoom().views.find((v) => v.nodes.some((x) => x.path === path));
    if (view && view.path !== S.viewPath) S.viewPath = view.path;
  }
  renderStage();
  renderPanel();
}

function selectRoom(id, rerenderPanel = true) {
  S.roomId = id;
  S.viewPath = null;
  S.selected = null;
  roomFile(id);
  renderTop();
  renderStage();
  if (rerenderPanel) renderPanel();
}

// ------------------------------------------------------------------ 해 보기 (저장 전 수정본으로 게임 열기)

function draftFiles() {
  const files = {};
  for (const [p, f] of Object.entries(S.files)) files[p] = cleaned(f.data);
  // 아직 게임에 들어가지 않은 그림 (막 올렸거나, 저장했지만 반영 전): 게임이 글자에서 그림을 만든다
  const built = new Set(S.catalog.assets.images.map((x) => x.replace(/^res:\/\//, "")));
  for (const [p, img] of Object.entries(S.images)) if (!built.has(p)) files[p] = { base64: img.base64 };
  return files;
}

function playDraft(start = null) {
  validate();
  const errs = S.problems.filter((p) => p.level === "err" && p.roomId === S.roomId);
  if (errs.length && !start?.force) {
    return ask("오류가 있습니다", `이 방에 오류가 ${errs.length}개 있습니다. 오류가 난 부분은 동작하지 않을 수 있습니다. 그래도 해 볼까요?`, "그래도 해 보기",
      () => playDraft(start ? { ...start, force: true } : { force: true }));
  }
  if (start) { delete start.force; if (!Object.keys(start).length) start = null; }
  const ok = store.set(DRAFT_KEY, JSON.stringify({ time: Date.now(), room: S.roomId, files: draftFiles(), ...(start ? { start } : {}) }));
  if (!ok) return toast("브라우저 저장 공간을 쓸 수 없어 해 볼 수 없습니다.", "bad");
  window.open(`${GAME_URL}?draft=1&room=${encodeURIComponent(S.roomId)}`, "projectcr-play");
  toast(start ? "새 탭에서 고른 상황부터 시작합니다." : "새 탭에서 지금 고친 그대로 시작합니다. 더 고친 뒤 '이 방 해 보기'를 다시 누르면 처음부터 다시 해 봅니다.", "info", 6000);
}

// ------------------------------------------------------------------ 저장

// 지금 보는 상황이 게임에서 나올 수 있는 조합인지 (막힘 검사 결과를 고칠 때마다 한 번 만든다). 모르면 null.
let reachCache = { key: null, res: null };
hooks.canHappen = (list, now) => {
  try {
    const key = S.roomId + "|" + JSON.stringify(Object.values(S.files).map((f) => f.data));
    if (reachCache.key !== key) reachCache = { key, res: checkRoom(S.roomId) };
    const res = reachCache.res;
    if (!res || res.truncated || !res.reach) return null;
    const val = (r, t) => (t.flag ? t.values[r.flags.has(t.key) ? 1 : 0] : (r.states[t.key] ?? t.values[0]));
    return res.reach.some((r) => list.every((t) => val(r, t) === now(t)));
  } catch (e) { return null; }
};
hooks.isDirty = (f) => !f.orig || JSON.stringify(cleaned(f.data)) !== f.orig;
function cleaned(data) {
  const d = JSON.parse(JSON.stringify(data));
  if (d.objects) d.objects = d.objects.map(M.cleanObject).filter((o) => Object.keys(o).length > 1);
  for (const k of ["on_first_enter", "on_enter", "item_default"]) if (Array.isArray(d[k]) && !d[k].length) delete d[k];
  if (d.memo === "") delete d.memo;
  return d;
}

// 무엇이 바뀌었나 (물건 이름 단위)
function changeSummary(f) {
  const now = cleaned(f.data);
  const before = f.orig ? JSON.parse(f.orig) : { objects: [] };
  const out = [];
  const roomId = f.data.room;
  const label = (o) => o.name || (o.create ? "새 물건" : names.object(o.node, roomId));
  if (!f.data.room) return gameSummary(before, now);
  const map = (d) => Object.fromEntries((d.objects || []).map((o) => [o.node, o]));
  const a = map(before), b = map(now);
  for (const k of Object.keys(b)) {
    if (!a[k]) out.push(`${label(b[k])}: 새로 정함`);
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${label(b[k])}: 바뀜`);
  }
  for (const k of Object.keys(a)) if (!b[k]) out.push(`${label(a[k])}: 지움`);
  const LABEL = { on_first_enter: "처음 들어왔을 때", on_enter: "들어올 때마다", item_default: "아이템을 맞지 않는 곳에 썼을 때", memo: "메모" };
  for (const k of Object.keys(LABEL)) if (JSON.stringify(before[k]) !== JSON.stringify(now[k])) out.push(`${LABEL[k]}: 바뀜`);
  return out;
}

// 게임 공통 파일에서 바뀐 것
function gameSummary(before, now) {
  const LABEL = { items: "아이템", combos: "아이템 조합", hints: "힌트", achievements: "업적", collectibles: "수집품", endings: "엔딩", chapters: "장" };
  const out = [];
  for (const [k, l] of Object.entries(LABEL)) if (JSON.stringify(before[k]) !== JSON.stringify(now[k])) out.push(`${l}: 바뀜`);
  const bn = before.names || {}, nn = now.names || {};
  const newFiles = Object.keys(nn.files || {}).filter((x) => !(bn.files || {})[x]);
  if (newFiles.length) out.push(`그림 이름 ${newFiles.length}개 새로 붙임`);
  if (JSON.stringify({ ...bn, files: 0 }) !== JSON.stringify({ ...nn, files: 0 })) out.push("기록 이름: 바뀜");
  return out;
}

async function save() {
  const dirty = Object.entries(S.files).filter(([, f]) => f.dirty);
  const imgs = pendingImages();
  if (!dirty.length && !imgs.length) return;
  validate();
  const errs = S.problems.filter((p) => p.level === "err");
  const note = h("input", { placeholder: "무엇을 바꿨는지 짧게 (비워도 됨)", style: { width: "100%" } });
  const who = h("input", { value: store.get(NAME_KEY) || "", placeholder: "예: 민지", style: { width: "100%" } });
  const body = h("div", {},
    dirty.map(([p, f]) => {
      const lines = changeSummary(f);
      const name = fileLabel(p);
      return h("div", { class: "change" }, h("b", {}, name), lines.length ? h("ul", {}, lines.map((l) => h("li", {}, l))) : h("div", { class: "muted" }, "(순서나 모양만 바뀜)"));
    }),
    errs.length ? h("p", { class: "hint bad" }, `오류가 ${errs.length}개 있습니다. 이대로 저장하면 자동 검사가 실패해서 게임에 반영되지 않습니다.`) : null,
    imgs.some(([, i]) => i.remove) ? h("div", { class: "change" }, h("b", {}, "지울 그림"), h("ul", {}, imgs.filter(([, i]) => i.remove).map(([p]) => h("li", {}, p.split("/").pop())))) : null,
    imgs.some(([, i]) => !i.remove) ? h("div", { class: "change" }, h("b", {}, "새 그림"), h("ul", { class: "img-list" }, imgs.filter(([, i]) => !i.remove).map(([p, img]) => {
      const used = imageUses("res://" + p) > 0;
      if (!used) img.skip = true; else delete img.skip;
      return h("li", {}, h("label", { class: "check" }, h("input", { type: "checkbox", checked: used, onchange: (e) => { img.skip = !e.target.checked; } }),
        " ", h("img", { class: "img-mini", src: asset("res://" + p), alt: "" }), " ", names.file("res://" + p),
        used ? null : h("span", { class: "warn-text small" }, "  아무 데도 쓰지 않아서 빼고 저장합니다. 함께 올리려면 체크하세요.")));
    }))) : null,
    ...stuckWarnings(dirty),
    h("label", { class: "field" }, h("span", {}, "내 이름 (저장 기록에 남습니다)"), who),
    h("label", { class: "field" }, h("span", {}, "무엇을 바꿨나요"), note));
  modal("저장하기", body, [
    { label: "취소", onclick: (c) => c() },
    errs.length ? { label: "문제 보기", onclick: (c) => { c(); select("__problems"); } } : null,
    { label: LOCAL ? "저장 (시험 모드: 실제로는 안 함)" : "저장", kind: "primary", onclick: (c) => { const name = who.value.trim(); if (name) store.set(NAME_KEY, name); c(); doSave(dirty, note.value.trim(), name); } },
  ].filter(Boolean));
  setTimeout(() => note.focus(), 0);
}

// 저장 전: 고친 방에 막힘이 생겼는지 (저장은 막지 않고 알려만 준다)
function stuckWarnings(dirty) {
  const out = [];
  for (const [p] of dirty) {
    if (!p.startsWith(ROOM_DIR)) continue;
    const id = p.replace(ROOM_DIR, "").replace(".json", "");
    try {
      const res = checkRoom(id);
      if (res.goalKind !== "none" && !res.goalReachable && !res.truncated) out.push(h("p", { class: "hint bad" }, `${names.room(id)}: 목표까지 갈 방법이 없습니다. 검사 화면의 막힘 검사에서 자세히 볼 수 있습니다.`));
      else if (res.deadEnd) out.push(h("p", { class: "hint warn" }, `${names.room(id)}: 이 순서로 하면 더 진행할 수 없습니다. ${res.deadEnd.path.map((m) => moveText(m, names)).join(", 그다음 ")}`));
    } catch (e) { console.warn(e); }
  }
  return out;
}

async function doSave(dirty, note, name = "") {
  const build = () => {
    const out = dirty.map(([path, f]) => ({ path, text: M.pretty(cleaned(f.data)) + "\n", sha: f.sha }));
    for (const [path, img] of pendingImages()) if (img.remove) out.push({ path, remove: true }); else if (!img.skip) out.push({ path, base64: img.base64, sha: null });
    return out;
  };
  let files = build();
  const imgs = pendingImages().filter(([, img]) => !img.skip);
  if (LOCAL) {
    console.log(files);
    return toast("시험 모드라 실제로 저장하지 않았습니다.", "info");
  }
  const label = commitLabel(files.map((f) => f.path));
  const btn = $("#toolbar .primary");
  btn.disabled = true;
  btn.textContent = "저장 중…";
  try {
    // 그사이 다른 사람이 같은 파일을 저장했으면, 최신 내용을 읽어 바뀐 부분끼리 합친 뒤 다시 저장한다 (세 번까지)
    let res = null, merged = 0;
    const clashes = [];
    for (let tries = 0; ; tries++) {
      try {
        res = await S.gh.commit(files, `${label} 고침${note ? ". " + note : ""}`, name || null);
        break;
      } catch (e) {
        if (!e.conflict || tries >= 2) throw e;
        for (const path of e.conflict) {
          const file = S.files[path];
          if (!file) continue;
          const latest = await S.gh.read(path);
          if (!latest) continue;
          const base = file.orig ? JSON.parse(file.orig) : undefined;
          file.data = merge3(base, cleaned(file.data), JSON.parse(latest.text), "", clashes);
          file.sha = latest.sha;
          file.orig = JSON.stringify(JSON.parse(latest.text));
          merged++;
        }
        files = build();
      }
    }
    if (merged) {
      validate();
      toast(clashes.length
        ? `다른 사람이 먼저 저장한 내용과 합쳐서 저장했습니다. 두 사람이 같은 곳을 다르게 고친 ${clashes.length}군데는 내 것으로 저장했습니다. 저장 기록에서 확인할 수 있습니다.`
        : "다른 사람이 먼저 저장한 내용과 합쳐서 저장했습니다.", clashes.length ? "warn" : "info", 9000);
    }
    for (const [path, img] of imgs) { if (img.remove) delete S.images[path]; else img.pending = false; }
    for (const [path, img] of pendingImages()) if (img.skip) delete S.images[path];   // 안 쓰는 그림은 버린다
    for (const f of files) {
      const file = S.files[f.path];
      if (!file) continue;
      file.sha = res.shas[f.path];
      file.dirty = false;
      file.orig = JSON.stringify(cleaned(file.data));
    }
    clearWork();
    history.markSaved();
    if (merged) { syncCreated(); renderStage(); renderPanel(); }
    toast(h("span", {}, "저장했습니다. 자동 검사를 통과하면 2, 3분 뒤 게임에 들어갑니다. ",
      h("a", { href: `https://github.com/${REPO.owner}/${REPO.repo}/actions`, target: "_blank" }, "진행 상황 보기")), "good", 9000);
  } catch (e) {
    if (e.conflict) toast(`${e.message}\n다른 사람이 계속 같은 파일을 저장하고 있어 합치지 못했습니다. 잠시 뒤 다시 저장해 보세요. 지금 고친 내용은 그대로 남아 있습니다.`, "bad", 20000);
    else if (e.status === 422) toast("다른 사람이 거의 같은 때에 저장해서 이번 저장이 들어가지 못했습니다. 잠시 뒤 다시 저장을 누르세요. 지금 고친 내용은 그대로 남아 있습니다.", "bad", 15000);
    else if (e.status === 401 || e.status === 403) toast("저장할 권한이 없습니다. 저장용 열쇠(토큰)가 만료됐거나 권한이 모자랍니다. 개발 담당에게 알려 주세요.", "bad", 15000);
    else if (!e.status) toast("인터넷 연결이 끊겨 저장하지 못했습니다. 연결을 확인하고 다시 저장하세요. 고친 내용은 남아 있습니다.", "bad", 15000);
    else toast(`저장하지 못했습니다 (${e.status}). 잠시 뒤 다시 저장해 보세요. 계속 안 되면 개발 담당에게 이 번호를 알려 주세요.`, "bad", 15000);
  }
  renderTop();
}

window.addEventListener("beforeunload", (e) => {
  if (Object.values(S.files).some((f) => f.dirty) || pendingImages().length) { e.preventDefault(); e.returnValue = ""; }
});

// ------------------------------------------------------------------ 사용법 안내

function tour(step = 0) {
  const steps = [
    ["방 편집기 사용법", "게임 속 물건을 누르면 무슨 일이 일어나는지, 언제 보이는지, 어떤 모습인지를 여기서 정합니다. 코드는 몰라도 됩니다."],
    ["1. 방과 물건 고르기", "위에서 방을 고르고 왼쪽 화면에서 물건을 누르세요. 여러 물건이 겹친 곳이면 목록이 뜹니다. 오른쪽에 그 물건의 칸이 나오고, 이름은 맨 위 칸에서 바꿉니다. 왼쪽 화면은 게임의 한 순간을 보여 주는데, 위의 '지금 보는 상황'에서 물건 상태를 바꾸면 그 모습으로 바뀝니다."],
    ["2. 문장으로 정하기", "'만약 이러면, 이렇게 한다' 꼴로 적습니다. 게임은 위에서부터 보다가 맞는 경우 하나만 실행합니다. 처음이라면 '자주 쓰는 패턴으로 만들기'부터 써 보세요."],
    ["3. 상태", "물건에 잠김, 열림 같은 상태를 만들면 상태에 따라 반응과 모습이 달라집니다. 할 일의 '물건 상태 바꾸기'로 상태를 바꾸고, 조건의 '물건이 어떤 상태일 때'로 확인합니다."],
    ["4. 바로 해 보기", "'이 방 해 보기'를 누르면 저장하지 않아도 지금 고친 그대로 게임이 열립니다. 마음에 들면 저장하고, 잘못 고쳤으면 되돌리기(Ctrl+Z)를 누릅니다."],
    ["5. 저장", "저장하면 자동 검사를 거쳐 2, 3분 뒤 게임에 들어갑니다. 위의 검사 단추가 빨간색이면 먼저 고쳐 주세요. 저장하지 않은 작업은 브라우저를 닫아도 남아 있습니다."],
  ];
  const [title, text] = steps[step];
  modal(title, h("div", {}, h("p", { class: "tour-text" }, text), h("div", { class: "tour-dots" }, steps.map((_, i) => h("span", { class: i === step ? "on" : "" })))), [
    step > 0 ? { label: "이전", onclick: (c) => { c(); tour(step - 1); } } : null,
    step < steps.length - 1 ? { label: "다음", kind: "primary", onclick: (c) => { c(); tour(step + 1); } }
      : { label: "시작하기", kind: "primary", onclick: (c) => { c(); store.set(TOUR_KEY, "1"); } },
  ].filter(Boolean));
}

// ------------------------------------------------------------------ 로그인 / 시작

function logout() {
  ask("토큰 지우기", "이 브라우저에서 GitHub 토큰을 지울까요?", "지우기", () => { store.del(TOKEN_KEY); location.reload(); }, { danger: true });
}

function loginScreen(error) {
  const app = $("#app");
  app.innerHTML = "";
  const inp = h("input", { type: "password", placeholder: "github_pat_…", style: { width: "100%" } });
  app.append(h("div", { class: "login" },
    h("h1", {}, "방 편집기"),
    h("p", {}, "방 데이터가 비공개 저장소에 있으므로 처음 한 번만 GitHub 열쇠(토큰)가 필요합니다. 열쇠는 이 브라우저에만 저장됩니다."),
    h("ol", {},
      h("li", {}, h("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank" }, "GitHub 토큰 만들기 페이지"), "를 엽니다."),
      h("li", {}, "Token name 에는 아무 이름이나 (예: 방 편집기), Expiration 에는 원하는 기간을 넣습니다."),
      h("li", {}, "Repository access 에서 ", h("b", {}, "Only select repositories"), "를 고르고 ", h("b", {}, "ProjectCR_Data"), "를 고릅니다."),
      h("li", {}, "Permissions 의 Repository permissions 에서 ", h("b", {}, "Contents"), "를 ", h("b", {}, "Read and write"), "로 바꿉니다."),
      h("li", {}, "Generate token 을 누르고, 나온 글자를 아래 칸에 붙여 넣습니다.")),
    error ? h("p", { class: "bad-text" }, error) : null,
    inp,
    h("button", { class: "primary", style: { marginTop: "12px" }, onclick: async () => {
      const token = inp.value.trim();
      if (!token) return;
      try {
        const gh = new GitHub(token, REPO.owner, REPO.repo, REPO.branch);
        if (!(await gh.check())) return loginScreen("이 토큰으로는 저장할 수 없습니다. Contents 권한을 Read and write 로 해 주세요.");
        store.set(TOKEN_KEY, token);
        start();
      } catch (e) {
        loginScreen("토큰을 확인하지 못했습니다: " + e.message);
      }
    } }, "시작"),
  ));
}

async function loadFiles() {
  if (LOCAL) {
    const list = await (await fetch("local/files.json", { cache: "no-store" })).json();
    for (const p of list) {
      const text = await (await fetch("local/" + p, { cache: "no-store" })).text();
      S.files[p] = { data: JSON.parse(text), sha: "local", dirty: false };
    }
  } else {
    // 글(방, 게임 설정)과 편집기에서 올린 그림을 동시에 받는다
    const imgsP = S.gh.readAllBinary((p) => p.startsWith(IMAGE_DIR)).catch((e) => { console.warn("그림을 읽지 못함", e); return {}; });
    const all = await S.gh.readAll((p) => (p.startsWith(ROOM_DIR) && p.endsWith(".json")) || p === GAME_FILE);
    S._imgsP = imgsP;
    for (const [p, f] of Object.entries(all)) {
      try {
        S.files[p] = { data: JSON.parse(f.text), sha: f.sha, dirty: false };
      } catch (e) {
        toast(`${p} 파일을 읽을 수 없습니다. 글자 형식이 깨졌습니다: ${e.message}`, "bad", 15000);
      }
    }
  }
  for (const f of Object.values(S.files)) f.orig = JSON.stringify(cleaned(f.data));
  // 편집기에서 올린 그림
  if (!LOCAL) {
    const imgs = await S._imgsP;
    delete S._imgsP;
    for (const [p, f] of Object.entries(imgs)) addImage(p, f.base64, false);
  }
  syncCreated();
}

function offerWork() {
  const work = loadWork();
  if (!work || !work.files) return;
  const paths = Object.keys(work.files);
  const stale = paths.filter((p) => S.files[p] && S.files[p].sha !== work.files[p].sha);
  const when = new Date(work.time).toLocaleString("ko-KR");
  modal("저장 안 한 작업이 있습니다", h("div", {},
    h("p", {}, `${when} 에 고치다 만 작업이 있습니다: `, h("b", {}, paths.map((p) => fileLabel(p)).join(", "))),
    stale.length ? h("p", { class: "hint warn" }, `그사이 다른 곳에서 ${stale.map(fileLabel).join(", ")} 내용을 저장했습니다. 이어서 하면 그 내용을 덮어씁니다.`) : null), [
    { label: "버리기", onclick: (c) => { clearWork(); c(); } },
    { label: "이어서 하기", kind: "primary", onclick: (c) => {
      for (const p of paths) {
        if (!S.files[p]) S.files[p] = { sha: null, orig: null };
        S.files[p].data = work.files[p].data;
        S.files[p].dirty = true;
      }
      history.reset();
      c();
      hooks.afterChange();
      renderPanel();
    } },
  ]);
}

async function start() {
  startAnimTicker();
  const app = $("#app");
  app.innerHTML = "";
  app.append(h("div", { class: "loading" }, "불러오는 중…"));
  try {
    S.catalog = await (await fetch("catalog.json", { cache: "no-store" })).json();
  } catch (e) {
    app.innerHTML = "";
    return app.append(h("div", { class: "loading bad-text" }, "편집기 자료(방 화면 목록)를 읽지 못했습니다: " + e.message));
  }
  if (!LOCAL) {
    const built = S.noBuiltIn ? "" : await builtInToken();
    S.builtIn = !!built;
    const token = built || store.get(TOKEN_KEY);
    if (!token) return loginScreen();
    S.gh = new GitHub(token, REPO.owner, REPO.repo, REPO.branch);
  }
  try {
    await loadFiles();
  } catch (e) {
    if (e.status === 401 || e.status === 403 || e.status === 404) {
      if (S.builtIn) { S.noBuiltIn = true; S.builtIn = false; return loginScreen("편집기에 넣어 둔 열쇠가 더는 맞지 않습니다. 담당자에게 알려 주세요. (급하면 토큰을 직접 넣어도 됩니다)"); }
      store.del(TOKEN_KEY); return loginScreen("토큰이 만료되었거나 권한이 없습니다. 다시 넣어 주세요.");
    }
    app.innerHTML = "";
    return app.append(h("div", { class: "loading bad-text" }, "데이터를 불러오지 못했습니다: " + e.message));
  }
  gameFile();
  app.innerHTML = "";
  app.append(
    h("header", { id: "menubar" }),
    h("div", { id: "toolbar" }),
    h("main", { id: "workspace" },
      h("aside", { id: "hier" }),
      h("section", { id: "center" }, h("div", { id: "viewbar" }), h("div", { id: "stage-wrap" }), h("div", { id: "sim", hidden: true })),
      h("aside", { id: "panel" })),
    h("footer", { id: "statusbar" }),
  );
  history.reset();
  validate();
  const params = new URLSearchParams(location.search);
  const first = params.get("room");
  selectRoom(S.catalog.rooms.some((r) => r.id === first) ? first : S.catalog.rooms[0].id);
  if (params.get("select")) select(params.get("select"));
  if (params.has("preview")) { S.simOpen = true; renderStage(); renderSim(); }
  if (!params.has("notour") && !store.get(TOUR_KEY)) tour();
  else offerWork();
}

start();

import { animHooks } from "./anims.js";
animHooks.afterClose = () => { syncCreated(); renderStage(); renderPanel(); renderTop(); };
sceneHooks.afterClose = () => { renderStage(); renderPanel(); renderTop(); };
// 장면의 "지금 화면"(@room) 흉내: 지금 고른 방 화면에 보이는 그림들
sceneHooks.roomSprites = () => {
  const room = catRoom();
  const view = room && (room.views.find((v) => v.path === S.viewPath) || room.views.find((v) => !v.closeup));
  if (!view) return [];
  const out = [];
  for (const n of view.nodes) {
    if (!n.rect || n.path === view.path || !visibleNow(n, view, room)) continue;
    const { texture } = lookNow(n);
    if (texture) out.push({ texture, rect: rectOf(n), flip: !!n.flip });
  }
  return out;
};
