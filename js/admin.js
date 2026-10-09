// 管理者の画面：指導員の登録、教習生の登録・編集、QRカードの印刷、QRの再発行、削除
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "./backend.js";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, serverTimestamp, writeBatch
} from "./backend.js";
import { CFG, app as fbApp, db, esc, toast, sheet, closeSheet, onOverlayClose, friendlyError , DEMO } from "./common.js";

const auth = getAuth(fbApp);
const root = document.getElementById("app");
const S = { uid: null, tab: "students", instructors: [], students: [], sel: new Set(), filter: "" };

function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const studentUrl = tok => `${CFG.appUrl}student.html?t=${encodeURIComponent(tok)}`;
const instructorUrl = i => `${CFG.appUrl}instructor.html${i.email ? `?e=${encodeURIComponent(i.email)}` : ""}`;
const iname = uid => (S.instructors.find(i => i.uid === uid) || {}).name || "（未設定）";

function renderLogin(msg = "") {
  root.innerHTML = `<section class="panel"><div class="phead"><div><h2>管理者ログイン</h2><small>${esc(CFG.schoolName)}</small></div></div>
  <div class="body">${DEMO ? `<div class="banner info">デモ用のログイン：管理者：<b>admin@demo</b>（パスワードは何でもOK）</div>` : ""}<form onsubmit="return false"><div class="field"><label for="em">メールアドレス</label><input id="em" type="email" autocomplete="username"></div>
  <div class="field"><label for="pw">パスワード</label><input id="pw" type="password" autocomplete="current-password"></div>
  ${msg ? `<div class="banner warn">${esc(msg)}</div>` : ""}<button class="btn primary full" data-act="login">ログイン</button></form></div></section>`;
}
onAuthStateChanged(auth, async user => {
  if (!user) { renderLogin(); return; }
  S.uid = user.uid;
  try {
    const a = await getDoc(doc(db, "admins", user.uid));
    if (!a.exists()) { await signOut(auth); renderLogin("管理者として登録されていません。"); return; }
    await loadAll();
  } catch (e) { renderLogin(friendlyError(e)); }
});

async function loadAll() {
  S.instructors = (await getDocs(collection(db, "instructors"))).docs.map(d => ({ uid: d.id, ...d.data() }));
  S.students = (await getDocs(collection(db, "students"))).docs.map(d => ({ token: d.id, ...d.data() }))
    .sort((a, b) => String(a.studentNo || "").localeCompare(String(b.studentNo || "")));
  render();
}

function render() {
  let h = `<div class="topbar noprint"><div><h1>管理画面</h1><small>${esc(CFG.schoolName)}</small></div><button class="linkbtn" data-act="logout">ログアウト</button></div>
  <div class="seg noprint" role="group"><button aria-pressed="${S.tab === "students"}" data-act="tab" data-v="students">教習生（${S.students.length}人）</button><button aria-pressed="${S.tab === "instructors"}" data-act="tab" data-v="instructors">指導員（${S.instructors.length}人）</button></div>`;
  h += S.tab === "students" ? renderStudents() : renderInstructors();
  root.innerHTML = h;
}

function renderStudents() {
  const f = S.filter.trim();
  const list = S.students.filter(s => !f || String(s.name).includes(f) || String(s.studentNo).includes(f) || iname(s.instructorUid).includes(f));
  let h = `<section class="panel noprint"><div class="body">
  <div class="tools" style="grid-template-columns:1fr 1fr 1fr"><button class="btn primary" data-act="new">教習生を追加</button><button class="btn" data-act="print" ${S.sel.size ? "" : "disabled"}>QRカードを印刷（${S.sel.size}人）</button><button class="btn" data-act="selAll">表示中を全選択</button></div>
  <div class="field" style="margin-top:10px"><label for="flt">絞り込み（名前・番号・担当）</label><input id="flt" value="${esc(S.filter)}"></div>
  <div class="gridwrap"><table class="adm"><thead><tr><th></th><th>番号</th><th>名前</th><th>段階</th><th>担当</th><th>教習期限</th><th>状態</th><th></th></tr></thead><tbody>`;
  list.forEach(s => {
    h += `<tr><td><input type="checkbox" data-act="sel" data-s="${s.token}" ${S.sel.has(s.token) ? "checked" : ""} aria-label="選択"></td><td>${esc(s.studentNo)}</td><td>${esc(s.name)}</td><td>${s.stage}</td><td>${esc(iname(s.instructorUid))}</td><td>${esc(s.deadline || "")}</td><td>${s.active === false ? '<span class="tag wait">停止</span>' : '<span class="tag ok">利用中</span>'}</td><td><button class="btn" data-act="edit" data-s="${s.token}">編集</button></td></tr>`;
  });
  h += `</tbody></table></div>${list.length ? "" : '<div class="loading">教習生がいません</div>'}</div></section>`;
  h += `<div id="printArea"></div>`;
  return h;
}

function renderInstructors() {
  let h = `<section class="panel"><div class="body">
  <div class="banner info">指導員のログイン用アカウントは、Firebaseコンソールの Authentication →「ユーザーを追加」で作り、表示された「ユーザーUID」をここに登録します。</div>
  <div class="list">`;
  S.instructors.forEach(i => { h += `<div class="item"><div><div class="t">${esc(i.name)}</div><div class="s">${esc(i.email || "")}　UID: ${esc(i.uid)}</div></div><span class="s">${S.students.filter(s => s.instructorUid === i.uid && s.active !== false).length}人担当</span></div>`; });
  h += `</div><h3>指導員を登録</h3>
  <div class="field"><label for="iu">ユーザーUID</label><input id="iu"></div>
  <div class="row"><div class="field"><label for="in">名前</label><input id="in"></div><div class="field"><label for="ie">メールアドレス</label><input id="ie" type="email"></div></div>
  <button class="btn primary full" data-act="addInst">登録する</button>
  <h3>指導員用のQRカード</h3><p style="font-size:13px;color:var(--muted);margin-top:0">読み取ると指導員の画面（ログイン画面）が開きます。メールアドレスは入力済みの状態で開きます。</p>
  <button class="btn full" data-act="printInst" ${S.instructors.length ? "" : "disabled"}>指導員用のQRカードを印刷（${S.instructors.length}人）</button></div></section>`;
  h += `<div id="printArea"></div>`;
  return h;
}

function editSheet(s) {
  const isNew = !s; s = s || { studentNo: "", name: "", stage: 1, instructorUid: "", deadline: "", active: true };
  sheet(`<h3>${isNew ? "教習生を追加" : "教習生を編集"}</h3>
  <div class="row"><div class="field"><label for="f_no">教習生番号</label><input id="f_no" value="${esc(s.studentNo)}"></div>
  <div class="field"><label for="f_nm">名前</label><input id="f_nm" value="${esc(s.name)}"></div></div>
  <div class="row"><div class="field"><label for="f_st">段階</label><select id="f_st"><option value="1" ${s.stage == 1 ? "selected" : ""}>第1段階</option><option value="2" ${s.stage == 2 ? "selected" : ""}>第2段階</option></select></div>
  <div class="field"><label for="f_in">担当指導員</label><select id="f_in"><option value="">選んでください</option>${S.instructors.map(i => `<option value="${esc(i.uid)}" ${i.uid === s.instructorUid ? "selected" : ""}>${esc(i.name)}</option>`).join("")}</select></div></div>
  <div class="row"><div class="field"><label for="f_dl">教習期限</label><input id="f_dl" type="date" value="${esc(s.deadline || "")}"></div>
  <div class="field"><label for="f_ac">状態</label><select id="f_ac"><option value="1" ${s.active !== false ? "selected" : ""}>利用中</option><option value="0" ${s.active === false ? "selected" : ""}>停止</option></select></div></div>
  <div class="list"><button class="btn primary full" data-act="save" data-s="${isNew ? "" : s.token}">保存する</button>
  ${isNew ? "" : `<button class="btn full" data-act="reissue" data-s="${s.token}">QRコードを再発行する（古いQRは使えなくなります）</button><button class="btn full" data-act="del" data-s="${s.token}" style="color:var(--orange)">この教習生のデータを削除する</button>`}
  <button class="btn full" data-act="close">閉じる</button></div>`);
}

async function copySub(fromTok, toTok, sub, batch) {
  const snap = await getDocs(collection(db, "students", fromTok, sub));
  snap.docs.forEach(d => { batch.set(doc(db, "students", toTok, sub, d.id), d.data()); batch.delete(d.ref); });
}
async function deleteStudent(tok) {
  const batch = writeBatch(db);
  for (const sub of ["months", "bookings"]) (await getDocs(collection(db, "students", tok, sub))).docs.forEach(d => batch.delete(d.ref));
  batch.delete(doc(db, "students", tok));
  await batch.commit();
}

function printInstructorCards() {
  const area = document.getElementById("printArea");
  area.innerHTML = `<div class="noprint banner info" style="margin-top:12px">カードを確認して、印刷画面から印刷してください。<button class="btn" data-act="doPrint" style="margin-left:8px">印刷する</button></div>
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">${S.instructors.map(i => `
  <div style="border:1.5px dashed #9AA3AE;border-radius:10px;padding:12px;display:flex;gap:12px;align-items:center;break-inside:avoid;background:#fff;color:#1F2A37">
    <div class="qr" data-url="${esc(instructorUrl(i))}" style="width:120px;height:120px;flex-shrink:0"></div>
    <div style="font-size:12px;line-height:1.5"><b style="font-size:14px">${esc(i.name)} 指導員</b><br>予約の割り当てはこちら<br>① スマホのカメラで読み取る<br>② ホーム画面に追加<br>③ ログインして「通知」をオン<br><span style="color:#4B5563">${esc(CFG.schoolName)}</span></div>
  </div>`).join("")}</div>`;
  area.querySelectorAll(".qr").forEach(el => new QRCode(el, { text: el.dataset.url, width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M }));
  area.scrollIntoView({ behavior: "smooth" });
}

function printCards() {
  const list = S.students.filter(s => S.sel.has(s.token));
  const area = document.getElementById("printArea");
  area.innerHTML = `<div class="noprint banner info" style="margin-top:12px">カードを確認して、印刷画面から印刷してください。<button class="btn" data-act="doPrint" style="margin-left:8px">印刷する</button></div>
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">${list.map(s => `
  <div style="border:1.5px dashed #9AA3AE;border-radius:10px;padding:12px;display:flex;gap:12px;align-items:center;break-inside:avoid;background:#fff;color:#1F2A37">
    <div class="qr" data-url="${esc(studentUrl(s.token))}" style="width:120px;height:120px;flex-shrink:0"></div>
    <div style="font-size:12px;line-height:1.5"><b style="font-size:14px">${esc(s.name)} さん</b><br>空き時間の登録はこちら<br>① スマホのカメラで読み取る<br>② ホーム画面に追加<br>③「通知の設定」で通知をオン<br><span style="color:#4B5563">このQRは他の人に見せないでください<br>${esc(CFG.schoolName)}</span></div>
  </div>`).join("")}</div>`;
  area.querySelectorAll(".qr").forEach(el => new QRCode(el, { text: el.dataset.url, width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M }));
  area.scrollIntoView({ behavior: "smooth" });
}

document.addEventListener("input", e => { if (e.target.id === "flt") { S.filter = e.target.value; const pos = e.target.selectionStart; render(); const f = document.getElementById("flt"); f.focus(); f.setSelectionRange(pos, pos); } });
document.addEventListener("change", e => { if (e.target.dataset.act === "sel") { const k = e.target.dataset.s; e.target.checked ? S.sel.add(k) : S.sel.delete(k); render(); } });
document.addEventListener("click", async e => {
  if (onOverlayClose(e)) return;
  const t = e.target.closest("[data-act]"); if (!t || t.dataset.act === "sel") return;
  const a = t.dataset.act;
  try {
    if (a === "login") { try { await signInWithEmailAndPassword(auth, document.getElementById("em").value.trim(), document.getElementById("pw").value); } catch (err) { renderLogin("メールアドレスかパスワードが違います。"); } }
    else if (a === "logout") await signOut(auth);
    else if (a === "tab") { S.tab = t.dataset.v; render(); }
    else if (a === "new") editSheet(null);
    else if (a === "printInst") printInstructorCards();
    else if (a === "edit") editSheet(S.students.find(s => s.token === t.dataset.s));
    else if (a === "selAll") { document.querySelectorAll('[data-act="sel"]').forEach(c => S.sel.add(c.dataset.s)); render(); }
    else if (a === "print") { printCards(); }
    else if (a === "doPrint") window.print();
    else if (a === "save") {
      const data = {
        studentNo: document.getElementById("f_no").value.trim(), name: document.getElementById("f_nm").value.trim(),
        stage: +document.getElementById("f_st").value, instructorUid: document.getElementById("f_in").value,
        deadline: document.getElementById("f_dl").value || null, active: document.getElementById("f_ac").value === "1"
      };
      if (!data.name || !data.instructorUid) return toast("名前と担当指導員は必須です");
      t.disabled = true;
      if (t.dataset.s) await updateDoc(doc(db, "students", t.dataset.s), data);
      else await setDoc(doc(db, "students", newToken()), { ...data, createdAt: serverTimestamp() });
      closeSheet(); await loadAll(); toast("保存しました");
    }
    else if (a === "reissue") {
      if (!confirm("QRコードを再発行します。古いQRコードは使えなくなります。よろしいですか？")) return;
      const old = t.dataset.s; const nt = newToken(); t.disabled = true;
      const sd = await getDoc(doc(db, "students", old));
      const batch = writeBatch(db);
      const data = sd.data(); delete data.fcmTokens;            // 通知の登録はやり直してもらう
      batch.set(doc(db, "students", nt), { ...data, reissuedAt: serverTimestamp() });
      await copySub(old, nt, "months", batch); await copySub(old, nt, "bookings", batch);
      batch.delete(doc(db, "students", old));
      await batch.commit();
      S.sel = new Set([nt]); closeSheet(); await loadAll(); printCards(); toast("再発行しました。新しいQRカードを渡してください");
    }
    else if (a === "del") {
      if (!confirm("この教習生の空き時間・予約を含むすべてのデータを削除します。元に戻せません。よろしいですか？")) return;
      t.disabled = true; await deleteStudent(t.dataset.s); S.sel.delete(t.dataset.s); closeSheet(); await loadAll(); toast("削除しました");
    }
    else if (a === "addInst") {
      const uid = document.getElementById("iu").value.trim(), name = document.getElementById("in").value.trim(), email = document.getElementById("ie").value.trim();
      if (!uid || !name) return toast("UIDと名前は必須です");
      await setDoc(doc(db, "instructors", uid), { name, email, createdAt: serverTimestamp() });
      await loadAll(); toast("登録しました");
    }
  } catch (err) { toast(friendlyError(err)); }
});
