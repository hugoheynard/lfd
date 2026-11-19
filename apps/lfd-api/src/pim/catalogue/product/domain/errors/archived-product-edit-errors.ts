import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";

/** Les gestes qu'une fiche archivée refuse : son identité, ses textes, ses visuels. */
export type ArchivedProductEdit =
  "rename" | "change_kind" | "reclassify" | "edit_editorial" | "replace_media";

const GESTURE_LABEL: Readonly<Record<ArchivedProductEdit, string>> = {
  rename: "renommée",
  change_kind: "changée de type",
  reclassify: "rangée dans une autre famille",
  edit_editorial: "modifiée dans ses textes",
  replace_media: "modifiée dans ses visuels",
};

/**
 * Une fiche archivée ne se modifie pas, textes et visuels compris : on la
 * restaure d'abord (décidé par Hugo le 2026-11-18, étendu aux textes et aux
 * visuels le 2026-11-19). Sans ce refus, un renommage sur une archivée passait
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
