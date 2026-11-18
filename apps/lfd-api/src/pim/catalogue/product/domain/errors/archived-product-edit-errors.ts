import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";

/** Les gestes d'identité qu'une fiche archivée refuse. */
export type ArchivedProductEdit = "rename" | "change_kind" | "reclassify";

const GESTURE_LABEL: Readonly<Record<ArchivedProductEdit, string>> = {
  rename: "renommée",
  change_kind: "changée de type",
  reclassify: "rangée dans une autre famille",
};

/**
 * Une fiche archivée ne se modifie pas : on la restaure d'abord (décidé par
 * Hugo le 2026-11-18). Sans ce refus, un renommage sur une archivée passait
 * en silence et se publiait à la restauration sans que personne l'ait revu.
 */
export class ArchivedProductNotEditableError extends BusinessError {
  constructor(
    readonly productId: string,
    readonly gesture: ArchivedProductEdit,
  ) {
    super(
      "catalogue.product.archived_not_editable",
      `Ce produit est archivé : il ne peut pas être ${GESTURE_LABEL[gesture]}. Restaurez-le d'abord.`,
    );
  }
}

/** Refuse le geste quand la fiche est archivée. */
export function refuseEditOfArchived(
  status: string,
  productId: string,
  gesture: ArchivedProductEdit,
): void {
  if (status === "archived") {
    throw new ArchivedProductNotEditableError(productId, gesture);
  }
}
