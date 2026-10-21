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
