import type { PlannedLineBlocking } from "../../../../recurring/channels/commerce/index.js";

/** Comment un article se vend, tel que la passation le lit pour la société. */
export interface PlannedSaleTerms {
  readonly name: string;
  readonly saleUnit: "piece" | "weight";
  /** Le minimum en pièces de la clientèle de la société ; `null` : aucun. */
  readonly minQuantity: number | null;
}

/**
 * **Les portes de la passation qui ne tiennent pas à l'heure limite**, lues
 * pour le planificateur (plan du planificateur, § 4 bis) : la société et son
 * règlement, le jour, les termes de vente. Chaque réponse est le refus même
 * que la passation lèverait, déjà traduit (`recurringRefusalOf`).
 *
 * Une abstraction à part pour que la vérification se teste sans la porte de
 * la boutique ni l'arrêt du plan ; l'implémentation les compose.
 */
export abstract class PlannedOrderingGates {
  /** La société, avant tout : l'acheteur encore membre, pas un payeur public, la boutique ouverte. */
  abstract companyBlocking(
    companyId: string,
    buyerUserId: string,
  ): Promise<PlannedLineBlocking | null>;

  /**
   * Le règlement au compte possible — jugé en DERNIER, comme la passation le
   * juge après la composition : une machine ne commande qu'au compte.
   */
  abstract settlementBlocking(companyId: string, at: Date): Promise<PlannedLineBlocking | null>;

  /** Jour par jour : premier jour commandable, plan arrêté, jour même. Absent : ouvert. */
  abstract dayBlockings(
    companyId: string,
    buyerUserId: string,
    days: readonly string[],
    at: Date,
  ): Promise<ReadonlyMap<string, PlannedLineBlocking>>;

  /** Les termes de vente des articles vus par la société ; absent : l'article ne lui est pas servi. */
  abstract saleTerms(
    companyId: string,
    skus: readonly string[],
  ): Promise<ReadonlyMap<string, PlannedSaleTerms>>;
}
