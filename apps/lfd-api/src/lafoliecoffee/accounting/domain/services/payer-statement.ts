import type { CycleOrder } from "../ports/cycle-orders.reader.js";
import type { BillingFollow } from "../ports/statement-billing.reader.js";
import { billedPayerOf, billingFollowAt } from "./billed-payer.js";
import {
  aggregateStatement,
  linesAggregate,
  type StatementAggregate,
  type StatementPayer,
} from "./cycle-statement.js";

/**
 * Un groupe du relevé : la société du relevé elle-même, ou un de ses sites.
 *
 * Avant S4, tous les sites qui suivent `billing` sont groupés dans le relevé
 * du principal, un sous-total chacun. S4 ajoutera la « facturation séparée »,
 * qui sortira un site dans son propre relevé (plan `agregation-des-commandes`,
 * §1.2).
 */
export interface StatementGroup extends StatementAggregate {
  readonly companyId: string;
  readonly label: string;
  /** Vrai pour le groupe de la société du relevé ; faux pour un site. */
  readonly ownOrders: boolean;
}

/**
 * Le relevé d'un payeur : ses groupes, et ses totaux. `lines` et `totals` sont
 * ceux de TOUTES les lignes, dans l'ordre des groupes : ses totaux sont donc la
 * somme des groupes, au centime, par construction.
 */
export interface CycleStatement extends StatementAggregate {
  readonly groups: readonly StatementGroup[];
}

export interface PayerStatementInput {
  readonly payerId: string;
  readonly payerLabel: string;
  /** Les commandes du payeur ET de tous les sites qui l'ont suivi pendant le cycle. */
  readonly orders: readonly CycleOrder[];
  /** Les périodes `billing` dont il est le payeur. */
  readonly followsTowardsPayer: readonly BillingFollow[];
  /** Les périodes `billing` où il est lui-même le site d'un autre. */
  readonly followsOfPayer: readonly BillingFollow[];
}

/**
 * **La vue payeur** : les commandes de la société, puis celles de chacun de
 * ses sites qui la suivait en `billing` à la date de la commande.
 *
 * Une commande d'un site passée hors de toute période de suivi n'entre pas :
 * elle est réglée par le site lui-même (`billedPayerOf`). Les commandes de la
 * société elle-même y sont toujours ; si elle était le site d'un autre à leur
 * date, la ligne nomme qui la règle (`paidBy`).
 */
export function payerStatement(input: PayerStatementInput): CycleStatement {
  const own = input.orders.filter((order) => order.companyId === input.payerId);
  const ownGroup: StatementGroup = {
    companyId: input.payerId,
    label: input.payerLabel,
    ownOrders: true,
    ...aggregateStatement(own, (order) => payerElsewhere(order, input.followsOfPayer)),
  };
  const groups = [ownGroup, ...siteGroups(input)];
  return { groups, ...linesAggregate(groups.flatMap((group) => group.lines)) };
}

function payerElsewhere(
  order: CycleOrder,
  followsOfPayer: readonly BillingFollow[],
): StatementPayer | null {
  const payerId = billedPayerOf(order, followsOfPayer);
  if (payerId === order.companyId) {
    return null;
  }
  // Une commande copiée au nom d'un principal l'a été pendant une période qui
  // la couvre : le nom est celui de cette période. Faute de la trouver, l'id —
  // jamais un nom inventé.
  const follow = billingFollowAt(order.companyId, order.placedAt, followsOfPayer);
  return { companyId: payerId, name: follow?.payerId === payerId ? follow.payerName : payerId };
}

/** Un groupe par site qui a au moins une commande réglée par le payeur, par nom. */
function siteGroups(input: PayerStatementInput): readonly StatementGroup[] {
  const bySite = new Map<string, CycleOrder[]>();
  for (const order of input.orders) {
    if (order.companyId === input.payerId) {
      continue;
    }
    if (billedPayerOf(order, input.followsTowardsPayer) !== input.payerId) {
      continue;
    }
    bySite.set(order.companyId, [...(bySite.get(order.companyId) ?? []), order]);
  }
  return [...bySite.entries()]
    .map(([companyId, orders]) => ({
      companyId,
      label: orders[0]?.siteName ?? "",
      ownOrders: false,
      ...aggregateStatement(orders),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "fr"));
}
