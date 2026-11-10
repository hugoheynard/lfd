import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Une origine de saisie (comptoir, commercial) ne se pose que sur une commande
 * saisie par l'équipe (Hugo, 2026-11-04). Aucun chemin HTTP ne l'exprime ; le
 * refus garde le semis et les tests du même côté, et le CHECK
 * `orders_entry_origin_by_staff` le tient en base.
 */
export class EntryOriginWithoutStaffError extends DomainError {
  constructor() {
    super(
      "orders.entry_origin.without_staff",
      "Une commande passée par le client lui-même ne porte pas d'origine de saisie : « au comptoir » et « par le commercial » ne se posent que sur une saisie de l'équipe.",
    );
  }
}
