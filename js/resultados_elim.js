// ============================================================
//  js/resultados_elim.js
//  Pestaña "Resultados" — Sub-vista Eliminatorias
//  - Jugadores: ven resultados confirmados de eliminatorias
//  - Admin: confirma resultados reales de eliminatorias
//
//  Este archivo es paralelo a resultados.js (que gestiona fase
//  de grupos). Se invoca desde resultados.js cuando el sub-toggle
//  Grupos/Eliminatorias está en "Eliminatorias".
//
//  Colección Firestore: resultados_elim
//  Documento por partido (id = id del partido en PARTIDOS_ELIM):
//  {
//    partido_id:            'r32_1',
//    ronda:                 'r32',
//    equipo_local:          'Brasil',
//    equipo_visitante:      'Japón',
//    goles_local:           2,
//    goles_visitante:       2,
//    hay_prorroga_penales:  true,
//    equipo_que_pasa:       'Brasil',
//    confirmado:            true,
//    confirmado_por:        uid,
//    confirmado_en:         serverTimestamp()
//  }
//
//  NOTA SOBRE PUNTOS (Paso 3 — pendiente):
//  recalcularPuntosElim() es por ahora un stub. El cálculo de
//  puntos de eliminatorias (reglas distintas a grupos) se
//  diseñará e implementará en una sesión posterior.
//
//  NOTA SOBRE BORRAR/EDITAR (decisión tomada con Julio):
//  Si se borra o edita un resultado de una ronda anterior que
//  ya tiene rondas posteriores confirmadas dependiendo de él,
//  NO se bloquea ni se hace borrado en cascada. Se permite la
//  acción mostrando un aviso explícito de que puede dejar
//  resultados posteriores inconsistentes, y es responsabilidad
//  del admin revisarlos manualmente.
// ============================================================

import { db } from './firebase-config.js';
import {
  doc, getDoc, setDoc, deleteDoc, collection,
  getDocs, onSnapshot, serverTimestamp,
  query, where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { t, formatMatchDate } from './i18n.js';
import { PARTIDOS_ELIM, getPartidoElimPorId, getPartidosElimPorRonda } from '../data/partidos_elim.js';
import { abrirModalPartido } from './informe-modal.js';

// ── Estado ────────────────────────────────────────────────────
let _app             = null;
let _resultadosElim  = {};   // { partidoId: {...documento resultados_elim} }
let _bracketOficial  = {};   // { partidoId: {equipoLocal, equipoVisitante, flagLocal, flagVisitante, confirmado} } — config/bracket_eliminatorias
let _unsubscribe     = null;

// Orden de rondas para renderizado agrupado
const ORDEN_RONDAS = ['r32', 'r16', 'qf', 'semi', '3er', 'final'];

// Mapeo entre el id técnico de ronda (16 partidos / 32 equipos, etc.)
// y la clave i18n correspondiente. IMPORTANTE: 'r32' son 16 partidos
// (32 equipos) = "1/16 de final"; 'r16' son 8 partidos (16 equipos)
// = "1/8 de final". Los ids técnicos heredan el nombre de "equipos
// que arrancan la ronda", no el número de partidos — no confundir.
function nombreRonda(ronda) {
  const claves = {
    r32:   'knockouts.round16',
    r16:   'knockouts.round8',
    qf:    'knockouts.quarterFinal',
    semi:  'knockouts.semiFinal',
    '3er': 'knockouts.thirdPlace',
    final: 'knockouts.final'
  };
  return t(claves[ronda]) || ronda;
}

// ── Mapa de dependencias entre rondas ─────────────────────────
// (idéntico al usado en prediccion.js para propagarGanador,
// pero aquí se aplica sobre resultados reales confirmados,
// no sobre predicciones de jugadores)
const MAPA_DEPENDENCIAS = {
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
  'tp_1':    { local: 'sf_1',   vis: 'sf_2'   },  // caso especial: perdedores, ver propagarPerdedorOficial
};

// ── Punto de entrada ─────────────────────────────────────────
// Invocado por resultados.js cuando el sub-toggle está en "Eliminatorias"
export async function initResultadosElim(app, contenedor) {
  _app = app;
  contenedor.innerHTML = `<div class="loading-inline"><div class="spinner-sm"></div><span>${t('common.loading')}</span></div>`;

  try {
    await cargarResultadosElimFirestore();
    await cargarBracketOficial();

    // Registrar handler de desglose una sola vez al iniciar el módulo
    window._verDesglosePartido = (id, esElim) => abrirModalPartido(id, esElim);

    if (_app.esAdmin) {
      renderAdminElim(contenedor);
    } else {
      renderJugadorElim(contenedor);
    }

    // Nota: el refresco de idioma para esta sub-vista lo controla
    // resultados.js (window._refreshTextos), que vuelve a invocar
    // initResultadosElim() completo cuando la sub-pestaña activa es
    // "eliminatorias". No se registra aquí un _refreshTextos propio
    // para evitar dos funciones de refresco compitiendo por el mismo
    // contrato global.

    // Escuchar cambios en tiempo real
    if (_unsubscribe) _unsubscribe();
    _unsubscribe = onSnapshot(collection(db, 'resultados_elim'), (snap) => {
      snap.forEach(d => { _resultadosElim[d.id] = d.data(); });
      const c = document.getElementById('resultadosTabContent');
      if (c) {
        if (_app.esAdmin) renderAdminElim(c);
        else renderJugadorElim(c);
      }
    });

  } catch (e) {
    console.error('[resultados_elim]', e);
    contenedor.innerHTML = `<div class="notice error">⚠️ ${t('common.error')}</div>`;
  }
}

// Permite a resultados.js limpiar el listener al cambiar de sub-toggle
export function detenerResultadosElim() {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
}

// ══════════════════════════════════════════════════════════════
//  RESOLUCIÓN DE EQUIPOS POR PARTIDO
// ══════════════════════════════════════════════════════════════

// Devuelve { local, visitante, flagLocal, flagVisitante, listos }
// para cualquier partido de eliminatorias, sea de r32 (viene del
// bracket de clasificados ya calculado en resultados.js) o de
// rondas posteriores (se propaga desde resultados_elim confirmados).
function obtenerEquiposPartidoElim(partidoId) {
  const partido = getPartidoElimPorId(partidoId);
  const ronda   = partido?.ronda;

  if (ronda === 'r32') {
    const b = _bracketOficial[partidoId] || {};
    return {
      local:          b.equipoLocal      || null,
      visitante:      b.equipoVisitante  || null,
      flagLocal:      b.flagLocal        || '',
      flagVisitante:  b.flagVisitante    || '',
      listos:         !!(b.equipoLocal && b.equipoVisitante)
    };
  }

  if (partidoId === 'tp_1') {
    const local     = propagarPerdedorOficial('sf_1');
    const visitante = propagarPerdedorOficial('sf_2');
    return {
      local, visitante,
      flagLocal: '', flagVisitante: '',
      listos: !!(local && visitante)
    };
  }

  const local     = propagarGanadorOficial(partidoId, 'local');
  const visitante = propagarGanadorOficial(partidoId, 'vis');
  return {
    local, visitante,
    flagLocal: '', flagVisitante: '',
    listos: !!(local && visitante)
  };
}

// Propaga el equipo que pasó de ronda desde el partido fuente confirmado
function propagarGanadorOficial(partidoId, lado) {
  const dep = MAPA_DEPENDENCIAS[partidoId];
  if (!dep) return null;
  const srcId = dep[lado];
  const res   = _resultadosElim[srcId];
  if (!res?.confirmado) return null;
  return res.equipo_que_pasa || null;
}

// Propaga el perdedor de una semifinal (para el partido de 3er/4º puesto)
function propagarPerdedorOficial(srcId) {
  const res = _resultadosElim[srcId];
  if (!res?.confirmado) return null;
  const { equipo_local, equipo_visitante, equipo_que_pasa } = res;
  if (!equipo_que_pasa) return null;
  return equipo_que_pasa === equipo_local ? (equipo_visitante || null) : (equipo_local || null);
}

// ══════════════════════════════════════════════════════════════
//  VISTA JUGADOR
// ══════════════════════════════════════════════════════════════

function renderJugadorElim(contenedor) {
  let html = `<div style="margin-top:8px;">`;

  ORDEN_RONDAS.forEach(ronda => {
    const partidos = getPartidosElimPorRonda(ronda);
    if (!partidos.length) return;

    html += `<div class="group-pill" style="margin:14px 0 8px;">🏆 ${nombreRonda(ronda)}</div>`;
    partidos.forEach(p => {
      html += renderTarjetaResultadoElim(p);
    });
  });

  html += `</div>`;
  contenedor.innerHTML = html;
  if (window.parseTwemoji) window.parseTwemoji(contenedor);
}

// ── Tarjeta resultado (jugador, solo lectura) ─────────────────
function renderTarjetaResultadoElim(p) {
  const res         = _resultadosElim[p.id];
  const confirmado  = res?.confirmado;
  const equipos     = obtenerEquiposPartidoElim(p.id);

  // Caso: equipos aún no determinados (ronda anterior no confirmada)
  if (!equipos.listos && !confirmado) {
    return `
      <div class="match-card no-result">
        <div class="match-meta">
          <span>${formatMatchDate(p.fechaUTC)}</span>
          <span>📍 ${p.ciudad}</span>
          <span class="match-tag pend">${t('scores.pending')}</span>
        </div>
        <div class="match-row">
          <div class="match-team">
            <span class="match-name" style="color:var(--tm);">${t('scores.tbd')}</span>
          </div>
          <span class="score-real" style="color:#ccc;">— — —</span>
          <div class="match-team right">
            <span class="match-name" style="color:var(--tm);">${t('scores.tbd')}</span>
          </div>
        </div>
      </div>
    `;
  }

  const nombreLocal     = equipos.local     || res?.equipo_local     || t('scores.tbd');
  const nombreVisitante = equipos.visitante || res?.equipo_visitante || t('scores.tbd');

  return `
    <div class="match-card ${confirmado ? 'confirmed' : ''}">
      <div class="match-meta">
        <span>${formatMatchDate(p.fechaUTC)}</span>
        <span>📍 ${p.ciudad}</span>
        ${confirmado
          ? `<span class="match-tag ok">✓ ${t('scores.confirmed')}</span>`
          : `<span class="match-tag pend">${t('scores.pending')}</span>`}
        ${confirmado
          ? `<button onclick="window._verDesglosePartido('${p.id}', true)"
              title="Ver puntos de este partido"
              style="background:none; border:none; cursor:pointer; font-size:13px;
                padding:2px 4px; border-radius:4px; line-height:1; color:var(--tm);
                transition:color .15s; margin-left:2px;"
              onmouseover="this.style.color='var(--gm)'"
              onmouseout="this.style.color='var(--tm)'">🔍</button>`
          : ''}
      </div>
      <div class="match-row">
        <div class="match-team">
          <span class="match-flag">${equipos.flagLocal}</span>
          <span class="match-name">${nombreLocal}</span>
        </div>
        ${confirmado
          ? `<span class="score-real confirmed">${res.goles_local} — ${res.goles_visitante}</span>`
          : `<span class="score-real" style="color:#ccc;">— — —</span>`}
        <div class="match-team right">
          <span class="match-flag">${equipos.flagVisitante}</span>
          <span class="match-name">${nombreVisitante}</span>
        </div>
      </div>
      ${confirmado && res.hay_prorroga_penales
        ? `<div class="match-footer"><span style="font-size:11px; color:var(--tm);">⚽ ${t('scores.advances')}: ${res.equipo_que_pasa}</span></div>`
        : ''}
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
//  VISTA ADMIN
// ══════════════════════════════════════════════════════════════

function renderAdminElim(contenedor) {
  let html = `
    <div style="margin-top:8px;">
      <div class="notice">${t('scores.adminOnly')}</div>
  `;

  ORDEN_RONDAS.forEach(ronda => {
    const partidos = getPartidosElimPorRonda(ronda);
    if (!partidos.length) return;

    html += `<div class="group-pill" style="margin:14px 0 8px;">🏆 ${nombreRonda(ronda)}</div>`;
    partidos.forEach(p => {
      html += renderTarjetaAdminElim(p);
    });
  });

  html += `</div>`;
  contenedor.innerHTML = html;
  if (window.parseTwemoji) window.parseTwemoji(contenedor);

  // Handlers
  window._confirmarResElim  = (id) => confirmarResultadoElim(id);
  window._editarResElim     = (id) => editarResultadoElim(id);
  window._borrarResElim     = (id) => confirmarBorrarResultadoElim(id);
  window._onMarcadorElimChange = (id) => onMarcadorElimChange(id);
  window._seleccionarPasaElim  = (id, lado) => seleccionarPasaElim(id, lado);
}

// ── Tarjeta resultado (admin) ──────────────────────────────────
function renderTarjetaAdminElim(p) {
  const res        = _resultadosElim[p.id];
  const confirmado = res?.confirmado;
  const equipos    = obtenerEquiposPartidoElim(p.id);

  // Caso: equipos aún no determinados — sin inputs, sin botón
  if (!equipos.listos && !confirmado) {
    return `
      <div class="match-card no-result">
        <div class="match-meta">
          <span>${formatMatchDate(p.fechaUTC)}</span>
          <span>📍 ${p.ciudad}</span>
          <span class="match-tag pend">${t('scores.tbd')}</span>
        </div>
        <div class="match-row">
          <div class="match-team">
            <span class="match-name" style="color:var(--tm);">${t('scores.tbd')}</span>
          </div>
          <span class="score-real" style="color:#ccc;">— — —</span>
          <div class="match-team right">
            <span class="match-name" style="color:var(--tm);">${t('scores.tbd')}</span>
          </div>
        </div>
        <div class="match-footer">
          <span style="font-size:11px; color:var(--tm);">Esperando resultado de ronda anterior</span>
        </div>
      </div>
    `;
  }

  const nombreLocal     = equipos.local     || res?.equipo_local     || '?';
  const nombreVisitante = equipos.visitante || res?.equipo_visitante || '?';

  // Caso: ya confirmado
  if (confirmado) {
    return `
      <div class="match-card confirmed">
        <div class="match-meta">
          <span>${formatMatchDate(p.fechaUTC)}</span>
          <span>📍 ${p.ciudad}</span>
          <span class="match-tag ok">✓ ${t('scores.confirmed')}</span>
          <button onclick="window._verDesglosePartido('${p.id}', true)"
            title="Ver puntos de este partido"
            style="background:none; border:none; cursor:pointer; font-size:13px;
              padding:2px 4px; border-radius:4px; line-height:1; color:var(--tm);
              transition:color .15s; margin-left:2px;"
            onmouseover="this.style.color='var(--gm)'"
            onmouseout="this.style.color='var(--tm)'">🔍</button>
        </div>
        <div class="match-row">
          <div class="match-team">
            <span class="match-name">${nombreLocal}</span>
          </div>
          <span class="score-real confirmed">${res.goles_local} — ${res.goles_visitante}</span>
          <div class="match-team right">
            <span class="match-name">${nombreVisitante}</span>
          </div>
        </div>
        ${res.hay_prorroga_penales
          ? `<div class="match-footer"><span style="font-size:11px; color:var(--tm);">⚽ Pasa: <strong>${res.equipo_que_pasa}</strong> (prórroga/penaltis)</span></div>`
          : ''}
        <div class="match-footer">
          <span class="match-confirmed-label">✓ ${t('scores.confirmed')}</span>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="window._editarResElim('${p.id}')">
              ✏️ ${t('scores.editBtn')}
            </button>
            <button class="btn btn-danger btn-sm" onclick="window._borrarResElim('${p.id}')">
              🗑️ Borrar
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Caso: equipos listos, pendiente de confirmar
  const valL = '';
  const valV = '';
  const empatado = res?.goles_local !== undefined && res?.goles_local === res?.goles_visitante;

  return `
    <div class="match-card">
      <div class="match-meta">
        <span>${formatMatchDate(p.fechaUTC)}</span>
        <span>📍 ${p.ciudad}</span>
        <span class="match-tag pend">${t('scores.noResult')}</span>
      </div>
      <div class="match-row">
        <div class="match-team">
          <span class="match-name">${nombreLocal}</span>
        </div>
        <div class="score-area">
          <span class="score-label">${t('scores.result')}</span>
          <div class="score-inputs">
            <input class="score-input" type="number" min="0" max="20"
              id="rese_${p.id}_l" value="${valL}"
              onchange="window._onMarcadorElimChange('${p.id}')">
            <span class="score-sep">—</span>
            <input class="score-input" type="number" min="0" max="20"
              id="rese_${p.id}_v" value="${valV}"
              onchange="window._onMarcadorElimChange('${p.id}')">
          </div>
        </div>
        <div class="match-team right">
          <span class="match-name">${nombreVisitante}</span>
        </div>
      </div>
      <div id="tiebreak_${p.id}" class="tiebreak" style="display:${empatado ? 'block' : 'none'};">
        <div class="tiebreak-label">${t('knockouts.whoAdvances')}</div>
        <div class="tiebreak-opts">
          <button type="button" class="tiebreak-btn" id="rese_${p.id}_pasa_local"
            onclick="window._seleccionarPasaElim('${p.id}', 'local')">${nombreLocal}</button>
          <button type="button" class="tiebreak-btn" id="rese_${p.id}_pasa_visitante"
            onclick="window._seleccionarPasaElim('${p.id}', 'visitante')">${nombreVisitante}</button>
        </div>
      </div>
      <div class="match-footer">
        <span style="font-size:11px; color:var(--tm);">Introducir manualmente</span>
        <button class="btn btn-primary btn-sm" onclick="window._confirmarResElim('${p.id}')">
          ✓ ${t('scores.confirmBtn')}
        </button>
      </div>
    </div>
  `;
}

// Marca como seleccionado uno de los dos botones de tiebreak (¿quién pasa?)
function seleccionarPasaElim(partidoId, lado) {
  const btnLocal     = document.getElementById(`rese_${partidoId}_pasa_local`);
  const btnVisitante = document.getElementById(`rese_${partidoId}_pasa_visitante`);
  if (!btnLocal || !btnVisitante) return;

  btnLocal.classList.toggle('selected', lado === 'local');
  btnVisitante.classList.toggle('selected', lado === 'visitante');
}

// Muestra/oculta el bloque "¿quién pasa?" según si el marcador introducido está empatado
function onMarcadorElimChange(partidoId) {
  const inputL = document.getElementById(`rese_${partidoId}_l`);
  const inputV = document.getElementById(`rese_${partidoId}_v`);
  const caja   = document.getElementById(`tiebreak_${partidoId}`);
  if (!inputL || !inputV || !caja) return;

  const gl = parseInt(inputL.value);
  const gv = parseInt(inputV.value);
  const empatado = !isNaN(gl) && !isNaN(gv) && gl === gv;

  caja.style.display = empatado ? 'block' : 'none';
}

// ══════════════════════════════════════════════════════════════
//  ACCIONES ADMIN
// ══════════════════════════════════════════════════════════════

async function confirmarResultadoElim(partidoId) {
  const inputL = document.getElementById(`rese_${partidoId}_l`);
  const inputV = document.getElementById(`rese_${partidoId}_v`);
  if (!inputL || !inputV) return;

  const gl = parseInt(inputL.value);
  const gv = parseInt(inputV.value);

  if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0) {
    window.mostrarToast('⚠️ Introduce un marcador válido', 4000);
    return;
  }

  const equipos = obtenerEquiposPartidoElim(partidoId);
  if (!equipos.listos) {
    window.mostrarToast('⚠️ Los equipos de este partido aún no están determinados', 4000);
    return;
  }

  let equipoQuePasa;
  const hayEmpate = gl === gv;

  if (!hayEmpate) {
    equipoQuePasa = gl > gv ? equipos.local : equipos.visitante;
  } else {
    const btnLocal     = document.getElementById(`rese_${partidoId}_pasa_local`);
    const btnVisitante = document.getElementById(`rese_${partidoId}_pasa_visitante`);
    if (btnLocal?.classList.contains('selected')) {
      equipoQuePasa = equipos.local;
    } else if (btnVisitante?.classList.contains('selected')) {
      equipoQuePasa = equipos.visitante;
    } else {
      equipoQuePasa = '';
    }
    if (!equipoQuePasa) {
      window.mostrarToast('⚠️ Indica qué equipo pasa de ronda (empate en 90\')', 4500);
      return;
    }
  }

  try {
    window.mostrarToast('💾 Guardando...');

    const partido = getPartidoElimPorId(partidoId);

    await setDoc(doc(db, 'resultados_elim', partidoId), {
      partido_id:            partidoId,
      ronda:                 partido?.ronda || '',
      equipo_local:          equipos.local,
      equipo_visitante:      equipos.visitante,
      goles_local:           gl,
      goles_visitante:       gv,
      hay_prorroga_penales:  hayEmpate,
      equipo_que_pasa:       equipoQuePasa,
      confirmado:            true,
      confirmado_por:        _app.uid,
      confirmado_en:         serverTimestamp()
    });

    _resultadosElim[partidoId] = {
      partido_id: partidoId,
      ronda: partido?.ronda || '',
      equipo_local: equipos.local,
      equipo_visitante: equipos.visitante,
      goles_local: gl,
      goles_visitante: gv,
      hay_prorroga_penales: hayEmpate,
      equipo_que_pasa: equipoQuePasa,
      confirmado: true
    };

    // Recalcular puntos de eliminatorias para este partido
    recalcularPuntosElim(partidoId);

    // Si es la final, además recalcular los puntos especiales de
    // campeón/subcampeón de TODOS los jugadores. Esto es independiente
    // de los puntos de eliminatorias del propio partido: un jugador
    // puede fallar el marcador de la final (puntos de eliminatorias)
    // y aun así acertar quién sería el campeón en sus predicciones
    // especiales, o viceversa.
    if (partidoId === 'final_1') {
      const subcampeonReal = equipoQuePasa === equipos.local
        ? equipos.visitante
        : equipos.local;
      recalcularPuntosEspecialesFinal(equipoQuePasa, subcampeonReal);
    }

    window.mostrarToast('✅ Resultado confirmado');

    const c = document.getElementById('resultadosTabContent');
    if (c) renderAdminElim(c);

  } catch (e) {
    console.error('[confirmarResElim]', e);
    window.mostrarToast('❌ ' + t('common.error'), 5000);
  }
}

function editarResultadoElim(partidoId) {
  const dependientes = encontrarDependientesConfirmados(partidoId);
  if (dependientes.length) {
    window.appAbrirModal(
      '⚠️ Aviso',
      `<p style="font-size:13px;">Ya existen resultados confirmados en rondas posteriores que dependen de este partido: <strong>${dependientes.join(', ')}</strong>.</p>
       <p style="font-size:12px; color:var(--r); margin-top:8px;">
         Editar este resultado puede dejarlos inconsistentes. Revísalos manualmente después de guardar el cambio.
       </p>`,
      `<button class="btn btn-secondary" onclick="window.appCerrarModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="window.appCerrarModal(); window._ejecutarEdicionResElim('${partidoId}')">
         Continuar y editar
       </button>`
    );
    window._ejecutarEdicionResElim = (id) => {
      if (_resultadosElim[id]) {
        _resultadosElim[id] = { ..._resultadosElim[id], confirmado: false };
      }
      const c = document.getElementById('resultadosTabContent');
      if (c) renderAdminElim(c);
    };
    return;
  }

  if (_resultadosElim[partidoId]) {
    _resultadosElim[partidoId] = { ..._resultadosElim[partidoId], confirmado: false };
  }
  const c = document.getElementById('resultadosTabContent');
  if (c) renderAdminElim(c);
}

// ── Confirmar borrado de resultado de eliminatorias ────────────
function confirmarBorrarResultadoElim(partidoId) {
  const res    = _resultadosElim[partidoId];
  const titulo = res
    ? `${res.equipo_local} ${res.goles_local} — ${res.goles_visitante} ${res.equipo_visitante}`
    : partidoId;

  const dependientes = encontrarDependientesConfirmados(partidoId);
  const avisoDependientes = dependientes.length
    ? `<p style="font-size:12px; color:var(--r); margin-top:8px;">
         ⚠️ Rondas posteriores ya confirmadas dependen de este resultado: <strong>${dependientes.join(', ')}</strong>.
         Borrar este partido puede dejarlos inconsistentes — revísalos manualmente después.
       </p>`
    : '';

  window.appAbrirModal(
    '🗑️ Borrar resultado',
    `<p style="font-size:13px;">¿Seguro que quieres borrar el resultado de <strong>${titulo}</strong>?</p>
     <p style="font-size:12px; color:var(--r); margin-top:8px;">
       ⚠️ Esto también eliminará los puntos calculados de todos los jugadores para este partido.
     </p>
     ${avisoDependientes}`,
    `<button class="btn btn-secondary" onclick="window.appCerrarModal()">Cancelar</button>
     <button class="btn btn-danger" onclick="window._ejecutarBorradoResElim('${partidoId}')">
       🗑️ Sí, borrar resultado y puntos
     </button>`
  );
}

window._ejecutarBorradoResElim = async (partidoId) => {
  try {
    window.appCerrarModal();
    window.mostrarToast('🗑️ Borrando...');

    // 1. Borrar el documento de resultado
    await deleteDoc(doc(db, 'resultados_elim', partidoId));

    // 2. Borrar todos los documentos de puntos de este partido (Paso 3 — colección 'puntos' compartida con grupos)
    const puntosQ    = query(
      collection(db, 'puntos'),
      where('partido_id', '==', partidoId)
    );
    const puntosSnap = await getDocs(puntosQ);
    await Promise.all(puntosSnap.docs.map(d => deleteDoc(d.ref)));

    // 2b. Si es la final, también borrar los puntos especiales de
    // campeón/subcampeón de todos los jugadores — ya no hay un campeón
    // real confirmado del que derivarlos hasta que se vuelva a confirmar.
    if (partidoId === 'final_1') {
      const [campeonSnap, subcampeonSnap] = await Promise.all([
        getDocs(query(collection(db, 'puntos'), where('partido_id', '==', 'especial_campeon'))),
        getDocs(query(collection(db, 'puntos'), where('partido_id', '==', 'especial_subcampeon')))
      ]);
      await Promise.all([
        ...campeonSnap.docs.map(d => deleteDoc(d.ref)),
        ...subcampeonSnap.docs.map(d => deleteDoc(d.ref))
      ]);
    }

    // 3. Actualizar localmente
    delete _resultadosElim[partidoId];

    // 4. Recalcular totales tras los borrados anteriores
    await recalcularTotalesElim();

    window.mostrarToast('✅ Resultado y puntos borrados');
    const c = document.getElementById('resultadosTabContent');
    if (c) renderAdminElim(c);

  } catch (e) {
    console.error('[borrarResultadoElim]', e);
    window.mostrarToast('❌ ' + t('common.error'), 5000);
  }
};

// Devuelve los ids de partidos posteriores ya confirmados que dependen
// (directa o indirectamente) del partido dado — solo para mostrar el aviso,
// no se usa para bloquear ni borrar en cascada.
function encontrarDependientesConfirmados(partidoId) {
  const dependientesDirectos = Object.entries(MAPA_DEPENDENCIAS)
    .filter(([, dep]) => dep.local === partidoId || dep.vis === partidoId)
    .map(([id]) => id);

  const confirmados = [];
  dependientesDirectos.forEach(id => {
    if (_resultadosElim[id]?.confirmado) {
      confirmados.push(id);
      // recursión: dependientes de este también dependen indirectamente del original
      confirmados.push(...encontrarDependientesConfirmados(id));
    } else {
      // aunque no esté confirmado, sus propios dependientes podrían estarlo
      // (caso raro/inconsistente, pero se revisa por seguridad)
      confirmados.push(...encontrarDependientesConfirmados(id));
    }
  });

  return [...new Set(confirmados)];
}

// ══════════════════════════════════════════════════════════════
//  CÁLCULO DE PUNTOS (trigger al confirmar resultado)
//
//  Reglas (decididas y confirmadas con Julio):
//    - Si el jugador no acertó qué dos equipos jugaban este cruce
//      (comparando por nombre, ambas posiciones), el partido no
//      puntúa: 0 pts automáticos, sin más comprobaciones.
//    - Marcador exacto en 90', sin empate                = 4 pts
//    - Marcador exacto en 90', con empate, y además
//      acierta qué equipo pasa de ronda                  = 4 pts
//    - Marcador exacto en 90', con empate, pero falla
//      quién pasa (ya acertó el empate en sí)            = 1 pt
//    - Empate real, predijo empate (no el marcador
//      exacto) + acierta quién pasa                      = 2 pts
//    - Empate real, predijo empate (no el marcador
//      exacto) pero falla quién pasa                     = 1 pt
//    - Sin empate real, acierta el ganador (marcador
//      no exacto)                                        = 2 pts
//    - Cualquier otro caso                                = 0 pts
//
//  Almacenamiento: se reutiliza la colección 'puntos' ya existente
//  para grupos (mismo id de documento `${uid}_${partidoId}`),
//  añadiendo tipo: 'eliminatoria' para distinguirlo. recalcularTotales()
//  ya suma todos los documentos de 'puntos' sin filtrar por tipo,
//  así que no necesita ningún cambio.
// ══════════════════════════════════════════════════════════════

async function recalcularPuntosElim(partidoId) {
  try {
    const resultadoReal = _resultadosElim[partidoId];
    if (!resultadoReal?.confirmado) return;

    const q = query(
      collection(db, 'predicciones_elim'),
      where('partido_id', '==', partidoId)
    );
    const snap = await getDocs(q);

    const batch = [];
    snap.forEach(d => {
      const pred = d.data();
      const uid  = pred.uid;
      const puntos = calcularPuntosPartidoElim(pred, resultadoReal);

      batch.push(
        setDoc(
          doc(db, 'puntos', `${uid}_${partidoId}`),
          {
            uid,
            partido_id: partidoId,
            puntos,
            tipo:       'eliminatoria',
            timestamp:  serverTimestamp()
          },
          { merge: true }
        )
      );
    });

    await Promise.all(batch);
    await recalcularTotalesElim();
  } catch (e) {
    console.error('[recalcularPuntosElim]', e);
  }
}

// Comprueba si el jugador predijo correctamente qué dos equipos
// jugaban este cruce (por nombre, ambas posiciones deben coincidir
// exactamente con el resultado real confirmado). Se compara contra
// equipo_local/equipo_visitante guardados en predicciones_elim (el
// nombre o placeholder que el jugador tenía en pantalla al guardar),
// NO contra pred.local/pred.visitante, que son los goles predichos.
export function equiposCoincidenElim(pred, resultadoReal) {
  return pred.equipo_local === resultadoReal.equipo_local &&
         pred.equipo_visitante === resultadoReal.equipo_visitante;
}

export function calcularPuntosPartidoElim(pred, resultadoReal) {
  if (!equiposCoincidenElim(pred, resultadoReal)) return 0;

  const pl = parseInt(pred.local);
  const pv = parseInt(pred.visitante);
  if (isNaN(pl) || isNaN(pv)) return 0;

  const gl = resultadoReal.goles_local;
  const gv = resultadoReal.goles_visitante;
  const hayEmpate90 = gl === gv;

  // Marcador exacto en 90'
  if (pl === gl && pv === gv) {
    if (!hayEmpate90) return 4;
    return pred.ganador === resultadoReal.equipo_que_pasa ? 4 : 1;
  }

  // No coincide el marcador exacto
  if (hayEmpate90) {
    // ¿Predijo al menos que habría empate en 90'?
    if (pl === pv) {
      return pred.ganador === resultadoReal.equipo_que_pasa ? 2 : 1;
    }
    return 0;
  }

  // Sin empate real: ¿acertó el ganador por signo del marcador?
  const signoPred = Math.sign(pl - pv);
  const signoReal = Math.sign(gl - gv);
  if (signoPred === signoReal) return 2;

  return 0;
}

// ══════════════════════════════════════════════════════════════
//  PUNTOS ESPECIALES DE CAMPEÓN / SUBCAMPEÓN (al confirmar la final)
//  Independientes de los puntos de eliminatorias del partido final_1:
//  comparan el campeón/subcampeón REAL (deducido del resultado de la
//  final) contra lo que cada jugador escribió en sus predicciones
//  especiales (pred_especiales.campeon / .subcampeon), usando el
//  campo corregido por el admin si existe — mismo patrón que ya usa
//  admin.js para MVP/goleador oficiales.
// ══════════════════════════════════════════════════════════════

async function recalcularPuntosEspecialesFinal(campeonReal, subcampeonReal) {
  try {
    const norm = str =>
      (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const normCampeon    = norm(campeonReal);
    const normSubcampeon = norm(subcampeonReal);

    const snap  = await getDocs(collection(db, 'pred_especiales'));
    const batch = [];

    snap.forEach(d => {
      const uid  = d.id;
      const data = d.data();

      const predCampeon    = norm(data.campeon_corregido    || data.campeon    || '');
      const predSubcampeon = norm(data.subcampeon_corregido || data.subcampeon || '');

      const ptosCampeon    = (normCampeon    && predCampeon    && normCampeon    === predCampeon)    ? 6 : 0;
      const ptosSubcampeon = (normSubcampeon && predSubcampeon && normSubcampeon === predSubcampeon) ? 2 : 0;

      batch.push(setDoc(
        doc(db, 'puntos', `${uid}_especial_campeon`),
        { uid, partido_id: 'especial_campeon', puntos: ptosCampeon, tipo: 'especial', timestamp: serverTimestamp() },
        { merge: true }
      ));
      batch.push(setDoc(
        doc(db, 'puntos', `${uid}_especial_subcampeon`),
        { uid, partido_id: 'especial_subcampeon', puntos: ptosSubcampeon, tipo: 'especial', timestamp: serverTimestamp() },
        { merge: true }
      ));
    });

    await Promise.all(batch);
    await recalcularTotalesElim();
  } catch (e) {
    console.error('[recalcularPuntosEspecialesFinal]', e);
  }
}

// Mismo cálculo de totales que grupos (recalcularTotales en resultados.js),
// replicado aquí porque ese archivo no exporta su versión y este módulo
// no debe importar funciones internas no exportadas de resultados.js.
async function recalcularTotalesElim() {
  try {
    const puntosSnap = await getDocs(collection(db, 'puntos'));
    const totales    = {};

    puntosSnap.forEach(d => {
      const { uid, puntos } = d.data();
      if (!uid) return;
      totales[uid] = (totales[uid] || 0) + (puntos || 0);
    });

    const batch = Object.entries(totales).map(([uid, total]) =>
      setDoc(
        doc(db, 'clasificacion', uid),
        { uid, total, actualizado: serverTimestamp() },
        { merge: true }
      )
    );

    await Promise.all(batch);
  } catch (e) {
    console.error('[recalcularTotalesElim]', e);
  }
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

async function cargarResultadosElimFirestore() {
  const snap = await getDocs(collection(db, 'resultados_elim'));
  snap.forEach(d => { _resultadosElim[d.id] = d.data(); });
}

async function cargarBracketOficial() {
  const snap = await getDoc(doc(db, 'config', 'bracket_eliminatorias'));
  if (snap.exists()) {
    _bracketOficial = snap.data();
  }
}
