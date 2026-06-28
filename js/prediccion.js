// ============================================================
//  js/prediccion.js
//  Pestaña "Mi porra" — fase de grupos, eliminatorias,
//  especiales y mejores terceros
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
import { PARTIDOS_ELIM } from '../data/partidos_elim.js';

// ── Estado del módulo ─────────────────────────────────────────
let _app         = null;
let _subTab      = 'grupos';   // 'grupos' | 'eliminatorias' | 'especiales' | 'terceros'
let _grupoActivo = 'A';
let _verTodosGrupos = false;
let _predGrupos  = {};
let _predElim    = {};
let _predEsp     = {};
let _predTerceros = [];   // array de hasta 8 nombres de equipos seleccionados
let _resultados  = {};
let _bracket     = {};
let _plazoGrupos = true;
let _plazoElim   = true;
let _plazoTerceros = true;
let _config      = {};
let _totalGlobal = null;

// ── Punto de entrada ─────────────────────────────────────────
export async function initMiPorra(app) {
  _app = app;
  const contenedor = document.getElementById('miPorraContent');
  contenedor.innerHTML = `<div class="loading-inline"><div class="spinner-sm"></div><span>${t('common.loading')}</span></div>`;

  try {
    [_plazoGrupos, _plazoElim, _plazoTerceros, _config] = await Promise.all([
      plazoAbierto('grupos'),
      plazoAbierto('eliminatorias'),
      plazoAbierto('terceros'),
      obtenerConfig()
    ]);

    await Promise.all([
      cargarPrediccionesGrupos(),
      cargarPrediccionesElim(),
      cargarPrediccionesEspeciales(),
      cargarPrediccionesTerceros(),
      cargarResultados(),
      cargarBracket(),
      cargarTotalGlobal()
    ]);

    renderMiPorra(contenedor);

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
      <button class="sub-btn ${_subTab === 'terceros' ? 'active' : ''}"
        onclick="window._prediccionSetTab('terceros')">${t('subNav.thirdPlace')}</button>
    </div>

    <div id="prediccionTabContent"></div>
  `;

  window._prediccionSetTab = (tab) => {
    _subTab = tab;
    document.querySelectorAll('.sub-btn').forEach((b, i) => {
      b.classList.toggle('active', ['grupos','eliminatorias','especiales','terceros'][i] === tab);
    });
    renderTabContent();
  };

  window._guardarGrupos     = () => guardarPrediccionesGrupos();
  window._guardarElim       = () => guardarPrediccionesElim();
  window._guardarEspeciales = () => guardarPrediccionesEspeciales();
  window._guardarTerceros   = () => guardarPrediccionesTerceros();

  renderTabContent();
}

// ── Renderiza el contenido de la sub-pestaña activa ───────────
function renderTabContent() {
  const contenedor = document.getElementById('prediccionTabContent');
  if (_subTab === 'grupos')         renderGrupos(contenedor);
  else if (_subTab === 'eliminatorias') renderEliminatorias(contenedor);
  else if (_subTab === 'especiales')    renderEspecialesTab(contenedor);
  else                                  renderTerceros(contenedor);
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
                <span class="score-real">${res.goles_local} — ${res.goles_visitante}</span>
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

  html += renderClasificacionGrupo(_grupoActivo, cerrado);

  contenedor.innerHTML = html;
  if (window.parseTwemoji) window.parseTwemoji(contenedor);

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
          <div class="gt-head"></div>
        </div>
  `;

  const empatesGD = detectarEmpatesGD(tabla);

  tabla.forEach((eq, i) => {
    const pasa = i < 2;
    const esEmpate = empatesGD.some(par => par[0].nombre === eq.nombre || par[1].nombre === eq.nombre);
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
        <div class="gt-tie-icon">${esEmpate && !cerrado ? '⚠' : ''}</div>
      </div>
    `;
  });

  html += `</div>`;

  if (empatesGD.length && !cerrado) {
    empatesGD.forEach(par => {
      const key = `${grupo}_${par[0].nombre}_${par[1].nombre}`;
      const seleccionado = _predGrupos._desempates?.[key] || null;
      html += `
        <div class="tiebreak" style="margin-top:10px; border:1px solid var(--gold,#e6a817);
          border-radius:var(--radius); padding:12px 14px; background:var(--gold-pale,#fffbf0);">
          <div style="font-size:12px; font-weight:600; color:var(--gold-dark,#a07000);
            margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            ⚠ ${t('myPool.tiebreakNeeded')}
          </div>
          <div style="font-size:12px; color:var(--gold-dark,#a07000); margin-bottom:10px;">
            ${par[0].flag} ${par[0].nombre} ${t('common.and') || 'y'} ${par[1].flag} ${par[1].nombre}
            ${t('myPool.tiebreakExplain')}
          </div>
          <div class="tiebreak-opts">
            <button class="tiebreak-btn ${seleccionado === par[0].nombre ? 'selected' : ''}"
              onclick="window._onDesempate('${grupo}','${par[0].nombre}','${par[1].nombre}','${par[0].nombre}')">
              ${par[0].flag} ${par[0].nombre}
            </button>
            <button class="tiebreak-btn ${seleccionado === par[1].nombre ? 'selected' : ''}"
              onclick="window._onDesempate('${grupo}','${par[0].nombre}','${par[1].nombre}','${par[1].nombre}')">
              ${par[1].flag} ${par[1].nombre}
            </button>
          </div>
        </div>
      `;
    });
  }

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

function actualizarClasificacionGrupo(grupo) {
  const tablaEl = document.getElementById(`tabla_${grupo}`);
  if (!tablaEl) return;
  const partidos = getPartidosPorGrupo(grupo);
  const equipos  = obtenerEquiposGrupo(grupo);
  const tabla    = calcularTablaGrupo(grupo, partidos, equipos);

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
      tabla[i].gf  === tabla[i+1].gf  &&
      tabla[i].j   > 0
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
    if (!nombres.has(p.local)) { nombres.add(p.local); equipos.push({ nombre: p.local, flag: p.flagLocal }); }
    if (!nombres.has(p.visitante)) { nombres.add(p.visitante); equipos.push({ nombre: p.visitante, flag: p.flagVisitante }); }
  });
  return equipos;
}

// ══════════════════════════════════════════════════════════════
//  MEJORES TERCEROS — nueva 4ª sub-pestaña
// ══════════════════════════════════════════════════════════════

function renderTerceros(contenedor) {
  const cerrado  = !_plazoTerceros;
  const fechaStr = formatFechaLimite(_config.fecha_limite_terceros);

  const seleccionados = _predTerceros.length;
  const selPorGrupo = {};
  _predTerceros.forEach(nombre => {
    const partido = PARTIDOS_GRUPOS.find(p => p.local === nombre || p.visitante === nombre);
    if (partido) selPorGrupo[partido.grupo] = nombre;
  });

  const plazoInfo = cerrado
    ? `<div class="notice locked">🔒 ${t('thirdPlace.closedNotice')}</div>`
    : `<div class="notice">🔓 ${t('thirdPlace.openUntil')} <strong>${fechaStr}</strong> ${t('myPool.localTime')}</div>`;

  if (cerrado) {
    const tercerosConfirmados = new Set(_config.terceros_confirmados || []);
    const hayConfirmados = tercerosConfirmados.size > 0;

    let html = `${plazoInfo}`;

    if (_predTerceros.length === 0) {
      html += `<div class="notice" style="margin-top:8px; color:var(--tm);">No guardaste ninguna selección de mejores terceros.</div>`;
    } else {
      html += `<div style="margin-top:12px;">
        <div style="font-size:13px; font-weight:600; color:var(--gd); margin-bottom:10px;">
          🥉 ${t('thirdPlace.title')} — ${t('specials.locked')}
        </div>`;

      if (hayConfirmados) {
        html += `<div style="font-size:11px; color:var(--tm); margin-bottom:8px;">
          ${t('thirdPlace.officialThirds')}: ${[...tercerosConfirmados].join(', ')}
        </div>`;
      }

      _predTerceros.forEach(nombre => {
        const eq = EQUIPOS_48.find(e => e.nombre === nombre);
        const flag = eq?.flag || '';
        const esCorrecto = tercerosConfirmados.has(nombre);
        const icono = hayConfirmados && tercerosConfirmados.size === 8
          ? (esCorrecto ? '✅' : '❌')
          : esCorrecto
            ? '✅'
            : '⏳';
        const color = esCorrecto ? 'var(--gl)' : hayConfirmados ? 'var(--tm)' : 'var(--tm)';
        const textoEstado = esCorrecto
          ? t('thirdPlace.correct') + ' +0.5 pts'
          : (tercerosConfirmados.size === 8 ? t('thirdPlace.missed') : t('thirdPlace.resultPending'));

        html += `
          <div style="display:flex; align-items:center; gap:10px; padding:8px 10px;
            border:1px solid ${esCorrecto ? 'var(--gl)' : '#eee'};
            border-radius:var(--radius); margin-bottom:6px;
            background:${esCorrecto ? 'var(--gl-pale,#f0f7e8)' : '#fff'};">
            <span style="font-size:18px;">${flag}</span>
            <span style="flex:1; font-size:13px; font-weight:500;">${nombre}</span>
            <span style="font-size:12px; font-weight:600; color:${color};">
              ${icono} ${textoEstado}
            </span>
          </div>`;
      });

      if (hayConfirmados) {
        const aciertos = _predTerceros.filter(n => tercerosConfirmados.has(n)).length;
        const totalPosibles = tercerosConfirmados.size;
        html += `
          <div style="margin-top:12px; padding:10px 14px; background:var(--gg); border:1px solid var(--gp);
            border-radius:var(--radius); font-size:13px; font-weight:600; color:var(--gd);">
            ${aciertos}/${totalPosibles} aciertos confirmados · ${(aciertos * 0.5).toFixed(1)} pts
            ${totalPosibles < 8 ? `<span style="font-size:11px; font-weight:400; color:var(--tm); margin-left:8px;">(${8 - totalPosibles} pendiente${8 - totalPosibles !== 1 ? 's' : ''} de confirmar)</span>` : ''}
          </div>`;
      }
      html += `</div>`;
    }

    contenedor.innerHTML = html;
    return;
  }

  let html = `
    ${plazoInfo}
    <div style="margin-top:12px;">
      <div style="font-size:13px; font-weight:600; color:var(--gd); margin-bottom:4px;">
        🥉 ${t('thirdPlace.title')}
      </div>
      <div style="font-size:12px; color:var(--tm); margin-bottom:12px;">
        Elige 1 equipo de cada grupo que crees que pasará como mejor tercero. Máximo 8 grupos.
      </div>

      <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px; padding:8px 12px;
        background:${seleccionados === 8 ? 'var(--gl-pale,#f0f7e8)' : '#f7faf2'};
        border:1px solid ${seleccionados === 8 ? 'var(--gl)' : 'var(--gp)'};
        border-radius:var(--radius);">
        <span style="font-size:22px; font-family:'Bebas Neue',sans-serif; color:${seleccionados === 8 ? 'var(--gl)' : 'var(--gd)'};">
          ${seleccionados}/8
        </span>
        <span style="font-size:12px; color:var(--tm);">${t('thirdPlace.counter')}</span>
        ${seleccionados === 8
          ? `<span style="font-size:11px; color:var(--gl); margin-left:auto;">✓ Listo para guardar</span>`
          : ''}
      </div>
  `;

  GRUPOS.forEach(g => {
    const equiposGrupo = obtenerEquiposGrupo(g);
    const selEnGrupo   = selPorGrupo[g] || null;
    const grupoCompleto = seleccionados >= 8 && !selEnGrupo;

    html += `
      <div style="margin-bottom:10px; padding:10px 12px;
        border:1px solid ${selEnGrupo ? 'var(--gm)' : '#dde8cc'};
        border-radius:var(--radius);
        background:${selEnGrupo ? 'var(--gg)' : '#fff'};">
        <div style="font-size:10px; font-weight:700; color:var(--gm); text-transform:uppercase;
          letter-spacing:.5px; margin-bottom:8px;">
          ${t('common.group')} ${g}
          ${selEnGrupo ? `<span style="color:var(--gl); margin-left:6px;">✓ ${selEnGrupo}</span>` : ''}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
    `;

    equiposGrupo.forEach(eq => {
      const seleccionado = selEnGrupo === eq.nombre;
      const desactivado  = !seleccionado && grupoCompleto;

      html += `
        <label style="display:flex; align-items:center; gap:6px; padding:6px 10px;
          border:1px solid ${seleccionado ? 'var(--gm)' : '#eee'};
          border-radius:20px; cursor:${desactivado ? 'not-allowed' : 'pointer'};
          background:${seleccionado ? 'var(--gm)' : '#fafdf6'};
          opacity:${desactivado ? '0.4' : '1'};
          transition: all .15s;">
          <input type="checkbox"
            id="t_${g}_${eq.nombre.replace(/\s/g,'_')}"
            ${seleccionado ? 'checked' : ''}
            ${desactivado ? 'disabled' : ''}
            onchange="window._onTerceroChange('${g}','${eq.nombre}')"
            style="accent-color:var(--gm); width:14px; height:14px; flex-shrink:0;">
          <span style="font-size:16px;">${eq.flag}</span>
          <span style="font-size:12px; font-weight:${seleccionado ? '700' : '400'};
            color:${seleccionado ? '#fff' : 'var(--gd)'};">${eq.nombre}</span>
        </label>
      `;
    });

    html += `</div></div>`;
  });

  html += `
      ${seleccionados > 0 && seleccionados < 8
        ? `<div class="notice warn" style="margin-top:10px;">
            ⚠️ ${t('thirdPlace.minWarning')}
           </div>`
        : ''}

      <button class="btn btn-primary btn-full" style="margin-top:14px;"
        onclick="window._guardarTerceros()">
        💾 ${t('thirdPlace.saveBtn')}
      </button>
      <button class="btn btn-danger btn-full" style="margin-top:8px;"
        onclick="window._borrarPredicciones('terceros')">
        🗑️ Borrar mi selección de terceros
      </button>
    </div>`;

  contenedor.innerHTML = html;

  window._onTerceroChange = (grupo, nombre) => {
    const anteriorEnGrupo = selPorGrupo[grupo];

    if (anteriorEnGrupo === nombre) {
      _predTerceros = _predTerceros.filter(n => n !== nombre);
    } else {
      if (anteriorEnGrupo) {
        _predTerceros = _predTerceros.filter(n => n !== anteriorEnGrupo);
      }
      if (!anteriorEnGrupo && _predTerceros.length >= 8) {
        window.mostrarToast('⚠️ ' + t('thirdPlace.maxWarning'), 3000);
        const cb = document.getElementById(`t_${grupo}_${nombre.replace(/\s/g,'_')}`);
        if (cb) cb.checked = false;
        return;
      }
      _predTerceros = [..._predTerceros, nombre];
    }
    renderTerceros(contenedor);
  };

  window._borrarPredicciones = (tipo) => confirmarBorrado(tipo);
}

// ══════════════════════════════════════════════════════════════
//  PREDICCIONES ESPECIALES — sub-pestaña independiente
// ══════════════════════════════════════════════════════════════

function renderEspecialesTab(contenedor) {
  const cerrado = !_plazoGrupos;
  const esp     = _predEsp;
  const fechaStr = formatFechaLimite(_config.fecha_limite_grupos);

  if (cerrado) {
    const mvpOficial = _config.mvp_oficial      || '';
    const golOficial = _config.goleador_oficial || '';

    const norm = str =>
      (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const mvpOriginal  = esp.mvp           || '—';
    const mvpCorregido = esp.mvp_corregido || '';
    const mvpEfectivo  = mvpCorregido || mvpOriginal;
    const mvpAcierto   = mvpOficial && norm(mvpOficial) === norm(mvpEfectivo) && mvpEfectivo !== '—';

    const golOriginal  = esp.goleador           || '—';
    const golCorregido = esp.goleador_corregido || '';
    const golEfectivo  = golCorregido || golOriginal;
    const golAcierto   = golOficial && norm(golOficial) === norm(golEfectivo) && golEfectivo !== '—';

    const infoCorreccion = (original, corregido, oficial, acierto) => {
      let html = `<div class="special-value">${original}</div>`;
      if (corregido && norm(corregido) !== norm(original)) {
        html += `<div style="font-size:11px; color:var(--gd); margin-top:5px;
          background:var(--gl-pale, #f0f7e8); border-left:3px solid var(--gl);
          padding:4px 8px; border-radius:4px;">
          ✏️ El admin lo ha corregido a: <strong>${corregido}</strong>
        </div>`;
      }
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
      <div class="notice">🔓 ${t('specials.openUntil')} <strong>${fechaStr}</strong></div>

      <div class="special-card">
        <div class="special-label">${t('specials.champion')} <span class="special-pts-badge">${t('specials.champPts')}</span></div>
        <div class="autocomplete-wrap">
          <input class="special-input" type="text" id="esp_campeon"
            value="${esp.campeon || ''}" placeholder="${t('specials.teamPlaceholder')}"
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
          oninput="window._onEspDirecto('goleador', this.value)">
        <div class="special-hint ${!esp.goleador ? 'missing' : ''}" id="hint_goleador">
          ${esp.goleador ? '✓ ' + esp.goleador : t('specials.missingWarning')}
        </div>
        <div style="font-size:10px; color:var(--tm); margin-top:4px;">${t('specials.adminEditNote')}</div>
      </div>

      <button class="btn btn-primary btn-full" onclick="window._guardarEspeciales()">
        💾 ${t('specials.saveBtn')}
      </button>
      <button class="btn btn-danger btn-full" style="margin-top:8px;"
        onclick="window._borrarPredicciones('especiales')">
        🗑️ Borrar mis predicciones especiales
      </button>
    </div>`;
}

// ── Confirmar borrado de predicciones ─────────────────────────
function confirmarBorrado(tipo) {
  const labels = {
    grupos:        'predicciones de grupos',
    eliminatorias: 'predicciones de eliminatorias',
    especiales:    'predicciones especiales',
    terceros:      'selección de mejores terceros'
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
    } else if (tipo === 'terceros') {
      await deleteDoc(doc(db, 'pred_terceros', _app.uid));
      _predTerceros = [];
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
      <div class="bracket-canvas" id="bracketCanvas" style="position:relative; min-width:1300px; height:880px;">
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

function renderBracketSVG(cerrado) {
  return `
    <svg style="position:absolute;top:0;left:0;width:1300px;height:880px;pointer-events:none;overflow:visible;">
      <!-- ── IZQUIERDA: R32 → R16 ── -->
      <line class="conn-line" x1="130" y1="62"  x2="137" y2="62"/>
      <line class="conn-line" x1="130" y1="172" x2="137" y2="172"/>
      <line class="conn-line" x1="137" y1="62"  x2="137" y2="172"/>
      <line class="conn-line" x1="137" y1="117" x2="145" y2="117"/>

      <line class="conn-line" x1="130" y1="282" x2="137" y2="282"/>
      <line class="conn-line" x1="130" y1="392" x2="137" y2="392"/>
      <line class="conn-line" x1="137" y1="282" x2="137" y2="392"/>
      <line class="conn-line" x1="137" y1="337" x2="145" y2="337"/>

      <line class="conn-line" x1="130" y1="502" x2="137" y2="502"/>
      <line class="conn-line" x1="130" y1="612" x2="137" y2="612"/>
      <line class="conn-line" x1="137" y1="502" x2="137" y2="612"/>
      <line class="conn-line" x1="137" y1="557" x2="145" y2="557"/>

      <line class="conn-line" x1="130" y1="722" x2="137" y2="722"/>
      <line class="conn-line" x1="130" y1="832" x2="137" y2="832"/>
      <line class="conn-line" x1="137" y1="722" x2="137" y2="832"/>
      <line class="conn-line" x1="137" y1="777" x2="145" y2="777"/>

      <!-- ── IZQUIERDA: R16 → QF ── -->
      <line class="conn-line" x1="275" y1="117" x2="282" y2="117"/>
      <line class="conn-line" x1="275" y1="337" x2="282" y2="337"/>
      <line class="conn-line" x1="282" y1="117" x2="282" y2="337"/>
      <line class="conn-line" x1="282" y1="227" x2="290" y2="227"/>

      <line class="conn-line" x1="275" y1="557" x2="282" y2="557"/>
      <line class="conn-line" x1="275" y1="777" x2="282" y2="777"/>
      <line class="conn-line" x1="282" y1="557" x2="282" y2="777"/>
      <line class="conn-line" x1="282" y1="667" x2="290" y2="667"/>

      <!-- ── IZQUIERDA: QF → SF ── -->
      <line class="conn-line" x1="420" y1="227" x2="427" y2="227"/>
      <line class="conn-line" x1="420" y1="667" x2="427" y2="667"/>
      <line class="conn-line" x1="427" y1="227" x2="427" y2="667"/>
      <line class="conn-line" x1="427" y1="447" x2="435" y2="447"/>

      <!-- ── IZQUIERDA: SF → FINAL ── -->
      <line class="conn-line" x1="565" y1="447" x2="580" y2="447" stroke-width="2"/>

      <!-- ── DERECHA: R32 → R16 ── -->
      <line class="conn-line" x1="1170" y1="62"  x2="1163" y2="62"/>
      <line class="conn-line" x1="1170" y1="172" x2="1163" y2="172"/>
      <line class="conn-line" x1="1163" y1="62"  x2="1163" y2="172"/>
      <line class="conn-line" x1="1163" y1="117" x2="1155" y2="117"/>

      <line class="conn-line" x1="1170" y1="282" x2="1163" y2="282"/>
      <line class="conn-line" x1="1170" y1="392" x2="1163" y2="392"/>
      <line class="conn-line" x1="1163" y1="282" x2="1163" y2="392"/>
      <line class="conn-line" x1="1163" y1="337" x2="1155" y2="337"/>

      <line class="conn-line" x1="1170" y1="502" x2="1163" y2="502"/>
      <line class="conn-line" x1="1170" y1="612" x2="1163" y2="612"/>
      <line class="conn-line" x1="1163" y1="502" x2="1163" y2="612"/>
      <line class="conn-line" x1="1163" y1="557" x2="1155" y2="557"/>

      <line class="conn-line" x1="1170" y1="722" x2="1163" y2="722"/>
      <line class="conn-line" x1="1170" y1="832" x2="1163" y2="832"/>
      <line class="conn-line" x1="1163" y1="722" x2="1163" y2="832"/>
      <line class="conn-line" x1="1163" y1="777" x2="1155" y2="777"/>

      <!-- ── DERECHA: R16 → QF ── -->
      <line class="conn-line" x1="1025" y1="117" x2="1018" y2="117"/>
      <line class="conn-line" x1="1025" y1="337" x2="1018" y2="337"/>
      <line class="conn-line" x1="1018" y1="117" x2="1018" y2="337"/>
      <line class="conn-line" x1="1018" y1="227" x2="1010" y2="227"/>

      <line class="conn-line" x1="1025" y1="557" x2="1018" y2="557"/>
      <line class="conn-line" x1="1025" y1="777" x2="1018" y2="777"/>
      <line class="conn-line" x1="1018" y1="557" x2="1018" y2="777"/>
      <line class="conn-line" x1="1018" y1="667" x2="1010" y2="667"/>

      <!-- ── DERECHA: QF → SF ── -->
      <line class="conn-line" x1="880" y1="227" x2="873" y2="227"/>
      <line class="conn-line" x1="880" y1="667" x2="873" y2="667"/>
      <line class="conn-line" x1="873" y1="227" x2="873" y2="667"/>
      <line class="conn-line" x1="873" y1="447" x2="865" y2="447"/>

      <!-- ── DERECHA: SF → FINAL ── -->
      <line class="conn-line" x1="735" y1="447" x2="720" y2="447" stroke-width="2"/>

      <!-- ── 3er PUESTO (dashed) ── -->
      <line class="conn-line" x1="500" y1="484" x2="500" y2="568" stroke-dasharray="4,3" opacity="0.5"/>
      <line class="conn-line" x1="500" y1="568" x2="580" y2="568" stroke-dasharray="4,3" opacity="0.5"/>
      <line class="conn-line" x1="800" y1="484" x2="800" y2="568" stroke-dasharray="4,3" opacity="0.5"/>
      <line class="conn-line" x1="800" y1="568" x2="720" y2="568" stroke-dasharray="4,3" opacity="0.5"/>
    </svg>
  `;
}

function renderBracketPartidos(cerrado) {
  let html = '';

  const colsL = [
    { label: '1/16',      x: 0   },
    { label: '1/8',       x: 145 },
    { label: 'Cuartos',   x: 290 },
    { label: 'Semis',     x: 435 },
  ];
  colsL.forEach(c => {
    html += `<div class="bracket-col-label" style="left:${c.x}px;top:6px;width:130px;">${c.label}</div>`;
  });
  html += `<div class="bracket-col-label" style="left:580px;top:6px;width:140px;text-align:center;">🏆 Final</div>`;
  const colsR = [
    { label: 'Semis',     x: 735  },
    { label: 'Cuartos',   x: 880  },
    { label: '1/8',       x: 1025 },
    { label: '1/16',      x: 1170 },
  ];
  colsR.forEach(c => {
    html += `<div class="bracket-col-label" style="left:${c.x}px;top:6px;width:130px;">${c.label}</div>`;
  });
  html += `<div class="bracket-col-label" style="left:580px;top:530px;width:140px;text-align:center;color:var(--tm);">🥉 3er puesto</div>`;

  const r32L = obtenerPartidos16();
  const posR32L = [
    { id:'r32_3',  top:24  }, { id:'r32_6',  top:134 },
    { id:'r32_1',  top:244 }, { id:'r32_4',  top:354 },
    { id:'r32_11', top:464 }, { id:'r32_12', top:574 },
    { id:'r32_9',  top:684 }, { id:'r32_10', top:794 },
  ];
  posR32L.forEach(({ id, top }) => {
    const p = r32L.find(x => x.id === id);
    if (p) html += renderBracketMatch(p, 0, top, cerrado, '1/16');
  });

  const partidos8 = obtenerPartidosFase('1/8');
  const posR16L = [
    { id:'r16_1', top:79  },
    { id:'r16_2', top:299 },
    { id:'r16_5', top:519 },
    { id:'r16_6', top:739 },
  ];
  posR16L.forEach(({ id, top }) => {
    const p = partidos8.find(x => x.id === id);
    if (p) html += renderBracketMatch(p, 145, top, cerrado, '1/8');
  });

  const partidosCuartos = obtenerPartidosFase('1/4');
  const posQFL = [
    { id:'qf_1', top:189 },
    { id:'qf_2', top:629 },
  ];
  posQFL.forEach(({ id, top }) => {
    const p = partidosCuartos.find(x => x.id === id);
    if (p) html += renderBracketMatch(p, 290, top, cerrado, '1/4');
  });

  const partidosSemis = obtenerPartidosFase('semi');
  const sf1 = partidosSemis.find(x => x.id === 'sf_1');
  if (sf1) html += renderBracketMatch(sf1, 435, 409, cerrado, 'semi');

  const final = obtenerPartidosFase('final')[0];
  if (final) {
    html += renderBracketMatch({ ...final, esFinal: true }, 580, 409, cerrado, 'final');
    const pred     = _predElim[final.id] || {};
    const campeon  = pred.ganador || '—';
    const coincide = campeon === _predEsp.campeon;
    html += `
      <div class="champ-badge" style="position:absolute;left:580px;top:${409+80}px;width:140px;">
        🥇 ${campeon}
      </div>
      <div class="champ-sub" style="position:absolute;left:580px;top:${409+98}px;width:140px;font-size:8px;color:#aaa;text-align:center;">
        ${coincide && campeon !== '—'
          ? '✓ Coincide con tu predicción especial · +6 pts'
          : campeon !== '—' ? 'Diferente a tu predicción especial' : ''}
      </div>`;
  }

  const tercero = obtenerPartidosFase('3er')[0];
  if (tercero) html += renderBracketMatch(tercero, 580, 548, cerrado, '3er');

  const sf2 = partidosSemis.find(x => x.id === 'sf_2');
  if (sf2) html += renderBracketMatch(sf2, 735, 409, cerrado, 'semi');

  const posQFR = [
    { id:'qf_3', top:189 },
    { id:'qf_4', top:629 },
  ];
  posQFR.forEach(({ id, top }) => {
    const p = partidosCuartos.find(x => x.id === id);
    if (p) html += renderBracketMatch(p, 880, top, cerrado, '1/4');
  });

  const posR16R = [
    { id:'r16_3', top:79  },
    { id:'r16_4', top:299 },
    { id:'r16_7', top:519 },
    { id:'r16_8', top:739 },
  ];
  posR16R.forEach(({ id, top }) => {
    const p = partidos8.find(x => x.id === id);
    if (p) html += renderBracketMatch(p, 1025, top, cerrado, '1/8');
  });

  const posR32R = [
    { id:'r32_2',  top:24  }, { id:'r32_5',  top:134 },
    { id:'r32_7',  top:244 }, { id:'r32_8',  top:354 },
    { id:'r32_14', top:464 }, { id:'r32_16', top:574 },
    { id:'r32_13', top:684 }, { id:'r32_15', top:794 },
  ];
  posR32R.forEach(({ id, top }) => {
    const p = r32L.find(x => x.id === id);
    if (p) html += renderBracketMatch(p, 1170, top, cerrado, '1/16');
  });

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
  const locked = cerrado;

  let html = `
    <div class="bracket-match ${locked ? 'lock' : 'edit'} ${fase === 'final' ? 'final' : fase === '3er' ? 'third' : ''}"
      style="position:absolute; left:${left}px; top:${top}px; width:${anchura}px;">
      <div class="bm-date">📅 ${p.fechaUTC ? formatMatchDate(p.fechaUTC) : (p.fecha || '—')} · ${p.ciudad || '—'}</div>
      <div class="bm-team ${claseL}">
        ${flagL ? `<span class="bm-flag">${flagL}</span>` : ''}
        ${typeof eqL === 'string' && eqL.startsWith('<') ? eqL : `<span class="bm-name">${eqL}</span>`}
        <input class="bm-input" type="number" min="0" max="20"
          id="be_${p.id}_l" value="${pred.local ?? ''}"
          ${locked ? 'disabled' : ''}
          onchange="window._onElimScore('${p.id}')">
      </div>
      <div class="bm-team ${claseV}">
        ${flagV ? `<span class="bm-flag">${flagV}</span>` : ''}
        ${typeof eqV === 'string' && eqV.startsWith('<') ? eqV : `<span class="bm-name">${eqV}</span>`}
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

function obtenerPartidos16() {
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
    const datoAPI  = _bracket[c.id] || {};
    const elimData = PARTIDOS_ELIM.find(p => p.id === c.id);
    return {
      id:               c.id,
      equipoLocal:      datoAPI.equipoLocal      || null,
      equipoVisitante:  datoAPI.equipoVisitante  || null,
      flagLocal:        datoAPI.flagLocal        || '',
      flagVisitante:    datoAPI.flagVisitante    || '',
      placeholderLocal:    c.pL,
      placeholderVisitante:c.pV,
      fechaUTC:  elimData?.fechaUTC || null,
      fecha:            datoAPI.fecha            || c.fecha,
      ciudad:           datoAPI.ciudad           || c.ciudad,
      desbloqueado:     true
    };
  });
}

function obtenerPartidosFase(fase) {
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
    const elimData = PARTIDOS_ELIM.find(p => p.id === c.id);
    const esTercero = c.id === 'tp_1';
    // ── FIX: los equipos en R16+ siempre vienen de la propagación del jugador,
    //         nunca de datoAPI (config/bracket_eliminatorias), que podía tener
    //         datos obsoletos que sobreescribían el cuadro correcto. ──────────
    const equipL = (esTercero ? propagarPerdedor('sf_1') : propagarGanador(c.id, 'local')) || null;
    const equipV = (esTercero ? propagarPerdedor('sf_2') : propagarGanador(c.id, 'vis'))   || null;
    return {
      ...c,
      fechaUTC:        elimData?.fechaUTC || null,
      desbloqueado:    true,
      equipoLocal:     equipL,
      equipoVisitante: equipV,
      flagLocal:       buscarFlag(equipL) || '',
      flagVisitante:   buscarFlag(equipV) || '',
    };
  });
}

function propagarPerdedor(srcId) {
  const pred = _predElim[srcId];
  if (!pred?.ganador) return null;
  const local = propagarGanador(srcId, 'local');
  const vis   = propagarGanador(srcId, 'vis');
  if (!local && !vis) return null;
  return pred.ganador === local ? (vis || null) : (local || null);
}

function propagarGanador(partidoId, lado) {
  const mapa = {
    // Cruces oficiales FIFA 2026 (corregido 27-jun-2026)
    'r16_1':   { local: 'r32_3',  vis: 'r32_6'  }, // M89: W(M74) vs W(M77)
    'r16_2':   { local: 'r32_1',  vis: 'r32_4'  }, // M90: W(M73) vs W(M75)
    'r16_3':   { local: 'r32_2',  vis: 'r32_5'  }, // M91: W(M76) vs W(M78)
    'r16_4':   { local: 'r32_7',  vis: 'r32_8'  }, // M92: W(M79) vs W(M80)
    'r16_5':   { local: 'r32_11', vis: 'r32_12' }, // M93: W(M83) vs W(M84)
    'r16_6':   { local: 'r32_9',  vis: 'r32_10' }, // M94: W(M81) vs W(M82)
    'r16_7':   { local: 'r32_14', vis: 'r32_16' }, // M95: W(M86) vs W(M88)
    'r16_8':   { local: 'r32_13', vis: 'r32_15' }, // M96: W(M85) vs W(M87)
    'qf_1':    { local: 'r16_1',  vis: 'r16_2'  }, // M97: W(M89) vs W(M90)
    'qf_2':    { local: 'r16_5',  vis: 'r16_6'  }, // M98: W(M93) vs W(M94)
    'qf_3':    { local: 'r16_3',  vis: 'r16_4'  }, // M99: W(M91) vs W(M92)
    'qf_4':    { local: 'r16_7',  vis: 'r16_8'  }, // M100: W(M95) vs W(M96)
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

function onElimScoreChange(id) {
  const l = document.getElementById(`be_${id}_l`)?.value;
  const v = document.getElementById(`be_${id}_v`)?.value;
  if (!_predElim[id]) _predElim[id] = {};
  _predElim[id].local     = l !== '' ? parseInt(l) : '';
  _predElim[id].visitante = v !== '' ? parseInt(v) : '';

  if (l !== '' && v !== '' && parseInt(l) !== parseInt(v)) {
    const partido = buscarPartidoBracket(id);
    if (parseInt(l) > parseInt(v)) {
      _predElim[id].ganador = partido?.equipoLocal || partido?.placeholderLocal || null;
    } else {
      _predElim[id].ganador = partido?.equipoVisitante || partido?.placeholderVisitante || null;
    }
  } else if (parseInt(l) === parseInt(v)) {
    _predElim[id].ganador = null;
  }

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
      if (!id || pred.local == null || pred.visitante == null || pred.local === '' || pred.visitante === '') return;
      batch.push(setDoc(
        doc(db, 'predicciones', `${_app.uid}_${id}`),
        { uid: _app.uid, partido_id: id, local: pred.local, visitante: pred.visitante, timestamp: serverTimestamp() },
        { merge: true }
      ));
    });

    if (_predGrupos._desempates) {
      batch.push(setDoc(
        doc(db, 'predicciones', `${_app.uid}_desempates`),
        { uid: _app.uid, desempates: _predGrupos._desempates, timestamp: serverTimestamp() },
        { merge: true }
      ));
    }

    await Promise.all(batch);
    window.mostrarToast('✅ ' + t('myPool.savedOk'));

    try {
      const { enviarEmailPredicciones } = await import('./email.js');
      await enviarEmailPredicciones(_app.usuario, _predGrupos, 'grupos');
    } catch (e) { console.warn('[email]', e); }

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
      const partido = buscarPartidoBracket(id);
      const equipoLocalPred     = partido?.equipoLocal     || partido?.placeholderLocal     || null;
      const equipoVisitantePred = partido?.equipoVisitante || partido?.placeholderVisitante || null;

      batch.push(setDoc(
        doc(db, 'predicciones_elim', `${_app.uid}_${id}`),
        {
          uid:               _app.uid,
          partido_id:        id,
          local:             pred.local ?? '',
          visitante:         pred.visitante ?? '',
          ganador:           pred.ganador || null,
          equipo_local:      equipoLocalPred,
          equipo_visitante:  equipoVisitantePred,
          timestamp:         serverTimestamp()
        },
        { merge: true }
      ));
    });

    await Promise.all(batch);
    window.mostrarToast('✅ ' + t('myPool.savedOk'));

    try {
      const { enviarEmailPredicciones } = await import('./email.js');
      await enviarEmailPredicciones(_app.usuario, _predElim, 'eliminatorias');
    } catch (e) { console.warn('[email]', e); }

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
    } catch (e) { console.warn('[email]', e); }

  } catch (e) {
    console.error('[guardarEsp]', e);
    window.mostrarToast('❌ ' + t('myPool.savedError'), 5000);
  }
}

async function guardarPrediccionesTerceros() {
  if (!_plazoTerceros) return;

  if (_predTerceros.length < 8) {
    window.mostrarToast('⚠️ ' + t('thirdPlace.minWarning'), 4000);
    return;
  }
  if (_predTerceros.length > 8) {
    window.mostrarToast('⚠️ ' + t('thirdPlace.maxWarning'), 4000);
    return;
  }

  try {
    window.mostrarToast('💾 Guardando...');
    await setDoc(
      doc(db, 'pred_terceros', _app.uid),
      {
        uid:       _app.uid,
        equipos:   _predTerceros,
        timestamp: serverTimestamp()
      },
      { merge: true }
    );
    window.mostrarToast('✅ ' + t('thirdPlace.savedOk'));

    try {
      const { enviarEmailPredicciones } = await import('./email.js');
      await enviarEmailPredicciones(_app.usuario, _predTerceros, 'terceros');
    } catch (e) { console.warn('[email]', e); }

  } catch (e) {
    console.error('[guardarTerceros]', e);
    window.mostrarToast('❌ ' + t('thirdPlace.savedError'), 5000);
  }
}

// ══════════════════════════════════════════════════════════════
//  CARGAR DESDE FIRESTORE
// ══════════════════════════════════════════════════════════════

async function cargarPrediccionesGrupos() {
  const q = query(collection(db, 'predicciones'), where('uid', '==', _app.uid));
  const snap = await getDocs(q);
  snap.forEach(d => {
    const data = d.data();
    if (data.partido_id === 'desempates') {
      _predGrupos._desempates = data.desempates || {};
    } else {
      _predGrupos[data.partido_id] = { local: data.local, visitante: data.visitante };
    }
  });
}

async function cargarPrediccionesElim() {
  const q = query(collection(db, 'predicciones_elim'), where('uid', '==', _app.uid));
  const snap = await getDocs(q);
  snap.forEach(d => {
    const data = d.data();
    _predElim[data.partido_id] = { local: data.local, visitante: data.visitante, ganador: data.ganador };
  });
}

async function cargarPrediccionesEspeciales() {
  const snap = await getDoc(doc(db, 'pred_especiales', _app.uid));
  if (snap.exists()) _predEsp = snap.data();
}

async function cargarPrediccionesTerceros() {
  try {
    const snap = await getDoc(doc(db, 'pred_terceros', _app.uid));
   
