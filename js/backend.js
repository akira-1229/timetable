// 本番（Firebase）とデモモード（見本データ）を切り替える窓口
// config.js の demo が true ならデモ用の仮データベース、false ならFirebaseを使う
const V = "10.12.2", G = `https://www.gstatic.com/firebasejs/${V}`;
export const DEMO = self.APP_CONFIG.demo === true;

const demo = DEMO ? await import("./demo-db.js") : null;
const appMod = demo || await import(`${G}/firebase-app.js`);
const fsMod = demo || await import(`${G}/firebase-firestore.js`);
const authMod = demo || await import(`${G}/firebase-auth.js`);
const msgMod = demo || await import(`${G}/firebase-messaging.js`);

export const { initializeApp } = appMod;
export const {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, collection, collectionGroup,
  query, where, serverTimestamp, writeBatch, Timestamp, onSnapshot
} = fsMod;
export const { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } = authMod;
export const { getMessaging, getToken, isSupported, onMessage } = msgMod;
export const resetDemo = demo ? demo.resetDemo : () => { };
export const DEMO_USERS = demo ? demo.DEMO_USERS : {};
