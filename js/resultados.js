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

// ── Estado ────────────────────────────────────────────────────
let _app         = null;
let _resultados  = {};   // { partidoId: { goles_local, goles_visitante, confirmado } }
let _unsubscribe = null;

// ── Punto de entrada ─────────────────────────────────────────
export async function initResultados(app) {
  _app = app;
  const contenedor = document.getElementById('resultadosContent');
  contenedor.innerHTML = `<div class="loading-inline"><div class="spinner-sm"></div><span>${t('common.loading')}</span></div>`;

  try {
    await cargarResultadosFirestore();

    if (_app.esAdmin) {
      renderAdmin(contenedor);
    } else {
      renderJugador(contenedor);
    }

    // Refrescar textos al cambiar idioma
    window._refreshTextos = () => {
      const c = document.getElementById('resultadosContent');
      if (!c) return;
      if (_app.esAdmin) renderAdmin(c);
      else renderJugador(c);
    };

    // Escuchar cambios en tiempo real
    _unsubscribe = onSnapshot(collection(db, 'resultados'), (snap) => {
      snap.forEach(d => { _resultados[d.id] = d.data(); });
      const c = document.getElementById('resultadosContent');
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

    // Recalcular puntos en segundo plano
    recalcularPuntos(partidoId, gl, gv);

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
  const c = document.getElementById('resultadosContent');
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

    const { deleteDoc } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );

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

    // 4. Recalcular totales de clasificación sin este partido
    await recalcularTotales();

    window.mostrarToast('✅ Resultado y puntos borrados');
    const c = document.getElementById('resultadosContent');
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
    const primeros  = {};  // { A: {nombre, flag, grupoCompleto}, ... }
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
    // Fuente: Wikipedia 2026 FIFA World Cup knockout stage
    // Matches 73-88 en orden cronológico
    // Los 8 partidos con tercero se dejan como null (se asignan manualmente desde admin)
    const crucesFijos = [
      // r32_1  Match 73: 2º A vs 2º B
      { id: 'r32_1',  local: segundos['A'], visitante: segundos['B'] },
      // r32_2  Match 74: 1º E vs Mejor 3º (A/B/C/D/F) → tercero null
      { id: 'r32_2',  local: primeros['E'], visitante: null },
      // r32_3  Match 75: 1º F vs 2º C
      { id: 'r32_3',  local: primeros['F'], visitante: segundos['C'] },
      // r32_4  Match 76: 1º C vs 2º F
      { id: 'r32_4',  local: primeros['C'], visitante: segundos['F'] },
      // r32_5  Match 77: 1º I vs Mejor 3º (C/D/F/G/H) → tercero null
      { id: 'r32_5',  local: primeros['I'], visitante: null },
      // r32_6  Match 78: 2º E vs 2º I
      { id: 'r32_6',  local: segundos['E'], visitante: segundos['I'] },
      // r32_7  Match 79: 1º A vs Mejor 3º (C/E/F/H/I) → tercero null
      { id: 'r32_7',  local: primeros['A'], visitante: null },
      // r32_8  Match 80: 1º L vs Mejor 3º (E/H/I/J/K) → tercero null
      { id: 'r32_8',  local: primeros['L'], visitante: null },
      // r32_9  Match 81: 1º D vs Mejor 3º (B/E/F/I/J) → tercero null
      { id: 'r32_9',  local: primeros['D'], visitante: null },
      // r32_10 Match 82: 1º G vs Mejor 3º (A/E/H/I/J) → tercero null
      { id: 'r32_10', local: primeros['G'], visitante: null },
      // r32_11 Match 83: 2º K vs 2º L
      { id: 'r32_11', local: segundos['K'], visitante: segundos['L'] },
      // r32_12 Match 84: 1º H vs 2º J
      { id: 'r32_12', local: primeros['H'], visitante: segundos['J'] },
      // r32_13 Match 85: 1º B vs Mejor 3º (E/F/G/I/J) → tercero null
      { id: 'r32_13', local: primeros['B'], visitante: null },
      // r32_14 Match 86: 1º J vs 2º H
      { id: 'r32_14', local: primeros['J'], visitante: segundos['H'] },
      // r32_15 Match 87: 1º K vs Mejor 3º (D/E/I/J/L) → tercero null
      { id: 'r32_15', local: primeros['K'], visitante: null },
      // r32_16 Match 88: 2º D vs 2º G
      { id: 'r32_16', local: segundos['D'], visitante: segundos['G'] },
    ];

    // ── 4. Construir objeto bracket para Firestore ───────────
    const bracket = {};

    crucesFijos.forEach(cruce => {
      const eqL = cruce.local;
      const eqV = cruce.visitante;

      // Un partido está "confirmado" si los grupos de ambos equipos
      // están completos. Si algún visitante es null (tercero pendiente),
      // el partido NO está confirmado hasta que el admin lo asigne.
      const localConfirmado   = eqL?.grupoCompleto ?? false;
      const visitanteNulo     = eqV === null;
      const visitanteConf     = eqV?.grupoCompleto ?? false;
      const confirmado        = localConfirmado && !visitanteNulo && visitanteConf;

      bracket[cruce.id] = {
        equipoLocal:        eqL?.nombre    || null,
        equipoVisitante:    visitanteNulo ? null : (eqV?.nombre || null),
        flagLocal:          eqL?.flag      || '',
        flagVisitante:      visitanteNulo ? '' : (eqV?.flag || ''),
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
            // Conservar el tercero ya asignado manualmente
            bracket[c.id].equipoVisitante  = existente.equipoVisitante;
            bracket[c.id].flagVisitante    = existente.flagVisitante || '';
            bracket[c.id].terceroPendiente = false;
            bracket[c.id].confirmado       = bracket[c.id].confirmado || (bracket[c.id].local?.grupoCompleto ?? false);
          }
        });
    }

    bracket._lastUpdate = new Date().toISOString();

    await setDoc(doc(db, 'config', 'bracket_eliminatorias'), bracket, { merge: true });

    // Feedback al admin con resumen
    const pendientes = crucesFijos.filter(c => c.visitante === null).length;
    const msg = pendientes > 0
      ? `✅ Clasificados calculados · ${pendientes} terceros pendientes de asignar en admin`
      : '✅ Bracket completo calculado';
    window.mostrarToast(msg, 5000);

    // Re-renderizar para actualizar el contador
    const c = document.getElementById('resultadosContent');
    if (c) renderAdmin(c);

  } catch (e) {
    console.error('[calcularClasificados]', e);
    window.mostrarToast('⚠️ Error al calcular clasificados', 4000);
  }
}

// ── Calcular tabla de un grupo a partir de resultados confirmados
function calcularTablaGrupo(grupo) {
  const partidos = getPartidosPorGrupo(grupo);
  const equiposMap = {};

  // Inicializar equipos desde los partidos
  partidos.forEach(p => {
    if (!equiposMap[p.local]) {
      equiposMap[p.local] = { nombre: p.local, flag: p.flagLocal, pts: 0, gf: 0, gc: 0, j: 0 };
    }
    if (!equiposMap[p.visitante]) {
      equiposMap[p.visitante] = { nombre: p.visitante, flag: p.flagVisitante, pts: 0, gf: 0, gc: 0, j: 0 };
    }
  });

  // Calcular estadísticas con resultados confirmados
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

  // Ordenar: Pts → GD → GF → nombre (alfabético como desempate provisional)
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
//  CÁLCULO DE PUNTOS (trigger al confirmar resultado)
// ══════════════════════════════════════════════════════════════

async function recalcularPuntos(partidoId, golesLocal, golesVisitante) {
  try {
    const { query, where, getDocs: gd } = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );
    const q = query(
      collection(db, 'predicciones'),
      where('partido_id', '==', partidoId)
    );
    const snap = await gd(q);

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

function calcularPuntosPartido(pred, golesLocalReal, golesVisitanteReal) {
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
