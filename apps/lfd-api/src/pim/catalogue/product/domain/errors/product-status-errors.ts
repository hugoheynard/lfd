import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";

import type { ActivationGaps } from "../services/activation-gaps.js";
import {
  PRICE_GAP,
  PRO_PRICE_GAP,
  VAT_GAP_PREFIX,
  WEIGHT_STEP_GAP,
} from "../services/variant-completeness.js";

/** Ce qu'un manque se dit à l'écran, avec le geste qui le répare. */
const GAP_LABEL: Readonly<Record<string, string>> = {
  [PRICE_GAP]: "prix public (section « Tarif »)",
  [PRO_PRICE_GAP]: "prix pro HT (section « Tarif »)",
  [WEIGHT_STEP_GAP]: "pas de vente au poids, en grammes (section « Tarif »)",
};

function gapLabel(gap: string): string {
  if (gap.startsWith(VAT_GAP_PREFIX)) {
    return `taux de TVA « ${gap.slice(VAT_GAP_PREFIX.length)} » (famille ou fiche)`;
  }
  return GAP_LABEL[gap] ?? gap;
}

/**
 * `activate` refusée : aucune déclinaison n'est complète (lot 2b de
 * `plan-catalogue-synchronise-par-audience.md`, C1 et 2b3). Remplace aussi
 * l'ancien refus des allergènes par déclinaison (`not_publishable`) : une
 * déclinaison sans déclaration n'empêche plus d'activer, elle n'est pas vendue.
 *
 * Le message nomme chaque déclinaison et ce qui lui manque, avec l'écran qui
 * le répare : il est lu par du personnel devant la fiche, pas devant le code.
 * Il dit aussi qu'une seule suffit, pour qu'on ne croie pas devoir tout remplir.
 */
export class ProductNotActivatableError extends BusinessError {
  constructor(
    readonly productId: string,
    readonly gaps: ActivationGaps,
  ) {
    super("catalogue.product.not_activatable", describeGaps(gaps));
  }
}

function describeGaps(gaps: ActivationGaps): string {
  if (gaps.allDiscontinued) {
    return (
      "Activation refusée : toutes les déclinaisons sont arrêtées — en rouvrir une et la " +
      "compléter."
    );
  }
  const lines = Object.entries(gaps.byVariant).map(
    ([sku, missing]) => `${sku} : ${missing.map(gapLabel).join(", ")}`,
  );
  return (
    `Activation refusée : aucune déclinaison n'est complète, et il en suffit d'une — ` +
    `${lines.join(" ; ")}.`
  );
}

/** Un produit archivé se restaure avant de se publier — jamais d'un geste. */
export class ArchivedProductNotPublishableError extends BusinessError {
  constructor(readonly productId: string) {
    super(
      "catalogue.product.archived_not_publishable",
      "Ce produit est archivé : le restaurer avant de le publier.",
    );
  }
}

/**
 * On ne retire pas de la vente ce qui n'y est pas.
 *
 * Le refus existe parce que son absence coûtait cher : le back-office envoyait
 * sa demande de RESTAURATION sur cette route, `unpublish()` ne faisait rien sur
 * un archivé, et tout le monde lisait un succès — l'écran passait la fiche en
 * « Brouillon », le journal enregistrait un retrait de la vente, la base restait
 * archivée (audit 2026-09-01). Le message dit donc le geste attendu.
 */
export class ArchivedProductNotWithdrawableError extends BusinessError {
  constructor(readonly productId: string) {
    super(
      "catalogue.product.archived_not_withdrawable",
      "Ce produit est archivé : c'est « Restaurer » qu'il faut, pas « Dépublier ».",
    );
  }
}

/**
 * On ne restaure que ce qui est archivé.
 *
 * Sans ce refus, restaurer un produit **en ligne** le rétrogradait en brouillon
 * sans un mot : `restore()` posait `draft` sans regarder d'où il venait.
 */
export class NotArchivedProductNotRestorableError extends BusinessError {
  constructor(
    readonly productId: string,
    readonly status: string,
  ) {
    super(
      "catalogue.product.not_archived_not_restorable",
      "Ce produit n'est pas archivé : il n'y a rien à restaurer.",
    );
  }
}

/** Le statut d'une fiche dans les mots de l'écran, pour les refus qui le nomment. */
const STATUS_WORDS: Readonly<Record<string, string>> = {
  draft: "en brouillon",
  published: "en ligne",
  archived: "archivée",
};

function notDeletableMessage(status: string): string {
  if (status === "deleted") {
    return "Cette fiche est déjà supprimée : il n'y a plus rien à supprimer.";
  }
  return (
    `Cette fiche est ${STATUS_WORDS[status] ?? status} : seule une fiche archivée se supprime. ` +
    `L'archiver d'abord depuis la liste des produits.`
  );
}

/**
 * On ne supprime que ce qui est archivé (`plan-effacer-une-fiche-archivee.md`,
 * v4). Le message nomme le statut réel et le geste de sortie : une fiche en
 * vente s'archive d'abord, ce qui la retire du commerce.
 */
export class NotArchivedProductNotDeletableError extends BusinessError {
  constructor(
    readonly productId: string,
    readonly status: string,
  ) {
    super("catalogue.product.not_archived_not_deletable", notDeletableMessage(status));
  }
}

/**
 * Une fiche supprimée ne redevient rien depuis l'écran — ni archivée, ni en
 * ligne. Si la suppression était une erreur, le fait `product.deleted` du
 * journal la retrouve, et la remettre en archives est un geste d'entretien.
 */
export class DeletedProductNotChangeableError extends BusinessError {
  constructor(readonly productId: string) {
    super(
      "catalogue.product.deleted",
      "Cette fiche a été supprimée : elle ne s'archive ni ne se publie plus. " +
        "La remettre en archives demande un geste d'entretien — le journal garde son SKU et son nom.",
    );
  }
}
