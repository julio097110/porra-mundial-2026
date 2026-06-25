// ============================================================
//  js/resultados.js
//  Pestaña "Resultados"
//  - Jugadores: ven resultados confirmados
//  - Admin: confirma resultados manualmente + calcula clasificados
// ============================================================

import { db } from './firebase-config.js';
import {
  doc, getDoc, setDoc, deleteDoc, collection,
  getDocs, onSnapshot, serverTimestamp,
  query, where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { t, formatMatchDate } from './i18n.js';
import { PARTIDOS_GRUPOS, GRUPOS, getPartidosPorGrupo } from '../data/partidos.js';
import { initResultadosElim, detenerResultadosElim } from './resultados_elim.js';
import { abrirModalPartido } from './informe-modal.js';

// ── Estado ────────────────────────────────────────────────────
let _app         = null;
let _resultados  = {};   // { partidoId: { goles_local, goles_visitante, confirmado } }
let _unsubscribe = null;
let _subTabRes   = 'grupos';   // 'grupos' | 'eliminatorias'

// ── Punto de entrada ─────────────────────────────────────────
export async function initResultados(app) {
  _app = app;
  const contenedor = document.getElementById('resultadosContent');
  contenedor.innerHTML = `<div class="loading-inline"><div class="spinner-sm"></div><span>${t('common.loading')}</span></div>`;

  try {
    await cargarResultadosFirestore();

    // Registrar handler de desglose una sola vez al iniciar el módulo,
    // así está disponible desde el primer render independientemente de
    // en qué momento se ejecute renderJugador.
    window._verDesglosePartido = (id, esElim) => abrirModalPartido(id, esElim);

    renderShellResultados(contenedor);

    // Refrescar textos al cambiar idioma — delega según la sub-pestaña activa
    window._refreshTextos = () => {
      const shell = document.getElementById('resultadosContent');
      if (!shell) return;
      if (_subTabRes === 'eliminatorias') detenerResultadosElim();
      renderShellResultados(shell);
    };

    // Escuchar cambios en tiempo real (grupos). Solo re-renderiza la
    // sub-vista de grupos si es la que está activa; si el admin está
    // viendo eliminatorias, no la pisa.
    _unsubscribe = onSnapshot(collection(db, 'resultados'), (snap) => {
      snap.forEach(d => { _resultados[d.id] = d.data(); });
      if (_subTabRes !== 'grupos') return;
      const c = document.getElementById('resultadosTabContent');
      if (c) {
        if (_app.esAdmin) renderAdmin(c);
        else renderJugador(c);
      }
    });

  } catch (e) {
    console.error('[resultados]', e);
    contenedor.innerHTML = `<div class="notice error">⚠️ ${t('common.error')}</div>`;
  }
}

// ── Shell con sub-toggle Grupos/Eliminatorias ─────────────────
function renderShellResultados(contenedor) {
  contenedor.innerHTML = `
    <div class="sub-toggle">
      <button class="sub-btn ${_subTabRes === 'grupos' ? 'active' : ''}"
        onclick="window._resultadosSetTab('grupos')">${t('subNav.groupStage')}</button>
      <button class="sub-btn ${_subTabRes === 'eliminatorias' ? 'active' : ''}"
        onclick="window._resultadosSetTab('eliminatorias')">${t('subNav.knockouts')}</button>
    </div>

    <div id="resultadosTabContent"></div>
  `;

  window._resultadosSetTab = (tab) => {
    if (_subTabRes === tab) return;
    _subTabRes = tab;
    document.querySelectorAll('#resultadosContent .sub-btn').forEach((b, i) => {
      b.classList.toggle('active', ['grupos', 'eliminatorias'][i] === tab);
    });
    renderTabContentResultados();
  };

  renderTabContentResultados();
}

// ── Renderiza el contenido de la sub-pestaña activa ───────────
function renderTabContentResultados() {
  const c = document.getElementById('resultadosTabContent');
  if (!c) return;

  if (_subTabRes === 'eliminatorias') {
    initResultadosElim(_app, c);
  } else {
    detenerResultadosElim();
    if (_app.esAdmin) renderAdmin(c);
    else renderJugador(c);
  }
}

// ══════════════════════════════════════════════════════════════
//  VISTA JUGADOR
// ══════════════════════════════════════════════════════════════

function renderJugador(contenedor) {
  const grupos = agruparPartidosPorFechaYGrupo();

  let html = `<div style="margin-top:8px;">`;

  // Partidos de hoy / recientes
  const recientes = filtrarRecientes(grupos);
  if (recientes.length) {
    html += `<div class="group-pill" style="margin-bottom:10px;">📅 ${t('scores.confirmed')} — hoy</div>`;
    recientes.forEach(p => {
      html += renderTarjetaResultado(p, false);
    });
  }

  // Por grupo
  GRUPOS.forEach(g => {
    const partidos = getPartidosPorGrupo(g);
    const conRes   = partidos.filter(p => _resultados[p.id]?.confirmado);
    if (!conRes.length) return;

    html += `<div class="group-pill" style="margin:14px 0 8px;">⚽ ${t('common.group')} ${g}</div>`;
    conRes.forEach(p => {
      html += renderTarjetaResultado(p, false);
    });
  });

  // Próximos sin resultado
  const proximos = PARTIDOS_GRUPOS.filter(p => !_resultados[p.id]?.confirmado)
    .sort((a, b) => new Date(a.fechaUTC) - new Date(b.fechaUTC))
    .slice(0, 6);

  if (proximos.length) {
    html += `<div style="font-size:12px; color:var(--tm); padding:14px 0 8px; display:flex; align-items:center; gap:5px;">
      ⏳ ${t('scores.pending')}
    </div>`;
    proximos.forEach(p => {
      html += renderTarjetaResultado(p, false, true);
    });
  }

  html += `</div>`;
  contenedor.innerHTML = html;
  if (window.parseTwemoji) window.parseTwemoji(contenedor);
}

// ══════════════════════════════════════════════════════════════
//  VISTA ADMIN
// ══════════════════════════════════════════════════════════════

function renderAdmin(contenedor) {
  const hoy = new Date().toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' });

  // Contar grupos completos (3 partidos confirmados)
  const gruposCompletos = GRUPOS.filter(g => {
    const partidos = getPartidosPorGrupo(g);
    return partidos.every(p => _resultados[p.id]?.confirmado);
  }).length;

  const todosCompletos = gruposCompletos === 12;

  let html = `
    <div style="margin-top:8px;">
      <div class="notice">${t('scores.adminOnly')}</div>

      <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; align-items:center;">
        <button class="btn btn-primary btn-sm" onclick="window._calcularClasificados()">
          🏆 Calcular clasificados
        </button>
        <button class="btn btn-danger btn-sm" onclick="window._borrarClasificados()">
          🗑️ Borrar clasificados
        </button>
        <span style="font-size:11px; color:var(--tm);">
          ${gruposCompletos}/12 grupos completos
          ${todosCompletos ? '· <span style="color:var(--gl);">✓ Listo para calcular</span>' : ''}
        </span>
      </div>
  `;

  // Partidos del día
  const hoyPartidos = obtenerPartidosHoy();
  if (hoyPartidos.length) {
    html += `<div class="group-pill" style="margin-bottom:10px;">📅 Partidos de hoy · ${hoy}</div>`;
    hoyPartidos.forEach(p => {
      html += renderTarjetaAdmin(p);
    });
    html += `<div style="height:16px;"></div>`;
  }

  // Todos los grupos
  GRUPOS.forEach(g => {
    const partidos = getPartidosPorGrupo(g);
    html += `<div class="group-pill" style="margin:14px 0 8px;">⚽ ${t('common.group')} ${g}</div>`;
    partidos.forEach(p => {
      html += renderTarjetaAdmin(p);
    });
  });

  html += `</div>`;
  contenedor.innerHTML = html;
  if (window.parseTwemoji) window.parseTwemoji(contenedor);

  // Handlers
  window._calcularClasificados = () => calcularClasificados();
  window._borrarClasificados   = () => borrarClasificados();
  window._confirmarRes         = (id) => confirmarResultado(id);
  window._editarRes            = (id) => editarResultado(id);
  window._borrarRes            = (id) => confirmarBorrarResultado(id);
}

// ── Tarjeta resultado (jugador, solo lectura) ─────────────────
function renderTarjetaResultado(p, esAdmin, sinResultado = false) {
  const res = _resultados[p.id];
  const confirmado = res?.confirmado;

  return `
    <div class="match-card ${confirmado ? 'confirmed' : sinResultado ? 'no-result' : ''}">
      <div class="match-meta">
        <span>${formatMatchDate(p.fechaUTC)}</span>
        <span>📍 ${p.ciudad}</span>
        ${confirmado
          ? `<span class="match-tag ok">✓ ${t('scores.confirmed')}</span>`
          : `<span class="match-tag pend">${t('scores.pending')}</span>`}
        ${confirmado
          ? `<button onclick="window._verDesglosePartido('${p.id}', false)"
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
          <span class="match-flag">${p.flagLocal}</span>
          <span class="match-name">${p.local}</span>
        </div>
        ${confirmado
          ? `<span class="score-real confirmed">${res.goles_local} — ${res.goles_visitante}</span>`
          : `<span class="score-real" style="color:#ccc;">— — —</span>`}
        <div class="match-team right">
          <span class="match-flag">${p.flagVisitante}</span>
          <span class="match-name">${p.visitante}</span>
        </div>
      </div>
    </div>
  `;
}

// ── Tarjeta resultado (admin, con inputs y botón confirmar) ───
function renderTarjetaAdmin(p) {
  const res        = _resultados[p.id];
  const confirmado = res?.confirmado;

  const valL = confirmado ? res.goles_local     : '';
  const valV = confirmado ? res.goles_visitante : '';

  if (confirmado) {
    return `
      <div class="match-card confirmed">
        <div class="match-meta">
          <span>${formatMatchDate(p.fechaUTC)}</span>
          <span>📍 ${p.ciudad}</span>
          <span class="match-tag ok">✓ ${t('scores.confirmed')}</span>
          <button onclick="window._verDesglosePartido('${p.id}', false)"
            title="Ver puntos de este partido"
            style="background:none; border:none; cursor:pointer; font-size:13px;
              padding:2px 4px; border-radius:4px; line-height:1; color:var(--tm);
              transition:color .15s; margin-left:2px;"
            onmouseover="this.style.color='var(--gm)'"
            onmouseout="this.style.color='var(--tm)'">🔍</button>
        </div>
        <div class="match-row">
          <div class="match-team">
            <span class="match-flag">${p.flagLocal}</span>
            <span class="match-name">${p.local}</span>
          </div>
          <span class="score-real confirmed">${res.goles_local} — ${res.goles_visitante}</span>
          <div class="match-team right">
            <span class="match-flag">${p.flagVisitante}</span>
            <span class="match-name">${p.visitante}</span>
          </div>
        </div>
        <div class="match-footer">
          <span class="match-confirmed-label">✓ ${t('scores.confirmed')}</span>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="window._editarRes('${p.id}')">
              ✏️ ${t('scores.editBtn')}
            </button>
            <button class="btn btn-danger btn-sm" onclick="window._borrarRes('${p.id}')">
              🗑️ Borrar
            </button>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="match-card">
      <div class="match-meta">
        <span>${formatMatchDate(p.fechaUTC)}</span>
        <span>📍 ${p.ciudad}</span>
        <span class="match-tag pend">${t('scores.noResult')}</span>
      </div>
      <div class="match-row">
        <div class="match-team">
          <span class="match-flag">${p.flagLocal}</span>
          <span class="match-name">${p.local}</span>
        </div>
        <div class="score-area">
          <span class="score-label">${t('scores.result')}</span>
          <div class="score-inputs">
            <input class="score-input" type="number" min="0" max="20"
              id="res_${p.id}_l" value="${valL}">
            <span class="score-sep">—</span>
            <input class="score-input" type="number" min="0" max="20"
              id="res_${p.id}_v" value="${valV}">
          </div>
        </div>
        <div class="match-team right">
          <span class="match-flag">${p.flagVisitante}</span>
          <span class="match-name">${p.visitante}</span>
        </div>
      </div>
      <div class="match-footer">
        <span style="font-size:11px; color:var(--tm);">Introducir manualmente</span>
        <button class="btn btn-primary btn-sm" onclick="window._confirmarRes('${p.id}')">
          ✓ ${t('scores.confirmBtn')}
        </button>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
//  ACCIONES ADMIN
// ══════════════════════════════════════════════════════════════

async function confirmarResultado(partidoId) {
  const inputL = document.getElementById(`res_${partidoId}_l`);
  const inputV = document.getElementById(`res_${partidoId}_v`);
  if (!inputL || !inputV) return;

  // Forzar blur para que Safari/iOS confirme el valor antes de leerlo
  inputL.blur();
  inputV.blur();

  const gl = parseInt(inputL.value);
  const gv = parseInt(inputV.value);

  if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0) {
    window.mostrarToast('⚠️ Introduce un marcador válido', 4000);
    return;
  }

  try {
    window.mostrarToast('💾 Guardando...');

    const partido = PARTIDOS_GRUPOS.find(p => p.id === partidoId);

    await setDoc(doc(db, 'resultados', partidoId), {
      partido_id:       partidoId,
      goles_local:      gl,
      goles_visitante:  gv,
      confirmado:       true,
      confirmado_por:   _app.uid,
      confirmado_en:    serverTimestamp(),
      equipo_local:     partido?.local    || '',
      equipo_visitante: partido?.visitante || ''
    });

    _resultados[partidoId] = { goles_local: gl, goles_visitante: gv, confirmado: true };

    // Recalcular puntos del partido en segundo plano
    recalcularPuntos(partidoId, gl, gv);

    // Si el grupo queda completo con este resultado, calcular puntos de clasificados
    if (partido) {
      const grupo = partido.grupo;
      const partidosGrupo = getPartidosPorGrupo(grupo);
      const grupoCompleto = partidosGrupo.every(p => _resultados[p.id]?.confirmado);
      if (grupoCompleto) {
        recalcularPuntosClasificados(grupo);
      }
    }

    window.mostrarToast('✅ Resultado confirmado');
  } catch (e) {
    console.error('[confirmarRes]', e);
    window.mostrarToast('❌ ' + t('common.error'), 5000);
  }
}

function editarResultado(partidoId) {
  if (_resultados[partidoId]) {
    _resultados[partidoId] = { ..._resultados[partidoId], confirmado: false };
  }
  const c = document.getElementById('resultadosTabContent');
  if (c) renderAdmin(c);
}

// ── Confirmar borrado de resultado + puntos ───────────────────
function confirmarBorrarResultado(partidoId) {
  const partido = PARTIDOS_GRUPOS.find(p => p.id === partidoId);
  const res     = _resultados[partidoId];
  const titulo  = partido
    ? `${partido.local} ${res.goles_local} — ${res.goles_visitante} ${partido.visitante}`
    : partidoId;

  window.appAbrirModal(
    '🗑️ Borrar resultado',
    `<p style="font-size:13px;">¿Seguro que quieres borrar el resultado de <strong>${titulo}</strong>?</p>
     <p style="font-size:12px; color:var(--r); margin-top:8px;">
       ⚠️ Esto también eliminará los puntos calculados de todos los jugadores para este partido.
     </p>`,
    `<button class="btn btn-secondary" onclick="window.appCerrarModal()">Cancelar</button>
     <button class="btn btn-danger" onclick="window._ejecutarBorradoRes('${partidoId}')">
       🗑️ Sí, borrar resultado y puntos
     </button>`
  );
}

window._ejecutarBorradoRes = async (partidoId) => {
  try {
    window.appCerrarModal();
    window.mostrarToast('🗑️ Borrando...');

    // Determinar el grupo de este partido y si estaba completo ANTES de borrar
    const partido = PARTIDOS_GRUPOS.find(p => p.id === partidoId);
    const grupo   = partido?.grupo || null;
    const partidosGrupo = grupo ? getPartidosPorGrupo(grupo) : [];
    const grupoEstabaCompleto = grupo
      ? partidosGrupo.every(p => _resultados[p.id]?.confirmado)
      : false;

    // 1. Borrar el documento de resultado
    await deleteDoc(doc(db, 'resultados', partidoId));

    // 2. Borrar todos los documentos de puntos de este partido
    const puntosQ    = query(
      collection(db, 'puntos'),
      where('partido_id', '==', partidoId)
    );
    const puntosSnap = await getDocs(puntosQ);
    await Promise.all(puntosSnap.docs.map(d => deleteDoc(d.ref)));

    // 3. Actualizar localmente
    delete _resultados[partidoId];

    // 4. Si el grupo estaba completo antes del borrado, eliminar los puntos
    //    de clasificados de ese grupo para todos los jugadores
    if (grupoEstabaCompleto && grupo) {
      await borrarPuntosClasificadosGrupo(grupo);
    }

    // 5. Recalcular totales de clasificación
    await recalcularTotales();

    window.mostrarToast('✅ Resultado y puntos borrados');
    const c = document.getElementById('resultadosTabContent');
    if (c) renderAdmin(c);

  } catch (e) {
    console.error('[borrarResultado]', e);
    window.mostrarToast('❌ ' + t('common.error'), 5000);
  }
};

// ══════════════════════════════════════════════════════════════
//  CALCULAR CLASIFICADOS — genera bracket_eliminatorias
// ══════════════════════════════════════════════════════════════

async function calcularClasificados() {
  window.mostrarToast('🔄 Calculando clasificados...');
  try {
    // ── 1. Calcular tabla de cada grupo ──────────────────────
    const tablas = {};
    GRUPOS.forEach(g => {
      tablas[g] = calcularTablaGrupo(g);
    });

    // ── 2. Extraer 1º y 2º de cada grupo ────────────────────
    const primeros  = {};
    const segundos  = {};
    const terceros  = {};

    GRUPOS.forEach(g => {
      const tabla         = tablas[g];
      const partidos      = getPartidosPorGrupo(g);
      const grupoCompleto = partidos.every(p => _resultados[p.id]?.confirmado);

      primeros[g] = { ...tabla[0], grupoCompleto };
      segundos[g] = { ...tabla[1], grupoCompleto };
      terceros[g] = { ...tabla[2], grupoCompleto };
    });

    // ── 3. Mapeo oficial FIFA — 16 partidos de r32 ──────────
    const crucesFijos = [
      { id: 'r32_1',  local: segundos['A'], visitante: segundos['B'] },
      { id: 'r32_2',  local: primeros['E'], visitante: null },
      { id: 'r32_3',  local: primeros['F'], visitante: segundos['C'] },
      { id: 'r32_4',  local: primeros['C'], visitante: segundos['F'] },
      { id: 'r32_5',  local: primeros['I'], visitante: null },
      { id: 'r32_6',  local: segundos['E'], visitante: segundos['I'] },
      { id: 'r32_7',  local: primeros['A'], visitante: null },
      { id: 'r32_8',  local: primeros['L'], visitante: null },
      { id: 'r32_9',  local: primeros['D'], visitante: null },
      { id: 'r32_10', local: primeros['G'], visitante: null },
      { id: 'r32_11', local: segundos['K'], visitante: segundos['L'] },
      { id: 'r32_12', local: primeros['H'], visitante: segundos['J'] },
      { id: 'r32_13', local: primeros['B'], visitante: null },
      { id: 'r32_14', local: primeros['J'], visitante: segundos['H'] },
      { id: 'r32_15', local: primeros['K'], visitante: null },
      { id: 'r32_16', local: segundos['D'], visitante: segundos['G'] },
    ];

    // ── 4. Construir objeto bracket para Firestore ───────────
    const bracket = {};

    crucesFijos.forEach(cruce => {
      const eqL = cruce.local;
      const eqV = cruce.visitante;

      const localConfirmado   = eqL?.grupoCompleto ?? false;
      const visitanteNulo     = eqV === null;
      const visitanteConf     = eqV?.grupoCompleto ?? false;
      const confirmado        = localConfirmado && !visitanteNulo && visitanteConf;

      bracket[cruce.id] = {
        equipoLocal:        eqL?.grupoCompleto ? (eqL?.nombre || null) : null,
        equipoVisitante:    visitanteNulo ? null : (eqV?.grupoCompleto ? (eqV?.nombre || null) : null),
        flagLocal:          eqL?.grupoCompleto ? (eqL?.flag || '') : '',
        flagVisitante:      visitanteNulo ? '' : (eqV?.grupoCompleto ? (eqV?.flag || '') : ''),
        terceroPendiente:   visitanteNulo,
        confirmado
      };
    });

    // Preservar asignaciones manuales de terceros que ya existan
    const snapActual = await getDoc(doc(db, 'config', 'bracket_eliminatorias'));
    if (snapActual.exists()) {
      const actual = snapActual.data();
      crucesFijos
        .filter(c => c.visitante === null)
        .forEach(c => {
          const existente = actual[c.id];
          if (existente?.equipoVisitante) {
            bracket[c.id].equipoVisitante  = existente.equipoVisitante;
            bracket[c.id].flagVisitante    = existente.flagVisitante || '';
            bracket[c.id].terceroPendiente = false;
            bracket[c.id].confirmado       = bracket[c.id].confirmado || (bracket[c.id].local?.grupoCompleto ?? false);
          }
        });
    }

    bracket._lastUpdate = new Date().toISOString();

    await setDoc(doc(db, 'config', 'bracket_eliminatorias'), bracket, { merge: true });

    const pendientes = crucesFijos.filter(c => c.visitante === null).length;
    const msg = pendientes > 0
      ? `✅ Clasificados calculados · ${pendientes} terceros pendientes de asignar en admin`
      : '✅ Bracket completo calculado';
    window.mostrarToast(msg, 5000);

    const c = document.getElementById('resultadosTabContent');
    if (c) renderAdmin(c);

  } catch (e) {
    console.error('[calcularClasificados]', e);
    window.mostrarToast('⚠️ Error al calcular clasificados', 4000);
  }
}

// ── Borrar bracket de clasificados ───────────────────────────
async function borrarClasificados() {
  window.appAbrirModal(
    '🗑️ Borrar clasificados',
    `<p style="font-size:13px;">¿Seguro que quieres borrar el bracket de eliminatorias?</p>
     <p style="font-size:12px; color:var(--r); margin-top:8px;">
       ⚠️ Esto borrará todos los equipos asignados en la Ronda de 32, incluyendo los terceros asignados manualmente.
     </p>`,
    `<button class="btn btn-secondary" onclick="window.appCerrarModal()">Cancelar</button>
     <button class="btn btn-danger" onclick="window._ejecutarBorradoClasificados()">
       🗑️ Sí, borrar bracket
     </button>`
  );
}

window._ejecutarBorradoClasificados = async () => {
  try {
    window.appCerrarModal();
    window.mostrarToast('🗑️ Borrando bracket...');

    await deleteDoc(doc(db, 'config', 'bracket_eliminatorias'));

    window.mostrarToast('✅ Bracket borrado');
    const c = document.getElementById('resultadosTabContent');
    if (c) renderAdmin(c);
  } catch (e) {
    console.error('[borrarClasificados]', e);
    window.mostrarToast('❌ ' + t('common.error'), 5000);
  }
};

// ── Calcular tabla de un grupo a partir de resultados confirmados ──
function calcularTablaGrupo(grupo) {
  const partidos = getPartidosPorGrupo(grupo);
  const equiposMap = {};

  partidos.forEach(p => {
    if (!equiposMap[p.local]) {
      equiposMap[p.local] = { nombre: p.local, flag: p.flagLocal, pts: 0, gf: 0, gc: 0, j: 0 };
    }
    if (!equiposMap[p.visitante]) {
      equiposMap[p.visitante] = { nombre: p.visitante, flag: p.flagVisitante, pts: 0, gf: 0, gc: 0, j: 0 };
    }
  });

  partidos.forEach(p => {
    const res = _resultados[p.id];
    if (!res?.confirmado) return;

    const gl = res.goles_local;
    const gv = res.goles_visitante;

    equiposMap[p.local].j++;
    equiposMap[p.visitante].j++;
    equiposMap[p.local].gf    += gl;
    equiposMap[p.local].gc    += gv;
    equiposMap[p.visitante].gf += gv;
    equiposMap[p.visitante].gc += gl;

    if (gl > gv) {
      equiposMap[p.local].pts    += 3;
    } else if (gl === gv) {
      equiposMap[p.local].pts    += 1;
      equiposMap[p.visitante].pts += 1;
    } else {
      equiposMap[p.visitante].pts += 3;
    }
  });

  return Object.values(equiposMap).sort((a, b) => {
    const ptsDiff = b.pts - a.pts;
    if (ptsDiff !== 0) return ptsDiff;
    const gdA = a.gf - a.gc;
    const gdB = b.gf - b.gc;
    const gdDiff = gdB - gdA;
    if (gdDiff !== 0) return gdDiff;
    const gfDiff = b.gf - a.gf;
    if (gfDiff !== 0) return gfDiff;
    return a.nombre.localeCompare(b.nombre);
  });
}

// ── Calcular tabla de un grupo a partir de las predicciones de un jugador ──
// predJugador: { [partidoId]: { local: number, visitante: number } }
function calcularTablaGrupoDesdePredicciones(grupo, predJugador) {
  const partidos = getPartidosPorGrupo(grupo);
  const equiposMap = {};

  partidos.forEach(p => {
    if (!equiposMap[p.local]) {
      equiposMap[p.local] = { nombre: p.local, pts: 0, gf: 0, gc: 0 };
    }
    if (!equiposMap[p.visitante]) {
      equiposMap[p.visitante] = { nombre: p.visitante, pts: 0, gf: 0, gc: 0 };
    }
  });

  partidos.forEach(p => {
    const pred = predJugador[p.id];
    if (!pred) return;
    const gl = parseInt(pred.local);
    const gv = parseInt(pred.visitante);
    if (isNaN(gl) || isNaN(gv)) return;

    equiposMap[p.local].gf    += gl;
    equiposMap[p.local].gc    += gv;
    equiposMap[p.visitante].gf += gv;
    equiposMap[p.visitante].gc += gl;

    if (gl > gv) {
      equiposMap[p.local].pts    += 3;
    } else if (gl === gv) {
      equiposMap[p.local].pts    += 1;
      equiposMap[p.visitante].pts += 1;
    } else {
      equiposMap[p.visitante].pts += 3;
    }
  });

  return Object.values(equiposMap).sort((a, b) => {
    const ptsDiff = b.pts - a.pts;
    if (ptsDiff !== 0) return ptsDiff;
    const gdA = a.gf - a.gc;
    const gdB = b.gf - b.gc;
    const gdDiff = gdB - gdA;
    if (gdDiff !== 0) return gdDiff;
    const gfDiff = b.gf - a.gf;
    if (gfDiff !== 0) return gfDiff;
    return a.nombre.localeCompare(b.nombre);
  });
}

// ══════════════════════════════════════════════════════════════
//  PUNTOS DE CLASIFICADOS DE GRUPO (1º y 2º predicho que pasa)
// ══════════════════════════════════════════════════════════════

async function recalcularPuntosClasificados(grupo) {
  try {
    // 1. Tabla real del grupo (ya completo)
    const tablaReal = calcularTablaGrupo(grupo);
    const reales    = new Set([tablaReal[0]?.nombre, tablaReal[1]?.nombre].filter(Boolean));
    if (reales.size === 0) return;

    // 2. IDs de los partidos del grupo
    const partidos    = getPartidosPorGrupo(grupo);
    const partidoIds  = partidos.map(p => p.id);

    // 3. Leer predicciones de todos los jugadores para este grupo
    //    Firestore no soporta 'in' con más de 30 elementos, pero un grupo
    //    tiene solo 3 partidos, así que hacemos una query por partido_id.
    const predsPorUid = {}; // { uid: { partidoId: { local, visitante } } }

    await Promise.all(partidoIds.map(async (pid) => {
      const q    = query(collection(db, 'predicciones'), where('partido_id', '==', pid));
      const snap = await getDocs(q);
      snap.forEach(d => {
        const data = d.data();
        const uid  = data.uid;
        if (!uid) return;
        if (!predsPorUid[uid]) predsPorUid[uid] = {};
        predsPorUid[uid][pid] = { local: data.local, visitante: data.visitante };
      });
    }));

    // 4. Para cada jugador, calcular su tabla predicha y comparar con la real
    const batch = [];

    Object.entries(predsPorUid).forEach(([uid, predJugador]) => {
      const tablaPredicha = calcularTablaGrupoDesdePredicciones(grupo, predJugador);
      const predichos     = [tablaPredicha[0]?.nombre, tablaPredicha[1]?.nombre].filter(Boolean);

      // Contar aciertos: equipo predicho como 1º o 2º que pasa como 1º o 2º real
      let puntos = 0;
      predichos.forEach(nombre => {
        if (reales.has(nombre)) puntos += 1;
      });

      batch.push(
        setDoc(
          doc(db, 'puntos', `${uid}_${grupo}_clasificados`),
          {
            uid,
            grupo,
            puntos,
            tipo:      'clasificados',
            timestamp: serverTimestamp()
          },
          { merge: true }
        )
      );
    });

    await Promise.all(batch);
    await recalcularTotales();

    console.log(`[clasificados] Grupo ${grupo}: puntos calculados para ${Object.keys(predsPorUid).length} jugadores`);
  } catch (e) {
    console.error(`[recalcularPuntosClasificados] Grupo ${grupo}:`, e);
  }
}

// ── Borrar puntos de clasificados de un grupo para todos los jugadores ──
async function borrarPuntosClasificadosGrupo(grupo) {
  try {
    const q    = query(
      collection(db, 'puntos'),
      where('tipo', '==', 'clasificados'),
      where('grupo', '==', grupo)
    );
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    console.log(`[clasificados] Puntos del grupo ${grupo} borrados (${snap.size} documentos)`);
  } catch (e) {
    console.error(`[borrarPuntosClasificadosGrupo] Grupo ${grupo}:`, e);
  }
}

// ══════════════════════════════════════════════════════════════
//  PUNTOS DE TERCEROS — trigger desde admin bracket
//  (exportada para que admin.js la llame al asignar los 8 terceros)
// ══════════════════════════════════════════════════════════════

export async function recalcularPuntosTerceros() {
  try {
    // 1. Leer los 8 terceros oficiales del bracket
    const bracketSnap = await getDoc(doc(db, 'config', 'bracket_eliminatorias'));
    if (!bracketSnap.exists()) return;

    const bracket = bracketSnap.data();
    const IDS_TERCEROS = ['r32_2','r32_5','r32_7','r32_8','r32_9','r32_10','r32_13','r32_15'];
    const tercerosOficiales = new Set(
      IDS_TERCEROS
        .map(id => bracket[id]?.equipoVisitante)
        .filter(Boolean)
    );

    // Solo calcular si los 8 terceros están asignados
    if (tercerosOficiales.size < 8) {
      console.log('[puntosTerceros] Aún no están los 8 terceros asignados, se omite el cálculo');
      return;
    }

    // 2. Leer todas las predicciones de terceros
    const predSnap = await getDocs(collection(db, 'pred_terceros'));

    const batch = [];
    predSnap.forEach(d => {
      const data    = d.data();
      const uid     = data.uid;
      const equipos = data.equipos || [];
      if (!uid) return;

      let puntos = 0;
      equipos.forEach(nombre => {
        if (tercerosOficiales.has(nombre)) puntos += 0.5;
      });

      batch.push(
        setDoc(
          doc(db, 'puntos', `${uid}_terceros`),
          {
            uid,
            puntos,
            tipo:      'terceros',
            timestamp: serverTimestamp()
          },
          { merge: true }
        )
      );
    });

    await Promise.all(batch);
    await recalcularTotales();

    console.log(`[puntosTerceros] Puntos calculados para ${predSnap.size} jugadores`);
  } catch (e) {
    console.error('[recalcularPuntosTerceros]', e);
  }
}

// ── Borrar puntos de terceros de todos los jugadores ──────────
export async function borrarPuntosTerceros() {
  try {
    const q    = query(collection(db, 'puntos'), where('tipo', '==', 'terceros'));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    await recalcularTotales();
    console.log(`[puntosTerceros] ${snap.size} documentos borrados`);
  } catch (e) {
    console.error('[borrarPuntosTerceros]', e);
  }
}

// ══════════════════════════════════════════════════════════════
//  CÁLCULO DE PUNTOS (trigger al confirmar resultado de partido)
// ══════════════════════════════════════════════════════════════

async function recalcularPuntos(partidoId, golesLocal, golesVisitante) {
  try {
    const q = query(
      collection(db, 'predicciones'),
      where('partido_id', '==', partidoId)
    );
    const snap = await getDocs(q);

    const batch = [];
    snap.forEach(d => {
      const pred  = d.data();
      const uid   = pred.uid;
      const puntos = calcularPuntosPartido(pred, golesLocal, golesVisitante);

      batch.push(
        setDoc(
          doc(db, 'puntos', `${uid}_${partidoId}`),
          {
            uid,
            partido_id: partidoId,
            puntos,
            tipo:       'grupo',
            timestamp:  serverTimestamp()
          },
          { merge: true }
        )
      );
    });

    await Promise.all(batch);
    await recalcularTotales();
  } catch (e) {
    console.error('[recalcularPuntos]', e);
  }
}

export function calcularPuntosPartido(pred, golesLocalReal, golesVisitanteReal) {
  const pl = parseInt(pred.local);
  const pv = parseInt(pred.visitante);
  if (isNaN(pl) || isNaN(pv)) return 0;

  if (pl === golesLocalReal && pv === golesVisitanteReal) return 3;

  const signoPred = Math.sign(pl - pv);
  const signoReal = Math.sign(golesLocalReal - golesVisitanteReal);
  if (signoPred === signoReal) return 1;

  return 0;
}

async function recalcularTotales() {
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
    console.error('[recalcularTotales]', e);
  }
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════

async function cargarResultadosFirestore() {
  const snap = await getDocs(collection(db, 'resultados'));
  snap.forEach(d => { _resultados[d.id] = d.data(); });
}

function agruparPartidosPorFechaYGrupo() {
  return PARTIDOS_GRUPOS.reduce((acc, p) => {
    const fecha = new Date(p.fechaUTC).toDateString();
    if (!acc[fecha]) acc[fecha] = [];
    acc[fecha].push(p);
    return acc;
  }, {});
}

function filtrarRecientes(grupos) {
  const hoy  = new Date().toDateString();
  const ayer = new Date(Date.now() - 86400000).toDateString();
  return [
    ...(grupos[hoy]  || []),
    ...(grupos[ayer] || [])
  ].filter(p => _resultados[p.id]?.confirmado);
}

function obtenerPartidosHoy() {
  const hoy = new Date().toDateString();
  return PARTIDOS_GRUPOS.filter(p => {
    return new Date(p.fechaUTC).toDateString() === hoy;
  });
}
