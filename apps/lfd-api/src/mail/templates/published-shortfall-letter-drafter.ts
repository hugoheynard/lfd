import { Injectable, Logger, Optional } from "@nestjs/common";

import {
  ShortfallLetterDrafter,
  type OrderShortfallDraftData,
} from "../channels/templates/shortfall-letter-drafter.js";
import {
  NO_MAIL_COPY_OVERLAY,
  withMailCopyOverlay,
  type MailCopyOverlay,
} from "./copy/mail-copy-overlay.js";
import { PublishedMailCopyReader } from "./effective-copy/published-mail-copy.reader.js";
import { draftOrderShortfallMessage } from "./order-shortfall-mail.js";

/**
 * La proposition « Écrire au client » rédigée par le dictionnaire, sous les
 * textes PUBLIÉS à l'écran des textes, comme à l'envoi ; une lecture du publié
 * qui échoue rend la proposition du code, et le dit au journal de l'API.
 *
 * Sortie de `lafoliecoffee/orders/application/queries/get-shortfall-letter-draft.handler.ts`
 * au lot S3b : le dictionnaire et le publié sont l'intérieur du bloc `mail`.
 */
@Injectable()
export class PublishedShortfallLetterDrafter extends ShortfallLetterDrafter {
  private readonly logger = new Logger(PublishedShortfallLetterDrafter.name);

  constructor(@Optional() private readonly published: PublishedMailCopyReader | null = null) {
    super();
  }

  async draft(data: OrderShortfallDraftData): Promise<string> {
    const overlay = await this.publishedTexts();
    return withMailCopyOverlay(overlay, () => draftOrderShortfallMessage(data));
  }

  private async publishedTexts(): Promise<MailCopyOverlay> {
    if (this.published === null) {
      return NO_MAIL_COPY_OVERLAY;
    }
    try {
      return await this.published.read();
    } catch (error: unknown) {
      this.logger.warn(
        `Textes d'e-mails publiés illisibles : la proposition « Écrire au client » suit le texte du code. Cause : ${String(error)}`,
      );
      return NO_MAIL_COPY_OVERLAY;
    }
  }
}
