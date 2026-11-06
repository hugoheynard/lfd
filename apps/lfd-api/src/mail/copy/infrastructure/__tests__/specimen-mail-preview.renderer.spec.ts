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
    const preview = renderer.render(mail, "fr", {}, null);

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

describe("l'aperçu repéré (E4, S4)", () => {
  const renderer = new SpecimenMailPreviewRenderer(new PreviewAppConfig());

  it("pose un repère par section et par texte, et garde l'objet sans repère", () => {
    const preview = renderer.render("customer.order-placed", "fr", {}, null);

    expect(preview.html).toContain('<div data-mail-section="title">');
    expect(preview.html).toContain('<div data-mail-section="image">');
    expect(preview.html).toContain('<div data-mail-section="itinerary">');
    expect(preview.html).toContain(
      '<span data-mail-text="title" data-mail-text-of="customer.order-placed">',
    );
    expect(preview.html).toContain('<span data-mail-text="kicker"');
    expect(preview.html).not.toMatch(/[-]/u);
    expect(preview.subject).toBe("Votre commande EXEMPLE-0001 — La Folie Coffee");
  });

  // Un e-mail de l'ÉQUIPE : les e-mails clients n'ont plus de recours (2026-10-28).
  it("rend les sections dans l'ordre donné, l'en-tête et le recours à leur place", () => {
    const preview = renderer.render("staff.invited", "fr", {}, ["footer", "cta", "body", "title"]);
    const at = (id: string): number => preview.html.indexOf(`data-mail-section="${id}"`);
    expect(at("footer")).toBeLessThan(at("cta"));
    expect(at("body")).toBeLessThan(at("title"));
    expect(preview.html.indexOf('data-mail-text="kicker"')).toBeLessThan(at("footer"));
    expect(at("title")).toBeLessThan(preview.html.indexOf("admin@lfc.test"));
  });
});
