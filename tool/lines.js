// 대사 모아 보기: 모든 방의 자막, 대화, 수첩, 아이템 설명, 힌트, 장면 자막을 한 표로 보고 그 자리에서 고친다.
// 맞춤법 교정, 말투 통일, 번역 준비용.
import * as M from "./model.js";
import { josa } from "./words.js";
import { S, h, names, roomData, roomPath, gameFile, markDirty, GAME_FILE } from "./core.js";

// 글 하나: { room, where, kind, text, set(v), multi }
function collect() {
  const out = [];
  const acts = (list, room, where, path) => {
    for (const a of list || []) {
      const t = M.actionType(a);
      if (!t) continue;
      if (t.id === "say") out.push({ room, where, kind: "자막", text: a.say, set: (v) => (a.say = v), path });
      if (t.id === "sayLines") a.say.forEach((line, i) => out.push({ room, where, kind: `번갈아 말하기 ${i + 1}`, text: line, set: (v) => (a.say[i] = v), path }));
      if (t.id === "talk") {
        out.push({ room, where, kind: "대화", text: a.talk || "", set: (v) => (a.talk = v), multi: true, path });
        (a.choices || []).forEach((ch, i) => {
          out.push({ room, where, kind: `선택지 ${i + 1}`, text: ch.text || "", set: (v) => (ch.text = v), path });
          acts(ch.do, room, `${where}, 선택지 ${i + 1}`, path);
        });
      }
      if (t.id === "note") {
        out.push({ room, where, kind: "수첩 제목", text: a.note || "", set: (v) => (a.note = v), path });
        out.push({ room, where, kind: "수첩 내용", text: a.text || "", set: (v) => (a.text = v), multi: true, path });
      }
      if (t.id === "ending" && a.title) out.push({ room, where, kind: "엔딩 제목", text: a.title, set: (v) => (a.title = v), path });
    }
  };
  for (const r of S.catalog.rooms) {
    const d = roomData(r.id);
    const room = r.id;
    acts(d.on_first_enter, room, "처음 들어왔을 때", null);
    acts(d.on_enter, room, "들어올 때마다", null);
    for (const o of d.objects || []) {
      const nm = names.object(o.node, r.id);
      (o.rules || []).forEach((rule, i) => acts(rule.do, room, `${nm}, ${rule.item ? `${josa(names.item(rule.item), "을/를")} 들고` : `${i + 1}번째 경우`}`, o.node));
      for (const [k, label] of [["on_solved", "풀면"], ["on_wrong", "틀리면"], ["on_placed", "놓으면"]]) acts(o[k], room, `${nm}, ${label}`, o.node);
    }
  }
  const g = gameFile().data;
  acts(g.item_default, null, "맞지 않는 아이템을 썼을 때", null);
  for (const [id, e] of Object.entries(g.items || {})) {
    const nm = names.item(id);
    out.push({ room: null, where: `아이템 ${nm}`, kind: "아이템 이름", text: e.name || "", set: (v) => (e.name = v) });
    if (e.description !== undefined) out.push({ room: null, where: `아이템 ${nm}`, kind: "아이템 설명", text: e.description, set: (v) => (e.description = v), multi: true });
    acts(e.on_inspect, null, `아이템 ${nm}, 조사할 때`, null);
    acts(e.on_wrong_use, null, `아이템 ${nm}, 맞지 않는 곳에 썼을 때`, null);
  }
  (g.combos || []).forEach((c, i) => acts(c.do, null, `조합 ${i + 1} (${names.item(c.a)} + ${names.item(c.b)})`, null));
  const H = g.hints || {};
  if (H.none !== undefined) out.push({ room: null, where: "힌트", kind: "힌트 없을 때", text: H.none, set: (v) => (H.none = v) });
  (H.list || []).forEach((hint, i) => (hint.lines || []).forEach((line, j) => out.push({ room: null, where: `힌트 ${i + 1}${hint.note ? ", " + hint.note : ""}`, kind: `힌트 ${j + 1}단계`, text: line, set: (v) => (hint.lines[j] = v) })));
  for (const [id, sc] of Object.entries(g.scenes || {})) {
    (sc.shots || []).forEach((shot, i) => (shot.say || []).forEach((e, j) =>
      out.push({ room: null, where: `장면 ${sc.name || id}, ${i + 1}번 컷`, kind: `장면 자막 ${j + 1}`, text: e.text || "", set: (v) => (e.text = v) })));
  }
  return out;
}

export function linesPanel() {
  const all = collect();
  const search = h("input", { placeholder: "찾기 (예: 열쇠, 잠겨)", style: { flex: 1 } });
  const roomSel = h("select", {}, h("option", { value: "*" }, "전부"), S.catalog.rooms.map((r) => h("option", { value: r.id }, names.room(r.id))), h("option", { value: "-" }, "게임 공통 (아이템, 힌트, 장면)"));
  const table = h("div", { class: "lines-table" });
  const count = h("span", { class: "muted" });
  const draw = () => {
    const q = search.value.trim();
    const shown = all.filter((x) => (roomSel.value === "*" || (roomSel.value === "-" ? x.room === null : x.room === roomSel.value)) && (!q || x.text.includes(q) || x.where.includes(q)));
    count.textContent = `${shown.length}개`;
    table.replaceChildren(...shown.map((x) => {
      const input = h(x.multi || x.text.length > 60 ? "textarea" : "input", { value: x.text, rows: x.multi ? 3 : 2,
        oninput: (e) => { x.set(e.target.value); x.text = e.target.value; markDirty(x.room ? roomPath(x.room) : GAME_FILE); } });
      return h("div", { class: "line-row" },
        h("div", { class: "line-where" }, h("b", {}, x.room ? names.room(x.room) : "게임 공통"), ", ", x.where, h("span", { class: "muted" }, ": " + x.kind)),
        input);
    }));
  };
  search.addEventListener("input", draw);
  roomSel.addEventListener("change", draw);
  draw();
  const csv = () => {
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const rows = [["방", "어디", "종류", "문장"], ...all.map((x) => [x.room ? names.room(x.room) : "게임 공통", x.where, x.kind, x.text])];
    const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv" });
    const a = h("a", { href: URL.createObjectURL(blob), download: "대사_모음.csv" });
    document.body.append(a); a.click(); a.remove();
  };
  return h("div", {},
    h("h2", {}, "대사 모아 보기"),
    h("p", { class: "help" }, "게임에 나오는 모든 글을 한곳에서 보고 바로 고칩니다. 고친 것은 그 물건에 그대로 들어가고, '저장'하면 반영됩니다."),
    h("div", { class: "row" }, search, roomSel, count, h("button", { onclick: csv, title: "엑셀에서 열 수 있는 표로 내려받기 (교정, 번역용)" }, "표로 내려받기")),
    table);
}
