// ============================================================
//  js/clasificacion.js
//  Pestaña "Clasificación"
//  - Ranking de jugadores con puntos y premios
//  - Criterios de puntuación al final
//  - Escucha cambios en tiempo real
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs,
  onSnapshot, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { t } from './i18n.js';

// ── Estado ────────────────────────────────────────────────────
let _app         = null;
let _ranking     = [];    // [{ uid, nombre, total, pagina }]
let _config      = {};    // config general (bote_total)
let _paginaActual= 1;
const POR_PAGINA = 20;
let _unsubscribe = null;

// ── Punto de entrada ─────────────────────────────────────────
export async function initClasificacion(app) {
  _app = app;
  const contenedor = document.getElementById('clasificacionContent');
  contenedor.innerHTML = `
    <div class="loading-inline">
      <div class="spinner-sm"></div>
      <span>${t('common.loading')}</span>
    </div>`;

  try {
    // Cargar config (bote_total)
    const configSnap = await getDoc(doc(db, 'config', 'general'));
    _config = configSnap.exists() ? configSnap.data() : {};

    // Cargar ranking inicial
    await cargarRanking();
    renderClasificacion(contenedor);

    // Escuchar cambios en tiempo real en clasificacion
    _unsubscribe = onSnapshot(
      collection(db, 'clasificacion'),
      async () => {
        await cargarRanking();
        const c = document.getElementById('clasificacionContent');
        if (c) renderClasificacion(c);
      }
    );

  } catch (e) {
    console.error('[clasificacion]', e);
    contenedor.innerHTML = `<div class="notice error">⚠️ ${t('common.error')}</div>`;
  }
}

// ── Cargar y ordenar ranking ──────────────────────────────────
async function cargarRanking() {
  try {
    // Obtener todos los usuarios
    const usuariosSnap = await getDocs(collection(db, 'usuarios'));
    const usuarios = {};
    usuariosSnap.forEach(d => {
      usuarios[d.id] = d.data();
    });

    // Obtener puntuaciones
    const clSnap = await getDocs(collection(db, 'clasificacion'));
    const puntos = {};
    clSnap.forEach(d => {
      puntos[d.id] = d.data().total || 0;
    });

    // Combinar y ordenar
    _ranking = Object.entries(usuarios)
      .map(([uid, u]) => ({
        uid,
        nombre:  u.nombre_visible || u.username || '—',
        total:   puntos[uid] || 0,
        esYo:    uid === _app.uid
      }))
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        // Empate → orden alfabético
        return a.nombre.localeCompare(b.nombre);
      });

  } catch (e) {
    console.error('[cargarRanking]', e);
  }
}

// ── Render principal ──────────────────────────────────────────
function renderClasificacion(contenedor) {
  const bote   = _config.bote_total || 0;
  const p1     = bote ? Math.round(bote * 0.65) : null;
  const p2     = bote ? Math.round(bote * 0.25) : null;
  const p3     = bote ? Math.round(bote * 0.10) : null;

  // Encontrar posición del usuario actual
  const miPos = _ranking.findIndex(r => r.uid === _app.uid) + 1;

  // Paginación
  const totalPags  = Math.ceil(_ranking.length / POR_PAGINA);
  const inicio     = (_paginaActual - 1) * POR_PAGINA;
  const pagina     = _ranking.slice(inicio, inicio + POR_PAGINA);

  // Si el usuario no está en la página actual, asegurarse de mostrarlo
  const usuarioEnPagina = pagina.some(r => r.uid === _app.uid);

  let html = `<div style="margin-top:8px;">`;

  // Notice de jornada
  html += `
    <div class="notice">
      📊 ${t('standings.matchday')} ${t('standings.played')} · ${contarPartidosJugados()} ${t('standings.matches')} 72
    </div>`;

  // Tarjeta bote total (si existe)
  if (bote > 0) {
    html += `
      <div style="background:var(--goldp); border:1px solid #f0d88a; border-radius:10px; padding:12px 14px; margin-bottom:14px;">
        <div style="font-size:12px; color:#856404; font-weight:500; margin-bottom:4px;">
          💰 ${t('standings.prizes.total')}
        </div>
        <div style="font-family:'Bebas Neue',sans-serif; font-size:28px; color:#6d4c00; letter-spacing:1px; margin-bottom:8px;">
          ${bote.toLocaleString()} NOK
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <span style="font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; background:rgba(200,168,50,.15); color:#6d4c00;">
            🥇 ${p1.toLocaleString()} NOK
          </span>
          <span style="font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; background:rgba(200,168,50,.15); color:#6d4c00;">
            🥈 ${p2.toLocaleString()} NOK
          </span>
          <span style="font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; background:rgba(200,168,50,.15); color:#6d4c00;">
            🥉 ${p3.toLocaleString()} NOK
          </span>
        </div>
      </div>`;
  }

  // Si el usuario no está en la página visible, mostrar su posición arriba
  if (!usuarioEnPagina && miPos > 0) {
    const yo = _ranking[miPos - 1];
    html += renderFilaStandings(yo, miPos, p1, p2, p3, true);
    html += `<div style="text-align:center; font-size:11px; color:var(--tm); margin:4px 0 10px;">· · · tu posición · · ·</div>`;
  }

  // Tabla
  html += `
    <div class="standings-wrap">
      <div class="standings-header" style="grid-template-columns:30px 1fr 42px 42px ${bote ? '80px' : ''};">
        <div class="sh">#</div>
        <div class="sh left">${t('standings.player')}</div>
        <div class="sh">${t('standings.points')}</div>
        <div class="sh">${t('standings.diff')}</div>
        ${bote ? `<div class="sh" style="text-align:right;">${t('standings.prizeCol')}</div>` : ''}
      </div>`;

  pagina.forEach((jugador, i) => {
    const pos = inicio + i + 1;
    html += renderFilaStandings(jugador, pos, p1, p2, p3, false, bote > 0);
  });

  html += `</div>`;

  // Paginación
  if (totalPags > 1) {
    html += `<div class="pagination">`;
    if (_paginaActual > 1) {
      html += `<button class="pag-btn" onclick="window._clPagina(${_paginaActual - 1})">‹</button>`;
    }
    for (let i = 1; i <= totalPags; i++) {
      html += `<button class="pag-btn ${i === _paginaActual ? 'active' : ''}"
        onclick="window._clPagina(${i})">${i}</button>`;
    }
    if (_paginaActual < totalPags) {
      html += `<button class="pag-btn" onclick="window._clPagina(${_paginaActual + 1})">›</button>`;
    }
    html += `<span class="pag-info">${_ranking.length} ${t('standings.player').toLowerCase()} · ${t('common.page')} ${_paginaActual} de ${totalPags}</span>`;
    html += `</div>`;
  }

  // Criterios de puntuación + reparto
  html += renderCriterios(bote, p1, p2, p3);

  html += `</div>`;
  contenedor.innerHTML = html;

  // Handler paginación
  window._clPagina = (pag) => {
    _paginaActual = pag;
    const c = document.getElementById('clasificacionContent');
    if (c) renderClasificacion(c);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
}

// ── Fila de la tabla de standings ────────────────────────────
function renderFilaStandings(jugador, pos, p1, p2, p3, destacado = false, mostrarPremio = false) {
  const lider = _ranking[0]?.total || 0;
  const diff  = jugador.total - lider;
  const diffStr = pos === 1 ? '—' : diff.toString();

  let posIcon = pos;
  let posClass = '';
  let rowClass = jugador.esYo ? 'me' : '';

  if (pos === 1) { posIcon = '1'; posClass = 'gold'; }
  else if (pos === 2) { posIcon = '2'; posClass = 'silver'; }
  else if (pos === 3) { posIcon = '3'; posClass = 'bronze'; }

  let premioHtml = '';
  if (mostrarPremio) {
    if (pos === 1 && p1) premioHtml = `<div class="s-prize prize-1">${p1.toLocaleString()} NOK</div>`;
    else if (pos === 2 && p2) premioHtml = `<div class="s-prize prize-2">${p2.toLocaleString()} NOK</div>`;
    else if (pos === 3 && p3) premioHtml = `<div class="s-prize prize-3">${p3.toLocaleString()} NOK</div>`;
    else premioHtml = `<div class="s-prize prize-none">—</div>`;
  }

  const medallaEmoji = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '';

  return `
    <div class="standings-row ${rowClass} ${pos <= 3 ? 'top3' : ''}"
      style="grid-template-columns:30px 1fr 42px 42px ${mostrarPremio ? '80px' : ''};">
      <div class="s-pos ${posClass}">${pos}</div>
      <div class="s-name">
        ${medallaEmoji ? medallaEmoji + ' ' : ''}${jugador.nombre}
        ${jugador.esYo ? `<span class="s-you">${t('standings.you')}</span>` : ''}
      </div>
      <div class="s-pts">${jugador.total}</div>
      <div class="s-diff ${diff < 0 ? 'neg' : ''}">${diffStr}</div>
      ${premioHtml}
    </div>`;
}

// ── Criterios de puntuación + reparto ────────────────────────
function renderCriterios(bote, p1, p2, p3) {
  return `
    <div class="criteria-box" style="margin-top:14px;">
      <div class="criteria-title">📋 ${t('standings.criteriaTitle')}</div>

      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.groupWinner')}</span>
        <span class="criteria-pts">${t('standings.pts.groupWinner')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.groupExact')}</span>
        <span class="criteria-pts">${t('standings.pts.groupExact')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.groupThrough')}</span>
        <span class="criteria-pts">${t('standings.pts.groupThrough')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.groupTie')}</span>
        <span class="criteria-pts">${t('standings.pts.groupTie')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.koWinner')}</span>
        <span class="criteria-pts">${t('standings.pts.koWinner')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.koExact')}</span>
        <span class="criteria-pts">${t('standings.pts.koExact')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.koDrawPass')}</span>
        <span class="criteria-pts">${t('standings.pts.koDrawPass')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.koDrawOnly')}</span>
        <span class="criteria-pts">${t('standings.pts.koDrawOnly')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.champion')}</span>
        <span class="criteria-pts">${t('standings.pts.champion')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.runnerUp')}</span>
        <span class="criteria-pts">${t('standings.pts.runnerUp')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.mvp')}</span>
        <span class="criteria-pts">${t('standings.pts.mvp')}</span>
      </div>
      <div class="criteria-row">
        <span class="criteria-text">${t('standings.criteria.topScorer')}</span>
        <span class="criteria-pts">${t('standings.pts.topScorer')}</span>
      </div>

      ${bote ? `
        <div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(192,221,151,.4);">
          <div class="criteria-title">💰 ${t('standings.prizes.title')}</div>
          <div class="criteria-row">
            <span class="criteria-text">🥇 ${t('standings.prizes.first')}</span>
            <span class="criteria-pts" style="color:var(--gold);">${t('standings.prizes.firstPct')} · ${p1?.toLocaleString()} NOK</span>
          </div>
          <div class="criteria-row">
            <span class="criteria-text">🥈 ${t('standings.prizes.second')}</span>
            <span class="criteria-pts" style="color:#888;">${t('standings.prizes.secondPct')} · ${p2?.toLocaleString()} NOK</span>
          </div>
          <div class="criteria-row">
            <span class="criteria-text">🥉 ${t('standings.prizes.third')}</span>
            <span class="criteria-pts" style="color:#a0522d;">${t('standings.prizes.thirdPct')} · ${p3?.toLocaleString()} NOK</span>
          </div>
        </div>
      ` : `
        <div style="margin-top:10px; font-size:11px; color:var(--tm);">
          ${t('standings.prizes.noTotal')}
        </div>
      `}
    </div>`;
}

// ── Helper: contar partidos jugados ──────────────────────────
function contarPartidosJugados() {
  return Object.values(
    (window._resultadosCache || {})
  ).filter(r => r.confirmado).length;
}
