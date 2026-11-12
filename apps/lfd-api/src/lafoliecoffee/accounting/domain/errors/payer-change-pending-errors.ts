import { BusinessError } from "../../../../platform/shared/errors/app-error.js";
import { BILLING_MODE_LABELS, type BillingMode } from "../value-objects/billing-mode.js";
import {
  COLLECTION_MEANS_LABELS,
  type CollectionMeans,
} from "../value-objects/collection-means.js";
import { parisLongDay } from "./collection-errors.js";

/**
 * **Un seul changement en attente par payeur, mode et moyen confondus**
 * (`le-paiement-par-virement.md`, K1) : un moyen programmé
 * tombe sur une clôture de la suite ACTUELLE du payeur ; un mode posé avant
 * qu'il prenne effet déplacerait cette suite, et la limite du moyen
 * tomberait au milieu d'une période — une facture à deux moyens.
 */
export class MeansChangeBlocksModeChangeError extends BusinessError {
  constructor(
    readonly payerName: string,
    readonly means: CollectionMeans,
    readonly effectiveAt: Date,
  ) {
    super(
      "accounting.payer_change.means_pending",
      `« ${payerName} » passe déjà au ${COLLECTION_MEANS_LABELS[means]} le ` +
        `${parisLongDay(effectiveAt)} à 00h00 (heure de Paris) : son mode de facturation ne change ` +
        `pas avant. Un seul changement en attente par client, mode et moyen d'encaissement ` +
        `confondus : attendez cette date, ou annulez d'abord le changement de moyen programmé.`,
    );
  }
}

/** Le pendant de {@link MeansChangeBlocksModeChangeError} : un mode est programmé. */
export class ModeChangeBlocksMeansChangeError extends BusinessError {
  constructor(
    readonly payerName: string,
    readonly mode: BillingMode,
    readonly effectiveAt: Date,
  ) {
    super(
      "accounting.payer_change.mode_pending",
      `« ${payerName} » passe déjà au mode ${BILLING_MODE_LABELS[mode]} le ` +
        `${parisLongDay(effectiveAt)} à 00h00 (heure de Paris) : son moyen d'encaissement ne ` +
        `change pas avant. Un seul changement en attente par client, mode et moyen ` +
        `d'encaissement confondus : attendez cette date, ou annulez d'abord le changement de ` +
        `mode programmé.`,
    );
  }
}
