import type { ClientSheet } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import type { OrderSheetMailDocument } from "../../../../platform/mailer/order-sheet-mail-document.js";
import { OrderSheetArchive } from "./order-sheet-archive.service.js";

/**
 * **Le bon de commande, prêt à joindre à la confirmation** — ou rien (plan
 * `documentation/order/plan-bon-public.md`, §2.4, §5).
 *
 * Le même document que l'archive : il passe par `OrderSheetArchive`, qui le
 * relit ou le fabrique et le range. Les deux expéditeurs de
 * `customer.order-placed` l'appellent (vérifié le 2026-10-09 :
 * `SendOrderPlacedMail` et `OrderPlacedMail`).
 *
 * 🔴 **Un échec ne retient pas le courriel**, comme pour la facture : le
 * client doit savoir que sa commande est enregistrée, et le bon reste
 * téléchargeable depuis son espace. L'échec est journalisé, le courriel part
 * sans pièce jointe.
 */
@Injectable()
export class OrderSheetAttachment {
  private readonly logger = new Logger(OrderSheetAttachment.name);

  constructor(private readonly archive: OrderSheetArchive) {}

  async of(
    sheet: ClientSheet,
    handoverToken: string | null,
  ): Promise<OrderSheetMailDocument | null> {
    try {
      const pdf = await this.archive.pdfOf(sheet, handoverToken);
      return { fileName: pdf.fileName, pdfBase64: pdf.bytes.toString("base64") };
    } catch (error: unknown) {
      this.logger.error(
        `Bon de commande ${sheet.reference} non joint à la confirmation : le rendu ou la lecture a échoué. Le courriel part sans pièce jointe ; le bon reste téléchargeable depuis l'espace du client.`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}
