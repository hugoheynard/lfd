/**
 * **Le profil de séjour, ESTIMÉ** (lot A3,
 * `documentation/recommandation-produit/plan-audiences.md` §3, voie b) —
 * résident, saisonnier ou vacancier, deviné d'après ce que le client FAIT
 * sur la période, jamais demandé, jamais stocké.
 *
 * La base ne rend, par client, que trois signaux (`StaySignals`) encodés dans
 * la clé brute de la case ; la règle qui les nomme vit ICI, et nulle part
 * ailleurs. Un client = une clé brute : l'addition des cases reste juste
 * (cf. `AudienceDimensionRule`).
 *
 * 🔴 **Les particuliers seulement.** Une société ne séjourne pas : un hôtel
 * qui commande en anglais n'est pas en vacances.
 */

/** La langue « de la maison » : toute autre langue de commande est un signal étranger. */
export const HOME_ORDER_LOCALE = "fr";

/**
 * L'indicatif « de la maison ». Un `users.phone` (texte libre) n'est lu que
 * s'il commence par `+` ou `00` suivi d'un indicatif : un autre indicatif est
 * un signal étranger ; un numéro sans indicatif (`06…`) ne dit RIEN — il peut
 * être français comme étranger mal saisi.
 */
export const HOME_CALLING_CODE = "33";

/** Un séjour : toutes les commandes de la période tiennent dans ce nombre de jours. */
export const VACATION_MAX_SPAN_DAYS = 10;

/** Une présence durable : des commandes sur au moins ce nombre de semaines distinctes. */
export const SETTLED_MIN_DISTINCT_WEEKS = 3;

/** Ce que la base rend d'un client, et rien de plus. */
export interface StaySignals {
  /** Une commande dans une autre langue que le français, ou un indicatif étranger. */
  readonly foreign: boolean;
  /** Jours entre la première et la dernière commande de la période (0 = un seul jour). */
  readonly spanDays: number;
  /** Semaines ISO distinctes où il a commandé, sur la période. */
  readonly distinctWeeks: number;
}

export const STAY_PROFILES = [
  { key: "resident", label: "Résident (estimé)" },
  { key: "seasonal", label: "Saisonnier (estimé)" },
  { key: "vacationer", label: "Vacancier (estimé)" },
  { key: "undetermined", label: "Indéterminé" },
] as const;

export type StayProfileKey = (typeof STAY_PROFILES)[number]["key"];

/**
 * **La règle, dans cet ordre :**
 *
 * 1. vacancier — un signal étranger ET toutes ses commandes en
 *    {@link VACATION_MAX_SPAN_DAYS} jours au plus ;
 * 2. présent sur {@link SETTLED_MIN_DISTINCT_WEEKS} semaines distinctes ou
 *    plus — saisonnier avec un signal étranger, résident sans ;
 * 3. indéterminé sinon (peu de commandes, rien d'étranger).
 *
 * Le saisonnier est la case la plus fragile : sur 90 jours au plus, un
 * saisonnier et un résident se ressemblent, et seul le signal étranger les
 * sépare — un résident étranger à l'année y tombe aussi.
 */
export function stayProfileOf(signals: StaySignals): StayProfileKey {
  if (signals.foreign && signals.spanDays <= VACATION_MAX_SPAN_DAYS) {
    return "vacationer";
  }
  if (signals.distinctWeeks >= SETTLED_MIN_DISTINCT_WEEKS) {
    return signals.foreign ? "seasonal" : "resident";
  }
  return "undetermined";
}

/** La clé brute que la base compose : `étranger(0|1)-écart-semaines`. */
export function staySignalsKey(signals: StaySignals): string {
  return `${signals.foreign ? 1 : 0}-${String(signals.spanDays)}-${String(signals.distinctWeeks)}`;
}

/** Relit la clé brute de la base ; `null` si elle n'en est pas une. */
export function staySignalsOf(rawKey: string): StaySignals | null {
  const match = /^([01])-(\d+)-(\d+)$/.exec(rawKey);
  if (match === null) {
    return null;
  }
  return {
    foreign: match[1] === "1",
    spanDays: Number(match[2]),
    distinctWeeks: Number(match[3]),
  };
}
