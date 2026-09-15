/**
 * **Le schéma SEPA d'un mandat** — `LclInstrm` du `pain.008`, et forme du
 * formulaire imprimé.
 *
 * ## Deux schémas, deux documents — depuis le 2026-09-15
 *
 * - `CORE` — le mandat du modèle EPC (`core-mandate-pdf.ts`) : le débiteur peut
 *   se faire rembourser un prélèvement autorisé pendant 8 semaines ;
 * - `B2B` — le mandat interentreprises d'après le gabarit DGFiP
 *   (`b2b-mandate-pdf.ts`) : aucun remboursement, et le mandat se transmet à la
 *   banque du débiteur avant le premier prélèvement.
 *
 * Le texte de chaque formulaire est indexé par ce type (`SEPA_MANDATE_WORDING`),
 * et chaque mise en page aussi (`sepa-mandate-pdf.ts`) : ajouter un schéma ici
 * sans écrire son texte ni son dessin ne compile pas.
 *
 * ## Il n'y a plus de réponse globale à « quel schéma ? »
 *
 * La question se pose à une **entité** (le réglage de ses frappes à venir) ou à
 * un **mandat** (le schéma sous lequel il a été frappé, figé). Jusqu'au
 * 2026-09-14, le lot écrivait `B2B` en dur pendant que le formulaire imprimait
 * le texte CORE ; lire le réglage courant pour un mandat déjà signé
 * reproduirait la même divergence — cf. `documentation/b2b/plan-mandat-deux-schemas.md`.
 *
 * ⚠️ Changer de schéma n'est pas une retouche : l'interentreprises exige un
 * contrat avec la banque du créancier et prive le débiteur du remboursement d'un
 * prélèvement autorisé. Tout mandat signé sous un schéma se refait sous l'autre.
 */
export type SepaScheme = "CORE" | "B2B";
