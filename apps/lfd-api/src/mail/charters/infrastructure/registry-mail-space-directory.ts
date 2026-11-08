import {
  MAIL_LOCALES,
  type MailCharterSettings,
  type MailCharterShopFonts,
  type MailLocale,
  type MailSpace,
} from "@lfd/mail-blocks";
import { startingMailCharterSettings } from "@lfd/mailer";
import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { mailBrandingOf, shopFontsOf } from "../../templates/mail-branding.js";
import {
  editorMails,
  mailBlockDeclarationOf,
  mailSpaceOf,
} from "../../templates/sections/mail-block-declarations.js";
import { mailKeys } from "../../templates/specimens/mail-specimens.js";
import { MailSpaceDirectory } from "../domain/ports/mail-space-directory.js";

/**
 * Les espaces tels que le CODE les dit : chaque e-mail du registre rangé par
 * la charte de son modèle (`internal` dans `lfd`), les langues de ses
 * e-mails, et la charte de départ tirée des constantes du rendu — la police
 * de l'enseigne à l'adresse que le mailer lui-même lit (`mailBrandingOf`).
 */
@Injectable()
export class RegistryMailSpaceDirectory extends MailSpaceDirectory {
  private readonly starting: Readonly<Record<MailSpace, MailCharterSettings>>;
  private readonly shopFonts: MailCharterShopFonts | null;

  constructor(config: AppConfig) {
    super();
    // Les deux espaces partent de la même charte : la palette `BRAND` est
    // commune aux trois chartes de modèle (vérifié le 2026-11-07,
    // `@lfd/mailer`, `layout-styles.ts` et `document-theme.ts`).
    const settings = startingMailCharterSettings(mailBrandingOf(config).brandFontUrl);
    this.starting = { lfc: settings, lfd: settings };
    this.shopFonts = shopFontsOf(config);
  }

  templatesOf(space: MailSpace): readonly string[] {
    return editorMails(mailKeys()).filter((mail) => mailSpaceOf(mail) === space);
  }

  localesOf(space: MailSpace): readonly MailLocale[] {
    const used = new Set(
      editorMails(mailKeys())
        .filter((mail) => mailSpaceOf(mail) === space)
        .flatMap((mail) => mailBlockDeclarationOf(mail).locales),
    );
    return MAIL_LOCALES.filter((locale) => used.has(locale));
  }

  startingSettings(space: MailSpace): MailCharterSettings {
    return this.starting[space];
  }

  /** Les polices de la boutique sont celles de La Folie Coffee : l'espace de la maison n'en a pas. */
  shopFontsOf(space: MailSpace): MailCharterShopFonts | null {
    return space === "lfc" ? this.shopFonts : null;
  }
}
