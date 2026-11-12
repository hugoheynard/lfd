import type { NamedPayer } from "../entities/payer-billing-mode-history.js";
import type { PayerCollectionMeansHistory } from "../entities/payer-collection-means-history.js";

/** Port d'ÉCRITURE du moyen d'un payeur : l'historique entier, chargé puis rendu. */
export abstract class PayerCollectionMeansRepository {
  abstract load(legalEntityId: string, payer: NamedPayer): Promise<PayerCollectionMeansHistory>;

  /** Insère les segments neufs, pose les annulations — rien d'autre ne s'écrit. */
  abstract save(history: PayerCollectionMeansHistory): Promise<void>;
}
