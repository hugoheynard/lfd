import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Aucun mandat n'est enregistré pour cette société — **404**.
 *
 * Levée quand on tente de révoquer ou de justifier un mandat qui n'existe pas.
 * La lecture, elle, ne lève pas : « pas de mandat » est un état normal de fiche,
 * pas une erreur.
 */
export class MandateNotFoundError extends ResourceNotFoundError {
  constructor(companyId: string) {
    super(
      "payments.mandate.not_found",
      `Aucun mandat de prélèvement pour la société ${companyId}.`,
    );
  }
}

/**
 * La société a déjà un mandat actif — **409**.
 *
 * Un mandat en remplace un autre par un geste explicite (révoquer, puis
 * enregistrer), jamais par surprise : deux autorisations actives, et plus rien
 * ne dit sur laquelle on a prélevé.
 */
export class MandateAlreadyActiveError extends BusinessError {
  constructor(companyId: string) {
    super(
      "payments.mandate.already_active",
      `La société ${companyId} a déjà un mandat actif. Révoquez-le avant d'en enregistrer un nouveau.`,
    );
  }
}

/**
 * Le mandat visé n'est pas dans un état où le geste demandé a un sens — **409** :
 * révoquer un mandat déjà révoqué, ou justifier un mandat rejeté.
 */
export class MandateNotRevocableError extends BusinessError {
  constructor(status: string) {
    super("payments.mandate.not_revocable", `Un mandat « ${status} » ne peut pas être révoqué.`);
  }
}

/**
 * La **date de consentement** déclarée est dans le futur — **400**.
 *
 * Un mandat papier se signe avant d'être saisi. Une date à venir est une faute
 * de frappe, et c'est précisément la date qu'on opposera en contestation : mieux
 * vaut la refuser tout de suite que la découvrir devant la banque.
 */
export class MandateAcceptanceInFutureError extends DomainError {
  constructor() {
    super(
      "payments.mandate.acceptance_in_future",
      "La date de signature du mandat ne peut pas être dans le futur.",
    );
  }
}

/**
 * La société visée n'existe pas — **404**.
 *
 * Le contexte paiement ne charge pas l'agrégat société pour le savoir : il
 * demande juste de quoi identifier le débiteur chez le prestataire, et son
 * absence signifie que l'id est faux.
 */
export class CompanyNotFoundForMandateError extends ResourceNotFoundError {
  constructor(companyId: string) {
    super("payments.mandate.company_not_found", `Société ${companyId} introuvable.`);
  }
}

/**
 * La RUM est mal formée — **400**.
 *
 * Levée à la relecture d'une référence venue de la base ou d'un import : la RUM
 * que nous frappons est correcte par construction, donc une RUM invalide signale
 * une donnée abîmée, pas une saisie.
 */
export class InvalidRumError extends DomainError {
  constructor(
    readonly raw: string,
    readonly reason: string,
  ) {
    super("payments.rum.invalid", `Référence de mandat « ${raw} » : ${reason}`);
  }
}
