// 자주 쓰는 패턴 마법사: 빈칸 몇 개를 채우면 이름/단계/경우들을 만들어 준다. 만든 뒤에는 자유롭게 고칠 수 있다.
import { h, modal, S, names, toast, uniqueStateKey } from "./core.js";

// 물건의 지금 이름 (이름이 없으면 자동 한글 이름)
const nameOf = (o, n, fallback) => o.name || (n && n.path && S.catalog ? names.object(n.path) : fallback);
import { input, renderPanel } from "./editor.js";
import { josa } from "./words.js";

const st = (name, v) => ({ state: name, is: v });

export const WIZARDS = [
  {
    id: "lock", title: "열쇠로 여는 것", desc: "문, 상자, 서랍. 열쇠를 들고 누르면 열리고, 그전에는 잠겨 있다고 말합니다.",
    needs: "rules",
    fields: (o, n) => [
      { key: "name", label: "이름", type: "text", def: nameOf(o, n, "문") },
      { key: "key", label: "여는 아이템", type: "item" },
      { key: "consume", label: "열면 아이템이 없어짐", type: "bool", def: true, keep: true },
      { key: "locked", label: "잠겨 있을 때 하는 말", type: "text", def: "잠겨 있다." },
      { key: "opened", label: "열 때 하는 말", type: "text", def: "철컥, 열렸다!" },
      { key: "sound", label: "열 때 소리 (없어도 됨)", type: "sound", optional: true },
      { key: "image", label: "열린 모습 그림 (없어도 됨)", type: "image", optional: true },
      { key: "after", label: "열린 뒤 누르면", type: "select", def: "say", keep: true,
        options: [["say", "말하기"], ["closeup", "크게 보기"], ["go", "다른 방으로 가기"]] },
      { key: "afterSay", label: "열린 뒤 하는 말", type: "text", def: "열려 있다.", show: (v) => v.after === "say" },
      { key: "afterCloseup", label: "크게 볼 화면", type: "closeup", show: (v) => v.after === "closeup" },
      { key: "afterRoom", label: "갈 방", type: "room", show: (v) => v.after === "go" },
    ],
    build: (o, v) => {
      o.name = v.name; o.states = ["잠김", "열림"];
      const open = [];
      if (v.consume) open.push({ take: v.key });
      open.push({ state: v.name, to: "열림" });
      if (v.sound) open.push({ sound: v.sound });
      if (v.opened) open.push({ say: v.opened });
      const after = v.after === "closeup" ? { closeup: v.afterCloseup || "" } : v.after === "go" ? { go: v.afterRoom || "" } : { say: v.afterSay || "열려 있다." };
      o.rules = [
        { note: "열쇠로 열기", item: v.key || "", if: [st(v.name, "잠김")], do: open },
        { note: "잠겨 있을 때", if: [st(v.name, "잠김")], do: [{ say: v.locked || "잠겨 있다." }] },
        { note: "열린 뒤", do: [after] },
      ];
      if (v.image) o.looks = [{ if: [st(v.name, "열림")], texture: v.image }];
    },
  },
  {
    id: "toggle", title: "누를 때마다 열고 닫기", desc: "창문, 커튼, 스위치처럼 누를 때마다 두 상태를 오가는 것.",
    needs: "rules",
    fields: (o, n) => [
      { key: "name", label: "이름", type: "text", def: nameOf(o, n, "창문") },
      { key: "a", label: "처음 상태", type: "text", def: "닫힘" },
      { key: "b", label: "바뀐 상태", type: "text", def: "열림" },
      { key: "image", label: "바뀐 상태의 그림 (없어도 됨)", type: "image", optional: true },
      { key: "sound", label: "소리 (없어도 됨)", type: "sound", optional: true },
    ],
    build: (o, v) => {
      o.name = v.name; o.states = [v.a, v.b];
      const snd = v.sound ? [{ sound: v.sound }] : [];
      o.rules = [{ note: `${v.a}, ${v.b} 번갈아`, do: [{ state: v.name, next: true }, ...snd] }];
      if (v.image) o.looks = [{ if: [st(v.name, v.b)], texture: v.image }];
    },
  },
  {
    id: "first", title: "처음엔 이렇게, 그다음엔 저렇게 말하기", desc: "처음 누를 때는 한마디, 그다음부터는 다른 말을 번갈아 합니다.",
    needs: "rules",
    fields: () => [
      { key: "first", label: "처음 누를 때", type: "text", def: "낡은 책장이다." },
      { key: "later", label: "그다음부터 (한 줄에 하나)", type: "lines", def: ["먼지가 수북하다.", "별다른 건 없어 보인다."] },
      { key: "mode", label: "그다음 말하는 방식", type: "select", def: "돌아가며", keep: true, options: [["차례대로", "차례대로 (마지막 줄 반복)"], ["돌아가며", "돌아가며"], ["무작위", "무작위"]] },
    ],
    build: (o, v) => {
      const later = (v.later || []).filter((s) => s.trim());
      o.rules = [
        { note: "처음", if: [{ clicks: 1 }], do: [{ say: v.first }] },
        { note: "그다음부터", do: [later.length > 1 ? { say: later, mode: v.mode } : { say: later[0] || v.first }] },
      ];
    },
  },
  {
    id: "give", title: "아이템을 한 번만 주는 것", desc: "누르면 아이템을 얻고, 그 뒤로는 비어 있다고 말합니다.",
    needs: "rules",
    fields: (o, n) => [
      { key: "name", label: "이름", type: "text", def: nameOf(o, n, "상자") },
      { key: "item", label: "주는 아이템", type: "item" },
      { key: "got", label: "얻을 때 하는 말", type: "text", def: "무언가 들어 있다!" },
      { key: "empty", label: "그 뒤로 하는 말", type: "text", def: "더는 아무것도 없다." },
    ],
    build: (o, v) => {
      o.name = v.name; o.states = ["있음", "비어 있음"];
      o.rules = [
        { note: "아이템 얻기", if: [st(v.name, "있음")], do: [{ give: v.item || "" }, { state: v.name, to: "비어 있음" }, { say: v.got }] },
        { note: "빈 뒤", do: [{ say: v.empty }] },
      ];
    },
  },
  {
    id: "closeup", title: "누르면 크게 보기", desc: "책상, 편지, 자물쇠처럼 눌러서 가까이 보는 것.",
    needs: "rules",
    fields: () => [{ key: "closeup", label: "크게 볼 화면", type: "closeup" }],
    build: (o, v) => { o.rules = [{ note: "크게 보기", do: [{ closeup: v.closeup || "" }] }]; },
  },
  {
    id: "npc", title: "인물에게 아이템 주기", desc: "인물이 원하는 것을 주면 반응하고, 보답을 줄 수도 있습니다.",
    needs: "rules",
    fields: (o, n) => [
      { key: "name", label: "인물 이름", type: "text", def: nameOf(o, n, "소녀") },
      { key: "want", label: "원하는 아이템", type: "item" },
      { key: "before", label: "주기 전 대화 (\"이름: 대사\" 한 줄에 하나)", type: "multiline", def: "소녀: 내 인형을 찾아 줄래?" },
      { key: "thanks", label: "줄 때 대화", type: "multiline", def: "소녀: 찾아 줬구나! 고마워." },
      { key: "reward", label: "보답으로 주는 아이템 (없어도 됨)", type: "item", optional: true },
      { key: "after", label: "그 뒤 대화", type: "multiline", def: "소녀: 정말 고마워." },
    ],
    build: (o, v) => {
      o.name = v.name; o.states = ["기다림", "받음"];
      const give = [{ take: v.want || "" }, { state: v.name, to: "받음" }, { talk: v.thanks }];
      if (v.reward) give.push({ give: v.reward });
      o.rules = [
        { note: "원하는 것 주기", item: v.want || "", if: [st(v.name, "기다림")], do: give },
        { note: "주기 전", if: [st(v.name, "기다림")], do: [{ talk: v.before }] },
        { note: "준 뒤", do: [{ talk: v.after }] },
      ];
    },
  },
  {
    id: "appear", title: "어떤 물건이 어떤 상태가 되면 나타나기", desc: "예: 상자가 열림 상태가 되면 안의 열쇠가 나타난다.",
    needs: "show_if",
    fields: () => [
      { key: "state", label: "어떤 물건이", type: "state" },
      { key: "value", label: "어떤 상태가 되면", type: "stateValue", stateKey: "state" },
      { key: "fade", label: "서서히 나타나는 시간 (초)", type: "float", def: 0.5, keep: true },
    ],
    build: (o, v) => {
      o.show_if = [st(v.state, v.value)];
      if (v.fade) o.fade_in = v.fade; else delete o.fade_in;
    },
  },
];

export function openWizard(n, obj, onCh, onlyId = null) {
  const keys = n.keys || [];
  const list = WIZARDS.filter((w) => keys.includes(w.needs) && (!onlyId || w.id === onlyId));
  const body = h("div", { class: "wizard-list" }, list.map((w) => h("button", { class: "wizard-card", onclick: () => { close(); openForm(w, n, obj, onCh); } },
    h("div", {}, h("b", {}, w.title), h("div", { class: "muted" }, w.desc)))));
  const close = modal("자주 쓰는 패턴으로 만들기", body, [{ label: "닫기", onclick: (c) => c() }]);
}

function openForm(w, n, obj, onCh) {
  const v = {};
  const fields = w.fields(obj, n);
  for (const f of fields) if (f.def !== undefined) v[f.key] = Array.isArray(f.def) ? [...f.def] : f.def;
  const form = h("div", { class: "wizard-form" });
  const draw = () => {
    form.replaceChildren(h("p", { class: "help" }, w.desc),
      ...fields.filter((f) => !f.show || f.show(v)).map((f) => h("label", { class: "field" + (f.type === "bool" ? " check" : "") },
        f.type === "bool" ? null : h("span", {}, f.label),
        input({ ...f, def: f.keep ? undefined : f.def, optional: f.optional }, v, () => { if (f.type === "select" || f.type === "state") draw(); }),
        f.type === "bool" ? h("span", {}, f.label) : null)));
  };
  // bool 기본값은 v 에 실제 값으로 둔다 (input 의 '기본값이면 지움' 동작 방지)
  draw();
  const already = (obj.rules && obj.rules.length) || (w.needs === "show_if" && obj.show_if && obj.show_if.length);
  modal(w.title, h("div", {}, form,
    already ? h("p", { class: "hint warn" }, "이미 정한 것이 있습니다. 만들면 새것으로 바뀝니다. 되돌리기로 되돌릴 수 있습니다.") : null), [
    { label: "취소", onclick: (c) => c() },
    { label: "만들기", kind: "primary", onclick: (c) => {
      if (v.name) v.name = uniqueStateKey(v.name, S.roomId, obj);
      w.build(obj, v);
      onCh();
      c();
      renderPanel();
      toast(`${obj.name || n.name}: '${w.title}' 패턴으로 만들었습니다. 아래에서 마음대로 고치면 됩니다.`, "good", 5000);
    } },
  ]);
}
