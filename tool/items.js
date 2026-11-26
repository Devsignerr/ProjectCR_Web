// 아이템 · 조합 · 힌트 화면 (Data/game.json 의 "items", "combos", "hints").
// 아이템 그림과 아이디는 개발 쪽(Items 폴더)에서 만들고, 이름/설명/조사/조합/힌트는 여기서 고친다.
import { S, h, asset, gameFile, markDirty, names, GAME_FILE } from "./core.js";
import { section, actLines, condLines, renderPanel } from "./editor.js";

const onCh = () => markDirty(GAME_FILE);

// 아이템 하나의 데이터 (없으면 만든다)
function itemEntry(id) {
  const d = gameFile().data;
  d.items = d.items || {};
  if (!d.items[id]) {
    const it = S.catalog.items.find((x) => x.id === id);
    d.items[id] = { name: (it && it.name) || "" };
  }
  return d.items[id];
}

function itemSelect(value, onPick, emptyLabel) {
  return h("select", { onchange: (e) => onPick(e.target.value) },
    h("option", { value: "" }, emptyLabel),
    S.catalog.items.map((it) => h("option", { value: it.id, selected: it.id === value }, names.item(it.id))));
}

function icon(id) {
  const it = S.catalog.items.find((x) => x.id === id);
  return it && it.icon ? h("img", { class: "item-icon", src: asset(it.icon), alt: "" }) : h("span", { class: "item-icon empty" });
}

export function itemsPanel() {
  const d = gameFile().data;
  return h("div", {},
    h("h2", {}, "아이템, 조합, 힌트, 업적"),
    h("p", { class: "help" }, "아이템의 그림은 개발 쪽에서 넣고, 이름과 설명, 조사했을 때, 조합, 힌트는 여기서 정합니다."),
    section("아이템", "누르면 펼쳐집니다. 이름과 설명은 게임에서 아이템을 조사할 때 보입니다.", itemList()),
    section("조합", "인벤토리에서 아이템 하나를 고른 채 다른 아이템을 누르면 조합됩니다 (순서는 상관없음).", comboList(d)),
    section("수집품", "게임 곳곳에 숨긴 모을 거리. 할 일의 '수집품 찾기'로 찾게 하고, 수첩에서 몇 개 모았는지 보입니다. 세이브마다 따로입니다.", simpleList(d, "collectibles", [["title", "이름", "예: 깃털"], ["description", "설명", ""]], (n) => ({ id: newId(d.collectibles, "수집품"), title: "" }))),
    section("업적", "타이틀 화면의 '업적'에 보입니다. 조건을 정하면 맞는 순간 저절로 달성되고, 비우면 할 일의 '업적 달성하기'로 직접 달성시킵니다. 세이브와 상관없이 남고, 스팀판에서는 스팀 업적이 됩니다.", achievementList(d)),
    section("장 (챕터)", "장마다 첫 방을 정합니다. 그 방에 한 번 들어가면 타이틀 화면의 '장 고르기'에서 그 장부터 새로 시작할 수 있습니다 (장이 둘 이상 열렸을 때 보임).", simpleList(d, "chapters", [["title", "장 이름", "예: 1장 다락방"], ["room", "첫 방", "", "room"], ["description", "설명", ""]], () => ({ title: "", room: "" }))),
    section("힌트", "힌트 버튼을 누르면 위에서부터 보고 '보이는 조건'이 맞고 '끝나는 조건'은 아직 안 맞은 첫 번째 힌트를 보여 줍니다. 같은 힌트에서 또 누르면 다음 줄(더 자세한 힌트)을 보여 줍니다.", hintList(d)),
  );
}

// ------------------------------------------------------------------ 아이템

function itemList() {
  return h("div", { class: "item-list" }, S.catalog.items.map((it) => {
    const e = (gameFile().data.items || {})[it.id] || {};
    const body = h("div", { class: "item-body" });
    const det = h("details", { class: "item-card", ontoggle: () => { if (det.open && !body.childElementCount) fill(); } },
      h("summary", {}, icon(it.id), h("b", {}, names.item(it.id)), e.description ? h("span", { class: "muted" }, ": " + e.description) : null),
      body);
    const fill = () => {
      const entry = itemEntry(it.id);
      body.append(
        h("label", { class: "field" }, h("span", {}, "이름"), h("input", { value: entry.name || "", oninput: (ev) => { entry.name = ev.target.value; onCh(); } })),
        h("label", { class: "field" }, h("span", {}, "설명 (조사할 때 보임)"), h("textarea", { rows: 2, value: entry.description || "",
          oninput: (ev) => { entry.description = ev.target.value; if (!entry.description) delete entry.description; onCh(); } })),
        h("div", { class: "sub-head" }, "조사할 때 (인벤토리에서 두 번 누르거나 오른쪽 클릭)"),
        actLines(entry, "on_inspect", onCh),
        h("div", { class: "sub-head" }, "맞지 않는 곳에 썼을 때 (비우면 게임 공통 반응)"),
        actLines(entry, "on_wrong_use", onCh));
    };
    return det;
  }));
}

// ------------------------------------------------------------------ 조합

function comboList(d) {
  const box = h("div", { class: "combo-list" });
  const redraw = () => box.replaceWith(comboList(d));
  const list = d.combos || [];
  if (!list.length) box.append(h("p", { class: "empty" }, "(조합 없음)"));
  list.forEach((c, i) => {
    const set = (k, v) => { if (v === "" || v === false || v === undefined) delete c[k]; else c[k] = v; onCh(); redraw(); };
    box.append(h("div", { class: "combo" },
      h("div", { class: "combo-row" },
        icon(c.a), itemSelect(c.a, (v) => set("a", v), "(아이템)"),
        h("span", { class: "plus" }, "+"),
        icon(c.b), itemSelect(c.b, (v) => set("b", v), "(아이템)"),
        h("span", { class: "plus" }, "="),
        icon(c.result), itemSelect(c.result, (v) => set("result", v), "(아이템 안 생김)"),
        h("button", { class: "icon", title: "이 조합 지우기", onclick: () => { list.splice(i, 1); if (!list.length) delete d.combos; onCh(); redraw(); } }, "✕")),
      h("div", { class: "row" },
        h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!c.keep_a, onchange: (e) => set("keep_a", e.target.checked) }), " 앞의 것은 남김"),
        h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!c.keep_b, onchange: (e) => set("keep_b", e.target.checked) }), " 뒤의 것은 남김")),
      h("div", { class: "sub-head" }, "조합한 뒤 할 일"),
      actLines(c, "do", onCh)));
  });
  box.append(h("button", { class: "add", onclick: () => { d.combos = d.combos || []; d.combos.push({ a: "", b: "" }); onCh(); redraw(); } }, "＋ 조합 추가"));
  return box;
}

// ------------------------------------------------------------------ 수집품 / 장 / 업적

// 아이디: 사람이 볼 일은 없으므로 겹치지 않게만
function newId(list, base) {
  const ids = new Set((list || []).map((x) => x.id));
  let i = (list || []).length + 1;
  while (ids.has(base + i)) i++;
  return base + i;
}

// 칸 몇 개짜리 목록 (cols: [키, 이름, 예시, 종류])
function simpleList(d, key, cols, make) {
  const box = h("div", { class: "combo-list" });
  const redraw = () => box.replaceWith(simpleList(d, key, cols, make));
  const list = d[key] || [];
  if (!list.length) box.append(h("p", { class: "empty" }, "(없음)"));
  list.forEach((x, i) => box.append(h("div", { class: "combo" },
    h("div", { class: "combo-row" },
      ...cols.map(([k, label, ph, type]) => type === "room"
        ? h("select", { title: label, onchange: (e) => { x[k] = e.target.value; onCh(); } }, h("option", { value: "" }, "(" + label + ")"),
            S.catalog.rooms.map((r) => h("option", { value: r.id, selected: r.id === x[k] }, names.room(r.id))))
        : h("input", { value: x[k] || "", placeholder: label + (ph ? ": " + ph : ""), style: { flex: k === "description" ? 2 : 1 },
            oninput: (e) => { x[k] = e.target.value; if (!x[k] && k === "description") delete x[k]; onCh(); } })),
      h("button", { class: "icon", title: "지우기", onclick: () => { list.splice(i, 1); if (!list.length) delete d[key]; onCh(); redraw(); } }, "✕")))));
  box.append(h("button", { class: "add", onclick: () => { d[key] = d[key] || []; d[key].push(make()); onCh(); redraw(); } }, "＋ 추가"));
  return box;
}

function achievementList(d) {
  const box = h("div", { class: "hint-list" });
  const redraw = () => box.replaceWith(achievementList(d));
  const list = d.achievements || [];
  if (!list.length) box.append(h("p", { class: "empty" }, "(없음)"));
  list.forEach((a, i) => box.append(h("details", { class: "hint-card" },
    h("summary", {}, h("b", {}, a.title || "(이름 없는 업적)"), a.description ? h("span", { class: "muted" }, ": " + a.description) : null),
    h("div", { class: "row" },
      h("input", { value: a.title || "", placeholder: "업적 이름 (예: 첫 탈출)", style: { flex: 1 }, oninput: (e) => { a.title = e.target.value; onCh(); } }),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!a.hidden, onchange: (e) => { if (e.target.checked) a.hidden = true; else delete a.hidden; onCh(); } }), " 달성 전에는 숨김"),
      h("button", { class: "icon", title: "지우기", onclick: () => { list.splice(i, 1); if (!list.length) delete d.achievements; onCh(); redraw(); } }, "✕")),
    h("label", { class: "field" }, h("span", {}, "설명"), h("input", { value: a.description || "", oninput: (e) => { a.description = e.target.value; if (!a.description) delete a.description; onCh(); } })),
    h("div", { class: "sub-head" }, "이것이 모두 맞으면 저절로 달성 (비우면 할 일의 '업적 달성하기'로만)"),
    condLines(a, "if", onCh, "조건 없음"))));
  box.append(h("button", { class: "add", onclick: () => { d.achievements = d.achievements || []; d.achievements.push({ id: newId(d.achievements, "업적"), title: "" }); onCh(); redraw(); } }, "＋ 업적 추가"));
  return box;
}

// ------------------------------------------------------------------ 힌트

function hintList(d) {
  const box = h("div", { class: "hint-list" });
  const redraw = () => box.replaceWith(hintList(d));
  d.hints = d.hints || {};
  const H = d.hints;
  const list = H.list || [];
  box.append(h("label", { class: "field" }, h("span", {}, "떠오르는 힌트가 없을 때 하는 말"),
    h("input", { value: H.none || "", placeholder: "지금은 특별히 떠오르는 게 없다.", oninput: (e) => { H.none = e.target.value; if (!H.none) delete H.none; onCh(); } })));
  list.forEach((hint, i) => {
    const move = (to) => { list.splice(to, 0, list.splice(i, 1)[0]); onCh(); redraw(); };
    box.append(h("details", { class: "hint-card" },
      h("summary", {}, h("span", { class: "muted" }, `${i + 1}. `), h("b", {}, hint.note || "(이름 없는 힌트)"), h("span", { class: "muted" }, ": " + ((hint.lines || [])[0] || ""))),
      h("div", { class: "row" },
        h("input", { value: hint.note || "", placeholder: "힌트 이름 (예: 다락방: 왕관)", style: { flex: 1 }, oninput: (e) => { hint.note = e.target.value; onCh(); } }),
        i > 0 ? h("button", { class: "icon", title: "위로", onclick: () => move(i - 1) }, "↑") : null,
        i < list.length - 1 ? h("button", { class: "icon", title: "아래로", onclick: () => move(i + 1) }, "↓") : null,
        h("button", { class: "icon", title: "이 힌트 지우기", onclick: () => { list.splice(i, 1); onCh(); redraw(); } }, "✕")),
      h("div", { class: "sub-head" }, "보이는 조건 (모두 맞을 때)"),
      condLines(hint, "if", onCh, "항상"),
      h("div", { class: "sub-head" }, "끝나는 조건 (이것이 모두 맞으면 다음 힌트로)"),
      condLines(hint, "done", onCh, "끝나지 않음"),
      h("label", { class: "field" }, h("span", {}, "힌트 문장 (한 줄에 하나, 위가 먼저. 누를수록 다음 줄)"),
        h("textarea", { rows: 3, value: (hint.lines || []).join("\n"), oninput: (e) => { hint.lines = e.target.value.split("\n").filter((x) => x.trim()); onCh(); } }))));
  });
  box.append(h("button", { class: "add", onclick: () => { H.list = H.list || []; H.list.push({ note: "", lines: [] }); onCh(); redraw(); } }, "＋ 힌트 추가"));
  return box;
}
