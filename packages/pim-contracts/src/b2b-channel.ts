/**
 * Contrat de fil du **canal plateforme B2B**, côté PIM : ce que l'écran échange
 * avec son backend au sujet du canal.
 *
 * Il ne porte plus que la réémission. Partis en X4
 * (`documentation/catalogue/catalogue-synchronise.md` §6) : l'appartenance au
 * canal par fiche, la bascule vers l'audience, et les motifs d'exclusion du
 * push (`B2bExclusionReason`).
 *
 * Depuis le 2026-10-18, la réémission est un **travail suivi** :
 * `POST /pim/channels/b2b/reemit` rend `202` et l'identifiant du travail
 * (`CreatedIdResponse` de `@lfd/contracts`), et l'écran relit son état.
 * L'ancien compte rendu synchrone (`ReemissionReportView`) est retiré avec la
 * réponse qui le portait.
 */

/** `all` = familles, fiches, règles ; `product` = une fiche. */
export type CatalogReemissionScope = "all" | "product";

/** `done` = fini, échecs de fiche compris ; `failed` = arrêté en route (cf. `error`). */
export type CatalogReemissionStatus = "running" | "done" | "failed";

/** Une fiche qui n'est pas partie. */
export interface CatalogReemissionFailureView {
  readonly productId: string;
  /** Son nom source ; `null` s'il n'a pas pu être relu. */
  readonly name: string | null;
  readonly reason: string;
}

/** `GET /pim/channels/b2b/reemit/:id` — un travail et son compte rendu. */
export interface CatalogReemissionView {
  readonly id: string;
  readonly scope: CatalogReemissionScope;
  readonly productId: string | null;
  readonly status: CatalogReemissionStatus;
  /** ISO 8601. */
  readonly startedAt: string;
  /** ISO 8601 ; `null` tant qu'il tourne. */
  readonly finishedAt: string | null;
  readonly productsAttempted: number;
  readonly productsSucceeded: number;
  readonly failures: readonly CatalogReemissionFailureView[];
  /** Ce qui a tout arrêté — `null` sauf en `failed`. */
  readonly error: string | null;
  /** La fiche staff qui l'a lancé. */
  readonly startedBy: string;
  /** « Prénom Nom », ou `null` si la référence ne désigne personne. */
  readonly startedByName: string | null;
}

/** `GET /pim/channels/b2b/reemit/latest` — `job` vaut `null` s'il n'y en a jamais eu. */
export interface LatestCatalogReemissionView {
  readonly job: CatalogReemissionView | null;
}
