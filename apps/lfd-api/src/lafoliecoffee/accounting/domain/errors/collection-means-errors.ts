import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";
import {
  COLLECTION_MEANS_LABELS,
  COLLECTION_MEANS_REASON_MAX,
  type CollectionMeans,
} from "../value-objects/collection-means.js";
import { parisLongDay } from "./collection-errors.js";

/** Un changement de moyen se motive : le journal le garde pour qui relira. */
export class CollectionMeansReasonRequiredError extends DomainError {
  constructor() {
    super(
      "accounting.collection_means.reason_required",
      `Le motif du changement de moyen d'encaissement est obligatoire : dites en une phrase ` +
        `pourquoi le client change (sa demande, un retour, un accord).`,
    );
  }
}

/** Un motif trop long : une phrase, pas une note. */
export class CollectionMeansReasonTooLongError extends DomainError {
  constructor(readonly length: number) {
    super(
      "accounting.collection_means.reason_too_long",
      `Le motif fait ${String(length)} caractères : ${String(COLLECTION_MEANS_REASON_MAX)} au plus. ` +
        `Raccourcissez-le.`,
    );
  }
}

/** **Un seul changement de moyen à la fois** : le programmé n'a pas pris effet. */
export class CollectionMeansChangePendingError extends BusinessError {
  constructor(
    readonly payerName: string,
    readonly means: CollectionMeans,
    readonly effectiveAt: Date,
  ) {
    super(
      "accounting.collection_means.change_pending",
      `« ${payerName} » passe déjà au ${COLLECTION_MEANS_LABELS[means]} le ` +
        `${parisLongDay(effectiveAt)} à 00h00 (heure de Paris). Un seul changement à la fois : ` +
        `attendez cette date, ou annulez d'abord le changement programmé.`,
    );
  }
}

/** Aucun changement de moyen programmé à annuler. */
export class NoScheduledCollectionMeansError extends BusinessError {
  constructor(readonly payerName: string) {
    super(
      "accounting.collection_means.nothing_scheduled",
      `Aucun changement de moyen d'encaissement n'est programmé pour « ${payerName} » : il n'y a ` +
        `rien à annuler. Un changement qui a déjà pris effet ne s'annule pas ; programmez-en un nouveau.`,
    );
  }
}

/**
 * **Pas de changement de moyen pendant un retour bancaire** (V10) : changer
 * de moyen arrête ou démarre un prélèvement, et le retour doit d'abord être
 * décidé.
 */
export class CollectionMeansReturnPendingError extends BusinessError {
  constructor(readonly payerName: string) {
    super(
      "accounting.collection_means.return_pending",
      `« ${payerName} » a un retour bancaire en cours : le moyen d'encaissement ne change pas tant ` +
        `qu'il n'est pas décidé. Décidez d'abord le retour (représenter, régler autrement ou passer ` +
        `en perte) dans « Retours bancaires », puis changez le moyen.`,
    );
  }
}

/**
 * **Le moyen ne se pose que sur un payeur** (V1) : ce site est facturé chez un
 * autre, dont le moyen vaut pour lui.
 */
export class NotACollectionMeansPayerError extends BusinessError {
  constructor(
    readonly siteName: string,
    readonly payerName: string,
  ) {
    super(
      "accounting.collection_means.not_a_payer",
      `« ${siteName} » est facturé chez « ${payerName} » : ses commandes se règlent par le moyen ` +
        `de « ${payerName} ». Changez le moyen sur « ${payerName} », ou détachez d'abord le site ` +
        `pour qu'il règle seul.`,
    );
  }
}

/**
 * Plusieurs entités émettrices en service ne règlent pas ce client de la même
 * façon : l'espace client ne choisit pas laquelle dire.
 */
export class SeveralClientCollectionMeansError extends BusinessError {
  constructor(readonly count: number) {
    super(
      "accounting.collection_means.several_issuers",
      `${String(count)} entités émettrices sont en service et ne règlent pas ce compte de la même ` +
        `façon (prélèvement chez l'une, virement chez l'autre) : l'espace client ne peut pas dire ` +
        `comment il paie. Aligner le moyen d'encaissement du compte sur chaque entité.`,
    );
  }
}
