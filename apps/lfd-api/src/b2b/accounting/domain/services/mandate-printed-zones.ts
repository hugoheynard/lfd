import type { MandateDefaults } from "../value-objects/mandate-defaults.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";

/**
 * Le formulaire imprime-t-il les zones facultatives — 14, 19 et 20 ?
 *
 * Seul le CORE les porte. Le mandat interentreprises suit le gabarit DGFiP, qui
 * n'en a pas (plan `documentation/b2b/plan-mandat-deux-schemas.md` §10, Q2) :
 * les réécrire ne change donc rien au papier d'un brouillon B2B.
 */
export function printsOptionalZones(scheme: SepaScheme): boolean {
  return scheme === "CORE";
}

/**
 * Un changement des réglages de mandat change-t-il le papier d'un brouillon ?
 *
 * - le **type de paiement** (zone 12) s'imprime sous les deux schémas ;
 * - la **description du contrat** (zone 20) seulement sous CORE.
 *
 * Les deux valeurs sont celles des value objects, donc normalisées : une
 * espace ajoutée en fin de saisie n'est pas un changement.
 */
export function defaultsChangeReprintsDraft(
  before: MandateDefaults,
  after: MandateDefaults,
  scheme: SepaScheme,
): boolean {
  if (before.paymentType !== after.paymentType) {
    return true;
  }
  return printsOptionalZones(scheme) && before.contractDescription !== after.contractDescription;
}
