// 애니메이션 (플립북): 그림 여러 장을 차례로 넘긴다. 게임 공통 데이터의 "animations" 에 둔다.
//   "animations": {"촛불": {"name": "촛불 흔들림", "frames": ["res://...", ...], "fps": 8, "loop": "loop", "hold": [1, 2]}}
// 물건에는 두 가지로 붙는다.
//   모습: {"if": [...], "anim": "촛불"}  그 조건일 때 계속 돈다.
//   할 일: {"play": "서랍_열림", "on": "Drawer01"}  한 번 튼다 (끝나면 원래 모습).
import { S, h, toast, modal, ask, asset, gameFile, markDirty, GAME_FILE, addImage, setGameName, IMAGE_DIR, names, imageUses, hooks, matchText } from "./core.js";
import { josa } from "./words.js";

// 빈 칸(null)은 빼고 채운다
const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));

export const LOOPS = [["loop", "처음부터 다시"], ["once", "마지막 컷에서 멈춤"], ["pingpong", "거꾸로 되돌아가기"]];
export const LOOP_SHORT = { loop: "반복", once: "한 번", pingpong: "왕복" };

export const animsData = () => {
  const g = gameFile().data;
  return g.animations || {};
};
export const animOf = (id) => (id ? animsData()[id] || null : null);
export const animName = (id) => { const a = animOf(id); return a ? a.name || "이름 없는 애니메이션" : id ? "없는 애니메이션" : "?"; };
const holdOf = (a, i) => Math.max(1, (a.hold || [])[i] || 1);

// 한 바퀴 동안 보여 줄 장 번호 (왕복이면 갔다가 돌아오는 것까지). 게임의 Flipbook.sequence 와 같다.
export function sequence(a) {
  const n = (a.frames || []).length;
  const out = [...Array(n).keys()];
  if (a.loop === "pingpong" && n > 2) for (let i = n - 2; i > 0; i--) out.push(i);
  return out;
}
export function cycleTime(a) {
  if (!a) return 0;
  return sequence(a).reduce((s, i) => s + holdOf(a, i), 0) / Math.max(1, +a.fps || 12);
}
// t 초가 지났을 때의 장 번호. once 면 끝에서 멈춘다.
export function frameAt(a, t, once = false) {
  const seq = sequence(a);
  if (!seq.length) return -1;
  const total = seq.reduce((s, i) => s + holdOf(a, i), 0);
  let step = Math.floor(Math.max(0, t) * Math.max(1, +a.fps || 12));
  if (once || a.loop === "once") { if (step >= total) return a.loop === "pingpong" ? seq[0] : seq[seq.length - 1]; }
  else step %= total;
  for (const i of seq) { step -= holdOf(a, i); if (step < 0) return i; }
  return seq[seq.length - 1];
}
export const firstFrame = (id) => { const a = animOf(id); return a && (a.frames || [])[0] || null; };

// 이 애니메이션을 쓰는 곳 수 (모습의 anim, 할 일의 play)
export function animUses(id) {
  let n = 0;
  for (const f of Object.values(S.files)) {
    const text = JSON.stringify(f.data);
    n += text.split(`"anim":${JSON.stringify(id)}`).length - 1;
    n += text.split(`"play":${JSON.stringify(id)}`).length - 1;
  }
  return n;
}

function setAnims(all) {
  const g = gameFile().data;
  if (Object.keys(all).length) g.animations = all; else delete g.animations;
  markDirty(GAME_FILE);
}
function newId() { return "anim_" + Date.now().toString(36) + Math.floor(Math.random() * 100); }

// ------------------------------------------------------------------ 움직이는 그림 (화면 곳곳의 작은 미리 보기)
// <img data-anim="아이디"> 를 찾아 장을 넘긴다. 시작 시각은 data-anim-start (없으면 같이 돈다).
let ticker = 0;
export function startAnimTicker() {
  if (ticker || typeof window === "undefined") return;
  const t0 = performance.now();
  ticker = setInterval(() => {
    if (S.animsPaused) return;
    const now = performance.now();
    for (const el of document.querySelectorAll("img[data-anim]")) {
      const a = animOf(el.dataset.anim);
      if (!a || !(a.frames || []).length) continue;
      const start = +el.dataset.animStart || t0;
      const i = frameAt(a, (now - start) / 1000, el.dataset.animOnce === "1");
      const src = asset(a.frames[Math.max(0, i)]);
      if (el.getAttribute("src") !== src) el.setAttribute("src", src);
    }
  }, 1000 / 30);
}
export function animImg(id, attrs = {}) {
  startAnimTicker();
  const f = firstFrame(id);
  return h("img", { ...attrs, src: f ? asset(f) : "", "data-anim": id, alt: "" });
}

// ------------------------------------------------------------------ 고르기 창

export function pickAnim(current, onPick, { allowNone = true } = {}) {
  let close;
  const search = h("input", { placeholder: "이름으로 찾기", style: { width: "100%" } });
  const body = h("div", { class: "gallery-grid" });
  const draw = () => {
    const list = Object.entries(animsData()).filter(([, a]) => matchText(a.name || "", search.value));
    body.replaceChildren(...list.map(([id, a]) => h("button", { class: "gallery-item" + (id === current ? " on" : ""), onclick: () => { close(); onPick(id); } },
      animImg(id, { loading: "lazy" }), h("span", {}, `${a.name || "이름 없음"} (컷 ${(a.frames || []).length}개)`))));
    if (!list.length) body.append(h("p", { class: "muted" }, Object.keys(animsData()).length ? "찾는 이름이 없습니다." : "아직 애니메이션이 없습니다. 아래 '새로 만들기'를 누르세요."));
  };
  search.addEventListener("input", draw);
  draw();
  close = modal("애니메이션 고르기", h("div", { class: "gallery-wrap" }, search, body), [
    allowNone ? { label: "애니메이션 없애기", onclick: (c) => { c(); onPick(""); } } : null,
    { label: "새로 만들기", onclick: (c) => { c(); openAnimEditor(null, (id) => onPick(id)); } },
    { label: "닫기", onclick: (c) => c() },
  ].filter(Boolean));
}

// 고르기 단추 (모습, 할 일 칸에서 쓴다)
export function animField(val, set) {
  const wrap = h("div", { class: "image-pick" });
  const draw = (v) => {
    fill(wrap,
      h("button", { onclick: (e) => { e.preventDefault(); pickAnim(v, (id) => { set(id); draw(id); }); } }, v ? animName(v) + " (바꾸기)" : "애니메이션 고르기"),
      v ? animImg(v, { class: "mini" }) : null,
      v ? h("button", { class: "btn link", onclick: (e) => { e.preventDefault(); openAnimEditor(v); } }, "고치기") : null);
  };
  draw(val);
  return wrap;
}

// ------------------------------------------------------------------ 그림 처리 (올리기, 나누기, GIF)

// 캔버스 → PNG 로 올린다. 경로를 돌려준다.
function uploadCanvas(canvas, label) {
  const base64 = canvas.toDataURL("image/png").split(",")[1];
  const safe = label.normalize("NFKD").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "frame";
  const path = `${IMAGE_DIR}${safe}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}.png`;
  addImage(path, base64, true);
  setGameName("files", "res://" + path, label);
  return "res://" + path;
}
// 가장자리와 이어진 흰 부분을 투명하게
function clearWhite(ctx, w, hh, tol = 28) {
  const im = ctx.getImageData(0, 0, w, hh);
  const d = im.data;
  const white = (k) => d[k * 4] > 255 - tol && d[k * 4 + 1] > 255 - tol && d[k * 4 + 2] > 255 - tol;
  const seen = new Uint8Array(w * hh);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (hh - 1) * w + x);
  for (let y = 0; y < hh; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const k = stack.pop();
    if (seen[k]) continue;
    seen[k] = 1;
    if (!white(k)) continue;
    d[k * 4 + 3] = 0;
    const x = k % w, y = (k - x) / w;
    if (x > 0) stack.push(k - 1);
    if (x < w - 1) stack.push(k + 1);
    if (y > 0) stack.push(k - w);
    if (y < hh - 1) stack.push(k + w);
  }
  ctx.putImageData(im, 0, 0);
}
function canvasOf(src, sx, sy, sw, sh, white) {
  const c = document.createElement("canvas");
  c.width = sw; c.height = sh;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  if (white) clearWhite(ctx, sw, sh);
  return c;
}
const loadImage = (file) => new Promise((ok, bad) => {
  const r = new FileReader();
  r.onload = () => { const img = new Image(); img.onload = () => ok(img); img.onerror = bad; img.src = String(r.result); };
  r.onerror = bad;
  r.readAsDataURL(file);
});
function chooseFiles(accept, multiple, onFiles) {
  const inp = h("input", { type: "file", accept, multiple, style: { display: "none" } });
  inp.addEventListener("change", () => { const fs = [...inp.files]; inp.remove(); if (fs.length) onFiles(fs); });
  document.body.append(inp);
  inp.click();
}

// 여러 장 올리기: 파일 이름 순서대로 (1, 2, 10 순)
function addFromFiles(a, done) {
  chooseFiles("image/png,image/jpeg,image/webp", true, (files) => {
    files.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
    const white = h("input", { type: "checkbox" });
    modal("그림 파일 여러 장 올리기", h("div", { class: "upload-box" },
      h("p", {}, `그림 ${files.length}장을 파일 이름 순서대로 컷으로 넣습니다.`),
      h("ol", { class: "small" }, files.slice(0, 12).map((f) => h("li", {}, f.name)), files.length > 12 ? h("li", {}, "…") : null),
      h("label", { class: "check" }, white, " 흰 배경을 투명하게")), [
      { label: "취소", onclick: (c) => c() },
      { label: "넣기", kind: "primary", onclick: async (c) => {
        c();
        let n = 0;
        for (const f of files) {
          try {
            const img = await loadImage(f);
            a.frames.push(uploadCanvas(canvasOf(img, 0, 0, img.naturalWidth, img.naturalHeight, white.checked), `${a.name || "애니메이션"} ${a.frames.length + 1}`));
            n++;
          } catch (_) { toast(`그림 파일 ${f.name}: 읽지 못했습니다.`, "warn"); }
        }
        done(n);
      } },
    ]);
  });
}

// 한 장을 칸으로 나누기 (스프라이트 시트)
function addFromSheet(a, done) {
  chooseFiles("image/png,image/jpeg,image/webp", false, async ([file]) => {
    let img;
    try { img = await loadImage(file); } catch (_) { return toast("그림을 읽지 못했습니다.", "bad"); }
    const opt = { cols: 4, rows: 1, count: 4, white: false };
    const prev = h("canvas", { class: "up-preview" });
    const info = h("p", { class: "help small" });
    const render = () => {
      const scale = Math.min(1, 560 / img.naturalWidth, 300 / img.naturalHeight);
      prev.width = Math.round(img.naturalWidth * scale); prev.height = Math.round(img.naturalHeight * scale);
      const ctx = prev.getContext("2d");
      ctx.clearRect(0, 0, prev.width, prev.height);
      ctx.drawImage(img, 0, 0, prev.width, prev.height);
      const cw = prev.width / opt.cols, ch = prev.height / opt.rows;
      ctx.strokeStyle = "#4d8dff"; ctx.lineWidth = 2; ctx.fillStyle = "rgba(77,141,255,.9)"; ctx.font = "bold 13px sans-serif";
      let k = 0;
      for (let r = 0; r < opt.rows; r++) for (let c = 0; c < opt.cols; c++) {
        ctx.strokeRect(c * cw, r * ch, cw, ch);
        if (k < opt.count) ctx.fillText(String(k + 1), c * cw + 5, r * ch + 16);
        k++;
      }
      info.textContent = `한 칸 크기: ${Math.floor(img.naturalWidth / opt.cols)} x ${Math.floor(img.naturalHeight / opt.rows)}. 왼쪽 위부터 오른쪽으로, 그다음 줄 순서로 ${opt.count}칸을 컷으로 씁니다.`;
    };
    const num = (key, label, min = 1) => h("label", { class: "field inline" }, h("span", {}, label),
      h("input", { type: "number", min, value: opt[key], class: "num-in", oninput: (e) => {
        opt[key] = Math.max(min, parseInt(e.target.value || "1", 10));
        if (key !== "count") { opt.count = opt.cols * opt.rows; countIn.value = opt.count; }
        opt.count = Math.min(opt.count, opt.cols * opt.rows);
        render();
      } }));
    const countLabel = num("count", "쓸 칸 수");
    const countIn = countLabel.querySelector("input");
    render();
    modal("한 장짜리 그림을 칸대로 자르기", h("div", { class: "upload-box" },
      h("div", { class: "up-stage" }, prev), info,
      h("div", { class: "row" }, num("cols", "가로 칸"), num("rows", "세로 칸"), countLabel),
      h("label", { class: "check" }, h("input", { type: "checkbox", onchange: (e) => { opt.white = e.target.checked; } }), " 흰 배경을 투명하게")), [
      { label: "취소", onclick: (c) => c() },
      { label: "잘라서 넣기", kind: "primary", onclick: (c) => {
        c();
        const cw = Math.floor(img.naturalWidth / opt.cols), ch = Math.floor(img.naturalHeight / opt.rows);
        let k = 0;
        for (let r = 0; r < opt.rows; r++) for (let col = 0; col < opt.cols; col++) {
          if (k++ >= opt.count) break;
          a.frames.push(uploadCanvas(canvasOf(img, col * cw, r * ch, cw, ch, opt.white), `${a.name || "애니메이션"} ${a.frames.length + 1}`));
        }
        done(Math.min(opt.count, opt.cols * opt.rows));
      } },
    ]);
  });
}

// GIF 풀기 (브라우저의 ImageDecoder 로. 크롬, 엣지에서 된다)
function addFromGif(a, done) {
  if (typeof ImageDecoder === "undefined") return toast("이 브라우저는 GIF 풀기를 할 수 없습니다. 크롬이나 엣지에서 해 주세요.", "warn", 8000);
  chooseFiles("image/gif,image/webp,image/png", false, async ([file]) => {
    try {
      const dec = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type || "image/gif" });
      await dec.tracks.ready;
      const count = dec.tracks.selectedTrack.frameCount;
      if (count > 120) toast(`GIF 에 그림이 ${count}개나 있습니다. 처음 120개만 컷으로 씁니다.`, "warn", 7000);
      let first = 0;
      for (let i = 0; i < Math.min(count, 120); i++) {
        const { image } = await dec.decode({ frameIndex: i });
        const c = document.createElement("canvas");
        c.width = image.displayWidth; c.height = image.displayHeight;
        c.getContext("2d").drawImage(image, 0, 0);
        if (i === 0) first = image.duration || 0;
        image.close();
        a.frames.push(uploadCanvas(c, `${a.name || "애니메이션"} ${a.frames.length + 1}`));
      }
      if (first > 0 && a.frames.length === Math.min(count, 120)) a.fps = Math.max(1, Math.min(60, Math.round(1e6 / first)));
      done(Math.min(count, 120));
    } catch (e) {
      toast("GIF 를 풀지 못했습니다: " + e.message, "bad", 8000);
    }
  });
}

// ------------------------------------------------------------------ 애니메이션 편집기 (화면 전체를 덮는 창)
// 말 정리
//   컷: 애니메이션을 이루는 그림 한 장.  속도: 1초에 넘기는 컷 수.  보이는 시간: 컷 하나가 화면에 남아 있는 시간.
//   끝나면: 처음부터 다시, 마지막 컷에서 멈춤, 거꾸로 되돌아가기.
// 자리
//   왼쪽: 애니메이션 목록.  가운데: 미리 보기(오른쪽 위에 보기 설정), 그 밑에 재생 단추, 그 밑에 컷 줄과 고른 컷 도구.
//   오른쪽: 이 애니메이션 전체 설정(이름, 속도, 끝나면)과 관리(복제, 지우기).

const SPEEDS = [[6, "느리게"], [12, "보통"], [24, "빠르게"]];
const END_HELP = {
  loop: "마지막 컷 다음에 첫 컷으로 돌아가 계속 움직입니다. 촛불, 시계추, 흐르는 물처럼 멈추지 않는 것.",
  once: "마지막 컷에서 멈춥니다. 문이 열리거나 물건이 떨어지는 것처럼 한 번 일어나는 동작.",
  pingpong: "마지막 컷까지 갔다가 거꾸로 첫 컷까지 돌아오기를 되풀이합니다. 숨쉬기, 흔들리는 추.",
};
const secs = (v) => `${Math.round(v * 100) / 100}초`;

// 컷 넣는 방법 고르기
function addCutsDialog(a, added) {
  let close;
  const pick = (fn) => () => { close(); fn(); };
  const card = (title, ex, fn) => h("button", { class: "pick-card", onclick: pick(fn) }, h("span", { class: "pc-text" }, h("b", {}, title), h("small", {}, ex)));
  close = modal("컷 넣기", h("div", { class: "pick-wrap" },
    h("p", { class: "help" }, "새 컷은 컷 줄의 맨 뒤에 붙습니다. 넣은 뒤 끌어서 순서를 바꿀 수 있습니다."),
    h("div", { class: "pick-cards" },
      card("그림 파일 여러 장 올리기", "컷마다 따로 그린 그림 파일들을 한꺼번에 고릅니다. 파일 이름 순서(1, 2, 10 순)로 들어갑니다.", () => addFromFiles(a, added)),
      card("한 장짜리 그림을 칸대로 자르기", "여러 동작이 바둑판처럼 한 장에 그려진 그림(스프라이트 시트)을 가로, 세로 칸 수만큼 잘라 넣습니다.", () => addFromSheet(a, added)),
      card("GIF 파일에서 꺼내기", "움직이는 GIF 를 컷으로 풀어 넣습니다. 속도도 GIF 에 맞춥니다. 크롬, 엣지에서 됩니다.", () => addFromGif(a, added)),
      card("이미 있는 그림에서 고르기", "편집기에 이미 올라간 그림 한 장을 컷으로 넣습니다.", () => pickFrame((p) => { a.frames.push(p); added(1); })))),
    [{ label: "닫기", onclick: (c) => c() }]);
}

export function openAnimEditor(id = null, onDone = null) {
  const all = { ...animsData() };
  let cur = id && all[id] ? id : null;
  if (!cur && !id) {
    cur = newId();
    all[cur] = { name: `새 애니메이션 ${Object.keys(all).length + 1}`, frames: [], fps: 12, loop: "loop" };
    setAnims(all);
  }
  const made = new Set(cur && !id ? [cur] : []);   // 이 창에서 새로 만든 것 (컷을 안 넣고 닫으면 지운다)
  const st = { sel: 0, playing: true, onion: false, bg: "check", t0: performance.now() };
  const root = h("div", { class: "anim-editor" });
  let raf = 0;
  const data = () => animsData()[cur];
  const holdsOf = (a) => a.frames.map((_, k) => holdOf(a, k));
  const save = () => { const a = data(); if (a && !(a.hold || []).some((x) => x > 1)) delete a.hold; markDirty(GAME_FILE); hooks.afterChange(); };
  const close = () => {
    const all2 = { ...animsData() };
    let dropped = false;
    for (const k of made) if (all2[k] && !(all2[k].frames || []).length) { delete all2[k]; dropped = true; if (cur === k) cur = null; }
    if (dropped) setAnims(all2);
    cancelAnimationFrame(raf); root.remove(); document.removeEventListener("keydown", keys);
    if (onDone && cur && animsData()[cur]) onDone(cur);
    if (animHooks.afterClose) animHooks.afterClose();
  };
  const keys = (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "") || document.querySelector(".modal-back")) return;
    if (e.key === "Escape") close();
    else if (e.key === " ") { e.preventDefault(); togglePlay(); }
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  };
  document.addEventListener("keydown", keys);
  const togglePlay = () => { st.playing = !st.playing; if (st.playing) st.t0 = performance.now(); draw(); };
  const step = (d) => { const a = data(); if (!a || !a.frames.length) return; st.playing = false; st.sel = (Math.min(st.sel, a.frames.length - 1) + d + a.frames.length) % a.frames.length; draw(); };

  // ---- 미리 보기 (재생 중이면 시간에 맞는 컷, 멈췄으면 고른 컷)
  const stage = h("div", { class: "ae-stage" });
  const onion = h("img", { class: "ae-onion", alt: "" });
  const frameImg = h("img", { class: "ae-frame", alt: "" });
  const empty = h("div", { class: "ae-stage-empty" });
  const viewOpts = h("div", { class: "ae-view" });
  stage.append(onion, frameImg, empty, viewOpts);
  const counter = h("span", { class: "ae-count" });
  const tick = () => {
    const a = data();
    if (a && a.frames.length) {
      const i = Math.max(0, st.playing ? frameAt(a, (performance.now() - st.t0) / 1000) : Math.min(st.sel, a.frames.length - 1));
      const src = asset(a.frames[i]);
      if (frameImg.getAttribute("src") !== src) frameImg.setAttribute("src", src);
      frameImg.hidden = false; empty.hidden = true;
      const prev = a.frames[(i - 1 + a.frames.length) % a.frames.length];
      onion.hidden = !st.onion || st.playing || a.frames.length < 2;
      if (!onion.hidden && onion.getAttribute("src") !== asset(prev)) onion.setAttribute("src", asset(prev));
      const text = `${a.frames.length}컷 가운데 ${i + 1}번째`;
      if (counter.textContent !== text) counter.textContent = text;
      root.querySelectorAll(".ae-cell").forEach((c, k) => c.classList.toggle("now", st.playing && k === i));
    } else {
      frameImg.hidden = true; onion.hidden = true; empty.hidden = false;
      empty.textContent = a ? "아직 컷이 없습니다. 아래 '＋ 컷 넣기'를 누르세요." : "왼쪽에서 애니메이션을 고르거나 새로 만드세요.";
      counter.textContent = "";
    }
    raf = requestAnimationFrame(tick);
  };

  const list = h("div", { class: "ae-list" });
  const props = h("div", { class: "ae-props" });
  const player = h("div", { class: "ae-player" });
  const strip = h("div", { class: "ae-strip" });

  // ---- 왼쪽: 목록
  const drawList = () => {
    const items = Object.entries(animsData());
    fill(list,
      h("div", { class: "ae-col-title" }, "애니메이션 목록"),
      h("button", { class: "btn primary ae-new", onclick: () => {
        const a2 = { ...animsData() };
        const nid = newId();
        a2[nid] = { name: `새 애니메이션 ${items.length + 1}`, frames: [], fps: 12, loop: "loop" };
        made.add(nid);
        setAnims(a2); cur = nid; st.sel = 0; st.playing = true; draw();
      } }, "＋ 새 애니메이션"),
      ...items.map(([k, a]) => h("div", { class: "ae-item" + (k === cur ? " on" : ""), onclick: () => { cur = k; st.sel = 0; st.playing = true; st.t0 = performance.now(); draw(); } },
        animImg(k, { class: "ae-thumb" }),
        h("div", { class: "ae-item-text" }, h("b", {}, a.name || "이름 없음"),
          h("div", { class: "muted small" }, `컷 ${(a.frames || []).length}개, ${secs(cycleTime(a))}, ${LOOP_SHORT[a.loop || "loop"] || "반복"}`)))),
      items.length ? null : h("p", { class: "muted small" }, "아직 없습니다."));
  };

  // ---- 오른쪽: 이 애니메이션 전체 설정
  const drawProps = () => {
    const a = data();
    if (!a) { fill(props, h("p", { class: "muted" }, "왼쪽에서 애니메이션을 고르거나 새로 만드세요.")); return; }
    const uses = animUses(cur);
    const fps = a.fps || 12;
    const loop = a.loop || "loop";
    fill(props,
      h("div", { class: "ae-col-title" }, "애니메이션 설정"),
      h("div", { class: "ae-group" },
        h("div", { class: "ae-gtitle" }, "이름"),
        h("input", { class: "name-input", value: a.name || "", oninput: (e) => { a.name = e.target.value; save(); drawList(); } })),
      h("div", { class: "ae-group" },
        h("div", { class: "ae-gtitle" }, "속도"),
        h("div", { class: "seg wide" }, SPEEDS.map(([v, l]) => h("button", { class: "seg-btn" + (fps === v ? " on" : ""), onclick: () => { a.fps = v; save(); draw(); } }, l))),
        h("div", { class: "row ae-fps" }, h("span", {}, "1초에"),
          h("input", { type: "number", min: 1, max: 60, class: "num-in", value: fps, onchange: (e) => { a.fps = Math.max(1, Math.min(60, Math.round(+e.target.value) || 12)); save(); draw(); } }),
          h("span", {}, "컷을 넘깁니다")),
        h("p", { class: "help small" }, `컷 하나는 기본으로 ${secs(1 / fps)} 동안 보입니다. 손으로 그린 느낌이면 '보통'이 알맞습니다.`)),
      h("div", { class: "ae-group" },
        h("div", { class: "ae-gtitle" }, "끝나면"),
        LOOPS.map(([v, l]) => h("label", { class: "ae-radio" + (loop === v ? " on" : "") },
          h("input", { type: "radio", name: "ae-loop", checked: loop === v, onchange: () => { a.loop = v; st.t0 = performance.now(); save(); draw(); } }),
          h("span", {}, h("b", {}, l), h("small", {}, END_HELP[v]))))),
      h("div", { class: "ae-stats" },
        h("div", {}, `컷 ${a.frames.length}개, 한 번 도는 데 ${secs(cycleTime(a))}`),
        h("div", {}, uses ? `물건 ${uses}곳에서 쓰고 있습니다.` : "아직 어느 물건에도 붙이지 않았습니다.")),
      h("details", { class: "ae-how" }, h("summary", {}, "물건에 붙이는 방법"),
        h("ul", {},
          h("li", {}, "어떤 상태일 때 계속 움직이게: 물건의 상태 칸에서 그 상태를 누르고 '움직임'에서 고릅니다."),
          h("li", {}, "바뀌는 순간 한 번: 상태 칸이나 바뀌는 길 창의 타임라인에서 '애니메이션'을 누릅니다."),
          h("li", {}, "누르면 한 번: 누르면 카드의 할 일에서 '애니메이션 틀기'를 고릅니다."))),
      h("div", { class: "ae-group ae-manage" },
        h("div", { class: "ae-gtitle" }, "관리"),
        h("div", { class: "row" },
          h("button", { class: "btn small", onclick: () => { const a2 = { ...animsData() }; const nid = newId(); a2[nid] = JSON.parse(JSON.stringify({ ...a, name: (a.name || "") + " 사본" })); setAnims(a2); cur = nid; draw(); } }, "이 애니메이션 복제"),
          h("button", { class: "btn small danger", onclick: () => {
            if (uses) return toast(`물건 ${uses}곳에서 쓰고 있어서 지울 수 없습니다. 쓰는 곳에서 먼저 빼세요.`, "warn", 7000);
            ask("애니메이션 지우기", `${josa(a.name || "이 애니메이션", "을/를")} 지울까요? 되돌리기로 되살릴 수 있습니다.`, "지우기", () => {
              const a2 = { ...animsData() }; delete a2[cur]; setAnims(a2); cur = Object.keys(a2)[0] || null; draw();
            }, { danger: true });
          } }, "이 애니메이션 지우기"))));
  };

  // ---- 미리 보기 위 보기 설정, 밑의 재생 단추
  const drawPlayer = () => {
    fill(viewOpts,
      h("label", { class: "ae-chip", title: "멈춰 있을 때 바로 이전 컷을 흐리게 겹쳐 보여 줍니다. 컷 사이의 움직임을 맞출 때 씁니다." },
        h("input", { type: "checkbox", checked: st.onion, onchange: (e) => { st.onion = e.target.checked; } }), " 이전 컷 비쳐 보기"),
      h("div", { class: "seg small", title: "미리 보기 바탕색" }, [["check", "격자"], ["dark", "검정"], ["light", "흰색"]].map(([v, l]) =>
        h("button", { class: "seg-btn" + (st.bg === v ? " on" : ""), onclick: () => { st.bg = v; drawPlayer(); } }, l))));
    stage.dataset.bg = st.bg;
    const a = data();
    const none = !a || !a.frames.length;
    fill(player,
      h("button", { class: "btn", title: "이전 컷 (왼쪽 화살표 키)", disabled: none, onclick: () => step(-1) }, "이전 컷"),
      h("button", { class: "btn primary ae-play", title: "재생, 멈춤 (스페이스)", disabled: none, onclick: togglePlay }, st.playing && !none ? "멈춤" : "재생"),
      h("button", { class: "btn", title: "다음 컷 (오른쪽 화살표 키)", disabled: none, onclick: () => step(1) }, "다음 컷"),
      counter);
  };

  // ---- 컷 줄과 고른 컷 도구
  const drawStrip = () => {
    const a = data();
    if (!a) { fill(strip); return; }
    const added = (n) => { if (n) { toast(`컷 ${n}개를 넣었습니다. '저장'하면 게임에 들어갑니다.`, "good"); st.sel = a.frames.length - 1; save(); draw(); } };
    let dragFrom = -1;
    const fps = a.fps || 12;
    const cells = a.frames.map((f, i) => {
      const hold = holdOf(a, i);
      const cell = h("div", { class: "ae-cell" + (!st.playing && i === st.sel ? " sel" : ""), draggable: "true", title: "누르면 이 컷을 고르고, 끌면 순서를 바꿉니다",
        onclick: () => { st.sel = i; st.playing = false; draw(); } },
        h("div", { class: "ae-cell-pic" }, h("img", { src: asset(f), alt: "", draggable: "false" })),
        h("div", { class: "ae-cell-foot" }, h("b", {}, String(i + 1)), h("span", { class: hold > 1 ? "long" : "" }, secs(hold / fps))));
      cell.addEventListener("dragstart", (e) => { dragFrom = i; e.dataTransfer.effectAllowed = "move"; cell.classList.add("dragging"); });
      cell.addEventListener("dragend", () => cell.classList.remove("dragging"));
      cell.addEventListener("dragover", (e) => { e.preventDefault(); cell.classList.add("over"); });
      cell.addEventListener("dragleave", () => cell.classList.remove("over"));
      cell.addEventListener("drop", (e) => {
        e.preventDefault();
        if (dragFrom < 0 || dragFrom === i) return;
        const holds = holdsOf(a);
        const [fr] = a.frames.splice(dragFrom, 1); a.frames.splice(i, 0, fr);
        const [hd] = holds.splice(dragFrom, 1); holds.splice(i, 0, hd);
        a.hold = holds; st.sel = i; st.playing = false; save(); draw();
      });
      return cell;
    });
    cells.push(h("button", { class: "ae-cell ae-add-cell", title: "컷 넣기", onclick: () => addCutsDialog(a, added) }, "＋"));
    const sel = !st.playing && a.frames.length ? Math.min(st.sel, a.frames.length - 1) : -1;
    const move = (to) => { const holds = holdsOf(a); [a.frames[sel], a.frames[to]] = [a.frames[to], a.frames[sel]]; [holds[sel], holds[to]] = [holds[to], holds[sel]]; a.hold = holds; st.sel = to; save(); draw(); };
    const setHold = (v) => { const holds = holdsOf(a); holds[sel] = Math.max(1, Math.min(30, v)); a.hold = holds; save(); draw(); };
    const tools = sel >= 0 ? h("div", { class: "ae-tools" },
      h("b", { class: "ae-tools-title" }, `${sel + 1}번 컷`),
      h("div", { class: "ae-tgroup", title: "이 컷만 더 오래 또는 짧게 보이게 합니다. 눈 깜빡이기 전의 멈춤처럼 쓰입니다." },
        h("span", { class: "ae-label" }, "보이는 시간"),
        h("button", { class: "btn small", disabled: holdOf(a, sel) <= 1, onclick: () => setHold(holdOf(a, sel) - 1) }, "짧게"),
        h("b", { class: "ae-holdv" }, secs(holdOf(a, sel) / fps)),
        h("button", { class: "btn small", onclick: () => setHold(holdOf(a, sel) + 1) }, "길게"),
        h("span", { class: "muted small" }, holdOf(a, sel) > 1 ? `기본의 ${holdOf(a, sel)}배` : "기본")),
      h("div", { class: "ae-tgroup" },
        h("span", { class: "ae-label" }, "순서"),
        h("button", { class: "btn small", disabled: sel === 0, onclick: () => move(sel - 1) }, "왼쪽으로 옮기기"),
        h("button", { class: "btn small", disabled: sel === a.frames.length - 1, onclick: () => move(sel + 1) }, "오른쪽으로 옮기기")),
      h("div", { class: "ae-tgroup" },
        h("button", { class: "btn small", onclick: () => { const holds = holdsOf(a); a.frames.splice(sel + 1, 0, a.frames[sel]); holds.splice(sel + 1, 0, holds[sel]); a.hold = holds; st.sel = sel + 1; save(); draw(); } }, "같은 컷 하나 더"),
        h("button", { class: "btn small", onclick: () => pickFrame((p) => { a.frames[sel] = p; save(); draw(); }, a.frames[sel]) }, "그림 바꾸기")),
      h("span", { class: "spacer" }),
      h("button", { class: "btn small danger", onclick: () => { const holds = holdsOf(a); a.frames.splice(sel, 1); holds.splice(sel, 1); a.hold = holds; st.sel = Math.max(0, sel - 1); save(); draw(); } }, "이 컷 빼기"))
      : h("div", { class: "ae-tools muted small" }, a.frames.length ? "컷을 누르면 여기서 그 컷의 보이는 시간과 순서를 고칩니다. 재생 중이면 멈추고 고릅니다." : "");
    fill(strip,
      h("div", { class: "ae-strip-head" },
        h("b", {}, "컷"), h("span", { class: "muted small" }, a.frames.length ? `${a.frames.length}개. 끌어서 순서를 바꿉니다.` : "아직 없습니다."),
        h("span", { class: "spacer" }),
        h("button", { class: "btn primary small", onclick: () => addCutsDialog(a, added) }, "＋ 컷 넣기")),
      h("div", { class: "ae-cells" }, cells),
      tools);
  };

  const draw = () => { drawList(); drawProps(); drawPlayer(); drawStrip(); };

  root.append(
    h("div", { class: "ae-head" }, h("b", {}, "애니메이션 편집기"),
      h("span", { class: "muted small" }, "컷(그림 한 장)을 차례로 넘겨 움직이는 그림을 만듭니다. 고친 것은 편집기의 '저장'을 누를 때 함께 저장됩니다."),
      h("span", { class: "spacer" }), h("button", { class: "btn", onclick: close }, "닫기")),
    h("div", { class: "ae-body" }, list, h("div", { class: "ae-main" }, stage, player, strip), props));
  document.body.append(root);
  draw();
  raf = requestAnimationFrame(tick);
}

// 컷 하나 고르기: 편집기의 그림 고르기 창을 빌려 쓴다 (editor.js 가 채운다)
export const animHooks = { pickImage: null, afterClose: null };
function pickFrame(onPick, current = "") {
  if (animHooks.pickImage) animHooks.pickImage(current, (p) => { if (p) onPick(p); });
}

// 검사: 애니메이션 자체와, 그것을 쓰는 곳
export function checkAnims(add, imageExists) {
  for (const [id, a] of Object.entries(animsData())) {
    const w = `애니메이션 ${a.name || id}`;
    if (!Array.isArray(a.frames) || !a.frames.length) add("warn", null, null, `${w}: 컷이 하나도 없습니다`);
    (a.frames || []).forEach((f, i) => { if (!imageExists(f)) add("err", null, null, `${w}: ${i + 1}번째 그림 파일이 없습니다`); });
    if (a.loop && !LOOPS.some(([v]) => v === a.loop)) add("err", null, null, `${w}: 반복 방식이 잘못되었습니다`);
  }
}
