import type { AdminSubscriptionRow, SubscriptionView } from "@lfd/contracts";

/**
 * Port de **lecture** des paniers récurrents. Vue dénormalisée : une lecture ne
 * rejoue aucune règle.
 *
 * Deux entrées, parce qu'il y a deux murs. Le client lit **les siens** — un
 * abonnement appartient à une personne. Le back-office lit **ceux d'un compte**,
 * c'est-à-dire ceux de tous ses membres : la société est un regroupement, pas le
 * porteur, et c'est pourquoi la vue staff dit de qui est chaque panier.
 */
export abstract class SubscriptionReader {
  abstract listForUser(userId: string): Promise<readonly SubscriptionView[]>;

  /** Les paniers des membres de cette société, plus récents d'abord. */
  abstract listForCompany(companyId: string): Promise<readonly AdminSubscriptionRow[]>;
}
