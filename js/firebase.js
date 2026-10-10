// Firebase Web SDK setup. Uses modular CDN imports; no build step is required.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDDvwRByxQqh7oO5m8J44xIuWIfGf5lCwY",
  authDomain: "events2026-80620.firebaseapp.com",
  projectId: "events2026-80620",
  storageBucket: "events2026-80620.firebasestorage.app",
  messagingSenderId: "468960104625",
  appId: "1:468960104625:web:f17dd0596fad714d4c5290",
  measurementId: "G-S9V60V048V"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);