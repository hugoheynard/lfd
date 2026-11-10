import { ResourceNotFoundError } from "../../../../platform/shared/errors/app-error.js";

/**
 * L'image demandée n'existe pas pour cette commande : pas de remise à la
 * porte, pas de signature jointe, ou des pièces déjà effacées. Le même 404
 * dans les trois cas — l'écran ne la demande que si la preuve l'annonce.
 */
export class OrderHandoverProofImageNotFoundError extends ResourceNotFoundError {
  constructor(piece: "photo" | "signature") {
    super(
      "orders.handover_proof.image_not_found",
      piece === "photo"
        ? "Aucune photo de remise pour cette commande : elle n'a pas été remise à la porte, ou ses pièces ont été effacées. Rechargez la fiche."
        : "Aucune signature pour cette commande : elle n'en portait pas, ou ses pièces ont été effacées. Rechargez la fiche.",
    );
  }
}
