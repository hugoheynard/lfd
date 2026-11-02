import type { ProducibleOrder } from "../../channels/commerce/day-orders.reader.js";
import type { PlacedResupply } from "../../channels/commerce/day-resupplies.reader.js";
import {
  absorbArrivals,
  countOf,
  floorCounts,
  freezeOrder,
  freezeResupply,
} from "../services/production-count.js";
import {
  orderRevised,
  ordersAdded,
  planReplaced,
  type ProductionDayChanges,
  resupplyLaunched,
  UNCHANGED_DAY,
} from "./production-day.changes.js";
import { type RaisedLine, type RevisedLine, revisedPlanOf } from "./production-day.revision.js";
import type {
  LaunchedResupplySnapshot,
  ProducedItemSnapshot,
  ProductionOrderSnapshot,
  ProductionResupplySnapshot,
} from "./production-day.snapshot.js";

/** Le plan relu tel quel : ce que `ProductionDay` rehydrate. */
export interface DayPlanState {
  readonly orders: readonly ProductionOrderSnapshot[];
  readonly resupplies: readonly ProductionResupplySnapshot[];
  readonly launched: readonly LaunchedResupplySnapshot[];
  readonly counts: readonly ProducedItemSnapshot[];
  readonly changes: ProductionDayChanges;
}

/**
 * **Le plan d'une journée** — ce que le fournil doit produire : les commandes
 * figées, les réassorts du soir, les réassorts « au plus tôt » lancés dans la
 * journée, et le compte à produire qui en découle. Immuable : chaque geste
 * rend un plan neuf, avec ce qu'il a touché (`changes`, ce que `save` écrit).
 *
 * Sorti de `production-day.ts` le 2026-11-02 (le fichier passait 500 lignes) :
 * l'agrégat garde le CYCLE de la journée — arrêtée, reprise, rouverte, qui
 * colise, les fournées — et ses refus ; le plan garde le CALCUL. Aucun refus
 * de cycle ici : c'est `ProductionDay` qui décide si un geste est permis,
 * puis demande au plan ce qu'il devient. Les refus de contenu (une commande
 * révisée qui n'est pas au plan) restent ceux de `revisedPlanOf`.
 *
 * La règle du compte, une fois : l'arrêt part d'un compte vide (`countOf`) ;
 * tout geste qui touche une journée déjà arrêtée refait le compte sans
 * qu'aucun article ne descende sous ce qui a déjà été demandé au four
 * (`floorCounts`) — le fournil a lancé ses fournées sur ce nombre.
 */
export class DayPlan {
  /** Un plan vide, sans changement : la journée jamais arrêtée. */
  static readonly EMPTY: DayPlanState = {
    orders: [],
    resupplies: [],
    launched: [],
    counts: [],
    changes: UNCHANGED_DAY,
  };

  private constructor(private readonly state: DayPlanState) {}

  static of(state: DayPlanState): DayPlan {
    return new DayPlan(state);
  }

  get orders(): readonly ProductionOrderSnapshot[] {
    return this.state.orders;
  }

  get resupplies(): readonly ProductionResupplySnapshot[] {
    return this.state.resupplies;
  }

  get launched(): readonly LaunchedResupplySnapshot[] {
    return this.state.launched;
  }

  get counts(): readonly ProducedItemSnapshot[] {
    return this.state.counts;
  }

  get changes(): ProductionDayChanges {
    return this.state.changes;
  }

  /** Tous les réassorts au plan : ceux du soir, puis les lancés. */
  get planned(): readonly ProductionResupplySnapshot[] {
    return [...this.state.resupplies, ...this.state.launched];
  }

  /**
   * Rien à figer à l'arrêt — ni commande gardée, ni réassort du soir, ni
   * lancé (un lancé survit à une réouverture et suffit au plan).
   */
  isEmptyWith(kept: readonly ProducibleOrder[], resupplies: readonly PlacedResupply[]): boolean {
    return kept.length === 0 && resupplies.length === 0 && this.state.launched.length === 0;
  }

  /** L'arrêt : un instantané neuf des commandes et réassorts du soir, lancés gardés. */
  frozen(kept: readonly ProducibleOrder[], resupplies: readonly PlacedResupply[]): DayPlan {
    const frozenResupplies = resupplies.map(freezeResupply);
    return new DayPlan({
      ...this.state,
      orders: kept.map(freezeOrder),
      resupplies: frozenResupplies,
      counts: countOf([...kept, ...frozenResupplies, ...this.state.launched]),
      changes: planReplaced(this.state.changes),
    });
  }

  /**
   * Le retirage : les commandes arrivées depuis l'arrêt entrent au plan, par
   * `orderId` (`absorbArrivals`). `count` vaut zéro quand rien n'est arrivé,
   * et le plan rendu est alors celui-ci, inchangé.
   */
  absorbed(kept: readonly ProducibleOrder[]): { readonly plan: DayPlan; readonly count: number } {
    const absorbed = absorbArrivals(this.state.orders, kept);
    if (absorbed.count === 0) {
      return { plan: this, count: 0 };
    }
    const known = new Set(this.state.orders.map((order) => order.orderId));
    const added = absorbed.orders
      .filter((order) => !known.has(order.orderId))
      .map((order) => order.orderId);
    const plan = new DayPlan({
      ...this.state,
      orders: absorbed.orders,
      changes: ordersAdded(this.state.changes, added),
    }).recounted();
    return { plan, count: absorbed.count };
  }

  /** La réouverture : le plan du soir et le compte effacés, les lancés gardés. */
  cleared(): DayPlan {
    return new DayPlan({
      ...this.state,
      orders: [],
      resupplies: [],
      counts: [],
      changes: planReplaced(this.state.changes),
    });
  }

  /** Un réassort « au plus tôt » lancé entre au plan, et le compte se refait. */
  withLaunched(launched: LaunchedResupplySnapshot): DayPlan {
    return new DayPlan({
      ...this.state,
      launched: [...this.state.launched, launched],
      changes: resupplyLaunched(this.state.changes, launched.resupplyId),
    }).recounted();
  }

  /**
   * Le dû d'une commande inscrite, révisé ; le compte refait sans baisser.
   *
   * @throws les refus de `revisedPlanOf` : commande absente, articles changés.
   */
  revised(
    serviceDay: string,
    orderId: string,
    lines: readonly RevisedLine[],
  ): { readonly plan: DayPlan; readonly raised: readonly RaisedLine[] } {
    const revised = revisedPlanOf(serviceDay, this.state.orders, orderId, lines);
    const plan = new DayPlan({
      ...this.state,
      orders: revised.orders,
      changes: orderRevised(this.state.changes, orderId),
    }).recounted();
    return { plan, raised: revised.raised };
  }

  /** Le compte d'un plan déjà arrêté, refait : jamais sous ce qui a été demandé au four. */
  private recounted(): DayPlan {
    return new DayPlan({
      ...this.state,
      counts: floorCounts(this.state.counts, countOf([...this.state.orders, ...this.planned])),
    });
  }
}

/**
 * Les commandes du commerce, moins celles que l'équipe a retirées — la règle
 * d'écartement, écrite une fois pour la clôture et le retirage.
 */
export function withoutWithdrawn(
  orders: readonly ProducibleOrder[],
  withdrawn: ReadonlySet<string>,
): readonly ProducibleOrder[] {
  return orders.filter((order) => !withdrawn.has(order.orderId));
}
