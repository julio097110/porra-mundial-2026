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
let _subTab      = 'grupos';   // 'grupos' | 'eliminatorias' | 'especiales'
let _grupoActivo = 'A';
let _verTodosGrupos = false;   // ver clasificación de todos los grupos a la vez
let _predGrupos  = {};
let _predElim    = {};
let _predEsp     = {};
let _resultados  = {};
let _bracket     = {};
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

    // Registrar la función de refresco de textos para el cambio de idioma.
    // Cuando el usuario pulsa ES/EN, app.html llama a window._refreshTextos()
    // en lugar de recargar el módulo entero, conservando así el estado
    // (grupo seleccionado, marcadores no guardados, sub-pestaña activa).
    window._refreshTextos = () => {
      const c = document.getElementById('miPorraContent');
      if (c) renderMiPorra(c);
    };

  } catch (e) {
    console.error('[prediccion]', e);
    contenedor.innerHTML = `<div class="notice error">⚠️ ${t('common.error')}</div>`;
  }
}

// ── Render principal ──────────────────────────────────────────
function renderMiPorra(contenedor) {
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
      <button class="sub-btn ${_subTab === 'especiales' ? 'active' : ''}"
        onclick="window._prediccionSetTab('especiales')">${t('subNav.specials')}</button>
    </div>

    <div id="prediccionTabContent"></div>
  `;

  window._prediccionSetTab = (tab) => {
    _subTab = tab;
    document.querySelectorAll('.sub-btn').forEach((b, i) => {
      b.classList.toggle('active', ['grupos','eliminatorias','especiales'][i] === tab);
    });
    renderTabContent();
  };

  window._guardarGrupos   = () => guardarPrediccionesGrupos();
  window._guardarElim     = () => guardarPrediccionesElim();
  window._guardarEspeciales = () => guardarPrediccionesEspeciales();

  renderTabContent();
}

// ── Renderiza el contenido de la sub-pestaña activa ───────────
function renderTabContent() {
  const contenedor = document.getElementById('prediccionTabContent');
  if (_subTab === 'grupos')         renderGrupos(contenedor);
  else if (_subTab === 'eliminatorias') renderEliminatorias(contenedor);
  else                              renderEspecialesTab(contenedor);
}

// ══════════════════════════════════════════════════════════════
//  FASE DE GRUPOS
// ══════════════════════════════════════════════════════════════

function renderGrupos(contenedor) {
  const cerrado  = !_plazoGrupos;
  const fechaStr = formatFechaLimite(_config.fecha_limite_grupos);

  const selectorGrupos = GRUPOS.map(g =>
    `<button class="pag-btn ${_grupoActivo === g && !_verTodosGrupos ? 'active' : ''}"
      onclick="window._prediccionSetGrupo('${g}')">${g}</button>`
  ).join('');

  contenedor.innerHTML = `
    ${cerrado
      ? `<div class="notice locked">🔒 ${t('myPool.closedNotice')}</div>`
      : `<div class="notice">🔓 ${t('myPool.openUntil')} <strong>${fechaStr}</strong> ${t('myPool.localTime')}</div>`
    }

    <div class="pag-row" style="flex-wrap:wrap; margin-bottom:8px; gap:4px;">
      ${selectorGrupos}
      <button class="pag-btn ${_verTodosGrupos ? 'active' : ''}"
        onclick="window._prediccionVerTodos()"
        style="min-width:80px;">
        ${_verTodosGrupos ? '← Volver' : 'Ver todos'}
      </button>
    </div>

    <div id="grupoContent"></div>

    ${!cerrado ? `
      <button class="btn btn-primary btn-full" onclick="window._guardarGrupos()">
        💾 ${t('myPool.saveBtn')}
      </button>
      <button class="btn btn-danger btn-full" style="margin-top:8px;"
        onclick="window._borrarPredicciones('grupos')">
        🗑️ Borrar mis predicciones de grupos
      </button>
    ` : ''}
  `;

  window._prediccionSetGrupo = (g) => {
    _grupoActivo = g;
    _verTodosGrupos = false;
    renderGrupos(contenedor);
  };

  window._prediccionVerTodos = () => {
    _verTodosGrupos = !_verTodosGrupos;
    renderGrupos(contenedor);
  };

  window._borrarPredicciones = (tipo) => confirmarBorrado(tipo);

  if (_verTodosGrupos) {
    renderTodosGrupos(document.getElementById('grupoContent'));
  } else {
    renderGrupoDetalle(document.getElementById('grupoContent'));
  }
}

// ── Clasificación de todos los grupos a la vez ────────────────
function renderTodosGrupos(contenedor) {
  let html = '';
  GRUPOS.forEach(g => {
    const partidos = getPartidosPorGrupo(g);
    const equipos  = obtenerEquiposGrupo(g);
    const tabla    = calcularTablaGrupo(g, partidos, equipos);

    html += `<div class="group-pill" style="margin-bottom:6px;">⚽ ${t('common.group')} ${g}</div>
    <div class="group-table" style="margin-bottom:14px;">
      <div class="group-table-header">
        <div class="gt-head">#</div>
        <div class="gt-head left">Equipo</div>
        <div class="gt-head">J</div><div class="gt-head">G</div>
        <div class="gt-head">E</div><div class="gt-head">P</div>
        <div class="gt-head">Pts</div>
      </div>`;
    tabla.forEach((eq, i) => {
      html += `
        <div class="group-table-row ${i < 2 ? 'qualifies' : ''}">
          <div class="gt-pos">${i + 1}</div>
          <div class="gt-team">
            <span class="gt-flag">${eq.flag}</span>
            <span class="gt-name">${eq.nombre}</span>
          </div>
          <div class="gt-val">${eq.j}</div><div class="gt-val">${eq.g}</div>
          <div class="gt-val">${eq.e}</div><div class="gt-val">${eq.p}</div>
          <div class="gt-pts">${eq.pts}</div>
        </div>`;
    });
    html += `</div>`;
  });
  contenedor.innerHTML = html;
  if (window.parseTwemoji) window.parseTwemoji(contenedor);
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

  // Ya no mostramos especiales aquí — tienen su propia sub-pestaña

  contenedor.innerHTML = html;

  // Procesar banderas recién renderizadas
  if (window.parseTwemoji) window.parseTwemoji(contenedor);

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
//  PREDICCIONES ESPECIALES — sub-pestaña independiente
// ══════════════════════════════════════════════════════════════

function renderEspecialesTab(contenedor) {
  const cerrado = !_plazoGrupos;
  const esp     = _predEsp;
  const fechaStr = formatFechaLimite(_config.fecha_limite_grupos);

  if (cerrado && esp.bloqueado) {
    const mvpOficial = _config.mvp_oficial      || '';
    const golOficial = _config.goleador_oficial || '';

    // Normalización para comparar sin importar acentos ni mayúsculas
    const norm = str =>
      (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    // MVP — lo que escribió el usuario es siempre esp.mvp
    const mvpOriginal  = esp.mvp           || '—';
    const mvpCorregido = esp.mvp_corregido || '';
    const mvpEfectivo  = mvpCorregido || mvpOriginal;
    const mvpAcierto   = mvpOficial && norm(mvpOficial) === norm(mvpEfectivo) && mvpEfectivo !== '—';

    // Goleador — lo que escribió el usuario es siempre esp.goleador
    const golOriginal  = esp.goleador           || '—';
    const golCorregido = esp.goleador_corregido || '';
    const golEfectivo  = golCorregido || golOriginal;
    const golAcierto   = golOficial && norm(golOficial) === norm(golEfectivo) && golEfectivo !== '—';

    const infoCorreccion = (original, corregido, oficial, acierto) => {
      // Nombre que escribió el usuario (siempre visible)
      let html = `<div class="special-value">${original}</div>`;

      // Aviso de corrección del admin (solo si existe y es diferente)
      if (corregido && norm(corregido) !== norm(original)) {
        html += `<div style="font-size:11px; color:var(--gd); margin-top:5px;
          background:var(--gl-pale, #f0f7e8); border-left:3px solid var(--gl);
          padding:4px 8px; border-radius:4px;">
          ✏️ El admin lo ha corregido a: <strong>${corregido}</strong>
        </div>`;
      }

      // Resultado oficial y acierto
      if (oficial) {
        html += `<div style="font-size:11px; margin-top:6px; font-weight:600;
          color:${acierto ? 'var(--gl)' : 'var(--r)'};">
          ${acierto ? '✅ ¡Acertado!' : '❌ No acertado'} · Resultado oficial: <strong>${oficial}</strong>
        </div>`;
      } else {
        html += `<div style="font-size:11px; color:var(--tm); margin-top:4px;">
          ⏳ Resultado oficial pendiente
        </div>`;
      }
      return html;
    };

    contenedor.innerHTML = `
      <div class="notice locked" style="margin-top:8px;">
        🔒 ${t('specials.lockedSince')} ${fechaStr}
      </div>
      <div class="special-card locked-card">
        <div class="special-label">${t('specials.champion')} <span class="special-locked-badge">🔒 ${t('specials.champPts')}</span></div>
        <div class="special-value"><span style="font-size:18px;">${buscarFlag(esp.campeon)}</span> ${esp.campeon || '—'}</div>
      </div>
      <div class="special-card locked-card">
        <div class="special-label">${t('specials.runnerUp')} <span class="special-locked-badge">🔒 ${t('specials.runnerUpPts')}</span></div>
        <div class="special-value"><span style="font-size:18px;">${buscarFlag(esp.subcampeon)}</span> ${esp.subcampeon || '—'}</div>
      </div>
      <div class="special-card locked-card">
        <div class="special-label">${t('specials.mvp')} <span class="special-locked-badge">🔒 ${t('specials.mvpPts')}</span></div>
        ${infoCorreccion(mvpOriginal, mvpCorregido, mvpOficial, mvpAcierto)}
      </div>
      <div class="special-card locked-card">
        <div class="special-label">${t('specials.topScorer')} <span class="special-locked-badge">🔒 ${t('specials.topScorerPts')}</span></div>
        ${infoCorreccion(golOriginal, golCorregido, golOficial, golAcierto)}
      </div>`;
    return;
  }

  contenedor.innerHTML = `
    <div style="margin-top:8px;">
      ${cerrado
        ? `<div class="notice locked">🔒 ${t('myPool.closedNotice')}</div>`
        : `<div class="notice">🔓 ${t('specials.openUntil')} <strong>${fechaStr}</strong></div>`
      }

      <div class="special-card">
        <div class="special-label">${t('specials.champion')} <span class="special-pts-badge">${t('specials.champPts')}</span></div>
        <div class="autocomplete-wrap">
          <input class="special-input" type="text" id="esp_campeon"
            value="${esp.campeon || ''}" placeholder="${t('specials.teamPlaceholder')}"
            ${cerrado ? 'disabled' : ''}
            oninput="window._onEspInput('campeon', this.value)" autocomplete="off">
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
            oninput="window._onEspInput('subcampeon', this.value)" autocomplete="off">
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
        <button class="btn btn-danger btn-full" style="margin-top:8px;"
          onclick="window._borrarPredicciones('especiales')">
          🗑️ Borrar mis predicciones especiales
        </button>
      ` : ''}
    </div>`;
}

// ── Confirmar borrado de predicciones ─────────────────────────
function confirmarBorrado(tipo) {
  const labels = {
    grupos:        'predicciones de grupos',
    eliminatorias: 'predicciones de eliminatorias',
    especiales:    'predicciones especiales'
  };
  window.appAbrirModal(
    '🗑️ Borrar ' + labels[tipo],
    `<p style="font-size:13px;">¿Seguro que quieres borrar todas tus <strong>${labels[tipo]}</strong>? Esta acción no se puede deshacer.</p>`,
    `<button class="btn btn-secondary" onclick="window.appCerrarModal()">Cancelar</button>
     <button class="btn btn-danger" onclick="window._confirmarBorradoFinal('${tipo}')">🗑️ Sí, borrar</button>`
  );
}

window._confirmarBorradoFinal = async (tipo) => {
  try {
    window.appCerrarModal();
    window.mostrarToast('🗑️ Borrando...');
    const { deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

    if (tipo === 'grupos') {
      const q = query(collection(db, 'predicciones'), where('uid', '==', _app.uid));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      _predGrupos = {};
    } else if (tipo === 'eliminatorias') {
      const q = query(collection(db, 'predicciones_elim'), where('uid', '==', _app.uid));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      _predElim = {};
    } else if (tipo === 'especiales') {
      await deleteDoc(doc(db, 'pred_especiales', _app.uid));
      _predEsp = {};
    }

    window.mostrarToast('✅ Predicciones borradas');
    renderTabContent();
  } catch (e) {
    console.error('[borrarPredicciones]', e);
    window.mostrarToast('❌ Error al borrar', 5000);
  }
};

// ══════════════════════════════════════════════════════════════
//  ELIMINATORIAS — BRACKET
// ══════════════════════════════════════════════════════════════

function renderEliminatorias(contenedor) {
  const cerrado  = !_plazoElim;
  const fechaStr = formatFechaLimite(_config.fecha_limite_eliminatorias);

  contenedor.innerHTML = `
    ${cerrado
      ? `<div class="notice locked">🔒 ${t('knockouts.closedNotice')}</div>`
      : `<div class="notice">🔓 ${t('knockouts.openUntil')} <strong>${fechaStr}</strong> ${t('myPool.localTime')}</div>`
    }

    <div class="bracket-legend">
      <div class="bl-item"><div class="bl-dot" style="border:1.5px solid var(--gm);"></div>Editable</div>
      <div class="bl-item"><div class="bl-dot" style="background:var(--gg);border:1px solid var(--gp);"></div>Ganador avanzado</div>
      <div class="bl-item"><div class="bl-dot" style="background:#fffbea;border:1px solid #f5e8b0;"></div>Empate — elige quién pasa</div>
    </div>

    <div class="bracket-scroll">
      <div class="bracket-canvas" id="bracketCanvas" style="position:relative; min-width:1100px; height:1380px;">
        ${renderBracketSVG(cerrado)}
        ${renderBracketPartidos(cerrado)}
      </div>
    </div>

    ${!cerrado ? `
      <button class="btn btn-primary btn-full" onclick="window._guardarElim()">
        💾 ${t('myPool.saveBtn')}
      </button>
      <button class="btn btn-danger btn-full" style="margin-top:8px;"
        onclick="window._borrarPredicciones('eliminatorias')">
        🗑️ Borrar mis predicciones de eliminatorias
      </button>
    ` : ''}
  `;

  window._guardarElim = () => guardarPrediccionesElim();
  window._onElimScore = (id) => onElimScoreChange(id);
  window._onElimTB    = (id, ganador) => onElimTiebreak(id, ganador);
  window._borrarPredicciones = (tipo) => confirmarBorrado(tipo);
}

// ── SVG conectores del bracket ────────────────────────────────
function renderBracketSVG(cerrado) {
  return `
    <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;">
      <!-- 1/16 → 1/8: cada par de partidos se une en el centro del 1/8 -->
      <path class="conn-line" d="M140,56  H146 V106 H150"/>
      <path class="conn-line" d="M140,140 H146 V106 H150"/>
      <path class="conn-line" d="M140,224 H146 V274 H150"/>
      <path class="conn-line" d="M140,308 H146 V274 H150"/>
      <path class="conn-line" d="M140,392 H146 V442 H150"/>
      <path class="conn-line" d="M140,476 H146 V442 H150"/>
      <path class="conn-line" d="M140,560 H146 V610 H150"/>
      <path class="conn-line" d="M140,644 H146 V610 H150"/>
      <path class="conn-line" d="M140,728 H146 V778 H150"/>
      <path class="conn-line" d="M140,812 H146 V778 H150"/>
      <path class="conn-line" d="M140,896 H146 V946 H150"/>
      <path class="conn-line" d="M140,980 H146 V946 H150"/>
      <path class="conn-line" d="M140,1064 H146 V1114 H150"/>
      <path class="conn-line" d="M140,1148 H146 V1114 H150"/>
      <path class="conn-line" d="M140,1232 H146 V1282 H150"/>
      <path class="conn-line" d="M140,1316 H146 V1282 H150"/>
      <!-- 1/8 → Cuartos -->
      <path class="conn-line" d="M290,106  H296 V190 H300"/>
      <path class="conn-line" d="M290,274  H296 V190 H300"/>
      <path class="conn-line" d="M290,442  H296 V526 H300"/>
      <path class="conn-line" d="M290,610  H296 V526 H300"/>
      <path class="conn-line" d="M290,778  H296 V862 H300"/>
      <path class="conn-line" d="M290,946  H296 V862 H300"/>
      <path class="conn-line" d="M290,1114 H296 V1198 H300"/>
      <path class="conn-line" d="M290,1282 H296 V1198 H300"/>
      <!-- Cuartos → Semis -->
      <path class="conn-line" d="M440,190  H446 V358 H450"/>
      <path class="conn-line" d="M440,526  H446 V358 H450"/>
      <path class="conn-line" d="M440,862  H446 V1030 H450"/>
      <path class="conn-line" d="M440,1198 H446 V1030 H450"/>
      <!-- Semis → Final -->
      <path class="conn-line" d="M590,358  H596 V694 H600"/>
      <path class="conn-line" d="M590,1030 H596 V694 H600"/>
      <!-- Semis → 3er puesto (perdedores) -->
      <path class="conn-line" d="M520,370 V1320 H600"/>
    </svg>
  `;
}

// ── Partidos del bracket posicionados absolutamente ───────────
function renderBracketPartidos(cerrado) {
  let html = '';

  // Etiquetas de columnas
  // Columnas: 1/16@0, 1/8@150, Cuartos@300, Semis@450, Final@600, ancho tarjeta=140
  const cols = [
    { label: '1/16 de final', left: 0   },
    { label: '1/8 de final',  left: 150 },
    { label: 'Cuartos',       left: 300 },
    { label: 'Semifinales',   left: 450 },
    { label: '🏆 Final',      left: 600 }
  ];
  cols.forEach(c => {
    html += `<div class="bracket-col-label" style="left:${c.left}px; top:6px; width:140px;">${c.label}</div>`;
  });
  html += `<div class="bracket-col-label" style="left:600px; top:1260px; width:140px; color:var(--tm);">🥉 3er y 4º puesto</div>`;

  // 1/16 (16 partidos, separación de 84px, altura tarjeta ~80px → cada 84px)
  // tops: 24, 108, 192, 276, 360, 444, 528, 612, 696, 780, 864, 948, 1032, 1116, 1200, 1284  — pero acotamos a 1/16 alto=80 → separación 84
  const tops16 = [24, 108, 192, 276, 360, 444, 528, 612, 696, 780, 864, 948, 1032, 1116, 1200, 1284];
  const partidos16 = obtenerPartidos16();
  partidos16.forEach((p, i) => {
    html += renderBracketMatch(p, 0, tops16[i], cerrado, '1/16');
  });

  // 1/8 (8 partidos): centrados entre pares de 1/16
  // par (0,1)→top=(24+108)/2+0=66, (2,3)→234, (4,5)→402, (6,7)→570, (8,9)→738, (10,11)→906, (12,13)→1074, (14,15)→1242
  const tops8 = [66, 234, 402, 570, 738, 906, 1074, 1242];
  const partidos8 = obtenerPartidosFase('1/8');
  partidos8.forEach((p, i) => {
    html += renderBracketMatch(p, 150, tops8[i], cerrado, '1/8');
  });

  // Cuartos (4 partidos): centrados entre pares de 1/8
  // (66+234)/2=150, (402+570)/2=486, (738+906)/2=822, (1074+1242)/2=1158
  const topsCuartos = [150, 486, 822, 1158];
  const partidosCuartos = obtenerPartidosFase('1/4');
  partidosCuartos.forEach((p, i) => {
    html += renderBracketMatch(p, 300, topsCuartos[i], cerrado, '1/4');
  });

  // Semis (2 partidos): centrados entre pares de cuartos
  // (150+486)/2=318, (822+1158)/2=990
  const topsSemis = [318, 990];
  const partidosSemis = obtenerPartidosFase('semi');
  partidosSemis.forEach((p, i) => {
    html += renderBracketMatch(p, 450, topsSemis[i], cerrado, 'semi');
  });

  // Final: centrada entre las dos semis
  // (318+990)/2=654
  const topFinal = 654;
  const final = obtenerPartidosFase('final')[0];
  if (final) {
    html += renderBracketMatch({ ...final, esFinal: true }, 600, topFinal, cerrado, 'final');
    const pred = _predElim[final?.id || 'final'];
    const campeon = pred?.ganador || '—';
    const coincide = campeon === _predEsp.campeon;
    html += `
      <div class="champ-badge" style="position:absolute; left:600px; top:${topFinal + 80}px; width:140px;">
        🥇 ${campeon}
      </div>
      <div class="champ-sub" style="position:absolute; left:600px; top:${topFinal + 98}px; width:140px; font-size:8px; color:#aaa; text-align:center;">
        ${coincide && campeon !== '—'
          ? '✓ Coincide con tu predicción especial · +6 pts'
          : campeon !== '—' ? 'Diferente a tu predicción especial' : ''}
      </div>
    `;
  }

  // 3er y 4º puesto: debajo de la final
  const tercero = obtenerPartidosFase('3er')[0];
  if (tercero) html += renderBracketMatch(tercero, 600, 1280, cerrado, '3er');

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

  // Solo se bloquea si el plazo está cerrado — todas las fases son editables desde el principio
  const locked = cerrado;

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
    { id:'r32_1',  pL:'2º Grupo A',   pV:'2º Grupo B',        fecha:'28 jun', ciudad:'Los Ángeles'    },
    { id:'r32_2',  pL:'1º Grupo C',   pV:'2º Grupo F',        fecha:'29 jun', ciudad:'Houston'        },
    { id:'r32_3',  pL:'1º Grupo E',   pV:'Mej. 3º A/B/C/D/F',fecha:'29 jun', ciudad:'Foxborough'     },
    { id:'r32_4',  pL:'1º Grupo F',   pV:'2º Grupo C',        fecha:'29 jun', ciudad:'Monterrey'      },
    { id:'r32_5',  pL:'2º Grupo E',   pV:'2º Grupo I',        fecha:'30 jun', ciudad:'Arlington'      },
    { id:'r32_6',  pL:'1º Grupo I',   pV:'Mej. 3º C/D/F/G/H',fecha:'30 jun', ciudad:'East Rutherford'},
    { id:'r32_7',  pL:'1º Grupo A',   pV:'Mej. 3º C/E/F/H/I',fecha:'30 jun', ciudad:'Ciudad de México'},
    { id:'r32_8',  pL:'1º Grupo L',   pV:'Mej. 3º E/H/I/J/K',fecha:'1 jul',  ciudad:'Atlanta'        },
    { id:'r32_9',  pL:'1º Grupo D',   pV:'Mej. 3º B/E/F/I/J',fecha:'2 jul',  ciudad:'San Francisco'  },
    { id:'r32_10', pL:'1º Grupo G',   pV:'Mej. 3º A/E/H/I/J',fecha:'2 jul',  ciudad:'Seattle'        },
    { id:'r32_11', pL:'2º Grupo K',   pV:'2º Grupo L',        fecha:'3 jul',  ciudad:'Toronto'        },
    { id:'r32_12', pL:'1º Grupo H',   pV:'2º Grupo J',        fecha:'3 jul',  ciudad:'Los Ángeles'    },
    { id:'r32_13', pL:'1º Grupo B',   pV:'Mej. 3º E/F/G/I/J',fecha:'4 jul',  ciudad:'Vancouver'      },
    { id:'r32_14', pL:'1º Grupo J',   pV:'2º Grupo H',        fecha:'4 jul',  ciudad:'Kansas City'    },
    { id:'r32_15', pL:'1º Grupo K',   pV:'Mej. 3º D/E/I/J/L',fecha:'5 jul',  ciudad:'Miami'          },
    { id:'r32_16', pL:'2º Grupo D',   pV:'2º Grupo G',        fecha:'5 jul',  ciudad:'Dallas'         },
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
  // Todos los partidos están desbloqueados desde el principio —
  // el usuario puede rellenar el bracket completo antes del Mundial
  const fases = {
    '1/8':   [
      { id:'r16_1', pL:'Gan. P1',  pV:'Gan. P2',  fecha:'5 jul',  ciudad:'Chicago'       },
      { id:'r16_2', pL:'Gan. P3',  pV:'Gan. P4',  fecha:'6 jul',  ciudad:'Phoenix'       },
      { id:'r16_3', pL:'Gan. P5',  pV:'Gan. P6',  fecha:'6 jul',  ciudad:'Denver'        },
      { id:'r16_4', pL:'Gan. P7',  pV:'Gan. P8',  fecha:'7 jul',  ciudad:'Kansas City'   },
      { id:'r16_5', pL:'Gan. P9',  pV:'Gan. P10', fecha:'7 jul',  ciudad:'San Francisco' },
      { id:'r16_6', pL:'Gan. P11', pV:'Gan. P12', fecha:'8 jul',  ciudad:'Seattle'       },
      { id:'r16_7', pL:'Gan. P13', pV:'Gan. P14', fecha:'8 jul',  ciudad:'Toronto'       },
      { id:'r16_8', pL:'Gan. P15', pV:'Gan. P16', fecha:'9 jul',  ciudad:'Miami'         },
    ],
    '1/4':   [
      { id:'qf_1',  pL:'Gan. 1/8 A', pV:'Gan. 1/8 B', fecha:'11 jul', ciudad:'Los Ángeles'  },
      { id:'qf_2',  pL:'Gan. 1/8 C', pV:'Gan. 1/8 D', fecha:'12 jul', ciudad:'Nueva York'   },
      { id:'qf_3',  pL:'Gan. 1/8 E', pV:'Gan. 1/8 F', fecha:'12 jul', ciudad:'Dallas'       },
      { id:'qf_4',  pL:'Gan. 1/8 G', pV:'Gan. 1/8 H', fecha:'13 jul', ciudad:'Atlanta'      },
    ],
    'semi':  [
      { id:'sf_1',  pL:'Gan. QF1', pV:'Gan. QF2', fecha:'15 jul', ciudad:'Los Ángeles'   },
      { id:'sf_2',  pL:'Gan. QF3', pV:'Gan. QF4', fecha:'16 jul', ciudad:'Nueva York'    },
    ],
    '3er':   [
      { id:'tp_1',  pL:'Perd. Semi 1', pV:'Perd. Semi 2', fecha:'18 jul', ciudad:'Miami'   },
    ],
    'final': [
      { id:'final_1', pL:'Gan. Semi 1', pV:'Gan. Semi 2', fecha:'19 jul', ciudad:'Nueva York' },
    ]
  };

  return (fases[fase] || []).map(c => {
    const datoAPI = _bracket[c.id] || {};
    const esTercero = c.id === 'tp_1';
    return {
      ...c,
      desbloqueado:    true,  // siempre editable
      equipoLocal:     datoAPI.equipoLocal     || (esTercero ? propagarPerdedor('sf_1') : propagarGanador(c.id, 'local')) || null,
      equipoVisitante: datoAPI.equipoVisitante || (esTercero ? propagarPerdedor('sf_2') : propagarGanador(c.id, 'vis'))   || null,
      flagLocal:       datoAPI.flagLocal       || '',
      flagVisitante:   datoAPI.flagVisitante   || '',
    };
  });
}

// Propaga el perdedor de una semifinal al partido de 3er y 4º puesto
function propagarPerdedor(srcId) {
  const pred = _predElim[srcId];
  if (!pred?.ganador) return null;
  // Buscar los equipos del partido fuente en _bracket o propagando desde cuartos
  const local = propagarGanador(srcId, 'local');
  const vis   = propagarGanador(srcId, 'vis');
  if (!local && !vis) return null;
  return pred.ganador === local ? (vis || null) : (local || null);
}

// Propaga el ganador elegido por el usuario al siguiente cruce
function propagarGanador(partidoId, lado) {
  // Mapa de dependencias: qué partido alimenta cada slot
  const mapa = {
    'r16_1':   { local: 'r32_1',  vis: 'r32_2'  },
    'r16_2':   { local: 'r32_3',  vis: 'r32_4'  },
    'r16_3':   { local: 'r32_5',  vis: 'r32_6'  },
    'r16_4':   { local: 'r32_7',  vis: 'r32_8'  },
    'r16_5':   { local: 'r32_9',  vis: 'r32_10' },
    'r16_6':   { local: 'r32_11', vis: 'r32_12' },
    'r16_7':   { local: 'r32_13', vis: 'r32_14' },
    'r16_8':   { local: 'r32_15', vis: 'r32_16' },
    'qf_1':    { local: 'r16_1',  vis: 'r16_2'  },
    'qf_2':    { local: 'r16_3',  vis: 'r16_4'  },
    'qf_3':    { local: 'r16_5',  vis: 'r16_6'  },
    'qf_4':    { local: 'r16_7',  vis: 'r16_8'  },
    'sf_1':    { local: 'qf_1',   vis: 'qf_2'   },
    'sf_2':    { local: 'qf_3',   vis: 'qf_4'   },
    'final_1': { local: 'sf_1',   vis: 'sf_2'   },
    'tp_1':    { local: 'sf_1',   vis: 'sf_2'   },
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
