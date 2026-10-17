/**
 * Contrat de fil du **canal plateforme B2B**, côté PIM : ce que l'écran échange
 * avec son backend au sujet du canal.
 *
 * Il ne porte plus que la réémission. Partis en X4
 * (`documentation/catalogue/plan-sans-interrupteurs.md`) : l'appartenance au
 * canal par fiche, la bascule vers l'audience, et les motifs d'exclusion du
 * push (`B2bExclusionReason`).
 */

/**
 * La réponse de `POST /pim/channels/b2b/reemit` — ce qu'une réémission a fait.
 *
 * Même forme que le port `ReemissionReport` de l'API
 * (`pim/catalogue/shared/domain/ports/catalog-reemission.ts`) : publiée ici pour
 * que l'écran ne la recopie pas (2026-10-16).
 */
export interface ReemissionReportView {
  readonly categories: number;
  readonly products: number;
  /** Les fiches dont la transaction a échoué, par identifiant. */
  readonly failedProducts: readonly string[];
}
