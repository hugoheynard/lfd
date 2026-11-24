import {
  AuthorizationError,
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

// ─── Données mal formées : le modèle se protège lui-même (400) ───────────────

export class InvalidOccurrenceDateError extends DomainError {
  constructor(
    readonly raw: string,
    readonly reason: string,
  ) {
    super("subscriptions.date.invalid", `Date « ${raw} » : ${reason}`);
  }
}

export class InvalidBasketLineError extends DomainError {
  constructor(
    readonly sku: string,
    readonly reason: string,
  ) {
    super("subscriptions.line.invalid", `Ligne « ${sku} » : ${reason}`);
  }
}

export class EmptySubscriptionError extends DomainError {
  constructor() {
    super("subscriptions.empty", "Un panier récurrent doit contenir au moins une ligne.");
  }
}

export class InvalidDateRangeError extends DomainError {
  constructor(
    readonly start: string,
    readonly end: string,
  ) {
    super(
      "subscriptions.range.invalid",
      `La date de fin (${end}) doit suivre la date de début (${start}).`,
    );
  }
}

export class InvalidRoutingError extends DomainError {
  constructor(readonly reason: string) {
    super("subscriptions.routing.invalid", reason);
  }
}

export class EmptyOverrideError extends DomainError {
  constructor() {
    super(
      "subscriptions.override.empty",
      "Une échéance non sautée doit garder au moins une ligne.",
    );
  }
}

// ─── Refus métier légitimes selon l'état courant (409) ───────────────────────

export class SubscriptionAlreadyPausedError extends BusinessError {
  constructor() {
    super("subscriptions.already_paused", "Ce panier récurrent est déjà en pause.");
  }
}

export class SubscriptionAlreadyActiveError extends BusinessError {
  constructor() {
    super("subscriptions.already_active", "Ce panier récurrent est déjà actif.");
  }
}

/** Un panier arrêté ne se modifie plus : il reste en base, sans retour. */
export class SubscriptionCancelledError extends BusinessError {
  constructor() {
    super(
      "subscriptions.cancelled",
      "Ce panier récurrent est arrêté : il ne se modifie plus. Ouvrez un nouveau panier pour reprendre.",
    );
  }
}

export class OccurrenceOutsideWindowError extends BusinessError {
  constructor(readonly date: string) {
    super(
      "subscriptions.occurrence.outside_window",
      `L'échéance ${date} tombe hors de la période de l'abonnement.`,
    );
  }
}

/**
 * Un panier récurrent ne porte pas d'article « vendu seulement pendant une
 * opération » (D6 du plan des opérations datées) : une bûche de Noël revenant
 * chaque semaine n'a pas de sens, et aucun générateur n'aurait à le découvrir
 * au moment d'écrire la commande.
 */
export class OperationOnlyInSubscriptionError extends BusinessError {
  constructor(readonly productNames: readonly string[]) {
    super(
      "subscriptions.operation_only",
      `${productNames.map((name) => `« ${name} »`).join(", ")} ne se vend${productNames.length > 1 ? "ent" : ""} que pendant une opération datée, pas en panier récurrent. Retirez-le${productNames.length > 1 ? "s" : ""} de l’abonnement, et commandez-le${productNames.length > 1 ? "s" : ""} pour un jour de l’opération.`,
    );
  }
}

/**
 * Un panier récurrent ne porte pas d'article vendu au poids
 * (`documentation/pricing/vente-au-poids.md`, §2 « hors de ce plan »,
 * Hugo 2026-10-28) : ses quantités sont des pièces, et un poids y serait
 * compté mille fois.
 */
export class WeightArticleInSubscriptionError extends BusinessError {
  constructor(readonly sku: string) {
    super(
      "subscriptions.weight_article",
      `L'article ${sku} se vend au poids, et un panier récurrent ne se compte qu'en pièces. ` +
        "Retirez-le de l'abonnement, et commandez-le dans une commande ordinaire.",
    );
  }
}

// ─── Le mur ───────────────────────────────────────────────

/** Le panier n'existe pas, ou n'est pas à cette personne (404 non divulguant). */
export class SubscriptionNotFoundError extends ResourceNotFoundError {
  constructor(readonly subscriptionId: string) {
    super(
      "subscriptions.not_found",
      "Panier récurrent introuvable : il a peut-être été arrêté. Rechargez la liste de vos paniers.",
    );
  }
}

/**
 * Un panier de société ne se gère que par un membre ACTUEL de cette société
 * (`plan-notifications-sous-comptes.md`, N4e) : une personne qui l'a quittée
 * gardait sinon la main sur le panier du site.
 */
export class SubscriptionSiteMembershipLostError extends AuthorizationError {
  constructor(
    readonly companyId: string,
    companyName: string,
  ) {
    super(
      "subscriptions.site_membership_lost",
      `Vous n'êtes plus membre de ${companyName} : cet abonnement ne se gère plus depuis votre compte.`,
    );
  }
}

/**
 * Un payeur public (engagement budgétaire) n'ouvre pas de panier récurrent :
 * le planificateur ne le servirait pas (périmètre du planificateur, § 0), et
 * l'engagement qu'un panier porterait n'est pas encore décidé.
 */
export class BasketPublicPayerError extends BusinessError {
  constructor(
    readonly companyId: string,
    companyName: string,
  ) {
    super(
      "subscriptions.public_payer",
      `${companyName} règle sur engagement budgétaire : un panier récurrent ne peut pas encore s'ouvrir pour elle. Passez vos commandes une à une, avec leur engagement.`,
    );
  }
}

/**
 * Un panier enregistre la version des CGV qu'il applique (plan
 * `plan-bloc-recurrent.md`, § 7) : sans texte publié pour la clientèle de
 * l'acheteur, il n'y a rien à accepter, et le panier ne s'ouvre pas.
 */
export class BasketSalesTermsUnpublishedError extends BusinessError {
  constructor() {
    super(
      "subscriptions.sales_terms.unpublished",
      "Les conditions générales de vente de votre clientèle ne sont pas encore publiées : un panier récurrent ne peut pas s'ouvrir sans elles. Passez une commande ordinaire en attendant, ou contactez-nous.",
    );
  }
}
