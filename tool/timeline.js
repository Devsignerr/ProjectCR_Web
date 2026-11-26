// 타임라인: 할 일을 시간(초)에 맞춰 놓는다. 같은 시각이면 동시에 일어난다.
//   데이터: {"timeline": [{"at": 0, "sound": "..."}, {"at": 0.5, "shake": "", "time": 0.4}, ...]}
//   줄(트랙)은 소리, 말, 움직임, 화면, 그 밖 다섯 가지. 막대를 끌면 시작 시각, 오른쪽 끝을 끌면 길이가 바뀐다.
//   ▶ 를 누르면 가운데 화면에서 소리, 자막, 흔들기, 번쩍, 움직이기를 미리 본다.
import * as M from "./model.js";
import { S, h, asset, toast, modal, names } from "./core.js";
import { actSentence } from "./words.js";
import { actionEditor } from "./editor.js";
import { animOf, cycleTime, pickAnim } from "./anims.js";
import { sceneOf, sceneDuration, pickScene } from "./scenes.js";
import { pickAction } from "./things.js";

const TRACKS = [
  ["sound", "소리", ["sound", "music"]],
  ["talk", "말", ["say", "sayLines", "talk", "note"]],
  ["move", "움직임", ["play", "animate", "shake"]],
  ["screen", "화면", ["scene", "flash", "closeup", "closeCloseup", "cutscene", "go", "ending"]],
  ["etc", "그 밖", null],
];
const QUICK = [["sound", "소리"], ["say", "자막"], ["play", "애니메이션"], ["shake", "흔들기"], ["animate", "움직이기"], ["flash", "번쩍"], ["scene", "장면"]];
const trackOf = (a) => { const id = (M.actionType(a) || {}).id; return (TRACKS.find((t) => t[2] && t[2].includes(id)) || TRACKS[4])[0]; };
const round1 = (v) => Math.round(v * 10) / 10;

// 소리 길이는 파일을 읽어 알아낸다 (처음엔 모름)
const audioDur = {};
const live = new Set();   // 화면에 있는 타임라인들 (소리 길이를 알게 되면 다시 그림)
function soundDur(p) {
  if (!p) return null;
  if (p in audioDur) return audioDur[p];
  audioDur[p] = null;
  try {
    const au = new Audio(asset(p));
    au.preload = "metadata";
    au.addEventListener("loadedmetadata", () => { audioDur[p] = au.duration; for (const f of [...live]) f(); });
  } catch (_) { /* 소리를 못 읽음 */ }
  return null;
}
// 할 일 하나가 걸리는 시간 (막대 길이). 0 이면 바로 일어나는 일 (마름모).
export function durationOf(a) {
  const id = (M.actionType(a) || {}).id;
  if (id === "shake") return +a.time || 0.4;
  if (id === "flash") return +a.time || 0.5;
  if (id === "animate") return +a.time || 0.5;
  if (id === "play") { const an = animOf(a.play); return an ? Math.max(0.1, cycleTime(an)) : 0.5; }
  if (id === "say") return String(a.say || "").split("|").reduce((s, l) => s + 1 + l.length * 0.08, 0) + 0.35;
  if (id === "sayLines") return 1 + String((a.say || [])[0] || "").length * 0.08;
  if (id === "sound") return soundDur(a.sound) || 1;
  if (id === "talk") return 2.5;
  if (id === "cutscene") return 3;
  if (id === "scene") { const sc = sceneOf(a.scene); return sc ? Math.max(0.1, sceneDuration(sc)) : 1; }
  if (id === "wait") return +a.wait || 1;
  return 0;
}
const resizable = (a) => ["shake", "flash", "animate"].includes((M.actionType(a) || {}).id);

// 차례로 실행하던 목록을 타임라인으로 (기다리기와, 끝날 때까지 기다리는 할 일만 시간을 늘린다)
export function toTimeline(list) {
  let t = 0;
  const items = [];
  for (const a of list || []) {
    const id = (M.actionType(a) || {}).id;
    if (id === "wait") { t += +a.wait || 0; continue; }
    if (id === "timeline") { for (const x of a.timeline || []) items.push({ ...x, at: round1(t + (+x.at || 0)) }); t += Math.max(0, ...(a.timeline || []).map((x) => (+x.at || 0) + durationOf(x))); continue; }
    items.push({ ...a, at: round1(t) });
    const blocks = (id === "say" && a.until_done) || (id === "animate" && a.until_done !== false) || id === "talk" || id === "cutscene" || id === "scene";
    if (blocks) t += durationOf(a);
  }
  return { timeline: items };
}

// 목록 칸 하나를 타임라인으로 고친다. parent[key] 가 비었거나 타임라인 하나면 바로 타임라인으로 보이고,
// 차례로 실행하는 할 일이 들어 있으면 '타임라인으로 바꾸기' 를 권한다.
export function timelineField(parent, key, onCh, opts = {}) {
  const box = h("div", { class: "tl-field" });
  const draw = () => {
    const list = parent[key] || [];
    const isTl = list.length === 1 && Array.isArray(list[0].timeline);
    if (list.length && !isTl) {
      // 차례로 실행하던 목록: 시간표로 바꿔서 보여 주고, 고치는 순간 타임라인으로 저장한다
      const tl = toTimeline(list);
      box.replaceChildren(timelineEditor(tl, () => { parent[key] = [tl]; onCh(); }, { ...opts, redrawField: draw }));
      return;
    }
    const tl = isTl ? list[0] : { timeline: [] };
    box.replaceChildren(timelineEditor(tl, () => {
      if (!isTl && tl.timeline.length) parent[key] = [tl];       // 처음 더할 때 목록에 넣는다
      if (isTl && !tl.timeline.length) parent[key] = [];         // 다 지우면 비운다
      onCh();
    }, { ...opts, redrawField: draw }));
  };
  draw();
  return box;
}

// 타임라인 할 일 하나를 고치는 칸
const ui = new WeakMap();   // 타임라인마다: 고른 것, 재생 위치
export function timelineEditor(tl, onCh, opts = {}) {
  tl.timeline = tl.timeline || [];
  const st = ui.get(tl) || { sel: -1, head: 0 };
  ui.set(tl, st);
  const root = h("div", { class: "tl" + (opts.big ? " big" : "") });
  const change = () => { onCh(); draw(); };
  let playing = null;

  const draw = () => {
    if (!root.isConnected && root.childElementCount) { live.delete(draw); return; }
    const items = tl.timeline;
    const end = Math.max(0, ...items.map((a) => (+a.at || 0) + durationOf(a)));
    const T = Math.max(3, Math.ceil(end + 0.6));
    const pct = (t) => (t / T * 100) + "%";
    // 위: 더하기, 미리 보기
    const add = (make) => {
      const a = { at: round1(st.head), ...make };
      items.push(a);
      st.sel = items.length - 1;
      S.justAdded = a;
      change();
    };
    const bar = h("div", { class: "tl-bar" },
      h("span", { class: "tl-label" }, "더하기"),
      QUICK.map(([id, label]) => h("button", { class: "btn small", title: `재생 위치(${round1(st.head)}초)에 ${label} 더하기`, onclick: () => {
        const a = M.ACTIONS.find((x) => x.id === id).make();
        // 애니메이션은 고르고 나서 넣는다. 틀 물건은 지금 고친 물건으로.
        if (id === "play") return pickAnim("", (anim) => { if (anim) add({ ...a, play: anim, on: opts.target || "" }); }, { allowNone: false });
        if (id === "scene") return pickScene("", (sc) => { if (sc) add({ scene: sc }); }, { allowNone: false });
        if (opts.target && "animate" in a) a.animate = opts.target;
        add(a);
      } }, label)),
      h("button", { class: "btn small", onclick: () => pickAction((a) => add(a)) }, "그 밖의 할 일"),
      h("span", { class: "spacer" }),
      h("button", { class: "btn small play", title: "가운데 화면에서 미리 봅니다", disabled: !items.length, onclick: () => (playing ? stop() : play(T)) }, playing ? "■ 멈춤" : "▶ 미리 보기"),   // 글쓰기 규칙 예외
      opts.big ? null : h("button", { class: "btn small", title: "크게 열어서 고칩니다", onclick: () => {
        modal("타임라인", timelineEditor(tl, onCh, { big: true, target: opts.target }), [{ label: "닫기", onclick: (c) => c() }], () => { if (opts.redrawField) opts.redrawField(); else draw(); });
      } }, "크게 보기"));
    // 눈금
    const ruler = h("div", { class: "tl-ruler" });
    for (let t = 0; t <= T + 0.001; t += 0.5) ruler.append(h("span", { class: "tl-tick" + (t % 1 === 0 ? " major" : ""), style: { left: pct(t) } }, t % 1 === 0 ? `${t}초` : ""));
    // 재생 위치: 눈금을 눌러 옮긴다
    ruler.addEventListener("mousedown", (e) => {
      const r = ruler.getBoundingClientRect();
      const set = (ev) => { st.head = Math.max(0, Math.min(T, round1((ev.clientX - r.left) / r.width * T))); headEl.forEach((x) => (x.style.left = pct(st.head))); };
      set(e);
      const up = () => { window.removeEventListener("mousemove", set); window.removeEventListener("mouseup", up); };
      window.addEventListener("mousemove", set); window.addEventListener("mouseup", up);
    });
    const headEl = [];
    const blks = new Map();   // 할 일 → 막대 (글자만 바꿀 때 쓴다)
    const ROW = opts.big ? 34 : 26;
    const lanes = TRACKS.map(([tid, label]) => {
      const area = h("div", { class: "tl-area" });
      // 줄 정하기: 앞 막대와 겹치면 다음 줄. 순간 할 일은 옆 글자 자리까지 차지한다고 본다.
      const rows = [];
      const rowOf = new Map();
      items.map((a, i) => [a, i]).filter(([a]) => trackOf(a) === tid).sort((x, y) => (+x[0].at || 0) - (+y[0].at || 0)).forEach(([a, i]) => {
        const at = +a.at || 0, d = durationOf(a);
        const end = at + (d || T * Math.min(0.45, (actSentence(a, names).length * 7 + 24) / 700));
        let r = rows.findIndex((e) => e <= at + 0.001);
        if (r < 0) { r = rows.length; rows.push(0); }
        rows[r] = end;
        rowOf.set(i, r);
      });
      area.style.height = Math.max(1, rows.length) * ROW + "px";
      items.forEach((a, i) => {
        if (trackOf(a) !== tid) return;
        const at = +a.at || 0, d = durationOf(a);
        const text = actSentence(a, names);
        const blk = h("div", { class: `tl-blk t-${tid}` + (d ? "" : " instant") + (i === st.sel ? " sel" : ""), title: `${round1(at)}초: ${text}`,
          style: { left: pct(at), width: d ? `calc(${pct(d)} - 2px)` : "", top: rowOf.get(i) * ROW + 4 + "px", height: ROW - 8 + "px", bottom: "auto" } },
          h("span", { class: "tl-text" }, d ? text : ""), resizable(a) ? h("span", { class: "tl-grip", title: "끌어서 길이 바꾸기" }) : null);
        if (!d) blk.append(h("span", { class: "tl-dia" }), h("span", { class: "tl-text side" }, text));
        blks.set(a, blk);
        // 끌어서 옮기기 / 길이 바꾸기
        blk.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          const grip = e.target.classList.contains("tl-grip");
          const r = area.getBoundingClientRect();
          const x0 = e.clientX, at0 = at, d0 = +a.time || d;
          let moved = false;
          const mv = (ev) => {
            const dt = (ev.clientX - x0) / r.width * T;
            if (Math.abs(ev.clientX - x0) > 3) moved = true;
            if (grip) { a.time = Math.max(0.1, round1(d0 + dt)); blk.style.width = `calc(${pct(a.time)} - 2px)`; }
            else { a.at = Math.max(0, round1(at0 + dt)); blk.style.left = pct(a.at); }
          };
          const up = () => {
            window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
            st.sel = i;
            if (moved) change(); else draw();
          };
          window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
        });
        area.append(blk);
      });
      const hd = h("div", { class: "tl-head", style: { left: pct(st.head) } });
      headEl.push(hd);
      area.append(hd);
      return h("div", { class: "tl-lane" }, h("div", { class: "tl-name" }, label), area);
    });
    const rh = h("div", { class: "tl-head top", style: { left: pct(st.head) } });
    headEl.push(rh);
    ruler.append(rh);
    // 고른 것 고치기
    const sel = items[st.sel];
    const detail = sel ? h("div", { class: "tl-detail" },
      h("div", { class: "tl-dhead" },
        h("span", { class: "tl-label" }, "시작"),
        h("input", { type: "number", step: 0.1, min: 0, class: "num-in", value: round1(+sel.at || 0), onchange: (e) => { sel.at = Math.max(0, round1(parseFloat(e.target.value) || 0)); change(); } }),
        h("span", { class: "f-hint" }, "초"),
        h("span", { class: "spacer" }),
        h("button", { class: "btn small", onclick: () => { items.splice(st.sel + 1, 0, JSON.parse(JSON.stringify(sel))); st.sel += 1; change(); } }, "복제"),
        h("button", { class: "btn small danger", onclick: () => { items.splice(st.sel, 1); st.sel = -1; change(); } }, "지우기")),
      actionEditor(sel, () => {
        if (!("at" in sel)) sel.at = 0;
        onCh();
        const b = blks.get(sel);
        if (b) { const text = actSentence(sel, names); b.title = `${round1(+sel.at || 0)}초: ${text}`; b.querySelectorAll(".tl-text").forEach((x) => { if (x.textContent || x.classList.contains("side")) x.textContent = text; }); }
      }, () => draw()))
      : h("p", { class: "sec-help tl-empty" }, items.length ? "막대를 누르면 여기서 고칩니다. 끌면 시작 시각이 바뀌고, 오른쪽 끝을 끌면 길이가 바뀝니다. 같은 세로줄에 놓으면 동시에 일어납니다." : "아직 아무것도 없습니다. 위의 단추로 더하세요. 눈금을 누르면 더할 시각(재생 위치)을 정합니다.");
    root.replaceChildren(bar, h("div", { class: "tl-grid" }, h("div", { class: "tl-lane ruler" }, h("div", { class: "tl-name" }, ""), ruler), ...lanes), detail);
    live.add(draw);
  };

  // ------------------------------------------------ 미리 보기 (가운데 화면에서)
  const stageEl = () => document.querySelector("#stage-wrap .stage");
  const frameEl = () => document.querySelector("#stage-wrap .stage-frame");
  let cap = null;
  const caption = (text) => {
    const st2 = stageEl();
    if (!st2) return;
    if (!cap || !cap.isConnected) { cap = h("div", { class: "pv-caption" }); st2.append(cap); }
    cap.textContent = text;
    cap.hidden = !text;
  };
  const fire = (a) => {
    const id = (M.actionType(a) || {}).id;
    const d = durationOf(a);
    if (id === "sound" && a.sound) { try { const au = new Audio(asset(a.sound)); au.volume = Math.min(1, +a.volume || 1); au.play().catch(() => {}); } catch (_) { /* 재생 불가 */ } }
    else if (id === "say" || id === "sayLines" || id === "talk") {
      const text = id === "say" ? String(a.say || "").replace(/\|/g, " ") : id === "sayLines" ? (a.say || [])[0] || "" : String(a.talk || "").split("\n")[0];
      caption(text);
      setTimeout(() => { if (cap && cap.textContent === text) caption(""); }, d * 1000);
    } else if (id === "shake") {
      const target = a.shake ? findSprite(a.shake) : frameEl();
      if (target) { target.style.setProperty("--amp", ((+a.strength || 18) / 6) + "px"); target.classList.remove("pv-shake"); void target.offsetWidth; target.classList.add("pv-shake"); target.style.animationDuration = d + "s"; setTimeout(() => target.classList.remove("pv-shake"), d * 1000); }
    } else if (id === "flash") {
      const st2 = stageEl();
      if (st2) { const fl = h("div", { class: "pv-flash", style: { background: a.flash || "#fff", animationDuration: d + "s" } }); st2.append(fl); setTimeout(() => fl.remove(), d * 1000); }
    } else if (id === "animate") {
      const el = findSprite(a.animate);
      if (el) {
        const cls = { "흔들기": "pv-shake", "통통 튀기": "pv-bounce", "깜빡이기": "pv-blink", "이동하기": "pv-move" }[a.kind || "흔들기"] || "pv-shake";
        if (cls === "pv-move" && Array.isArray(a.move)) { el.style.setProperty("--mx", (a.move[0] / 1920 * 100) + "cqw"); el.style.setProperty("--my", (a.move[1] / 1920 * 100) + "cqw"); }
        el.style.setProperty("--amp", "4px");
        el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); el.style.animationDuration = d + "s";
        setTimeout(() => el.classList.remove(cls), d * 1000);
      }
    } else if (id === "play") {
      const el = findSprite(a.on);
      const an = animOf(a.play);
      if (el && an && (an.frames || []).length) {
        const keep = el.dataset.anim, src = el.getAttribute("src");
        el.dataset.anim = a.play; el.dataset.animStart = String(performance.now()); el.dataset.animOnce = "1";
        setTimeout(() => {
          if (a.keep_last) return;
          if (keep) el.dataset.anim = keep; else { delete el.dataset.anim; el.setAttribute("src", src); }
          delete el.dataset.animStart; delete el.dataset.animOnce;
        }, cycleTime(an) * 1000);
      } else caption(an ? "(애니메이션을 틀 물건이 지금 화면에 없습니다)" : "(애니메이션을 고르세요)");
    } else caption("▶ " + actSentence(a, names));   // 글쓰기 규칙 예외
  };
  const findSprite = (name) => { const st2 = stageEl(); if (!st2) return null; return [...st2.querySelectorAll("[data-path]")].find((e) => e.dataset.path === name || e.dataset.path.endsWith("/" + name)) || null; };
  const play = (T) => {
    const items = [...tl.timeline];
    const t0 = performance.now() - st.head * 1000;
    const fired = new Set(items.map((a, i) => ((+a.at || 0) < st.head ? i : -1)).filter((i) => i >= 0));
    playing = true;
    document.body.classList.add("tl-previewing");
    draw();
    const tick = () => {
      if (!playing) return;
      const t = (performance.now() - t0) / 1000;
      items.forEach((a, i) => { if (!fired.has(i) && t >= (+a.at || 0)) { fired.add(i); fire(a); } });
      st.head = Math.min(T, t);
      root.querySelectorAll(".tl-head").forEach((x) => (x.style.left = (st.head / T * 100) + "%"));
      if (t >= T || !root.isConnected) { stop(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const stop = () => { playing = null; st.head = 0; caption(""); document.body.classList.remove("tl-previewing"); if (root.isConnected) draw(); };

  draw();
  return root;
}
