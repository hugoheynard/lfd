import { AppConfig } from "../../../../platform/config/app-config.js";
import { MAIL_LOGO_ATTACHMENT } from "../../../../platform/mailer/mail-logo.js";
import { mailKeys } from "../../../../platform/mailer/specimens/mail-specimens.js";
import { SpecimenMailPreviewRenderer } from "../specimen-mail-preview.renderer.js";

/** Une config qui ne lit pas l'environnement : seule la marque des e-mails compte ici. */
class PreviewAppConfig extends AppConfig {
  override bootstrapAdminEmail(): string {
    return "admin@lfc.test";
  }

  override adminBaseUrl(): string | null {
    return "https://bo.lfc.test";
  }
}

/**
 * L'aperçu E2 montre le logo d'en-tête (2026-10-23) : un navigateur ne sait
 * pas lire `cid:`, l'aperçu l'incruste — sans quoi l'écran montrerait une
 * image cassée là où l'e-mail envoyé a son logo.
 */
describe("l'aperçu d'un e-mail", () => {
  const renderer = new SpecimenMailPreviewRenderer(new PreviewAppConfig());

  it.each(mailKeys())("%s : le logo est incrusté, et listé comme pièce en ligne", (mail) => {
    const preview = renderer.render(mail, "fr", {});

    expect(preview.html).not.toContain("cid:lfc-logo");
    expect(preview.html).toContain(
      `src="data:image/jpeg;base64,${MAIL_LOGO_ATTACHMENT.contentBase64}" alt="La Folie Coffee"`,
    );
    expect(preview.attachments.at(-1)).toEqual({
      filename: MAIL_LOGO_ATTACHMENT.filename,
      contentType: "image/jpeg",
      inline: true,
    });
  });
});
