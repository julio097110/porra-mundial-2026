// ============================================================
//  js/previsiones.js
//  Pestaña "Ver todas las predicciones"
//  - Solo visible tras el cierre del plazo de grupos
//  - Tabla comparativa paginada con buscador
//  - Muestra predicciones de grupos, eliminatorias,
//    mejores terceros y especiales
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, query, where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { t } from './i18n.js';
import { plazoAbierto } from './auth.js';
import { PARTIDOS_GRUPOS, GRUPOS, getPartidosPorGrupo } from '../data/partidos.js';

// ── Estado ────────────────────────────────────────────────────
let _app           = null;
let _usuarios      = [];   // [{ uid, nombre }]
let _predicciones  = {};   // { uid: { partidoId: {local,visitante} } }
let _predEsp       = {};   // { uid: { campeon, subcampeon, mvp, goleador } }
let _predElim      = {};   // { uid: { partidoId: {local,visitante,ganador} } }
let _predTerceros  = {};   // { uid: string[] }
let _bracket       = {};   // config/bracket_eliminatorias
let _resultados    = {};   // { partidoId: { goles_local, goles_visitante } }
let _plazoAbierto  = true;
let _plazoElim     = true;
let _plazoTerceros = true;
let _paginaActual  = 1;
let _busqueda      = '';
let _grupoActivo   = 'A';
let _faseActiva    = '1/16';  // fase activa en la vista de eliminatorias
let _vistaActiva   = 'grupos'; // 'grupos' | 'eliminatorias' | 'terceros' | 'especiales'
const POR_PAGINA   = 20;

// ── Definición de fases de eliminatorias ─────────────────────
const FASES_ELIM = [
  { id: '1/16', label: '1/16',    prefijo: 'r32',   partidos: 16 },
  { id: '1/8',  label: '1/8',     prefijo: 'r16',   partidos: 8  },
  { id: '1/4',  label: 'Cuartos', prefijo: 'qf',    partidos: 4  },
  { id: 'semi', label: 'Semis',   prefijo: 'sf',    partidos: 2  },
  { id: '3er',  label: '3er/4º',  prefijo: 'tp',    partidos: 1  },
  { id: 'final',label: 'Final',   prefijo: 'final', partidos: 1  },
];

// ── Punto de entrada ─────────────────────────────────────────
export async function initPrevisiones(app) {
  _app = app;
  const contenedor = document.getElementById('previsionesContent');
  contenedor.innerHTML = `
    <div class="loading-inline">
      <div class="spinner-sm"></div>
      <span>${t('common.loading')}</span>
    </div>`;

  try {
    // Cargar los tres plazos de forma independiente
    try { _plazoAbierto  = await plazoAbierto('grupos');        } catch(e) { _plazoAbierto  = true;  }
    try { _plazoElim     = await plazoAbierto('eliminatorias'); } catch(e) { _plazoElim     = true;  }
    try { _plazoTerceros = await plazoAbierto('terceros');      } catch(e) { _plazoTerceros = true;  }

    if (_plazoAbierto) {
      contenedor.innerHTML = `
        <div style="margin-top:16px;">
          <div class="notice locked" style="flex-direction:column; align-items:flex-start; gap:6px;">
            <strong>🔒 ${t('allPredictions.lockedNotice')}</strong>
            <span style="font-size:11px;">Las predicciones de los demás jugadores estarán disponibles cuando se cierre el plazo de predicciones.</span>
          </div>
        </div>`;
      return;
    }

    // Cargar datos base siempre
    await Promise.all([
      cargarUsuarios(),
      cargarTodasPredicciones(),
      cargarTodasEspeciales(),
      cargarResultados(),
    ]);

    // Cargar eliminatorias y terceros de forma independiente (no bloquean si fallan)
    try { await cargarTodasPrediccionesElim();    } catch(e) { console.warn('[previsiones] elim:', e); }
    try { await cargarTodasPrediccionesTerceros();} catch(e) { console.warn('[previsiones] terceros:', e); }
    try { await cargarBracket();                  } catch(e) { console.warn('[previsiones] bracket:', e); }

    renderPrevisiones(contenedor);

    window._refreshTextos = () => {
      const c = document.getElementById('previsionesContent');
      if (c) renderPrevisiones(c);
    };

  } catch (e) {
    console.error('[previsiones]', e);
    contenedor.innerHTML = `<div class="notice error">⚠️ ${t('common.error')}</div>`;
  }
}

// ── Render principal ──────────────────────────────────────────
function renderPrevisiones(contenedor) {
  const usuariosFiltrados = filtrarUsuarios();
  const totalPags = Math.ceil(usuariosFiltrados.length / POR_PAGINA);
  const inicio    = (_paginaActual - 1) * POR_PAGINA;
  const pagina    = usuariosFiltrados.slice(inicio, inicio + POR_PAGINA);

  let html = `<div style="margin-top:8px;">`;

  // Buscador
  html += `
    <div class="prev-search">
      <span class="prev-search-icon">🔍</span>
      <input
        class="prev-search-input"
        type="text"
        placeholder="${t('allPredictions.searchPlaceholder')}"
        value="${_busqueda}"
        oninput="window._prevBuscar(this.value)"
      >
    </div>`;

  // Toggle de 4 vistas
  html += `
    <div class="sub-toggle" style="margin-bottom:12px;">
      <button class="sub-btn ${_vistaActiva === 'grupos' ? 'active' : ''}"
        onclick="window._prevVista('grupos')">${t('subNav.groupStage')}</button>
      <button class="sub-btn ${_vistaActiva === 'eliminatorias' ? 'active' : ''}"
        onclick="window._prevVista('eliminatorias')">${t('subNav.knockouts')}</button>
      <button class="sub-btn ${_vistaActiva === 'terceros' ? 'active' : ''}"
        onclick="window._prevVista('terceros')">${t('subNav.thirdPlace')}</button>
      <button class="sub-btn ${_vistaActiva === 'especiales' ? 'active' : ''}"
        onclick="window._prevVista('especiales')">${t('subNav.specials')}</button>
    </div>`;

  if (_vistaActiva === 'grupos') {
    html += renderVistaGrupos(pagina);
  } else if (_vistaActiva === 'eliminatorias') {
    html += renderVistaEliminatorias(pagina);
  } else if (_vistaActiva === 'terceros') {
    html += renderVistaTerceros(pagina);
  } else {
    html += renderVistaEspeciales(pagina);
  }

  // Paginación (solo en vistas con tabla de jugadores)
  if (_vistaActiva !== 'eliminatorias' || !_plazoElim) {
    if (totalPags > 1) {
      html += `<div class="pagination" style="margin-top:10px;">`;
      if (_paginaActual > 1) {
        html += `<button class="pag-btn" onclick="window._prevPagina(${_paginaActual - 1})">‹</button>`;
      }
      const maxBtns = 5;
      let start = Math.max(1, _paginaActual - 2);
      let end   = Math.min(totalPags, start + maxBtns - 1);
      if (end - start < maxBtns - 1) start = Math.max(1, end - maxBtns + 1);

      for (let i = start; i <= end; i++) {
        html += `<button class="pag-btn ${i === _paginaActual ? 'active' : ''}"
          onclick="window._prevPagina(${i})">${i}</button>`;
      }
      if (_paginaActual < totalPags) {
        html += `<button class="pag-btn" onclick="window._prevPagina(${_paginaActual + 1})">›</button>`;
      }
      html += `<span class="pag-info">${usuariosFiltrados.length} ${t('allPredictions.players')} · ${t('allPredictions.page')} ${_paginaActual} ${t('allPredictions.of')} ${totalPags}</span>`;
      html += `</div>`;
    }
  }

  html += `<div class="prev-legend">${t('allPredictions.legend')}</div>`;
  html += `</div>`;

  contenedor.innerHTML = html;

  // Handlers globales
  window._prevBuscar = (val) => {
    _busqueda     = val;
    _paginaActual = 1;
    const c = document.getElementById('previsionesContent');
    if (c) renderPrevisiones(c);
  };
  window._prevPagina = (pag) => {
    _paginaActual = pag;
    const c = document.getElementById('previsionesContent');
    if (c) renderPrevisiones(c);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  window._prevVista = (vista) => {
    _vistaActiva  = vista;
    _paginaActual = 1;
    const c = document.getElementById('previsionesContent');
    if (c) renderPrevisiones(c);
  };
  window._prevGrupo = (g) => {
    _grupoActivo  = g;
    const c = document.getElementById('previsionesContent');
    if (c) renderPrevisiones(c);
  };
  window._prevFase = (f) => {
    _faseActiva   = f;
    const c = document.getElementById('previsionesContent');
    if (c) renderPrevisiones(c);
  };
}

// ══════════════════════════════════════════════════════════════
//  VISTA GRUPOS
// ══════════════════════════════════════════════════════════════

function renderVistaGrupos(pagina) {
  const selectorGrupo = `
    <div class="pag-row" style="flex-wrap:wrap; margin-bottom:12px;">
      ${GRUPOS.map(g => `
        <button class="pag-btn ${_grupoActivo === g ? 'active' : ''}"
          onclick="window._prevGrupo('${g}')">${g}</button>
      `).join('')}
    </div>`;

  const partidos = getPartidosPorGrupo(_grupoActivo);

  const colsPartidos = partidos.map(p => {
    const teamL = abreviar(p.local, 3);
    const teamV = abreviar(p.visitante, 3);
    return `${p.flagLocal}${teamL}<br>vs<br>${p.flagVisitante}${teamV}`;
  });

  let html = selectorGrupo;

  html += `
    <div class="prev-table-wrap">
      <div class="prev-header">
        <div class="prev-col-name">${t('standings.player')}</div>
        ${colsPartidos.map(c => `
          <div class="prev-col-match" style="font-size:9px; line-height:1.3;">${c}</div>
        `).join('')}
      </div>`;

  pagina.forEach(u => {
    const esYo = u.uid === _app.uid;
    const predU = _predicciones[u.uid] || {};

    html += `
      <div class="prev-row ${esYo ? 'me' : ''}">
        <div class="prev-cell-name">
          ${u.nombre}
          ${esYo ? `<span class="s-you" style="font-size:9px;">${t('allPredictions.you')}</span>` : ''}
        </div>
        ${partidos.map(p => {
          const pred = predU[p.id];
          const res  = _resultados[p.id];

          if (!pred || pred.local === '' || pred.visitante === '') {
            return `<div class="prev-cell">—</div>`;
          }

          const texto = `${pred.local}—${pred.visitante}`;

          if (!res) {
            return `<div class="prev-cell">${texto}</div>`;
          }

          const exacto  = pred.local === res.goles_local && pred.visitante === res.goles_visitante;
          const ganador = !exacto && signo(pred.local, pred.visitante) === signo(res.goles_local, res.goles_visitante);

          if (exacto)  return `<div class="prev-cell exact">${texto} ${t('allPredictions.exact')}</div>`;
          if (ganador) return `<div class="prev-cell">${texto}</div>`;
          return `<div class="prev-cell miss">${texto} ${t('allPredictions.missed')}</div>`;
        }).join('')}
      </div>`;
  });

  html += `</div>`;
  return html;
}

// ══════════════════════════════════════════════════════════════
//  VISTA ELIMINATORIAS
// ══════════════════════════════════════════════════════════════

function renderVistaEliminatorias(pagina) {
  // Plazo aún abierto → bloqueado
  if (_plazoElim) {
    return `
      <div class="notice locked" style="margin-top:4px;">
        🔒 Las predicciones de eliminatorias estarán visibles cuando se cierre el plazo.
      </div>`;
  }

  // Selector de fase
  const selectorFase = `
    <div class="pag-row" style="flex-wrap:wrap; margin-bottom:12px;">
      ${FASES_ELIM.map(f => `
        <button class="pag-btn ${_faseActiva === f.id ? 'active' : ''}"
          onclick="window._prevFase('${f.id}')">${f.label}</button>
      `).join('')}
    </div>`;

  const fase = FASES_ELIM.find(f => f.id === _faseActiva);
  if (!fase) return selectorFase;

  // Obtener los partidos de esta fase desde el bracket
  const partidosFase = obtenerPartidosDeFase(_faseActiva);

  let html = selectorFase;

  html += `
    <div class="prev-table-wrap">
      <div class="prev-header">
        <div class="prev-col-name">${t('standings.player')}</div>
        ${partidosFase.map(p => {
          const eqL = p.equipoLocal    || p.placeholderLocal    || '?';
          const eqV = p.equipoVisitante|| p.placeholderVisitante|| '?';
          return `<div class="prev-col-match" style="font-size:9px; line-height:1.3;">
            ${abreviar(eqL, 4)}<br>vs<br>${abreviar(eqV, 4)}
          </div>`;
        }).join('')}
      </div>`;

  pagina.forEach(u => {
    const esYo  = u.uid === _app.uid;
    const predU = _predElim[u.uid] || {};

    html += `
      <div class="prev-row ${esYo ? 'me' : ''}">
        <div class="prev-cell-name">
          ${u.nombre}
          ${esYo ? `<span class="s-you" style="font-size:9px;">${t('allPredictions.you')}</span>` : ''}
        </div>
        ${partidosFase.map(p => {
          const pred = predU[p.id];
          if (!pred) return `<div class="prev-cell">—</div>`;

          const local    = pred.local     ?? '';
          const visitante= pred.visitante ?? '';
          const ganador  = pred.ganador   || null;

          if (local === '' && visitante === '') {
            return `<div class="prev-cell">—</div>`;
          }

          const scoreTexto = (local !== '' && visitante !== '')
            ? `${local}—${visitante}`
            : '?—?';

          const ganadorTexto = ganador
            ? `<br><span style="font-size:9px; color:var(--gm); font-weight:600;">→ ${abreviar(ganador, 8)}</span>`
            : '';

          return `<div class="prev-cell" style="font-size:10px; line-height:1.4;">
            ${scoreTexto}${ganadorTexto}
          </div>`;
        }).join('')}
      </div>`;
  });

  html += `</div>`;

  // Paginación para eliminatorias
  const usuariosFiltrados = filtrarUsuarios();
  const totalPags = Math.ceil(usuariosFiltrados.length / POR_PAGINA);
  if (totalPags > 1) {
    html += `<div class="pagination" style="margin-top:10px;">`;
    if (_paginaActual > 1) {
      html += `<button class="pag-btn" onclick="window._prevPagina(${_paginaActual - 1})">‹</button>`;
    }
    const maxBtns = 5;
    let start = Math.max(1, _paginaActual - 2);
    let end   = Math.min(totalPags, start + maxBtns - 1);
    if (end - start < maxBtns - 1) start = Math.max(1, end - maxBtns + 1);
    for (let i = start; i <= end; i++) {
      html += `<button class="pag-btn ${i === _paginaActual ? 'active' : ''}"
        onclick="window._prevPagina(${i})">${i}</button>`;
    }
    if (_paginaActual < totalPags) {
      html += `<button class="pag-btn" onclick="window._prevPagina(${_paginaActual + 1})">›</button>`;
    }
    html += `<span class="pag-info">${usuariosFiltrados.length} ${t('allPredictions.players')} · ${t('allPredictions.page')} ${_paginaActual} ${t('allPredictions.of')} ${totalPags}</span>`;
    html += `</div>`;
  }

  return html;
}

// ── Obtener partidos de una fase con equipos del bracket ──────
function obtenerPartidosDeFase(faseId) {
  // Definición estática de partidos por fase con placeholders
  const definicion = {
    '1/16': [
      { id:'r32_1',  pL:'2º Grupo A',    pV:'2º Grupo B'         },
      { id:'r32_2',  pL:'1º Grupo C',    pV:'2º Grupo F'         },
      { id:'r32_3',  pL:'1º Grupo E',    pV:'Mej. 3º A/B/C/D/F' },
      { id:'r32_4',  pL:'1º Grupo F',    pV:'2º Grupo C'         },
      { id:'r32_5',  pL:'2º Grupo E',    pV:'2º Grupo I'         },
      { id:'r32_6',  pL:'1º Grupo I',    pV:'Mej. 3º C/D/F/G/H' },
      { id:'r32_7',  pL:'1º Grupo A',    pV:'Mej. 3º C/E/F/H/I' },
      { id:'r32_8',  pL:'1º Grupo L',    pV:'Mej. 3º E/H/I/J/K' },
      { id:'r32_9',  pL:'1º Grupo D',    pV:'Mej. 3º B/E/F/I/J' },
      { id:'r32_10', pL:'1º Grupo G',    pV:'Mej. 3º A/E/H/I/J' },
      { id:'r32_11', pL:'2º Grupo K',    pV:'2º Grupo L'         },
      { id:'r32_12', pL:'1º Grupo H',    pV:'2º Grupo J'         },
      { id:'r32_13', pL:'1º Grupo B',    pV:'Mej. 3º E/F/G/I/J' },
      { id:'r32_14', pL:'1º Grupo J',    pV:'2º Grupo H'         },
      { id:'r32_15', pL:'1º Grupo K',    pV:'Mej. 3º D/E/I/J/L' },
      { id:'r32_16', pL:'2º Grupo D',    pV:'2º Grupo G'         },
    ],
    '1/8': [
      { id:'r16_1', pL:'Gan. P1',  pV:'Gan. P2'  },
      { id:'r16_2', pL:'Gan. P3',  pV:'Gan. P4'  },
      { id:'r16_3', pL:'Gan. P5',  pV:'Gan. P6'  },
      { id:'r16_4', pL:'Gan. P7',  pV:'Gan. P8'  },
      { id:'r16_5', pL:'Gan. P9',  pV:'Gan. P10' },
      { id:'r16_6', pL:'Gan. P11', pV:'Gan. P12' },
      { id:'r16_7', pL:'Gan. P13', pV:'Gan. P14' },
      { id:'r16_8', pL:'Gan. P15', pV:'Gan. P16' },
    ],
    '1/4': [
      { id:'qf_1', pL:'Gan. 1/8 A', pV:'Gan. 1/8 B' },
      { id:'qf_2', pL:'Gan. 1/8 C', pV:'Gan. 1/8 D' },
      { id:'qf_3', pL:'Gan. 1/8 E', pV:'Gan. 1/8 F' },
      { id:'qf_4', pL:'Gan. 1/8 G', pV:'Gan. 1/8 H' },
    ],
    'semi': [
      { id:'sf_1', pL:'Gan. QF1', pV:'Gan. QF2' },
      { id:'sf_2', pL:'Gan. QF3', pV:'Gan. QF4' },
    ],
    '3er': [
      { id:'tp_1', pL:'Perd. Semi 1', pV:'Perd. Semi 2' },
    ],
    'final': [
      { id:'final_1', pL:'Gan. Semi 1', pV:'Gan. Semi 2' },
    ],
  };

  return (definicion[faseId] || []).map(c => {
    const b = _bracket[c.id] || {};
    return {
      id:                  c.id,
      equipoLocal:         b.equipoLocal      || null,
      equipoVisitante:     b.equipoVisitante  || null,
      placeholderLocal:    c.pL,
      placeholderVisitante:c.pV,
    };
  });
}

// ══════════════════════════════════════════════════════════════
//  VISTA MEJORES TERCEROS
// ══════════════════════════════════════════════════════════════

function renderVistaTerceros(pagina) {
  // Plazo aún abierto → bloqueado
  if (_plazoTerceros) {
    return `
      <div class="notice locked" style="margin-top:4px;">
        🔒 Las predicciones de mejores terceros estarán visibles cuando se cierre el plazo.
      </div>`;
  }

  // Construir la lista ordenada de equipos que aparecen en al menos una predicción,
  // ordenados por grupo. Cada entrada: { nombre, grupo }
  const grupoDeEquipo = (nombre) => {
    const p = PARTIDOS_GRUPOS.find(p => p.local === nombre || p.visitante === nombre);
    return p?.grupo || 'Z';
  };

  // Recoger todos los equipos distintos elegidos por cualquier jugador
  const equiposSet = new Set();
  Object.values(_predTerceros).forEach(arr => {
    if (Array.isArray(arr)) arr.forEach(e => equiposSet.add(e));
  });

  // Ordenar por grupo
  const equiposOrdenados = [...equiposSet].map(nombre => ({
    nombre,
    grupo: grupoDeEquipo(nombre)
  })).sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nombre.localeCompare(b.nombre));

  if (equiposOrdenados.length === 0) {
    return `<div class="notice" style="margin-top:8px;">Aún no hay predicciones de mejores terceros guardadas.</div>`;
  }

  // Cabecera: una columna por equipo con "Nombre (Grupo X)"
  // Usamos la clave i18n 'common.group' para "Grupo" / "Group"
  const grupoLabel = t('common.group');

  let html = `
    <div class="prev-table-wrap">
      <div class="prev-header">
        <div class="prev-col-name">${t('standings.player')}</div>
        ${equiposOrdenados.map(e => `
          <div class="prev-col-match" style="font-size:9px; line-height:1.3; white-space:normal;">
            ${e.nombre}<br>
            <span style="color:var(--tm); font-size:8px;">(${grupoLabel} ${e.grupo})</span>
          </div>
        `).join('')}
      </div>`;

  pagina.forEach(u => {
    const esYo    = u.uid === _app.uid;
    const elegidos = new Set(_predTerceros[u.uid] || []);

    html += `
      <div class="prev-row ${esYo ? 'me' : ''}">
        <div class="prev-cell-name">
          ${u.nombre}
          ${esYo ? `<span class="s-you" style="font-size:9px;">${t('allPredictions.you')}</span>` : ''}
        </div>
        ${equiposOrdenados.map(e => {
          if (elegidos.has(e.nombre)) {
            return `<div class="prev-cell exact" style="font-size:10px;">✓</div>`;
          }
          return `<div class="prev-cell" style="font-size:10px; color:#ccc;">—</div>`;
        }).join('')}
      </div>`;
  });

  html += `</div>`;
  return html;
}

// ══════════════════════════════════════════════════════════════
//  VISTA ESPECIALES
// ══════════════════════════════════════════════════════════════

function renderVistaEspeciales(pagina) {
  let html = `
    <div class="prev-table-wrap">
      <div class="prev-header" style="display:grid; grid-template-columns:100px 1fr 1fr 1fr 1fr; min-width:500px;">
        <div class="prev-col-name">${t('standings.player')}</div>
        <div class="prev-col-match">🏆 ${t('specials.champion')}</div>
        <div class="prev-col-match">🥈 ${t('specials.runnerUp')}</div>
        <div class="prev-col-match">⭐ ${t('specials.mvp')}</div>
        <div class="prev-col-match">⚽ ${t('specials.topScorer')}</div>
      </div>`;

  pagina.forEach(u => {
    const esYo = u.uid === _app.uid;
    const esp  = _predEsp[u.uid] || {};

    html += `
      <div class="prev-row ${esYo ? 'me' : ''}" style="display:grid; grid-template-columns:100px 1fr 1fr 1fr 1fr; min-width:500px;">
        <div class="prev-cell-name" style="width:100px; flex-shrink:0;">
          ${u.nombre}
          ${esYo ? `<span class="s-you" style="font-size:9px;">${t('allPredictions.you')}</span>` : ''}
        </div>
        <div class="prev-cell" style="font-size:11px; text-align:left; padding-left:8px;">
          ${esp.campeon    || '—'}
        </div>
        <div class="prev-cell" style="font-size:11px; text-align:left; padding-left:8px;">
          ${esp.subcampeon || '—'}
        </div>
        <div class="prev-cell" style="font-size:11px; text-align:left; padding-left:8px;">
          ${esp.mvp        || '—'}
        </div>
        <div class="prev-cell" style="font-size:11px; text-align:left; padding-left:8px;">
          ${esp.goleador   || '—'}
        </div>
      </div>`;
  });

  html += `</div>`;
  return html;
}

// ══════════════════════════════════════════════════════════════
//  CARGA DE DATOS
// ══════════════════════════════════════════════════════════════

async function cargarUsuarios() {
  const snap = await getDocs(collection(db, 'usuarios'));
  _usuarios = snap.docs.map(d => ({
    uid:    d.id,
    nombre: d.data().nombre_visible || d.data().username || '—'
  })).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

async function cargarTodasPredicciones() {
  const snap = await getDocs(collection(db, 'predicciones'));
  snap.forEach(d => {
    const data = d.data();
    if (!data.uid || !data.partido_id) return;
    if (!_predicciones[data.uid]) _predicciones[data.uid] = {};
    if (data.partido_id === 'desempates') return;
    _predicciones[data.uid][data.partido_id] = {
      local:     data.local,
      visitante: data.visitante
    };
  });
}

async function cargarTodasEspeciales() {
  const snap = await getDocs(collection(db, 'pred_especiales'));
  snap.forEach(d => {
    _predEsp[d.id] = d.data();
  });
}

async function cargarResultados() {
  const snap = await getDocs(collection(db, 'resultados'));
  snap.forEach(d => {
    _resultados[d.id] = d.data();
  });
}

async function cargarTodasPrediccionesElim() {
  const snap = await getDocs(collection(db, 'predicciones_elim'));
  snap.forEach(d => {
    const data = d.data();
    if (!data.uid || !data.partido_id) return;
    if (!_predElim[data.uid]) _predElim[data.uid] = {};
    _predElim[data.uid][data.partido_id] = {
      local:     data.local,
      visitante: data.visitante,
      ganador:   data.ganador || null
    };
  });
}

async function cargarTodasPrediccionesTerceros() {
  const snap = await getDocs(collection(db, 'pred_terceros'));
  snap.forEach(d => {
    const data = d.data();
    if (!data.uid) return;
    _predTerceros[data.uid] = data.equipos || [];
  });
}

async function cargarBracket() {
  const snap = await getDoc(doc(db, 'config', 'bracket_eliminatorias'));
  if (snap.exists()) _bracket = snap.data();
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

function filtrarUsuarios() {
  if (!_busqueda.trim()) return _usuarios;
  const b = _busqueda.toLowerCase().trim();
  return _usuarios.filter(u => u.nombre.toLowerCase().includes(b));
}

function abreviar(nombre, max) {
  if (!nombre) return '?';
  const palabras = nombre.split(' ');
  if (palabras[0].length <= max) return palabras[0];
  return palabras[0].substring(0, max);
}

function signo(a, b) {
  const na = parseInt(a), nb = parseInt(b);
  if (na > nb)  return 1;
  if (na < nb)  return -1;
  return 0;
}
