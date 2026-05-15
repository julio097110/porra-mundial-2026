// ============================================================
//  data/partidos.js
//  72 partidos de la fase de grupos — Mundial 2026
//  Fuente: calendario oficial FIFA (diciembre 2025)
//  Fechas en UTC · Horas mostradas en hora local del usuario
//
//  Estructura de cada partido:
//  {
//    id:        string único  "A1", "B2"...
//    fase:      "grupos"
//    grupo:     "A" ... "L"
//    jornada:   1 | 2 | 3
//    local:     nombre del equipo local
//    visitante: nombre del equipo visitante
//    flagLocal:     emoji bandera
//    flagVisitante: emoji bandera
//    fechaUTC:  ISO 8601 string en UTC
//    sede:      nombre del estadio
//    ciudad:    ciudad
//    pais:      país sede
//  }
// ============================================================

export const PARTIDOS_GRUPOS = [

  // ══════════════════════════════════════════════════════
  //  GRUPO A: México · Corea del Sur · Sudáfrica · Chequia
  // ══════════════════════════════════════════════════════
  {
    id: "A1", fase: "grupos", grupo: "A", jornada: 1,
    local: "México",        flagLocal: "🇲🇽",
    visitante: "Sudáfrica", flagVisitante: "🇿🇦",
    fechaUTC: "2026-06-11T20:00:00Z",
    sede: "Estadio Azteca", ciudad: "Ciudad de México", pais: "México"
  },
  {
    id: "A2", fase: "grupos", grupo: "A", jornada: 1,
    local: "Corea del Sur", flagLocal: "🇰🇷",
    visitante: "Chequia",   flagVisitante: "🇨🇿",
    fechaUTC: "2026-06-12T03:00:00Z",
    sede: "Estadio Akron", ciudad: "Zapopan", pais: "México"
  },
  {
    id: "A3", fase: "grupos", grupo: "A", jornada: 2,
    local: "Chequia",       flagLocal: "🇨🇿",
    visitante: "Sudáfrica", flagVisitante: "🇿🇦",
    fechaUTC: "2026-06-18T17:00:00Z",
    sede: "Mercedes-Benz Stadium", ciudad: "Atlanta", pais: "EEUU"
  },
  {
    id: "A4", fase: "grupos", grupo: "A", jornada: 2,
    local: "México",          flagLocal: "🇲🇽",
    visitante: "Corea del Sur", flagVisitante: "🇰🇷",
    fechaUTC: "2026-06-19T02:00:00Z",
    sede: "Estadio Akron", ciudad: "Zapopan", pais: "México"
  },
  {
    id: "A5", fase: "grupos", grupo: "A", jornada: 3,
    local: "Chequia",   flagLocal: "🇨🇿",
    visitante: "México", flagVisitante: "🇲🇽",
    fechaUTC: "2026-06-25T02:00:00Z",
    sede: "Estadio Azteca", ciudad: "Ciudad de México", pais: "México"
  },
  {
    id: "A6", fase: "grupos", grupo: "A", jornada: 3,
    local: "Sudáfrica",       flagLocal: "🇿🇦",
    visitante: "Corea del Sur", flagVisitante: "🇰🇷",
    fechaUTC: "2026-06-25T02:00:00Z",
    sede: "Estadio BBVA", ciudad: "Monterrey", pais: "México"
  },

  // ══════════════════════════════════════════════════════
  //  GRUPO B: Canadá · Bosnia y Herzegovina · Qatar · Suiza
  // ══════════════════════════════════════════════════════
  {
    id: "B1", fase: "grupos", grupo: "B", jornada: 1,
    local: "Canadá",              flagLocal: "🇨🇦",
    visitante: "Bosnia y Herzegovina", flagVisitante: "🇧🇦",
    fechaUTC: "2026-06-12T20:00:00Z",
    sede: "BMO Field", ciudad: "Toronto", pais: "Canadá"
  },
  {
    id: "B2", fase: "grupos", grupo: "B", jornada: 1,
    local: "Qatar",   flagLocal: "🇶🇦",
    visitante: "Suiza", flagVisitante: "🇨🇭",
    fechaUTC: "2026-06-13T20:00:00Z",
    sede: "Levi's Stadium", ciudad: "Santa Clara", pais: "EEUU"
  },
  {
    id: "B3", fase: "grupos", grupo: "B", jornada: 2,
    local: "Suiza",               flagLocal: "🇨🇭",
    visitante: "Bosnia y Herzegovina", flagVisitante: "🇧🇦",
    fechaUTC: "2026-06-18T20:00:00Z",
    sede: "SoFi Stadium", ciudad: "Inglewood", pais: "EEUU"
  },
  {
    id: "B4", fase: "grupos", grupo: "B", jornada: 2,
    local: "Canadá", flagLocal: "🇨🇦",
    visitante: "Qatar", flagVisitante: "🇶🇦",
    fechaUTC: "2026-06-18T23:00:00Z",
    sede: "BC Place", ciudad: "Vancouver", pais: "Canadá"
  },
  {
    id: "B5", fase: "grupos", grupo: "B", jornada: 3,
    local: "Suiza",   flagLocal: "🇨🇭",
    visitante: "Canadá", flagVisitante: "🇨🇦",
    fechaUTC: "2026-06-24T20:00:00Z",
    sede: "BC Place", ciudad: "Vancouver", pais: "Canadá"
  },
  {
    id: "B6", fase: "grupos", grupo: "B", jornada: 3,
    local: "Bosnia y Herzegovina", flagLocal: "🇧🇦",
    visitante: "Qatar",            flagVisitante: "🇶🇦",
    fechaUTC: "2026-06-24T20:00:00Z",
    sede: "Lumen Field", ciudad: "Seattle", pais: "EEUU"
  },

  // ══════════════════════════════════════════════════════
  //  GRUPO C: Brasil · Marruecos · Haití · Escocia
  // ══════════════════════════════════════════════════════
  {
    id: "C1", fase: "grupos", grupo: "C", jornada: 1,
    local: "Brasil",    flagLocal: "🇧🇷",
    visitante: "Marruecos", flagVisitante: "🇲🇦",
    fechaUTC: "2026-06-13T23:00:00Z",
    sede: "MetLife Stadium", ciudad: "East Rutherford", pais: "EEUU"
  },
  {
    id: "C2", fase: "grupos", grupo: "C", jornada: 1,
    local: "Haití",    flagLocal: "🇭🇹",
    visitante: "Escocia", flagVisitante: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    fechaUTC: "2026-06-14T02:00:00Z",
    sede: "Gillette Stadium", ciudad: "Foxborough", pais: "EEUU"
  },
  {
    id: "C3", fase: "grupos", grupo: "C", jornada: 2,
    local: "Escocia",   flagLocal: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    visitante: "Marruecos", flagVisitante: "🇲🇦",
    fechaUTC: "2026-06-19T23:00:00Z",
    sede: "Gillette Stadium", ciudad: "Foxborough", pais: "EEUU"
  },
  {
    id: "C4", fase: "grupos", grupo: "C", jornada: 2,
    local: "Brasil",  flagLocal: "🇧🇷",
    visitante: "Haití", flagVisitante: "🇭🇹",
    fechaUTC: "2026-06-20T01:30:00Z",
    sede: "Lincoln Financial Field", ciudad: "Filadelfia", pais: "EEUU"
  },
  {
    id: "C5", fase: "grupos", grupo: "C", jornada: 3,
    local: "Escocia",  flagLocal: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    visitante: "Brasil", flagVisitante: "🇧🇷",
    fechaUTC: "2026-06-24T23:00:00Z",
    sede: "Hard Rock Stadium", ciudad: "Miami Gardens", pais: "EEUU"
  },
  {
    id: "C6", fase: "grupos", grupo: "C", jornada: 3,
    local: "Marruecos", flagLocal: "🇲🇦",
    visitante: "Haití", flagVisitante: "🇭🇹",
    fechaUTC: "2026-06-24T23:00:00Z",
    sede: "Mercedes-Benz Stadium", ciudad: "Atlanta", pais: "EEUU"
  },

  // ══════════════════════════════════════════════════════
  //  GRUPO D: EEUU · Paraguay · Australia · Türkiye
  // ══════════════════════════════════════════════════════
  {
    id: "D1", fase: "grupos", grupo: "D", jornada: 1,
    local: "EEUU",    flagLocal: "🇺🇸",
    visitante: "Paraguay", flagVisitante: "🇵🇾",
    fechaUTC: "2026-06-13T02:00:00Z",
    sede: "SoFi Stadium", ciudad: "Inglewood", pais: "EEUU"
  },
  {
    id: "D2", fase: "grupos", grupo: "D", jornada: 1,
    local: "Australia", flagLocal: "🇦🇺",
    visitante: "Türkiye", flagVisitante: "🇹🇷",
    fechaUTC: "2026-06-14T19:00:00Z",
    sede: "BC Place", ciudad: "Vancouver", pais: "Canadá"
  },
  {
    id: "D3", fase: "grupos", grupo: "D", jornada: 2,
    local: "EEUU",      flagLocal: "🇺🇸",
    visitante: "Australia", flagVisitante: "🇦🇺",
    fechaUTC: "2026-06-19T20:00:00Z",
    sede: "Lumen Field", ciudad: "Seattle", pais: "EEUU"
  },
  {
    id: "D4", fase: "grupos", grupo: "D", jornada: 2,
    local: "Türkiye",   flagLocal: "🇹🇷",
    visitante: "Paraguay", flagVisitante: "🇵🇾",
    fechaUTC: "2026-06-20T04:00:00Z",
    sede: "Levi's Stadium", ciudad: "Santa Clara", pais: "EEUU"
  },
  {
    id: "D5", fase: "grupos", grupo: "D", jornada: 3,
    local: "Türkiye", flagLocal: "🇹🇷",
    visitante: "EEUU",  flagVisitante: "🇺🇸",
    fechaUTC: "2026-06-26T03:00:00Z",
    sede: "SoFi Stadium", ciudad: "Inglewood", pais: "EEUU"
  },
  {
    id: "D6", fase: "grupos", grupo: "D", jornada: 3,
    local: "Paraguay",  flagLocal: "🇵🇾",
    visitante: "Australia", flagVisitante: "🇦🇺",
    fechaUTC: "2026-06-26T03:00:00Z",
    sede: "Levi's Stadium", ciudad: "Santa Clara", pais: "EEUU"
  },

  // ══════════════════════════════════════════════════════
  //  GRUPO E: Alemania · Curazao · Costa de Marfil · Ecuador
  // ══════════════════════════════════════════════════════
  {
    id: "E1", fase: "grupos", grupo: "E", jornada: 1,
    local: "Alemania", flagLocal: "🇩🇪",
    visitante: "Curazao", flagVisitante: "🇨🇼",
    fechaUTC: "2026-06-14T18:00:00Z",
    sede: "NRG Stadium", ciudad: "Houston", pais: "EEUU"
  },
  {
    id: "E2", fase: "grupos", grupo: "E", jornada: 1,
    local: "Costa de Marfil", flagLocal: "🇨🇮",
    visitante: "Ecuador",     flagVisitante: "🇪🇨",
    fechaUTC: "2026-06-15T00:00:00Z",
    sede: "Lincoln Financial Field", ciudad: "Filadelfia", pais: "EEUU"
  },
  {
    id: "E3", fase: "grupos", grupo: "E", jornada: 2,
    local: "Alemania",        flagLocal: "🇩🇪",
    visitante: "Costa de Marfil", flagVisitante: "🇨🇮",
    fechaUTC: "2026-06-20T21:00:00Z",
    sede: "BMO Field", ciudad: "Toronto", pais: "Canadá"
  },
  {
    id: "E4", fase: "grupos", grupo: "E", jornada: 2,
    local: "Ecuador",   flagLocal: "🇪🇨",
    visitante: "Curazao", flagVisitante: "🇨🇼",
    fechaUTC: "2026-06-21T01:00:00Z",
    sede: "Arrowhead Stadium", ciudad: "Kansas City", pais: "EEUU"
  },
  {
    id: "E5", fase: "grupos", grupo: "E", jornada: 3,
    local: "Curazao",   flagLocal: "🇨🇼",
    visitante: "Costa de Marfil", flagVisitante: "🇨🇮",
    fechaUTC: "2026-06-25T21:00:00Z",
    sede: "Lincoln Financial Field", ciudad: "Filadelfia", pais: "EEUU"
  },
  {
    id: "E6", fase: "grupos", grupo: "E", jornada: 3,
    local: "Ecuador",   flagLocal: "🇪🇨",
    visitante: "Alemania", flagVisitante: "🇩🇪",
    fechaUTC: "2026-06-25T21:00:00Z",
    sede: "MetLife Stadium", ciudad: "East Rutherford", pais: "EEUU"
  },

  // ══════════════════════════════════════════════════════
  //  GRUPO F: Países Bajos · Japón · Suecia · Túnez
  // ══════════════════════════════════════════════════════
  {
    id: "F1", fase: "grupos", grupo: "F", jornada: 1,
    local: "Países Bajos", flagLocal: "🇳🇱",
    visitante: "Japón",    flagVisitante: "🇯🇵",
    fechaUTC: "2026-06-14T21:00:00Z",
    sede: "AT&T Stadium", ciudad: "Arlington", pais: "EEUU"
  },
  {
    id: "F2", fase: "grupos", grupo: "F", jornada: 1,
    local: "Suecia",  flagLocal: "🇸🇪",
    visitante: "Túnez", flagVisitante: "🇹🇳",
    fechaUTC: "2026-06-15T03:00:00Z",
    sede: "Estadio BBVA", ciudad: "Monterrey", pais: "México"
  },
  {
    id: "F3", fase: "grupos", grupo: "F", jornada: 2,
    local: "Países Bajos", flagLocal: "🇳🇱",
    visitante: "Suecia",   flagVisitante: "🇸🇪",
    fechaUTC: "2026-06-20T18:00:00Z",
    sede: "NRG Stadium", ciudad: "Houston", pais: "EEUU"
  },
  {
    id: "F4", fase: "grupos", grupo: "F", jornada: 2,
    local: "Túnez",  flagLocal: "🇹🇳",
    visitante: "Japón", flagVisitante: "🇯🇵",
    fechaUTC: "2026-06-21T05:00:00Z",
    sede: "Estadio BBVA", ciudad: "Monterrey", pais: "México"
  },
  {
    id: "F5", fase: "grupos", grupo: "F", jornada: 3,
    local: "Japón",   flagLocal: "🇯🇵",
    visitante: "Suecia", flagVisitante: "🇸🇪",
    fechaUTC: "2026-06-26T00:00:00Z",
    sede: "AT&T Stadium", ciudad: "Arlington", pais: "EEUU"
  },
  {
    id: "F6", fase: "grupos", grupo: "F", jornada: 3,
    local: "Túnez",         flagLocal: "🇹🇳",
    visitante: "Países Bajos", flagVisitante: "🇳🇱",
    fechaUTC: "2026-06-26T00:00:00Z",
    sede: "Arrowhead Stadium", ciudad: "Kansas City", pais: "EEUU"
  },

  // ══════════════════════════════════════════════════════
  //  GRUPO G: Bélgica · Egipto · Irán · Nueva Zelanda
  // ══════════════════════════════════════════════════════
  {
    id: "G1", fase: "grupos", grupo: "G", jornada: 1,
    local: "Bélgica", flagLocal: "🇧🇪",
    visitante: "Egipto", flagVisitante: "🇪🇬",
    fechaUTC: "2026-06-15T20:00:00Z",
    sede: "Lumen Field", ciudad: "Seattle", pais: "EEUU"
  },
  {
    id: "G2", fase: "grupos", grupo: "G", jornada: 1,
    local: "Irán",          flagLocal: "🇮🇷",
    visitante: "Nueva Zelanda", flagVisitante: "🇳🇿",
    fechaUTC: "2026-06-16T02:00:00Z",
    sede: "SoFi Stadium", ciudad: "Inglewood", pais: "EEUU"
  },
  {
    id: "G3", fase: "grupos", grupo: "G", jornada: 2,
    local: "Bélgica", flagLocal: "🇧🇪",
    visitante: "Irán",   flagVisitante: "🇮🇷",
    fechaUTC: "2026-06-21T20:00:00Z",
    sede: "SoFi Stadium", ciudad: "Inglewood", pais: "EEUU"
  },
  {
    id: "G4", fase: "grupos", grupo: "G", jornada: 2,
    local: "Nueva Zelanda", flagLocal: "🇳🇿",
    visitante: "Egipto",    flagVisitante: "🇪🇬",
    fechaUTC: "2026-06-22T02:00:00Z",
    sede: "BC Place", ciudad: "Vancouver", pais: "Canadá"
  },
  {
    id: "G5", fase: "grupos", grupo: "G", jornada: 3,
    local: "Egipto",  flagLocal: "🇪🇬",
    visitante: "Irán",  flagVisitante: "🇮🇷",
    fechaUTC: "2026-06-27T04:00:00Z",
    sede: "Lumen Field", ciudad: "Seattle", pais: "EEUU"
  },
  {
    id: "G6", fase: "grupos", grupo: "G", jornada: 3,
    local: "Nueva Zelanda", flagLocal: "🇳🇿",
    visitante: "Bélgica",   flagVisitante: "🇧🇪",
    fechaUTC: "2026-06-27T04:00:00Z",
    sede: "BC Place", ciudad: "Vancouver", pais: "Canadá"
  },

  // ══════════════════════════════════════════════════════
  //  GRUPO H: España · Cabo Verde · Arabia Saudí · Uruguay
  // ══════════════════════════════════════════════════════
  {
    id: "H1", fase: "grupos", grupo: "H", jornada: 1,
    local: "España",     flagLocal: "🇪🇸",
    visitante: "Cabo Verde", flagVisitante: "🇨🇻",
    fechaUTC: "2026-06-15T17:00:00Z",
    sede: "Mercedes-Benz Stadium", ciudad: "Atlanta", pais: "EEUU"
  },
  {
    id: "H2", fase: "grupos", grupo: "H", jornada: 1,
    local: "Arabia Saudí", flagLocal: "🇸🇦",
    visitante: "Uruguay",  flagVisitante: "🇺🇾",
    fechaUTC: "2026-06-15T23:00:00Z",
    sede: "Hard Rock Stadium", ciudad: "Miami Gardens", pais: "EEUU"
  },
  {
    id: "H3", fase: "grupos", grupo: "H", jornada: 2,
    local: "España",       flagLocal: "🇪🇸",
    visitante: "Arabia Saudí", flagVisitante: "🇸🇦",
    fechaUTC: "2026-06-21T17:00:00Z",
    sede: "Mercedes-Benz Stadium", ciudad: "Atlanta", pais: "EEUU"
  },
  {
    id: "H4", fase: "grupos", grupo: "H", jornada: 2,
    local: "Uruguay",    flagLocal: "🇺🇾",
    visitante: "Cabo Verde", flagVisitante: "🇨🇻",
    fechaUTC: "2026-06-21T23:00:00Z",
    sede: "Hard Rock Stadium", ciudad: "Miami Gardens", pais: "EEUU"
  },
  {
    id: "H5", fase: "grupos", grupo: "H", jornada: 3,
    local: "Cabo Verde",    flagLocal: "🇨🇻",
    visitante: "Arabia Saudí", flagVisitante: "🇸🇦",
    fechaUTC: "2026-06-27T01:00:00Z",
    sede: "NRG Stadium", ciudad: "Houston", pais: "EEUU"
  },
  {
    id: "H6", fase: "grupos", grupo: "H", jornada: 3,
    local: "Uruguay",  flagLocal: "🇺🇾",
    visitante: "España", flagVisitante: "🇪🇸",
    fechaUTC: "2026-06-27T01:00:00Z",
    sede: "Estadio Akron", ciudad: "Zapopan", pais: "México"
  },

  // ══════════════════════════════════════════════════════
  //  GRUPO I: Francia · Senegal · Irak · Noruega
  // ══════════════════════════════════════════════════════
  {
    id: "I1", fase: "grupos", grupo: "I", jornada: 1,
    local: "Francia",  flagLocal: "🇫🇷",
    visitante: "Senegal", flagVisitante: "🇸🇳",
    fechaUTC: "2026-06-16T20:00:00Z",
    sede: "MetLife Stadium", ciudad: "East Rutherford", pais: "EEUU"
  },
  {
    id: "I2", fase: "grupos", grupo: "I", jornada: 1,
    local: "Irak",    flagLocal: "🇮🇶",
    visitante: "Noruega", flagVisitante: "🇳🇴",
    fechaUTC: "2026-06-16T23:00:00Z",
    sede: "Gillette Stadium", ciudad: "Foxborough", pais: "EEUU"
  },
  {
    id: "I3", fase: "grupos", grupo: "I", jornada: 2,
    local: "Francia",  flagLocal: "🇫🇷",
    visitante: "Irak",   flagVisitante: "🇮🇶",
    fechaUTC: "2026-06-22T22:00:00Z",
    sede: "Lincoln Financial Field", ciudad: "Filadelfia", pais: "EEUU"
  },
  {
    id: "I4", fase: "grupos", grupo: "I", jornada: 2,
    local: "Noruega",  flagLocal: "🇳🇴",
    visitante: "Senegal", flagVisitante: "🇸🇳",
    fechaUTC: "2026-06-23T01:00:00Z",
    sede: "MetLife Stadium", ciudad: "East Rutherford", pais: "EEUU"
  },
  {
    id: "I5", fase: "grupos", grupo: "I", jornada: 3,
    local: "Noruega",  flagLocal: "🇳🇴",
    visitante: "Francia", flagVisitante: "🇫🇷",
    fechaUTC: "2026-06-26T20:00:00Z",
    sede: "Gillette Stadium", ciudad: "Foxborough", pais: "EEUU"
  },
  {
    id: "I6", fase: "grupos", grupo: "I", jornada: 3,
    local: "Senegal",  flagLocal: "🇸🇳",
    visitante: "Irak",   flagVisitante: "🇮🇶",
    fechaUTC: "2026-06-26T20:00:00Z",
    sede: "BMO Field", ciudad: "Toronto", pais: "Canadá"
  },

  // ══════════════════════════════════════════════════════
  //  GRUPO J: Argentina · Argelia · Austria · Jordania
  // ══════════════════════════════════════════════════════
  {
    id: "J1", fase: "grupos", grupo: "J", jornada: 1,
    local: "Argentina", flagLocal: "🇦🇷",
    visitante: "Argelia",  flagVisitante: "🇩🇿",
    fechaUTC: "2026-06-17T02:00:00Z",
    sede: "Arrowhead Stadium", ciudad: "Kansas City", pais: "EEUU"
  },
  {
    id: "J2", fase: "grupos", grupo: "J", jornada: 1,
    local: "Austria",  flagLocal: "🇦🇹",
    visitante: "Jordania", flagVisitante: "🇯🇴",
    fechaUTC: "2026-06-17T05:00:00Z",
    sede: "Levi's Stadium", ciudad: "Santa Clara", pais: "EEUU"
  },
  {
    id: "J3", fase: "grupos", grupo: "J", jornada: 2,
    local: "Argentina", flagLocal: "🇦🇷",
    visitante: "Austria",  flagVisitante: "🇦🇹",
    fechaUTC: "2026-06-22T18:00:00Z",
    sede: "AT&T Stadium", ciudad: "Arlington", pais: "EEUU"
  },
  {
    id: "J4", fase: "grupos", grupo: "J", jornada: 2,
    local: "Jordania",  flagLocal: "🇯🇴",
    visitante: "Argelia", flagVisitante: "🇩🇿",
    fechaUTC: "2026-06-23T04:00:00Z",
    sede: "Levi's Stadium", ciudad: "Santa Clara", pais: "EEUU"
  },
  {
    id: "J5", fase: "grupos", grupo: "J", jornada: 3,
    local: "Argelia",  flagLocal: "🇩🇿",
    visitante: "Austria", flagVisitante: "🇦🇹",
    fechaUTC: "2026-06-28T03:00:00Z",
    sede: "Arrowhead Stadium", ciudad: "Kansas City", pais: "EEUU"
  },
  {
    id: "J6", fase: "grupos", grupo: "J", jornada: 3,
    local: "Jordania",  flagLocal: "🇯🇴",
    visitante: "Argentina", flagVisitante: "🇦🇷",
    fechaUTC: "2026-06-28T03:00:00Z",
    sede: "AT&T Stadium", ciudad: "Arlington", pais: "EEUU"
  },

  // ══════════════════════════════════════════════════════
  //  GRUPO K: Portugal · RD Congo · Uzbekistán · Colombia
  // ══════════════════════════════════════════════════════
  {
    id: "K1", fase: "grupos", grupo: "K", jornada: 1,
    local: "Portugal",  flagLocal: "🇵🇹",
    visitante: "RD Congo", flagVisitante: "🇨🇩",
    fechaUTC: "2026-06-17T18:00:00Z",
    sede: "NRG Stadium", ciudad: "Houston", pais: "EEUU"
  },
  {
    id: "K2", fase: "grupos", grupo: "K", jornada: 1,
    local: "Uzbekistán", flagLocal: "🇺🇿",
    visitante: "Colombia", flagVisitante: "🇨🇴",
    fechaUTC: "2026-06-18T03:00:00Z",
    sede: "Estadio Azteca", ciudad: "Ciudad de México", pais: "México"
  },
  {
    id: "K3", fase: "grupos", grupo: "K", jornada: 2,
    local: "Portugal",    flagLocal: "🇵🇹",
    visitante: "Uzbekistán", flagVisitante: "🇺🇿",
    fechaUTC: "2026-06-23T18:00:00Z",
    sede: "NRG Stadium", ciudad: "Houston", pais: "EEUU"
  },
  {
    id: "K4", fase: "grupos", grupo: "K", jornada: 2,
    local: "Colombia",  flagLocal: "🇨🇴",
    visitante: "RD Congo", flagVisitante: "🇨🇩",
    fechaUTC: "2026-06-24T03:00:00Z",
    sede: "Estadio Akron", ciudad: "Zapopan", pais: "México"
  },
  {
    id: "K5", fase: "grupos", grupo: "K", jornada: 3,
    local: "Colombia",  flagLocal: "🇨🇴",
    visitante: "Portugal", flagVisitante: "🇵🇹",
    fechaUTC: "2026-06-28T00:30:00Z",
    sede: "Hard Rock Stadium", ciudad: "Miami Gardens", pais: "EEUU"
  },
  {
    id: "K6", fase: "grupos", grupo: "K", jornada: 3,
    local: "RD Congo",    flagLocal: "🇨🇩",
    visitante: "Uzbekistán", flagVisitante: "🇺🇿",
    fechaUTC: "2026-06-28T00:30:00Z",
    sede: "Mercedes-Benz Stadium", ciudad: "Atlanta", pais: "EEUU"
  },

  // ══════════════════════════════════════════════════════
  //  GRUPO L: Inglaterra · Croacia · Ghana · Panamá
  // ══════════════════════════════════════════════════════
  {
    id: "L1", fase: "grupos", grupo: "L", jornada: 1,
    local: "Inglaterra", flagLocal: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    visitante: "Croacia",  flagVisitante: "🇭🇷",
    fechaUTC: "2026-06-17T21:00:00Z",
    sede: "AT&T Stadium", ciudad: "Arlington", pais: "EEUU"
  },
  {
    id: "L2", fase: "grupos", grupo: "L", jornada: 1,
    local: "Ghana",   flagLocal: "🇬🇭",
    visitante: "Panamá", flagVisitante: "🇵🇦",
    fechaUTC: "2026-06-18T00:00:00Z",
    sede: "BMO Field", ciudad: "Toronto", pais: "Canadá"
  },
  {
    id: "L3", fase: "grupos", grupo: "L", jornada: 2,
    local: "Inglaterra", flagLocal: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    visitante: "Ghana",    flagVisitante: "🇬🇭",
    fechaUTC: "2026-06-23T21:00:00Z",
    sede: "Gillette Stadium", ciudad: "Foxborough", pais: "EEUU"
  },
  {
    id: "L4", fase: "grupos", grupo: "L", jornada: 2,
    local: "Panamá",   flagLocal: "🇵🇦",
    visitante: "Croacia", flagVisitante: "🇭🇷",
    fechaUTC: "2026-06-24T00:00:00Z",
    sede: "BMO Field", ciudad: "Toronto", pais: "Canadá"
  },
  {
    id: "L5", fase: "grupos", grupo: "L", jornada: 3,
    local: "Panamá",      flagLocal: "🇵🇦",
    visitante: "Inglaterra", flagVisitante: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    fechaUTC: "2026-06-27T22:00:00Z",
    sede: "MetLife Stadium", ciudad: "East Rutherford", pais: "EEUU"
  },
  {
    id: "L6", fase: "grupos", grupo: "L", jornada: 3,
    local: "Croacia",  flagLocal: "🇭🇷",
    visitante: "Ghana",  flagVisitante: "🇬🇭",
    fechaUTC: "2026-06-27T22:00:00Z",
    sede: "Lincoln Financial Field", ciudad: "Filadelfia", pais: "EEUU"
  }

];

// ── Helpers ─────────────────────────────────────────────────

/** Devuelve todos los partidos de un grupo ordenados por jornada */
export function getPartidosPorGrupo(grupo) {
  return PARTIDOS_GRUPOS
    .filter(p => p.grupo === grupo)
    .sort((a, b) => a.jornada - b.jornada);
}

/** Devuelve los partidos de una jornada concreta */
export function getPartidosPorJornada(grupo, jornada) {
  return PARTIDOS_GRUPOS.filter(p => p.grupo === grupo && p.jornada === jornada);
}

/** Devuelve un partido por su id */
export function getPartidoPorId(id) {
  return PARTIDOS_GRUPOS.find(p => p.id === id) || null;
}

/** Lista de todos los grupos */
export const GRUPOS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

/** Lista de los 48 equipos para autocompletado */
export const EQUIPOS_48 = [
  { nombre: "México",           flag: "🇲🇽" },
  { nombre: "Sudáfrica",        flag: "🇿🇦" },
  { nombre: "Corea del Sur",    flag: "🇰🇷" },
  { nombre: "Chequia",          flag: "🇨🇿" },
  { nombre: "Canadá",           flag: "🇨🇦" },
  { nombre: "Bosnia y Herzegovina", flag: "🇧🇦" },
  { nombre: "Qatar",            flag: "🇶🇦" },
  { nombre: "Suiza",            flag: "🇨🇭" },
  { nombre: "Brasil",           flag: "🇧🇷" },
  { nombre: "Marruecos",        flag: "🇲🇦" },
  { nombre: "Haití",            flag: "🇭🇹" },
  { nombre: "Escocia",          flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  { nombre: "EEUU",             flag: "🇺🇸" },
  { nombre: "Paraguay",         flag: "🇵🇾" },
  { nombre: "Australia",        flag: "🇦🇺" },
  { nombre: "Türkiye",          flag: "🇹🇷" },
  { nombre: "Alemania",         flag: "🇩🇪" },
  { nombre: "Curazao",          flag: "🇨🇼" },
  { nombre: "Costa de Marfil",  flag: "🇨🇮" },
  { nombre: "Ecuador",          flag: "🇪🇨" },
  { nombre: "Países Bajos",     flag: "🇳🇱" },
  { nombre: "Japón",            flag: "🇯🇵" },
  { nombre: "Suecia",           flag: "🇸🇪" },
  { nombre: "Túnez",            flag: "🇹🇳" },
  { nombre: "Bélgica",          flag: "🇧🇪" },
  { nombre: "Egipto",           flag: "🇪🇬" },
  { nombre: "Irán",             flag: "🇮🇷" },
  { nombre: "Nueva Zelanda",    flag: "🇳🇿" },
  { nombre: "España",           flag: "🇪🇸" },
  { nombre: "Cabo Verde",       flag: "🇨🇻" },
  { nombre: "Arabia Saudí",     flag: "🇸🇦" },
  { nombre: "Uruguay",          flag: "🇺🇾" },
  { nombre: "Francia",          flag: "🇫🇷" },
  { nombre: "Senegal",          flag: "🇸🇳" },
  { nombre: "Irak",             flag: "🇮🇶" },
  { nombre: "Noruega",          flag: "🇳🇴" },
  { nombre: "Argentina",        flag: "🇦🇷" },
  { nombre: "Argelia",          flag: "🇩🇿" },
  { nombre: "Austria",          flag: "🇦🇹" },
  { nombre: "Jordania",         flag: "🇯🇴" },
  { nombre: "Portugal",         flag: "🇵🇹" },
  { nombre: "RD Congo",         flag: "🇨🇩" },
  { nombre: "Uzbekistán",       flag: "🇺🇿" },
  { nombre: "Colombia",         flag: "🇨🇴" },
  { nombre: "Inglaterra",       flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { nombre: "Croacia",          flag: "🇭🇷" },
  { nombre: "Ghana",            flag: "🇬🇭" },
  { nombre: "Panamá",           flag: "🇵🇦" }
];
