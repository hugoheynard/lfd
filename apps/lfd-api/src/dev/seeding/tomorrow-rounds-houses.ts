/**
 * **Les maisons des tournées de demain, en données** — cf.
 * `tomorrow-rounds-clients.seed.ts`, qui les sème. Trois secteurs autour du
 * Labo (Val d'Isère) : Val d'Isère même, Tignes, et Bourg-Saint-Maurice avec
 * les Arcs et Séez. Noms inventés ; points posés à la main sur les rues des
 * stations (approchés, pas relevés).
 *
 * ⚠️ Le rang fixe le SIRET (`fictiveRegistration`) : on ajoute en fin de
 * liste, on n'insère pas.
 */

/** L'hôtel qui prend trois mannes : sa commande est estimée par les contenances. */
export const MANNES_HOTEL = "Hôtel Le Grand Névé";
/** Combien de mannes l'Hôtel Le Grand Névé prend. */
export const HOTEL_MANNES = 3;

/** Une maison, dite en une ligne : le reste se dérive. */
export interface TomorrowHouse {
  readonly slug: string;
  readonly enseigne: string;
  readonly forme: "SARL" | "SAS";
  readonly ligne1: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly lat: number;
  readonly lng: number;
  readonly deadline: string;
  readonly contact: readonly [string, string, string];
  /**
   * Combien de mannes de ficelles la maison commande, estimées par la
   * contenance ; absent, elle ne commande que du pain sans contenance et
   * compte une manne par défaut.
   */
  readonly mannes?: number;
}

/**
 * Ce que prend un grand hôtel : trois mannes de ficelles ; une résidence,
 * deux. Recalé le 2026-10-06 quand le plan de chargement a appris le plafond
 * de la caisse : 33 mannes en tout, cf. `tomorrow-rounds.seed.ts`.
 */
const LARGE_HOTEL_MANNES = 3;
const RESIDENCE_MANNES = 2;

const VDI = { codePostal: "73150", ville: "Val d'Isère" } as const;
const TIGNES = { codePostal: "73320", ville: "Tignes" } as const;
const BOURG = { codePostal: "73700", ville: "Bourg-Saint-Maurice" } as const;

export const TOMORROW_HOUSES: readonly TomorrowHouse[] = [
  // ── Val d'Isère ─────────────────────────────────────────────────────────
  {
    slug: "grand-neve",
    enseigne: MANNES_HOTEL,
    forme: "SAS",
    ligne1: "Avenue Olympique",
    ...VDI,
    lat: 45.449,
    lng: 6.9772,
    deadline: "06:30",
    contact: ["Laure", "Vibert", "06 11 52 40 83"],
    mannes: HOTEL_MANNES,
  },
  {
    slug: "combe-folle",
    enseigne: "Chalet-Hôtel La Combe Folle",
    forme: "SAS",
    ligne1: "Route du Fornet",
    ...VDI,
    lat: 45.4568,
    lng: 7.005,
    deadline: "07:00",
    contact: ["Marc", "Duverney", "06 22 63 51 94"],
    mannes: LARGE_HOTEL_MANNES,
  },
  {
    slug: "trois-combes",
    enseigne: "Restaurant Les Trois Combes",
    forme: "SARL",
    ligne1: "Chemin du Crêt",
    ...VDI,
    lat: 45.4505,
    lng: 6.986,
    deadline: "09:00",
    contact: ["Inès", "Gros", "06 33 74 62 05"],
  },
  {
    slug: "epicerie-joseray",
    enseigne: "Épicerie du Joseray",
    forme: "SARL",
    ligne1: "Rue du Joseray",
    ...VDI,
    lat: 45.447,
    lng: 6.969,
    deadline: "07:30",
    contact: ["Paul", "Mattis", "06 44 85 73 16"],
  },
  {
    slug: "cafe-legettaz",
    enseigne: "Café de la Legettaz",
    forme: "SARL",
    ligne1: "Montée de la Legettaz",
    ...VDI,
    lat: 45.4535,
    lng: 6.965,
    deadline: "08:00",
    contact: ["Zoé", "Arnaud", "06 55 96 84 27"],
  },
  {
    slug: "residence-manchet",
    enseigne: "Résidence Le Manchet",
    forme: "SAS",
    ligne1: "Route du Manchet",
    ...VDI,
    lat: 45.443,
    lng: 6.988,
    deadline: "08:30",
    contact: ["Hervé", "Perrin", "06 66 07 95 38"],
    mannes: RESIDENCE_MANNES,
  },
  {
    slug: "snack-front-de-neige",
    enseigne: "Snack du Front de Neige",
    forme: "SARL",
    ligne1: "Place des Dolomites",
    ...VDI,
    lat: 45.45,
    lng: 6.974,
    deadline: "09:00",
    contact: ["Lina", "Costa", "06 77 18 06 49"],
  },
  // ── Tignes ──────────────────────────────────────────────────────────────
  {
    slug: "lac-gele",
    enseigne: "Hôtel Le Lac Gelé",
    forme: "SAS",
    ligne1: "Rue du Lac, Tignes le Lac",
    ...TIGNES,
    lat: 45.469,
    lng: 6.907,
    deadline: "06:00",
    contact: ["Damien", "Revel", "06 88 29 17 50"],
    mannes: LARGE_HOTEL_MANNES,
  },
  {
    slug: "chalet-almes",
    enseigne: "Chalet des Almes",
    forme: "SARL",
    ligne1: "Le Lavachet",
    ...TIGNES,
    lat: 45.4745,
    lng: 6.9125,
    deadline: "07:00",
    contact: ["Chloé", "Bonnet", "06 99 30 28 61"],
  },
  {
    slug: "brasserie-palet",
    enseigne: "Brasserie du Palet",
    forme: "SAS",
    ligne1: "Galerie de Val Claret",
    ...TIGNES,
    lat: 45.456,
    lng: 6.9015,
    deadline: "08:00",
    contact: ["Yanis", "Ferrand", "06 10 41 39 72"],
  },
  {
    slug: "epicerie-val-claret",
    enseigne: "Épicerie de Val Claret",
    forme: "SARL",
    ligne1: "Rue de la Grande Balme",
    ...TIGNES,
    lat: 45.4572,
    lng: 6.9035,
    deadline: "07:30",
    contact: ["Sarah", "Lambert", "06 21 52 40 83"],
  },
  {
    slug: "boisses-hautes",
    enseigne: "Résidence Les Boisses Hautes",
    forme: "SAS",
    ligne1: "Les Boisses",
    ...TIGNES,
    lat: 45.4935,
    lng: 6.892,
    deadline: "08:30",
    contact: ["Victor", "Girod", "06 32 63 51 94"],
    mannes: RESIDENCE_MANNES,
  },
  {
    slug: "auberge-brevieres",
    enseigne: "Auberge des Brévières",
    forme: "SARL",
    ligne1: "Les Brévières",
    ...TIGNES,
    lat: 45.503,
    lng: 6.917,
    deadline: "09:00",
    contact: ["Agathe", "Mollard", "06 43 74 62 05"],
  },
  {
    slug: "cafe-lavachet",
    enseigne: "Café du Lavachet",
    forme: "SARL",
    ligne1: "Route du Lavachet",
    ...TIGNES,
    lat: 45.474,
    lng: 6.912,
    deadline: "08:00",
    contact: ["Noé", "Chardon", "06 54 85 73 16"],
  },
  // ── Bourg-Saint-Maurice, les Arcs, Séez ─────────────────────────────────
  {
    slug: "belvedere-arc",
    enseigne: "Hôtel du Belvédère d'Arc",
    forme: "SAS",
    ligne1: "Arc 1800, Charmettoger",
    ...BOURG,
    lat: 45.5735,
    lng: 6.801,
    deadline: "06:00",
    contact: ["Camille", "Rey", "06 65 96 84 27"],
    mannes: LARGE_HOTEL_MANNES,
  },
  {
    slug: "residence-lauzes",
    enseigne: "Résidence Les Lauzes",
    forme: "SAS",
    ligne1: "Arc 1600",
    ...BOURG,
    lat: 45.591,
    lng: 6.788,
    deadline: "07:00",
    contact: ["Bastien", "Vial", "06 76 07 95 38"],
    mannes: RESIDENCE_MANNES,
  },
  {
    slug: "epicerie-arpette",
    enseigne: "Épicerie de l'Arpette",
    forme: "SARL",
    ligne1: "Arc 1800, Le Charvet",
    ...BOURG,
    lat: 45.576,
    lng: 6.8045,
    deadline: "07:30",
    contact: ["Manon", "Jay", "06 87 18 06 49"],
  },
  {
    slug: "brasserie-isere",
    enseigne: "Brasserie de l'Isère",
    forme: "SARL",
    ligne1: "Grande Rue",
    ...BOURG,
    lat: 45.6185,
    lng: 6.7695,
    deadline: "08:00",
    contact: ["Thibault", "Muraz", "06 98 29 17 50"],
  },
  {
    slug: "cantine-moulins",
    enseigne: "Cantine des Moulins",
    forme: "SARL",
    ligne1: "Rue des Moulins",
    ...BOURG,
    lat: 45.615,
    lng: 6.772,
    deadline: "09:00",
    contact: ["Elsa", "Grange", "06 19 30 28 61"],
  },
  {
    slug: "auberge-versoyen",
    enseigne: "Auberge du Versoyen",
    forme: "SARL",
    ligne1: "Route du Petit-Saint-Bernard",
    codePostal: "73700",
    ville: "Séez",
    lat: 45.624,
    lng: 6.796,
    deadline: "08:30",
    contact: ["Jules", "Bérard", "06 20 41 39 72"],
  },
  {
    slug: "gite-hauteville",
    enseigne: "Gîte de Hauteville",
    forme: "SARL",
    ligne1: "Chef-lieu",
    codePostal: "73700",
    ville: "Hauteville-Gondon",
    lat: 45.614,
    lng: 6.779,
    deadline: "09:00",
    contact: ["Rose", "Blanc-Tailleur", "06 31 52 40 83"],
  },
];

/** Les mannes de ficelles d'une maison, ou `null` si elle compte au défaut. */
export function estimatedMannes(enseigne: string): number | null {
  return TOMORROW_HOUSES.find((house) => house.enseigne === enseigne)?.mannes ?? null;
}
