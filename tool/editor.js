// 오른쪽 편집 칸: "만약 ~라면 → ~한다" 문장으로 보여주고, 줄을 누르면 그 자리에서 고친다.
import * as M from "./model.js";
import { condSentence, actSentence, josa } from "./words.js";
import {
  S, h, $, asset, hasLogic, setGameName, catRoom, catNode, allNodes, objectOf, roomData, gameFile, markDirty, K, names, validate,
  allRoomData, objectActions, objectConditions, walkConditions, stateNameOf, CLICKABLE, GAME_FILE,
  ask, matchText, imageUses, hooks,
} from "./core.js";
import { openWizard } from "./wizards.js";
import { createdSection, uploadImage } from "./create.js";
import { layoutSection } from "./stage.js";
import { timelineEditor } from "./timeline.js";
import { animField, animHooks, animImg, pickAnim, openAnimEditor, animName } from "./anims.js";
import { sceneField } from "./scenes.js";
import { itemsPanel } from "./items.js";
import { historyPanel } from "./history.js";
import { linesPanel } from "./lines.js";
import { solverSection, openFlow } from "./checkview.js";
import { toast, modal, everyAction, everyCondition, roomFile, readCond, readAct, renameStateKey, uniqueStateKey, thingByState, thingName, thumbOf } from "./core.js";
import { previewNow, pickCondition, pickAction, stateCondEditor, stateActEditor, statesCard, quickRuleButtons, roomStates, convertibleFlag, flagToStateDialog } from "./things.js";

export const ui = { select: () => {}, selectRoom: () => {} };   // app.js 가 채운다

let summaryUpdaters = [];
export function refreshSummaries() {
  summaryUpdaters = summaryUpdaters.filter((u) => u.el.isConnected);
  for (const u of summaryUpdaters) u.el.textContent = u.fn();
}
function live(fn, cls = "") {
  const el = h("span", { class: cls }, fn());
  summaryUpdaters.push({ el, fn });
  return el;
}

// 머리 그림만 다시 그린다 (칸 전체를 다시 그리면 쓰던 글자 칸이 사라지므로)
export function refreshHead() {
  const el = document.querySelector("#panel .ph-thumb");
  if (!el || !S.selected || !catNode(S.selected)) return;
  const pic = previewNow(S.selected);
  el.classList.toggle("empty", !pic);
  el.replaceChildren(...(pic ? [pic] : []));
}

export function renderPanel() {
  const panel = $("#panel");
  panel.innerHTML = "";
  summaryUpdaters = [];
  if (S.selected === "__game") return panel.append(gamePanel());
  if (S.selected === "__items") return panel.append(itemsPanel());
  if (S.selected === "__history") return panel.append(historyPanel());
  if (S.selected === "__lines") return panel.append(linesPanel());
  if (S.selected === "__problems") return panel.append(problemsPanel());
  const n = S.selected && catNode(S.selected);
  panel.append(n ? objectPanel(n) : roomPanel());
}

// 칸 하나. 제목 줄을 누르면 접고 편다 (접은 것은 기억한다).
//   title 은 글자, 또는 { key, title, count, actions(제목 줄 오른쪽 단추), open(처음에 펼칠지) }
const SEC_KEY = "projectcr-tool-sections";
const secOpen = (() => { try { return JSON.parse(localStorage.getItem(SEC_KEY) || "{}"); } catch (_) { return {}; } })();
export function section(title, help, ...body) {
  const o = title && typeof title === "object" && !(title instanceof Node) ? title : { title };
  const key = o.key || String(o.title).replace(/[0-9()]+/g, "").trim();
  const open = key in secOpen ? secOpen[key] : o.open !== false;
  const det = h("details", { class: "sec", open, "data-key": key },
    h("summary", { class: "sec-head" },
      h("span", { class: "sec-chev" }, "›"),
      h("span", { class: "sec-title" }, o.title),
      o.count !== undefined && o.count !== null && o.count !== "" ? h("span", { class: "sec-count" }, o.count) : null,
      h("span", { class: "spacer" }),
      o.actions ? h("span", { class: "sec-actions", onclick: (e) => e.preventDefault() }, o.actions) : null),
    h("div", { class: "sec-body" }, help ? h("p", { class: "sec-help" }, help) : null, ...body));
  det.addEventListener("toggle", () => { secOpen[key] = det.open; try { localStorage.setItem(SEC_KEY, JSON.stringify(secOpen)); } catch (_) { /* 저장 불가 */ } });
  return det;
}
// 칸 안의 작은 묶음 (제목 + 내용)
export function block(title, ...body) {
  return h("div", { class: "block" }, title ? h("div", { class: "block-title" }, title) : null, ...body);
}

// ------------------------------------------------------------------ 방 / 게임 공통 / 검사

function roomPanel() {
  const d = roomData();
  const onCh = () => markDirty();
  const objs = (d.objects || []).filter(hasLogic);
  return h("div", { class: "panel" },
    h("div", { class: "panel-head" },
      h("div", { class: "ph-text" },
        h("input", { class: "name-input", value: d.title || "", placeholder: names.room(S.roomId), title: "이 방의 이름. 편집기 어디서나 이 이름으로 보입니다.",
          oninput: (e) => { d.title = e.target.value.trim(); if (!d.title) delete d.title; onCh(); }, onchange: () => ui.renderTop && ui.renderTop() }),
        h("div", { class: "ph-kind" }, "방. 왼쪽 화면에서 물건을 누르면 그 물건을 고칩니다."))),
    section({ key: "room-goal", title: "이 방의 목표", actions: [
      h("button", { class: "btn small", onclick: () => ui.select("__problems") }, "막힘 검사"),
      h("button", { class: "btn small", onclick: () => openFlow(S.roomId) }, "흐름도")] },
      "플레이어가 이 방에서 해내야 하는 일입니다. 비워 두면 다른 방으로 가거나 엔딩을 보는 것을 목표로 봅니다.",
      condLines(d, "goal", onCh, "정하지 않음", "＋ 목표 조건")),
    roomStates(section),
    section({ key: "room-enter", title: "방에 들어올 때" }, null,
      block("처음 한 번만", actLines(d, "on_first_enter", onCh)),
      block("들어올 때마다", actLines(d, "on_enter", onCh))),
    section({ key: "room-objs", title: "무언가 정해진 물건", count: `${objs.length}개`, open: false }, null,
      h("div", { class: "obj-list" }, objs.map((o) => h("div", { class: "node-row", onclick: () => ui.select(o.node) }, names.object(o.node))))),
    section({ key: "room-memo", title: "메모", open: false }, null, h("textarea", { rows: 3, value: d.memo || "", placeholder: "이 방 메모 (나만 봄)",
      oninput: (e) => { d.memo = e.target.value; if (!d.memo) delete d.memo; onCh(); } })),
  );
}

function gamePanel() {
  const d = gameFile().data;
  const onCh = () => markDirty(GAME_FILE);
  return h("div", {},
    h("h2", {}, "게임 공통"),
    section("아이템을 맞지 않는 곳에 썼을 때", "아이템을 고른 채 물건을 눌렀는데 그 물건에 그 아이템을 쓰는 경우가 없으면 이것을 합니다. 비워 두면 평소처럼 눌립니다.",
      actLines(d, "item_default", onCh)),
    section("기록", "물건 상태로 나타내지 않은 기록입니다. 이름을 고치면 편집기 어디서나 그 이름으로 보입니다. 어떤 물건의 모습이 바뀌는 일이라면 '물건 상태로 바꾸기'를 눌러 그 물건의 상태로 옮기는 편이 알아보기 쉽습니다.",
      flagTable()),
    section("소리 이름", "소리 파일의 이름입니다. 옆의 재생 단추로 들어 봅니다.",
      nameTable(S.catalog.assets.sounds, "files", (p) => names.file(p), true)),
  );
}

function flagTable() {
  const list = K.flags().filter((f) => !f.startsWith("collect/") && !(names.thingFlag && names.thingFlag(f)));
  if (!list.length) return h("p", { class: "muted" }, "없습니다. 모두 물건 상태로 되어 있습니다.");
  return h("div", { class: "name-table" }, list.map((id) => {
    const own = ((gameFile().data.names || {}).flags || {})[id] || "";
    return h("div", { class: "row" },
      /[A-Za-z]/.test(id) ? h("input", { value: own, placeholder: names.flag(id), style: { flex: 1 }, onchange: (e) => { setGameName("flags", id, e.target.value.trim()); renderPanel(); } })
        : h("span", { style: { flex: 1 } }, names.flag(id)),
      convertibleFlag(id) ? h("button", { class: "small", title: "이 기록을 어떤 물건의 상태로 바꿉니다. 예를 들어 닫힘과 열림 두 상태를 만들고, 이 기록을 쓰던 곳도 모두 그 상태로 바꿉니다.", onclick: () => flagToStateDialog(id) }, "물건 상태로 바꾸기") : null);
  }));
}

function nameTable(ids, kind, show, playable = false) {
  if (!ids.length) return h("p", { class: "muted" }, "(없음)");
  return h("div", { class: "name-table" }, ids.map((id) => {
    const own = ((gameFile().data.names || {})[kind] || {})[id] || "";
    return h("div", { class: "row" },
      playable ? h("button", { class: "icon", title: "들어 보기", onclick: () => new Audio(asset(id)).play().catch(() => toast("소리를 재생할 수 없습니다.", "warn")) }, "듣기") : null,
      h("input", { value: own, placeholder: show(id), style: { flex: 1 },
        onchange: (e) => { setGameName(kind, id, e.target.value.trim()); renderPanel(); } }));
  }));
}

function problemsPanel() {
  validate();
  const list = S.problems;
  return h("div", {},
    h("h2", {}, "검사"),
    section("끝까지 갈 수 있나 (막힘 검사)", "플레이어가 할 수 있는 행동을 모두 따라가 보고, 목표에 갈 수 있는지와 '더는 진행할 수 없게 되는 순서'가 있는지 찾습니다.", solverSection()),
    h("h3", {}, "오타와 실수"),
    h("p", { class: "help" }, "빨간 줄은 오류입니다. 이대로 저장하면 게임에 들어가지 않습니다. 노란 줄은 한번 확인해 볼 것입니다. 줄을 누르면 그 물건으로 갑니다."),
    list.length ? list.map((p) => h("div", { class: "problem " + p.level, onclick: () => { if (p.roomId && p.roomId !== S.roomId) ui.selectRoom(p.roomId, false); ui.select(p.node); } },
      h("div", {}, `[${p.roomId ? names.room(p.roomId) : "아이템, 조합, 힌트"}] ${p.msg}`), p.hint ? h("div", { class: "hint" }, p.hint) : null))
      : h("p", { class: "good-text" }, "문제가 없습니다 ✓"),
  );
}

// ------------------------------------------------------------------ 물건

function objectPanel(n) {
  const existing = objectOf(n.path);
  const obj = existing || { node: n.path };
  const ensure = () => { if (!objectOf(n.path)) roomData().objects.push(obj); };
  const onCh = () => { ensure(); markDirty(); };
  const keys = n.keys || [];
  const clickable = keys.includes("rules");
  const out = h("div", { class: "panel" });

  // 머리: 그림, 이름, 종류
  const oldName = stateNameOf(obj);
  const nameInput = h("input", { class: "name-input", value: obj.name || "", placeholder: names.object(n.path),
    title: "이 물건의 이름. 눌러서 고칩니다.",
    oninput: (e) => { obj.name = e.target.value.trim(); if (!obj.name) delete obj.name; onCh(); },
    onchange: () => {
      if (obj.states && stateNameOf(obj) !== oldName) {
        const want = stateNameOf(obj);
        const uniq = uniqueStateKey(want, S.roomId, obj);
        if (uniq !== want) { obj.name = uniq; toast(`${josa(want, "은/는")} 다른 물건이 이미 쓰는 이름이라 ${josa(uniq, "으로/로")} 했습니다.`, "warn", 6000); }
        const n2 = renameStateKey(oldName, stateNameOf(obj));
        if (n2) toast(`이 물건의 상태를 쓰는 곳 ${n2}군데의 이름도 바꿨습니다.`, "good");
      }
      renderPanel();
    } });
  const pic = previewNow(n.path);
  out.append(h("div", { class: "panel-head" },
    h("div", { class: "ph-thumb" + (pic ? "" : " empty"), title: "지금 보는 상황에서의 모습" }, pic),
    h("div", { class: "ph-text" }, nameInput,
      h("div", { class: "ph-kind", title: "게임 파일 속 이름: " + n.name }, M.KIND_LABEL[n.kind] || "물건", n.created ? " (편집기에서 만든 물건)" : ""))));

  // 배경: 그림 바꾸기를 맨 위에
  if (n.name === "BG" && keys.includes("looks")) out.append(backgroundCard(n, obj, onCh));

  // 동작: 상태, 누르면, 장치
  out.append(h("div", { class: "group-label" }, "동작"));
  out.append(statesCard({ section, input, n, obj, onCh }));

  // 누르면
  if (clickable) {
    out.append(section({ key: "rules", title: "누르면", count: (obj.rules || []).length ? `${obj.rules.length}가지` : "",
      actions: [h("button", { class: "btn small", onclick: () => openWizard(n, obj, onCh) }, "패턴으로 만들기")] },
      "위에서부터 보고 맞는 경우 하나만 실행합니다. 아이템을 들고 누를 때는 '아이템을 들고 누르면'을 먼저 봅니다. 상태를 바꾸는 경우는 위 상태 그래프의 화살표와 같은 것이라 어느 쪽에서 고쳐도 됩니다.",
      rulesEditor(obj, onCh, n)));
  } else if (n.kind === "button") {
    out.append(h("p", { class: "note" }, "그림 버튼입니다. '누르면'을 정하면 누를 수 있는 물건이 됩니다."));
  }

  // 장치 (줍는 물건, 퍼즐, 받침대, 조건 감시)
  const dev = [];
  if (keys.includes("pickup") && !obj.create) dev.push(h("div", { class: "form" }, h("div", { class: "f-row" }, h("span", { class: "f-label" }, "줍는 아이템"),
    h("div", { class: "f-ctl" }, input({ key: "pickup", type: "item", optional: true, emptyLabel: n.item ? `(그대로: ${names.item(n.item)})` : "(없음)" }, obj, onCh)))));
  const PUZ = { on_solved: "풀면", on_wrong: "틀리면", on_placed: "아이템을 놓으면" };
  for (const k of ["on_solved", "on_wrong", "on_placed"]) if (keys.includes(k)) dev.push(block(PUZ[k], actLines(obj, k, onCh)));
  if (keys.includes("when")) dev.push(block("이것이 모두 맞는 순간 '풀면'을 한 번 실행", condLines(obj, "when", onCh, "(조건을 넣으세요)")));
  if (dev.length) out.append(section({ key: "device", title: n.kind === "pickup" ? "줍기" : "장치" }, null, ...dev));

  // 보이는 것
  if (keys.includes("show_if") || keys.includes("looks")) {
    out.append(h("div", { class: "group-label" }, "보이는 것"));
    const showCount = (obj.show_if || []).length + (obj.looks || []).length;
    out.append(section({ key: "look", title: "보이기와 모습", count: showCount ? `${showCount}개 정함` : "" }, null,
      keys.includes("show_if") ? block("이럴 때만 보인다",
        condLines(obj, "show_if", onCh, "항상 보인다"),
        (obj.show_if || []).length ? h("div", { class: "form" },
          h("div", { class: "f-row" }, h("span", { class: "f-label" }, "나타나는 시간"), h("div", { class: "f-ctl" }, numField(obj, "fade_in", onCh), h("span", { class: "f-hint" }, "초"))),
          h("div", { class: "f-row" }, h("span", { class: "f-label" }, "사라지는 시간"), h("div", { class: "f-ctl" }, numField(obj, "fade_out", onCh), h("span", { class: "f-hint" }, "초")))) : null) : null,
      keys.includes("looks") ? block("모습 바꾸기", h("p", { class: "sec-help" }, "위에서부터 보고 맞는 첫 번째 모습을 씁니다. 상태마다 다른 그림은 위 상태 칸에서 정하는 편이 쉽습니다."), looksEditor(obj, onCh)) : null));
  }

  // 위치와 기타
  out.append(h("div", { class: "group-label" }, "위치와 기타"));
  const inner = (title, help, ...body) => block(title, help ? h("p", { class: "sec-help" }, help) : null, ...body);
  const made = createdSection(n, obj, onCh, inner, input, (o, key, cb) => input({ key, type: "image", optional: true }, o, cb));
  const lay = layoutSection(n, inner);
  if (made || lay) out.append(section({ key: "layout", title: "배치", open: !!n.created }, null, made, lay));

  // 메모와 연결
  out.append(section({ key: "notes", title: "메모와 연결", open: false }, null,
    h("textarea", { rows: 2, value: obj.memo || "", placeholder: "나만 보는 메모",
      oninput: (e) => { obj.memo = e.target.value; if (!obj.memo) delete obj.memo; onCh(); } }),
    block("연결된 것", linksView(n, obj))));

  if (existing) out.append(h("div", { class: "panel-foot" }, h("button", { class: "btn link danger", onclick: () => {
    ask("정한 것 모두 지우기", `${names.object(n.path)}에 정한 것을 모두 지울까요? 물건은 남습니다. 되돌리기로 되살릴 수 있습니다.`, "모두 지우기", () => {
      const d = roomData();
      d.objects = d.objects.filter((o) => o !== existing);
      markDirty();
      renderPanel();
    }, { danger: true });
  } }, "이 물건에 정한 것 모두 지우기")));
  if (!obj.name && S.justFocusName) setTimeout(() => nameInput.focus(), 0);
  return out;
}

// 배경 그림: 조건 없는 모습 하나를 맨 뒤에 둔다 (다른 모습의 조건이 맞지 않을 때 쓰는 기본 그림)
function backgroundCard(n, obj, onCh) {
  const base = () => (obj.looks || []).find((l) => !(l.if || []).length && !l.tint);
  const anim = (base() || {}).anim || "";
  const cur = (base() || {}).texture || n.texture || "";
  const setLook = (look) => {
    obj.looks = (obj.looks || []).filter((l) => l !== base());
    if (look) obj.looks.push(look);
    if (!obj.looks.length) delete obj.looks;
    onCh(); renderPanel();
  };
  const setTex = (tex) => setLook(tex ? { texture: tex } : null);
  return section({ key: "bg", title: "배경 그림" }, null,
    h("div", { class: "bg-card" },
      anim ? animImg(anim, { class: "bg-thumb" }) : cur ? h("img", { class: "bg-thumb", src: asset(cur), alt: "" }) : h("div", { class: "bg-thumb empty" }, "그림 없음"),
      h("div", { class: "bg-side" },
        h("div", { class: "row" },
          h("button", { class: "btn primary", onclick: () => imageGallery(cur, setTex) }, cur || anim ? "배경 그림 바꾸기" : "배경 그림 넣기"),
          h("button", { class: "btn", title: "비 내리는 창밖처럼 계속 움직이는 배경", onclick: () => pickAnim(anim, (id) => setLook(id ? { anim: id } : null)) }, anim ? `움직이는 배경: ${animName(anim)}` : "움직이는 배경")),
        h("p", { class: "sec-help" }, "배경은 가로 1720, 세로 1080 칸을 덮습니다. 이 비율이 아니면 넘치는 부분은 잘립니다. 화면 오른쪽 200은 게임에서 가방이 놓이는 자리라 배경이 덮지 않습니다."))));
}

function numField(obj, key, onCh) {
  return h("input", { type: "number", step: "0.1", min: 0, class: "num-in", value: obj[key] ?? "", oninput: (e) => {
    const v = parseFloat(e.target.value); if (isNaN(v) || v === 0) delete obj[key]; else obj[key] = v; onCh(); } });
}

// ------------------------------------------------------------------ 규칙: 만약 / 아니고 / 그 밖에는

function rulesEditor(obj, onCh, n) {
  const box = h("div", { class: "rules" });
  const rerender = () => box.replaceWith(rulesEditor(obj, onCh, n));
  obj.rules = obj.rules || [];
  const itemRules = obj.rules.filter((r) => r.item !== undefined);
  const normal = obj.rules.filter((r) => r.item === undefined);
  const commit = (items, norms) => { obj.rules = [...items, ...norms]; if (!obj.rules.length) delete obj.rules; onCh(); rerender(); };

  // 아이템을 들고 누르면
  if (itemRules.length) box.append(h("div", { class: "group-title" }, "아이템을 들고 누르면"));
  itemRules.forEach((r, i) => box.append(ruleBlock(r, "item", i, itemRules, (list) => commit(list, normal), onCh)));
  // 그냥 누르면
  if (itemRules.length && normal.length) box.append(h("div", { class: "group-title" }, "그냥 누르면"));
  let elseSeen = false;
  normal.forEach((r, i) => {
    const hasCond = (r.if || []).length > 0;
    let label;
    if (!hasCond) label = i === normal.length - 1 ? (i === 0 ? "언제나" : "그 밖에는") : "언제나 (주의)";
    else label = i === 0 ? "만약" : "아니고 만약";
    const blocked = elseSeen;
    if (!hasCond) elseSeen = true;
    box.append(ruleBlock(r, label, i, normal, (list) => commit(itemRules, list), onCh, blocked));
  });
  if (!obj.rules.length) box.append(h("p", { class: "empty" }, "아직 아무 일도 일어나지 않습니다. 아래에서 경우를 더하거나 자주 쓰는 패턴으로 만드세요."));

  const hasElse = normal.length && !(normal[normal.length - 1].if || []).length;
  box.append(h("div", { class: "add-row" },
    h("button", { class: "add", onclick: () => pickCondition((c, openIt) => {
      const r = { if: [c], do: [] };
      if (openIt) S.justAdded = c;
      const list = [...normal];
      if (hasElse) list.splice(list.length - 1, 0, r); else list.push(r);
      commit(itemRules, list);
    }) }, "＋ 만약 이러면"),
    !hasElse ? h("button", { class: "add", onclick: () => commit(itemRules, [...normal, { do: [] }]) }, "＋ 그 밖에는 (언제나)") : null,
    h("button", { class: "add", onclick: () => commit([...itemRules, { item: "", do: [] }], normal) }, "＋ 아이템을 들고 누르면"),
  ));
  return box;
}

function ruleBlock(r, label, i, list, setList, onCh, blocked = false) {
  const tools = [
    h("button", { class: "icon", title: "위로", disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; setList(list); } }, "↑"),
    h("button", { class: "icon", title: "아래로", disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; setList(list); } }, "↓"),
    h("button", { class: "icon", title: "복제", onclick: () => { list.splice(i + 1, 0, JSON.parse(JSON.stringify(r))); setList(list); } }, "⧉"),
    h("button", { class: "icon del", title: "이 경우 지우기", onclick: () => { list.splice(i, 1); setList(list); } }, "✕"),
  ];
  const block = h("div", { class: "rule" + (blocked ? " blocked" : "") });
  const head = h("div", { class: "rule-head" });
  if (label === "item") {
    head.append(input({ key: "item", type: "item", emptyLabel: "(아이템 고르기)", keepEmpty: true }, r, () => { onCh(); }),
      h("span", { class: "kw" }, "들고 누르면"));
  } else {
    head.append(h("span", { class: "kw" + (label.startsWith("만약") || label.startsWith("아니고") ? "" : " else") }, label));
  }
  // 물건 상태를 바꾸는 경우는 상태 그래프의 화살표(바뀌는 길)와 같은 것이다
  const st = (r.do || []).map((a) => readAct(a)).find((x) => x && !x.t.missing);
  if (st) head.append(h("span", { class: "rule-tag", title: `${thingName(st.t)} 상태 그래프의 화살표와 같은 것입니다. 여기서 고쳐도 되고, 상태 칸의 그래프에서 화살표를 눌러 고쳐도 됩니다.` },
    st.next ? `${thingName(st.t)} 다음 상태로` : `${thingName(st.t)}: ${st.value}`));
  head.append(h("span", { class: "spacer" }), h("span", { class: "tools" }, tools));
  block.append(head);
  if (blocked) block.append(h("div", { class: "hint warn" }, "위에 '언제나'가 있어서 이 경우는 실행되지 않습니다. '언제나'를 맨 아래로 옮기세요."));
  const isElse = label !== "item" && !(r.if || []).length;
  const condCh = () => { onCh(); if (isElse !== !(r.if || []).length && label !== "item") setList(list); };
  block.append(h("div", { class: "rule-conds" },
    condLines(r, "if", condCh, null, label === "item" ? "＋ 그리고 만약…" : isElse ? "＋ 조건 붙이기" : "＋ 조건")));
  block.append(h("div", { class: "then" }, "그러면"));
  block.append(actLines(r, "do", onCh));
  block.append(h("input", { class: "memo-inline", value: r.note || "", placeholder: "메모 (예: 열쇠로 열기)",
    oninput: (e) => { r.note = e.target.value; if (!r.note) delete r.note; onCh(); } }));
  return block;
}

// ------------------------------------------------------------------ 모습

function looksEditor(obj, onCh) {
  const box = h("div", { class: "rules" });
  const rerender = () => box.replaceWith(looksEditor(obj, onCh));
  const list = obj.looks || [];
  list.forEach((l, i) => {
    const block = h("div", { class: "rule" },
      h("div", { class: "rule-head" }, h("span", { class: "kw" }, (l.if || []).length ? "만약" : "언제나"), h("span", { class: "spacer" }),
        h("span", { class: "tools" }, listTools(list, i, () => { if (!list.length) delete obj.looks; onCh(); rerender(); }))),
      condLines(l, "if", onCh, null, "＋ 조건"),
      h("div", { class: "then" }, "이런 모습으로"),
      h("label", { class: "field" }, h("span", {}, "그림 (비우면 그대로)"), input({ key: "texture", type: "image", optional: true }, l, onCh)),
      h("label", { class: "field" }, h("span", {}, "애니메이션 (고르면 그림 대신 계속 돕니다)"), input({ key: "anim", type: "anim", optional: true }, l, onCh)),
      h("label", { class: "field" }, h("span", {}, "색 (비우면 원래 색, 어둡게 하려면 회색)"), input({ key: "tint", type: "color", optional: true }, l, onCh)));
    box.append(block);
  });
  box.append(h("button", { class: "add", onclick: () => { obj.looks = obj.looks || []; obj.looks.push({ if: [] }); onCh(); rerender(); } }, "＋ 모습 추가"));
  return box;
}

function listTools(list, i, after) {
  return [
    h("button", { class: "icon", disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; after(); } }, "↑"),
    h("button", { class: "icon", disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; after(); } }, "↓"),
    h("button", { class: "icon", title: "복제", onclick: () => { list.splice(i + 1, 0, JSON.parse(JSON.stringify(list[i]))); after(); } }, "⧉"),
    h("button", { class: "icon del", title: "지우기", onclick: () => { list.splice(i, 1); after(); } }, "✕"),
  ];
}

// ------------------------------------------------------------------ 줄: 조건 / 할 일

// 한 줄: 문장이 보이고, 누르면 아래에 고치는 칸이 열린다.
function lineItem(dataObj, sentenceFn, bodyFn, tools, cls) {
  const open = S.open.get(dataObj) ?? (S.justAdded === dataObj);
  const body = h("div", { class: "line-body" });
  const el = h("div", { class: "line " + cls + (open ? " open" : "") },
    h("div", { class: "line-head", onclick: () => {
      const now = !el.classList.contains("open");
      S.open.set(dataObj, now);
      el.classList.toggle("open", now);
      if (now && !body.childElementCount) body.append(bodyFn());
    } }, live(sentenceFn, "sentence"), h("span", { class: "tools", onclick: (e) => e.stopPropagation() }, tools)),
    body);
  if (open) body.append(bodyFn());
  return el;
}

export function condLines(parent, key, onCh, emptyText = null, addLabel = "＋ 조건") {
  const box = h("div", { class: "lines" });
  const rerender = () => box.replaceWith(condLines(parent, key, onCh, emptyText, addLabel));
  const list = parent[key] || [];
  const after = () => { if (!list.length) delete parent[key]; onCh(); rerender(); };
  if (!list.length && emptyText) box.append(h("div", { class: "empty" }, emptyText));
  list.forEach((c, i) => {
    box.append(lineItem(c, () => condSentence(c, names), () => condBody(c, onCh, rerender), listTools(list, i, after), "cond"));
  });
  box.append(h("button", { class: "add", onclick: () => pickCondition((c, open) => {
    if (open) S.justAdded = c;
    parent[key] = parent[key] || [];
    parent[key].push(c);
    onCh(); rerender();
  }) }, addLabel));
  return box;
}

export function actLines(parent, key, onCh) {
  const box = h("div", { class: "lines acts" });
  const rerender = () => box.replaceWith(actLines(parent, key, onCh));
  const list = parent[key] || [];
  const after = () => { onCh(); rerender(); };
  if (!list.length) box.append(h("div", { class: "empty" }, "(할 일 없음)"));
  list.forEach((a, i) => {
    box.append(lineItem(a, () => actSentence(a, names), () => actBody(a, onCh, rerender), listTools(list, i, after), "act"));
  });
  box.append(h("button", { class: "add", onclick: () => pickAction((a, open) => {
    if (open) S.justAdded = a;
    parent[key] = parent[key] || [];
    parent[key].push(a);
    onCh(); rerender();
  }) }, "＋ 할 일"));
  return box;
}

// 종류 바꾸기: 같은 칸(객체)을 새 종류로 갈아 끼운다 (목록 안 위치는 그대로)
function replaceWith(target, fresh) {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, fresh);
}

function condBody(c, onCh, rerender) {
  const t = M.conditionType(c);
  if (readCond(c)) return h("div", {}, stateCondEditor(c, onCh, rerender), otherKind(c, M.CONDITIONS, null, onCh, rerender));
  return h("div", {},
    h("label", { class: "field" }, h("span", {}, "종류"),
      h("select", { onchange: (e) => { replaceWith(c, M.CONDITIONS.find((x) => x.id === e.target.value).make()); S.open.set(c, true); onCh(); rerender(); } },
        M.CONDITIONS.map((x) => h("option", { value: x.id, selected: t && x.id === t.id }, x.label)))),
    t ? typeFields(t, c, onCh, rerender) : h("pre", {}, JSON.stringify(c)));
}

// 물건 상태 줄에서 다른 종류로 바꾸기 (접어 둠)
function otherKind(d, types, groups, onCh, rerender) {
  return h("details", { class: "other-kind" }, h("summary", {}, "다른 종류로 바꾸기"),
    h("select", { onchange: (e) => { if (!e.target.value) return; replaceWith(d, types.find((x) => x.id === e.target.value).make()); S.open.set(d, true); onCh(); rerender(); } },
      h("option", { value: "" }, "(종류 고르기)"),
      groups ? groups.map((g) => h("optgroup", { label: g }, types.filter((x) => x.group === g).map((x) => h("option", { value: x.id }, x.label))))
        : types.map((x) => h("option", { value: x.id }, x.label))));
}

// 할 일 하나를 고치는 칸 (타임라인에서도 쓴다)
export function actionEditor(a, onCh, rerender) { return actBody(a, onCh, rerender); }

function actBody(a, onCh, rerender) {
  const t = M.actionType(a);
  if (t && t.id === "timeline") return h("div", {}, timelineEditor(a, onCh), otherKind(a, M.ACTIONS, M.ACTION_GROUPS, onCh, rerender));
  if (readAct(a)) return h("div", {}, stateActEditor(a, onCh, rerender), otherKind(a, M.ACTIONS, M.ACTION_GROUPS, onCh, rerender));
  return h("div", {},
    h("label", { class: "field" }, h("span", {}, "종류"),
      h("select", { onchange: (e) => { replaceWith(a, M.ACTIONS.find((x) => x.id === e.target.value).make()); S.open.set(a, true); onCh(); rerender(); } },
        M.ACTION_GROUPS.map((g) => h("optgroup", { label: g }, M.ACTIONS.filter((x) => x.group === g).map((x) => h("option", { value: x.id, selected: t && x.id === t.id }, x.label)))))),
    t ? typeFields(t, a, onCh, rerender) : h("pre", {}, JSON.stringify(a)));
}

function typeFields(t, d, onCh, rerender) {
  return t.fields.filter((f) => !f.show || f.show(d)).map((f) => {
    if (f.type === "conditions") return h("div", { class: "sub" }, h("div", { class: "sub-title" }, f.label), condLines(d, f.key, onCh));
    if (f.type === "actions") return h("div", { class: "sub" }, h("div", { class: "sub-title" }, f.label), actLines(d, f.key, onCh));
    if (f.type === "choices") return h("div", { class: "sub" }, h("div", { class: "sub-title" }, f.label), choiceList(d, onCh));
    const needRerender = f.type === "select" || f.type === "state";
    return h("label", { class: "field" + (f.type === "bool" ? " check" : "") }, f.type === "bool" ? null : h("span", {}, f.label),
      input(f, d, () => { onCh(); if (needRerender) rerender(); }), f.type === "bool" ? h("span", {}, f.label) : null);
  });
}

function choiceList(talk, onCh) {
  const box = h("div", { class: "rules" });
  const rerender = () => box.replaceWith(choiceList(talk, onCh));
  const list = talk.choices || [];
  list.forEach((c, i) => {
    box.append(h("div", { class: "rule" },
      h("div", { class: "rule-head" }, h("span", { class: "kw" }, `선택지 ${i + 1}`),
        h("input", { value: c.text || "", placeholder: "버튼 글자 (예: 도와줘)", oninput: (e) => { c.text = e.target.value; onCh(); } }),
        h("span", { class: "spacer" }), h("span", { class: "tools" }, listTools(list, i, () => { if (!list.length) delete talk.choices; onCh(); rerender(); }))),
      h("div", { class: "sub-title" }, "이럴 때만 보인다 (비우면 항상)"), condLines(c, "if", onCh),
      h("div", { class: "then" }, "고르면"), actLines(c, "do", onCh)));
  });
  box.append(h("button", { class: "add", onclick: () => { talk.choices = talk.choices || []; talk.choices.push({ text: "", do: [] }); onCh(); rerender(); } }, "＋ 선택지"));
  return box;
}

// ------------------------------------------------------------------ 입력 칸 하나

// 일어난 일 고르기: 한글 이름으로 보이는 목록 + 새로 만들기 (새로 만들 때는 한글로 적으면 그대로 이름이 된다)
function flagPicker(f, val, set) {
  const NEW = "__new";
  const list = K.flags();
  if (val && !list.includes(val)) list.push(val);
  const opts = list.map((x) => [x, names.flag(x)]).sort((a, b) => a[1].localeCompare(b[1], "ko"));
  const wrap = h("div", { class: "row" });
  const sel = h("select", { onchange: (e) => {
      if (e.target.value === NEW) return typeNew();
      set(e.target.value);
    } },
    h("option", { value: "" }, "(기록 고르기)"),
    opts.map(([v, label]) => h("option", { value: v, selected: v === val }, label)),
    h("option", { value: NEW }, "＋ 새로 만들기…"));
  const typeNew = () => {
    const inp = h("input", { placeholder: "예: 이불 걷음, 편지 읽음", style: { flex: 1 } });
    const ok = () => { const v = inp.value.trim(); if (v) set(v); renderPanel(); };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") ok(); });
    wrap.replaceChildren(inp, h("button", { onclick: (e) => { e.preventDefault(); ok(); } }, "확인"), h("button", { class: "ghost", onclick: (e) => { e.preventDefault(); renderPanel(); } }, "취소"));
    inp.focus();
  };
  wrap.append(sel);
  return wrap;
}

// 내가 올린 그림 지우기: 어디서든 쓰고 있으면 지우지 않는다. 저장 전이면 바로 빠지고, 저장한 것이면 다음 저장 때 저장소에서 지운다.
function removeUpload(res, redraw) {
  const path = res.slice("res://".length);
  const uses = imageUses(res);
  if (uses) return toast(`이 그림을 ${uses}곳에서 쓰고 있어서 지울 수 없습니다. 쓰는 곳에서 먼저 다른 그림으로 바꾸세요.`, "warn", 7000);
  ask("그림 지우기", `${josa(names.file(res), "을/를")} 지울까요?`, "지우기", () => {
    const img = S.images[path];
    if (img && img.pending) delete S.images[path];
    else if (img) { img.pending = true; img.remove = true; }
    const g = gameFile().data;
    if (g.names && g.names.files && g.names.files[res]) { delete g.names.files[res]; markDirty(GAME_FILE); }
    hooks.afterChange();
    redraw();
  }, { danger: true });
}

// 그림 고르기: 이름 대신 그림을 보고 고른다
const FOLDER_NAME = { Item: "아이템", Common: "공통", UI: "화면 단추", __uploaded: "내가 올린 그림" };
function imageGallery(current, onPick) {
  const groups = {};
  const uploaded = Object.keys(S.images).map((p) => "res://" + p);
  for (const p of [...new Set([...S.catalog.assets.images, ...uploaded])]) {
    if (S.images[p.slice("res://".length)]?.remove) continue;
    const folder = p.startsWith("res://Data/Images/") ? "__uploaded" : p.replace("res://Sprites/", "").split("/")[0];
    (groups[folder] = groups[folder] || []).push(p);
  }
  const folderName = (f) => FOLDER_NAME[f] || (S.catalog.rooms.some((r) => r.id === f) ? names.room(f) : f.match(/^Room0*(\d+)$/) ? f.replace(/^Room0*(\d+)$/, "$1번 방") : "기타");
  const search = h("input", { placeholder: "이름으로 찾기 (예: 열쇠, 커튼)", style: { width: "100%" } });
  const body = h("div", { class: "gallery" });
  let close;
  const draw = () => {
    const q = search.value.trim();
    body.replaceChildren(...Object.entries(groups).sort(([a], [b]) => (a === S.roomId ? -1 : b === S.roomId ? 1 : a.localeCompare(b))).map(([folder, list]) => {
      const shown = list.filter((p) => matchText(names.file(p) + " " + p.split("/").pop(), q));
      if (!shown.length) return "";
      return h("div", {}, h("div", { class: "list-head" }, folderName(folder)),
        h("div", { class: "gallery-grid" }, shown.map((p) => {
          const mine = folder === "__uploaded";
          const del = mine ? h("span", { class: "g-del", role: "button", title: "이 그림 지우기", onclick: (e) => { e.stopPropagation(); removeUpload(p, draw); } }, "✕") : null;
          return h("button", { class: "gallery-item" + (p === current ? " on" : ""), title: names.file(p), onclick: () => { onPick(p); close(); } },
            h("img", { src: asset(p), loading: "lazy", alt: "" }), h("span", {}, names.file(p)), del);
        })));
    }));
  };
  search.addEventListener("input", draw);
  draw();
  close = modal("그림 고르기", h("div", { class: "gallery-wrap" },
    h("div", { class: "row" }, search, h("button", { class: "primary", title: "내 컴퓨터의 그림(PNG, JPG, WEBP)을 올립니다. 저장하면 게임에 들어갑니다.",
      onclick: () => uploadImage((p) => { onPick(p); close(); toast("그림을 올렸습니다. '저장'하면 게임에 들어갑니다 (해 보기에서는 바로 보임).", "good", 6000); }) }, "＋ 내 그림 올리기")),
    body), [
    { label: "그림 없애기", onclick: (c) => { onPick(""); c(); } },
    { label: "닫기", onclick: (c) => c() },
  ]);
}

export function input(f, d, onCh) {
  const get = () => (f.get ? f.get(d) : d[f.key]);
  const set = (v) => {
    if (f.set) f.set(d, v);
    else if ((v === "" || v === undefined || v === null) && f.optional) delete d[f.key];
    else if (f.type === "bool" && v === f.def) delete d[f.key];
    else d[f.key] = v;
    onCh();
  };
  const val = get();
  const listId = (name, values) => {
    const id = "dl-" + name;
    let dl = document.getElementById(id);
    if (!dl) { dl = h("datalist", { id }); document.body.append(dl); }
    dl.replaceChildren(...values.map((v) => h("option", { value: v })));
    return id;
  };
  const select = (options, emptyLabel) => h("select", { onchange: (e) => set(e.target.value) },
    (f.optional || emptyLabel) ? h("option", { value: "" }, emptyLabel || f.emptyLabel || "(없음)") : null,
    options.map(([v, label]) => h("option", { value: v, selected: v === val }, label)),
    val && !options.some(([v]) => v === val) ? h("option", { value: val, selected: true }, `${val} (없음!)`) : null);

  switch (f.type) {
    case "bool": return h("input", { type: "checkbox", checked: val === undefined ? f.def : !!val, onchange: (e) => set(e.target.checked) });
    case "int": return h("input", { type: "number", step: 1, min: f.min, value: val ?? f.def ?? 0, oninput: (e) => set(parseInt(e.target.value || "0", 10)) });
    case "float": return h("input", { type: "number", step: 0.1, value: val ?? f.def ?? 0, oninput: (e) => { const v = parseFloat(e.target.value); set(isNaN(v) ? (f.def ?? 0) : v); } });
    case "multiline": return h("textarea", { rows: f.rows || 3, value: val ?? "", oninput: (e) => set(e.target.value) });
    case "lines": return h("textarea", { rows: 4, value: (val || []).join("\n"), placeholder: "한 줄에 하나씩", oninput: (e) => set(e.target.value.split("\n")) });
    case "flag": return flagPicker(f, val, set);
    case "number": return h("input", { list: listId("numbers", K.numbers()), value: val ?? "", placeholder: "예: 동전", oninput: (e) => set(e.target.value.trim()) });
    case "noteTitle": return h("input", { list: listId("notes", K.notes()), value: val ?? "", oninput: (e) => set(e.target.value) });
    case "state": return select(Object.keys(K.states()).map((s) => [s, thingByState(s) ? thingName(thingByState(s)) : s]), "(물건 고르기)");
    case "stateValue": {
      const st = K.states()[d[f.stateKey]];
      return st ? select(st.map((s) => [s, s]), "(상태 고르기)") : h("input", { value: val ?? "", placeholder: "먼저 물건을 고르세요", oninput: (e) => set(e.target.value) });
    }
    case "item": {
      const sel = select(S.catalog.items.map((i) => [i.id, names.item(i.id)]), f.emptyLabel || (f.optional ? "(없음)" : "(아이템 고르기)"));
      return sel;
    }
    case "room": return select(S.catalog.rooms.map((r) => [r.id, names.room(r.id)]), "(방 고르기)");
    case "collectible": return select((gameFile().data.collectibles || []).map((c) => [c.id, c.title || c.id]), "(수집품 고르기. 목록은 '아이템, 힌트, 업적' 화면에)");
    case "achievement": return select((gameFile().data.achievements || []).map((a) => [a.id, a.title || a.id]), "(업적 고르기. 목록은 '아이템, 힌트, 업적' 화면에)");
    case "timerName": return h("input", { list: listId("timers", K.timers()), value: val ?? "", placeholder: "타이머 이름", oninput: (e) => set(e.target.value.trim()) });
    case "closeup": return select(catRoom().views.filter((v) => v.closeup).map((v) => [v.name, names.closeup(v.name)]), "(크게 볼 화면 고르기)");
    case "node": {
      const nodes = allNodes().filter((n) => n.rect && n.kind !== "group");
      return select(nodes.map((n) => [f.byName ? n.name : n.path, names.object(n.path)]), f.optional ? "(화면 전체)" : "(물건 고르기)");
    }
    case "sound": {
      const sel = select(S.catalog.assets.sounds.map((p) => [p, names.file(p)]), f.optional ? "(없음)" : "(소리 고르기)");
      const play = h("button", { class: "icon", title: "들어 보기", onclick: (e) => { e.preventDefault(); const p = get(); if (p) new Audio(asset(p)).play().catch(() => toast("이 브라우저에서는 소리를 재생할 수 없습니다.", "warn")); } }, "듣기");
      return h("div", { class: "row" }, sel, play);
    }
    case "video": return select(S.catalog.assets.videos.map((p) => [p, names.file(p)]), "(동영상 고르기)");
    case "anim": return animField(val, (v) => set(v));
    case "scene": return sceneField(val, (v) => set(v));
    case "image": {
      const wrap = h("div", { class: "image-pick" });
      const prev = h("img", { class: "mini", src: val ? asset(val) : "", hidden: !val });
      const btn = h("button", { onclick: (e) => { e.preventDefault(); imageGallery(get(), (p) => { set(p); prev.src = p ? asset(p) : ""; prev.hidden = !p; btn.textContent = p ? names.file(p) + " (바꾸기)" : "그림 고르기"; }); } },
        val ? names.file(val) + " (바꾸기)" : "그림 고르기");
      wrap.append(btn, prev);
      return wrap;
    }
    case "color": {
      const hex = (val || "#ffffff").slice(0, 7);
      return h("div", { class: "row" }, h("input", { type: "color", value: hex, oninput: (e) => set(e.target.value) }),
        f.optional && val ? h("button", { class: "icon", title: "원래 색으로", onclick: () => set("") }, "✕") : null);
    }
    case "vec2": {
      const v = val || [0, 0];
      const upd = (i, x) => { const n = [...(get() || [0, 0])]; n[i] = parseFloat(x) || 0; set(n); };
      return h("div", { class: "row" },
        h("input", { type: "number", value: v[0], oninput: (e) => upd(0, e.target.value) }),
        h("input", { type: "number", value: v[1], oninput: (e) => upd(1, e.target.value) }));
    }
    case "select": return select(f.options, null);
    default: return h("input", { value: val ?? "", oninput: (e) => set(e.target.value) });
  }
}

// ------------------------------------------------------------------ 연결된 것

function linksView(n, obj) {
  const changes = [];
  objectActions(obj, (a) => {
    const t = M.actionType(a);
    if (!t) return;
    if (["state", "set", "unset", "toggle", "give", "take", "numberAdd", "numberSet", "go", "note"].includes(t.id)) changes.push(actSentence(a, names));
  });
  const myState = obj.states ? stateNameOf(obj) : null;
  const reads = new Set();
  objectConditions(obj, (c) => { if (c.flag) reads.add("flag:" + c.flag); if (c.state) reads.add("state:" + c.state); });
  if (myState) reads.add("state:" + myState);
  const affectedBy = [];
  const affects = [];
  for (const d of allRoomData()) for (const o of d.objects || []) {
    if (d.room === S.roomId && o.node === n.path) continue;
    const label = `${d.room === S.roomId ? "" : d.room + " > "}${o.name || o.node.split("/").pop()}`;
    let by = false, to = false;
    objectActions(o, (a) => {
      if ((a.state && reads.has("state:" + a.state)) || ["set", "unset", "toggle"].some((k) => a[k] && !("number" in a) && reads.has("flag:" + a[k]))) by = true;
    });
    const mine = new Set();
    objectActions(obj, (a) => { if (a.state && M.actionType(a).id === "state") mine.add("state:" + a.state); for (const k of ["set", "unset", "toggle"]) if (a[k] && !("number" in a)) mine.add("flag:" + a[k]); });
    objectConditions(o, (c) => { if ((c.state && mine.has("state:" + c.state)) || (c.flag && mine.has("flag:" + c.flag))) to = true; });
    const go = () => { if (d.room !== S.roomId) ui.selectRoom(d.room, false); ui.select(o.node); };
    if (by) affectedBy.push(h("a", { class: "link-chip", onclick: go }, label));
    if (to) affects.push(h("a", { class: "link-chip", onclick: go }, label));
  }
  return h("div", { class: "links" },
    h("div", {}, h("b", {}, "이 물건이 하는 일: "), changes.length ? h("ul", {}, changes.map((c) => h("li", {}, c))) : h("span", { class: "muted" }, "없음")),
    h("div", {}, h("b", {}, "이 물건 때문에 바뀌는 것: "), affects.length ? affects : h("span", { class: "muted" }, "없음")),
    h("div", {}, h("b", {}, "이 물건을 바꾸는 것: "), affectedBy.length ? affectedBy : h("span", { class: "muted" }, "없음")));
}

// 이름 칸을 누르면 글 전체가 골라져서 바로 새 이름을 칠 수 있다
if (typeof document !== "undefined") {
  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (el && el.matches && el.matches("input.name-input, input.sd-name")) setTimeout(() => { if (document.activeElement === el) el.select(); }, 0);
  });
}

animHooks.pickImage = (cur, onPick) => imageGallery(cur, onPick);
