// =============================================================
// デモモード用の仮のデータベース（Firebaseの代わり）
// ・見本データ入り。このブラウザの中だけに保存される（他の端末とは共有されない）
// ・config.js の demo を false にすると使われなくなる
// =============================================================
const KEY = "timetable_demo_db_v1";
const SKEY = "timetable_demo_user";

export class Timestamp {
  constructor(ms) { this.ms = ms; }
  toMillis() { return this.ms; }
  toDate() { return new Date(this.ms); }
  static now() { return new Timestamp(Date.now()); }
}

/* ---------- 保存と読み込み ---------- */
let DB = new Map();
const enc = v => v instanceof Timestamp ? { __ts: v.ms } : Array.isArray(v) ? v.map(enc) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) : v;
const dec = v => v && typeof v === "object" && "__ts" in v ? new Timestamp(v.__ts) : Array.isArray(v) ? v.map(dec) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dec(x)])) : v;
function persist() { try { localStorage.setItem(KEY, JSON.stringify([...DB].map(([k, v]) => [k, enc(v)]))); } catch (e) { } }
function restore() {
  try { const raw = localStorage.getItem(KEY); if (raw) { DB = new Map(JSON.parse(raw).map(([k, v]) => [k, dec(v)])); return true; } } catch (e) { }
  return false;
}
export function resetDemo() { localStorage.removeItem(KEY); sessionStorage.removeItem(SKEY); DB = new Map(); seed(); persist(); }

/* ---------- 見本データ ---------- */
export const DEMO_USERS = {
  "admin@demo": { uid: "DEMO_ADMIN", name: "管理者" },
  "yamada@demo": { uid: "DEMO_T1", name: "山田" },
  "sato@demo": { uid: "DEMO_T2", name: "佐藤" }
};
const SUR = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤", "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村", "林", "斎藤", "清水",
  "山崎", "森", "池田", "橋本", "阿部", "石川", "山下", "中島", "石井", "小川", "前田", "岡田", "長谷川", "藤田", "後藤", "近藤", "村上", "遠藤", "青木", "坂本",
  "斉藤", "福田", "太田", "西村", "藤井", "金子", "岡本", "藤原", "中野", "三浦", "原田", "中川", "松田", "竹内", "小野", "田村", "中山", "和田", "石田", "森田",
  "上田", "原", "内田", "柴田", "酒井", "宮崎", "横山", "高木", "安藤", "宮本"];
const GIV = ["蓮", "陽翔", "結衣", "葵", "大翔", "さくら", "湊", "美咲", "悠真", "凛", "颯", "陽菜", "樹", "芽依", "蒼", "莉子", "優斗", "彩花", "翔太", "ひなた"];
const pad = n => String(n).padStart(2, "0");
function seed() {
  let x = 20261001; const r = () => (x = (x * 9301 + 49297) % 233280) / 233280;
  DB.set("admins/DEMO_ADMIN", { note: "デモ管理者" });
  DB.set("instructors/DEMO_T1", { name: "山田", email: "yamada@demo" });
  DB.set("instructors/DEMO_T2", { name: "佐藤", email: "sato@demo" });
  const now = new Date(); const months = [0, 1].map(i => new Date(now.getFullYear(), now.getMonth() + i, 1));
  for (let i = 0; i < 70; i++) {
    const tok = `demo-${pad(i + 1)}`;
    const dl = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 20 + Math.floor(r() * 150));
    DB.set(`students/${tok}`, {
      studentNo: `D${pad(i + 1)}`, name: `${SUR[i]} ${GIV[i % GIV.length]}`, stage: r() < 0.5 ? 1 : 2,
      instructorUid: i < 35 ? "DEMO_T1" : "DEMO_T2", deadline: `${dl.getFullYear()}-${pad(dl.getMonth() + 1)}-${pad(dl.getDate())}`, active: true
    });
    const evening = r() < 0.5;             // 平日は夕方以降しか来られない人
    months.forEach((m, mi) => {
      if (mi === 1 && r() < 0.3) return;    // 次月分がまだ未入力の人
      const slots = []; const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      for (let d = 1; d <= days; d++) {
        const w = new Date(m.getFullYear(), m.getMonth(), d).getDay(); const weekday = w >= 1 && w <= 5;
        for (let p = 1; p <= 10; p++) { const base = weekday && evening ? (p >= 7 ? 0.55 : 0.05) : 0.24; if (r() < base) slots.push(`${d}-${p}`); }
      }
      DB.set(`students/${tok}/months/${m.getFullYear()}-${pad(m.getMonth() + 1)}`, { slots, late: false });
    });
  }
}
if (!restore()) { seed(); persist(); }

/* ---------- Firestoreのまね ---------- */
const P = s => s.join("/");
const rid = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
function mkDoc(path) { const seg = path.split("/"); return { type: "doc", path, id: seg.at(-1), parent: { id: seg.at(-2), parent: { id: seg.at(-3) } } }; }
const clone = o => o == null ? o : JSON.parse(JSON.stringify(enc(o)), (k, v) => v);
const out = o => o == null ? o : dec(clone(o));
export const getFirestore = () => ({});
export function doc(first, ...segs) {
  if (first && first.type === "col" && segs.length === 0) return mkDoc(`${first.path}/${rid()}`);
  if (first && first.type === "col") return mkDoc(`${first.path}/${P(segs)}`);
  return mkDoc(P(segs));
}
export const collection = (db, ...segs) => ({ type: "col", path: P(segs) });
export const collectionGroup = (db, id) => ({ type: "group", id });
export const where = (f, op, v) => ({ f, op, v });
export const query = (c, ...w) => ({ ...c, w });
export const serverTimestamp = () => Timestamp.now();
export const arrayUnion = (...v) => ({ __union: v });
const delay = () => new Promise(r => setTimeout(r, 60));
export async function getDoc(r) { await delay(); return { id: r.id, ref: r, exists: () => DB.has(r.path), data: () => out(DB.get(r.path)) }; }
export async function getDocs(q) {
  await delay(); const res = [];
  for (const [p, d] of DB) {
    const seg = p.split("/");
    if (q.type === "col") { if (seg.slice(0, -1).join("/") !== q.path) continue; }
    else if (seg.at(-2) !== q.id || seg.length % 2) continue;
    if ((q.w || []).every(w => w.op === "==" ? d[w.f] === w.v : w.op === "in" ? w.v.includes(d[w.f]) : true))
      res.push({ id: seg.at(-1), ref: mkDoc(p), data: () => out(d) });
  }
  return { docs: res, size: res.length, empty: !res.length };
}
const merge = (cur, d) => { const n = { ...cur }; Object.entries(d).forEach(([k, v]) => { n[k] = v && v.__union ? [...new Set([...(cur[k] || []), ...v.__union])] : v; }); return n; };
export async function setDoc(r, d) { DB.set(r.path, merge({}, d)); persist(); }
export async function updateDoc(r, d) { if (!DB.has(r.path)) throw Object.assign(new Error("not found"), { code: "not-found" }); DB.set(r.path, merge(DB.get(r.path), d)); persist(); }
export async function addDoc(c, d) { const r = mkDoc(`${c.path}/${rid()}`); DB.set(r.path, merge({}, d)); persist(); return r; }
export async function deleteDoc(r) { DB.delete(r.path); persist(); }
export function writeBatch() {
  const ops = [];
  return {
    set: (r, d) => ops.push(() => DB.set(r.path, merge({}, d))),
    update: (r, d) => ops.push(() => DB.set(r.path, merge(DB.get(r.path) || {}, d))),
    delete: r => ops.push(() => DB.delete(r.path)),
    commit: async () => { await delay(); ops.forEach(o => o()); persist(); }
  };
}

/* ---------- ログインのまね ---------- */
let cbs = [];
const current = () => { try { const u = sessionStorage.getItem(SKEY); return u ? { uid: u } : null; } catch (e) { return null; } };
export const getAuth = () => ({});
export function onAuthStateChanged(auth, cb) { cbs.push(cb); setTimeout(() => cb(current()), 0); return () => { cbs = cbs.filter(x => x !== cb); }; }
export async function signInWithEmailAndPassword(auth, email) {
  const u = DEMO_USERS[String(email).trim().toLowerCase()];
  if (!u) throw Object.assign(new Error("user-not-found"), { code: "auth/user-not-found" });
  sessionStorage.setItem(SKEY, u.uid); cbs.forEach(cb => cb({ uid: u.uid }));
}
export async function signOut() { sessionStorage.removeItem(SKEY); cbs.forEach(cb => cb(null)); }

/* ---------- その他 ---------- */
export const initializeApp = () => ({});
export const getMessaging = () => ({});
export const getToken = async () => null;
export const isSupported = async () => false;
export const onMessage = () => () => { };
