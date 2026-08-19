// Jörmuntösk – gemeinsame Basis für alle Web-Tools
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore, doc, getDoc, onSnapshot, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

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

// Wendet zentral gespeicherte Vereinsdaten (Adresse/Kontakt) und Corporate Design
// (Akzentfarbe, Logo) live auf jede Seite an, die diese Funktion aufruft.
export function applyBranding({ logoImgIds = [], footerId = null } = {}){
  onSnapshot(doc(db, "einstellungen", "design"), snap => {
    const data = snap.exists() ? snap.data() : {};
    if (data.accentColor){
      document.documentElement.style.setProperty("--accent", data.accentColor);
    }
    if (data.logo){
      logoImgIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.src = data.logo;
      });
    }
  });
  if (footerId){
    onSnapshot(doc(db, "einstellungen", "allgemein"), snap => {
      const data = snap.exists() ? snap.data() : {};
      const el = document.getElementById(footerId);
      if (el){
        const adresse = data.adresse || "5024 Küttigen, Schweiz";
        const email = data.email || "jormuntosk@gmail.com";
        const telefon = data.telefon ? " · " + data.telefon : "";
        el.textContent = `Jörmuntösk · ${adresse} · ${email}${telefon}`;
      }
    });
  }
}

// Schreibt einen Eintrag ins Aktivitätsprotokoll (nur im Admin-Bereich verwendet).
export async function logActivity(adminName, aktion){
  try{
    await addDoc(collection(db, "aktivitaeten"), { admin: adminName, aktion, zeitpunkt: Date.now() });
  } catch(err){
    console.warn("Protokoll konnte nicht geschrieben werden:", err.message);
  }
}

// Verkleinert/komprimiert ein Bild (z.B. Logo-Upload) auf eine Data-URL, die sicher
// unter dem Firestore-Dokumentlimit von 1 MB bleibt. Firestore lehnt zu grosse
// Dokumente sonst kommentarlos ab, wodurch ein Speichervorgang wirkungslos bliebe.
export function fileToLimitedDataUrl(file, { maxDim = 512, maxBytes = 700000 } = {}){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim){
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Erst PNG probieren (verlustfrei, gut für Logos mit Transparenz),
        // bei Bedarf auf komprimiertes JPEG mit sinkender Qualität ausweichen.
        let dataUrl = canvas.toDataURL("image/png");
        if (dataUrl.length > maxBytes){
          for (const quality of [0.9, 0.75, 0.6, 0.45, 0.3]){
            dataUrl = canvas.toDataURL("image/jpeg", quality);
            if (dataUrl.length <= maxBytes) break;
          }
        }
        if (dataUrl.length > maxBytes){
          reject(new Error("Das Bild ist auch nach dem Verkleinern noch zu gross. Bitte ein kleineres Bild verwenden."));
          return;
        }
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// =========================================================
// Mitglieder-Login (für alle öffentlichen Werkzeuge: Übersicht,
// Schichtplanung, Markttagebuch, Mitgliederbereich)
// =========================================================
const COL_MITGLIEDER = "mitglieder";
let _currentMember = null;

// Liefert das aktuell angemeldete Mitglied (nach erfolgreichem requireMemberLogin()).
export function getCurrentMember(){ return _currentMember; }

// Prüft, ob ein Mitglied Verwaltungsrechte besitzt (Zugriff auf den Admin-Bereich).
export function isAdmin(member){ return !!(member && member.verwaltung === true); }

// Meldet das Mitglied ab und lädt die Seite neu, damit wieder der Login erscheint.
export function memberLogout(){
  sessionStorage.removeItem("jt_member_id");
  sessionStorage.removeItem("jt_member_name");
  location.reload();
}

// Zeigt einen vollflächigen Login und blockiert den Seiteninhalt (Element mit
// appRootId), bis sich ein gültiges Vereinsmitglied angemeldet hat. Wird als
// `await requireMemberLogin();` ganz am Anfang eines Modul-Scripts aufgerufen.
export function requireMemberLogin({ appRootId = "appRoot" } = {}){
  return new Promise((resolve) => {
    const reveal = (member) => {
      _currentMember = member;
      const overlayEl = document.getElementById("jtGateOverlay");
      if (overlayEl) overlayEl.remove();
      const root = document.getElementById(appRootId);
      if (root) root.style.display = "";
      resolve(member);
    };

    async function attemptRestore(){
      const savedId = sessionStorage.getItem("jt_member_id");
      if (!savedId) { showGate(); return; }
      try{
        const snap = await getDoc(doc(db, COL_MITGLIEDER, savedId));
        if (snap.exists()){
          reveal({ id: snap.id, ...snap.data() });
        } else {
          sessionStorage.removeItem("jt_member_id");
          sessionStorage.removeItem("jt_member_name");
          showGate();
        }
      } catch(err){
        showGate();
      }
    }

    function showGate(){
      if (document.getElementById("jtGateOverlay")) return;

      const style = document.createElement("style");
      style.textContent = `
        .jt-gate-overlay{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:20px;z-index:1000;font-family:Arial,Helvetica,sans-serif;}
        .jt-gate-box{max-width:340px;width:100%;text-align:center;}
        .jt-gate-logo{height:56px;width:56px;margin-bottom:14px;border-radius:50%;}
        .jt-gate-box h1{font-size:20px;margin:0 0 4px 0;color:var(--text, #1A1A1A);}
        .jt-gate-box p.jt-gate-sub{color:var(--text-muted, #5A5F58);font-size:13px;margin:0 0 20px 0;}
        .jt-gate-box input{width:100%;padding:10px;border:1px solid var(--border, #DDE3DA);border-radius:8px;margin-bottom:10px;font-size:14px;background:var(--surface, #fff);color:var(--text, #1A1A1A);font-family:inherit;box-sizing:border-box;}
        .jt-gate-box button{width:100%;background:var(--accent, #2AA329);color:#fff;border:none;border-radius:8px;padding:11px;font-size:14px;font-weight:bold;cursor:pointer;font-family:inherit;}
        .jt-gate-box button:hover{opacity:.92;}
        .jt-gate-error{color:#B3261E;font-size:13px;margin-top:8px;min-height:16px;}
      `;
      document.head.appendChild(style);

      const overlay = document.createElement("div");
      overlay.className = "jt-gate-overlay";
      overlay.id = "jtGateOverlay";
      overlay.innerHTML = `
        <div class="jt-gate-box">
          <h1>Mitglieder-Login</h1>
          <p class="jt-gate-sub">Bitte mit deinem Jörmuntösk-Zugang anmelden.</p>
          <input type="text" id="jtGateName" placeholder="Name" autocomplete="username">
          <input type="password" id="jtGatePw" placeholder="Passwort" autocomplete="current-password">
          <button type="button" id="jtGateBtn">Anmelden</button>
          <div class="jt-gate-error" id="jtGateError"></div>
        </div>
      `;
      document.body.appendChild(overlay);
      document.getElementById("jtGateName").focus();

      async function tryLogin(){
        const name = document.getElementById("jtGateName").value.trim();
        const pw = document.getElementById("jtGatePw").value;
        const errEl = document.getElementById("jtGateError");
        errEl.textContent = "";
        if (!name || !pw){ errEl.textContent = "Bitte Name und Passwort angeben."; return; }
        try{
          const snap = await getDocs(query(collection(db, COL_MITGLIEDER), where("name", "==", name)));
          if (snap.empty){ errEl.textContent = "Unbekannter Name oder falsches Passwort."; return; }
          const memberDoc = snap.docs[0];
          const hash = await sha256(pw);
          if (hash !== memberDoc.data().password){ errEl.textContent = "Unbekannter Name oder falsches Passwort."; return; }
          const member = { id: memberDoc.id, ...memberDoc.data() };
          sessionStorage.setItem("jt_member_id", member.id);
          sessionStorage.setItem("jt_member_name", member.name);
          reveal(member);
        } catch(err){
          errEl.textContent = "Anmeldung fehlgeschlagen: " + err.message;
        }
      }
      document.getElementById("jtGateBtn").addEventListener("click", tryLogin);
      overlay.addEventListener("keydown", e => { if (e.key === "Enter") tryLogin(); });
    }

    attemptRestore();
  });
}
