/**
 * **Le schéma SEPA sous lequel nous prélevons** — `LclInstrm` du `pain.008`, et
 * mention du formulaire de mandat.
 *
 * ## 🔴 UNE seule réponse à « quel schéma ? », et c'est ici
 *
 * Jusqu'au 2026-09-14, le lot écrivait `B2B` en dur pendant que le formulaire
 * imprimait le texte CORE (remboursement à 8 semaines) : deux fichiers qui ne se
 * lisaient pas, donc rien pour empêcher qu'ils divergent. Ils divergeaient. Le
 * lot (`pain008.ts`) et le formulaire (`sepa-mandate-pdf.ts`) lisent désormais
 * tous deux cette constante — cf. `documentation/todos/todo-mandat-core-contre-b2b.md`.
 *
 * ## Pourquoi le type ne connaît QUE `B2B`
 *
 * Parce que c'est le seul schéma dont ce dépôt sait imprimer le mandat. Le texte
 * du formulaire est indexé par ce type (`SEPA_MANDATE_WORDING`) : ajouter `CORE`
 * ici sans écrire son texte d'autorisation ne compile pas. Basculer la constante
 * sans le formulaire est donc **inexprimable**, pas seulement testé.
 *
 * ⚠️ Changer de schéma n'est pas un réglage : le schéma interentreprises exige
 * un contrat avec la banque du créancier (signé avec la Caisse d'Épargne, dit par
 * Hugo le 2026-09-14) et prive le débiteur du remboursement d'un prélèvement
 * autorisé. Tout mandat signé sous un schéma se refait sous l'autre.
 */
export type SepaScheme = "B2B";

/** Le schéma de tous les prélèvements et de tous les mandats imprimés. */
export const SEPA_SCHEME: SepaScheme = "B2B";
