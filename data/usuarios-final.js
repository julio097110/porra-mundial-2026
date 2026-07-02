// ============================================================
//  data/usuarios-final.js
//  Jugadores de la porra — Mundial 2026 (LISTA CERRADA)
//
//  Snapshot estático de la colección Firestore 'usuarios',
//  generado el 2026-07-02 a partir de un export real (9
//  jugadores, todos con pagado=true). No se esperan altas,
//  bajas ni cambios de pago.
//
//  ⚠️ Usado SOLO en vistas de solo lectura (clasificación,
//  informe/desglose). El panel de admin (admin.js) y el login
//  (auth.js) siguen leyendo Firestore en vivo — si cambias algo
//  ahí (nombre, pago...), este archivo queda desactualizado
//  hasta que se regenere manualmente y se vuelva a desplegar.
//
//  La colección 'usuarios' en Firestore NO se ha tocado ni se
//  borra — sigue siendo la fuente para escritura/edición.
// ============================================================

export const USUARIOS_FINAL = {
  "28JpyVXGiegXFDoVCYkBaSIgIR52": {
    "nombre_visible_lower": "przemek",
    "rol": "jugador",
    "nombre_visible": "Przemek",
    "creado_en": { seconds: 1781011615, nanoseconds: 652000000 },
    "pagado": true,
    "username": "przemek",
    "idioma": "en",
    "email": "przemek@porra.es"
  },
  "3NmFBAWtNcWvtEv9rfSDrkxETM03": {
    "idioma": "es",
    "username": "admin",
    "email": "pool2026mundial@gmail.com",
    "pagado": true,
    "nombre_visible": "Julio S.",
    "sugerencias": 3,
    "rol": "admin",
    "nombre_visible_lower": "julio s."
  },
  "FO98Ou7O56dJpiO1vlYSFhLLu9y2": {
    "rol": "jugador",
    "nombre_visible_lower": "lluis",
    "mimimi": true,
    "sugerencias": 4,
    "creado_en": { seconds: 1778843092, nanoseconds: 745000000 },
    "username": "lluis",
    "idioma": "en",
    "email": "lluis@porra.es",
    "nombre_visible": "Lluis",
    "pagado": true
  },
  "RdRDv0KSlKYCUyvgfAcZ0P4hLPR2": {
    "rol": "jugador",
    "nombre_visible_lower": "francisco",
    "nombre_visible": "Francisco",
    "creado_en": { seconds: 1781075262, nanoseconds: 846000000 },
    "pagado": true,
    "username": "francisco",
    "idioma": "es",
    "email": "francisco@porra.es"
  },
  "TThXb0jxDTd64yO0qvJxiTLlkSL2": {
    "nombre_visible": "Eva F",
    "creado_en": { seconds: 1779271478, nanoseconds: 849000000 },
    "nombre_visible_lower": "eva f",
    "rol": "jugador",
    "idioma": "es",
    "username": "evaf",
    "email": "eva@porra.es",
    "pagado": true
  },
  "Z8aUc8Rlk0fHEkisWw5BgLsXV2r2": {
    "pagado": true,
    "nombre_visible": "Miguel A",
    "idioma": "es",
    "username": "miguelangel",
    "email": "miguelangel@porra.es",
    "nombre_visible_lower": "miguel a",
    "mimimi": false,
    "rol": "jugador",
    "creado_en": { seconds: 1778841824, nanoseconds: 877000000 }
  },
  "f8wHQ6nEBLSRSdvtl6qjXF2sxlF2": {
    "email": "nuria@porra.es",
    "username": "nuria",
    "idioma": "es",
    "pagado": true,
    "nombre_visible": "Nuria",
    "creado_en": { seconds: 1778842968, nanoseconds: 521000000 },
    "rol": "jugador",
    "nombre_visible_lower": "nuria"
  },
  "sgNnPPVZCpdt1YilUrvoSgio7572": {
    "creado_en": { seconds: 1779879557, nanoseconds: 20000000 },
    "rol": "jugador",
    "nombre_visible_lower": "antonio m",
    "idioma": "es",
    "username": "antonio_m",
    "email": "antonio@porra.es",
    "nombre_visible": "Antonio M",
    "pagado": true,
    "rezagado_elim": {
      "activo": false,
      "motivo": ""
    }
  },
  "ugKblr2SkgfSwV5DY6HqeSNIwyj2": {
    "rol": "jugador",
    "nombre_visible_lower": "klaudia",
    "nombre_visible": "Klaudia",
    "creado_en": { seconds: 1781027234, nanoseconds: 861000000 },
    "pagado": true,
    "idioma": "en",
    "username": "klaudia",
    "email": "klaudia@porra.es"
  }
};
