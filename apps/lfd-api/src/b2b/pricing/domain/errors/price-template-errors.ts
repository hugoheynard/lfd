/**
 * **Les refus d'un GABARIT tarifaire.**
 *
 * Un gabarit n'a jamais facturé : c'est ce qui justifie qu'il se retouche, et donc
 * qu'il ait moins de refus que les décisions qu'il produit.
 */

import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/** Un gabarit sans ligne, ou une ligne sans palier : il ne poserait rien. */
export class EmptyPriceTemplateError extends DomainError {
  constructor() {
    super(
      "pricing.template.empty",
      "Un gabarit tarifaire porte au moins une ligne, et chaque ligne au moins un palier — sinon il ne pose aucun prix.",
    );
  }
}

/** Deux lignes sur le même article : deux grilles concurrentes. */
export class DuplicateTemplateSkuError extends DomainError {
  constructor(sku: string) {
    super(
      "pricing.template.duplicate_sku",
      `L'article ${sku} apparaît deux fois : deux grilles concurrentes rendraient le prix dépendant de l'ordre de lecture.`,
    );
  }
}

/**
 * Une grille où commander plus coûte plus cher — ou deux paliers au même seuil.
 *
 * Le même refus que sur le barème de volume : l'incohérence n'est pas
 * exprimable palier par palier, elle n'apparaît qu'une fois la grille réunie.
 */
export class NonDecreasingTemplateTiersError extends DomainError {
  constructor(sku: string, minQuantity: number) {
    super(
      "pricing.template.non_decreasing_tiers",
      `Sur ${sku}, le palier à partir de ${String(minQuantity)} ne descend pas sous le précédent : commander plus y coûterait plus cher.`,
    );
  }
}

/**
 * Un gabarit archivé ne se retouche plus : on en compose un nouveau.
 *
 * **409 depuis le 2026-09-09**, comme `Archived*IsSealedError` partout ailleurs
 * : la grille envoyée est parfaitement bien formée, c'est l'état du gabarit qui
 * la refuse. Le 400 disait au staff de corriger sa saisie, alors qu'aucune
 * saisie ne pouvait passer (R18).
 *
 * ⚠️ **Aucune route ne l'atteint aujourd'hui** : archiver un gabarit n'a pas
 * d'appelant — c'est la trace morte que R10 recense. Ce refus se tient donc au
 * niveau de l'agrégat, et c'est là qu'il est éprouvé. Le corriger malgré tout,
 * c'est refuser qu'une catégorie fausse attende, invisible, le jour où
 * quelqu'un branchera le geste (vérifié le 2026-09-09).
 */
export class ArchivedPriceTemplateIsSealedError extends BusinessError {
  constructor(id: string) {
    super(
      "pricing.template.archived_is_sealed",
      `Le gabarit ${id} est archivé : il ne se retouche plus, un nouveau se compose.`,
    );
  }
}

/**
 * Le gabarit demandé n'existe pas.
 *
 * **404 depuis le 2026-09-09**, comme toute ressource absente du dépôt. Il
 * répondait **400** — le dernier des cinq agrégats à le faire —, ce qui disait
 * au staff que sa requête était malformée quand seule la cible manquait. Un
 * back-office traite les deux autrement : on corrige un formulaire, on
 * rafraîchit une liste (R18).
 */
export class PriceTemplateNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super("pricing.template.not_found", `Aucun gabarit tarifaire ${id}.`);
  }
}

/** Une ligne de gabarit que le schéma ne relit pas. */
export class CorruptedPriceTemplateError extends TechnicalError {
  constructor(id: string, detail: string) {
    super(
      "pricing.template.corrupted",
      `Le gabarit ${id} est illisible (${detail}) : le poser chez un client donnerait une grille sans contenu.`,
    );
  }
}
