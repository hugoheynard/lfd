import type { OrderHandoverProofView } from "@lfd/contracts";

import type { HandoverProofExhibit } from "../../../../handover/channels/commerce/index.js";

/**
 * La preuve du retrait → la vue du staff. Le livreur y entre par son NOM,
 * résolu avant par l'annuaire : son identifiant de fiche ne traverse pas.
 */
export function toOrderHandoverProofView(
  exhibit: HandoverProofExhibit,
  courierName: string | null,
): OrderHandoverProofView {
  return {
    mode: exhibit.mode,
    handedOverAt: exhibit.handedOverAt.toISOString(),
    courierName,
    pieces:
      exhibit.pieces === null
        ? null
        : { receiverName: exhibit.pieces.receiverName, hasSignature: exhibit.pieces.hasSignature },
  };
}
