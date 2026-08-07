/**
 * Générateur **déterministe** de personas (restaurateurs FR crédibles). Piloté par
 * l'index — pas de `Math.random` (interdit + non rejouable). Le même index rend
 * toujours le même persona → seed **idempotent** (namespace `seed-…@demo.lafoliedouce.fr`,
 * subs `seed|…`), qui n'entre jamais en collision avec les comptes réels.
 */

const BUSINESS_PREFIX = [
  "Le Bistrot",
  "Brasserie",
  "Traiteur",
  "La Table",
  "Auberge",
  "Le Comptoir",
  "La Cantine",
  "Le Relais",
];
const BUSINESS_SUFFIX = [
  "du Marché",
  "des Halles",
  "Saveurs",
  "du Coin",
  "Gourmand",
  "de la Gare",
  "Central",
  "du Port",
  "Belle Époque",
  "des Amis",
];
const FIRST_NAMES = [
  "Marie",
  "Paul",
  "Sophie",
  "Lucas",
  "Emma",
  "Hugo",
  "Léa",
  "Thomas",
  "Chloé",
  "Nathan",
];
const LAST_NAMES = [
  "Martin",
  "Bernard",
  "Dubois",
  "Robert",
  "Petit",
  "Durand",
  "Leroy",
  "Moreau",
  "Simon",
  "Laurent",
];

/** Marqueur d'e-mail : tout le corpus vit sous ce domaine, jamais touché ailleurs. */
export const SEED_EMAIL_DOMAIN = "demo.lafoliedouce.fr";
/** Préfixe des sujets Auth0 synthétiques. */
export const SEED_SUB_PREFIX = "seed|";

export interface Persona {
  readonly index: number;
  readonly businessName: string;
  readonly contactName: string;
  readonly email: string;
  readonly phone: string;
  readonly authSub: string;
}

/** Persona déterministe pour l'index `i`. */
export function persona(i: number): Persona {
  const prefix = BUSINESS_PREFIX[i % BUSINESS_PREFIX.length];
  const suffix = BUSINESS_SUFFIX[Math.floor(i / BUSINESS_PREFIX.length) % BUSINESS_SUFFIX.length];
  const first = FIRST_NAMES[i % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
  const n = String(i).padStart(4, "0");
  return {
    index: i,
    businessName: `${prefix} ${suffix} #${n}`,
    contactName: `${first} ${last}`,
    email: `seed-${n}@${SEED_EMAIL_DOMAIN}`,
    phone: `0${1 + (i % 5)}${String(10_000_000 + i).slice(-8)}`,
    authSub: `${SEED_SUB_PREFIX}${n}`,
  };
}
