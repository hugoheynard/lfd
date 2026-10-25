import { BusinessError, DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * Une demande vise un point de retrait ou un jour de semaine.
 *
 * Décision de Hugo du 2026-10-21 (`limites-de-commande/schema-des-reglages.md`
 * §4, point 4) : il n'y a plus qu'une heure limite, la générale. **400** : la
 * demande vise une portée qui n'existe plus comme réglage, et le message dit
 * quoi faire à la place.
 */
export class OrderCutoffScopeRetiredError extends DomainError {
  constructor() {
    super(
      "order_cutoffs.scope_retired",
      "Les heures limites par point de retrait ou par jour de la semaine ont été retirées : il n'y a plus qu'une heure limite, la générale, pour tous les points et tous les jours. Réglez-la sans point ni jour dans Réglages › Commandes › Heure limite ; pour un produit qui demande plus de temps, posez sa limite dans Référentiel › Limites de commande.",
    );
  }
}

/**
 * Une autre règle générale a été posée entre la lecture et l'écriture — deux
 * membres du staff ont validé en même temps. Refus **métier** : la base n'en
 * tient qu'une (index `order_cutoffs_single_rule`).
 */
export class DuplicateOrderCutoffError extends BusinessError {
  constructor() {
    super(
      "order_cutoffs.duplicate",
      "L'heure limite générale vient d'être posée par quelqu'un d'autre. Rechargez la page pour voir la règle en place, puis modifiez-la si besoin.",
    );
  }
}

/** L'heure limite du réassort n'est pas une heure de pendule (lot R3a, 2026-10-21). */
export class InvalidResupplyCutoffTimeError extends DomainError {
  constructor(readonly time: string) {
    super(
      "order_cutoff_settings.invalid_resupply_time",
      `L'heure limite du réassort doit être une heure de 00:00 à 23:59 (reçu : « ${time} »). Choisissez une heure dans le champ, par exemple 20:00.`,
    );
  }
}

/**
 * Un délai de relance d'un retrait en retard n'est pas un nombre entier de
 * minutes positif ou nul (2026-10-25).
 */
export class InvalidNudgeDelayError extends DomainError {
  constructor(readonly minutes: number) {
    super(
      "order_cutoff_settings.invalid_nudge_delay",
      `Le délai d'une relance se compte en minutes entières après la fin du créneau, 0 ou plus (reçu : ${String(minutes)}). Saisissez par exemple 0 pour proposer le geste dès la fin du créneau, ou 15.`,
    );
  }
}
