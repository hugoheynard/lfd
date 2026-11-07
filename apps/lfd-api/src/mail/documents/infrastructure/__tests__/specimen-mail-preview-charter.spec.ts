import {
  startingMailDocument,
  type MailCharterSettings,
  type MailDocument,
} from "@lfd/mail-blocks";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { PublishedChartersOnly } from "../../../templates/effective-copy/__tests__/published-charters.double.js";
import type { PublishedMailCharters } from "../../../templates/effective-copy/published-mail-charters.js";
import { withInlineImages } from "../../../copy/infrastructure/specimen-mail-preview.renderer.js";
import { mailBrandingOf } from "../../../templates/mail-branding.js";
import { b2bMailTemplates, type B2bMails } from "../../../templates/mail-templates.js";
import { mailCaseDataOf } from "../../../templates/specimens/cases/mail-specimen-cases.js";
import { renderMailData } from "../../../templates/specimens/mail-specimens.js";
import { mailBlockDeclarationOf } from "../../../templates/sections/mail-block-declarations.js";
import { SpecimenMailBlockPreviewRenderer } from "../specimen-mail-block-preview.renderer.js";
import { SpecimenMailDocumentPreviewRenderer } from "../specimen-mail-document-preview.renderer.js";

/** Une config qui ne lit pas l'environnement : seule la marque des e-mails compte ici. */
class PreviewAppConfig extends AppConfig {
  override bootstrapAdminEmail(): string {
    return "admin@lfc.test";
  }

  override adminBaseUrl(): string | null {
    return "https://bo.lfc.test";
  }
}

const LFD_CHARTER: MailCharterSettings = {
  logo: { src: "https://mail.lfd.test/images/logo-lfd.png", alt: { fr: "La Folie Douce" } },
  colors: {
    page: "#f4f1ea",
    card: "#fffefc",
    text: "#1b1b1b",
    mutedText: "#5a5a5a",
    primary: "#7a1f3d",
    band: "#1a3157",
    border: "#ded6c8",
  },
  darkColors: { page: "#101010", card: "#1c1c1c", text: "#f0f0f0", border: "#333333" },
  headingFont: null,
  footer: { fr: "La Folie Douce — équipe" },
};

const PUBLISHED: PublishedMailCharters = {
  lfd: { kind: "servable", settings: LFD_CHARTER, version: 1 },
};

const CONFIG = new PreviewAppConfig();
const REGISTRY = b2bMailTemplates(mailBrandingOf(CONFIG));

function startingOf(template: keyof B2bMails): MailDocument {
  return startingMailDocument(template, mailBlockDeclarationOf(template));
}

async function faithful(
  template: keyof B2bMails,
  charters: PublishedMailCharters | Error,
): Promise<string> {
  const renderer = new SpecimenMailDocumentPreviewRenderer(
    CONFIG,
    new PublishedChartersOnly(charters),
  );
  const rendered = await renderer.render(template, "specimen", "fr", {}, startingOf(template));
  return rendered.html;
}

async function fragments(
  template: keyof B2bMails,
  charters: PublishedMailCharters | Error,
): Promise<string> {
  const renderer = new SpecimenMailBlockPreviewRenderer(
    CONFIG,
    new PublishedChartersOnly(charters),
  );
  const parts = await renderer.render(
    template,
    "specimen",
    "fr",
    {},
    startingOf(template),
    new Map(),
    null,
  );
  return [parts.header, ...parts.blocks.map((block) => block.html), parts.footer].join("\n");
}

/**
 * Plan de l'éditeur par blocs, § 25, C1 — point d.2 de `les-e-mails.md` :
 * l'aperçu fidèle et le canevas rendaient la charte de départ même sous une
 * charte publiée ; seuls l'envoi, l'essai et l'aperçu de la charte la
 * montraient.
 */
describe("les rendus de l'éditeur sous la charte publiée de l'espace", () => {
  it.each(["staff.invited", "staff.account-alert"] as const)(
    "%s : l'aperçu fidèle porte les couleurs, le logo et le pied de la charte",
    async (template) => {
      const html = await faithful(template, PUBLISHED);
      expect(html).toContain("background:#f4f1ea;");
      expect(html).toContain('src="https://mail.lfd.test/images/logo-lfd.png"');
      expect(html).not.toContain("cid:lfc-logo");
      expect(html).toContain("La Folie Douce — équipe");
      // La variante sombre vit dans le `<head>` que la charte publiée pose.
      expect(html).toContain("#101010");
    },
  );

  it.each(["staff.invited", "staff.account-alert"] as const)(
    "%s : les fragments du canevas portent la couleur principale, le logo et le pied",
    async (template) => {
      const html = await fragments(template, PUBLISHED);
      expect(html).toContain('src="https://mail.lfd.test/images/logo-lfd.png"');
      expect(html).toContain("La Folie Douce — équipe");
      expect(html).toContain("#7a1f3d");
    },
  );

  it.each(["staff.invited", "staff.account-alert", "customer.password-reset"] as const)(
    "%s : sans charte publiée, les mêmes octets qu'avant",
    async (template) => {
      const data = mailCaseDataOf(template, "specimen", "fr");
      if (data === null) {
        throw new TypeError("cas specimen introuvable");
      }
      // Le rendu d'avant d.2 : le gabarit, hors de tout périmètre de charte.
      const before = withInlineImages(
        renderMailData(
          REGISTRY,
          template,
          data,
          { fr: {} },
          {
            orders: {},
            markers: false,
            documents: { [template]: { document: startingOf(template), locale: "fr" } },
          },
        ),
      );
      expect(await faithful(template, {})).toBe(before);
      expect(await faithful(template, {})).not.toContain("La Folie Douce — équipe");
      expect(await fragments(template, {})).not.toContain("La Folie Douce — équipe");
    },
  );

  it("un e-mail de l'autre espace n'est pas touché", async () => {
    const template = "customer.password-reset";
    expect(await faithful(template, PUBLISHED)).toBe(await faithful(template, {}));
    expect(await fragments(template, PUBLISHED)).toBe(await fragments(template, {}));
  });

  it("une lecture des chartes en échec rend l'aperçu avec la charte de départ", async () => {
    const template = "staff.invited";
    expect(await faithful(template, new Error("base injoignable"))).toBe(
      await faithful(template, {}),
    );
  });
});
