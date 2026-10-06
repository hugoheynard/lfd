import { HouseTime, MINUTES_IN_DAY } from "../value-objects/house-time.value-object.js";

/**
 * Une règle d'heure limite de commande, telle que le commerce la tient :
 * `daysBefore` jours avant la journée servie, à `time`, plus `graceMinutes` de
 * rattrapage. Le point de retrait et le jour de la semaine n'y sont pas : un
 * réglage d'arrêt unique doit tenir pour TOUS (cf. {@link latestOrderCutoff}).
 */
export interface OrderCutoffRule {
  readonly daysBefore: number;
  readonly time: string;
  readonly graceMinutes: number;
}

/** L'heure limite la plus tardive : `daysBefore` jours avant la journée servie, à `time`. */
export interface LatestOrderCutoff {
  readonly daysBefore: number;
  readonly time: HouseTime;
}

/** La veille : le jour où le plan du lendemain s'arrête. */
const EVE = 1;

/**
 * **L'heure limite effective la plus tardive**, toutes règles confondues (Q5).
 *
 * Toutes les règles, et pas « celle du lendemain » : l'heure d'arrêt est UNE
 * pour la maison et vaut chaque soir, quel que soit le point de retrait ou le
 * jour servi — elle doit donc suivre la plus tardive d'entre elles. Le
 * rattrapage compte : une commande passée dans la grâce est légitime, et
 * l'arrêt la laisserait hors du compte.
 *
 * Chaque règle se lit en minutes depuis le minuit de la veille, puis la plus
 * grande est rendue sous forme de règle normalisée : une limite à 22:00 la
 * veille avec trois heures de grâce devient « le jour même à 01:00 ».
 *
 * `null` : aucune règle, donc aucune limite au commerce — rien à respecter.
 */
export function latestOrderCutoff(rules: readonly OrderCutoffRule[]): LatestOrderCutoff | null {
  let latest: number | null = null;
  for (const rule of rules) {
    const offset =
      (EVE - rule.daysBefore) * MINUTES_IN_DAY +
      HouseTime.of(rule.time, "close").minutes +
      rule.graceMinutes;
    latest = latest === null ? offset : Math.max(latest, offset);
  }
  if (latest === null) {
    return null;
  }
  return {
    daysBefore: EVE - Math.floor(latest / MINUTES_IN_DAY),
    time: HouseTime.fromMinutes(latest),
  };
}

/**
 * Une heure d'arrêt, posée la veille, précède-t-elle cette limite ? Une limite
 * plus tôt que la veille ne gêne jamais ; une limite le jour même gêne toujours.
 */
export function closesBeforeCutoff(closeAt: HouseTime, cutoff: LatestOrderCutoff): boolean {
  if (cutoff.daysBefore > EVE) {
    return false;
  }
  return cutoff.daysBefore < EVE || closeAt.isBefore(cutoff.time);
}

/** La limite dite à qui règle : « la veille à 18:00 », « le jour même à 01:00 ». */
export function describeCutoff(cutoff: LatestOrderCutoff): string {
  if (cutoff.daysBefore === EVE) {
    return `la veille à ${cutoff.time.value}`;
  }
  if (cutoff.daysBefore === 0) {
    return `le jour même à ${cutoff.time.value}`;
  }
  return cutoff.daysBefore > EVE
    ? `${String(cutoff.daysBefore)} jours avant à ${cutoff.time.value}`
    : `${String(-cutoff.daysBefore)} jour(s) après à ${cutoff.time.value}`;
}
