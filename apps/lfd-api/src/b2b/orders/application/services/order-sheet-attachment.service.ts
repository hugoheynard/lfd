import type { ClientSheet } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import type { ByReference } from "../../../../mail/channels/requests/mail.js";
import type { OrderSheetMailDocument } from "../../../../mail/channels/templates/b2b-mails.js";
import { OrderSheetArchive } from "./order-sheet-archive.service.js";

/** Le bon tel que la demande d'e-mail le porte : sa place au stockage, pas ses octets. */
export type OrderSheetMailReference = ByReference<OrderSheetMailDocument>;

/**
 * **Le bon de commande, prêt à joindre à la confirmation** — ou rien (plan
 * `documentation/commandes/bon-et-pieces/architecture-bon-de-commande.md`, §2.4, §5).
 *
 * Le même document que l'archive : il passe par `OrderSheetArchive`, qui le
 * relit ou le fabrique et le range. Les deux expéditeurs de
 * `customer.order-placed` l'appellent (vérifié le 2026-10-09 :
 * `SendOrderPlacedMail` et `OrderPlacedMail`).
 *
 * **Par référence depuis le 2026-11-06** (plan
 * `documentation/editeur-de-contenu/plan-service-e-mails.md`, S2a) : la
 * demande d'e-mail ne porte que la clé du bon rangé, et le bloc `mail` le
 * relit au moment d'envoyer. Le bon doit donc être À SA PLACE avant la
 * demande — le rangement n'est plus best-effort ici.
 *
 * 🔴 **Un échec ne retient pas le courriel**, comme pour la facture : le
 * client doit savoir que sa commande est enregistrée, et le bon reste
 * téléchargeable depuis son espace. L'échec (rendu, ou stockage qui ne range
 * pas) est journalisé, le courriel part sans pièce jointe.
 */
@Injectable()
export class OrderSheetAttachment {
  private readonly logger = new Logger(OrderSheetAttachment.name);

  constructor(private readonly archive: OrderSheetArchive) {}

  async of(
    sheet: ClientSheet,
    handoverToken: string | null,
  ): Promise<OrderSheetMailReference | null> {
    try {
      const kept = await this.archive.kept(sheet, handoverToken);
      if (kept === null) {
        this.logger.warn(
          `Confirmation de commande ${sheet.reference} non jointe au courriel : le bon de retrait attend son QR (commande non réglée) et ne se range pas. Le bon reste téléchargeable depuis l'espace du client.`,
        );
        return null;
      }
      return {
        fileName: kept.fileName,
        pdfStored: { store: "customer-documents", key: kept.key },
      };
    } catch (error: unknown) {
      this.logger.error(
        `Confirmation de commande ${sheet.reference} non jointe au courriel : le rendu ou le rangement a échoué. Le courriel part sans pièce jointe ; le bon reste téléchargeable depuis l'espace du client.`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}
