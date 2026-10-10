// 大元の管理画面：指導員の登録・削除と指導員用QR、教習生の一覧（担当の付け替え）、設定の確認
// 教習生の登録・編集・削除は、担当指導員の管理画面（manage.html）で行う
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "./backend.js";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, serverTimestamp
} from "./backend.js";
import { CFG, app as fbApp, db, esc, toast, sheet, closeSheet, onOverlayClose, friendlyError, lessonMin, doneOf, isPC, viewToggle, onViewChange, pcTable, nextSort, DEMO } from "./common.js";

const auth = getAuth(fbApp);
const root = document.getElementById("app");
const S = { uid: null, tab: "instructors", instructors: [], students: [], filter: "", sort: { k: "name", dir: 1 } };

const instructorUrl = i => `${CFG.appUrl}instructor.html${i.email ? `?e=${encodeURIComponent(i.email)}` : ""}`;
const iname = uid => (S.instructors.find(i => i.uid === uid) || {}).name || "（未設定）";

function renderLogin(msg = "") {
  root.innerHTML = `<section class="panel"><div class="phead"><div><h2>管理者ログイン</h2><small>${esc(CFG.schoolName)}</small></div></div>
  <div class="body"><form onsubmit="return false"><div class="field"><label for="em">メールアドレス</label><input id="em" type="email" autocomplete="username"></div>
  <div class="field"><label for="pw">パスワード</label><input id="pw" type="password" autocomplete="current-password"></div>
  ${msg ? `<div class="banner warn">${esc(msg)}</div>` : ""}<button class="btn primary full" data-act="login">ログイン</button></form></div></section>`;
}
onViewChange(render);
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
  if (!S.uid) return;
  if (isPC()) return renderPC();
  let h = `<div class="topbar noprint"><div><h1>管理画面</h1><small>${esc(CFG.schoolName)}</small></div><button class="linkbtn" data-act="logout">ログアウト</button></div>
  <div class="seg noprint" role="group"><button aria-pressed="${S.tab === "instructors"}" data-act="tab" data-v="instructors">指導員（${S.instructors.length}人）</button><button aria-pressed="${S.tab === "students"}" data-act="tab" data-v="students">教習生（${S.students.length}人）</button><button aria-pressed="${S.tab === "settings"}" data-act="tab" data-v="settings">設定</button></div>`;
  h += S.tab === "students" ? renderStudents() : S.tab === "settings" ? renderSettings() : renderInstructors();
  root.innerHTML = h + `<p class="center noprint">${viewToggle()}</p>`;
}

// PC表示：左にメニュー、右に表。指導員の登録フォームは表の横に並べる
const assignSelect = s => `<select data-act="reassign" data-s="${s.token}" aria-label="${esc(s.name)}の担当">${S.instructors.map(i => `<option value="${esc(i.uid)}" ${i.uid === s.instructorUid ? "selected" : ""}>${esc(i.name)}</option>`).join("")}${S.instructors.some(i => i.uid === s.instructorUid) ? "" : `<option value="" selected>（未設定）</option>`}</select>`;
function renderPC() {
  const nav = [["instructors", `指導員（${S.instructors.length}人）`], ["students", `教習生（${S.students.length}人）`], ["settings", "設定"]];
  let main = "";
  if (S.tab === "instructors") {
    const cols = [
      { k: "name", t: "名前" }, { k: "email", t: "メールアドレス" }, { k: "uid", t: "ユーザーUID" },
      { k: "count", t: "担当", v: i => `${S.students.filter(s => s.instructorUid === i.uid).length}人`, sort: i => S.students.filter(s => s.instructorUid === i.uid).length },
      { t: "", html: i => `<button class="btn" data-act="delInst" data-u="${esc(i.uid)}" style="color:var(--orange)">削除</button>` }
    ];
    main = `<h2>指導員</h2><div style="display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start">
      <div>${pcTable(cols, S.instructors, S.sort)}
        <div class="pctool" style="margin-top:12px"><button class="btn" data-act="printInst" ${S.instructors.length ? "" : "disabled"}>指導員用のQRカードを印刷（${S.instructors.length}人）</button></div></div>
      <section class="panel" style="margin-top:0"><div class="body"><h3 style="margin-top:0">指導員を登録</h3>
        <p style="font-size:12px;color:var(--muted);margin-top:0">ログイン用アカウントは、Firebaseコンソールの Authentication →「ユーザーを追加」で作り、表示された「ユーザーUID」をここに登録します。</p>
        <div class="field"><label for="iu">ユーザーUID</label><input id="iu"></div><div class="field"><label for="in">名前</label><input id="in"></div><div class="field"><label for="ie">メールアドレス</label><input id="ie" type="email"></div>
        <button class="btn primary full" data-act="addInst">登録する</button></div></section></div>`;
  } else if (S.tab === "students") {
    const f = S.filter.trim();
    const list = S.students.filter(s => !f || String(s.name).includes(f) || String(s.nameKana || "").includes(f) || String(s.studentNo).includes(f) || iname(s.instructorUid).includes(f));
    const cols = [
      { k: "studentNo", t: "番号" }, { k: "nameKana", t: "名前", html: s => `${esc(s.name)}<br><small style="color:var(--muted)">${esc(s.nameKana || "")}</small>` }, { k: "stage", t: "段階", v: s => `第${s.stage}段階` }, { k: "license", t: "希望免許" },
      { k: "done", t: "進み具合", v: s => `${doneOf(s)}/${lessonMin(s.stage)}`, sort: s => doneOf(s) / (lessonMin(s.stage) || 1) },
      { k: "deadline", t: "教習期限" }, { k: "karimenExpiry", t: "仮免期限" },
      { k: "active", t: "状態", html: s => s.active === false ? '<span class="tag wait">停止</span>' : '<span class="tag ok">利用中</span>', sort: s => s.active === false ? 1 : 0 },
      { k: "inst", t: "担当", html: assignSelect, sort: s => iname(s.instructorUid) }
    ];
    main = `<h2>教習生</h2><p style="font-size:13px;color:var(--muted);margin-top:-6px">教習生の登録・編集・削除・QRカードの印刷は、各指導員の「教習生の管理」で行います。ここでは全員の確認と、担当の付け替えができます。</p>
      <div class="pctool"><input id="flt" value="${esc(S.filter)}" placeholder="名前・番号・担当で絞り込み" aria-label="絞り込み"><span class="sp"></span><span style="font-size:13px;color:var(--muted)">${list.length}人表示</span></div>
      ${list.length ? pcTable(cols, list, S.sort) : '<div class="loading">教習生がいません</div>'}`;
  } else main = `<h2>設定</h2>${renderSettings().replace('<div class="list">', '<div class="list pcgrid">')}`;
  root.innerHTML = `<div class="pcl"><aside class="pcside noprint"><h1>管理画面</h1><small>${esc(CFG.schoolName)}</small>
    <nav class="pcnav">${nav.map(([v, t]) => `<button aria-pressed="${S.tab === v}" data-act="tab" data-v="${v}">${t}</button>`).join("")}</nav>
    <div class="foot">${viewToggle()}<button class="linkbtn" data-act="logout">ログアウト</button></div></aside>
  <main class="pcmain"><div class="noprint">${main}</div><div id="printArea"></div></main></div>`;
}

function renderStudents() {
  const f = S.filter.trim();
  const list = S.students.filter(s => !f || String(s.name).includes(f) || String(s.nameKana || "").includes(f) || String(s.studentNo).includes(f) || iname(s.instructorUid).includes(f));
  let h = `<section class="panel"><div class="body">
  <div class="banner info">教習生の登録・編集・削除・QRカードの印刷は、各指導員の「教習生の管理」画面で行います。ここでは全員の一覧の確認と、担当の付け替え（指導員が辞める時など）ができます。</div>
  <div class="field" style="margin-top:10px"><label for="flt">絞り込み（名前・番号・担当）</label><input id="flt" value="${esc(S.filter)}"></div>
  <div class="gridwrap"><table class="adm"><thead><tr><th>番号</th><th>名前</th><th>段階</th><th>進み具合</th><th>教習期限</th><th>状態</th><th>担当</th></tr></thead><tbody>`;
  list.forEach(s => {
    h += `<tr><td>${esc(s.studentNo)}</td><td>${esc(s.name)}</td><td>${s.stage}</td><td>${doneOf(s)}/${lessonMin(s.stage)}</td><td>${esc(s.deadline || "")}</td><td>${s.active === false ? '<span class="tag wait">停止</span>' : '<span class="tag ok">利用中</span>'}</td>
    <td>${assignSelect(s)}</td></tr>`;
  });
  h += `</tbody></table></div>${list.length ? "" : '<div class="loading">教習生がいません</div>'}</div></section>`;
  return h;
}

function renderSettings() {
  const fmt = k => `${+k.slice(0, 2)}月${+k.slice(3)}日`, dk = CFG.darkSeason || {};
  const rows = [
    ["学園名", CFG.schoolName], ["学園の電話番号", CFG.schoolTel], ["公開URL", CFG.appUrl],
    ["入力の締切", `毎月${CFG.deadlineDay}日（次月分）。締切後は◯を外せない`],
    ["予約を入れる曜日", CFG.openDays.map(d => "日月火水木金土"[d]).join("・")],
    ["1日の上限", Object.entries(CFG.dailyMax).map(([k, v]) => `第${k}段階 ${v}時限`).join("、")],
    ["最低教習時限", Object.entries(CFG.lessons || {}).map(([k, v]) => `第${k}段階 ${v.min}時限${v.kikenNo ? `（${v.kikenNo}時限目が${(CFG.kiken || {}).label}）` : ""}`).join("、")],
    ["高速教習の組", (CFG.highwaySets || []).map(x => x.join("・")).join("／")],
    ["日没が早い期間", dk.from ? `${fmt(dk.from)}〜${fmt(dk.to)}（警告：高速 ${(dk.sets || []).map(x => x.join("・")).join("／")}、単独高速 ${(dk.hwSoloSets || []).map(x => x.join("・")).join("／")}）` : "なし"],
    ["時限", CFG.periods.slice(1).map((p, i) => `${i + 1}限 ${p[0]}〜${p[1]}`).join("、")]
  ];
  return `<section class="panel"><div class="body"><div class="banner info">いまの設定です。変更したい時は、設定ファイル（js/config.js）を書き換えます。</div>
  <div class="list">${rows.map(([k, v]) => `<div class="item" style="display:block"><div class="s">${esc(k)}</div><div class="t">${esc(v)}</div></div>`).join("")}</div></div></section>`;
}

function renderInstructors() {
  let h = `<section class="panel"><div class="body">
  <div class="banner info">指導員のログイン用アカウントは、Firebaseコンソールの Authentication →「ユーザーを追加」で作り、表示された「ユーザーUID」をここに登録します。</div>
  <div class="list">`;
  S.instructors.forEach(i => { h += `<div class="item"><div><div class="t">${esc(i.name)}</div><div class="s">${esc(i.email || "")}　UID: ${esc(i.uid)}</div><div class="s">${S.students.filter(s => s.instructorUid === i.uid).length}人担当</div></div><button class="btn" data-act="delInst" data-u="${esc(i.uid)}" style="color:var(--orange)">削除</button></div>`; });
  h += `</div><h3>指導員を登録</h3>
  <div class="field"><label for="iu">ユーザーUID</label><input id="iu"></div>
  <div class="row"><div class="field"><label for="in">名前</label><input id="in"></div><div class="field"><label for="ie">メールアドレス</label><input id="ie" type="email"></div></div>
  <button class="btn primary full" data-act="addInst">登録する</button>
  <h3>指導員用のQRカード</h3><p style="font-size:13px;color:var(--muted);margin-top:0">読み取ると指導員の画面（ログイン画面）が開きます。メールアドレスは入力済みの状態で開きます。</p>
  <button class="btn full" data-act="printInst" ${S.instructors.length ? "" : "disabled"}>指導員用のQRカードを印刷（${S.instructors.length}人）</button></div></section>`;
  h += `<div id="printArea"></div>`;
  return h;
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

document.addEventListener("input", e => { if (e.target.id === "flt") { S.filter = e.target.value; const pos = e.target.selectionStart; render(); const f = document.getElementById("flt"); f.focus(); f.setSelectionRange(pos, pos); } });
document.addEventListener("change", async e => {
  if (e.target.dataset.act !== "reassign") return;
  const s = S.students.find(x => x.token === e.target.dataset.s), uid = e.target.value;
  if (!uid || !confirm(`${s.name}さんの担当を${iname(uid)}さんに変えます。すでに入っている予約は、前の担当のまま残ります。よろしいですか？`)) { render(); return; }
  try { await updateDoc(doc(db, "students", s.token), { instructorUid: uid }); await loadAll(); toast("担当を変えました"); } catch (err) { toast(friendlyError(err)); }
});
document.addEventListener("click", async e => {
  if (onOverlayClose(e)) return;
  const t = e.target.closest("[data-act]"); if (!t || t.dataset.act === "reassign") return;
  const a = t.dataset.act;
  try {
    if (a === "login") { try { await signInWithEmailAndPassword(auth, document.getElementById("em").value.trim(), document.getElementById("pw").value); } catch (err) { renderLogin("メールアドレスかパスワードが違います。"); } }
    else if (a === "logout") await signOut(auth);
    else if (a === "tab") { S.tab = t.dataset.v; S.sort = { k: t.dataset.v === "instructors" ? "name" : "studentNo", dir: 1 }; render(); }
    else if (a === "sort") { S.sort = nextSort(S.sort, t.dataset.k); render(); }
    else if (a === "printInst") printInstructorCards();
    else if (a === "doPrint") window.print();
    else if (a === "delInst") {
      const i = S.instructors.find(x => x.uid === t.dataset.u), n = S.students.filter(x => x.instructorUid === i.uid).length;
      if (n) return toast(`${i.name}さんの担当の教習生が${n}人います。先に「教習生」タブで担当を付け替えてください`);
      if (!confirm(`${i.name}さんを指導員から削除します。よろしいですか？（ログイン用アカウントは、Firebaseコンソールの Authentication で削除してください）`)) return;
      await deleteDoc(doc(db, "instructors", i.uid)); await loadAll(); toast("削除しました");
    }
    else if (a === "addInst") {
      const uid = document.getElementById("iu").value.trim(), name = document.getElementById("in").value.trim(), email = document.getElementById("ie").value.trim();
      if (!uid || !name) return toast("UIDと名前は必須です");
      await setDoc(doc(db, "instructors", uid), { name, email, createdAt: serverTimestamp() });
      await loadAll(); toast("登録しました");
    }
  } catch (err) { toast(friendlyError(err)); }
});
