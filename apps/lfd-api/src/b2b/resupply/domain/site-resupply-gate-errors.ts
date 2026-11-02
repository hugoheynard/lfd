import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/*
 * Les refus des GARDES du réassort (`site-resupply-gates.ts`,
 * `site-resupply-progress.ts`) : l'heure limite, le plan arrêté, le lancement,
 * la réception, la réserve. Séparés des erreurs de forme et de concurrence
 * (`site-resupply-errors.ts`) parce qu'ils changent avec les règles de
 * calendrier du fournil, pas avec la saisie (2026-11-02).
 */

/**
 * Le comptoir envoie « pour demain » après l'heure du réassort (R3a,
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
 * déjà arrêté (R3a) — un arrêt fait à la main, avant l'heure du réassort,
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
 * son plan (R3a). Le message lui parle à lui : la demande du comptoir
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
 * Le réassort est figé dans le plan arrêté du fournil (R3a ; décision Q3 du §13 :
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

/**
 * Le réassort « au plus tôt » est LANCÉ au fournil (R4a,
 * `reassort-boutiques/au-plus-tot.md`) : il est au plan du jour et compté
 * dans les fournées. Le geste de sortie : réceptionner ce qui arrive
 * vraiment, avec l'écart — ou voir le fournil.
 */
export class ResupplyLaunchedNotCancellableError extends BusinessError {
  constructor(readonly serviceDay: string) {
    super(
      "resupply.order.launched",
      `Le fournil a déjà lancé ce réassort pour le ${serviceDay} : il est en fabrication et ne s'annule plus. Réceptionnez-le avec un écart (Réceptionner les réassorts), ou voyez le fournil.`,
    );
  }
}

/**
 * Le réassort est déjà arrivé au point et réceptionné (l'envoi du fournil, R1d, trou laissé
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

/**
 * « Monté » (ou la réception d'un transfert) sur un réassort qui n'est pas en
 * route : une demande encore en cours, ou un réassort annulé (R3e).
 */
export class ResupplyNotArrivableError extends BusinessError {
  constructor(readonly draft: boolean) {
    super(
      "resupply.order.not_arrivable",
      draft
        ? "Ce réassort n'a pas été envoyé : c'est encore la demande en cours du comptoir, rien n'est à monter. Rechargez la page."
        : "Ce réassort a été annulé : il n'est pas à monter. Rechargez la page ; si les pièces sont parties quand même, le comptoir les saisit en réassort sans commande.",
    );
  }
}

/**
 * « Monté » sur un réassort « au plus tôt » que le fournil n'a pas lancé
 * (R4c ; décision Q4 : « Lancer » puis « Monté ») — il n'est pas au plan.
 */
export class ResupplyNotLaunchedNotMountableError extends BusinessError {
  constructor(readonly serviceDay: string) {
    super(
      "resupply.order.not_launched",
      `Ce réassort « au plus tôt » du ${serviceDay} n'a pas été lancé : il n'est pas au plan, rien n'est à monter. Lancez-le d'abord (Prod manager › Réassorts › Lancer), puis marquez-le monté.`,
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
 * « Envoyer en boutique » depuis la réserve d'un autre jour (A1.4) : seule la réserve DU JOUR — la journée du geste, à Paris — sort
 * vers une boutique.
 */
export class ReserveNotTodayError extends BusinessError {
  constructor(reserveDay: string, today: string) {
    super(
      "resupply.order.reserve_not_today",
      `Seule la réserve du jour (${today}) s'envoie en boutique, pas celle du ${reserveDay}. Revenez à la journée d'aujourd'hui dans la Supervision.`,
    );
  }
}

/**
 * Une sortie de réserve (A1.4) ne s'annule pas : le pain est
 * physiquement parti du colisage, et la réserve l'a déjà décompté.
 */
export class ReserveResupplyNotCancellableError extends BusinessError {
  constructor() {
    super(
      "resupply.order.reserve_not_cancellable",
      "Ce réassort est du pain envoyé par la réserve du colisage : il est déjà parti et ne s'annule pas. Réceptionnez ce qui arrive vraiment, avec l'écart s'il y en a un.",
    );
  }
}

/** Seul un réassort envoyé et non annulé se réceptionne. */
export class ResupplyNotReceivableError extends BusinessError {
  constructor() {
    super(
      "resupply.receipt.resupply_not_receivable",
      "Ce réassort n'a pas été envoyé au fournil, ou a été annulé : il n'y a rien à réceptionner. Saisissez ce qui est arrivé dans « Réassort sans commande ».",
    );
  }
}
