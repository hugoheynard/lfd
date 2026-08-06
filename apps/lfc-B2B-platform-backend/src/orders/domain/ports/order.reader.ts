import type { OrderView } from "@lfd/contracts";

/**
 * Port de **lecture** des commandes d'une entreprise. Vue dénormalisée (montants
 * en centimes, lignes snapshotées), la plus récente en tête. Le mur de tenancy
 * (appartenance à l'entreprise) est vérifié en amont par le handler.
 */
export abstract class OrderReader {
  abstract listByCompany(companyId: string): Promise<readonly OrderView[]>;

  /**
   * Les commandes **personnelles** d'un client (sans entreprise), la plus récente
   * en tête. Mur = le seul `placedByUserId` (pas d'entreprise à vérifier).
   */
  abstract listPersonal(userId: string): Promise<readonly OrderView[]>;
}
