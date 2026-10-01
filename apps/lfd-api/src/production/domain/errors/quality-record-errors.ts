import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus de l'**enregistrement** d'un contrôle qualité — le dépôt des photos,
 * le rattachement, l'idempotence, la cible dans la journée (lot QC2 du plan
 * `documentation/production/plan-controle-qualite.md`).
 *
 * À part de `quality-check-errors.ts`, qui ne porte que des `DomainError` sur la
 * FORME d'un contrôle : ceux-ci disent surtout « l'état ne le permet pas » (409)
 * ou « introuvable » (404), et chacun nomme le geste de sortie — ils sont lus au
 * fournil, sans le code sous les yeux.
 */

/** Une photo refusée au dépôt : vide, trop lourde, d'un format que l'écran ne lit pas. */
export class InvalidQualityPhotoError extends DomainError {
  constructor(reason: string) {
    super("production.quality.invalid_photo", `Photo de contrôle refusée : ${reason}`);
  }
}

/** Le même identifiant de contrôle, rejoué avec un autre contenu (D8). */
export class QualityCheckReplayConflictError extends BusinessError {
  constructor(checkId: string) {
    super(
      "production.quality.replay_conflict",
      `Le contrôle ${checkId} est déjà enregistré avec un autre contenu. ` +
        "Rechargez la Supervision pour le voir, puis rendez un nouveau verdict si besoin.",
    );
  }
}

/** Un dépôt inconnu — ou déposé par quelqu'un d'autre, ce qui se dit pareil. */
export class QualityUploadNotFoundError extends ResourceNotFoundError {
  constructor(uploadId: string) {
    super(
      "production.quality.upload_not_found",
      `La photo ${uploadId} n'a pas été trouvée parmi vos dépôts. Reprenez-la puis enregistrez à nouveau.`,
    );
  }
}

/** Un dépôt déjà rattaché à un contrôle : une photo ne documente qu'un verdict. */
export class QualityUploadAlreadyAttachedError extends BusinessError {
  constructor() {
    super(
      "production.quality.upload_already_attached",
      "Une des photos est déjà jointe à un autre contrôle. Reprenez-la pour ce verdict-ci.",
    );
  }
}

/** Un dépôt balayé : il attendait depuis plus de 24 h sans verdict (D8). */
export class QualityUploadReleasedError extends BusinessError {
  constructor(uploadId: string) {
    super(
      "production.quality.upload_released",
      `La photo ${uploadId} a été retirée faute de verdict dans les 24 h. Reprenez-la puis enregistrez à nouveau.`,
    );
  }
}

/** La ligne visée n'est pas au compte de la journée (journée pas arrêtée, ou SKU absent). */
export class QualityLineNotCountedError extends ResourceNotFoundError {
  constructor(serviceDay: string, sku: string) {
    super(
      "production.quality.line_not_counted",
      `Le produit ${sku} n'est pas au compte à produire du ${serviceDay}. ` +
        "Seule une ligne d'une journée arrêtée se contrôle.",
    );
  }
}

/** La commande visée n'est pas au plan de la journée. */
export class QualityOrderNotInPlanError extends ResourceNotFoundError {
  constructor(serviceDay: string, orderId: string) {
    super(
      "production.quality.order_not_in_plan",
      `La commande ${orderId} n'est pas au plan du ${serviceDay}. Vérifiez la journée affichée.`,
    );
  }
}

/** Une commande pas encore colisée : il n'y a rien de fini à juger (§5). */
export class QualityOrderNotPackedError extends BusinessError {
  constructor(reference: string) {
    super(
      "production.quality.order_not_packed",
      `La commande ${reference} n'est pas encore colisée : contrôlez-la une fois son bac déclaré prêt.`,
    );
  }
}

/**
 * La commande est partie en livraison : le produit n'est plus là
 * (`plan-a-la-porte.md`, BQ — LB-Q1).
 */
export class QualityOrderDepartedError extends BusinessError {
  constructor(reference: string) {
    super(
      "production.quality.order_departed",
      `La commande est partie : le produit n'est plus là. ${reference} a quitté le dépôt avec sa tournée.`,
    );
  }
}

/** La commande a déjà été retirée (comptoir ou livraison) : le produit n'est plus là. */
export class QualityOrderHandedOverError extends BusinessError {
  constructor(reference: string) {
    super(
      "production.quality.order_handed_over",
      `La commande ${reference} est déjà retirée : le produit n'est plus là, il n'y a plus rien à contrôler.`,
    );
  }
}

/** Une photo de contrôle demandée qui n'existe pas. */
export class QualityPhotoNotFoundError extends ResourceNotFoundError {
  constructor(checkId: string, position: number) {
    super(
      "production.quality.photo_not_found",
      `Le contrôle ${checkId} n'a pas de photo en position ${position}.`,
    );
  }
}

/**
 * Deux enregistrements simultanés se sont disputé le même identifiant de
 * contrôle, ou le même dépôt de photo : la base a arbitré, celui-ci a perdu.
 */
export class QualityCheckWriteRaceError extends BusinessError {
  constructor(cause?: unknown) {
    super(
      "production.quality.write_race",
      "Ce contrôle ou une de ses photos vient d'être enregistré par un autre geste. " +
        "Rechargez la Supervision avant de réessayer.",
      cause,
    );
  }
}

/** Une ligne de contrôle que le domaine n'aurait pas pu écrire : la base a été touchée à la main. */
export class QualityCheckUnreadableError extends TechnicalError {
  constructor(checkId: string, reason: string) {
    super(
      "production.quality.unreadable",
      `Le contrôle ${checkId} est illisible (${reason}). Signalez-le à l'équipe technique.`,
    );
  }
}
