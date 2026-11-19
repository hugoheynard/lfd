import type { OrderCutoffStatus } from "@lfd/contracts";

import type { OrderDeadlineVerdict } from "../../domain/deadline/order-deadline-verdict.js";
import type { DeadlineAudience } from "../../domain/deadline/ports/deadline-sources.js";

/** Pour qui l'on juge. */
export interface OrderDeadlineAsker {
  /** La clientèle dont on lit les limites d'article. */
  readonly audience: DeadlineAudience;
  /** La société, pour sa dérogation. `null` : aucune dérogation possible. */
  readonly companyId: string | null;
  /**
   * `consider` : la passation, l'estimation, la surtaxe prévue — la
   * dérogation ouverte est lue, et la surtaxe avec elle. `ignore` : l'avis, la
   * révision, la hausse — rien de ce qui a un prix n'est lu.
   */
  readonly waiver: "ignore" | "consider";
  /**
   * L'équipe avec le droit `lfc_product_limit_override`, lu en base par son
   * contrôleur : les limites d'article que le produit permet de passer ne la
   * jugent pas, la règle générale si. Obligatoire, sans valeur par défaut.
   */
  readonly exceedItemLimits: boolean;
}

/** Ce qu'on demande au délai de commande. */
export interface OrderDeadlineQuestion {
  /** Les articles du panier, doublons admis. Vide : rien à opposer. */
  readonly skus: readonly string[];
  /** La journée d'acheminement demandée, `AAAA-MM-JJ`. */
  readonly serviceDay: string;
  /** L'instant de la décision : l'horloge, ou celui d'un geste décidé plus tôt. */
  readonly at: Date;
  readonly asker: OrderDeadlineAsker;
}

/**
 * **Ce que le délai de commande sait répondre.** La question ne dépense rien
 * et n'écrit rien : dépenser une dérogation est le geste de la passation, dans
 * sa transaction.
 */
export abstract class OrderDeadline {
  /** Le panier : règle générale et limites d'article, la dérogation et son prix si considérés. */
  abstract verdict(question: OrderDeadlineQuestion): Promise<OrderDeadlineVerdict>;

  /**
   * La règle générale seule, rattrapage compris, pour chacune de ces journées
   * — la question de la relance de règlement, qui n'a pas de panier (un
   * panier vide n'opposerait rien) et en pose une par commande : la règle se
   * lit une fois pour toutes.
   */
  abstract generalRuleStatuses(
    serviceDays: readonly string[],
    at: Date,
  ): Promise<ReadonlyMap<string, OrderCutoffStatus>>;
}
