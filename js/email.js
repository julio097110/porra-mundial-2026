// ============================================================
//  js/email.js
//  Sistema de notificaciones por email via EmailJS
//
//  Emails que envía:
//  1. Al guardar predicciones → resumen completo al admin
//  2. Aviso diario (desde cron-job.org) → lista de jugadores sin rellenar
//
//  Configuración necesaria en EmailJS:
//  - SERVICE_ID:  el ID de tu servicio de email en EmailJS
//  - TEMPLATE_PREDICCIONES: template para predicciones guardadas
//  - TEMPLATE_AVISO: template para aviso diario
//  - PUBLIC_KEY: tu clave pública de EmailJS
// ============================================================

import { db } from './firebase-config.js';
import {
  collection, doc, setDoc, getDocs,
  query, where, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { PARTIDOS_GRUPOS, getPartidosPorGrupo, GRUPOS } from '../data/partidos.js';
import { PARTIDOS_ELIM_R32 } from '../data/partidos_elim.js';

// ── Configuración EmailJS ─────────────────────────────────────
// ⚠️ SUSTITUYE estos valores con los tuyos de EmailJS
// Los encontrarás en https://dashboard.emailjs.com
const EMAILJS_PUBLIC_KEY        = 'o2Rm6h_kSRdn3R4Rj';
const EMAILJS_SERVICE_ID        = 'service_emvnra4';
const EMAILJS_TEMPLATE_PRED     = 'template_fdn1f0v';
const EMAILJS_TEMPLATE_AVISO    = 'template_f1g7bgv';

// Email del administrador
const ADMIN_EMAIL = 'pool2026mundial@gmail.com';

// ── Inicializar EmailJS ───────────────────────────────────────
let _emailJSCargado = false;

async function cargarEmailJS() {
  if (_emailJSCargado) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    script.onload = () => {
      window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
      _emailJSCargado = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ══════════════════════════════════════════════════════════════
//  EMAIL 1: Predicciones guardadas
//  Se envía cada vez que un jugador guarda sus predicciones
// ══════════════════════════════════════════════════════════════

export async function enviarEmailPredicciones(usuario, predicciones, tipo) {
  try {
    await cargarEmailJS();

    const resumen = generarResumenPredicciones(predicciones, tipo, usuario);
    const ahora   = new Date().toLocaleString('es-ES', {
      day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'
    });

    const templateParams = {
      to_email:      ADMIN_EMAIL,
      jugador_nombre: usuario.nombre_visible || usuario.username || '—',
      tipo_prediccion: traducirTipo(tipo),
      fecha:         ahora,
      resumen:       resumen,
      total_campos:  contarCampos(predicciones, tipo)
    };

    await window.emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_PRED,
      templateParams
    );

    // Guardar en log de Firestore
    await guardarEmailLog({
      tipo:    'predicciones',
      jugador: usuario.nombre_visible || '—',
      uid:     usuario.uid,
      descripcion: `${traducirTipo(tipo)} guardadas`
    });

    console.log('[email] Email de predicciones enviado');
  } catch (e) {
    console.warn('[email] No se pudo enviar email:', e);
    // No es fatal — las predicciones ya se han guardado en Firestore
  }
}

// ══════════════════════════════════════════════════════════════
//  EMAIL 2: Aviso diario — jugadores sin rellenar
//  Se activa desde cron-job.org o cuando el admin abre la web
// ══════════════════════════════════════════════════════════════

export async function enviarAvisoDiario() {
  try {
    // Comprobar si ya se envió hoy
    if (yaEnviadoHoy()) return;

    // Comprobar si estamos en el rango de fechas correcto (01/06 – 11/06/2026)
    const ahora     = new Date();
    const inicio    = new Date('2026-06-01T20:00:00+02:00');
    const fin       = new Date('2026-06-11T00:00:00+02:00');
    if (ahora < inicio || ahora > fin) return;

    await cargarEmailJS();

    // Obtener jugadores sin predicciones
    const sinRellenar = await obtenerJugadoresSinPredicciones();
    if (!sinRellenar.length) return;

    const fechaStr = ahora.toLocaleDateString('es-ES', {
      weekday:'long', day:'numeric', month:'long'
    });

    const templateParams = {
      to_email:       ADMIN_EMAIL,
      fecha:          fechaStr,
      total_sin:      sinRellenar.length,
      lista_jugadores: sinRellenar.map(n => `- ${n}`).join('\n'),
      dias_restantes: Math.ceil((fin - ahora) / 86400000)
    };

    await window.emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_AVISO,
      templateParams
    );

    // Marcar como enviado hoy
    localStorage.setItem('aviso_diario_fecha', new Date().toDateString());

    // Guardar en log
    await guardarEmailLog({
      tipo:       'aviso',
      jugadores:  sinRellenar.length,
      descripcion: `${sinRellenar.length} jugadores sin rellenar`
    });

    console.log('[email] Aviso diario enviado');
  } catch (e) {
    console.warn('[email] No se pudo enviar aviso diario:', e);
  }
}

// ── Comprobar si el aviso diario ya se envió hoy ─────────────
function yaEnviadoHoy() {
  const ultima = localStorage.getItem('aviso_diario_fecha');
  return ultima === new Date().toDateString();
}

// ── Obtener jugadores que no han guardado predicciones ────────
async function obtenerJugadoresSinPredicciones() {
  try {
    const usuariosSnap = await getDocs(collection(db, 'usuarios'));
    const todos = usuariosSnap.docs.map(d => ({
      uid:    d.id,
      nombre: d.data().nombre_visible || d.data().username || '—',
      rol:    d.data().rol || 'jugador'
    }));

    // Obtener UIDs con al menos una predicción
    const predSnap = await getDocs(collection(db, 'predicciones'));
    const conPred  = new Set();
    predSnap.forEach(d => {
      const uid = d.data().uid;
      if (uid) conPred.add(uid);
    });

    // Filtrar los que no tienen ninguna predicción (excluyendo al admin)
    return todos
      .filter(u => u.rol !== 'admin' && !conPred.has(u.uid))
      .map(u => u.nombre);
  } catch (e) {
    console.error('[obtenerJugadoresSinPred]', e);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
//  GENERADORES DE RESUMEN
// ══════════════════════════════════════════════════════════════

function generarResumenPredicciones(predicciones, tipo, usuario) {
  const lineas = [];
  const sep    = '─'.repeat(40);

  lineas.push(`PORRA MUNDIAL 2026`);
  lineas.push(`Jugador: ${usuario.nombre_visible || usuario.username || '—'}`);
  lineas.push(`Tipo: ${traducirTipo(tipo)}`);
  lineas.push(`Fecha: ${new Date().toLocaleString('es-ES')}`);
  lineas.push(sep);

  if (tipo === 'grupos') {
    GRUPOS.forEach(g => {
      const partidos = getPartidosPorGrupo(g);
      lineas.push(`\nGRUPO ${g}`);
      partidos.forEach(p => {
        const pred = predicciones[p.id];
        if (!pred || pred.local === '' || pred.visitante === '') {
          lineas.push(`  ${p.local} vs ${p.visitante}: sin rellenar`);
        } else {
          lineas.push(`  ${p.local} ${pred.local} — ${pred.visitante} ${p.visitante}`);
        }
      });
    });

    // Desempates
    if (predicciones._desempates) {
      lineas.push(`\nDESEMPATES DE GRUPOS`);
      Object.entries(predicciones._desempates).forEach(([key, val]) => {
        lineas.push(`  ${key}: ${val} primero`);
      });
    }
  }

  else if (tipo === 'eliminatorias') {
    lineas.push(`\nBRACKET DE ELIMINATORIAS`);

    // Mapa de equipos para R32 (hardcodeado desde PARTIDOS_ELIM_R32)
    const equiposR32 = {};
    PARTIDOS_ELIM_R32.forEach(p => {
      equiposR32[p.id] = { local: p.local, visitante: p.visitante };
    });

    // Placeholders para rondas posteriores al R32
    const placeholders = {
      'elim8_2':  { local: 'Gan. 16_1',  visitante: 'Gan. 16_2'  },
      'elim8_1':  { local: 'Gan. 16_3',  visitante: 'Gan. 16_4'  },
      'elim8_5':  { local: 'Gan. 16_8',  visitante: 'Gan. 16_7'  },
      'elim8_6':  { local: 'Gan. 16_6',  visitante: 'Gan. 16_5'  },
      'elim8_3':  { local: 'Gan. 16_9',  visitante: 'Gan. 16_10' },
      'elim8_4':  { local: 'Gan. 16_11', visitante: 'Gan. 16_12' },
      'elim8_7':  { local: 'Gan. 16_16', visitante: 'Gan. 16_15' },
      'elim8_8':  { local: 'Gan. 16_13', visitante: 'Gan. 16_14' },
      'elim4_1':  { local: 'Gan. 8_1',   visitante: 'Gan. 8_2'   },
      'elim4_2':  { local: 'Gan. 8_5',   visitante: 'Gan. 8_6'   },
      'elim4_3':  { local: 'Gan. 8_3',   visitante: 'Gan. 8_4'   },
      'elim4_4':  { local: 'Gan. 8_7',   visitante: 'Gan. 8_8'   },
      'elim2_1':  { local: 'Gan. QF1',   visitante: 'Gan. QF2'   },
      'elim2_2':  { local: 'Gan. QF3',   visitante: 'Gan. QF4'   },
      'elim34':   { local: 'Perd. SF1',  visitante: 'Perd. SF2'  },
      'elimfin':  { local: 'Gan. SF1',   visitante: 'Gan. SF2'   },
    };

    const fases = [
      { label: '1/16 DE FINAL',    ids: ['elim16_1','elim16_2','elim16_3','elim16_4','elim16_5','elim16_6','elim16_7','elim16_8','elim16_9','elim16_10','elim16_11','elim16_12','elim16_13','elim16_14','elim16_15','elim16_16'] },
      { label: '1/8 DE FINAL',     ids: ['elim8_2','elim8_1','elim8_5','elim8_6','elim8_3','elim8_4','elim8_7','elim8_8'] },
      { label: 'CUARTOS DE FINAL', ids: ['elim4_1','elim4_2','elim4_3','elim4_4'] },
      { label: 'SEMIFINALES',      ids: ['elim2_1','elim2_2'] },
      { label: '3ER Y 4º PUESTO',  ids: ['elim34'] },
      { label: 'FINAL',            ids: ['elimfin'] },
    ];

    fases.forEach(fase => {
      const partsFase = fase.ids
        .map(id => [id, predicciones[id]])
        .filter(([, pred]) => pred != null);
      if (!partsFase.length) return;
      lineas.push(`\n${fase.label}`);
      partsFase.forEach(([id, pred]) => {
        const equipos  = equiposR32[id] || placeholders[id] || { local: '?', visitante: '?' };
        const marcador = `${pred.local ?? '?'}\u2014${pred.visitante ?? '?'}`;
        const ganador  = pred.ganador ? ` \u2192 Pasa: ${pred.ganador}` : '';
        lineas.push(`  ${equipos.local} vs ${equipos.visitante}: ${marcador}${ganador}`);
      });
    });
  }

  else if (tipo === 'especiales') {
    lineas.push(`\nPREDICCIONES ESPECIALES`);
    lineas.push(`  Campeón del mundial:  ${predicciones.campeon    || 'sin rellenar'}`);
    lineas.push(`  Segundo clasificado:  ${predicciones.subcampeon || 'sin rellenar'}`);
    lineas.push(`  Mejor jugador (MVP):  ${predicciones.mvp        || 'sin rellenar'}`);
    lineas.push(`  Máximo goleador:      ${predicciones.goleador   || 'sin rellenar'}`);
  }

  // ── NUEVO: mejores terceros ───────────────────────────────
  else if (tipo === 'terceros') {
    lineas.push(`\nMEJORES TERCEROS`);
    if (!Array.isArray(predicciones) || predicciones.length === 0) {
      lineas.push(`  Sin selección guardada`);
    } else {
      // Ordenar por grupo usando PARTIDOS_GRUPOS
      const conGrupo = predicciones.map(nombre => {
        const partido = PARTIDOS_GRUPOS.find(p => p.local === nombre || p.visitante === nombre);
        return { nombre, grupo: partido?.grupo || 'Z' };
      }).sort((a, b) => a.grupo.localeCompare(b.grupo));

      conGrupo.forEach(({ nombre, grupo }) => {
        lineas.push(`  ${nombre} (Grupo ${grupo})`);
      });
      lineas.push(`\n  Total: ${predicciones.length}/8 equipos seleccionados`);
    }
  }

  lineas.push(`\n${sep}`);
  lineas.push(`Este email es una copia de seguridad automática.`);
  lineas.push(`Los datos están guardados en Firebase Firestore.`);

  return lineas.join('\n');
}

function traducirTipo(tipo) {
  const map = {
    grupos:        'Fase de grupos',
    eliminatorias: 'Eliminatorias',
    especiales:    'Predicciones especiales',
    terceros:      'Mejores terceros'          // ← NUEVO
  };
  return map[tipo] || tipo;
}

function contarCampos(predicciones, tipo) {
  if (tipo === 'grupos') {
    return Object.keys(predicciones).filter(k => k !== '_desempates').length;
  }
  if (tipo === 'eliminatorias') return Object.keys(predicciones).length;
  if (tipo === 'especiales') {
    return ['campeon','subcampeon','mvp','goleador'].filter(k => predicciones[k]).length;
  }
  if (tipo === 'terceros') {                   // ← NUEVO
    return Array.isArray(predicciones) ? predicciones.length : 0;
  }
  return 0;
}

// ── Guardar registro en Firestore ─────────────────────────────
async function guardarEmailLog(datos) {
  try {
    const id = `${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
    await setDoc(doc(db, 'email_log', id), {
      ...datos,
      timestamp: serverTimestamp()
    });
  } catch (e) {
    console.warn('[emailLog]', e);
  }
}

// ══════════════════════════════════════════════════════════════
//  ENDPOINT PARA CRON-JOB.ORG
//  cron-job.org llama a esta URL diariamente a las 20:00 CET:
//  https://julio097110.github.io/porra-mundial-2026/cron.html
//
//  El archivo cron.html simplemente importa este módulo y llama
//  a enviarAvisoDiario(). Ver cron.html más abajo.
// ══════════════════════════════════════════════════════════════

// Exportar para uso desde cron.html
export { enviarAvisoDiario as triggerAvisoDiario };
