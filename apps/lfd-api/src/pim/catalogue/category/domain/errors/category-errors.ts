import {
  BusinessError,
  ResourceNotFoundError,
} from "../../../../../platform/shared/errors/app-error.js";

export class CategoryNotFoundError extends ResourceNotFoundError {
  constructor(readonly categoryId: string) {
    super("catalogue.category.not_found", `Famille « ${categoryId} » inconnue.`);
  }
}

/** Refus **produit** : on ne range pas une fiche dans une famille archivée. */
export class CategoryArchivedError extends BusinessError {
  constructor(readonly categoryId: string) {
    super(
      "catalogue.category.archived",
      "Impossible de rattacher un produit à une famille archivée.",
    );
  }
}

/**
 * Refus **famille** : une famille archivée est gelée. Le renommage reste permis
 * — corriger une faute de frappe ne doit pas obliger à la ressusciter — mais
 * régler ses canaux, sa TVA ou sa place dans l'arbre n'a plus de sens.
 */
export class CategoryFrozenError extends BusinessError {
  constructor(readonly categoryId: string) {
    super(
      "catalogue.category.frozen",
      "Cette famille est archivée : ses réglages sont gelés (le renommage reste possible).",
    );
  }
}

/** On ne range pas une famille vivante sous une famille archivée. */
export class CategoryArchivedParentError extends BusinessError {
  constructor(readonly parentId: string) {
    super(
      "catalogue.category.archived_parent",
      "Impossible de ranger une famille sous une famille archivée.",
    );
  }
}

/** Invariant 5 du socle : archiver une famille portant des produits actifs est refusé. */
export class CategoryHasActiveProductsError extends BusinessError {
  constructor(readonly categoryId: string) {
    super(
      "catalogue.category.has_active_products",
      "Cette famille porte encore des produits actifs : les déplacer avant de l’archiver.",
    );
  }
}

/**
 * Un taux ne se règle que pour un canal **qu'on vend**.
 *
 * Le garder pour un canal fermé laisserait la famille pointer un taux dont
 * personne ne se sert : il gonflerait le compte d'usages de l'écran des taux,
 * et la base refuserait de supprimer un taux que plus rien ne facture.
 */
export class CategoryTvaWithoutChannelError extends BusinessError {
  constructor(readonly channel: string) {
    super(
      "catalogue.category.tva_without_channel",
      `Le canal « ${channel} » n’est pas vendu : il ne peut pas porter de taux.`,
    );
  }
}

/**
 * On n'archive pas une famille qui porte encore des familles vivantes.
 *
 * Le pendant d'`CategoryArchivedParentError` : celui-là refuse de RANGER une
 * famille sous une archivée, celui-ci refuse d'ARCHIVER par-dessus des
 * vivantes. Sans lui, l'invariant n'était gardé que sur un chemin des deux,
 * et pas celui qui crée l'état.
 */
export class CategoryHasActiveChildrenError extends BusinessError {
  constructor(
    readonly categoryId: string,
    readonly children: number,
  ) {
    super(
      "catalogue.category.has_active_children",
      `Cette famille porte encore ${children} sous-famille(s) vivante(s) : les déplacer ou les archiver avant.`,
    );
  }
}

/** Un preset de canaux ne référence que des emplacements qui existent. */
export class CategoryUnknownEmplacementError extends BusinessError {
  constructor(readonly emplacementId: string) {
    super(
      "catalogue.category.unknown_emplacement",
      `L’emplacement « ${emplacementId} » n’existe pas.`,
    );
  }
}

/** Invariant 5 du socle : l'arbre des familles ne doit pas contenir de cycle. */
export class CategoryCycleError extends BusinessError {
  constructor(readonly categoryId: string) {
    super(
      "catalogue.category.cycle",
      "Ce déplacement créerait un cycle dans l’arbre des familles.",
    );
  }
}

/** Une famille ne peut pas être sa propre parente. */
export class CategorySelfParentError extends BusinessError {
  constructor(readonly categoryId: string) {
    super("catalogue.category.self_parent", "Une famille ne peut pas être sa propre parente.");
  }
}

/**
 * Réordonner exige la fratrie **entière** : ni oubli, ni intrus, ni doublon.
 * Un ordre partiel laisserait des rangs en double et l'affichage deviendrait
 * dépendant de l'ordre d'insertion — c'est-à-dire imprévisible.
 */
export class CategoryOrderMismatchError extends BusinessError {
  constructor(readonly parentId: string | null) {
    super(
      "catalogue.category.order_mismatch",
      "L’ordre proposé doit lister exactement les familles de ce niveau, une seule fois chacune.",
    );
  }
}
