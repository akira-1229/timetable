// 教習生の画面：空き時間の登録、予約の確認、キャンセル希望、通知の設定
import {
  doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, getDocs, serverTimestamp
} from "./backend.js";
import {
  CFG, db, WD, P, ymOf, dateStr, parseDate, daysIn, today, md, label, slotKey, esc, toast, sheet, closeSheet,
  onOverlayClose, friendlyError, enablePush, pushReasonText, isIOS, isStandalone, listenForeground
} from "./common.js";

const app = document.getElementById("app");

// QRのURL（?t=）から本人のキーを取り出す。ホーム画面から開いた時のために端末にも控える
const params = new URLSearchParams(location.search);
let T = params.get("t");
try { if (T) localStorage.setItem("timetable_t", T); else T = localStorage.getItem("timetable_t"); } catch (e) { }

const now = today();
const MONTHS = [
  { y: now.getFullYear(), m: now.getMonth() + 1 },
  { y: new Date(now.getFullYear(), now.getMonth() + 1, 1).getFullYear(), m: new Date(now.getFullYear(), now.getMonth() + 1, 1).getMonth() + 1 }
];
const S = { tab: "cal", mi: 1, student: null, avail: {}, bookings: [], saveTimers: {}, bulkW: new Set(), bulkP: new Set() };

async function load() {
  if (!T) return fail("QRコードから開いてください。QRコードが手元にない場合は、事務所にお問い合わせください。");
  try {
    const sdoc = await getDoc(doc(db, "students", T));
    if (!sdoc.exists()) return fail("このQRコードは使えなくなっています。事務所で新しいQRコードを受け取ってください。");
    S.student = sdoc.data();
    if (S.student.active === false) return fail("現在、このアカウントは利用できません。事務所にお問い合わせください。");
    for (const { y, m } of MONTHS) {
      const md_ = await getDoc(doc(db, "students", T, "months", ymOf(y, m)));
      S.avail[ymOf(y, m)] = new Set(md_.exists() ? md_.data().slots || [] : []);
    }
    const bq = query(collection(db, "students", T, "bookings"), where("status", "in", ["confirmed", "cancelled"]));
    S.bookings = (await getDocs(bq)).docs.map(d => ({ id: d.id, ...d.data() }));
    S.mi = nextMonthFilled() ? 0 : 1;
    render();
    listenForeground(() => load());
  } catch (e) { fail(friendlyError(e)); }
}
function fail(msg) { app.innerHTML = `<div class="err">${esc(msg)}</div>`; }

const nextYm = () => ymOf(MONTHS[1].y, MONTHS[1].m);
const nextMonthFilled = () => (S.avail[nextYm()] || new Set()).size > 0;
const isLate = ym => ym === nextYm() && now.getDate() > CFG.deadlineDay;
function confirmedAt(ds, p) { return S.bookings.find(b => b.status === "confirmed" && b.date === ds && b.period === p); }
function unacked() {
  const n = S.student.lastNotifiedAt, a = S.student.ackAt;
  return n && (!a || n.toMillis() > a.toMillis());
}

function render() {
  const st = S.student;
  let h = `<div class="topbar"><div><h1>${esc(CFG.schoolName)}</h1><small>${esc(st.name)} さん</small></div>
    <button class="linkbtn" data-act="push">通知の設定</button></div>
  <section class="panel"><div class="tabs" role="tablist">
    <button role="tab" aria-selected="${S.tab === "cal"}" data-act="tab" data-v="cal">空き時間</button>
    <button role="tab" aria-selected="${S.tab === "book"}" data-act="tab" data-v="book">予約${unacked() ? '<span class="dot">!</span>' : ""}</button>
  </div><div class="body">`;
  h += S.tab === "cal" ? renderCal() : renderBook();
  app.innerHTML = h + `</div></section>`;
}

function renderCal() {
  const { y, m } = MONTHS[S.mi]; const ym = ymOf(y, m); const set = S.avail[ym];
  const nm = MONTHS[1];
  let h = "";
  if (S.mi === 1) {
    h += nextMonthFilled()
      ? `<div class="banner ok">${nm.m}月分は入力済みです。${now.getDate() <= CFG.deadlineDay ? `締切の${MONTHS[0].m}月${CFG.deadlineDay}日までは何度でも変更できます。` : "予約が入っていない枠は変更できます。"}</div>`
      : `<div class="banner warn"><b>${nm.m}月分の入力締切は${MONTHS[0].m}月${CFG.deadlineDay}日です。</b><br>空いている時間帯をタップして◯を付けてください。</div>`;
  } else {
    h += `<div class="banner info">予約が入っていない枠は、いつでも変更できます。タップするとすぐ保存されます。</div>`;
  }
  h += `<div class="months">${MONTHS.map((x, i) => `<button class="chip" aria-pressed="${S.mi === i}" data-act="month" data-v="${i}">${x.m}月</button>`).join("")}</div>`;
  h += `<div class="gridwrap"><table class="cal"><thead><tr><th></th>`;
  for (let p = 1; p <= 10; p++) h += `<th scope="col">${p}</th>`;
  h += `</tr></thead><tbody>`;
  const start = S.mi === 0 ? now.getDate() : 1;
  for (let d = start; d <= daysIn(y, m); d++) {
    const ds = dateStr(new Date(y, m - 1, d)); const w = parseDate(ds).getDay();
    h += `<tr><th scope="row" class="day ${w === 6 ? "sat" : w === 0 ? "sun" : ""}">${d}(${WD[w]})</th>`;
    for (let p = 1; p <= 10; p++) {
      const b = confirmedAt(ds, p);
      if (b) {
        h += `<td><button class="cell ${b.cancelRequested ? "req" : "booked"}" data-act="locked" data-id="${b.id}" aria-label="${label(ds, p)} 予約済み">予</button></td>`;
      } else {
        const on = set.has(slotKey(d, p));
        h += `<td><button class="cell ${on ? "on" : ""}" data-act="toggle" data-d="${d}" data-p="${p}" aria-pressed="${on}" aria-label="${label(ds, p)}">${on ? "◯" : ""}</button></td>`;
      }
    }
    h += `</tr>`;
  }
  h += `</tbody></table></div>
  <div class="legend"><span><i class="sw" style="background:var(--blue);border-color:var(--blue)"></i>空いている</span><span><i class="sw" style="background:var(--orange-soft);border-color:var(--orange)"></i>予約済み（変更不可）</span><span><i class="sw"></i>空いていない</span></div>
  <div class="tools">${S.mi === 1 ? `<button class="btn" data-act="copy">今月と同じにする</button>` : "<span></span>"}<button class="btn" data-act="bulk">曜日でまとめて選ぶ</button></div>`;
  return h;
}

function renderBook() {
  const t0 = dateStr(now);
  const up = S.bookings.filter(b => b.status === "confirmed" && b.date >= t0).sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);
  const can = S.bookings.filter(b => b.status === "cancelled" && b.date >= t0);
  let h = "";
  if (!up.length) h += `<div class="banner info">これからの予約はまだありません。指導員が予約を確定すると、ここに表示され通知が届きます。</div>`;
  else {
    h += `<h3 style="margin-top:0">これからの予約</h3><div class="list">`;
    up.forEach(b => {
      h += `<div class="item"><div><div class="t">${label(b.date, b.period)}</div><div class="s">${P[b.period][0]}〜${P[b.period][1]}${b.lessonType === "kiken" ? `・${esc((CFG.kiken || {}).label || "危険予測")}` : b.highway ? "・高速教習" : ""}</div></div>${b.cancelRequested ? '<span class="tag wait">キャンセル希望中</span>' : ""}</div>`;
    });
    h += `</div>`;
  }
  if (unacked()) h += `<button class="btn primary full" style="margin-top:12px" data-act="ack">確認しました</button>`;
  else if (up.length) h += `<div class="banner ok" style="margin-top:12px">確認済みです。</div>`;
  if (can.length) {
    h += `<h3>取り消しになった予約</h3><div class="hist">${can.map(b => `<div>${label(b.date, b.period)}</div>`).join("")}</div>`;
  }
  h += `<p style="font-size:12px;color:var(--muted);margin-top:16px">正式な予定はこの画面の表示です。通知はお知らせとして届きます。</p>`;
  return h;
}

/* ---------- 保存 ---------- */
function scheduleSave(ym) {
  clearTimeout(S.saveTimers[ym]);
  S.saveTimers[ym] = setTimeout(async () => {
    try {
      await setDoc(doc(db, "students", T, "months", ym), { slots: [...S.avail[ym]], updatedAt: serverTimestamp(), late: isLate(ym) });
    } catch (e) { toast(friendlyError(e)); }
  }, 700);
}

/* ---------- 操作 ---------- */
function bulkSheet() {
  let h = `<h3>曜日でまとめて選ぶ（${MONTHS[S.mi].m}月）</h3><div style="font-size:13px;font-weight:700;margin-bottom:6px">曜日</div><div class="chips">`;
  [1, 2, 3, 4, 5, 6, 0].forEach(w => { h += `<button class="chip" aria-pressed="${S.bulkW.has(w)}" data-act="bw" data-v="${w}">${WD[w]}</button>`; });
  h += `</div><div style="font-size:13px;font-weight:700;margin:10px 0 6px">時限</div><div class="chips" style="flex-wrap:wrap">`;
  for (let p = 1; p <= 10; p++) h += `<button class="chip" aria-pressed="${S.bulkP.has(p)}" data-act="bp" data-v="${p}">${p}限</button>`;
  h += `</div><div class="tools" style="margin-top:14px"><button class="btn" data-act="close">閉じる</button><button class="btn primary" data-act="bulkApply">◯を付ける</button></div>`;
  sheet(h);
}

document.addEventListener("click", async e => {
  if (onOverlayClose(e)) return;
  const t = e.target.closest("[data-act]"); if (!t) return;
  const a = t.dataset.act;
  if (a === "tab") { S.tab = t.dataset.v; render(); }
  else if (a === "month") { S.mi = +t.dataset.v; render(); }
  else if (a === "toggle") {
    const { y, m } = MONTHS[S.mi]; const ym = ymOf(y, m); const k = slotKey(+t.dataset.d, +t.dataset.p);
    S.avail[ym].has(k) ? S.avail[ym].delete(k) : S.avail[ym].add(k);
    render(); scheduleSave(ym);
  }
  else if (a === "copy") {
    // 今月の曜日ごとのパターン（よく◯が付いている時限）を来月に写す
    const cur = MONTHS[0], nx = MONTHS[1]; const pat = {};
    for (let d = 1; d <= daysIn(cur.y, cur.m); d++) {
      const w = new Date(cur.y, cur.m - 1, d).getDay();
      for (let p = 1; p <= 10; p++) if (S.avail[ymOf(cur.y, cur.m)].has(slotKey(d, p))) { pat[w] = pat[w] || {}; pat[w][p] = (pat[w][p] || 0) + 1; }
    }
    const ym = ymOf(nx.y, nx.m); let n = 0;
    for (let d = 1; d <= daysIn(nx.y, nx.m); d++) {
      const w = new Date(nx.y, nx.m - 1, d).getDay();
      Object.entries(pat[w] || {}).forEach(([p, c]) => { if (c >= 2) { S.avail[ym].add(slotKey(d, +p)); n++; } });
    }
    render(); scheduleSave(ym); toast(n ? "今月と同じ曜日・時限に◯を付けました" : "今月の入力が少ないため、写せる予定がありませんでした");
  }
  else if (a === "bulk") { S.bulkW = new Set(); S.bulkP = new Set(); bulkSheet(); }
  else if (a === "bw") { const v = +t.dataset.v; S.bulkW.has(v) ? S.bulkW.delete(v) : S.bulkW.add(v); bulkSheet(); }
  else if (a === "bp") { const v = +t.dataset.v; S.bulkP.has(v) ? S.bulkP.delete(v) : S.bulkP.add(v); bulkSheet(); }
  else if (a === "bulkApply") {
    const { y, m } = MONTHS[S.mi]; const ym = ymOf(y, m); let n = 0;
    for (let d = 1; d <= daysIn(y, m); d++) if (S.bulkW.has(new Date(y, m - 1, d).getDay())) S.bulkP.forEach(p => {
      const ds = dateStr(new Date(y, m - 1, d)); if (!confirmedAt(ds, p)) { S.avail[ym].add(slotKey(d, p)); n++; }
    });
    closeSheet(); render(); if (n) scheduleSave(ym); toast(n ? `${n}枠に◯を付けました` : "曜日と時限を選んでください");
  }
  else if (a === "locked") {
    const b = S.bookings.find(x => x.id === t.dataset.id);
    sheet(`<h3>この枠は予約済みです</h3><p>${label(b.date, b.period)}（${P[b.period][0]}〜）${b.lessonType === "kiken" ? `<br>${esc((CFG.kiken || {}).label || "危険予測")}（2時限連続のため、キャンセルは2時限まとめてになります）` : ""}<br><span style="color:var(--muted);font-size:13px">予約済みの枠は、この画面からは外せません。</span></p>
      ${b.cancelRequested ? '<div class="banner warn">キャンセル希望を送信済みです。指導員の確認を待っています。</div><button class="btn full" data-act="close">閉じる</button>'
        : `<div class="list"><button class="btn accent full" data-act="reqCancel" data-id="${b.id}">キャンセル希望を送る</button><a class="btn full center" style="text-decoration:none;display:block;line-height:22px" href="tel:${esc(CFG.schoolTel)}">学園に電話する</a><button class="btn full" data-act="close">閉じる</button></div>`}`);
  }
  else if (a === "reqCancel") {
    const b = S.bookings.find(x => x.id === t.dataset.id); t.disabled = true;
    try {
      await updateDoc(doc(db, "students", T, "bookings", b.id), { cancelRequested: true, cancelRequestedAt: serverTimestamp() });
      await addDoc(collection(db, "outbox"), {
        to: "instructor", type: "cancelRequest", studentToken: T, instructorUid: S.student.instructorUid,
        title: "キャンセル希望", body: `${S.student.name}さん ${label(b.date, b.period)}`, createdAt: serverTimestamp(), sent: false
      });
      b.cancelRequested = true; closeSheet(); render(); toast("キャンセル希望を送りました");
    } catch (err) { toast(friendlyError(err)); t.disabled = false; }
  }
  else if (a === "ack") {
    try { await updateDoc(doc(db, "students", T), { ackAt: serverTimestamp() }); S.student.ackAt = { toMillis: () => Date.now() }; render(); toast("確認しました"); }
    catch (err) { toast(friendlyError(err)); }
  }
  else if (a === "push") {
    const ios = isIOS() && !isStandalone();
    sheet(`<h3>通知の設定</h3><p style="font-size:14px">予約が決まった時や変更があった時に、スマホに通知が届きます。</p>
      ${ios ? `<div class="banner warn">iPhoneの場合は先に、画面下の共有ボタン →「ホーム画面に追加」をしてください。追加したアイコンから開くと、通知を受け取れるようになります。</div>` : ""}
      <div class="list"><button class="btn primary full" data-act="pushOn">通知を受け取る</button><button class="btn full" data-act="close">閉じる</button></div>`);
  }
  else if (a === "pushOn") {
    t.disabled = true;
    try {
      const r = await enablePush(async tok => {
        const cur = S.student.fcmTokens || [];
        if (cur.includes(tok)) return;
        const next = [...cur, tok].slice(-CFG.maxFcmTokens);
        await updateDoc(doc(db, "students", T), { fcmTokens: next });
        S.student.fcmTokens = next;
      });
      closeSheet(); toast(r.ok ? "通知を受け取れるようになりました" : pushReasonText(r.reason));
    } catch (err) { closeSheet(); toast(friendlyError(err)); }
  }
});

load();
