// 새 물건 만들기 / 그림 올리기.
// 새 물건은 방 데이터의 "create" 로 저장되고, 게임이 방을 열 때 만든다 (씬을 고치지 않아도 됨).
//   {"node": "Walls/Front/N_abc", "name": "새 상자", "create": {"kind": "hotspot", "rect": [x, y, 가로, 세로], "texture": "...", "item": "..."}}
import { snapV, snapOn } from "./core.js";
import { S, h, toast, modal, names, roomData, markDirty, syncCreated, addImage, setGameName, IMAGE_DIR, CREATE_KIND, catRoom } from "./core.js";
import { ui, renderPanel } from "./editor.js";

const MIN = 16;   // 너무 작은 물건은 만들지 않는다 (게임 화면 기준 px)

// 게임 화면 좌표 (1920x1080 기준).
// 끄는 도중에 화면이 다시 그려지면(이름 칸을 벗어나며 저장 등) 원래 무대가 문서에서 빠져 크기가 0 이 된다.
// 그래서 누를 때의 무대 크기(box)를 끝까지 쓴다.
function toGame(stage, e, box = null) {
  const r = box || stage.getBoundingClientRect();
  const [W, H] = S.catalog.screen;
  if (!r.width || !r.height) return [NaN, NaN];
  return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
}
const finite = (r) => Array.isArray(r) && r.length === 4 && r.every((v) => Number.isFinite(v));
const round = (v) => Math.round(v);

// 무대에 붙이기: 그리기, 옮기기, 크기 바꾸기
export function attachStage(stage, view) {
  if (S.drawing) {
    stage.classList.add("drawing");
    let start = null, box = null, frame = null;
    stage.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      frame = stage.getBoundingClientRect();
      start = toGame(stage, e, frame).map((v) => snapV(v, e));
      if (stage.snapGrid) stage.snapGrid.hidden = !snapOn(e);
      box = h("div", { class: "draw-box" });
      stage.append(box);
    });
    const move = (e) => {
      if (!start) return;
      const [x, y] = toGame(stage, e, frame).map((v) => snapV(v, e));
      if (stage.snapGrid) stage.snapGrid.hidden = !snapOn(e);
      const [W, H] = S.catalog.screen;
      const l = Math.min(x, start[0]), t = Math.min(y, start[1]);
      Object.assign(box.style, { left: l / W * 100 + "%", top: t / H * 100 + "%", width: Math.abs(x - start[0]) / W * 100 + "%", height: Math.abs(y - start[1]) / H * 100 + "%" });
    };
    const up = (e) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (!start) return;
      if (stage.snapGrid) stage.snapGrid.hidden = true;
      const [x, y] = toGame(stage, e, frame).map((v) => snapV(v, e));
      const rect = [round(Math.min(x, start[0])), round(Math.min(y, start[1])), round(Math.abs(x - start[0])), round(Math.abs(y - start[1]))];
      start = null;
      if (!finite(rect)) { box.remove(); return toast("다시 그려 주세요.", "warn"); }
      if (rect[2] < MIN || rect[3] < MIN) { box.remove(); return toast("너무 작습니다. 조금 더 크게 그려 주세요.", "warn"); }
      createObject(view, rect);
    };
    stage.addEventListener("mousedown", () => { window.addEventListener("mousemove", move); window.addEventListener("mouseup", up); });
  }
}

let counter = 0;
function newNodeName(view) {
  const used = new Set(view.nodes.map((n) => n.name));
  let name;
  do { name = "N_" + Date.now().toString(36) + (counter++).toString(36); } while (used.has(name));
  return name;
}

function createObject(view, rect) {
  const d = roomData();
  d.objects = d.objects || [];
  const count = d.objects.filter((o) => o.create).length + 1;
  const obj = { node: `${view.path}/${newNodeName(view)}`, name: `새 물건 ${count}`, create: { kind: "hotspot", rect } };
  d.objects.push(obj);
  S.drawing = false;
  markDirty();
  syncCreated();
  ui.select(obj.node);
  toast("새 물건을 만들었습니다. 끌어서 옮기고, 파란 모서리로 크기를 바꿀 수 있습니다. 오른쪽에서 이름, 종류, 그림, 누르면 할 일을 정하세요.", "good", 6000);
}

// 물건 칸: 직접 만든 물건이면 종류, 그림, 위치
export function createdSection(n, obj, onCh, section, input, imagePicker) {
  if (!obj.create) return null;
  const c = obj.create;
  const redo = () => { onCh(); syncCreated(); ui.renderStage(); renderPanel(); };
  return section("직접 만든 물건", "편집기에서 그린 물건입니다. 위치와 크기는 화면에서 끌거나, 아래 배치 칸에서 바꿉니다.",
    h("label", { class: "field" }, h("span", {}, "종류"),
      h("select", { onchange: (e) => { c.kind = e.target.value; if (c.kind !== "pickup") delete c.item; if (c.kind === "image") delete obj.rules; redo(); } },
        Object.entries(CREATE_KIND).map(([k, label]) => h("option", { value: k, selected: (c.kind || "hotspot") === k }, label)))),
    c.kind === "pickup" ? h("label", { class: "field" }, h("span", {}, "줍는 아이템"), input({ key: "item", type: "item" }, c, redo)) : null,
    h("label", { class: "field" }, h("span", {}, c.kind === "pickup" ? "그림 (비우면 아이템 그림)" : c.kind === "image" ? "그림" : "그림 (비우면 보이지 않는 누르는 곳)"), imagePicker(c, "texture", redo)),
    h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!c.flip, onchange: (e) => { if (e.target.checked) c.flip = true; else delete c.flip; redo(); } }), " 좌우 뒤집기"));
}

// ------------------------------------------------------------------ 그림 올리기

// 파일 이름 → 저장소에 둘 이름 (영어/숫자만. 한글 이름은 따로 기억해서 편집기에 보인다)
function safeName(file) {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace("jpeg", "jpg");
  const base = file.name.replace(/\.[^.]+$/, "").normalize("NFKD").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  let name = `${base || "img"}_${Date.now().toString(36)}.${ext}`;
  return IMAGE_DIR + name;
}

// 그림 올리기: 파일을 고르면 미리 보기 창에서 흰 배경 지우기와 크기 줄이기를 고른 뒤 올린다.
//   화면 그림 칸은 가로 1720, 세로 1080 입니다 (오른쪽 200은 가방 자리).
export const SCREEN_W = 1720, SCREEN_H = 1080;
export function uploadImage(onDone) {
  const inp = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", style: { display: "none" } });
  inp.addEventListener("change", () => {
    const file = inp.files[0];
    inp.remove();
    if (!file) return;
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) return toast("PNG, JPG, WEBP 그림만 올릴 수 있습니다.", "bad");
    if (file.size > 12 * 1024 * 1024) return toast("그림이 너무 큽니다 (12MB 까지). 크기를 줄여서 올려 주세요.", "bad", 8000);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => uploadDialog(file, String(reader.result), img, onDone);
      img.onerror = () => toast("그림을 읽지 못했습니다.", "bad");
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
  document.body.append(inp);
  inp.click();
}

// 흰색(에 가까운) 바깥 배경을 투명하게: 가장자리에서 이어진 흰 부분만 지운다 (물건 안의 흰색은 남는다)
function clearWhite(ctx, w, hgt, tol = 28) {
  const im = ctx.getImageData(0, 0, w, hgt);
  const d = im.data;
  const white = (i) => d[i] > 255 - tol && d[i + 1] > 255 - tol && d[i + 2] > 255 - tol;
  const seen = new Uint8Array(w * hgt);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (hgt - 1) * w + x);
  for (let y = 0; y < hgt; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const k = stack.pop();
    if (seen[k]) continue;
    seen[k] = 1;
    if (!white(k * 4)) continue;
    d[k * 4 + 3] = 0;
    const x = k % w, y = (k - x) / w;
    if (x > 0) stack.push(k - 1);
    if (x < w - 1) stack.push(k + 1);
    if (y > 0) stack.push(k - w);
    if (y < hgt - 1) stack.push(k + w);
  }
  ctx.putImageData(im, 0, 0);
}

function uploadDialog(file, dataUrl, img, onDone) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const big = W > SCREEN_W || H > SCREEN_H;
  const opt = { white: false, shrink: big };
  const preview = h("canvas", { class: "up-preview" });
  const info = h("p", { class: "help small" });
  const render = () => {
    const scale = opt.shrink ? Math.min(1, SCREEN_W / W, SCREEN_H / H) : 1;
    const w = Math.round(W * scale), hh = Math.round(H * scale);
    preview.width = w; preview.height = hh;
    const ctx = preview.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, w, hh);
    ctx.drawImage(img, 0, 0, w, hh);
    if (opt.white) clearWhite(ctx, w, hh);
    info.textContent = `${W} x ${H}` + (scale < 1 ? `에서 ${w} x ${hh}로 줄여서 올립니다.` : " 그대로 올립니다.");
  };
  const check = (key, label, hint) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: opt[key], onchange: (e) => { opt[key] = e.target.checked; render(); } }), " ", label, hint ? h("span", { class: "muted small" }, "  " + hint) : null);
  render();
  modal("그림 올리기", h("div", { class: "upload-box" },
    h("div", { class: "up-stage" }, preview),
    info,
    check("white", "흰 배경을 투명하게", "그림 가장자리와 이어진 흰 부분만 지웁니다. 물건 그림에 쓰세요."),
    check("shrink", "화면 크기에 맞게 줄이기", `방 배경은 가로 ${SCREEN_W}, 세로 ${SCREEN_H}이면 꼭 맞습니다.`),
    h("p", { class: "help small" }, "방 화면의 오른쪽 200은 게임에서 가방이 놓이는 자리라 배경이 덮이지 않습니다.")), [
    { label: "취소", onclick: (c) => c() },
    { label: "올리기", kind: "primary", onclick: (c) => {
      c();
      const changed = opt.white || (opt.shrink && big);
      let base64, name = file;
      if (changed) {
        // 투명이 필요하면 PNG, 아니면 원래 형식(JPG는 JPG로 작게)
        const png = opt.white || !/\.jpe?g$/i.test(file.name);
        base64 = preview.toDataURL(png ? "image/png" : "image/jpeg", 0.88).split(",")[1];
        name = { name: file.name.replace(/\.[^.]+$/, png ? ".png" : ".jpg") };
      } else base64 = dataUrl.split(",")[1];
      const path = safeName(name);
      addImage(path, base64, true);
      setGameName("files", "res://" + path, file.name.replace(/\.[^.]+$/, ""));
      if (base64.length * 0.75 > 1024 * 1024) toast("그림이 1MB 보다 커서 게임이 느려질 수 있습니다. '화면 크기에 맞게 줄이기'를 켜거나 JPG로 올려 보세요.", "warn", 9000);
      onDone("res://" + path);
    } },
  ]);
}
