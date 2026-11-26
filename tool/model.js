// ProjectCR 방 데이터 웹 툴 — 데이터 정의
// 조건/할 일 종류마다: 한글 이름, 칸(입력 폼), 한 줄 요약.
// 게임 쪽 정의는 Scripts/core/data_logic.gd (Parser) 와 docs/데이터형식.md. 둘이 맞아야 한다.
// 새 종류를 추가하려면 여기 CONDITIONS / ACTIONS 에 한 항목을 더하면 폼이 저절로 생긴다.

export const NUMBER_OPS = ["=", "!=", ">=", "<=", ">", "<"];
export const NUMBER_OP_LABEL = { "=": "같음", "!=": "다름", ">=": "이상", "<=": "이하", ">": "초과", "<": "미만" };
export const SAY_MODES = ["차례대로", "돌아가며", "무작위"];
export const ANIMATE_KINDS = ["흔들기", "통통 튀기", "깜빡이기", "이동하기", "애니메이션 재생"];

// 칸 종류: text, multiline, int, float, bool, flag, item, state, stateValue, number(이름), room, closeup,
//         node, sound, music, image, video, anim, scene, color, lines, conditions, actions, choices, vec2, select
// show(d) 가 있으면 그 칸은 조건부로 보인다.

export const CONDITIONS = [
  {
    id: "state", key: "state", label: "물건이 어떤 상태일 때",
    make: () => ({ state: "", is: "" }),
    fields: [
      { key: "state", label: "물건", type: "state" },
      { key: "__cmp", label: "비교", type: "select", options: [["is", "이 상태일 때"], ["is_not", "이 상태가 아닐 때"]],
        get: (d) => ("is_not" in d ? "is_not" : "is"),
        set: (d, v) => { const val = d.is ?? d.is_not ?? ""; delete d.is; delete d.is_not; d[v] = val; } },
      { key: "__value", label: "상태", type: "stateValue", stateKey: "state",
        get: (d) => d.is ?? d.is_not ?? "",
        set: (d, v) => { if ("is_not" in d) d.is_not = v; else d.is = v; } },
    ],
  },
  {
    id: "flag", key: "flag", label: "기록이 있을 때",
    make: () => ({ flag: "" }),
    fields: [
      { key: "flag", label: "기록 이름", type: "flag" },
      { key: "on", label: "기록이 있을 때 (체크를 끄면 없을 때)", type: "bool", def: true },
    ],
  },
  {
    id: "has", key: "has", label: "아이템을 가지고 있을 때",
    make: () => ({ has: "" }),
    fields: [
      { key: "has", label: "아이템", type: "item" },
      { key: "on", label: "가지고 있을 때 (체크를 끄면 없을 때)", type: "bool", def: true },
      { key: "ever", label: "지금은 없어도 한 번이라도 얻었으면", type: "bool", def: false },
    ],
  },
  {
    id: "number", key: "number", label: "숫자가 얼마일 때",
    make: () => ({ number: "", ">=": 1 }),
    fields: [
      { key: "number", label: "숫자 이름", type: "number" },
      { key: "__op", label: "비교", type: "select", options: NUMBER_OPS.map((o) => [o, NUMBER_OP_LABEL[o]]),
        get: (d) => NUMBER_OPS.find((o) => o in d) || ">=",
        set: (d, v) => { const old = NUMBER_OPS.find((o) => o in d); const val = old ? d[old] : 0; NUMBER_OPS.forEach((o) => delete d[o]); d[v] = val; } },
      { key: "__val", label: "값", type: "int",
        get: (d) => { const o = NUMBER_OPS.find((x) => x in d); return o ? d[o] : 0; },
        set: (d, v) => { const o = NUMBER_OPS.find((x) => x in d) || ">="; d[o] = v; } },
    ],
  },
  {
    id: "clicks", key: "clicks", label: "몇 번째로 누를 때",
    make: () => ({ clicks: 1 }),
    fields: [
      { key: "clicks", label: "몇 번째 (처음은 1)", type: "int", min: 1 },
      { key: "or_more", label: "그 번째부터 계속", type: "bool", def: false },
      { key: "of", label: "다른 물건의 횟수 (비우면 지금 누른 물건)", type: "node", optional: true },
    ],
  },
  {
    id: "room", key: "room", label: "지금 이 방에 있을 때",
    make: () => ({ room: "" }),
    fields: [{ key: "room", label: "방", type: "room" }],
  },
  {
    id: "note", key: "note", label: "수첩에 적혀 있을 때",
    make: () => ({ note: "" }),
    fields: [
      { key: "note", label: "단서 제목", type: "noteTitle" },
      { key: "on", label: "적혀 있을 때 (체크를 끄면 없을 때)", type: "bool", def: true },
    ],
  },
  {
    id: "timer", key: "timer", label: "타이머가 돌고 있을 때",
    make: () => ({ timer: "" }),
    fields: [
      { key: "timer", label: "타이머 이름", type: "timerName" },
      { key: "on", label: "돌고 있을 때 (체크를 끄면 멈춰 있을 때)", type: "bool", def: true },
    ],
  },
  {
    id: "collected", key: "collected", label: "수집품을 찾았을 때",
    make: () => ({ collected: "" }),
    fields: [
      { key: "collected", label: "수집품", type: "collectible" },
      { key: "on", label: "찾았을 때 (체크를 끄면 아직 못 찾았을 때)", type: "bool", def: true },
    ],
  },
  {
    id: "collectedCount", key: "collected_count", label: "수집품을 몇 개 이상 모았을 때",
    make: () => ({ collected_count: 1 }),
    fields: [{ key: "collected_count", label: "몇 개 이상", type: "int", min: 1 }],
  },
  {
    id: "achieved", key: "achieved", label: "업적을 달성했을 때",
    make: () => ({ achieved: "" }),
    fields: [
      { key: "achieved", label: "업적", type: "achievement" },
      { key: "on", label: "달성했을 때 (체크를 끄면 아직일 때)", type: "bool", def: true },
    ],
  },
  {
    id: "any", key: "any", label: "여럿 가운데 하나라도 맞을 때",
    make: () => ({ any: [] }),
    fields: [{ key: "any", label: "이 중 하나라도", type: "conditions" }],
  },
  {
    id: "all", key: "all", label: "여럿이 모두 맞을 때",
    make: () => ({ all: [] }),
    fields: [{ key: "all", label: "이것들이 모두", type: "conditions" }],
  },
  {
    id: "not", key: "not", label: "여럿이 맞지 않을 때",
    make: () => ({ not: [] }),
    fields: [{ key: "not", label: "이것들이 모두 맞지 않으면", type: "conditions" }],
  },
];

export const ACTIONS = [
  { id: "timeline", group: "흐름", label: "타임라인 (시간 맞춰, 동시에)", match: (d) => Array.isArray(d.timeline), make: () => ({ timeline: [] }), fields: [] },
  {
    id: "say", group: "말하기", label: "자막 보여주기", match: (d) => "say" in d && !Array.isArray(d.say),
    make: () => ({ say: "" }),
    fields: [
      { key: "say", label: "자막 (| 표시로 나누면 여러 줄로 나옴)", type: "multiline" },
      { key: "until_done", label: "자막이 끝날 때까지 다음 할 일을 기다림", type: "bool", def: false },
    ],
  },
  {
    id: "sayLines", group: "말하기", label: "번갈아 말하기", match: (d) => Array.isArray(d.say),
    make: () => ({ say: [""], mode: "차례대로" }),
    fields: [
      { key: "say", label: "대사 목록 (누를 때마다 다음 줄)", type: "lines" },
      { key: "mode", label: "방식", type: "select", options: SAY_MODES.map((m) => [m, m]), def: "차례대로" },
    ],
  },
  { id: "set", label: "기록 남기기", group: "바꾸기", match: (d) => "set" in d && !("number" in d), make: () => ({ set: "" }),
    fields: [{ key: "set", label: "기록 이름 (예: 이불 걷음)", type: "flag", write: true }] },
  { id: "unset", label: "기록 지우기", group: "바꾸기", match: (d) => "unset" in d, make: () => ({ unset: "" }),
    fields: [{ key: "unset", label: "기록 이름", type: "flag", write: true }] },
  { id: "toggle", label: "기록을 남기거나 지우기 (번갈아)", group: "바꾸기", match: (d) => "toggle" in d, make: () => ({ toggle: "" }),
    fields: [{ key: "toggle", label: "기록 이름", type: "flag", write: true }] },
  {
    id: "stateNext", group: "바꾸기", label: "물건을 다음 상태로", match: (d) => "state" in d && d.next === true, make: () => ({ state: "", next: true }),
    fields: [{ key: "state", label: "물건", type: "state" }],
  },
  {
    id: "state", group: "바꾸기", label: "물건 상태 바꾸기", match: (d) => "state" in d, make: () => ({ state: "", to: "" }),
    fields: [
      { key: "state", label: "상태", type: "state" },
      { key: "to", label: "바꿀 상태", type: "stateValue", stateKey: "state" },
    ],
  },
  {
    id: "numberAdd", group: "바꾸기", label: "숫자 더하기", match: (d) => "number" in d && !("set" in d), make: () => ({ number: "", add: 1 }),
    fields: [
      { key: "number", label: "숫자 이름", type: "number" },
      { key: "add", label: "더할 값 (빼려면 음수)", type: "int", def: 1 },
    ],
  },
  {
    id: "numberSet", group: "바꾸기", label: "숫자 정하기", match: (d) => "number" in d && "set" in d, make: () => ({ number: "", set: 0 }),
    fields: [
      { key: "number", label: "숫자 이름", type: "number" },
      { key: "set", label: "값", type: "int" },
    ],
  },
  { id: "give", group: "아이템", label: "아이템 주기", match: (d) => "give" in d, make: () => ({ give: "" }),
    fields: [{ key: "give", label: "아이템", type: "item" }] },
  { id: "take", group: "아이템", label: "아이템 빼앗기", match: (d) => "take" in d, make: () => ({ take: "" }),
    fields: [{ key: "take", label: "아이템", type: "item" }] },
  {
    id: "talk", group: "말하기", label: "대화하기", match: (d) => "talk" in d, make: () => ({ talk: "" }),
    fields: [
      { key: "talk", label: "대사 (한 줄에 \"이름: 대사\", 이름 없으면 설명 글)", type: "multiline", rows: 5 },
      { key: "choices", label: "선택지 (마지막 줄 뒤)", type: "choices", optional: true },
    ],
  },
  {
    id: "note", group: "말하기", label: "수첩에 적기", match: (d) => "note" in d, make: () => ({ note: "", text: "" }),
    fields: [
      { key: "note", label: "제목 (같은 제목이면 내용을 바꿈)", type: "text" },
      { key: "text", label: "내용", type: "multiline" },
      { key: "image", label: "그림 (없어도 됨)", type: "image", optional: true },
    ],
  },
  { id: "closeup", group: "화면", label: "크게 보기", match: (d) => "closeup" in d, make: () => ({ closeup: "" }),
    fields: [{ key: "closeup", label: "크게 볼 화면", type: "closeup" }] },
  { id: "closeCloseup", group: "화면", label: "크게 보기 닫기", match: (d) => "close_closeup" in d, make: () => ({ close_closeup: true }),
    fields: [] },
  { id: "go", group: "화면", label: "다른 방으로 가기", match: (d) => "go" in d, make: () => ({ go: "" }),
    fields: [{ key: "go", label: "방", type: "room" }] },
  {
    id: "sound", group: "소리와 영상", label: "효과음 내기", match: (d) => "sound" in d, make: () => ({ sound: "" }),
    fields: [
      { key: "sound", label: "효과음", type: "sound" },
      { key: "volume", label: "소리 크기 (보통은 1)", type: "float", def: 1, optional: true },
    ],
  },
  {
    id: "music", group: "소리와 영상", label: "배경음악 바꾸기", match: (d) => "music" in d, make: () => ({ music: "", fade: 1 }),
    fields: [
      { key: "music", label: "배경음악 (비우면 멈춤)", type: "sound", optional: true },
      { key: "fade", label: "바뀌는 시간 (초)", type: "float", def: 1 },
    ],
  },
  { id: "wait", group: "흐름", label: "잠깐 기다리기", match: (d) => "wait" in d, make: () => ({ wait: 1 }),
    fields: [{ key: "wait", label: "초", type: "float" }] },
  {
    id: "shake", group: "연출", label: "흔들기 (화면이나 물건)", match: (d) => "shake" in d, make: () => ({ shake: "", strength: 18, time: 0.4 }),
    fields: [
      { key: "shake", label: "흔들 물건 (비우면 화면 전체)", type: "node", optional: true, byName: true },
      { key: "strength", label: "세기 (픽셀)", type: "float", def: 18 },
      { key: "time", label: "시간 (초)", type: "float", def: 0.4 },
    ],
  },
  {
    id: "flash", group: "연출", label: "화면 번쩍", match: (d) => "flash" in d, make: () => ({ flash: "#ffffffe6", time: 0.5 }),
    fields: [
      { key: "flash", label: "색", type: "color" },
      { key: "time", label: "사라지는 시간 (초)", type: "float", def: 0.5 },
    ],
  },
  {
    id: "animate", group: "연출", label: "물건 움직이기", match: (d) => "animate" in d, make: () => ({ animate: "", kind: "흔들기", time: 0.5 }),
    fields: [
      { key: "animate", label: "물건", type: "node", byName: true },
      { key: "kind", label: "움직임", type: "select", options: ANIMATE_KINDS.filter((k) => k !== "애니메이션 재생").map((k) => [k, k]), def: "흔들기" },
      { key: "time", label: "시간 (초)", type: "float", def: 0.5 },
      { key: "move", label: "옮길 거리 (가로, 세로, 픽셀)", type: "vec2", optional: true, show: (d) => d.kind === "이동하기" },
      { key: "animation", label: "애니메이션 이름", type: "text", optional: true, show: (d) => d.kind === "애니메이션 재생" },
      { key: "until_done", label: "끝날 때까지 기다림", type: "bool", def: true },
    ],
  },
  {
    id: "play", group: "연출", label: "애니메이션 틀기", match: (d) => "play" in d, make: () => ({ play: "", on: "" }),
    fields: [
      { key: "play", label: "애니메이션", type: "anim" },
      { key: "on", label: "틀 물건 (그 물건의 그림이 잠깐 애니메이션으로 바뀝니다)", type: "node", byName: true },
      { key: "until_done", label: "다 틀 때까지 다음 할 일을 기다림", type: "bool", def: true },
      { key: "keep_last", label: "마지막 컷에서 멈춤 (다음에 모습이 바뀔 때까지)", type: "bool", def: false },
    ],
  },
  { id: "scene", group: "연출", label: "장면 틀기", match: (d) => "scene" in d, make: () => ({ scene: "" }),
    fields: [{ key: "scene", label: "장면 (그림 몇 장과 움직임으로 만든 짧은 연출. 끝날 때까지 기다립니다)", type: "scene" }] },
  { id: "cutscene", group: "소리와 영상", label: "동영상 틀기", match: (d) => "cutscene" in d, make: () => ({ cutscene: "" }),
    fields: [{ key: "cutscene", label: "동영상", type: "video" }] },
  { id: "timer", group: "흐름", label: "타이머 걸기", match: (d) => "timer" in d, make: () => ({ timer: "", seconds: 10, do: [] }),
    fields: [
      { key: "timer", label: "타이머 이름 (예: 촛불)", type: "text" },
      { key: "seconds", label: "몇 초 뒤", type: "float", def: 10 },
      { key: "do", label: "시간이 다 되면", type: "actions" },
    ] },
  { id: "stopTimer", group: "흐름", label: "타이머 멈추기", match: (d) => "stop_timer" in d, make: () => ({ stop_timer: "" }),
    fields: [{ key: "stop_timer", label: "타이머 이름", type: "timerName" }] },
  { id: "collect", group: "아이템", label: "수집품 찾기", match: (d) => "collect" in d, make: () => ({ collect: "" }),
    fields: [{ key: "collect", label: "수집품", type: "collectible" }] },
  { id: "checkpoint", group: "흐름", label: "체크포인트 (저장)", match: (d) => "checkpoint" in d, make: () => ({ checkpoint: true }),
    fields: [] },
  { id: "achieve", group: "흐름", label: "업적 달성하기", match: (d) => "achieve" in d, make: () => ({ achieve: "" }),
    fields: [{ key: "achieve", label: "업적", type: "achievement" }] },
  {
    id: "ending", group: "흐름", label: "엔딩 보기", match: (d) => "ending" in d, make: () => ({ ending: "", title: "", text: "" }),
    fields: [
      { key: "ending", label: "엔딩 이름 (예: 탈출)", type: "text" },
      { key: "title", label: "제목", type: "text" },
      { key: "text", label: "글", type: "multiline" },
      { key: "image", label: "배경 그림", type: "image", optional: true },
      { key: "credits", label: "크레딧 보이기", type: "bool", def: true },
    ],
  },
];

// 물건 칸 (노드 종류에 따라 일부만 보인다 — 카탈로그의 keys)
export const ACTION_GROUPS = ["말하기", "바꾸기", "아이템", "화면", "연출", "소리와 영상", "흐름"];

export const OBJECT_FIELDS = [
  { key: "rules", label: "누르면", help: "위에서부터 보고 조건이 맞는 첫 번째 경우 하나만 실행합니다. 특별한 경우는 위에, 평소 반응은 맨 아래에 둡니다." },
  { key: "show_if", label: "보이는 조건", help: "이 조건이 모두 맞을 때만 보입니다. 비우면 항상 보입니다." },
  { key: "looks", label: "모습 바꾸기", help: "위에서부터 보고 맞는 첫 번째 모습을 씁니다. 맞는 게 없으면 원래 모습." },
  { key: "pickup", label: "줍는 아이템" },
  { key: "on_solved", label: "풀면 할 일" },
  { key: "on_wrong", label: "틀리면 할 일" },
  { key: "on_placed", label: "아이템을 놓으면 할 일" },
  { key: "when", label: "조건 감시: 이것이 모두 맞는 순간 풀면 할 일을 실행" },
];

export const KIND_LABEL = {
  hotspot: "누르는 물건", pickup: "줍는 물건", drawer: "서랍", socket: "아이템 놓는 자리", puzzle: "퍼즐",
  whenall: "조건 감시", button: "그림 버튼", image: "그림", label: "글자", group: "묶음",
};

export function conditionType(d) {
  return CONDITIONS.find((t) => t.key in d) || null;
}

export function actionType(d) {
  return ACTIONS.find((t) => t.match(d)) || null;
}

export function short(s, n = 22) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export function fileName(p) {
  return String(p || "?").split("/").pop();
}

// 게임 쪽 DataWriter.pretty 와 같은 모양 (짧은 것은 한 줄, 긴 것은 2칸 들여쓰기)
export function pretty(v, depth = 0) {
  const one = JSON.stringify(v);
  if (one.length <= 90 || v === null || typeof v !== "object") return one;
  const pad = "  ".repeat(depth + 1);
  const end = "  ".repeat(depth);
  if (Array.isArray(v)) return "[\n" + v.map((x) => pad + pretty(x, depth + 1)).join(",\n") + "\n" + end + "]";
  return "{\n" + Object.keys(v).map((k) => pad + JSON.stringify(k) + ": " + pretty(v[k], depth + 1)).join(",\n") + "\n" + end + "}";
}

// 저장 전 정리: 빈 목록/빈 칸을 지운다 (파일을 깔끔하게)
export function cleanObject(obj) {
  if (Array.isArray(obj.auto)) {
    for (const a of obj.auto) { for (const k of ["if", "do"]) if (Array.isArray(a[k]) && !a[k].length) delete a[k]; if (!a.from) delete a.from; }
  }
  if (obj.on_state && typeof obj.on_state === "object") {
    for (const k of Object.keys(obj.on_state)) if (!Array.isArray(obj.on_state[k]) || !obj.on_state[k].length) delete obj.on_state[k];
    if (!Object.keys(obj.on_state).length) delete obj.on_state;
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (Array.isArray(v) && v.length === 0) delete obj[k];
    else if (v === "" && k !== "node" && k !== "shake" && k !== "music") delete obj[k];
  }
  return obj;
}
