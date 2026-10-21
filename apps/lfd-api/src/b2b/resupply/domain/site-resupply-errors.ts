import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/** Une quantité demandée qui n'est pas un entier strictement positif. */
export class InvalidRequestedQuantityError extends DomainError {
  constructor(readonly quantity: number) {
    super(
      "resupply.order.invalid_quantity",
      `La quantité demandée doit être un nombre entier, un ou plus (reçu : ${String(quantity)}). Retirez la ligne plutôt que d'y mettre zéro.`,
    );
  }
}

/** Une ligne sans article ou sans libellé. */
export class IncompleteResupplyLineError extends DomainError {
  constructor() {
    super(
      "resupply.order.incomplete_line",
      "Une ligne de réassort porte un article et son libellé : choisissez l'article dans le catalogue.",
    );
  }
}

/** Le même article deux fois dans un réassort : une ligne suffit. */
export class ResupplyLineDuplicatedError extends DomainError {
  constructor(readonly sku: string) {
    super(
      "resupply.order.duplicated_line",
      `Cet article (${sku}) figure deux fois dans le réassort : gardez une seule ligne avec la quantité totale.`,
    );
  }
}

/** Un réassort sans article : rien à produire. */
export class EmptyResupplyError extends DomainError {
  constructor() {
    super(
      "resupply.order.empty",
      "Un réassort porte au moins un article : ajoutez une ligne avant de le passer.",
    );
  }
}

/** Une visée inconnue relue en base. */
export class UnknownResupplyTargetError extends DomainError {
  constructor(readonly target: string) {
    super(
      "resupply.order.unknown_target",
      `La visée « ${target} » n'existe pas : un réassort vise demain ou « au plus tôt ».`,
    );
  }
}

/**
 * La commande du soir pour demain arrive après l'heure limite générale, et
 * le réassort y est soumis (`resupply_subject_to_cutoff`). Le geste de sortie
 * est nommé : commander « au plus tôt », ou régler le réassort sans limite.
 */
export class ResupplyPastCutoffError extends BusinessError {
  constructor(
    readonly serviceDay: string,
    readonly limitLabel: string,
  ) {
    super(
      "resupply.order.past_cutoff",
      `L'heure limite pour commander le réassort du ${serviceDay} est passée (${limitLabel}). Commandez « au plus tôt » pour aujourd'hui, ou demandez à régler le réassort « sans limite » (Réglages › Commandes › Heure limite).`,
    );
  }
}

/** Le geste vise un réassort qui n'est plus un brouillon. */
export class ResupplyAlreadyPlacedError extends BusinessError {
  constructor() {
    super(
      "resupply.order.already_placed",
      "Ce réassort est déjà passé : ses lignes ne changent plus. Annulez-le et passez-en un autre.",
    );
  }
}

/** Seul un réassort passé s'annule. */
export class ResupplyNotCancellableError extends BusinessError {
  constructor() {
    super(
      "resupply.order.not_cancellable",
      "Ce réassort est déjà annulé, ou n'a jamais été passé : rechargez la page.",
    );
  }
}

/** Aucun réassort de cet identifiant pour ce point. */
export class SiteResupplyNotFoundError extends ResourceNotFoundError {
  constructor(readonly resupplyId: string) {
    super(
      "resupply.order.not_found",
      "Ce réassort n'existe pas pour ce point de retrait : rechargez la page, ou vérifiez le point choisi dans le bandeau.",
    );
  }
}

/** Deux postes ont touché le même réassort en même temps. */
export class SiteResupplyChangedMeanwhileError extends BusinessError {
  constructor() {
    super(
      "resupply.order.changed_meanwhile",
      "Ce réassort vient d'être modifié depuis un autre poste : rechargez la page, puis refaites votre geste.",
    );
  }
}

/** Un brouillon atteint la persistance : un défaut de câblage, pas un geste du comptoir. */
export class DraftResupplyNotPersistableError extends TechnicalError {
  constructor() {
    super(
      "resupply.order.draft_not_persisted",
      "Un réassort en brouillon ne s'enregistre pas : il se passe d'un geste. Signalez-le à l'équipe technique.",
    );
  }
}
