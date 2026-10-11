import { Injectable } from "@nestjs/common";

import { AppError } from "../../platform/shared/errors/app-error.js";
import { MediaFailureLog } from "../domain/ports/media-failure-log.js";
import { productImage, type ProductImage } from "../domain/value-objects/image-bytes.js";

/**
 * **Relire les octets d'un dépôt, et inscrire le refus** avant de le relancer.
 *
 * Sorti du dépôt le 2026-10-11 : tenir l'historique des refus est une raison
 * de changer distincte de ranger une image.
 *
 * 🔴 **Hors de toute transaction, et c'est le point.** Le refus est levé
 * AVANT que l'unité de travail du dépôt s'ouvre ; y ranger l'inscription la
 * ferait emporter par le rollback, et l'historique serait vide précisément
 * les jours où il sert. `MediaFailureLog.record` ouvre donc la sienne.
 *
 * ⚠️ Et il **relance toujours**. L'historique observe, il n'absout pas : un
 * fichier refusé reste refusé, et l'appelant reçoit sa raison — celle qui
 * dit quoi corriger.
 *
 * On n'inscrit que les refus MÉTIER (`AppError`). Une panne de lecture
 * d'octets n'apprend rien sur le fichier et remplirait l'historique de
 * lignes qui parlent de nous, pas de lui.
 */
@Injectable()
export class DepositRefusals {
  constructor(private readonly failures: MediaFailureLog) {}

  /** L'image mesurée. @throws le refus du domaine, une fois inscrit. */
  async measured(bytes: Buffer, fileName: string): Promise<ProductImage> {
    try {
      return productImage(bytes);
    } catch (caught) {
      if (caught instanceof AppError) {
        await this.failures.record({
          fileName,
          reason: caught.message,
          code: caught.code,
          // Ce qu'on SAIT, et rien de plus : la taille est toujours
          // mesurable, le type non — un refus pour type non supporté n'a, par
          // construction, pas de type constaté. `null` dit « pas mesurable »,
          // pas « vide ».
          bytes: bytes.length,
          contentType: null,
        });
      }
      throw caught;
    }
  }
}
