// ============================================================
//  js/puntos-elim.js
//  Módulo compartido: cálculo de puntos de partidos de eliminatoria
//  ────────────────────────────────────────────────────────────
//  Única fuente de verdad para la puntuación de eliminatorias.
//  Usada tanto por resultados_elim.js (cálculo oficial, guardado
//  en Firestore al confirmar un resultado) como por
//  informe-modal.js (desglose visual de puntos por jugador/partido)
//  y admin.js (auditoría de integridad).
//
//  No debe existir ninguna otra copia de esta lógica en el
//  proyecto. Si se necesita en un archivo nuevo, importar desde
//  aquí — nunca reimplementar.
// ============================================================

// ¿La predicción tiene los dos equipos correctos para este cruce?
// Comparación por posición: local predicho vs local real, visitante
// predicho vs visitante real (la posición viene dada por el cuadro
// de la FIFA y es la misma para todos los jugadores).
export function equiposCoincidenElim(pred, resultadoReal) {
  return pred.equipo_local     === resultadoReal.equipo_local &&
         pred.equipo_visitante === resultadoReal.equipo_visitante;
}

// Calcula los puntos de una predicción de eliminatoria frente al
// resultado real confirmado.
//
// Dos reglas independientes y sumables (2026-07-01):
//
//   Regla A — Vencedor / quién pasa acertado: +2 pts
//     Se cumple si el equipo que el jugador marcó como ganador
//     coincide con el equipo que realmente pasó de ronda.
//     Se comprueba SIEMPRE, sin condiciones previas: no importa si
//     los equipos del cruce predicho eran correctos, no importa si
//     hubo empate en 90' o no, no importa el marcador.
//
//   Regla B — Equipos + marcador exacto: +2 pts
//     Se cumple si el equipo local predicho coincide con el real,
//     el visitante predicho coincide con el real (por posición), Y
//     el marcador predicho es idéntico al marcador real (90').
//
//   Total = Regla A + Regla B → posibles: 0, 2 (por A), 2 (por B) o 4.
//
// Ejemplos:
//   - Marcador exacto + acierta quién pasa            → 4 pts (A+B)
//   - Marcador exacto de un empate, falla quién pasa   → 2 pts (solo B)
//   - Acierta quién pasa, sin marcador exacto          → 2 pts (solo A)
//   - Acierta quién pasa aunque el cruce fuera erróneo  → 2 pts (solo A)
//   - No acierta ni marcador exacto ni quién pasa       → 0 pts
export function calcularPuntosPartidoElim(pred, resultadoReal) {
  if (!pred || !resultadoReal?.confirmado) return 0;

  let puntos = 0;

  // ── Regla A — Vencedor / quién pasa acertado ──────────────────
  if (pred.ganador && pred.ganador === resultadoReal.equipo_que_pasa) {
    puntos += 2;
  }

  // ── Regla B — Equipos correctos + marcador exacto ─────────────
  if (equiposCoincidenElim(pred, resultadoReal)) {
    const pl = parseInt(pred.local);
    const pv = parseInt(pred.visitante);
    const gl = resultadoReal.goles_local;
    const gv = resultadoReal.goles_visitante;

    if (!isNaN(pl) && !isNaN(pv) && pl === gl && pv === gv) {
      puntos += 2;
    }
  }

  return puntos;
}
