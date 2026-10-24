import type { OrderSummarySource } from "../services/order-summary.js";

/** Qui demande, pour quelle société, et quelles commandes. */
export interface CompanyOrderSummaryScope {
  readonly actorUserId: string;
  readonly companyId: string;
  readonly orderIds: readonly string[];
}

/**
 * Port de **lecture** du récapitulatif de commandes (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, §6.5) —
 * distinct de {@link CompanyOrderListReader} : il lit les colonnes d'argent
 * et les lignes, et ne filtre pas les paiements en attente ou refusés, que le
 * récapitulatif doit nommer comme exclus.
 *
 * 🔴 Même mur que la liste, DANS la requête : la société, ou ses sites pour
 * l'`owner`/`admin` accepté du principal actif. Un id hors du mur est
 * simplement absent du résultat — c'est l'appelant qui le nomme.
 */
export abstract class CompanyOrderSummaryReader {
  /** En UNE lecture ; la plus récente en tête. */
  abstract ordersFor(scope: CompanyOrderSummaryScope): Promise<readonly OrderSummarySource[]>;
}
