import {
  ArchivedProductNotPublishableError,
  ArchivedProductNotWithdrawableError,
  DeletedProductNotChangeableError,
  NotArchivedProductNotDeletableError,
  NotArchivedProductNotRestorableError,
} from "../errors/product-errors.js";
import {
  isCompliantForActivation,
  type ComplianceFinding,
} from "../services/product-compliance.js";
import { refusalOf } from "./activation-refusal.js";
import type { ProductStatus } from "./product-state.js";

/**
 * **Les transitions de statut d'une fiche** — `draft → published → archived →
 * deleted` — comme fonctions pures : chacune dit le statut d'APRÈS, ou refuse.
 *
 * Rendre le MÊME statut n'est pas une erreur : « il y était déjà » est un
 * non-événement que l'agrégat traduit en `false` (`StatusChanged`), et dont
 * rien ne se journalise. Une transition **impossible**, elle, lève : « ça n'a
 * pas de sens » est une erreur d'appelant. Les verbes de `Product` ne font que
 * poser le résultat ; les règles vivent ici, lisibles d'un seul tenant.
 */

/** Une supprimée ne redevient rien depuis l'écran, pas même archivée. */
function refuseIfDeleted(id: string, status: ProductStatus): void {
  if (status === "deleted") {
    throw new DeletedProductNotChangeableError(id);
  }
}

/**
 * Mettre en vente. `findings` est jugé seulement pour un brouillon : le
 * jugement de complétude est celui que la liste appelle « activable », pour
 * qu'elle dise oui avec exactement le code qui accepte le geste.
 *
 * @throws {ArchivedProductNotPublishableError} une archivée se restaure d'abord :
 *   passer de « retiré de la vente » à « en ligne » d'un geste ferait sauter
 *   l'étape où quelqu'un regarde.
 * @throws la raison d'un refus de complétude ({@link refusalOf}).
 */
export function statusAfterActivation(
  id: string,
  status: ProductStatus,
  findings: () => readonly ComplianceFinding[],
): ProductStatus {
  refuseIfDeleted(id, status);
  if (status === "archived") {
    throw new ArchivedProductNotPublishableError(id);
  }
  if (status === "published") {
    return status;
  }
  const judged = findings();
  if (!isCompliantForActivation(judged)) {
    throw refusalOf(id, judged);
  }
  return "published";
}

/**
 * Retirer de la vente en ligne, sans archiver : le produit redevient brouillon.
 *
 * @throws {ArchivedProductNotWithdrawableError} une archivée n'est pas en
 *   vente, elle est sortie du catalogue : « la retirer de la vente » ne veut
 *   rien dire. Un no-op silencieux aurait l'exacte apparence d'un succès, et
 *   l'écran peindrait « Brouillon » sur une fiche restée archivée.
 */
export function statusAfterDeactivation(id: string, status: ProductStatus): ProductStatus {
  if (status === "archived") {
    throw new ArchivedProductNotWithdrawableError(id);
  }
  return status === "published" ? "draft" : status;
}

/**
 * Archiver. Idempotent — l'archivage en lot passe par là, et une sélection
 * contient couramment ce qui l'est déjà.
 *
 * @throws {DeletedProductNotChangeableError} une supprimée ne revient pas, même archivée.
 */
export function statusAfterArchiving(id: string, status: ProductStatus): ProductStatus {
  refuseIfDeleted(id, status);
  return "archived";
}

/**
 * Remettre une archivée en brouillon — jamais directement en ligne.
 *
 * @throws {NotArchivedProductNotRestorableError} restaurer une fiche en ligne la
 *   rétrograderait en silence : le geste prétendrait la ramener à la vente
 *   alors qu'il l'en sortirait.
 */
export function statusAfterRestoration(id: string, status: ProductStatus): ProductStatus {
  if (status !== "archived") {
    throw new NotArchivedProductNotRestorableError(id, status);
  }
  return "draft";
}

/**
 * Supprimer une archivée — un soft delete : elle sort de tout le référentiel,
 * la ligne reste, le SKU reste pris. Une fiche en vente ou en brouillon
 * s'archive d'abord, ce qui la retire du miroir du commerce. Le refus vaut
 * aussi pour une déjà supprimée : l'écran ne la montre plus, la demande vient
 * d'ailleurs.
 *
 * @throws {NotArchivedProductNotDeletableError} la fiche n'est pas archivée.
 */
export function statusAfterDeletion(id: string, status: ProductStatus): ProductStatus {
  if (status !== "archived") {
    throw new NotArchivedProductNotDeletableError(id, status);
  }
  return "deleted";
}
