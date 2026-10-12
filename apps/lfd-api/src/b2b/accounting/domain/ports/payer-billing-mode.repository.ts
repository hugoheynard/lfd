import type {
  NamedPayer,
  PayerBillingModeHistory,
} from "../entities/payer-billing-mode-history.js";

/** Port d'ÉCRITURE du mode d'un payeur (M1) : l'historique entier, chargé puis rendu. */
export abstract class PayerBillingModeRepository {
  abstract load(legalEntityId: string, payer: NamedPayer): Promise<PayerBillingModeHistory>;

  /** Insère les segments neufs, pose les annulations — rien d'autre ne s'écrit. */
  abstract save(history: PayerBillingModeHistory): Promise<void>;
}
