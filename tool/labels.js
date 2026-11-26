// 영어 이름(씬 노드, 파일, 일어난 일)을 한글로 자동으로 바꿔 보여 준다.
// 사람이 붙인 한글 이름이 있으면 그것이 먼저다 (core.js 의 names). 여기는 이름이 없을 때 쓰는 자동 이름.
// 모르는 단어가 있으면 영어를 그대로 보이지 않고 종류 이름(예: "누르는 물건")으로 대신한다.

const WORDS = {
  // 가구 / 물건
  armchair: "안락의자", bed: "침대", birdcage: "새장", bookcase: "책장", bookshelf: "책장", book: "책", box: "상자",
  cabinet: "수납장", candle: "초", candlestick: "촛대", carpet: "카펫", chair: "의자", chest: "궤짝", clock: "시계",
  closet: "옷장", curtain: "커튼", desk: "책상", door: "문", drawer: "서랍", dresser: "서랍장", fireplace: "벽난로",
  frame: "액자", lamp: "등", letter: "편지", lock: "자물쇠", mirror: "거울", note: "쪽지", painting: "그림",
  perfume: "향수병", picture: "사진", pillow: "베개", portrait: "초상화", puzzle: "퍼즐", roundtable: "둥근 탁자",
  rug: "러그", safe: "금고", shelf: "선반", sidetable: "협탁", stair: "계단", stairs: "계단", statue: "조각상",
  table: "탁자", vanity: "화장대", vase: "꽃병", wardrobe: "옷장", wall: "벽", window: "창문", doll: "인형",
  // 아이템
  coin: "동전", crown: "왕관", key: "열쇠", match: "성냥", orb: "구슬", ring: "반지", map: "지도", photo: "사진",
  // 사람
  girl: "소녀", boy: "소년", man: "남자", woman: "여자", cat: "고양이", dog: "개", bird: "새",
  // 화면
  bg: "배경", background: "배경", front: "앞쪽", back: "뒤쪽", left: "왼쪽", right: "오른쪽", up: "위", down: "아래", arrow: "화살표", inven: "가방", inventory: "가방",
  zoomview: "크게 보기", closeup: "크게 보기", zoom: "크게 보기", guide: "안내 글", title: "제목", label: "글자",
  // 퍼즐 / 장치
  board: "판", button: "버튼", code: "암호", dial: "다이얼", lever: "레버", maze: "미로", sequence: "순서",
  socket: "받침대", switch: "스위치", red: "빨간", blue: "파란", green: "초록", yellow: "노란", dark: "어두운",
  // 상태 (일어난 일)
  open: "열림", opened: "열림", closed: "닫힘", lifted: "들춤", solved: "풀림", revealed: "나타남",
  colored: "색칠됨", unfolded: "펼침", placed: "놓음", seen: "봄", shadow: "그림자", castle: "성", all: "모두",
  lit: "불 붙음", on: "켜짐", off: "꺼짐", found: "찾음", used: "씀", broken: "부서짐", sample: "예시",
  // 소리
  zoomview: "크게 보기", sidetable: "협탁", contents: "안에 든 것", shade: "어두운 막", item: "아이템", when: "",
  whenallsolved: "모두 풀렸는지 보기", codeonwall: "벽의 암호", view: "화면", side: "옆", round: "둥근",
  rotary: "회전 고리", slide: "미끄럼", feather: "깃털", button2: "단추",
  horror: "공포", stinger: "효과음", metal: "쇠", cage: "새장", shake: "흔들림", sound: "소리",
};

// 이름에 붙는 앞말: 뜻은 없고 분류용
WORDS.__group = "묶음";
const PREFIXES = ["IA", "IT", "UI", "SE", "SFX", "BGM", "CS", "S"];

// "MetalCageShake" / "metalcageshake" → 아는 단어로 쪼개기 (가장 긴 단어부터)
const ADJ = new Set(["빨간", "파란", "초록", "노란", "어두운", "둥근"]);

function splitWords(token) {
  const whole = token.toLowerCase();
  if (WORDS[whole] !== undefined) return [whole];
  if (whole.endsWith("s") && WORDS[whole.slice(0, -1)]) return [whole.slice(0, -1), "__group"];
  const parts = token.replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/);
  const out = [];
  for (const p of parts) {
    let s = p.toLowerCase();
    while (s) {
      let hit = null;
      for (let n = s.length; n > 1; n--) if (WORDS[s.slice(0, n)] !== undefined) { hit = s.slice(0, n); break; }
      if (!hit) return null;   // 모르는 단어
      out.push(hit);
      s = s.slice(hit.length);
    }
  }
  return out;
}

// "IA_Bed01_Ba" → { words: ["침대"], num: 1, part: "Ba" }
function parse(raw) {
  let tokens = String(raw || "").split(/[_\s-]+/).filter(Boolean);
  if (tokens.length > 1 && PREFIXES.includes(tokens[0])) tokens = tokens.slice(1);
  const words = [];
  let num = null, part = "";
  for (const t of tokens) {
    const m = t.match(/^([A-Za-z]*?)(\d+)$/);
    if (/^[가-힣0-9 ]+$/.test(t)) { words.push(t); continue; }          // 이미 한글
    if (m) {
      if (m[1]) { const w = splitWords(m[1]); if (!w) return null; words.push(...w.map((x) => WORDS[x])); }
      num = parseInt(m[2], 10);
      continue;
    }
    if (/^(zoom)?[A-Z][a-z]?$/.test(t) || /^zoom[A-Z][a-z]?$/.test(t)) { part = t.replace(/^zoom/, ""); continue; }   // A, Ba, zoomC 같은 조각 표시
    const w = splitWords(t);
    if (!w) return null;
    words.push(...w.map((x) => WORDS[x]));
  }
  return { words, num, part };
}

// 조각 표시(A, B, Ba ...)를 숫자로: A→1, Ba→2-1
function partNumber(part) {
  if (!part) return "";
  return [...part].map((ch) => ch.toUpperCase().charCodeAt(0) - 64).join("-");
}

// 노드 / 화면 이름 → 한글. 모르면 null.
// numbered: 같은 이름에 번호만 다른 것이 또 있으면 1번에도 번호를 붙인다.
export function autoName(raw, numbered = false) {
  const p = parse(raw);
  if (!p) return null;
  let w = [...new Set(p.words.filter(Boolean))];
  if (!w.length) return null;
  w = [...w.filter((x) => ADJ.has(x)), ...w.filter((x) => !ADJ.has(x))];        // 꾸미는 말을 앞으로 (구슬 빨간 → 빨간 구슬)
  if (w[0] === "배경" && w.length > 1) w = [...w.slice(1), "배경"];               // 배경 앞쪽 → 앞쪽 배경
  let s = w.join(" ").replace("크게 보기 화면", "크게 보기");
  if (p.num && (p.num > 1 || numbered)) s += " " + p.num;
  if (p.part) s += ` (부분 ${partNumber(p.part)})`;
  return s;
}

// 일어난 일 (예: bed01_lifted, visited_Room01)
export function autoFlag(raw, roomName = (id) => id) {
  const s = String(raw || "");
  const v = s.match(/^visited_(.+)$/);
  if (v) return `${roomName(v[1])}에 가 봄`;
  const words = [];
  for (const t of s.split("_").filter(Boolean)) {
    if (/^[가-힣0-9 ]+$/.test(t)) { words.push(t); continue; }
    const m = t.match(/^([A-Za-z]*?)(\d+)$/);
    if (m) {
      if (m[1]) { const w = splitWords(m[1]); if (!w) return null; words.push(...w.map((x) => WORDS[x])); }
      continue;   // 01 같은 번호는 뺀다
    }
    if (/^[a-z]$/i.test(t)) { words.push(String(t.toUpperCase().charCodeAt(0) - 64) + "번"); continue; }
    const w = splitWords(t);
    if (!w) return null;
    words.push(...w.map((x) => WORDS[x]));
  }
  return words.length ? words.join(" ") : null;
}

// 방 아이디 (Room01 → 1번 방)
export function autoRoom(id) {
  const m = String(id || "").match(/^Room0*(\d+)$/i);
  if (m) return `${m[1]}번 방`;
  return autoName(id) ? autoName(id) + " 방" : "이름 없는 방";
}

// 파일 (res://Audio/SE_Metalcageshake01.wav → 쇠 새장 흔들림)
export function autoFile(path) {
  const base = String(path || "").split("/").pop().replace(/\.[^.]+$/, "");
  return autoName(base);
}

// 번호만 다른 같은 이름이 여럿인지 알아보는 열쇠 (IA_Curtain01 → IA_Curtain)
export const baseKey = (raw) => String(raw || "").replace(/d+(_[A-Za-z]+)?$/, "");

export const hasLatin = (s) => /[A-Za-z]/.test(String(s || ""));
