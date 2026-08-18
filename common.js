// Jörmuntösk – gemeinsame Basis für alle Web-Tools
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCyLmY1kfzjbs6iXBnjQd-bkc5iQXFZcDo",
  authDomain: "jormuntosk-81dad.firebaseapp.com",
  projectId: "jormuntosk-81dad",
  storageBucket: "jormuntosk-81dad.firebasestorage.app",
  messagingSenderId: "63425046416",
  appId: "1:63425046416:web:3e4d0e77cd35b0257c3515",
  measurementId: "G-FQSJK5HZX3"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function initTheme(toggleBtnId){
  const btn = document.getElementById(toggleBtnId);
  const theme = localStorage.getItem("jt_theme") || "light";
  document.documentElement.setAttribute("data-theme", theme);
  if (btn) btn.textContent = theme === "dark" ? "☀" : "☾";
  if (btn) btn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", cur);
    localStorage.setItem("jt_theme", cur);
    btn.textContent = cur === "dark" ? "☀" : "☾";
  });
}

export function genCode(len = 5){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < len; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

export function escapeHtml(s){
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

export function todayStr(){ return new Date().toISOString().slice(0, 10); }

export function addDays(dateStr, n){
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function formatDate(d){
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

export function timeDiffHours(start, end){
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}
