// ============================================================
//  js/info.js
//  Lógica de la página pública info.html
//  - Carga datos dinámicos de Firestore (jugadores, bote, config)
//  - Gestiona el selector de idioma independiente del login
//  - No requiere autenticación
// ============================================================

import { db } from './firebase-config.js';
import {
  doc, getDoc, collection, getCountFromServer
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { initI18n, t, setLang, getLang } from './i18n.js';

// ── Punto de entrada ─────────────────────────────────────────
export async function initInfo() {
  try {
    // Inicializar idioma (sin perfil de usuario — usa localStorage o navegador)
    const lang = await initI18n(null);
    aplicarTextos(lang);
    actualizarBotonesIdioma(lang);

    // Cargar datos dinámicos de Firestore en paralelo
    await Promise.all([
      cargarNumJugadores(),
      cargarConfigGeneral(),
      cargarMensajePersonalizado()
    ]);

  } catch (e) {
    console.error('[info]', e);
  }
}

// ── Aplicar todos los textos según idioma ────────────────────
function aplicarTextos(lang) {
  const es = lang === 'es';

  // Título y cabecera
  const titleEl = document.getElementById('infoTitle');
  if (titleEl) {
    titleEl.innerHTML = es
      ? 'Porra <span>Mundial</span> 2026'
      : 'WorldCup <span>2026</span> Pool';
  }

  setTexto('infoSubtitle', es
    ? 'Canadá · México · Estados Unidos'
    : 'Canada · Mexico · United States');

  setTexto('infoDates', '11 jun – 19 jul 2026');

  // Stats labels
  setTexto('statPlayersLbl', t('info.playersCount'));
  setTexto('statMatchesLbl', t('info.totalMatches'));
  setTexto('statTeamsLbl',   t('info.teams'));
  setTexto('statStartLbl',   t('info.startDate'));

  // Cómo funciona
  setTexto('howTitle',   t('info.howTitle'));
  setTexto('step1title', t('info.steps.1title'));
  setTexto('step1text',  t('info.steps.1text'));
  setTexto('step2title', t('info.steps.2title'));
  setTexto('step2text',  t('info.steps.2text'));
  setTexto('step3title', t('info.steps.3title'));
  setTexto('step3text',  t('info.steps.3text'));
  setTexto('step4title', t('info.steps.4title'));
  setTexto('step4text',  t('info.steps.4text'));

  // Puntuación
  setTexto('scoringTitle',         t('info.scoringTitle'));
  setTexto('scoringGroupsLabel',   '⚽ ' + t('info.groupStage'));
  setTexto('scoringKOLabel',       '⚔️ ' + t('info.knockouts'));
  setTexto('scoringSpecialsLabel', '⭐ ' + t('info.specials'));
  setTexto('sg1', t('standings.criteria.groupWinner'));
  setTexto('sg2', t('standings.criteria.groupExact'));
  setTexto('sg3', t('standings.criteria.groupTie'));
  setTexto('sg4', t('standings.criteria.groupThrough'));
  setTexto('sk1', t('standings.criteria.koWinner'));
  setTexto('sk2', t('standings.criteria.koExact'));
  setTexto('sk3', t('standings.criteria.koDrawPass'));
  setTexto('sk4', t('standings.criteria.koDrawOnly'));
  setTexto('ss1', t('standings.criteria.champion'));
  setTexto('ss2', t('standings.criteria.runnerUp'));
  setTexto('ss3', t('standings.criteria.mvp'));
  setTexto('ss4', t('standings.criteria.topScorer'));

  // Ejemplos
  setTexto('examplesTitle', t('info.examplesTitle'));
  setTexto('exPred',  t('info.prediction') + ':');
  setTexto('exReal',  t('info.actual') + ':');
  setTexto('exPred2', t('info.prediction') + ':');
  setTexto('exReal2', t('info.actual') + ':');
  setTexto('exPred3', t('info.prediction') + ':');
  setTexto('exReal3', t('info.actual') + ':');

  // Premios
  setTexto('prizesTitle',       t('standings.prizes.title'));
  setTexto('prizesTotalLabel',  t('standings.prizes.total') + ':');
  setTexto('prizeColPct',       t('standings.prizes.prize'));
  setTexto('prizeColAmt',       t('standings.prizes.prize'));
  setTexto('prize1Label',       t('standings.prizes.first')  + ' — ' + t('standings.prizes.firstPct'));
  setTexto('prize2Label',       t('standings.prizes.second') + ' — ' + t('standings.prizes.secondPct'));
  setTexto('prize3Label',       t('standings.prizes.third')  + ' — ' + t('standings.prizes.thirdPct'));

  // Fechas
  setTexto('datesTitle',    t('info.datesTitle'));
  setTexto('date1Label',    t('info.date1Label'));
  setTexto('date1Sub',      t('info.date1Sub'));
  setTexto('date1Val',      t('info.date1Val'));
  setTexto('date2Label',    t('info.date2Label'));
  setTexto('date2Sub',      t('info.date2Sub'));
  setTexto('date2Val',      t('info.date2Val'));
  setTexto('warningLabel',  t('info.warningLabel'));
  setTexto('warningSub',    t('info.warningSub'));

  // Pago
  setTexto('payTitle',        t('info.payTitle'));
  setTexto('payIntro',        t('info.payIntro'));
  setTexto('payAmountLabel',  t('info.payAmount'));
  setTexto('btnRevolutText',  t('info.payRevolut'));
  setTexto('btnVippsText',    t('info.payVipps'));
  setTexto('vippsNote',       t('info.vippsNote'));
  setTexto('fullNoticeText',  t('info.fullNotice'));

  // Mensaje personalizado título
  setTexto('customMsgTitle', es ? 'Mensaje del organizador' : 'Message from the organizer');

  // Footer
  setTexto('footerLoginPrompt', t('info.loginPrompt'));
  setTexto('footerLoginBtn',    t('info.loginBtn'));
  setTexto('footerText',        t('info.footer'));

  // Título del documento
  document.title = es
    ? 'Porra Mundial 2026 — Info'
    : 'WorldCup 2026 Pool — Info';

  // Atributo lang del html
  document.documentElement.lang = lang;
}

// ── Cambiar idioma ────────────────────────────────────────────
window.cambiarIdioma = async (lang) => {
  await setLang(lang);
  aplicarTextos(lang);
  actualizarBotonesIdioma(lang);

  // Recargar datos dinámicos por si el mensaje personalizado tiene traducción
  await cargarMensajePersonalizado();
};

function actualizarBotonesIdioma(lang) {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
}

// ── Cargar número de jugadores ────────────────────────────────
async function cargarNumJugadores() {
  try {
    const snap = await getCountFromServer(collection(db, 'usuarios'));
    const el   = document.getElementById('statPlayers');
    if (el) el.textContent = snap.data().count;
  } catch (e) {
    console.warn('[info] No se pudo cargar jugadores:', e);
    const el = document.getElementById('statPlayers');
    if (el) el.textContent = '—';
  }
}

// ── Cargar configuración general (porra llena, enlaces, bote) ─
async function cargarConfigGeneral() {
  try {
    const snap = await getDoc(doc(db, 'config', 'general'));
    if (!snap.exists()) return;
    const config = snap.data();

    // Porra llena → ocultar botones de pago
    if (config.porra_llena) {
      ocultarEl('payBtns');
      ocultarEl('vippsNote');
      mostrarEl('fullNotice');
    }

    // Actualizar enlaces de pago si el admin los cambió
    const btnRevolut = document.getElementById('btnRevolut');
    const btnVipps   = document.getElementById('btnVipps');
    if (btnRevolut && config.enlace_revolut) btnRevolut.href = config.enlace_revolut;
    if (btnVipps   && config.enlace_vipps)   btnVipps.href   = config.enlace_vipps;

    // Bote total y reparto de premios
    if (config.bote_total && config.bote_total > 0) {
      const total = config.bote_total;
      const p1    = Math.round(total * 0.65);
      const p2    = Math.round(total * 0.25);
      const p3    = Math.round(total * 0.10);

      setTexto('prizesTotalAmount', total.toLocaleString() + ' NOK');
      setTexto('prize1Amount',      p1.toLocaleString() + ' NOK');
      setTexto('prize2Amount',      p2.toLocaleString() + ' NOK');
      setTexto('prize3Amount',      p3.toLocaleString() + ' NOK');
      setTexto('prizesNote',        '');
    } else {
      setTexto('prizesTotalAmount', '— NOK');
      setTexto('prize1Amount',      '— NOK');
      setTexto('prize2Amount',      '— NOK');
      setTexto('prize3Amount',      '— NOK');
      setTexto('prizesNote', t('standings.prizes.noTotal'));
    }

  } catch (e) {
    console.warn('[info] No se pudo cargar config:', e);
  }
}

// ── Cargar mensaje personalizado del admin ────────────────────
async function cargarMensajePersonalizado() {
  try {
    const snap = await getDoc(doc(db, 'config', 'info_content'));
    if (!snap.exists()) return;

    const info = snap.data();
    const lang = getLang();
    const msg  = lang === 'en' ? (info.mensaje_en || '') : (info.mensaje_es || '');

    const card    = document.getElementById('customMsgCard');
    const textEl  = document.getElementById('customMsgText');

    if (msg.trim() && card && textEl) {
      textEl.textContent = msg;
      card.classList.remove('hidden');
    } else if (card) {
      card.classList.add('hidden');
    }
  } catch (e) {
    console.warn('[info] No se pudo cargar mensaje personalizado:', e);
  }
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

function setTexto(id, texto) {
  const el = document.getElementById(id);
  if (el) el.textContent = texto;
}

function ocultarEl(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function mostrarEl(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}
