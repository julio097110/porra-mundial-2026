// ============================================================
//  js/puntos-elim.js
//  Módulo compartido: cálculo de puntos de partidos de eliminatoria
//  ────────────────────────────────────────────────────────────
//  Única fuente de verdad para la puntuación de eliminatorias.
//  Usada tanto por resultados_elim.js (cálculo oficial, guardado
//  en Firestore al confirmar un resultado) como por
//  informe-modal.js (desglose visual de puntos por jugador/partido).
//
//  No debe existir ninguna otra copia de esta lógica en el
//  proyecto. Si se necesita en un archivo nuevo, importar desde
//  aquí — nunca reimplementar.
// ============================================================

// ¿La predicción tiene los dos equipos correctos para este cruce?
export function equiposCoincidenElim(pred, resultadoReal) {
  return pred.equipo_local     === resultadoReal.equipo_local &&
         pred.equipo_visitante === resultadoReal.equipo_visitante;
}

// Calcula los puntos de una predicción de eliminatoria frente al
// resultado real confirmado.
//
// Criterios (equipos correctos):
//   4 pts — marcador exacto (90') y, si hubo empate en 90',
//           también acierta quién pasa
//   1 pt  — marcador exacto (90') pero falla quién pasa tras empate
//   2 pts — empate en 90' predicho (no exacto) + acierta quién pasa
//   2 pts — acierta el signo del resultado (sin marcador exacto, sin empate)
//   0 pts — cualquier otro caso
//
// Criterio (equipos incorrectos):
//   2 pts — el equipo que el jugador marcó como ganador (pred.ganador)
//           coincide con el equipo que realmente pasó de ronda
//           (resultadoReal.equipo_que_pasa), aunque el cruce predicho
//           esté mal (p. ej. predijo "Argentina vs Francia" y el
//           cruce real era "Alemania vs Francia", pero acertó que
//           Francia pasaba)
//   0 pts — en cualquier otro caso
export function calcularPuntosPartidoElim(pred, resultadoReal) {
  if (!pred || !resultadoReal?.confirmado) return 0;

  if (!equiposCoincidenElim(pred, resultadoReal)) {
    return pred.ganador === resultadoReal.equipo_que_pasa ? 2 : 0;
  }

  const pl = parseInt(pred.local);
  const pv = parseInt(pred.visitante);
  if (isNaN(pl) || isNaN(pv)) return 0;

  const gl         = resultadoReal.goles_local;
  const gv         = resultadoReal.goles_visitante;
  const hayEmpate90 = gl === gv;

  if (pl === gl && pv === gv) {
    if (!hayEmpate90) return 4;
    return pred.ganador === resultadoReal.equipo_que_pasa ? 4 : 1;
  }

  if (hayEmpate90) {
    if (pl === pv) {
      return pred.ganador === resultadoReal.equipo_que_pasa ? 2 : 1;
    }
    return 0;
  }

  const signoPred = Math.sign(pl - pv);
  const signoReal = Math.sign(gl - gv);
  if (signoPred === signoReal) return 2;

  return 0;
}
