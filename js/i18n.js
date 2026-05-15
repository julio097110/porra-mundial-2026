// ============================================================
//  i18n.js
//  Sistema de internacionalización (ES / EN)
//  Uso:
//    import { t, setLang, getLang, initI18n } from './i18n.js';
//    await initI18n();          // carga el idioma del usuario
//    t('login.title')           // devuelve el texto traducido
//    setLang('en')              // cambia el idioma y recarga textos
// ============================================================

let translations = {};
let currentLang  = 'es';

// ── Carga el fichero JSON del idioma solicitado ──────────────
async function loadTranslations(lang) {
  const res  = await fetch(`./i18n/${lang}.json`);
  if (!res.ok) throw new Error(`No se pudo cargar i18n/${lang}.json`);
  return res.json();
}

// ── Accede a una clave anidada tipo 'login.title' ────────────
function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => {
    return acc && acc[key] !== undefined ? acc[key] : null;
  }, obj);
}

// ── Función principal de traducción ─────────────────────────
export function t(key) {
  const val = getNestedValue(translations, key);
  if (val === null) {
    console.warn(`[i18n] Clave no encontrada: "${key}"`);
    return key;
  }
  return val;
}

// ── Devuelve el idioma activo ────────────────────────────────
export function getLang() {
  return currentLang;
}

// ── Cambia el idioma, guarda la preferencia y recarga la UI ──
export async function setLang(lang, uid = null) {
  if (!['es', 'en'].includes(lang)) return;
  currentLang  = lang;
  translations = await loadTranslations(lang);

  // Guarda en localStorage como respaldo rápido
  localStorage.setItem('lang', lang);

  // Si hay usuario logueado, persiste en Firestore
  if (uid) {
    try {
      const { db }  = await import('./firebase-config.js');
      const { doc, updateDoc } = await import(
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
      );
      await updateDoc(doc(db, 'usuarios', uid), { idioma: lang });
    } catch (e) {
      console.warn('[i18n] No se pudo guardar idioma en Firestore:', e);
    }
  }

  // Dispara un evento para que los componentes recarguen sus textos
  document.dispatchEvent(new CustomEvent('langChanged', { detail: { lang } }));
}

// ── Inicialización: determina el idioma a usar ───────────────
//    Prioridad: Firestore (si logueado) → localStorage → navegador → 'es'
export async function initI18n(userProfile = null) {
  let lang = 'es';

  if (userProfile && userProfile.idioma) {
    lang = userProfile.idioma;
  } else if (localStorage.getItem('lang')) {
    lang = localStorage.getItem('lang');
  } else {
    const browserLang = navigator.language || navigator.userLanguage || 'es';
    lang = browserLang.startsWith('es') ? 'es' : 'en';
  }

  if (!['es', 'en'].includes(lang)) lang = 'es';

  currentLang  = lang;
  translations = await loadTranslations(lang);
  localStorage.setItem('lang', lang);

  return lang;
}

// ── Aplica traducciones a elementos con data-i18n ────────────
//    Uso en HTML: <span data-i18n="login.title"></span>
//                 <input data-i18n-placeholder="login.userPlaceholder">
export function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val) el.textContent = val;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = t(key);
    if (val) el.placeholder = val;
  });

  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    const val = t(key);
    if (val) el.innerHTML = val;
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const val = t(key);
    if (val) el.title = val;
  });
}

// ── Actualiza el selector de idioma en la cabecera ───────────
export function updateLangToggle() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
  });
}

// ── Helper: formatea una fecha UTC a hora local del usuario ──
export function formatMatchDate(dateUTC) {
  const date = new Date(dateUTC);
  const lang  = currentLang === 'es' ? 'es-ES' : 'en-GB';
  const day   = date.toLocaleDateString(lang, {
    weekday: 'short', day: 'numeric', month: 'short'
  });
  const time  = date.toLocaleTimeString(lang, {
    hour: '2-digit', minute: '2-digit'
  });
  const label = currentLang === 'es' ? 'hora local' : 'local time';
  return `${day} · ${time} (${label})`;
}
