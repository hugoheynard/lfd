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

/**
 * **Les heures qui arrêtent le plan** (lot R3a du réassort, Hugo 2026-10-21,
 * `reassort-boutiques/plan-reapprovisionnement.md` §13.3) : l'heure limite
 * générale et l'heure du réassort (« la veille, HH:MM », sans rattrapage).
 * Le plan s'arrête à la PLUS TARDIVE — un seul compte total imprimé.
 *
 * Sans règle générale, aucune : rien n'arrête le plan tout seul, comme avant.
 * L'heure du réassort seule n'arrête pas un plan que les clients peuvent
 * encore remplir sans limite.
 */
export function planStopRules(
  general: OrderCutoffRule | null,
  resupplyEveTime: string,
): readonly PlanStopRule[] {
  if (general === null) {
    return [];
  }
  return [
    { ...general, cause: "general" },
    { daysBefore: EVE, time: resupplyEveTime, graceMinutes: 0, cause: "resupply" },
  ];
}

/**
 * Ce qui fixe l'arrêt (lot R3b, §13.4 point 3) : l'heure limite générale des
 * clients, ou l'heure du réassort. Le refus d'un arrêt anticipé nomme la
 * vraie cause — l'heure seule ne dit pas laquelle régler.
 */
export type PlanStopCause = "general" | "resupply";

/** Une règle d'arrêt, avec ce qu'elle représente. */
export interface PlanStopRule extends OrderCutoffRule {
  readonly cause: PlanStopCause;
}

/** L'arrêt d'une journée : l'instant et la règle qui le fixe. */
export interface PlanStop {
  readonly at: Date;
  readonly cause: PlanStopCause;
}

/**
 * Comme {@link planStopsAt}, avec la cause. À égalité, la première règle —
 * la générale — l'emporte : c'est elle que les clients voient.
 */
export function planStopOf(rules: readonly PlanStopRule[], day: string): PlanStop | null {
  let latest: PlanStop | null = null;
  for (const rule of rules) {
    const at = planClosesAt(rule, day);
    if (at !== null && (latest === null || at.getTime() > latest.at.getTime())) {
      latest = { at, cause: rule.cause };
    }
  }
  return latest;
}

/**
 * L'instant où le plan de `day` s'arrête tout seul : la plus tardive des
 * {@link planStopRules}, chacune lue par {@link planClosesAt}. Une heure qui
 * n'existe pas ce jour-là (heure sautée) est ignorée ; aucune : `null`.
 */
export function planStopsAt(rules: readonly OrderCutoffRule[], day: string): Date | null {
  let latest: Date | null = null;
  for (const rule of rules) {
    const at = planClosesAt(rule, day);
    if (at !== null && (latest === null || at.getTime() > latest.getTime())) {
      latest = at;
    }
  }
  return latest;
}
