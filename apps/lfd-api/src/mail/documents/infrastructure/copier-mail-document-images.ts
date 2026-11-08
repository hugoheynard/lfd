import { Injectable } from "@nestjs/common";
import type { ImageShaping } from "@lfd/mail-blocks";

import { MailImageCopier } from "../../images/application/mail-image-copier.service.js";
import { MailDocumentImages } from "../domain/ports/mail-document-images.js";

/**
 * Les images d'un document copiées par `MailImageCopier`, le service du même
 * bloc (`mail/images/`) : un adaptateur plutôt qu'une injection directe, pour
 * que la publication s'éprouve sans réseau ni stockage.
 */
@Injectable()
export class CopierMailDocumentImages extends MailDocumentImages {
  constructor(private readonly copier: MailImageCopier) {
    super();
  }

  async copy(sourceUrl: string, shaping: ImageShaping): Promise<string> {
    return (await this.copier.copy(sourceUrl, shaping)).url;
  }
}
