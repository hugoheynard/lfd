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

/** Une origine inconnue relue en base. */
export class UnknownResupplyOriginError extends DomainError {
  constructor(readonly origin: string) {
    super(
      "resupply.order.unknown_origin",
      `L'origine « ${origin} » n'existe pas : un réassort vient du comptoir ou du fournil.`,
    );
  }
}

/**
 * Le comptoir envoie « pour demain » après l'heure du réassort (lot R3a,
 * 2026-10-21) : le plan du fournil s'arrête dessus, la demande n'y entrerait
 * plus. Le geste de sortie est nommé : demander au fournil.
 */
export class ResupplyPastCutoffError extends BusinessError {
  constructor(
    readonly serviceDay: string,
    readonly limitLabel: string,
  ) {
    super(
      "resupply.order.past_cutoff",
      `L'heure limite du réassort pour le ${serviceDay} est passée (${limitLabel}) : la demande n'entre plus au plan du fournil. Demandez au fournil s'il peut encore l'ajouter à sa fournée.`,
    );
  }
}

/**
 * Le comptoir envoie « pour demain » alors que le plan de cette journée est
 * déjà arrêté (lot R3a) — un arrêt fait à la main, avant l'heure du réassort,
 * faute d'heure limite générale. Même sortie : demander au fournil.
 */
export class ResupplyPlanStoppedError extends BusinessError {
  constructor(readonly serviceDay: string) {
    super(
      "resupply.order.plan_stopped",
      `Le plan du fournil pour le ${serviceDay} est arrêté : la demande n'y entre plus. Demandez au fournil s'il peut encore l'ajouter à sa fournée.`,
    );
  }
}

/**
 * Le FOURNIL envoie « pour demain » après l'heure du réassort ou l'arrêt de
 * son plan (lot R3a). Le message lui parle à lui : la demande du comptoir
 * n'a pas de recours, le fournil en a un, produire hors plan.
 */
export class BakehouseResupplyAfterStopError extends BusinessError {
  constructor(
    readonly serviceDay: string,
    readonly limitLabel: string,
  ) {
    super(
      "resupply.order.bakehouse_after_stop",
      `Le plan du ${serviceDay} est arrêté (heure du réassort : ${limitLabel}) : un réassort pour demain ne s'y inscrit plus. Ajoutez les pièces à la fournée hors plan — le retirage (« Reprendre le tirage ») ne reprend que les commandes —, puis envoyez-les « au plus tôt » le jour même pour que le point les réceptionne.`,
    );
  }
}

/**
 * Le réassort est figé dans le plan arrêté du fournil (lot R3a, Q3 du §13 :
 * « figé, il ne s'annule plus »). Le geste de sortie : réceptionner ce qui
 * arrive vraiment, avec l'écart.
 */
export class ResupplyFrozenInPlanError extends BusinessError {
  constructor(readonly serviceDay: string) {
    super(
      "resupply.order.frozen_in_plan",
      `Le plan du fournil pour le ${serviceDay} est arrêté : ce réassort y est figé et ne s'annule plus. Réceptionnez-le avec un écart (Réceptionner les réassorts).`,
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

/**
 * Le réassort est déjà arrivé au point et réceptionné (lot R1d, trou laissé
 * par R2) : l'annuler ferait disparaître ce que la vitrine a reçu de l'écran
 * du fournil, alors que le stock du jour le compte.
 */
export class ResupplyAlreadyReceivedNotCancellableError extends BusinessError {
  constructor(byName: string, atLabel: string) {
    super(
      "resupply.order.already_received",
      `Ce réassort est déjà réceptionné${byName === "" ? "" : ` par ${byName}`} à ${atLabel} : il ne s'annule plus. S'il y a un écart, corrigez la quantité reçue dans « Réceptionner les réassorts ».`,
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

/** Un nom de réassort plus long que la borne (lot R1g). */
export class ResupplyNameTooLongError extends DomainError {
  constructor(readonly max: number) {
    super(
      "resupply.order.name_too_long",
      `Le nom d'un réassort tient en ${String(max)} caractères au plus (« Vitrine du matin ») : raccourcissez-le.`,
    );
  }
}
