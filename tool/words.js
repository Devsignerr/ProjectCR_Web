// 조건/할 일을 자연스러운 한국어 문장으로.
// 이름(물건, 아이템, 클로즈업)은 names 가 한글 이름으로 바꿔 준다.

import { NUMBER_OPS, conditionType, actionType } from "./model.js";

// 받침 있는지 (한글이 아니면 숫자/영어 대충 판단)
// 끝의 따옴표는 빼고, 끝에 붙은 괄호 덧말은 앞말을 기준으로 본다: "열쇠 (다락방)" 는 "열쇠"
function lastWord(word) {
  let s = String(word || "").trim().replace(/['"”’」』]+$/, "");   // 글쓰기 규칙 예외
  const m = s.match(/^(.*\S)\s*\([^()]*\)$/);
  if (m) s = m[1];
  return s.replace(/[)\]]+$/, "");
}
function hasBatchim(word) {
  const s = lastWord(word);
  if (!s) return false;
  const ch = s[s.length - 1];
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(ch)) return "013678".includes(ch);
  return /[lmnr]$/i.test(s);
}
// 받침이 ㄹ 인지 (숫자 1, 7, 8 도 ㄹ 로 끝남: 일, 칠, 팔)
function hasRieul(word) {
  const s = lastWord(word);
  const ch = s[s.length - 1] || "";
  if ("178".includes(ch) && /[0-9]/.test(ch)) return true;
  const code = ch.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8;
}

// 조사: 이/가, 을/를, 은/는, 과/와, 으로/로, 이면/면
export function josa(word, pair) {
  const b = hasBatchim(word);
  switch (pair) {
    case "이/가": return word + (b ? "이" : "가");
    case "을/를": return word + (b ? "을" : "를");
    case "은/는": return word + (b ? "은" : "는");
    case "과/와": return word + (b ? "과" : "와");
    case "으로/로": return word + (b && !hasRieul(word) ? "으로" : "로");
    case "이면/면": return word + (b ? "이면" : "면");
    case "이고/고": return word + (b ? "이고" : "고");
    case "이라는/라는": return word + (b ? "이라는" : "라는");
    case "이에요/예요": return word + (b ? "이에요" : "예요");
  }
  return word;
}

// 이름은 그대로 쓴다 (낫표 없이). 아직 고르지 않았으면 (빈칸).
const q = (s) => (s === undefined || s === null || s === "" ? "(빈칸)" : String(s));
// 사람이 적은 글(기록 이름, 수첩 제목, 타이머 이름)은 작은따옴표로 구분
const qq = (s) => (s ? `'${s}'` : "(빈칸)");   // 글쓰기 규칙 예외
// 이름 바꾸개가 없으면(시험 등) 그대로
const nm = (names, kind, v) => (names && names[kind] ? names[kind](v) : v);
const OP_WORD = { "=": "이면", "!=": "이 아니면", ">=": " 이상이면", "<=": " 이하이면", ">": "보다 크면", "<": "보다 작으면" };

// names: { item(id), object(path or stateName), closeup(name), node(name/path), room(id) }
export function condSentence(c, names) {
  const t = conditionType(c);
  if (!t) return "알 수 없는 조건";
  switch (t.id) {
    case "flag": {
      const th = names && names.thingFlag && names.thingFlag(c.flag);
      if (th) return `${josa(q(th.name), "이/가")} ${q(th.values[c.on === false ? 0 : 1])} 상태이면`;
      return c.on === false ? `${qq(nm(names, "flag", c.flag))} 기록이 아직 없으면` : `${qq(nm(names, "flag", c.flag))} 기록이 있으면`;
    }
    case "has": {
      const it = q(names.item(c.has));
      if (c.on === false) return `${josa(it, "을/를")} 가지고 있지 않으면`;
      return c.ever ? `${josa(it, "을/를")} 한 번이라도 얻었으면` : `${josa(it, "을/를")} 가지고 있으면`;
    }
    case "state": {
      const v = c.is ?? c.is_not;
      return "is_not" in c ? `${josa(q(c.state), "이/가")} ${q(v)} 상태가 아니면` : `${josa(q(c.state), "이/가")} ${q(v)} 상태이면`;
    }
    case "number": {
      const o = NUMBER_OPS.find((x) => x in c) || ">=";
      return `${josa(q(c.number), "이/가")} ${c[o]}${OP_WORD[o]}`;
    }
    case "clicks": {
      const who = c.of ? `${josa(q(names.node(c.of)), "을/를")} ` : "";
      if (c.clicks === 1 && !c.or_more) return `${who}처음 누를 때`;
      return `${who}${c.clicks}번째${c.or_more ? "부터" : ""} 누를 때`;
    }
    case "room": return `${q(nm(names, "room", c.room))}에 있으면`;
    case "note": return c.on === false ? `수첩에 ${josa(qq(c.note), "이/가")} 없으면` : `수첩에 ${josa(qq(c.note), "이/가")} 있으면`;
    case "timer": return c.on === false ? `${qq(c.timer)} 타이머가 멈춰 있으면` : `${qq(c.timer)} 타이머가 돌고 있으면`;
    case "collected": return `수집품 ${josa(q(nm(names, "collectible", c.collected)), "을/를")} ${c.on === false ? "아직 못 찾았으면" : "찾았으면"}`;
    case "collectedCount": return `수집품을 ${c.collected_count}개 이상 모았으면`;
    case "achieved": return `업적 ${josa(q(nm(names, "achievement", c.achieved)), "을/를")} ${c.on === false ? "아직 달성하지 않았으면" : "달성했으면"}`;
    case "any": return `다음 가운데 하나라도 맞으면: ${(c.any || []).map((x) => condSentence(x, names)).join(", 또는 ") || "(비어 있음)"}`;
    case "all": return `다음이 모두 맞으면: ${(c.all || []).map((x) => condSentence(x, names)).join(", 그리고 ") || "(비어 있음)"}`;
    case "not": return `다음이 맞지 않으면: ${(c.not || []).map((x) => condSentence(x, names)).join(", 그리고 ") || "(비어 있음)"}`;
  }
  return t.label;
}

export function condsSentence(list, names) {
  if (!list || !list.length) return "";
  return list.map((c) => condSentence(c, names)).join(", 그리고 ");
}

const KIND_VERB = { "흔들기": "흔들린다", "통통 튀기": "통통 튄다", "깜빡이기": "깜빡인다", "이동하기": "움직인다", "애니메이션 재생": "애니메이션을 한다" };
const short = (s, n = 30) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n) + "…" : s; };
const num = (n, pair) => josa(String(n), pair);

export function actSentence(a, names) {
  const t = actionType(a);
  if (!t) return "알 수 없는 할 일";
  switch (t.id) {
    case "timeline": {
      const list = a.timeline || [];
      const end = Math.max(0, ...list.map((x) => +x.at || 0));
      const when = end > 0 ? `${Math.round(end * 10) / 10}초 동안` : "한꺼번에";
      return list.length ? `${list.length}가지를 ${when} 한다 (${list.slice(0, 2).map((x) => actSentence(x, names)).join(", ")}${list.length > 2 ? " …" : ""})` : "타임라인 (비어 있음)";
    }
    case "say": return `"${short(a.say)}"라고 말한다${a.until_done ? " (다 읽을 때까지 기다림)" : ""}`;
    case "sayLines": return `누를 때마다 다른 말을 한다. ${a.say.length}줄을 ${a.mode || "차례대로"}: "${short(a.say[0], 18)}"…`;
    case "set": if (names && names.thingFlag && names.thingFlag(a.set)) { const th = names.thingFlag(a.set); return `${josa(q(th.name), "을/를")} ${q(th.values[1])} 상태로 바꾼다`; }
      return `${qq(nm(names, "flag", a.set))} 기록을 남긴다`;
    case "unset": if (names && names.thingFlag && names.thingFlag(a.unset)) { const th = names.thingFlag(a.unset); return `${josa(q(th.name), "을/를")} ${q(th.values[0])} 상태로 바꾼다`; }
      return `${qq(nm(names, "flag", a.unset))} 기록을 지운다`;
    case "toggle": if (names && names.thingFlag && names.thingFlag(a.toggle)) return `${josa(q(names.thingFlag(a.toggle).name), "을/를")} 다음 상태로 바꾼다`;
      return `${qq(nm(names, "flag", a.toggle))} 기록을 남기거나 지운다 (번갈아)`;
    case "state": return `${josa(q(a.state), "을/를")} ${q(a.to)} 상태로 바꾼다`;
    case "stateNext": return `${josa(q(a.state), "을/를")} 다음 상태로 바꾼다`;
    case "numberAdd": return (a.add ?? 1) >= 0 ? `${q(a.number)}에 ${num(a.add ?? 1, "을/를")} 더한다` : `${q(a.number)}에서 ${num(-(a.add), "을/를")} 뺀다`;
    case "numberSet": return `${josa(q(a.number), "을/를")} ${num(a.set, "으로/로")} 정한다`;
    case "give": return `${josa(q(names.item(a.give)), "을/를")} 얻는다`;
    case "take": return `${josa(q(names.item(a.take)), "이/가")} 없어진다`;
    case "talk": return `대화한다: "${short((a.talk || "").split("\n")[0], 26)}"${a.choices && a.choices.length ? `, 선택지 ${a.choices.length}개` : ""}`;
    case "note": return `수첩에 ${josa(qq(a.note), "을/를")} 적는다`;
    case "closeup": return `${q(names.closeup(a.closeup))} 화면을 연다`;
    case "closeCloseup": return "크게 보기를 닫는다";
    case "go": return `${josa(q(nm(names, "room", a.go)), "으로/로")} 간다`;
    case "sound": return a.sound ? `${q(nm(names, "file", a.sound))} 소리를 낸다` : "소리를 낸다 (소리를 고르지 않음)";
    case "music": return a.music ? `배경음악을 ${josa(q(nm(names, "file", a.music)), "으로/로")} 바꾼다` : "배경음악을 멈춘다";
    case "wait": return `${a.wait}초 기다린다`;
    case "shake": return a.shake ? `${josa(q(names.node(a.shake)), "을/를")} 흔든다` : "화면을 흔든다";
    case "flash": return "화면이 번쩍인다";
    case "play": return a.play ? `${a.on ? q(names.node(a.on)) + "에서 " : ""}${q(names.anim ? names.anim(a.play) : a.play)} 애니메이션을 튼다${a.keep_last ? " (마지막 컷에서 멈춤)" : ""}` : "애니메이션을 튼다 (애니메이션을 고르세요)";
    case "animate": return `${josa(q(names.node(a.animate)), "이/가")} ${KIND_VERB[a.kind] || "움직인다"}`;
    case "scene": return a.scene ? `장면 ${josa(qq(nm(names, "scene", a.scene)), "을/를")} 튼다` : "장면을 튼다 (장면을 고르세요)";
    case "cutscene": return `동영상${josa(q(nm(names, "file", a.cutscene)), "을/를")} 튼다`;
    case "timer": return `${qq(a.timer)} 타이머를 건다. ${a.seconds}초 뒤에 ${(a.do || []).map((x) => actSentence(x, names)).join(", ") || "아무것도 하지 않는다"}`;
    case "stopTimer": return `${qq(a.stop_timer)} 타이머를 멈춘다`;
    case "collect": return `수집품 ${josa(q(nm(names, "collectible", a.collect)), "을/를")} 찾는다`;
    case "checkpoint": return "여기까지 저장한다 (체크포인트)";
    case "achieve": return `업적 ${josa(q(nm(names, "achievement", a.achieve)), "을/를")} 달성한다`;
    case "ending": return `엔딩 ${josa(q(a.title || a.ending), "을/를")} 본다`;
  }
  return t.label;
}
