import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-analytics.js";
import { 
    getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, query, where, orderBy, onSnapshot 
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// إعدادات مشروعك الجديد في فايربيس
const firebaseConfig = {
    apiKey: "AIzaSyCL9zqgCRTCrnbg72rUomdzx1ib5pYQ8IU",
    authDomain: "ahmd-mobily2026-ac9f6.firebaseapp.com",
    projectId: "ahmd-mobily2026-ac9f6",
    storageBucket: "ahmd-mobily2026-ac9f6.firebasestorage.app",
    messagingSenderId: "1045524430900",
    appId: "1:1045524430900:web:71b59563362224a4bd8a61",
    measurementId: "G-3CFX0Z9SPB"
};

// تهيئة التطبيق والخدمات
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// تصدير المتغيرات والدوال لتصبح متاحة في باقي ملفات المشروع
export { 
    app, analytics, db, 
    collection, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, query, where, orderBy, onSnapshot 
};