import { BusinessError, DomainError } from "../../../shared/errors/app-error.js";

// ─── Données mal formées : le modèle se protège lui-même (400) ───────────────

export class InvalidOccurrenceDateError extends DomainError {
  constructor(
    readonly raw: string,
    readonly reason: string,
  ) {
    super("subscriptions.date.invalid", `Date « ${raw} » : ${reason}`);
  }
}

export class InvalidSubscriptionLineError extends DomainError {
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

export class OccurrenceOutsideWindowError extends BusinessError {
  constructor(readonly date: string) {
    super(
      "subscriptions.occurrence.outside_window",
      `L'échéance ${date} tombe hors de la période de l'abonnement.`,
    );
  }
}
