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

// Registriert den Service Worker für die Installierbarkeit als App (PWA).
// Läuft automatisch auf jeder Seite, die common.js einbindet.
if ("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Registrierung fehlgeschlagen (z.B. lokale Vorschau ohne https) - unkritisch,
      // die Seite funktioniert auch ohne Service Worker normal weiter.
    });
  });
}

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
const COL_MITGLIEDER = "mitglieder";
let _currentMember = null;

// Liefert das aktuell angemeldete Mitglied (nach erfolgreichem requireMemberLogin()).
export function getCurrentMember(){ return _currentMember; }

// Prüft, ob ein Mitglied Verwaltungsrechte besitzt (Zugriff auf den Admin-Bereich).
export function isAdmin(member){ return !!(member && member.verwaltung === true); }

// =========================================================
// Abzeichen / Achievements
// Vollständig manuell durch den Vorstand vergebene Auszeichnungen (kein
// automatisches Kriterium). Katalog gemäss Vereinsliste. Vergabe erfolgt im
// Admin-Bereich; Mitglieder sehen ihre erreichten und offenen Abzeichen im
// Mitgliederbereich.
// =========================================================

export const ABZEICHEN_KATALOG = [
  { id: "erster-schritt-ins-langhaus", name: "Erster Schritt ins Langhaus", bedingung: "Zum ersten Mal an einem offiziellen Sippenlager teilnehmen", kategorie: "Sippenleben", kategorieEmoji: "🛡️", seltenheit: "Neuling", seltenheitEmoji: "⚪" },
  { id: "schildbruder-schildschwester", name: "Schildbruder / Schildschwester", bedingung: "Einem anderen Mitglied bei einem Projekt helfen", kategorie: "Sippenleben", kategorieEmoji: "🛡️", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "treue-zur-sippe", name: "Treue zur Sippe", bedingung: "5 offizielle Veranstaltungen besuchen", kategorie: "Sippenleben", kategorieEmoji: "🛡️", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "alte-hand", name: "Alte Hand", bedingung: "10 offizielle Veranstaltungen besuchen", kategorie: "Sippenleben", kategorieEmoji: "🛡️", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "sippenveteran", name: "Sippenveteran", bedingung: "25 offizielle Veranstaltungen besuchen", kategorie: "Sippenleben", kategorieEmoji: "🛡️", seltenheit: "Krieger", seltenheitEmoji: "🟣" },
  { id: "bruder-schwester-der-tafelrunde", name: "Bruder / Schwester der Tafelrunde", bedingung: "An einem gemeinsamen Sippenfestmahl teilnehmen", kategorie: "Sippenleben", kategorieEmoji: "🛡️", seltenheit: "Neuling", seltenheitEmoji: "⚪" },
  { id: "gastfreund", name: "Gastfreund", bedingung: "Zum ersten Mal einen Gast zu einer Sippenveranstaltung mitbringen", kategorie: "Sippenleben", kategorieEmoji: "🛡️", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "stimme-der-sippe", name: "Stimme der Sippe", bedingung: "Sich aktiv an einer Mitgliederversammlung beteiligen", kategorie: "Sippenleben", kategorieEmoji: "🛡️", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "huter-der-glut", name: "Hüter der Glut", bedingung: "Zum ersten Mal selbstständig ein Lagerfeuer entzünden", kategorie: "Lager & Survival", kategorieEmoji: "🔥", seltenheit: "Neuling", seltenheitEmoji: "⚪" },
  { id: "feuermeister", name: "Feuermeister", bedingung: "Unter schwierigen Bedingungen erfolgreich ein Feuer entzünden", kategorie: "Lager & Survival", kategorieEmoji: "🔥", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "kind-der-wildnis", name: "Kind der Wildnis", bedingung: "Eine Nacht im Sippenlager verbringen", kategorie: "Lager & Survival", kategorieEmoji: "🔥", seltenheit: "Neuling", seltenheitEmoji: "⚪" },
  { id: "nachtwache", name: "Nachtwache", bedingung: "Freiwillig eine Nachtwache übernehmen", kategorie: "Lager & Survival", kategorieEmoji: "🔥", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "wetterfest", name: "Wetterfest", bedingung: "Ein komplettes Lager bei starkem Regen oder schlechtem Wetter durchstehen", kategorie: "Lager & Survival", kategorieEmoji: "🔥", seltenheit: "Krieger", seltenheitEmoji: "🟣" },
  { id: "herr-des-feuers", name: "Herr des Feuers", bedingung: "Bei mindestens 10 Lagerfeuern für das Feuer verantwortlich gewesen sein", kategorie: "Lager & Survival", kategorieEmoji: "🔥", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "ohne-dach-und-furchtlos", name: "Ohne Dach und furchtlos", bedingung: "Eine Nacht unter freiem Himmel verbringen", kategorie: "Lager & Survival", kategorieEmoji: "🔥", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "der-letzte-der-schlaft", name: "Der Letzte, der schläft", bedingung: "Bei einer Veranstaltung bis zum Ende des Lagerabends wach bleiben", kategorie: "Lager & Survival", kategorieEmoji: "🔥", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "erster-funke", name: "Erster Funke", bedingung: "Zum ersten Mal ein Schmiedeprojekt beginnen und fertigstellen", kategorie: "Handwerk", kategorieEmoji: "⚒️", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "hammer-und-amboss", name: "Hammer und Amboss", bedingung: "Das erste eigene Werkstück schmieden", kategorie: "Handwerk", kategorieEmoji: "⚒️", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "holzwurm", name: "Holzwurm", bedingung: "Das erste eigene Holzprojekt fertigstellen", kategorie: "Handwerk", kategorieEmoji: "⚒️", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "faden-und-fasern", name: "Fäden und Fasern", bedingung: "Das erste eigene Textil- oder Lederprojekt herstellen", kategorie: "Handwerk", kategorieEmoji: "⚒️", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "meister-der-klinge", name: "Meister der Klinge", bedingung: "Ein eigenes Messer oder Beil herstellen", kategorie: "Handwerk", kategorieEmoji: "⚒️", seltenheit: "Krieger", seltenheitEmoji: "🟣" },
  { id: "schmied-der-sippe", name: "Schmied der Sippe", bedingung: "5 eigene Schmiedeprojekte fertigstellen", kategorie: "Handwerk", kategorieEmoji: "⚒️", seltenheit: "Krieger", seltenheitEmoji: "🟣" },
  { id: "werkmeister", name: "Werkmeister", bedingung: "Einen Gegenstand speziell für die Sippe herstellen", kategorie: "Handwerk", kategorieEmoji: "⚒️", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "der-erfinder", name: "Der Erfinder", bedingung: "Ein eigenes handwerkliches Konzept entwickeln und umsetzen", kategorie: "Handwerk", kategorieEmoji: "⚒️", seltenheit: "Krieger", seltenheitEmoji: "🟣" },
  { id: "erster-schildwall", name: "Erster Schildwall", bedingung: "Zum ersten Mal an einem Schildkampf teilnehmen", kategorie: "Kampf & Geschick", kategorieEmoji: "⚔️", seltenheit: "Neuling", seltenheitEmoji: "⚪" },
  { id: "axtwerfer", name: "Axtwerfer", bedingung: "Zum ersten Mal erfolgreich eine Axt werfen", kategorie: "Kampf & Geschick", kategorieEmoji: "⚔️", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "bogenschutze", name: "Bogenschütze", bedingung: "Zum ersten Mal an einem Bogenturnier teilnehmen", kategorie: "Kampf & Geschick", kategorieEmoji: "⚔️", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "krieger-der-sippe", name: "Krieger der Sippe", bedingung: "An 3 Wettkämpfen teilnehmen", kategorie: "Kampf & Geschick", kategorieEmoji: "⚔️", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "kampfgefahrte", name: "Kampfgefährte", bedingung: "An einem offiziellen Turnier teilnehmen", kategorie: "Kampf & Geschick", kategorieEmoji: "⚔️", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "schildbrecher", name: "Schildbrecher", bedingung: "Einen Wettkampf oder ein Turnier gewinnen", kategorie: "Kampf & Geschick", kategorieEmoji: "⚔️", seltenheit: "Hersir", seltenheitEmoji: "🟠" },
  { id: "einer-gegen-alle", name: "Einer gegen Alle", bedingung: "Eine besondere Herausforderung erfolgreich meistern", kategorie: "Kampf & Geschick", kategorieEmoji: "⚔️", seltenheit: "Krieger", seltenheitEmoji: "🟣" },
  { id: "unbeugsam", name: "Unbeugsam", bedingung: "Nach einer Niederlage weitermachen und die Herausforderung zu Ende bringen", kategorie: "Kampf & Geschick", kategorieEmoji: "⚔️", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "erster-trunk", name: "Erster Trunk", bedingung: "Zum ersten Mal an einem Sippenfest teilnehmen", kategorie: "Essen & Trinken", kategorieEmoji: "🍖", seltenheit: "Neuling", seltenheitEmoji: "⚪" },
  { id: "metbruder-metschwester", name: "Metbruder / Metschwester", bedingung: "Zum ersten Mal an einer Metverkostung teilnehmen", kategorie: "Essen & Trinken", kategorieEmoji: "🍖", seltenheit: "Neuling", seltenheitEmoji: "⚪" },
  { id: "feuerkoch", name: "Feuerkoch", bedingung: "Zum ersten Mal ein Gericht über offenem Feuer zubereiten", kategorie: "Essen & Trinken", kategorieEmoji: "🍖", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "kesselmeister", name: "Kesselmeister", bedingung: "Ein vollständiges Gericht für die Sippe kochen", kategorie: "Essen & Trinken", kategorieEmoji: "🍖", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "fleischwolf", name: "Fleischwolf", bedingung: "Ein besonders ausgiebiges Sippenfestmahl überstehen", kategorie: "Essen & Trinken", kategorieEmoji: "🍖", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "tafelfreund", name: "Tafelfreund", bedingung: "An 5 gemeinsamen Sippenmahlzeiten teilnehmen", kategorie: "Essen & Trinken", kategorieEmoji: "🍖", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "kesselwache", name: "Kesselwache", bedingung: "Mehrfach bei der Zubereitung eines Sippenmahls helfen", kategorie: "Essen & Trinken", kategorieEmoji: "🍖", seltenheit: "Neuling", seltenheitEmoji: "⚪" },
  { id: "der-letzte-schluck", name: "Der letzte Schluck", bedingung: "Bis zum Ende einer Tafelrunde dabei bleiben", kategorie: "Essen & Trinken", kategorieEmoji: "🍖", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "der-aufbruch", name: "Der Aufbruch", bedingung: "Zum ersten Mal an einem gemeinsamen Abenteuer teilnehmen", kategorie: "Abenteuer & Reisen", kategorieEmoji: "🧭", seltenheit: "Neuling", seltenheitEmoji: "⚪" },
  { id: "weitgereist", name: "Weitgereist", bedingung: "Zum ersten Mal ein auswärtiges Lager besuchen", kategorie: "Abenteuer & Reisen", kategorieEmoji: "🧭", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "wanderer-midgards", name: "Wanderer Midgards", bedingung: "3 verschiedene Lager oder Märkte besuchen", kategorie: "Abenteuer & Reisen", kategorieEmoji: "🧭", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "wegefinder", name: "Wegefinder", bedingung: "Eine gemeinsame Tour oder ein Lager organisieren", kategorie: "Abenteuer & Reisen", kategorieEmoji: "🧭", seltenheit: "Krieger", seltenheitEmoji: "🟣" },
  { id: "grenzganger", name: "Grenzgänger", bedingung: "Eine Sippenveranstaltung ausserhalb der Schweiz besuchen", kategorie: "Abenteuer & Reisen", kategorieEmoji: "🧭", seltenheit: "Krieger", seltenheitEmoji: "🟣" },
  { id: "entdecker", name: "Entdecker", bedingung: "Einen neuen Markt oder ein Festival für die Sippe entdecken", kategorie: "Abenteuer & Reisen", kategorieEmoji: "🧭", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "fernfahrer", name: "Fernfahrer", bedingung: "Mehr als 100 km für eine Sippenveranstaltung anreisen", kategorie: "Abenteuer & Reisen", kategorieEmoji: "🧭", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "ruf-des-nordens", name: "Ruf des Nordens", bedingung: "An einem besonderen nordischen Event teilnehmen", kategorie: "Abenteuer & Reisen", kategorieEmoji: "🧭", seltenheit: "Krieger", seltenheitEmoji: "🟣" },
  { id: "zeltmeister", name: "Zeltmeister", bedingung: "Zum ersten Mal ein Sippenzelt vollständig aufbauen", kategorie: "Lagerbau", kategorieEmoji: "🏕️", seltenheit: "Neuling", seltenheitEmoji: "⚪" },
  { id: "pfahl-und-seil", name: "Pfahl und Seil", bedingung: "Aktiv beim Aufbau eines Sippenlagers helfen", kategorie: "Lagerbau", kategorieEmoji: "🏕️", seltenheit: "Neuling", seltenheitEmoji: "⚪" },
  { id: "baumeister", name: "Baumeister", bedingung: "Einen Teil der Lagerausstattung selbst herstellen", kategorie: "Lagerbau", kategorieEmoji: "🏕️", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "lagerherr", name: "Lagerherr", bedingung: "Einen kompletten Lagerplatz mit aufbauen", kategorie: "Lagerbau", kategorieEmoji: "🏕️", seltenheit: "Krieger", seltenheitEmoji: "🟣" },
  { id: "huter-des-langhauses", name: "Hüter des Langhauses", bedingung: "Ein Sippenlager über Nacht betreuen", kategorie: "Lagerbau", kategorieEmoji: "🏕️", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "der-letzte-pfahl", name: "Der letzte Pfahl", bedingung: "Bis zum vollständigen Abbau des Lagers helfen", kategorie: "Lagerbau", kategorieEmoji: "🏕️", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "skalde", name: "Skalde", bedingung: "Eine Geschichte, Sage oder ein Lied vor der Sippe vortragen", kategorie: "Kultur & Geschichte", kategorieEmoji: "🪶", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "runenkenner", name: "Runenkenner", bedingung: "Erste grundlegende Kenntnisse der Runenschrift erwerben", kategorie: "Kultur & Geschichte", kategorieEmoji: "🪶", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "geschichtenerzahler", name: "Geschichtenerzähler", bedingung: "Eine nordische Sage frei vor der Sippe erzählen", kategorie: "Kultur & Geschichte", kategorieEmoji: "🪶", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "kenner-der-alten-wege", name: "Kenner der alten Wege", bedingung: "Einen historischen oder handwerklichen Workshop besuchen", kategorie: "Kultur & Geschichte", kategorieEmoji: "🪶", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "kind-odins", name: "Kind Odins", bedingung: "Ein anspruchsvolles Quiz über nordische Mythologie bestehen", kategorie: "Kultur & Geschichte", kategorieEmoji: "🪶", seltenheit: "Krieger", seltenheitEmoji: "🟣" },
  { id: "bewahrer-der-uberlieferung", name: "Bewahrer der Überlieferung", bedingung: "Eigenes Wissen über Geschichte, Handwerk oder Mythologie an andere weitergeben", kategorie: "Kultur & Geschichte", kategorieEmoji: "🪶", seltenheit: "Krieger", seltenheitEmoji: "🟣" },
  { id: "skaldenzunge", name: "Skaldenzunge", bedingung: "Ein eigenes Gedicht, Lied oder eine Saga verfassen", kategorie: "Kultur & Geschichte", kategorieEmoji: "🪶", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "odin-sieht-alles", name: "Odin sieht alles", bedingung: "Bei einer besonders peinlichen Situation erwischt werden", kategorie: "Geheim & Humor", kategorieEmoji: "😈", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "thor-sei-dank", name: "Thor sei Dank", bedingung: "Eine beinahe schiefgegangene Situation im letzten Moment retten", kategorie: "Geheim & Humor", kategorieEmoji: "😈", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "loki-war-s", name: "Loki war's", bedingung: "Für ein besonders chaotisches Ereignis verantwortlich sein", kategorie: "Geheim & Humor", kategorieEmoji: "😈", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "wo-ist-mein-hammer", name: "Wo ist mein Hammer?", bedingung: "Einen wichtigen Ausrüstungsgegenstand verlegen", kategorie: "Geheim & Humor", kategorieEmoji: "😈", seltenheit: "Neuling", seltenheitEmoji: "⚪" },
  { id: "das-war-nicht-geplant", name: "Das war nicht geplant", bedingung: "Eine spontane Katastrophe erfolgreich lösen", kategorie: "Geheim & Humor", kategorieEmoji: "😈", seltenheit: "Hirdmann", seltenheitEmoji: "🔵" },
  { id: "ich-hab-da-eine-idee", name: "Ich hab da eine Idee…", bedingung: "Ein völlig verrücktes, aber umsetzbares Projekt vorschlagen", kategorie: "Geheim & Humor", kategorieEmoji: "😈", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "bis-zur-letzten-axt", name: "Bis zur letzten Axt", bedingung: "Eine schwierige Aufgabe bis zum bitteren Ende durchziehen", kategorie: "Geheim & Humor", kategorieEmoji: "😈", seltenheit: "Krieger", seltenheitEmoji: "🟣" },
  { id: "schildkrote", name: "Schildkröte", bedingung: "Beim Lageraufbau nachweislich besonders langsam sein", kategorie: "Geheim & Humor", kategorieEmoji: "😈", seltenheit: "Sippenkind", seltenheitEmoji: "🟢" },
  { id: "ragnarok-uberlebt", name: "Ragnarök überlebt", bedingung: "Eine besonders chaotische Veranstaltung überstehen", kategorie: "Geheim & Humor", kategorieEmoji: "😈", seltenheit: "Krieger", seltenheitEmoji: "🟣" },
  { id: "loki-s-lieblingskind", name: "Loki's Lieblingskind", bedingung: "Ein aussergewöhnliches Mass an Chaos verursachen", kategorie: "Geheim & Humor", kategorieEmoji: "😈", seltenheit: "Hersir", seltenheitEmoji: "🟠" },
  { id: "jarl-s-ehrenzeichen", name: "Jarl's Ehrenzeichen", bedingung: "Einen aussergewöhnlichen Einsatz für die Sippe zeigen", kategorie: "Legendär", kategorieEmoji: "👑", seltenheit: "Hersir", seltenheitEmoji: "🟠" },
  { id: "blut-der-sippe", name: "Blut der Sippe", bedingung: "Sich über längere Zeit aussergewöhnlich für Jörmuntösk engagieren", kategorie: "Legendär", kategorieEmoji: "👑", seltenheit: "Hersir", seltenheitEmoji: "🟠" },
  { id: "huter-von-jormuntosk", name: "Hüter von Jörmuntösk", bedingung: "Die Sippe in besonderer Weise unterstützen oder schützen", kategorie: "Legendär", kategorieEmoji: "👑", seltenheit: "Jarl", seltenheitEmoji: "🔴" },
  { id: "meister-der-alten-kunste", name: "Meister der alten Künste", bedingung: "Mehrere historische Handwerke auf hohem Niveau beherrschen", kategorie: "Legendär", kategorieEmoji: "👑", seltenheit: "Jarl", seltenheitEmoji: "🔴" },
  { id: "schild-der-sippe", name: "Schild der Sippe", bedingung: "Sich aussergewöhnlich für andere Mitglieder einsetzen", kategorie: "Legendär", kategorieEmoji: "👑", seltenheit: "Jarl", seltenheitEmoji: "🔴" },
  { id: "wegbereiter", name: "Wegbereiter", bedingung: "Etwas Neues und Dauerhaftes für Jörmuntösk etablieren", kategorie: "Legendär", kategorieEmoji: "👑", seltenheit: "Jarl", seltenheitEmoji: "🔴" },
  { id: "saga-von-jormuntosk", name: "Saga von Jörmuntösk", bedingung: "Eine Tat vollbringen, über die innerhalb der Sippe noch lange gesprochen wird", kategorie: "Legendär", kategorieEmoji: "👑", seltenheit: "Saga", seltenheitEmoji: "🟡" },
  { id: "einherjar", name: "Einherjar", bedingung: "Die höchste Auszeichnung für aussergewöhnlichen Einsatz erhalten", kategorie: "Legendär", kategorieEmoji: "👑", seltenheit: "Saga", seltenheitEmoji: "🟡" },
  { id: "jormuntosk-legende", name: "Jörmuntösk-Legende", bedingung: "Eine herausragende Lebensleistung innerhalb der Sippe erbringen", kategorie: "Legendär", kategorieEmoji: "👑", seltenheit: "Saga", seltenheitEmoji: "🟡" },
];
// Gruppiert den Abzeichen-Katalog nach Kategorie (Reihenfolge = erstes Vorkommen im Katalog).
export function abzeichenNachKategorie(){
  const gruppen = [];
  const index = {};
  for (const a of ABZEICHEN_KATALOG){
    if (!(a.kategorie in index)){
      index[a.kategorie] = { kategorie: a.kategorie, kategorieEmoji: a.kategorieEmoji, items: [] };
      gruppen.push(index[a.kategorie]);
    }
    index[a.kategorie].items.push(a);
  }
  return gruppen;
}

// Prüft, ob ein Mitglied ein bestimmtes Abzeichen besitzt.
export function mitgliedHatAbzeichen(member, abzeichenId){
  return !!(member && Array.isArray(member.abzeichen) && member.abzeichen.includes(abzeichenId));
}


// Meldet das Mitglied ab und lädt die Seite neu, damit wieder der Login erscheint.
// Kurze, selbst verfasste Abschiedssprüche - rein spielerisch, kein Zitat aus
// historischen Quellen (keine Urheberrechtsfragen).
const ABSCHIEDSSPRUECHE = [
  "Möge der Weg unter deinen Füssen fest sein.",
  "Bis zum nächsten Mal an der Feuerstelle.",
  "Trag die Wärme der Sippe mit dir.",
  "Geh mit wachem Blick und ruhigem Herzen.",
  "Der Weg ist lang, die Sippe wartet auf deine Rückkehr.",
  "Möge dir der Wind stets in den Rücken wehen.",
  "Bis zur nächsten Zusammenkunft, Sippenfreund.",
  "Trage das Feuer der Gemeinschaft weiter."
];

export function memberLogout(){
  const spruch = ABSCHIEDSSPRUECHE[Math.floor(Math.random() * ABSCHIEDSSPRUECHE.length)];
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "fixed", inset: "0", zIndex: "100000",
    background: "var(--accent, #2AA329)", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    textAlign: "center", padding: "40px", fontSize: "18px", fontWeight: "bold",
    opacity: "0", transition: "opacity .3s ease"
  });
  overlay.textContent = spruch;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = "1"; });
  setTimeout(() => {
    sessionStorage.removeItem("jt_member_id");
    sessionStorage.removeItem("jt_member_name");
    location.reload();
  }, 1300);
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

// =========================================================
// Anfragen an den Vorstand
// Mitglieder reichen allgemeine Anliegen (z.B. Ausrüstung, Organisatorisches)
// ein; der Vorstand bearbeitet sie im Admin-Bereich. Collection "anfragen".
// =========================================================

export const COL_ANFRAGEN = "anfragen";

export const ANFRAGE_KATEGORIEN = ["Ausrüstung", "Finanzen", "Organisatorisches", "Sonstiges"];

export const ANFRAGE_STATUS = ["offen", "in_bearbeitung", "erledigt", "abgelehnt"];

export function anfrageStatusLabel(status){
  const labels = { offen: "Offen", in_bearbeitung: "In Bearbeitung", erledigt: "Erledigt", abgelehnt: "Abgelehnt" };
  return labels[status] || status;
}

// =========================================================
// 9-Jahres-Tierkreis
// Gemäss Konzeptdokument "9-Jahres-Tierkreis": Zyklus beginnt am
// 21.12.2025 (Wintersonnenwende) mit dem Eichhörnchen und schliesst sich
// nach 9 Jahren mit der Schlange (Jörmungandr), danach beginnt er neu.
// Jedes Zyklusjahr läuft vom 21.12. bis zum 20.12. des Folgejahres.
// =========================================================

export const TIERKREIS = [
  { tier: "Eichhörnchen", emoji: "🐿️", bedeutung: "Unschuld, Jugend (Ratatöskr)" },
  { tier: "Bär", emoji: "🐻", bedeutung: "Erwachen" },
  { tier: "Wolf", emoji: "🐺", bedeutung: "Energie, Lebensbereitschaft" },
  { tier: "Pferd", emoji: "🐴", bedeutung: "Aufbruch, Verbindung (Sleipnir)" },
  { tier: "Eber", emoji: "🐗", bedeutung: "Mut, Fest, Schutz" },
  { tier: "Hirsch", emoji: "🦌", bedeutung: "Reife, Ausgewogenheit" },
  { tier: "Adler", emoji: "🦅", bedeutung: "Weitblick" },
  { tier: "Raben", emoji: "🐦‍⬛", bedeutung: "Wissen, Erkenntnis (Hugin & Munin)" },
  { tier: "Schlange", emoji: "🐍", bedeutung: "Abschluss, Kreis schliesst sich (Jörmungandr)" }
];

// Liefert das aktuelle Zyklusjahr (1-9), das zugehörige Tier sowie den
// Start/Ende des Zyklusjahres und die verbleibenden Tage bis zum Wechsel.
export function berechneSippenjahr(heute = new Date()){
  let periodStartYear = heute.getFullYear();
  const dec21ThisYear = new Date(periodStartYear, 11, 21);
  if (heute < dec21ThisYear) periodStartYear -= 1;
  const periodStart = new Date(periodStartYear, 11, 21);
  const periodEnd = new Date(periodStartYear + 1, 11, 20);
  const gesamtIdx = periodStartYear - 2025;
  const idx = ((gesamtIdx % 9) + 9) % 9;
  const msPerDay = 24 * 60 * 60 * 1000;
  const tageBisWechsel = Math.ceil((periodEnd - heute) / msPerDay) + 1;
  return {
    sippenjahr: gesamtIdx + 1,
    zyklusJahr: idx + 1,
    tier: TIERKREIS[idx],
    naechstesTier: TIERKREIS[(idx + 1) % 9],
    periodStart, periodEnd,
    tageBisWechsel
  };
}

// =========================================================
// Runenorakel
// Ältere Futhark (24 Runen). Jeden Tag wird deterministisch (nicht
// zufällig bei jedem Laden) eine Rune für den Tag ermittelt, damit alle
// Mitglieder an einem Tag dieselbe Rune sehen und sie nicht bei jedem
// Neuladen der Seite wechselt.
// =========================================================

export const RUNEN = [
  { symbol: "ᚠ", name: "Fehu", bedeutung: "Wohlstand, Vieh" },
  { symbol: "ᚢ", name: "Uruz", bedeutung: "Kraft, Wildheit" },
  { symbol: "ᚦ", name: "Thurisaz", bedeutung: "Konflikt, Durchsetzung" },
  { symbol: "ᚨ", name: "Ansuz", bedeutung: "Botschaft, Weisheit" },
  { symbol: "ᚱ", name: "Raidho", bedeutung: "Reise, Bewegung" },
  { symbol: "ᚲ", name: "Kenaz", bedeutung: "Erkenntnis, Feuer" },
  { symbol: "ᚷ", name: "Gebo", bedeutung: "Geschenk, Partnerschaft" },
  { symbol: "ᚹ", name: "Wunjo", bedeutung: "Freude, Harmonie" },
  { symbol: "ᚺ", name: "Hagalaz", bedeutung: "Umbruch, Prüfung" },
  { symbol: "ᚾ", name: "Nauthiz", bedeutung: "Not, Widerstand" },
  { symbol: "ᛁ", name: "Isa", bedeutung: "Stillstand, Klarheit" },
  { symbol: "ᛃ", name: "Jera", bedeutung: "Ernte, Lohn" },
  { symbol: "ᛇ", name: "Eihwaz", bedeutung: "Beständigkeit, Wandel" },
  { symbol: "ᛈ", name: "Perthro", bedeutung: "Schicksal, Geheimnis" },
  { symbol: "ᛉ", name: "Algiz", bedeutung: "Schutz" },
  { symbol: "ᛊ", name: "Sowilo", bedeutung: "Erfolg, Sonne" },
  { symbol: "ᛏ", name: "Tiwaz", bedeutung: "Mut, Gerechtigkeit" },
  { symbol: "ᛒ", name: "Berkano", bedeutung: "Neubeginn, Wachstum" },
  { symbol: "ᛖ", name: "Ehwaz", bedeutung: "Vertrauen, Fortschritt" },
  { symbol: "ᛗ", name: "Mannaz", bedeutung: "Gemeinschaft, das Selbst" },
  { symbol: "ᛚ", name: "Laguz", bedeutung: "Intuition, Fluss" },
  { symbol: "ᛜ", name: "Ingwaz", bedeutung: "Fruchtbarkeit, Ruhe" },
  { symbol: "ᛞ", name: "Dagaz", bedeutung: "Durchbruch, neuer Tag" },
  { symbol: "ᛟ", name: "Othala", bedeutung: "Erbe, Heimat" }
];

// Liefert die Rune des Tages: deterministisch aus dem Kalenderdatum
// berechnet, damit sie über den Tag stabil bleibt und für alle
// Mitglieder gleich ist.
export function runeDesTages(heute = new Date()){
  const key = `${heute.getFullYear()}-${heute.getMonth() + 1}-${heute.getDate()}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++){
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return RUNEN[hash % RUNEN.length];
}

// =========================================================
// Mondphasen
// Näherungsweise Berechnung anhand der synodischen Mondperiode
// (~29.53 Tage) relativ zu einem bekannten Neumond-Referenzdatum.
// Astronomisch nicht sekundengenau, für eine Anzeige im Vereins-Tool
// aber ausreichend präzise (Abweichung im Bereich weniger Stunden).
// =========================================================

export const MONDPHASEN = [
  { emoji: "🌑", name: "Neumond" },
  { emoji: "🌒", name: "Zunehmende Sichel" },
  { emoji: "🌓", name: "Erstes Viertel" },
  { emoji: "🌔", name: "Zunehmender Mond" },
  { emoji: "🌕", name: "Vollmond" },
  { emoji: "🌖", name: "Abnehmender Mond" },
  { emoji: "🌗", name: "Letztes Viertel" },
  { emoji: "🌘", name: "Abnehmende Sichel" }
];

export function berechneMondphase(heute = new Date()){
  const synodischerMonat = 29.53058867;
  const bekannterNeumond = Date.UTC(2000, 0, 6, 18, 14, 0);
  const tageSeit = (heute.getTime() - bekannterNeumond) / 86400000;
  let phase = tageSeit % synodischerMonat;
  if (phase < 0) phase += synodischerMonat;
  const index = Math.round((phase / synodischerMonat) * 8) % 8;
  return MONDPHASEN[index];
}

