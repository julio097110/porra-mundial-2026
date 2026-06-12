// ============================================================
//  data/partidos_elim.js
//  32 partidos de la fase eliminatoria — Mundial 2026
//  Fuente: calendario oficial FIFA / kickoffclock.com (verificado)
//  Fechas en UTC · Horas mostradas en hora local del usuario
//
//  IMPORTANTE: Este archivo solo contiene datos ESTÁTICOS
//  (id, fase, ronda, fechaUTC, sede, ciudad, pais).
//  Los equipos son siempre null aquí — se leen en tiempo real
//  desde Firestore (config/bracket_eliminatorias) a través
//  de _bracket en prediccion.js y resultados.js.
//
//  Los placeholders ("1º Grupo A", "Gan. P1"...) siguen
//  definidos en prediccion.js dentro de obtenerPartidos16()
//  y obtenerPartidosFase().
//
//  Estructura de cada partido:
//  {
//    id:       string único — debe coincidir con prediccion.js
//              r32_1..r32_16, r16_1..r16_8, qf_1..qf_4,
//              sf_1, sf_2, tp_1, final_1
//    ronda:    'r32' | 'r16' | 'qf' | 'semi' | '3er' | 'final'
//    fechaUTC: ISO 8601 string en UTC
//    sede:     nombre del estadio
//    ciudad:   ciudad
//    pais:     país sede
//  }
// ============================================================

export const PARTIDOS_ELIM = [

  // ══════════════════════════════════════════════════════
  //  RONDA DE 32 (1/16 de final)
  //  28 jun – 4 jul 2026
  // ══════════════════════════════════════════════════════
  {
    id: 'r32_1',  ronda: 'r32',
    fechaUTC: '2026-06-28T19:00:00Z',
    sede: 'SoFi Stadium',            ciudad: 'Inglewood',        pais: 'EEUU'
  },
  {
    id: 'r32_2',  ronda: 'r32',
    fechaUTC: '2026-06-29T17:00:00Z',
    sede: 'NRG Stadium',             ciudad: 'Houston',          pais: 'EEUU'
  },
  {
    id: 'r32_3',  ronda: 'r32',
    fechaUTC: '2026-06-29T20:30:00Z',
    sede: 'Gillette Stadium',        ciudad: 'Foxborough',       pais: 'EEUU'
  },
  {
    id: 'r32_4',  ronda: 'r32',
    fechaUTC: '2026-06-30T01:00:00Z',
    sede: 'Estadio BBVA',            ciudad: 'Monterrey',        pais: 'México'
  },
  {
    id: 'r32_5',  ronda: 'r32',
    fechaUTC: '2026-06-30T17:00:00Z',
    sede: 'AT&T Stadium',            ciudad: 'Arlington',        pais: 'EEUU'
  },
  {
    id: 'r32_6',  ronda: 'r32',
    fechaUTC: '2026-06-30T21:00:00Z',
    sede: 'MetLife Stadium',         ciudad: 'East Rutherford',  pais: 'EEUU'
  },
  {
    id: 'r32_7',  ronda: 'r32',
    fechaUTC: '2026-07-01T01:00:00Z',
    sede: 'Estadio Azteca',          ciudad: 'Ciudad de México', pais: 'México'
  },
  {
    id: 'r32_8',  ronda: 'r32',
    fechaUTC: '2026-07-01T16:00:00Z',
    sede: 'Mercedes-Benz Stadium',   ciudad: 'Atlanta',          pais: 'EEUU'
  },
  {
    id: 'r32_9',  ronda: 'r32',
    fechaUTC: '2026-07-01T20:00:00Z',
    sede: 'Lumen Field',             ciudad: 'Seattle',          pais: 'EEUU'
  },
  {
    id: 'r32_10', ronda: 'r32',
    fechaUTC: '2026-07-02T00:00:00Z',
    sede: 'Levi\'s Stadium',         ciudad: 'Santa Clara',      pais: 'EEUU'
  },
  {
    id: 'r32_11', ronda: 'r32',
    fechaUTC: '2026-07-02T19:00:00Z',
    sede: 'SoFi Stadium',            ciudad: 'Inglewood',        pais: 'EEUU'
  },
  {
    id: 'r32_12', ronda: 'r32',
    fechaUTC: '2026-07-02T23:00:00Z',
    sede: 'BMO Field',               ciudad: 'Toronto',          pais: 'Canadá'
  },
  {
    id: 'r32_13', ronda: 'r32',
    fechaUTC: '2026-07-03T03:00:00Z',
    sede: 'BC Place',                ciudad: 'Vancouver',        pais: 'Canadá'
  },
  {
    id: 'r32_14', ronda: 'r32',
    fechaUTC: '2026-07-03T18:00:00Z',
    sede: 'AT&T Stadium',            ciudad: 'Arlington',        pais: 'EEUU'
  },
  {
    id: 'r32_15', ronda: 'r32',
    fechaUTC: '2026-07-03T22:00:00Z',
    sede: 'Hard Rock Stadium',       ciudad: 'Miami Gardens',    pais: 'EEUU'
  },
  {
    id: 'r32_16', ronda: 'r32',
    fechaUTC: '2026-07-04T01:30:00Z',
    sede: 'Arrowhead Stadium',       ciudad: 'Kansas City',      pais: 'EEUU'
  },

  // ══════════════════════════════════════════════════════
  //  RONDA DE 16 (1/8 de final)
  //  4 jul – 7 jul 2026
  // ══════════════════════════════════════════════════════
  {
    id: 'r16_1', ronda: 'r16',
    fechaUTC: '2026-07-04T17:00:00Z',
    sede: 'NRG Stadium',             ciudad: 'Houston',          pais: 'EEUU'
  },
  {
    id: 'r16_2', ronda: 'r16',
    fechaUTC: '2026-07-04T21:00:00Z',
    sede: 'Lincoln Financial Field', ciudad: 'Filadelfia',       pais: 'EEUU'
  },
  {
    id: 'r16_3', ronda: 'r16',
    fechaUTC: '2026-07-05T20:00:00Z',
    sede: 'MetLife Stadium',         ciudad: 'East Rutherford',  pais: 'EEUU'
  },
  {
    id: 'r16_4', ronda: 'r16',
    fechaUTC: '2026-07-06T00:00:00Z',
    sede: 'Estadio Azteca',          ciudad: 'Ciudad de México', pais: 'México'
  },
  {
    id: 'r16_5', ronda: 'r16',
    fechaUTC: '2026-07-06T19:00:00Z',
    sede: 'AT&T Stadium',            ciudad: 'Arlington',        pais: 'EEUU'
  },
  {
    id: 'r16_6', ronda: 'r16',
    fechaUTC: '2026-07-07T00:00:00Z',
    sede: 'Lumen Field',             ciudad: 'Seattle',          pais: 'EEUU'
  },
  {
    id: 'r16_7', ronda: 'r16',
    fechaUTC: '2026-07-07T16:00:00Z',
    sede: 'Mercedes-Benz Stadium',   ciudad: 'Atlanta',          pais: 'EEUU'
  },
  {
    id: 'r16_8', ronda: 'r16',
    fechaUTC: '2026-07-07T20:00:00Z',
    sede: 'BC Place',                ciudad: 'Vancouver',        pais: 'Canadá'
  },

  // ══════════════════════════════════════════════════════
  //  CUARTOS DE FINAL
  //  9 jul – 12 jul 2026
  // ══════════════════════════════════════════════════════
  {
    id: 'qf_1', ronda: 'qf',
    fechaUTC: '2026-07-09T20:00:00Z',
    sede: 'Gillette Stadium',        ciudad: 'Foxborough',       pais: 'EEUU'
  },
  {
    id: 'qf_2', ronda: 'qf',
    fechaUTC: '2026-07-10T19:00:00Z',
    sede: 'SoFi Stadium',            ciudad: 'Inglewood',        pais: 'EEUU'
  },
  {
    id: 'qf_3', ronda: 'qf',
    fechaUTC: '2026-07-11T21:00:00Z',
    sede: 'Hard Rock Stadium',       ciudad: 'Miami Gardens',    pais: 'EEUU'
  },
  {
    id: 'qf_4', ronda: 'qf',
    fechaUTC: '2026-07-12T01:00:00Z',
    sede: 'Arrowhead Stadium',       ciudad: 'Kansas City',      pais: 'EEUU'
  },

  // ══════════════════════════════════════════════════════
  //  SEMIFINALES
  //  14 jul – 15 jul 2026
  // ══════════════════════════════════════════════════════
  {
    id: 'sf_1', ronda: 'semi',
    fechaUTC: '2026-07-14T19:00:00Z',
    sede: 'AT&T Stadium',            ciudad: 'Arlington',        pais: 'EEUU'
  },
  {
    id: 'sf_2', ronda: 'semi',
    fechaUTC: '2026-07-15T19:00:00Z',
    sede: 'Mercedes-Benz Stadium',   ciudad: 'Atlanta',          pais: 'EEUU'
  },

  // ══════════════════════════════════════════════════════
  //  TERCER Y CUARTO PUESTO
  //  18 jul 2026
  // ══════════════════════════════════════════════════════
  {
    id: 'tp_1', ronda: '3er',
    fechaUTC: '2026-07-18T21:00:00Z',
    sede: 'Hard Rock Stadium',       ciudad: 'Miami Gardens',    pais: 'EEUU'
  },

  // ══════════════════════════════════════════════════════
  //  FINAL
  //  19 jul 2026
  // ══════════════════════════════════════════════════════
  {
    id: 'final_1', ronda: 'final',
    fechaUTC: '2026-07-19T19:00:00Z',
    sede: 'MetLife Stadium',         ciudad: 'East Rutherford',  pais: 'EEUU'
  }

];

// ── Helper: obtener partido por id ───────────────────────────
export function getPartidoElimPorId(id) {
  return PARTIDOS_ELIM.find(p => p.id === id) || null;
}

// ── Helper: obtener partidos por ronda ───────────────────────
export function getPartidosElimPorRonda(ronda) {
  return PARTIDOS_ELIM.filter(p => p.ronda === ronda);
}
