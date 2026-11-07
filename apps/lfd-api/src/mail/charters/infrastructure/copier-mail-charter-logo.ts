import { Injectable } from "@nestjs/common";

import { MailImageCopier } from "../../images/application/mail-image-copier.service.js";
import { MailCharterLogo } from "../domain/ports/mail-charter-logo.js";

/**
 * Le logo d'une charte copié par `MailImageCopier`, le service du même bloc
 * (`mail/images/`) : un adaptateur plutôt qu'une injection directe, pour que
 * la publication s'éprouve sans réseau ni stockage.
 */
@Injectable()
export class CopierMailCharterLogo extends MailCharterLogo {
  constructor(private readonly copier: MailImageCopier) {
    super();
  }

  async copy(sourceUrl: string): Promise<string> {
    return (await this.copier.copy(sourceUrl)).url;
  }
}
