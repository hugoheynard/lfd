/**
 * Générateur **déterministe** de personas — un corpus **Haute-Tarentaise** (Savoie)
 * crédible : restaurants d'altitude, bars, hôtels, restauration collective,
 * traiteurs et snacks, répartis sur les stations Val d'Isère / Tignes / La Rosière /
 * Les Arcs / Bourg-Saint-Maurice. Piloté par l'index — pas de `Math.random`
 * (interdit + non rejouable) : le même index rend toujours le même persona → seed
 * **idempotent** (namespace `seed-…@demo.lafoliedouce.fr`, subs `seed|…`), qui
 * n'entre jamais en collision avec les comptes réels.
 *
 * Chaque persona porte son **secteur** (avec code **NAF** pertinent) et sa
 * **station** (code postal + ville) — la géo alimente la pénétration par
 * territoire ; le NAF est prêt pour l'attribution `Company.nafCode` (cf. doc
 * `commercial-data-analytics.md`, décision D1) même s'il n'est pas encore persisté.
 */

/** Marqueur d'e-mail : tout le corpus vit sous ce domaine, jamais touché ailleurs. */
export const SEED_EMAIL_DOMAIN = "demo.lafoliedouce.fr";
/** Préfixe des sujets Auth0 synthétiques. */
export const SEED_SUB_PREFIX = "seed|";

/** Une station de la vallée : le code postal porte la zone de pénétration. */
interface Station {
  readonly label: string;
  readonly codePostal: string;
  readonly ville: string;
}

/** Les 5 stations ciblées. Les Arcs / La Rosière / BSM partagent le 73700 (réel). */
const STATIONS: readonly Station[] = [
  { label: "Val d'Isère", codePostal: "73150", ville: "Val d'Isère" },
  { label: "Tignes", codePostal: "73320", ville: "Tignes" },
  { label: "La Rosière", codePostal: "73700", ville: "Montvalezan" },
  { label: "Les Arcs", codePostal: "73700", ville: "Bourg-Saint-Maurice" },
  { label: "Bourg-Saint-Maurice", codePostal: "73700", ville: "Bourg-Saint-Maurice" },
];

/** Un secteur d'activité : code NAF + libellé + vivier de noms d'enseignes. */
interface Sector {
  readonly key: string;
  readonly naf: string;
  readonly label: string;
  readonly venues: readonly string[];
}

const SECTORS: Readonly<Record<string, Sector>> = {
  restaurant: {
    key: "restaurant",
    naf: "56.10A",
    label: "Restauration traditionnelle",
    venues: [
      "La Fruitière",
      "Le Génépi",
      "L'Edelweiss",
      "La Table de l'Ouillette",
      "Le Chalet Gourmand",
      "La Ferme de l'Adroit",
      "La Grande Ourse",
      "L'Arpège des Cimes",
      "Le Bouchon Savoyard",
      "La Cordée",
    ],
  },
  bar: {
    key: "bar",
    naf: "56.30Z",
    label: "Débit de boissons",
    venues: [
      "Le Petit Danois",
      "Le Yéti",
      "La Doudoune",
      "Le Bar des Neiges",
      "La Luge",
      "Le Sommet",
      "L'Igloo",
      "Le Coin des Amis",
      "Le 1789",
      "La Face Nord",
    ],
  },
  hotel: {
    key: "hotel",
    naf: "55.10Z",
    label: "Hôtellerie",
    venues: [
      "Hôtel Le Blizzard",
      "Hôtel des Cimes",
      "Le Refuge des Neiges",
      "Chalet Altitude",
      "Hôtel du Glacier",
      "Les Chalets du Soleil",
      "La Bergerie",
      "Le Village Montana",
    ],
  },
  collective: {
    key: "collective",
    naf: "56.29A",
    label: "Restauration collective sous contrat",
    venues: [
      "Cantine des Pistes",
      "Cuisine Centrale Tarentaise",
      "Self des Arcs",
      "Restauration Club Alti",
      "Cantine du Massif",
      "Self Altitude",
      "Réfectoire des Neiges",
    ],
  },
  traiteur: {
    key: "traiteur",
    naf: "56.21Z",
    label: "Traiteur",
    venues: [
      "Savoie Traiteur",
      "Alpes Réception",
      "Tarentaise Événements",
      "Altitude Traiteur",
      "Les Saveurs du Mont",
      "Réception Belle Étoile",
    ],
  },
  fast: {
    key: "fast",
    naf: "56.10C",
    label: "Restauration rapide",
    venues: [
      "Snack Sommet",
      "Burger d'Altitude",
      "La Crêperie du Télésiège",
      "Pizza Névé",
      "Le Food-Truck des Neiges",
      "Snack La Face",
    ],
  },
};

/**
 * Séquence pondérée des secteurs : en station, restaurants et bars dominent, la
 * collective et les traiteurs sont plus rares → un mix réaliste sans `random`.
 */
const SECTOR_SEQUENCE: readonly Sector[] = [
  SECTORS.restaurant,
  SECTORS.bar,
  SECTORS.hotel,
  SECTORS.restaurant,
  SECTORS.fast,
  SECTORS.bar,
  SECTORS.collective,
  SECTORS.restaurant,
  SECTORS.hotel,
  SECTORS.traiteur,
  SECTORS.bar,
  SECTORS.restaurant,
];

const FIRST_NAMES = [
  "Marie",
  "Paul",
  "Sophie",
  "Lucas",
  "Emma",
  "Julien",
  "Léa",
  "Thomas",
  "Chloé",
  "Nathan",
  "Camille",
  "Antoine",
];
const LAST_NAMES = [
  "Blanc",
  "Favre",
  "Perrier",
  "Gontard",
  "Vial",
  "Empereur",
  "Chevallier",
  "Bonneval",
  "Excoffier",
  "Ruffier",
  "Marmottan",
  "Dériaz",
];

export interface Persona {
  readonly index: number;
  readonly businessName: string;
  readonly contactName: string;
  readonly email: string;
  readonly phone: string;
  readonly authSub: string;
  /** Secteur d'activité lisible (« Restauration traditionnelle »). */
  readonly sector: string;
  /** Code NAF pertinent (`56.10A`, `55.10Z`, …). Prêt pour `Company.nafCode`. */
  readonly naf: string;
  /** Station de rattachement (« Val d'Isère »). */
  readonly stationLabel: string;
  readonly codePostal: string;
  readonly ville: string;
}

/** Persona déterministe pour l'index `i` (valide sur tous les offsets du seed). */
export function persona(i: number): Persona {
  const sector = SECTOR_SEQUENCE[i % SECTOR_SEQUENCE.length];
  const venue = sector.venues[Math.floor(i / SECTOR_SEQUENCE.length) % sector.venues.length];
  const station = STATIONS[i % STATIONS.length];
  const first = FIRST_NAMES[i % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
  const n = String(i).padStart(4, "0");
  return {
    index: i,
    businessName: `${venue} · ${station.label}`,
    contactName: `${first} ${last}`,
    email: `seed-${n}@${SEED_EMAIL_DOMAIN}`,
    phone: `0${4 + (i % 2)}7${String(90_000_000 + i).slice(-7)}`,
    authSub: `${SEED_SUB_PREFIX}${n}`,
    sector: sector.label,
    naf: sector.naf,
    stationLabel: station.label,
    codePostal: station.codePostal,
    ville: station.ville,
  };
}
