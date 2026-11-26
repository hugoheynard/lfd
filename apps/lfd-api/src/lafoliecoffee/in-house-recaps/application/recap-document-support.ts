import type { Logger } from "@nestjs/common";

import { AppError } from "../../../platform/shared/errors/app-error.js";
import type { InHouseRecapDocument } from "../domain/ports/in-house-recap-document.js";

/**
 * Prévient le document d'un récapitulatif émis, APRÈS la validation : un
 * échec du PDF ou de l'e-mail ne défait pas l'émission. Il est journalisé ;
 * le récapitulatif reste sans PDF, et l'écran le montre (`hasDocument`).
 */
export async function announceIssued(
  document: InHouseRecapDocument,
  recapId: string,
  logger: Logger,
): Promise<void> {
  try {
    await document.afterIssued(recapId);
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw error;
    }
    logger.error(
      `Document du récapitulatif ${recapId} non produit : ${error.code} — ${error.message}`,
    );
  }
}
