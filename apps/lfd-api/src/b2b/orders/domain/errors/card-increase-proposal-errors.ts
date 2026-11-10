import {
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **projet de hausse payée par carte** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, partie 1, §2.7.2). Lus
 * par l'équipe et par le client : chacun nomme le cas et le geste de sortie.
 */

/** Ce que l'équipe et le client lisent d'un état, dans un message. */
const STATE_WORDS: Readonly<Record<string, string>> = {
  awaiting_payment: "attend son paiement",
  ready: "est payé et attend d'être appliqué",
  applied: "est déjà appliqué",
  refused: "a été refusé, et son complément rendu",
  stalled: "est en panne et attend d'être relancé",
  abandoned: "a été abandonné",
  closed: "est fermé, son complément rendu",
};

/** Une transition que la machine du projet n'admet pas (§1). */
export class CardIncreaseTransitionRefusedError extends BusinessError {
  constructor(
    readonly proposalId: string,
    readonly from: string,
    readonly gesture: string,
  ) {
    super(
      "orders.card_increase.transition_refused",
      `Ce complément ${STATE_WORDS[from] ?? `est « ${from} »`} : il ne peut plus être ${gesture}. ` +
        "Rechargez la commande pour voir où il en est.",
    );
  }
}

/** Un projet mal formé à sa naissance — un défaut du code appelant, pas du client. */
export class InvalidCardIncreaseProposalError extends DomainError {
  constructor(reason: string) {
    super("orders.card_increase.invalid", `Projet de hausse invalide : ${reason}.`);
  }
}

/**
 * L'heure limite de la journée est déjà passée au moment de la hausse : le
 * délai de paiement (borné par elle, Q1) serait nul.
 */
export class CardIncreaseAfterCutoffError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.card_increase.past_cutoff",
      "L'heure limite de commande de cette journée est passée : la commande ne peut plus être augmentée. " +
        "Passez une seconde commande pour une autre journée.",
    );
  }
}

/** Une ligne relue en base que la machine ne connaît pas : la base et le code divergent. */
export class UnknownCardIncreaseStateError extends TechnicalError {
  constructor(proposalId: string, state: string) {
    super(
      "orders.card_increase.unknown_state",
      `Le projet de hausse ${proposalId} porte l'état « ${state} », inconnu du code : la base et le code divergent.`,
    );
  }
}

/**
 * Un complément encaissé que personne n'attend (plan S2, §2.5) : aucun projet
 * ne porte ce paiement, ou il porte une autre commande. Bruyant exprès — la
 * livraison du webhook échoue, se rejoue, puis passe en lettre morte visible :
 * jamais 12 € gardés en silence par le chemin du premier paiement.
 */
export class ComplementWithoutProposalError extends TechnicalError {
  constructor(
    readonly orderId: string,
    readonly paymentId: string,
  ) {
    super(
      "orders.card_increase.orphan_complement",
      `Un complément encaissé (paiement ${paymentId}) ne correspond à aucun projet de hausse de la commande ${orderId} : ` +
        "l'argent est arrivé sans modification à appliquer. Le webhook sera rejoué ; s'il reste en lettre morte, " +
        "rembourser ce paiement depuis la fiche de la commande et signaler l'incohérence à l'équipe technique.",
    );
  }
}

/**
 * Une hausse « par carte » demandée sur une commande qui ne se règle pas par
 * carte (au compte, ou à total nul) : elle se modifie directement (M1).
 */
export class CardIncreaseNotApplicableError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.card_increase.not_card",
      "Cette commande ne se règle pas par carte : modifiez-la directement, sans complément à payer.",
    );
  }
}

/** R1 : une commande prise sur la vitrine (sur stock) ne s'augmente pas par un complément. */
export class CardIncreaseOnShelfOrderError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.card_increase.shelf",
      "Cette commande a été prise sur le stock de la boutique : elle ne s'augmente pas. " +
        "Passez une seconde commande pour les articles en plus.",
    );
  }
}

/**
 * R5 : un projet vivant occupe déjà la commande — un complément qui attend
 * son paiement d'un autre auteur, ou un complément payé qui attend d'être
 * appliqué. Jamais la violation brute de l'index unique.
 */
export class RevisionProposalPendingError extends BusinessError {
  constructor(
    readonly orderId: string,
    readonly state: string,
  ) {
    super(
      "orders.card_increase.pending",
      state === "awaiting_payment"
        ? "Un complément attend d'être payé sur cette commande : payez-le ou abandonnez-le avant une nouvelle modification."
        : "Un complément payé attend d'être appliqué sur cette commande : attendez la fin de la modification en cours, " +
            "puis rechargez la commande.",
    );
  }
}

/**
 * §2.4 (remplacement), §2.5 (abandon) : le complément précédent vient d'être
 * payé — la modification qu'il portait suit son cours.
 */
export class CardComplementJustPaidError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.card_increase.just_paid",
      "Le complément en attente sur cette commande vient d'être payé : la modification qu'il porte est en cours. " +
        "Rechargez la commande dans un instant avant toute autre modification.",
    );
  }
}

/** Le prestataire de carte n'a pas répondu à l'annulation du complément : rien n'a changé. */
export class CardComplementCancellationUnavailableError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.card_increase.provider_unavailable",
      "Le service de paiement ne répond pas pour le moment : rien n'a changé sur votre commande. Réessayez dans un instant.",
    );
  }
}

/**
 * §2.5 : aucun complément n'attend de paiement sur cette commande — pas de
 * projet, un projet qui n'attend plus son paiement, ou une intention déjà
 * annulée ou encaissée chez le prestataire.
 */
export class NoComplementAwaitingPaymentError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.card_increase.nothing_to_pay",
      "Aucun complément n'attend de paiement sur cette commande : il a été payé, abandonné ou a expiré. " +
        "Rechargez la commande pour voir où elle en est.",
    );
  }
}
