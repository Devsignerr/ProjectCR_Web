// 저장 기록: 언제 누가 무엇을 저장했는지 보고, 원하는 시점의 방으로 되돌린다.
// 되돌리기는 그 시점의 내용을 편집기에 불러올 뿐이다. 확인한 뒤 '저장'해야 실제로 바뀐다.
import { S, h, toast, names, markDirty, LOCAL, ROOM_DIR, GAME_FILE, hooks } from "./core.js";
import { josa } from "./words.js";
import { renderPanel } from "./editor.js";

const fileLabel = (p) => p === GAME_FILE ? "게임 공통 (아이템, 조합, 힌트 포함)" : p.startsWith(ROOM_DIR) ? names.room(p.slice(ROOM_DIR.length).replace(".json", "")) : null;

export function historyPanel() {
  const box = h("div", {},
    h("h2", {}, "저장 기록"),
    h("p", { class: "help" }, "최근 저장부터 보입니다. 누르면 무엇이 바뀌었는지 보이고, 그 시점의 모습으로 되돌릴 수 있습니다. 되돌린 내용은 편집기에 들어오기만 하고, 확인 후 '저장'해야 실제로 바뀝니다."));
  if (LOCAL || !S.gh) { box.append(h("p", { class: "muted" }, "시험 모드에서는 기록을 볼 수 없습니다.")); return box; }
  const list = h("div", { class: "history-list" }, h("p", { class: "muted" }, "불러오는 중…"));
  box.append(list);
  S.gh.history().then((commits) => {
    list.replaceChildren(...commits.map((c) => commitRow(c)));
    if (!commits.length) list.append(h("p", { class: "muted" }, "(기록 없음)"));
  }).catch((e) => list.replaceChildren(h("p", { class: "bad-text" }, "기록을 불러오지 못했습니다: " + e.message)));
  return box;
}

function commitRow(c) {
  const when = new Date(c.commit.author.date).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const who = c.commit.author.name || "?";
  const msg = c.commit.message.split("\n")[0].replace(/^방 편집기: /, "");
  const body = h("div", { class: "history-body" });
  const det = h("details", { class: "history-item", ontoggle: () => { if (det.open && !body.childElementCount) load(); } },
    h("summary", {}, h("span", { class: "muted" }, when), " ", h("b", {}, who), ": ", msg), body);
  const load = async () => {
    body.append(h("p", { class: "muted" }, "불러오는 중…"));
    try {
      const { files, parent } = await S.gh.commitFiles(c.sha);
      body.replaceChildren(...files.map((f) => {
        const label = fileLabel(f.path);
        if (!label) return h("div", { class: "muted small" }, `${f.path} (편집기 밖의 파일)`);
        return h("div", { class: "history-file" },
          h("span", {}, label, h("span", { class: "muted" }, ` (+${f.add} −${f.del})`)),
          h("span", { class: "spacer" }),
          parent ? h("button", { class: "ghost small", title: "이 저장이 일어나기 바로 전의 모습", onclick: () => restore(f.path, parent, `${when} 저장 전`) }, "이 저장 전으로") : null,
          h("button", { class: "ghost small", title: "이 저장을 마친 직후의 모습", onclick: () => restore(f.path, c.sha, `${when} 저장 직후`) }, "이 저장 직후로"));
      }));
    } catch (e) {
      body.replaceChildren(h("p", { class: "bad-text" }, "불러오지 못했습니다: " + e.message));
    }
  };
  return det;
}

async function restore(path, ref, label) {
  try {
    const text = await S.gh.readAt(path, ref);
    if (text === null) return toast("그 시점에는 이 파일이 없었습니다.", "warn");
    const data = JSON.parse(text);
    if (!S.files[path]) S.files[path] = { data, sha: null, dirty: true, orig: null };
    else S.files[path].data = data;
    markDirty(path);
    hooks.afterChange();
    renderPanel();
    toast(`${josa(fileLabel(path), "을/를")} ${label} 모습으로 불러왔습니다. 확인한 뒤 '저장'을 누르면 실제로 되돌아갑니다 (되돌리기로 취소할 수 있습니다).`, "good", 9000);
  } catch (e) {
    toast("되돌리지 못했습니다: " + e.message, "bad");
  }
}
