// 저장이 부딪쳤을 때 합치기.
// 같은 파일을 두 사람이 고쳤으면, 읽었을 때(base), 내가 고친 것(ours), 그사이 다른 사람이 저장한 것(theirs)을
// 견주어 바뀐 부분끼리 합친다. 둘 다 같은 곳을 다르게 고쳤으면 내 것을 쓰고 그 자리를 conflicts 에 적는다.
// 방 데이터의 objects 처럼 "node" 가 있는 목록은 node 로 짝을 지어 합친다 (순서가 달라도 된다).

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const keyedList = (v) => Array.isArray(v) && v.every((x) => isObj(x) && typeof x.node === "string");

export function merge3(base, ours, theirs, path = "", conflicts = []) {
  if (same(ours, theirs)) return ours;
  if (same(base, ours)) return theirs;      // 나는 안 고침
  if (same(base, theirs)) return ours;      // 다른 사람은 안 고침
  if (isObj(ours) && isObj(theirs)) {
    const b = isObj(base) ? base : {};
    const out = {};
    for (const k of new Set([...Object.keys(theirs), ...Object.keys(ours), ...Object.keys(b)])) {
      const v = merge3(b[k], ours[k], theirs[k], path + "/" + k, conflicts);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (keyedList(ours) && keyedList(theirs) && (base === undefined || keyedList(base))) {
    const map = (l) => new Map((l || []).map((x) => [x.node, x]));
    const bm = map(base), om = map(ours), tm = map(theirs);
    const order = [...tm.keys(), ...[...om.keys()].filter((k) => !tm.has(k))];
    const out = [];
    for (const k of new Set([...order, ...bm.keys()])) {
      const v = merge3(bm.get(k), om.get(k), tm.get(k), path + "[" + k + "]", conflicts);
      if (v !== undefined) out.push(v);
    }
    return out;
  }
  conflicts.push(path || "/");
  return ours;
}
