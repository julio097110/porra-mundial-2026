// ============================================================
//  js/prediccion.js
//  Pestaña "Mi porra" — fase de grupos, eliminatorias y especiales
// ============================================================

import { db } from './firebase-config.js';
import {
  doc, getDoc, setDoc, updateDoc, collection,
  query, where, getDocs, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { t, formatMatchDate } from './i18n.js';
import { plazoAbierto, obtenerConfig } from './auth.js';
import {
  PARTIDOS_GRUPOS, GRUPOS, EQUIPOS_48,
  getPartidosPorGrupo
} from '../data/partidos.js';

// ── Estado del módulo ─────────────────────────────────────────
let _app         = null;
let _subTab      = 'grupos';   // 'grupos' | 'eliminatorias'
let _grupoActivo = 'A';
let _predGrupos  = {};         // { partidoId: { local, visitante, desempates } }
let _predElim    = {};         // { partidoId: { local, visitante, penaltiGanador } }
let _predEsp     = {};         // { campeon, subcampeon, mvp, goleador }
let _resultados  = {};         // resultados reales confirmados
let _bracket     = {};         // cruces de eliminatorias de la API
let _plazoGrupos = true;
let _plazoElim   = true;
let _config      = {};

// ── Punto de entrada ─────────────────────────────────────────
export async function initMiPorra(app) {
  _app = app;
  const contenedor = document.getElementById('miPorraContent');
  contenedor.innerHTML = `<div class="loading-inline"><div class="spinner-sm"></div><span>${t('common.loading')}</span></div>`;

  try {
    // Cargar todo en paralelo
    [_plazoGrupos, _plazoElim, _config] = await Promise.all([
      plazoAbierto('grupos'),
      plazoAbierto('eliminatorias'),
      obtenerConfig()
    ]);

    await Promise.all([
      cargarPrediccionesGrupos(),
      cargarPrediccionesElim(),
      cargarPrediccionesEspeciales(),
      cargarResultados(),
      cargarBracket()
    ]);

    renderMiPorra(contenedor);
  } catch (e) {
    console.error('[prediccion]', e);
    contenedor.innerHTML = `<div class="notice error">⚠️ ${t('common.error')}</div>`;
  }
}

// ── Render principal ──────────────────────────────────────────
function renderMiPorra(contenedor) {
  // Stats resumen
  const stats = calcularStats();

  contenedor.innerHTML = `
    <div class="stats-row" style="margin-top:8px;">
      <div class="stat-card">
        <div class="stat-val">${stats.jugados}</div>
        <div class="stat-lbl">${t('myPool.statsPlayed')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-val green">${stats.exactos}</div>
        <div class="stat-lbl">${t('myPool.statsExact')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${stats.ganador}</div>
        <div class="stat-lbl">${t('myPool.statsWinner')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-val green">${stats.puntos}</div>
        <div class="stat-lbl">${t('myPool.statsPoints')}</div>
      </div>
    </div>

    <div class="sub-toggle">
      <button class="sub-btn ${_subTab === 'grupos' ? 'active' : ''}"
        onclick="window._prediccionSetTab('grupos')">${t('subNav.groupStage')}</button>
      <button class="sub-btn ${_subTab === 'eliminatorias' ? 'active' : ''}"
        onclick="window._prediccionSetTab('eliminatorias')">${t('subNav.knockouts')}</button>
    </div>

    <div id="prediccionTabContent"></div>
  `;

  window._prediccionSetTab = (tab) => {
    _subTab = tab;
    document.querySelectorAll('.sub-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.sub-btn')[tab === 'grupos' ? 0 : 1].classList.add('active');
    renderTabContent();
  };

  renderTabContent();
}

// ── Renderiza el contenido de la sub-pestaña activa ───────────
function renderTabContent() {
  const contenedor = document.getElementById('prediccionTabContent');
  if (_subTab === 'grupos') {
    renderGrupos(contenedor);
  } else {
    renderEliminatorias(contenedor);
  }
}

// ══════════════════════════════════════════════════════════════
//  FASE DE GRUPOS
// ══════════════════════════════════════════════════════════════

function renderGrupos(contenedor) {
  const cerrado = !_plazoGrupos;

  // Selector de grupo
  const selectorGrupos = GRUPOS.map(g =>
    `<button class="pag-btn ${_grupoActivo === g ? 'active' : ''}"
      onclick="window._prediccionSetGrupo('${g}')">${g}</button>`
  ).join('');

  contenedor.innerHTML = `
    ${cerrado
      ? `<div class="notice locked">🔒 ${t('myPool.closedNotice')}</div>`
      : `<div class="notice">🔓 ${t('myPool.openUntil')} <strong>${formatFechaLimite(_config.fecha_limite_grupos)}</strong> ${t('myPool.localTime')}</div>`
    }

    <div class="pag-row" style="flex-wrap:wrap; margin-bottom:14px;">
      ${selectorGrupos}
    </div>

    <div id="grupoContent"></div>

    ${!cerrado ? `
      <button class="btn btn-primary btn-full" onclick="window._guardarGrupos()">
        💾 ${t('myPool.saveBtn')}
      </button>
    ` : ''}
  `;

  window._prediccionSetGrupo = (g) => {
    _grupoActivo = g;
    document.querySelectorAll('.pag-row .pag-btn').forEach((b, i) => {
      b.classList.toggle('active', GRUPOS[i] === g);
    });
    renderGrupoDetalle(document.getElementById('grupoContent'));
  };

  window._guardarGrupos = () => guardarPrediccionesGrupos();

  renderGrupoDetalle(document.getElementById('grupoContent'));
}

function renderGrupoDetalle(contenedor) {
  const partidos = getPartidosPorGrupo(_grupoActivo);
  const cerrado  = !_plazoGrupos;

  let html = `<div class="group-pill">⚽ ${t('common.group')} ${_grupoActivo}</div>`;

  // Jornadas
  [1, 2, 3].forEach(jornada => {
    const pJornada = partidos.filter(p => p.jornada === jornada);
    if (!pJornada.length) return;

    html += `<div style="font-size:10px; font-weight:600; color:var(--tm); text-transform:uppercase; letter-spacing:.5px; margin:10px 0 6px;">${t('common.matchday')} ${jornada}</div>`;

    pJornada.forEach(p => {
      const pred = _predGrupos[p.id] || { local: '', visitante: '' };
      const res  = _resultados[p.id];
      const clase = res ? clasePredGrupo(pred, res) : 'pred-pending';
      const ptsBadge = res ? badgePuntosGrupo(pred, res) : `<span class="pts-badge pts-pending">${t('myPool.pending')}</span>`;

      html += `
        <div class="match-card ${clase}" id="mc_${p.id}">
          <div class="match-meta">
            <span>${formatMatchDate(p.fechaUTC)}</span>
            <span>📍 ${p.ciudad}</span>
            ${ptsBadge}
          </div>
          <div class="match-row">
            <div class="match-team">
              <span class="match-flag">${p.flagLocal}</span>
              <span class="match-name">${p.local}</span>
            </div>
            <div class="score-area">
              <span class="score-label">${t('myPool.scorePrediction')}</span>
              <div class="score-inputs">
                <input class="score-input" type="number" min="0" max="20"
                  id="sc_${p.id}_l" value="${pred.local !== '' ? pred.local : ''}"
                  ${cerrado ? 'disabled' : ''}
                  onchange="window._onScoreChange('${p.id}')">
                <span class="score-sep">—</span>
                <input class="score-input" type="number" min="0" max="20"
                  id="sc_${p.id}_v" value="${pred.visitante !== '' ? pred.visitante : ''}"
                  ${cerrado ? 'disabled' : ''}
                  onchange="window._onScoreChange('${p.id}')">
              </div>
              ${res ? `
                <span class="score-label">${t('myPool.scoreReal')}</span>
                <span class="score-real">${res.local} — ${res.visitante}</span>
              ` : ''}
            </div>
            <div class="match-team right">
              <span class="match-flag">${p.flagVisitante}</span>
              <span class="match-name">${p.visitante}</span>
            </div>
          </div>
          <div class="match-pts-info">${t('standings.criteria.groupWinner')}: 1pt · ${t('standings.criteria.groupExact')}: 3pts</div>
        </div>
      `;
    });
  });

  // Clasificación calculada del grupo
  html += renderClasificacionGrupo(_grupoActivo, cerrado);

  // Predicciones especiales (al final del grupo A, jornada 1)
  if (_grupoActivo === 'A') {
    html += renderEspeciales(cerrado);
  }

  contenedor.innerHTML = html;

  // Handler de cambio de marcador
  window._onScoreChange = (partidoId) => {
    const l = document.getElementById(`sc_${partidoId}_l`).value;
    const v = document.getElementById(`sc_${partidoId}_v`).value;
    if (!_predGrupos[partidoId]) _predGrupos[partidoId] = {};
    _predGrupos[partidoId].local     = l !== '' ? parseInt(l) : '';
    _predGrupos[partidoId].visitante = v !== '' ? parseInt(v) : '';
    actualizarClasificacionGrupo(_grupoActivo);
  };

  window._onDesempate = (grupo, equipo1, equipo2, ganador) => {
    const key = `${grupo}_${equipo1}_${equipo2}`;
    if (!_predGrupos._desempates) _predGrupos._desempates = {};
    _predGrupos._desempates[key] = ganador;
    actualizarClasificacionGrupo(grupo);
  };
}

// ── Clasificación calculada por las predicciones del usuario ──
function renderClasificacionGrupo(grupo, cerrado) {
  const partidos = getPartidosPorGrupo(grupo);
  const equipos  = obtenerEquiposGrupo(grupo);
  const tabla    = calcularTablaGrupo(grupo, partidos, equipos);

  let html = `
    <div style="margin-top:14px;">
      <div style="font-size:11px; font-weight:700; color:var(--gm); margin-bottom:6px; display:flex; align-items:center; gap:6px;">
        📊 ${t('myPool.classifTitle')}
        <span style="font-size:9px; background:#f0f0f0; color:#888; padding:2px 6px; border-radius:8px;">${t('myPool.autoCalc')}</span>
      </div>
      <div class="group-table" id="tabla_${grupo}">
        <div class="group-table-header">
          <div class="gt-head">#</div>
          <div class="gt-head left">${t('common.group')}</div>
          <div class="gt-head">J</div>
          <div class="gt-head">G</div>
          <div class="gt-head">E</div>
          <div class="gt-head">P</div>
          <div class="gt-head">Pts</div>
        </div>
  `;

  tabla.forEach((eq, i) => {
    const pasa = i < 2;
    html += `
      <div class="group-table-row ${pasa ? 'qualifies' : ''}">
        <div class="gt-pos">${i + 1}</div>
        <div class="gt-team">
          <span class="gt-flag">${eq.flag}</span>
          <span class="gt-name">${eq.nombre}</span>
        </div>
        <div class="gt-val">${eq.j}</div>
        <div class="gt-val">${eq.g}</div>
        <div class="gt-val">${eq.e}</div>
        <div class="gt-val">${eq.p}</div>
        <div class="gt-pts">${eq.pts}</div>
      </div>
    `;
  });

  html += `</div>`;

  // Detectar empates a puntos Y diferencia de goles → mostrar selector
  const empatesGD = detectarEmpatesGD(tabla);
  if (empatesGD.length && !cerrado) {
    empatesGD.forEach(par => {
      const key = `${grupo}_${par[0].nombre}_${par[1].nombre}`;
      const seleccionado = _predGrupos._desempates?.[key] || null;
      html += `
        <div class="tiebreak" style="margin-top:8px;">
          <div class="tiebreak-label">⚠️ ${par[0].nombre} y ${par[1].nombre} empatan a puntos y goles — ¿en qué orden quedan?</div>
          <div class="tiebreak-opts">
            <button class="tiebreak-btn ${seleccionado === par[0].nombre ? 'selected' : ''}"
              onclick="window._onDesempate('${grupo}','${par[0].nombre}','${par[1].nombre}','${par[0].nombre}')">
              ${par[0].flag} ${par[0].nombre} primero
            </button>
            <button class="tiebreak-btn ${seleccionado === par[1].nombre ? 'selected' : ''}"
              onclick="window._onDesempate('${grupo}','${par[0].nombre}','${par[1].nombre}','${par[1].nombre}')">
              ${par[1].flag} ${par[1].nombre} primero
            </button>
          </div>
        </div>
      `;
    });
  }

  const nota = i => tabla[i]
    ? `${tabla[0].nombre} y ${tabla[1].nombre} clasificados según tus predicciones`
    : '';

  html += `
      <div class="group-table-note">
        <div style="width:8px;height:8px;border-radius:2px;background:var(--gg);border:1px solid var(--gp);flex-shrink:0;"></div>
        ${tabla[0]?.nombre && tabla[1]?.nombre
          ? `${tabla[0].nombre} y ${tabla[1].nombre} clasificados según tus predicciones`
          : ''}
      </div>
    </div>
  `;

  return html;
}

// ── Actualizar solo la tabla (sin re-renderizar todo) ─────────
function actualizarClasificacionGrupo(grupo) {
  const tablaEl = document.getElementById(`tabla_${grupo}`);
  if (!tablaEl) return;
  const partidos = getPartidosPorGrupo(grupo);
  const equipos  = obtenerEquiposGrupo(grupo);
  const tabla    = calcularTablaGrupo(grupo, partidos, equipos);

  // Actualizar filas
  const rows = tablaEl.querySelectorAll('.group-table-row');
  tabla.forEach((eq, i) => {
    if (!rows[i]) return;
    rows[i].classList.toggle('qualifies', i < 2);
    rows[i].querySelector('.gt-pos').textContent  = i + 1;
    rows[i].querySelector('.gt-name').textContent = eq.nombre;
    rows[i].querySelector('.gt-flag').textContent = eq.flag;
    const vals = rows[i].querySelectorAll('.gt-val');
    vals[0].textContent = eq.j;
    vals[1].textContent = eq.g;
    vals[2].textContent = eq.e;
    vals[3].textContent = eq.p;
    rows[i].querySelector('.gt-pts').textContent = eq.pts;
  });
}

// ── Calcular tabla de un grupo ────────────────────────────────
function calcularTablaGrupo(grupo, partidos, equipos) {
  const stats = {};
  equipos.forEach(eq => {
    stats[eq.nombre] = { ...eq, j:0, g:0, e:0, p:0, pts:0, gf:0, gc:0, gd:0 };
  });

  partidos.forEach(p => {
    const pred = _predGrupos[p.id];
    if (!pred || pred.local === '' || pred.visitante === '') return;

    const gl = parseInt(pred.local);
    const gv = parseInt(pred.visitante);
    if (isNaN(gl) || isNaN(gv)) return;

    const eqL = stats[p.local];
    const eqV = stats[p.visitante];
    if (!eqL || !eqV) return;

    eqL.j++; eqV.j++;
    eqL.gf += gl; eqL.gc += gv; eqL.gd = eqL.gf - eqL.gc;
    eqV.gf += gv; eqV.gc += gl; eqV.gd = eqV.gf - eqV.gc;

    if (gl > gv)      { eqL.g++; eqL.pts += 3; eqV.p++; }
    else if (gl < gv) { eqV.g++; eqV.pts += 3; eqL.p++; }
    else              { eqL.e++; eqV.e++; eqL.pts++; eqV.pts++; }
  });

  return Object.values(stats).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd  !== a.gd)  return b.gd  - a.gd;
    if (b.gf  !== a.gf)  return b.gf  - a.gf;
    // Desempate manual del usuario
    const key = `${grupo}_${a.nombre}_${b.nombre}`;
    const keyRev = `${grupo}_${b.nombre}_${a.nombre}`;
    const des = _predGrupos._desempates || {};
    if (des[key] === b.nombre) return 1;
    if (des[key] === a.nombre) return -1;
    if (des[keyRev] === a.nombre) return -1;
    if (des[keyRev] === b.nombre) return 1;
    return 0;
  });
}

function detectarEmpatesGD(tabla) {
  const empates = [];
  for (let i = 0; i < tabla.length - 1; i++) {
    if (
      tabla[i].pts === tabla[i+1].pts &&
      tabla[i].gd  === tabla[i+1].gd  &&
      tabla[i].gf  === tabla[i+1].gf
    ) {
      empates.push([tabla[i], tabla[i+1]]);
    }
  }
  return empates;
}

function obtenerEquiposGrupo(grupo) {
  const partidos = getPartidosPorGrupo(grupo);
  const nombres = new Set();
  const equipos = [];
  partidos.forEach(p => {
    if (!nombres.has(p.local)) {
      nombres.add(p.local);
      equipos.push({ nombre: p.local, flag: p.flagLocal });
    }
    if (!nombres.has(p.visitante)) {
      nombres.add(p.visitante);
      equipos.push({ nombre: p.visitante, flag: p.flagVisitante });
    }
  });
  return equipos;
}

// ══════════════════════════════════════════════════════════════
//  PREDICCIONES ESPECIALES
// ══════════════════════════════════════════════════════════════

function renderEspeciales(cerrado) {
  const esp = _predEsp;

  if (cerrado && esp.bloqueado) {
    return `
      <div class="notice locked" style="margin-top:14px;">
        🔒 ${t('specials.lockedSince')} ${formatFechaLimite(_config.fecha_limite_grupos)}
      </div>
      <div class="special-card locked-card">
        <div class="special-label">${t('specials.champion')} <span class="special-locked-badge">🔒 ${t('specials.locked')} · ${t('specials.champPts')}</span></div>
        <div class="special-value"><span style="font-size:18px;">${buscarFlag(esp.campeon)}</span> ${esp.campeon || '—'}</div>
      </div>
      <div class="special-card locked-card">
        <div class="special-label">${t('specials.runnerUp')} <span class="special-locked-badge">🔒 ${t('specials.locked')} · ${t('specials.runnerUpPts')}</span></div>
        <div class="special-value"><span style="font-size:18px;">${buscarFlag(esp.subcampeon)}</span> ${esp.subcampeon || '—'}</div>
      </div>
      <div class="special-card locked-card">
        <div class="special-label">${t('specials.mvp')} <span class="special-locked-badge">🔒 ${t('specials.locked')} · ${t('specials.mvpPts')}</span></div>
        <div class="special-value">${esp.mvp || '—'}</div>
      </div>
      <div class="special-card locked-card">
        <div class="special-label">${t('specials.topScorer')} <span class="special-locked-badge">🔒 ${t('specials.locked')} · ${t('specials.topScorerPts')}</span></div>
        <div class="special-value">${esp.goleador || '—'}</div>
      </div>
    `;
  }

  return `
    <div style="margin-top:18px; padding-top:14px; border-top:1px solid #dde8cc;">
      <div style="font-size:11px; font-weight:700; color:var(--tm); text-transform:uppercase; letter-spacing:.5px; margin-bottom:10px;">
        ⭐ ${t('specials.title')}
      </div>
      ${cerrado ? `<div class="notice locked">🔒 ${t('myPool.closedNotice')}</div>` :
        `<div class="notice">🔓 ${t('specials.openUntil')} <strong>${formatFechaLimite(_config.fecha_limite_grupos)}</strong></div>`
      }

      <div class="special-card">
        <div class="special-label">${t('specials.champion')} <span class="special-pts-badge">${t('specials.champPts')}</span></div>
        <div class="autocomplete-wrap">
          <input class="special-input" type="text" id="esp_campeon"
            value="${esp.campeon || ''}" placeholder="${t('specials.teamPlaceholder')}"
            ${cerrado ? 'disabled' : ''}
            oninput="window._onEspInput('campeon', this.value)"
            autocomplete="off">
          <div class="autocomplete-list hidden" id="ac_campeon"></div>
        </div>
        <div class="special-hint ${!esp.campeon ? 'missing' : ''}" id="hint_campeon">
          ${esp.campeon ? buscarFlag(esp.campeon) + ' ' + esp.campeon : t('specials.missingWarning')}
        </div>
      </div>

      <div class="special-card">
        <div class="special-label">${t('specials.runnerUp')} <span class="special-pts-badge">${t('specials.runnerUpPts')}</span></div>
        <div class="autocomplete-wrap">
          <input class="special-input" type="text" id="esp_subcampeon"
            value="${esp.subcampeon || ''}" placeholder="${t('specials.teamPlaceholder')}"
            ${cerrado ? 'disabled' : ''}
            oninput="window._onEspInput('subcampeon', this.value)"
            autocomplete="off">
          <div class="autocomplete-list hidden" id="ac_subcampeon"></div>
        </div>
        <div class="special-hint ${!esp.subcampeon ? 'missing' : ''}" id="hint_subcampeon">
          ${esp.subcampeon ? buscarFlag(esp.subcampeon) + ' ' + esp.subcampeon : t('specials.missingWarning')}
        </div>
      </div>

      <div class="special-card">
        <div class="special-label">${t('specials.mvp')} <span class="special-pts-badge">${t('specials.mvpPts')}</span></div>
        <input class="special-input" type="text" id="esp_mvp"
          value="${esp.mvp || ''}" placeholder="${t('specials.playerPlaceholder')}"
          ${cerrado ? 'disabled' : ''}
          oninput="window._onEspDirecto('mvp', this.value)">
        <div class="special-hint ${!esp.mvp ? 'missing' : ''}" id="hint_mvp">
          ${esp.mvp ? '✓ ' + esp.mvp : t('specials.missingWarning')}
        </div>
        <div style="font-size:10px; color:var(--tm); margin-top:4px;">${t('specials.adminEditNote')}</div>
      </div>

      <div class="special-card">
        <div class="special-label">${t('specials.topScorer')} <span class="special-pts-badge">${t('specials.topScorerPts')}</span></div>
        <input class="special-input" type="text" id="esp_goleador"
          value="${esp.goleador || ''}" placeholder="${t('specials.playerPlaceholder')}"
          ${cerrado ? 'disabled' : ''}
          oninput="window._onEspDirecto('goleador', this.value)">
        <div class="special-hint ${!esp.goleador ? 'missing' : ''}" id="hint_goleador">
          ${esp.goleador ? '✓ ' + esp.goleador : t('specials.missingWarning')}
        </div>
        <div style="font-size:10px; color:var(--tm); margin-top:4px;">${t('specials.adminEditNote')}</div>
      </div>

      ${!cerrado ? `
        <button class="btn btn-primary btn-full" onclick="window._guardarEspeciales()">
          💾 ${t('specials.saveBtn')}
        </button>
      ` : ''}
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
//  ELIMINATORIAS — BRACKET
// ══════════════════════════════════════════════════════════════

function renderEliminatorias(contenedor) {
  const cerrado = !_plazoElim;

  contenedor.innerHTML = `
    ${cerrado
      ? `<div class="notice locked">🔒 ${t('knockouts.closedNotice')}</div>`
      : `<div class="notice">🔓 ${t('knockouts.openUntil')} <strong>${formatFechaLimite(_config.fecha_limite_eliminatorias)}</strong> ${t('myPool.localTime')}</div>`
    }

    <div class="bracket-legend">
      <div class="bl-item"><div class="bl-dot" style="border:1.5px solid var(--gm);"></div>${t('knockouts.ganWinner')} avanzado</div>
      <div class="bl-item"><div class="bl-dot" style="background:var(--gg);border:1px solid var(--gp);"></div>Ganador avanzado</div>
      <div class="bl-item"><div class="bl-dot" style="background:#fffbea;border:1px solid #f5e8b0;"></div>Empate — elige quién pasa</div>
    </div>

    <div class="bracket-scroll">
      <div class="bracket-canvas" id="bracketCanvas" style="position:relative; min-width:920px; height:940px;">
        ${renderBracketSVG(cerrado)}
        ${renderBracketPartidos(cerrado)}
      </div>
    </div>

    ${!cerrado ? `
      <button class="btn btn-primary btn-full" onclick="window._guardarElim()">
        💾 ${t('myPool.saveBtn')}
      </button>
    ` : ''}
  `;

  window._guardarElim = () => guardarPrediccionesElim();
  window._onElimScore = (id) => onElimScoreChange(id);
  window._onElimTB    = (id, ganador) => onElimTiebreak(id, ganador);
}

// ── SVG conectores del bracket ────────────────────────────────
function renderBracketSVG(cerrado) {
  return `
    <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;">
      <!-- 1/16 → 1/8 -->
      <path class="conn-line" d="M130,56 H148 V98 H162"/>
      <path class="conn-line" d="M130,140 H148 V98 H162"/>
      <path class="conn-line" d="M130,224 H148 V266 H162"/>
      <path class="conn-line" d="M130,308 H148 V266 H162"/>
      <path class="conn-line" d="M130,392 H148 V434 H162"/>
      <path class="conn-line" d="M130,476 H148 V434 H162"/>
      <path class="conn-line" d="M130,560 H148 V602 H162"/>
      <path class="conn-line" d="M130,644 H148 V602 H162"/>
      <!-- 1/8 → 1/4 -->
      <path class="conn-line" d="M292,98  H310 V182 H324"/>
      <path class="conn-line" d="M292,266 H310 V182 H324"/>
      <path class="conn-line" d="M292,434 H310 V518 H324"/>
      <path class="conn-line" d="M292,602 H310 V518 H324"/>
      <!-- 1/4 → Semis -->
      <path class="conn-line" d="M454,182 H472 V350 H486"/>
      <path class="conn-line" d="M454,518 H472 V350 H486"/>
      <!-- Semis → Final -->
      <path class="conn-line" d="M616,350 H648"/>
      <!-- Semis → 3er puesto (perdedores bajan) -->
      <path class="conn-line" d="M551,362 V800 H648"/>
    </svg>
  `;
}

// ── Partidos del bracket posicionados absolutamente ───────────
function renderBracketPartidos(cerrado) {
  let html = '';

  // Etiquetas de columnas
  const cols = [
    { label: '1/16 de final', left: 0 },
    { label: '1/8 de final',  left: 162 },
    { label: 'Cuartos',       left: 324 },
    { label: 'Semifinales',   left: 486 },
    { label: '🏆 Final',      left: 648 }
  ];
  cols.forEach(c => {
    html += `<div class="bracket-col-label" style="left:${c.left}px; top:6px; width:130px;">${c.label}</div>`;
  });
  html += `<div class="bracket-col-label" style="left:648px; top:768px; width:140px; color:var(--tm);">🥉 3er y 4º puesto</div>`;

  // 1/16 (8 partidos)
  const tops16 = [24, 108, 192, 276, 360, 444, 528, 612];
  const partidos16 = obtenerPartidos16();
  partidos16.forEach((p, i) => {
    html += renderBracketMatch(p, 0, tops16[i], cerrado, '1/16');
  });

  // 1/8 (4 partidos)
  const tops8 = [70, 238, 406, 574];
  const partidos8 = obtenerPartidosFase('1/8');
  partidos8.forEach((p, i) => {
    html += renderBracketMatch(p, 162, tops8[i], cerrado, '1/8');
  });

  // Cuartos (2 partidos)
  const topsCuartos = [154, 490];
  const partidosCuartos = obtenerPartidosFase('1/4');
  partidosCuartos.forEach((p, i) => {
    html += renderBracketMatch(p, 324, topsCuartos[i], cerrado, '1/4');
  });

  // Semis (1 partido visible, el otro del otro lado)
  const partidosSemis = obtenerPartidosFase('semi');
  if (partidosSemis[0]) html += renderBracketMatch(partidosSemis[0], 486, 322, cerrado, 'semi');

  // Final
  const final = obtenerPartidosFase('final')[0];
  if (final) {
    html += renderBracketMatch({ ...final, esFinal: true }, 648, 300, cerrado, 'final');
    // Badge campeón
    const pred = _predElim[final?.id || 'final'];
    const campeon = pred?.ganador || '—';
    const coincide = campeon === _predEsp.campeon;
    html += `
      <div class="champ-badge" style="position:absolute; left:648px; top:${300 + 80}px; width:140px;">
        🥇 ${campeon}
      </div>
      <div class="champ-sub" style="position:absolute; left:648px; top:${300 + 98}px; width:140px; font-size:8px; color:#aaa; text-align:center;">
        ${coincide && campeon !== '—'
          ? '✓ Coincide con tu predicción especial · +6 pts'
          : campeon !== '—' ? 'Diferente a tu predicción especial' : ''}
      </div>
    `;
  }

  // 3er y 4º puesto
  const tercero = obtenerPartidosFase('3er')[0];
  if (tercero) html += renderBracketMatch(tercero, 648, 786, cerrado, '3er');

  return html;
}

function renderBracketMatch(p, left, top, cerrado, fase) {
  const pred   = _predElim[p.id] || {};
  const anchura = fase === 'final' || fase === '3er' ? 140 : 130;
  const eqL    = p.equipoLocal    || `<span class="bm-placeholder">${p.placeholderLocal    || '?'}</span>`;
  const eqV    = p.equipoVisitante|| `<span class="bm-placeholder">${p.placeholderVisitante|| '?'}</span>`;
  const flagL  = p.flagLocal    || '';
  const flagV  = p.flagVisitante|| '';
  const ganador= pred.ganador   || null;
  const esEmpate = (pred.local !== undefined && pred.visitante !== undefined &&
    parseInt(pred.local) === parseInt(pred.visitante) &&
    !isNaN(parseInt(pred.local)));

  const claseL = ganador === (p.equipoLocal || p.placeholderLocal) ? 'win' : '';
  const claseV = ganador === (p.equipoVisitante || p.placeholderVisitante) ? 'win' : '';

  const locked = cerrado || fase !== '1/16' && !p.desbloqueado;

  let html = `
    <div class="bracket-match ${locked ? 'lock' : 'edit'} ${fase === 'final' ? 'final' : fase === '3er' ? 'third' : ''}"
      style="position:absolute; left:${left}px; top:${top}px; width:${anchura}px;">
      <div class="bm-date">📅 ${p.fecha || '—'} · ${p.ciudad || '—'}</div>
      <div class="bm-team ${claseL}">
        ${flagL ? `<span class="bm-flag">${flagL}</span>` : ''}
        ${typeof eqL === 'string' && eqL.startsWith('<')
          ? eqL
          : `<span class="bm-name">${eqL}</span>`}
        <input class="bm-input" type="number" min="0" max="20"
          id="be_${p.id}_l" value="${pred.local ?? ''}"
          ${locked ? 'disabled' : ''}
          onchange="window._onElimScore('${p.id}')">
      </div>
      <div class="bm-team ${claseV}">
        ${flagV ? `<span class="bm-flag">${flagV}</span>` : ''}
        ${typeof eqV === 'string' && eqV.startsWith('<')
          ? eqV
          : `<span class="bm-name">${eqV}</span>`}
        <input class="bm-input" type="number" min="0" max="20"
          id="be_${p.id}_v" value="${pred.visitante ?? ''}"
          ${locked ? 'disabled' : ''}
          onchange="window._onElimScore('${p.id}')">
      </div>
      ${esEmpate ? `
        <div class="bm-tiebreak">
          <span class="bm-tb-label">⚠️ ¿Pasa?</span>
          <button class="bm-tb-btn ${pred.ganador === (p.equipoLocal || p.placeholderLocal) ? 'selected' : ''}"
            onclick="window._onElimTB('${p.id}','${p.equipoLocal || p.placeholderLocal}')">
            ${flagL} ${(p.equipoLocal || p.placeholderLocal || '?').substring(0,3)}
          </button>
          <button class="bm-tb-btn ${pred.ganador === (p.equipoVisitante || p.placeholderVisitante) ? 'selected' : ''}"
            onclick="window._onElimTB('${p.id}','${p.equipoVisitante || p.placeholderVisitante}')">
            ${flagV} ${(p.equipoVisitante || p.placeholderVisitante || '?').substring(0,3)}
          </button>
        </div>
      ` : ''}
      <div class="bm-pts">Exacto(90')=4pts · Gan.=2pts</div>
    </div>
  `;
  return html;
}

// ── Construir partidos de 1/16 con placeholders ───────────────
function obtenerPartidos16() {
  // Los cruces de 1/16 vienen de la API (guardados en _bracket)
  // Si no hay datos de la API, usamos placeholders basados en la clasificación
  const cruces = [
    { id:'r32_1',  pL:'2º Grupo A',   pV:'2º Grupo B',   fecha:'28 jun', ciudad:'Los Ángeles' },
    { id:'r32_2',  pL:'1º Grupo C',   pV:'2º Grupo F',   fecha:'29 jun', ciudad:'Houston' },
    { id:'r32_3',  pL:'1º Grupo E',   pV:'Mej. 3º A/B/C/D/F', fecha:'29 jun', ciudad:'Foxborough' },
    { id:'r32_4',  pL:'1º Grupo F',   pV:'2º Grupo C',   fecha:'29 jun', ciudad:'Monterrey' },
    { id:'r32_5',  pL:'2º Grupo E',   pV:'2º Grupo I',   fecha:'30 jun', ciudad:'Arlington' },
    { id:'r32_6',  pL:'1º Grupo I',   pV:'Mej. 3º C/D/F/G/H', fecha:'30 jun', ciudad:'East Rutherford' },
    { id:'r32_7',  pL:'1º Grupo A',   pV:'Mej. 3º C/E/F/H/I', fecha:'30 jun', ciudad:'Ciudad de México' },
    { id:'r32_8',  pL:'1º Grupo L',   pV:'Mej. 3º E/H/I/J/K', fecha:'1 jul', ciudad:'Atlanta' },
  ];

  return cruces.map(c => {
    const datoAPI = _bracket[c.id] || {};
    return {
      id:               c.id,
      equipoLocal:      datoAPI.equipoLocal      || null,
      equipoVisitante:  datoAPI.equipoVisitante  || null,
      flagLocal:        datoAPI.flagLocal        || '',
      flagVisitante:    datoAPI.flagVisitante    || '',
      placeholderLocal:    c.pL,
      placeholderVisitante:c.pV,
      fecha:            datoAPI.fecha            || c.fecha,
      ciudad:           datoAPI.ciudad           || c.ciudad,
      desbloqueado:     true
    };
  });
}

function obtenerPartidosFase(fase) {
  const fases = {
    '1/8':   [
      { id:'r16_1', pL:'Gan. 1/16 P1', pV:'Gan. 1/16 P2', fecha:'5 jul',  ciudad:'Chicago',       desbloqueado: false },
      { id:'r16_2', pL:'Gan. 1/16 P3', pV:'Gan. 1/16 P4', fecha:'6 jul',  ciudad:'Phoenix',        desbloqueado: false },
      { id:'r16_3', pL:'Gan. 1/16 P5', pV:'Gan. 1/16 P6', fecha:'6 jul',  ciudad:'Denver',         desbloqueado: false },
      { id:'r16_4', pL:'Gan. 1/16 P7', pV:'Gan. 1/16 P8', fecha:'7 jul',  ciudad:'Kansas City',    desbloqueado: false },
    ],
    '1/4':   [
      { id:'qf_1',  pL:'Gan. 1/8 Q1',  pV:'Gan. 1/8 Q2',  fecha:'9 jul',  ciudad:'Nueva York',     desbloqueado: false },
      { id:'qf_2',  pL:'Gan. 1/8 Q3',  pV:'Gan. 1/8 Q4',  fecha:'10 jul', ciudad:'Miami',          desbloqueado: false },
    ],
    'semi':  [
      { id:'sf_1',  pL:'Gan. Cuar. 1', pV:'Gan. Cuar. 2', fecha:'14 jul', ciudad:'Los Ángeles',    desbloqueado: false },
    ],
    '3er':   [
      { id:'tp_1',  pL:'Perd. Semi 1', pV:'Perd. Semi 2', fecha:'18 jul', ciudad:'Miami',          desbloqueado: false },
    ],
    'final': [
      { id:'final_1', pL:'Gan. Semi 1', pV:'Gan. Semi 2', fecha:'19 jul', ciudad:'Nueva York',     desbloqueado: false },
    ]
  };

  return (fases[fase] || []).map(c => {
    const datoAPI = _bracket[c.id] || {};
    // Propagar ganadores de predicciones del usuario
    const pred = _predElim[c.id] || {};
    return {
      ...c,
      equipoLocal:     datoAPI.equipoLocal     || propagarGanador(c.id, 'local')  || null,
      equipoVisitante: datoAPI.equipoVisitante || propagarGanador(c.id, 'vis')    || null,
      flagLocal:       datoAPI.flagLocal       || '',
      flagVisitante:   datoAPI.flagVisitante   || '',
    };
  });
}

// Propaga el ganador elegido por el usuario al siguiente cruce
function propagarGanador(partidoId, lado) {
  // Mapa de dependencias: qué partido alimenta cada slot
  const mapa = {
    'r16_1': { local: 'r32_1', vis: 'r32_2' },
    'r16_2': { local: 'r32_3', vis: 'r32_4' },
    'r16_3': { local: 'r32_5', vis: 'r32_6' },
    'r16_4': { local: 'r32_7', vis: 'r32_8' },
    'qf_1':  { local: 'r16_1', vis: 'r16_2' },
    'qf_2':  { local: 'r16_3', vis: 'r16_4' },
    'sf_1':  { local: 'qf_1',  vis: 'qf_2'  },
    'final_1':{ local: 'sf_1', vis: 'sf_1'  },
    'tp_1':  { local: 'sf_1',  vis: 'sf_1'  },
  };
  const dep = mapa[partidoId];
  if (!dep) return null;
  const srcId = dep[lado];
  const pred  = _predElim[srcId];
  return pred?.ganador || null;
}

// ── Handlers de eliminatorias ─────────────────────────────────
function onElimScoreChange(id) {
  const l = document.getElementById(`be_${id}_l`)?.value;
  const v = document.getElementById(`be_${id}_v`)?.value;
  if (!_predElim[id]) _predElim[id] = {};
  _predElim[id].local     = l !== '' ? parseInt(l) : '';
  _predElim[id].visitante = v !== '' ? parseInt(v) : '';

  // Si no hay empate, el ganador es el que tiene más goles
  if (l !== '' && v !== '' && parseInt(l) !== parseInt(v)) {
    const partido = buscarPartidoBracket(id);
    if (parseInt(l) > parseInt(v)) {
      _predElim[id].ganador = partido?.equipoLocal || partido?.placeholderLocal || null;
    } else {
      _predElim[id].ganador = partido?.equipoVisitante || partido?.placeholderVisitante || null;
    }
  } else if (parseInt(l) === parseInt(v)) {
    _predElim[id].ganador = null; // espera al tiebreak
  }

  // Re-render para actualizar clases win y selector tiebreak
  renderEliminatorias(document.getElementById('prediccionTabContent'));
}

function onElimTiebreak(id, ganador) {
  if (!_predElim[id]) _predElim[id] = {};
  _predElim[id].ganador = ganador;
  renderEliminatorias(document.getElementById('prediccionTabContent'));
}

function buscarPartidoBracket(id) {
  const todos = [
    ...obtenerPartidos16(),
    ...obtenerPartidosFase('1/8'),
    ...obtenerPartidosFase('1/4'),
    ...obtenerPartidosFase('semi'),
    ...obtenerPartidosFase('final'),
    ...obtenerPartidosFase('3er'),
  ];
  return todos.find(p => p.id === id) || null;
}

// ══════════════════════════════════════════════════════════════
//  GUARDAR EN FIRESTORE
// ══════════════════════════════════════════════════════════════

async function guardarPrediccionesGrupos() {
  if (!_plazoGrupos) return;
  try {
    window.mostrarToast('💾 Guardando...');

    const batch = [];
    Object.entries(_predGrupos).forEach(([id, pred]) => {
      if (id === '_desempates') return;
      if (pred.local === '' || pred.visitante === '') return;
      batch.push(setDoc(
        doc(db, 'predicciones', `${_app.uid}_${id}`),
        {
          uid:       _app.uid,
          partido_id: id,
          local:     pred.local,
          visitante: pred.visitante,
          timestamp: serverTimestamp()
        },
        { merge: true }
      ));
    });

    // Guardar desempates
    if (_predGrupos._desempates) {
      batch.push(setDoc(
        doc(db, 'predicciones', `${_app.uid}_desempates`),
        {
          uid:       _app.uid,
          desempates: _predGrupos._desempates,
          timestamp: serverTimestamp()
        },
        { merge: true }
      ));
    }

    await Promise.all(batch);
    window.mostrarToast('✅ ' + t('myPool.savedOk'));

    // Notificar al admin por email
    try {
      const { enviarEmailPredicciones } = await import('./email.js');
      await enviarEmailPredicciones(_app.usuario, _predGrupos, 'grupos');
    } catch (e) {
      console.warn('[email]', e);
    }

  } catch (e) {
    console.error('[guardarGrupos]', e);
    window.mostrarToast('❌ ' + t('myPool.savedError'), 5000);
  }
}

async function guardarPrediccionesElim() {
  if (!_plazoElim) return;
  try {
    window.mostrarToast('💾 Guardando...');

    const batch = [];
    Object.entries(_predElim).forEach(([id, pred]) => {
      batch.push(setDoc(
        doc(db, 'predicciones_elim', `${_app.uid}_${id}`),
        {
          uid:       _app.uid,
          partido_id: id,
          local:     pred.local ?? '',
          visitante: pred.visitante ?? '',
          ganador:   pred.ganador || null,
          timestamp: serverTimestamp()
        },
        { merge: true }
      ));
    });

    await Promise.all(batch);
    window.mostrarToast('✅ ' + t('myPool.savedOk'));

    try {
      const { enviarEmailPredicciones } = await import('./email.js');
      await enviarEmailPredicciones(_app.usuario, _predElim, 'eliminatorias');
    } catch (e) {
      console.warn('[email]', e);
    }

  } catch (e) {
    console.error('[guardarElim]', e);
    window.mostrarToast('❌ ' + t('myPool.savedError'), 5000);
  }
}

async function guardarPrediccionesEspeciales() {
  if (!_plazoGrupos) return;
  try {
    window.mostrarToast('💾 Guardando...');
    await setDoc(
      doc(db, 'pred_especiales', _app.uid),
      {
        uid:        _app.uid,
        campeon:    _predEsp.campeon    || '',
        subcampeon: _predEsp.subcampeon || '',
        mvp:        _predEsp.mvp        || '',
        goleador:   _predEsp.goleador   || '',
        bloqueado:  false,
        timestamp:  serverTimestamp()
      },
      { merge: true }
    );
    window.mostrarToast('✅ ' + t('myPool.savedOk'));

    try {
      const { enviarEmailPredicciones } = await import('./email.js');
      await enviarEmailPredicciones(_app.usuario, _predEsp, 'especiales');
    } catch (e) {
      console.warn('[email]', e);
    }

  } catch (e) {
    console.error('[guardarEsp]', e);
    window.mostrarToast('❌ ' + t('myPool.savedError'), 5000);
  }
}

// ══════════════════════════════════════════════════════════════
//  CARGAR DESDE FIRESTORE
// ══════════════════════════════════════════════════════════════

async function cargarPrediccionesGrupos() {
  const q = query(
    collection(db, 'predicciones'),
    where('uid', '==', _app.uid)
  );
  const snap = await getDocs(q);
  snap.forEach(d => {
    const data = d.data();
    if (data.partido_id === 'desempates') {
      _predGrupos._desempates = data.desempates || {};
    } else {
      _predGrupos[data.partido_id] = {
        local:     data.local,
        visitante: data.visitante
      };
    }
  });
}

async function cargarPrediccionesElim() {
  const q = query(
    collection(db, 'predicciones_elim'),
    where('uid', '==', _app.uid)
  );
  const snap = await getDocs(q);
  snap.forEach(d => {
    const data = d.data();
    _predElim[data.partido_id] = {
      local:     data.local,
      visitante: data.visitante,
      ganador:   data.ganador
    };
  });
}

async function cargarPrediccionesEspeciales() {
  const snap = await getDoc(doc(db, 'pred_especiales', _app.uid));
  if (snap.exists()) {
    _predEsp = snap.data();
  }
}

async function cargarResultados() {
  const snap = await getDocs(collection(db, 'resultados'));
  snap.forEach(d => {
    _resultados[d.id] = d.data();
  });
}

async function cargarBracket() {
  const snap = await getDoc(doc(db, 'config', 'bracket_eliminatorias'));
  if (snap.exists()) {
    _bracket = snap.data();
  }
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

function calcularStats() {
  let jugados = 0, exactos = 0, ganador = 0, puntos = 0;
  PARTIDOS_GRUPOS.forEach(p => {
    const res  = _resultados[p.id];
    const pred = _predGrupos[p.id];
    if (!res || !pred) return;
    jugados++;
    if (pred.local === res.goles_local && pred.visitante === res.goles_visitante) {
      exactos++; puntos += 3;
    } else if (signo(pred.local, pred.visitante) === signo(res.goles_local, res.goles_visitante)) {
      ganador++; puntos += 1;
    }
  });
  return { jugados, exactos, ganador, puntos };
}

function signo(a, b) {
  if (a > b)  return 1;
  if (a < b)  return -1;
  return 0;
}

function clasePredGrupo(pred, res) {
  if (pred.local === res.goles_local && pred.visitante === res.goles_visitante) return 'pred-exact';
  if (signo(pred.local, pred.visitante) === signo(res.goles_local, res.goles_visitante)) return 'pred-winner';
  return 'pred-miss';
}

function badgePuntosGrupo(pred, res) {
  if (pred.local === res.goles_local && pred.visitante === res.goles_visitante) {
    return `<span class="pts-badge pts-exact">+3 pts ${t('myPool.exactResult')}</span>`;
  }
  if (signo(pred.local, pred.visitante) === signo(res.goles_local, res.goles_visitante)) {
    return `<span class="pts-badge pts-winner">+1 pt ${t('myPool.winnerOk')}</span>`;
  }
  return `<span class="pts-badge pts-miss">0 pts ${t('myPool.missed')}</span>`;
}

function buscarFlag(nombre) {
  if (!nombre) return '';
  const eq = EQUIPOS_48.find(e => e.nombre.toLowerCase() === nombre.toLowerCase());
  return eq ? eq.flag : '';
}

function formatFechaLimite(campo) {
  if (!campo) return '—';
  try {
    const d = campo.toDate ? campo.toDate() : new Date(campo);
    return d.toLocaleString(undefined, {
      day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'
    });
  } catch { return '—'; }
}

// ── Autocompletado de equipos ──────────────────────────────────
window._onEspInput = (campo, valor) => {
  _predEsp[campo] = valor;
  const lista = document.getElementById(`ac_${campo}`);
  if (!lista) return;
  if (valor.length < 2) { lista.classList.add('hidden'); return; }

  const matches = EQUIPOS_48.filter(e =>
    e.nombre.toLowerCase().includes(valor.toLowerCase())
  ).slice(0, 6);

  if (!matches.length) { lista.classList.add('hidden'); return; }

  lista.innerHTML = matches.map(e =>
    `<div class="autocomplete-item" onclick="window._seleccionarEquipo('${campo}','${e.nombre}','${e.flag}')">
      <span style="font-size:16px;">${e.flag}</span> ${e.nombre}
    </div>`
  ).join('');
  lista.classList.remove('hidden');
};

window._seleccionarEquipo = (campo, nombre, flag) => {
  _predEsp[campo] = nombre;
  const input = document.getElementById(`esp_${campo}`);
  const lista  = document.getElementById(`ac_${campo}`);
  const hint   = document.getElementById(`hint_${campo}`);
  if (input) input.value = nombre;
  if (lista) lista.classList.add('hidden');
  if (hint)  { hint.textContent = flag + ' ' + nombre; hint.classList.remove('missing'); }
};

window._onEspDirecto = (campo, valor) => {
  _predEsp[campo] = valor;
  const hint = document.getElementById(`hint_${campo}`);
  if (hint) {
    hint.textContent = valor ? '✓ ' + valor : t('specials.missingWarning');
    hint.classList.toggle('missing', !valor);
  }
};

window._guardarEspeciales = () => guardarPrediccionesEspeciales();

// Cerrar autocompletado al hacer clic fuera
document.addEventListener('click', (e) => {
  if (!e.target.closest('.autocomplete-wrap')) {
    document.querySelectorAll('.autocomplete-list').forEach(l => l.classList.add('hidden'));
  }
});
