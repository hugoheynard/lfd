import { AppConfig } from "../../../platform/config/app-config.js";
import { mailBrandingOf } from "../mail-branding.js";
import { b2bMailTemplates } from "../mail-templates.js";
import { RegistryMailTemplatePreview } from "../registry-mail-template-preview.js";

/** Une config qui ne lit pas l'environnement : seules la marque et ses racines comptent. */
class BrandConfig extends AppConfig {
  override clientBaseUrl(): string | null {
    return "https://shop.test/";
  }

  override adminBaseUrl(): string | null {
    return "https://bo.test";
  }

  override bootstrapAdminEmail(): string {
    return "admin@lfc.test";
  }
}

describe("l'aperçu d'un modèle par le canal (S3b)", () => {
  /*
   * L'aperçu de l'avis de vitrine passait par le registre dans `b2b/vitrine` ;
   * il passe par ce port. Ce qu'on relit doit rester ce qui part : même
   * gabarit, même marque que le mailer.
   */
  it("rend l'objet et le corps du gabarit de l'envoi, sous la marque du mailer", () => {
    const config = new BrandConfig();
    const data = { subject: "Nouvelle carte", message: "La carte d'automne arrive." };

    const preview = new RegistryMailTemplatePreview(config).render("agency.vitrine-notice", data);
    const sent = b2bMailTemplates(mailBrandingOf(config))["agency.vitrine-notice"](data);

    expect(preview).toEqual({ subject: sent.subject, html: sent.html });
    expect(preview.html).toContain("La carte d&#39;automne arrive.");
  });
});
