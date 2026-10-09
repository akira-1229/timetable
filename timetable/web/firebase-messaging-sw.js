// プッシュ通知を受け取るための裏方（サービスワーカー）
// 通知の表示と、タップした時に画面を開く動きは、Firebaseが自動で行う
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
importScripts("./js/config.js");

firebase.initializeApp(self.APP_CONFIG.firebase);
firebase.messaging();
