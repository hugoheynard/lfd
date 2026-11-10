import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../platform/config/app-config.js";
import type { B2bMails } from "../channels/templates/b2b-mails.js";
import {
  MailTemplatePreview,
  type MailPreview,
} from "../channels/templates/mail-template-preview.js";
import { mailBrandingOf } from "./mail-branding.js";
import { b2bMailTemplates } from "./mail-templates.js";

/**
 * L'aperçu par le registre MÊME de l'envoi, avec la marque même du mailer
 * (`mailBrandingOf`) : l'aperçu et l'e-mail ne peuvent pas diverger. Repris
 * tel quel de `lafoliecoffee/vitrine/infrastructure/template-vitrine-notice-mail.renderer.ts`
 * au lot S3b, qui ne voit plus que le port.
 */
@Injectable()
export class RegistryMailTemplatePreview extends MailTemplatePreview {
  constructor(private readonly config: AppConfig) {
    super();
  }

  render<K extends keyof B2bMails>(template: K, data: B2bMails[K]): MailPreview {
    const { subject, html } = b2bMailTemplates(mailBrandingOf(this.config))[template](data);
    return { subject, html };
  }
}
