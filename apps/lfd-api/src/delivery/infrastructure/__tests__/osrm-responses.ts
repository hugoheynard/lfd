/**
 * Une réponse `/table` **réelle**, enregistrée le 2026-09-29 contre l'image
 * locale d'`osrm-backend` v5.27.1 et la carte de la Savoie préparée par
 * `apps/lfd-route-planner/scripts/build-graph.sh` :
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

/**
 * Quatre points — Val d'Isère, Arc 1800, Courchevel 1850, Méribel —, en UNE
 * table puis en quatre blocs 2 × 2 (`sources=`/`destinations=`), enregistrés
 * le 2026-09-29 contre la même image locale. Les URL sont celles qu'envoie
 * l'adaptateur, `hint` et points aimantés retirés. Le recollage des quatre
 * blocs doit rendre la table unique, case pour case.
 */
const Q = "annotations=duration,distance";
const P = ["6.9797,45.4486", "6.7713,45.5724", "6.6327,45.413", "6.566,45.3969"] as const;

export const OSRM_TABLE_FOUR = {
  code: "Ok",
  distances: [
    [0, 41923.5, 83708.7, 76167.5],
    [41798.2, 0, 63860.1, 56319],
    [83661.7, 63345.3, 0, 18980.7],
    [75211, 54894.6, 18026.9, 0],
  ],
  durations: [
    [0, 3052, 6085.6, 5388.4],
    [3023.3, 0, 4378.1, 3680.9],
    [6065.6, 4396.9, 0, 1809.4],
    [5264.1, 3595.4, 1700.9, 0],
  ],
} as const;

export const OSRM_TABLE_FOUR_BLOCKS: Readonly<Record<string, unknown>> = {
  [`${P[0]};${P[1]}?${Q}&sources=0;1&destinations=0;1`]: {
    code: "Ok",
    distances: [
      [0, 41923.5],
      [41798.2, 0],
    ],
    durations: [
      [0, 3052],
      [3023.3, 0],
    ],
  },
  [`${P[0]};${P[1]};${P[2]};${P[3]}?${Q}&sources=0;1&destinations=2;3`]: {
    code: "Ok",
    distances: [
      [83708.7, 76167.5],
      [63860.1, 56319],
    ],
    durations: [
      [6085.6, 5388.4],
      [4378.1, 3680.9],
    ],
  },
  [`${P[2]};${P[3]};${P[0]};${P[1]}?${Q}&sources=0;1&destinations=2;3`]: {
    code: "Ok",
    distances: [
      [83661.7, 63345.3],
      [75211, 54894.6],
    ],
    durations: [
      [6065.6, 4396.9],
      [5264.1, 3595.4],
    ],
  },
  [`${P[2]};${P[3]}?${Q}&sources=0;1&destinations=0;1`]: {
    code: "Ok",
    distances: [
      [0, 18980.7],
      [18026.9, 0],
    ],
    durations: [
      [0, 1809.4],
      [1700.9, 0],
    ],
  },
};

/**
 * Un tracé `/route` réel, enregistré le 2026-09-29 contre la même image :
 * Val d'Isère → Arc 1800 → Val d'Isère, `overview=simplified&geometries=geojson`.
 * Seuls `legs` et `waypoints` sont retirés.
 */
export const OSRM_ROUTE_VAL_ARC = {
  code: "Ok",
  routes: [
    {
      geometry: {
        type: "LineString",
        coordinates: [
          [6.979732, 45.448598],
          [6.969878, 45.455134],
          [6.959466, 45.469042],
          [6.94868, 45.474131],
          [6.95033, 45.477291],
          [6.941294, 45.491153],
          [6.93422, 45.495612],
          [6.929199, 45.504539],
          [6.917217, 45.514181],
          [6.912647, 45.524765],
          [6.915902, 45.531597],
          [6.914313, 45.536388],
          [6.900927, 45.55598],
          [6.88939, 45.566917],
          [6.882925, 45.577233],
          [6.884814, 45.579971],
          [6.882257, 45.578412],
          [6.885096, 45.585092],
          [6.882573, 45.596143],
          [6.880727, 45.592131],
          [6.879397, 45.597296],
          [6.81713, 45.616864],
          [6.807968, 45.618018],
          [6.793897, 45.625352],
          [6.788922, 45.618045],
          [6.776645, 45.610613],
          [6.769079, 45.598828],
          [6.783, 45.609747],
          [6.790061, 45.612724],
          [6.780683, 45.599359],
          [6.782424, 45.593903],
          [6.777973, 45.590205],
          [6.780576, 45.584801],
          [6.776185, 45.583839],
          [6.773268, 45.580447],
          [6.768841, 45.572066],
          [6.771299, 45.574238],
          [6.770996, 45.573015],
          [6.768841, 45.572066],
          [6.773268, 45.580447],
          [6.776185, 45.583839],
          [6.780576, 45.584801],
          [6.777973, 45.590205],
          [6.782424, 45.593903],
          [6.780683, 45.599359],
          [6.790061, 45.612724],
          [6.783, 45.609747],
          [6.769079, 45.598828],
          [6.776645, 45.610613],
          [6.788441, 45.617632],
          [6.793897, 45.625352],
          [6.807968, 45.618018],
          [6.81713, 45.616864],
          [6.879397, 45.597296],
          [6.880727, 45.592131],
          [6.882573, 45.596143],
          [6.885096, 45.585092],
          [6.882257, 45.578412],
          [6.884814, 45.579971],
          [6.882925, 45.577233],
          [6.88939, 45.566917],
          [6.900927, 45.55598],
          [6.914313, 45.536388],
          [6.915902, 45.531597],
          [6.912647, 45.524765],
          [6.917217, 45.514181],
          [6.929199, 45.504539],
          [6.93422, 45.495612],
          [6.941294, 45.491153],
          [6.95033, 45.477291],
          [6.94868, 45.474131],
          [6.959466, 45.469042],
          [6.969878, 45.455134],
          [6.979732, 45.448598],
        ],
      },
      weight_name: "routability",
      duration: 6157.3,
      distance: 84100.6,
    },
  ],
} as const;
