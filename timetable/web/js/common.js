// 共通部品：Firebaseの初期化、日付、画面の小物、プッシュ通知
import { initializeApp } from "./backend.js";
import { getFirestore } from "./backend.js";
import { getMessaging, getToken, isSupported, onMessage } from "./backend.js";

export { DEMO, DEMO_USERS, resetDemo } from "./backend.js";
import { DEMO } from "./backend.js";
export const CFG = self.APP_CONFIG;
export const app = initializeApp(CFG.firebase);
export const db = getFirestore(app);
export const WD = ["日", "月", "火", "水", "木", "金", "土"];
export const P = CFG.periods;

/* ---------- 日付 ---------- */
export const pad = n => String(n).padStart(2, "0");
export const ymOf = (y, m) => `${y}-${pad(m)}`;                      // m は 1〜12
export const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
export const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
export const daysIn = (y, m) => new Date(y, m, 0).getDate();
export const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
export const md = s => { const d = parseDate(s); return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`; };
export const label = (s, p) => `${md(s)} ${p}限`;
export const slotKey = (day, p) => `${day}-${p}`;                    // 月ごとの空き時間の保存キー

/* ---------- 画面の小物 ---------- */
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
let toastTimer;
export function toast(t) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = t; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 3000);
}
export function sheet(html) {
  let ov = document.getElementById("overlay");
  if (!ov) { ov = document.createElement("div"); ov.id = "overlay"; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="sheet-bg" data-act="close"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
}
export function closeSheet() { const ov = document.getElementById("overlay"); if (ov) ov.innerHTML = ""; }
export function onOverlayClose(e) {
  const t = e.target.closest('[data-act="close"]');
  if (t && (e.target === t || t.tagName === "BUTTON")) { closeSheet(); return true; }
  return false;
}
export function friendlyError(e) {
  console.error(e);
  const c = e && e.code || "";
  if (c.includes("permission-denied")) return "権限がありません。事務所にお問い合わせください。";
  if (c.includes("unavailable")) return "通信できませんでした。電波の良い場所でもう一度お試しください。";
  if (c.includes("failed-precondition")) return "準備中のデータがあります（索引の作成待ち）。数分後にもう一度お試しください。";
  return "エラーが起きました。もう一度お試しください。";
}

/* ---------- プッシュ通知 ---------- */
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

// 通知を有効にして、端末のトークンを saveToken に渡す
export async function enablePush(saveToken) {
  if (DEMO) return { ok: false, reason: "demo" };
  if (isIOS() && !isStandalone()) return { ok: false, reason: "ios-home" };
  if (!("Notification" in window) || !(await isSupported())) return { ok: false, reason: "unsupported" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "denied" };
  const reg = await navigator.serviceWorker.register("./firebase-messaging-sw.js", { scope: "./" });
  await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: CFG.vapidKey, serviceWorkerRegistration: reg });
  if (!token) return { ok: false, reason: "no-token" };
  await saveToken(token);
  listenForeground();
  return { ok: true };
}
let listening = false;
export async function listenForeground(onMsg) {
  if (DEMO) return;
  if (listening || !(await isSupported())) return;
  listening = true;
  onMessage(getMessaging(app), p => {
    const n = p.notification || {};
    toast(`${n.title || "お知らせ"}：${n.body || ""}`);
    if (onMsg) onMsg(p);
  });
}
export function pushReasonText(r) {
  return {
    "ios-home": "iPhoneでは、まず画面下の共有ボタン →「ホーム画面に追加」をして、ホーム画面のアイコンから開き直してください。",
    "unsupported": "この端末・ブラウザは通知に対応していません。iPhoneはiOS 16.4以降が必要です。",
    "denied": "通知が許可されませんでした。端末の設定から、このアプリの通知をオンにしてください。",
    "no-token": "通知の準備ができませんでした。時間をおいてもう一度お試しください。",
    "demo": "デモモードのため、通知は届きません（本番ではスマホに届きます）。"
  }[r] || "通知を有効にできませんでした。";
}

/* ---------- デモモードの表示 ---------- */
if (DEMO && typeof document !== "undefined") {
  const put = () => document.body.insertAdjacentHTML("afterbegin",
    `<div class="noprint" style="background:#FDF5D6;color:#5A4500;font-size:12px;text-align:center;padding:6px 10px;border-bottom:1px solid #E5C04A">デモモード：見本データで動いています。入力した内容はこの端末の中だけに保存されます。 <a href="./index.html" style="color:#5A4500;font-weight:700">デモの入口へ</a></div>`);
  document.body ? put() : document.addEventListener("DOMContentLoaded", put);
}
