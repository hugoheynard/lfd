import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
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

/** Un réassort sans article : rien à produire. */
export class EmptyResupplyError extends DomainError {
  constructor() {
    super(
      "resupply.order.empty",
      "Un réassort porte au moins un article : ajoutez une ligne à la demande avant de l'envoyer.",
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
      "Ce réassort est déjà envoyé : ses lignes ne changent plus. Rechargez la page : un nouvel ajout ouvre une nouvelle demande.",
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
      "Cette demande de réassort vient d'être modifiée depuis un autre poste : rechargez la page pour voir ses lignes à jour, puis refaites votre geste.",
    );
  }
}

/** La ligne visée n'est plus dans la demande : un autre poste l'a retirée. */
export class ResupplyLineNotInDraftError extends BusinessError {
  constructor(readonly sku: string) {
    super(
      "resupply.order.line_not_in_draft",
      `L'article ${sku} n'est plus dans la demande en cours : un autre poste l'a sans doute retiré. Rechargez la page, puis ajoutez-le de nouveau s'il le faut.`,
    );
  }
}

/**
 * Une demande dont la journée est passée — le plus souvent une demande
 * « pour demain » restée sans envoi jusqu'au surlendemain. Elle ne
 * s'envoie plus : le comptoir ne la voit plus, et un nouvel ajout ouvre la
 * demande de la journée en cours.
 */
export class ResupplyDayPassedError extends BusinessError {
  constructor(readonly serviceDay: string) {
    super(
      "resupply.order.day_passed",
      `Cette demande visait le ${serviceDay}, une journée passée : elle ne s'envoie plus. Ajoutez les articles à la demande en cours (« Pour demain » ou « Au plus tôt »), puis envoyez-la.`,
    );
  }
}

/**
 * Deux postes ont ouvert en même temps la demande d'une même visée : l'index
 * unique partiel de la base a refusé la seconde.
 */
export class SiteResupplyDraftOpenedMeanwhileError extends BusinessError {
  constructor() {
    super(
      "resupply.order.draft_opened_meanwhile",
      "Une demande vient d'être ouverte pour cette visée depuis un autre poste : refaites votre geste, l'article s'ajoutera à elle.",
    );
  }
}
