/**
 * Une réponse `/table` **réelle**, enregistrée le 2026-09-29 contre l'image
 * locale d'`osrm-backend` v5.27.1 et la carte de la Savoie préparée par
 * `apps/lfd-osrm/scripts/build-graph.sh` :
 *
 *   GET /table/v1/driving/6.9797,45.4486;6.7713,45.5724;6.6327,45.4130
 *       ?annotations=duration,distance
 *
 * Val d'Isère → Arc 1800 → Courchevel 1850. Seuls les `hint` (opaques, longs,
 * inutilisés) sont retirés. La matrice est ASYMÉTRIQUE : Arc 1800 → Courchevel
 * (4378,1 s) n'est pas Courchevel → Arc 1800 (4396,9 s).
 */
export const OSRM_TABLE_SAVOIE = {
  code: "Ok",
  distances: [
    [0, 41923.5, 83708.7],
    [41798.2, 0, 63860.1],
    [83661.7, 63345.3, 0],
  ],
  durations: [
    [0, 3052, 6085.6],
    [3023.3, 0, 4378.1],
    [6065.6, 4396.9, 0],
  ],
  sources: [
    { distance: 2.514221482, name: "Rue des Téléphériques", location: [6.979732, 45.448598] },
    { distance: 72.354456252, name: "Route de la Petite Chal", location: [6.770996, 45.573015] },
    { distance: 10.808957822, name: "", location: [6.63271, 45.413097] },
  ],
  destinations: [
    { distance: 2.514221482, name: "Rue des Téléphériques", location: [6.979732, 45.448598] },
    { distance: 72.354456252, name: "Route de la Petite Chal", location: [6.770996, 45.573015] },
    { distance: 10.808957822, name: "", location: [6.63271, 45.413097] },
  ],
} as const;

/** La même, quand OSRM ne trouve aucun trajet entre deux points : une case `null`. */
export const OSRM_TABLE_UNREACHABLE = {
  ...OSRM_TABLE_SAVOIE,
  durations: [
    [0, 3052, null],
    [3023.3, 0, 4378.1],
    [6065.6, 4396.9, 0],
  ],
} as const;
