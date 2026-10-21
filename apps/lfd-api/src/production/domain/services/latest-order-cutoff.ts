import { orderLimitInstant } from "@lfd/contracts";

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

const MINUTE_MS = 60_000;

/**
 * **L'heure limite effective la plus tardive**, rattrapage compris — l'heure de
 * l'arrêt automatique, telle que la page Production › Réglages la dit.
 * Depuis le 2026-10-21, le commerce n'en sert qu'une (la générale) ; la forme
 * en liste reste celle du canal.
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
 * **L'instant où le plan de `day` s'arrête tout seul** (Hugo, 2026-10-21 —
 * `limites-de-commande/plan-une-seule-heure.md` §5, Q3) : la fin du
 * rattrapage de l'heure limite générale pour cette journée — l'instant où
 * plus aucune commande client ne peut passer. Plus tôt, une commande passée
 * dans le rattrapage avec une dérogation arriverait sur un plan déjà figé.
 *
 * La même conversion que la passation (`orderLimitInstant`, Europe/Paris) :
 * le fournil et la boutique ne peuvent pas dire deux heures différentes.
 *
 * `null` : aucune règle (rien n'arrête le plan seul), ou une heure limite qui
 * n'existe pas ce jour-là (l'heure sautée du passage à l'heure d'été, que la
 * passation n'oppose pas non plus).
 */
export function planClosesAt(rule: OrderCutoffRule | null, day: string): Date | null {
  if (rule === null) {
    return null;
  }
  const limit = orderLimitInstant(rule, day);
  return limit === null ? null : new Date(limit.getTime() + rule.graceMinutes * MINUTE_MS);
}
