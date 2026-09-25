import {
  addMinutes,
  localToInstant,
  type FulfillmentMethod,
  type LatenessRule,
  type OrderStatus,
  type SupervisionStage,
} from "@lfd/contracts";

import type { SupervisedOrder } from "../ports/day-supervision.reader.js";
import type { HandoverQueueWindow } from "../ports/order.reader.js";

/**
 * **Les règles de la Supervision du jour**, en fonctions pures
 * (`documentation/order/plan-supervision-du-jour.md`, « Serveur »).
 *
 * Elles ne lisent que la commande, sa date de service et l'instant qu'on leur
 * passe — jamais le mur : le temps vient du `Clock`, par l'appelant.
 */

/**
 * La marge avant un créneau promis à laquelle une commande devrait être prête,
 * en minutes.
 *
 * ⚠️ Valeur proposée le 2026-09-25, à confirmer par Hugo. Le plan la laisse
 * réglable dans un lot suivant ; elle reste une constante tant qu'il ne l'a pas
 * tranchée.
 */
export const READY_BEFORE_WINDOW_MINUTES = 60;

/** Les étapes où une commande n'est pas encore prête. */
const NOT_READY: ReadonlySet<SupervisionStage> = new Set(["placed", "in_production"]);

/** Les étapes qui ne sont jamais en retard : c'est fait, ou c'est abandonné. */
const SETTLED: ReadonlySet<SupervisionStage> = new Set(["handed_over", "cancelled"]);

/** L'ordre des lignes de flux à l'écran. */
const METHODS: readonly FulfillmentMethod[] = ["pickup", "delivery"];

/**
 * L'étape affichée d'un statut, ou `null` pour un brouillon — qui n'est pas une
 * commande.
 *
 * `in_production` n'est écrit par aucun handler (vérifié le 2026-09-25) ; une
 * ligne héritée qui le porterait est comptée en production, avec `confirmed`.
 */
export function stageOf(status: OrderStatus): SupervisionStage | null {
  return STAGE_OF_STATUS[status];
}

const STAGE_OF_STATUS: Readonly<Record<OrderStatus, SupervisionStage | null>> = {
  draft: null,
  placed: "placed",
  confirmed: "in_production",
  in_production: "in_production",
  ready: "ready",
  fulfilled: "handed_over",
  cancelled: "cancelled",
};

/**
 * La règle qui signale une commande en retard, ou `null`.
 *
 * 🔴 **Seul un créneau PROMIS est jugé** : `window` non nul et
 * `source ≠ "default"`. Une heure d'ouverture recopiée n'a été promise à
 * personne, et la juger ferait sonner des retards sur des commandes à qui l'on
 * n'a rien dit.
 *
 * Le créneau dépassé prime sur l'approche : une commande pas prête après la
 * fin de son créneau est d'abord une commande pas retirée.
 *
 * Une heure qui n'existe pas ce jour-là (passage à l'heure d'été) rend
 * `localToInstant` nul : la règle qui en dépend ne juge pas, plutôt que
 * d'inventer un instant.
 */
export function latenessOf(
  stage: SupervisionStage,
  window: HandoverQueueWindow | null,
  day: string,
  now: Date,
): LatenessRule | null {
  if (window === null || window.source === "default" || SETTLED.has(stage)) {
    return null;
  }
  const end = localToInstant(day, window.end);
  if (end !== null && now > end) {
    return "not_handed_over_after_window";
  }
  if (!NOT_READY.has(stage)) {
    return null;
  }
  const opening = localToInstant(day, window.start ?? window.end);
  if (opening !== null && now > addMinutes(opening, -READY_BEFORE_WINDOW_MINUTES)) {
    return "not_ready_before_window";
  }
  return null;
}

/** Le compte par étape d'un acheminement. */
export interface StageCounts {
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly placed: number;
  readonly inProduction: number;
  readonly ready: number;
  readonly handedOver: number;
  readonly cancelled: number;
}

/** Une commande en retard, avec la règle qui la signale. */
export interface LateEntry {
  readonly order: SupervisedOrder;
  readonly window: HandoverQueueWindow;
  readonly stage: SupervisionStage;
  readonly rule: LatenessRule;
}

/** Ce que la Supervision dit d'un jour. */
export interface DaySupervision {
  readonly flow: readonly StageCounts[];
  readonly late: readonly LateEntry[];
}

/**
 * Le flux et les retards d'une journée. Les brouillons sont écartés ; les deux
 * acheminements ont toujours leur ligne, même vide — une ligne absente ne dit
 * pas « zéro ».
 */
export function superviseDay(
  day: string,
  orders: readonly SupervisedOrder[],
  now: Date,
): DaySupervision {
  const staged = orders.flatMap((order) => {
    const stage = stageOf(order.status);
    return stage === null ? [] : [{ order, stage }];
  });
  return {
    flow: METHODS.map((method) =>
      countStages(
        method,
        staged.filter(({ order }) => order.fulfillmentMethod === method).map(({ stage }) => stage),
      ),
    ),
    late: staged.flatMap(({ order, stage }) => {
      const rule = latenessOf(stage, order.window, day, now);
      return rule === null || order.window === null
        ? []
        : [{ order, window: order.window, stage, rule }];
    }),
  };
}

function countStages(
  fulfillmentMethod: FulfillmentMethod,
  stages: readonly SupervisionStage[],
): StageCounts {
  const count = (wanted: SupervisionStage): number =>
    stages.filter((stage) => stage === wanted).length;
  return {
    fulfillmentMethod,
    placed: count("placed"),
    inProduction: count("in_production"),
    ready: count("ready"),
    handedOver: count("handed_over"),
    cancelled: count("cancelled"),
  };
}
