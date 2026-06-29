// ============================================================
//  data/partidos_elim.js
//  Fase eliminatoria — Mundial 2026
//
//  NUEVO ESQUEMA (jun 2026):
//  · IDs nuevos: elim16_1..16 | elim8_1..8 | elim4_1..4
//                elim2_1..2   | elimfin    | elim34
//  · Equipos R32 HARDCODEADOS aquí — nunca se leen de Firebase
//  · Colecciones nuevas: pred_ko (predicciones), res_ko (resultados)
//  · Datos viejos (predicciones_elim, resultados_elim,
//    config/bracket_eliminatorias) coexisten sin uso — no borrar
// ============================================================

// ── Mapa de dependencias del bracket ─────────────────────────
// Indica qué partido fuente ocupa cada slot (local / vis)
// de cada partido derivado. Idéntico en prediccion.js y
// resultados_elim.js — no modificar uno sin el otro.
export const MAPA_DEPENDENCIAS = {
  // R16 ← R32
  'elim8_1':  { local: 'elim16_3',  vis: 'elim16_4'  }, // P89: GER/PAR vs FRA/SWE
  'elim8_2':  { local: 'elim16_1',  vis: 'elim16_2'  }, // P90: RSA/CAN vs NED/MAR
  'elim8_3':  { local: 'elim16_9',  vis: 'elim16_10' }, // P91: BRA/JPN vs CIV/NOR
  'elim8_4':  { local: 'elim16_11', vis: 'elim16_12' }, // P92: MEX/ECU vs ENG/COD
  'elim8_5':  { local: 'elim16_8',  vis: 'elim16_7'  }, // P93: POR/CRO vs ESP/AUT
  'elim8_6':  { local: 'elim16_6',  vis: 'elim16_5'  }, // P94: USA/BIH vs BEL/SEN
  'elim8_7':  { local: 'elim16_16', vis: 'elim16_15' }, // P95: ARG/CPV vs AUS/EGY
  'elim8_8':  { local: 'elim16_13', vis: 'elim16_14' }, // P96: SUI/ALG vs COL/GHA
  // QF ← R16
  'elim4_1':  { local: 'elim8_1',   vis: 'elim8_2'   }, // P97
  'elim4_2':  { local: 'elim8_5',   vis: 'elim8_6'   }, // P98
  'elim4_3':  { local: 'elim8_3',   vis: 'elim8_4'   }, // P99
  'elim4_4':  { local: 'elim8_7',   vis: 'elim8_8'   }, // P100
  // SF ← QF
  'elim2_1':  { local: 'elim4_1',   vis: 'elim4_2'   }, // P101
  'elim2_2':  { local: 'elim4_3',   vis: 'elim4_4'   }, // P102
  // Final y 3er puesto ← SF (elim34 usa los perdedores)
  'elimfin':  { local: 'elim2_1',   vis: 'elim2_2'   },
  'elim34':   { local: 'elim2_1',   vis: 'elim2_2'   },
};

// ── R32: 16 partidos con equipos reales hardcodeados ─────────
// Orden FIFA (P73–P88).
// Orden visual en el bracket:
//   Izquierda: slots 0-3 = elim16_1..4 (arriba)
//              slots 4-7 = elim16_8..5 (abajo, invertidos)
//   Derecha:   slots 0-3 = elim16_9..12 (arriba)
//              slots 4-7 = elim16_16..13 (abajo, invertidos)
export const PARTIDOS_ELIM_R32 = [
  { id: 'elim16_1',  local: 'Sudáfrica',           visitante: 'Canadá',               ronda: 'r32', fechaUTC: '2026-06-29T17:00:00Z', ciudad: 'Los Ángeles'       },
  { id: 'elim16_2',  local: 'Países Bajos',         visitante: 'Marruecos',            ronda: 'r32', fechaUTC: '2026-06-30T02:00:00Z', ciudad: 'Houston'           },
  { id: 'elim16_3',  local: 'Alemania',             visitante: 'Paraguay',             ronda: 'r32', fechaUTC: '2026-06-29T20:30:00Z', ciudad: 'Foxborough'        },
  { id: 'elim16_4',  local: 'Francia',              visitante: 'Suecia',               ronda: 'r32', fechaUTC: '2026-06-30T21:00:00Z', ciudad: 'Monterrey'         },
  { id: 'elim16_5',  local: 'Bélgica',              visitante: 'Senegal',              ronda: 'r32', fechaUTC: '2026-07-01T22:00:00Z', ciudad: 'Arlington'         },
  { id: 'elim16_6',  local: 'EEUU',                 visitante: 'Bosnia y Herzegovina', ronda: 'r32', fechaUTC: '2026-07-02T00:00:00Z', ciudad: 'East Rutherford'   },
  { id: 'elim16_7',  local: 'España',               visitante: 'Austria',              ronda: 'r32', fechaUTC: '2026-07-02T19:00:00Z', ciudad: 'Atlanta'           },
  { id: 'elim16_8',  local: 'Portugal',             visitante: 'Croacia',              ronda: 'r32', fechaUTC: '2026-07-03T01:00:00Z', ciudad: 'Seattle'           },
  { id: 'elim16_9',  local: 'Brasil',               visitante: 'Japón',                ronda: 'r32', fechaUTC: '2026-06-29T19:00:00Z', ciudad: 'Santa Clara'       },
  { id: 'elim16_10', local: 'Costa de Marfil',      visitante: 'Noruega',              ronda: 'r32', fechaUTC: '2026-06-30T17:00:00Z', ciudad: 'Los Ángeles'       },
  { id: 'elim16_11', local: 'México',               visitante: 'Ecuador',              ronda: 'r32', fechaUTC: '2026-07-01T01:00:00Z', ciudad: 'Ciudad de México'  },
  { id: 'elim16_12', local: 'Inglaterra',           visitante: 'RD Congo',             ronda: 'r32', fechaUTC: '2026-07-01T16:00:00Z', ciudad: 'Toronto'           },
  { id: 'elim16_13', local: 'Suiza',                visitante: 'Argelia',              ronda: 'r32', fechaUTC: '2026-07-03T03:00:00Z', ciudad: 'Vancouver'         },
  { id: 'elim16_14', local: 'Colombia',             visitante: 'Ghana',                ronda: 'r32', fechaUTC: '2026-07-04T01:30:00Z', ciudad: 'Kansas City'       },
  { id: 'elim16_15', local: 'Australia',            visitante: 'Egipto',               ronda: 'r32', fechaUTC: '2026-07-03T18:00:00Z', ciudad: 'Arlington'         },
  { id: 'elim16_16', local: 'Argentina',            visitante: 'Cabo Verde',           ronda: 'r32', fechaUTC: '2026-07-03T22:00:00Z', ciudad: 'Miami Gardens'     },
];

// ── R16, QF, SF, Final, 3er puesto (equipos se propagan) ─────
export const PARTIDOS_ELIM_REST = [
  { id: 'elim8_1',  ronda: 'r16',   fechaUTC: '2026-07-04T23:00:00Z', ciudad: 'Houston'           },
  { id: 'elim8_2',  ronda: 'r16',   fechaUTC: '2026-07-04T17:00:00Z', ciudad: 'Los Ángeles'       },
  { id: 'elim8_3',  ronda: 'r16',   fechaUTC: '2026-07-05T20:00:00Z', ciudad: 'East Rutherford'   },
  { id: 'elim8_4',  ronda: 'r16',   fechaUTC: '2026-07-06T00:00:00Z', ciudad: 'Ciudad de México'  },
  { id: 'elim8_5',  ronda: 'r16',   fechaUTC: '2026-07-06T19:00:00Z', ciudad: 'Arlington'         },
  { id: 'elim8_6',  ronda: 'r16',   fechaUTC: '2026-07-07T00:00:00Z', ciudad: 'Seattle'           },
  { id: 'elim8_7',  ronda: 'r16',   fechaUTC: '2026-07-07T16:00:00Z', ciudad: 'Atlanta'           },
  { id: 'elim8_8',  ronda: 'r16',   fechaUTC: '2026-07-07T20:00:00Z', ciudad: 'Vancouver'         },
  { id: 'elim4_1',  ronda: 'qf',    fechaUTC: '2026-07-09T20:00:00Z', ciudad: 'Los Ángeles'       },
  { id: 'elim4_2',  ronda: 'qf',    fechaUTC: '2026-07-10T19:00:00Z', ciudad: 'East Rutherford'   },
  { id: 'elim4_3',  ronda: 'qf',    fechaUTC: '2026-07-11T21:00:00Z', ciudad: 'Dallas'            },
  { id: 'elim4_4',  ronda: 'qf',    fechaUTC: '2026-07-12T01:00:00Z', ciudad: 'Kansas City'       },
  { id: 'elim2_1',  ronda: 'semi',  fechaUTC: '2026-07-14T19:00:00Z', ciudad: 'Arlington'         },
  { id: 'elim2_2',  ronda: 'semi',  fechaUTC: '2026-07-15T19:00:00Z', ciudad: 'Atlanta'           },
  { id: 'elim34',   ronda: '3er',   fechaUTC: '2026-07-18T21:00:00Z', ciudad: 'Miami Gardens'     },
  { id: 'elimfin',  ronda: 'final', fechaUTC: '2026-07-19T19:00:00Z', ciudad: 'East Rutherford'   },
];

// ── Array plano — útil para búsquedas por id ─────────────────
export const PARTIDOS_ELIM = [...PARTIDOS_ELIM_R32, ...PARTIDOS_ELIM_REST];

export function getPartidoElimPorId(id) {
  return PARTIDOS_ELIM.find(p => p.id === id) || null;
}
