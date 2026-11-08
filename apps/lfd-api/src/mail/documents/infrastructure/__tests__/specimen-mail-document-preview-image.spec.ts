import { startingMailDocument, type ImageBlock, type MailDocument } from "@lfd/mail-blocks";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { PublishedChartersOnly } from "../../../templates/effective-copy/__tests__/published-charters.double.js";
import { withInlineImages } from "../../../copy/infrastructure/specimen-mail-preview.renderer.js";
import { mailBrandingOf } from "../../../templates/mail-branding.js";
import { b2bMailTemplates } from "../../../templates/mail-templates.js";
import { mailCaseDataOf } from "../../../templates/specimens/cases/mail-specimen-cases.js";
import { renderMailData } from "../../../templates/specimens/mail-specimens.js";
import { mailBlockDeclarationOf } from "../../../templates/sections/mail-block-declarations.js";
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

const CONFIG = new PreviewAppConfig();
const TEMPLATE = "staff.invited";
const SOURCE = "https://media.lfc.test/products/vitrine.png";
const CROP = "aspect-ratio:2;object-fit:cover;object-position:50% 50%;";

const DRAFT_IMAGE: ImageBlock = {
  id: "image",
  kind: "image",
  src: SOURCE,
  alt: { fr: "La vitrine" },
  format: "2:1",
};

function documentWith(image: ImageBlock): MailDocument {
  const starting = startingMailDocument(TEMPLATE, mailBlockDeclarationOf(TEMPLATE));
  return { ...starting, blocks: [...starting.blocks, image] };
}

async function faithful(document: MailDocument): Promise<string> {
  const renderer = new SpecimenMailDocumentPreviewRenderer(CONFIG, new PublishedChartersOnly({}));
  return (await renderer.render(TEMPLATE, "specimen", "fr", {}, document)).html;
}

/** Le même document posé comme l'envoi le pose : sans l'option de l'aperçu. */
function sent(document: MailDocument): string {
  const data = mailCaseDataOf(TEMPLATE, "specimen", "fr");
  if (data === null) {
    throw new TypeError("cas specimen introuvable");
  }
  return withInlineImages(
    renderMailData(
      b2bMailTemplates(mailBrandingOf(CONFIG)),
      TEMPLATE,
      data,
      { fr: {} },
      { orders: {}, markers: false, documents: { [TEMPLATE]: { document, locale: "fr" } } },
    ),
  );
}

/**
 * Régression : une image posée en 2:1 dans un brouillon apparaissait ENTIÈRE
 * dans l'aperçu fidèle — le brouillon n'a pas de copie recadrée (2026-11-08).
 */
describe("l'aperçu fidèle d'un brouillon recadre son image cadrée", () => {
  it("l'image 2:1 d'un brouillon s'affiche recadrée dans l'aperçu fidèle", async () => {
    const html = await faithful(documentWith(DRAFT_IMAGE));
    expect(html).toContain(`<img src="${SOURCE}"`);
    expect(html).toContain(CROP);
  });

  it("l'envoi du même document ne porte aucun recadrage", () => {
    expect(sent(documentWith(DRAFT_IMAGE))).toContain(`<img src="${SOURCE}"`);
    expect(sent(documentWith(DRAFT_IMAGE))).not.toContain("object-fit");
  });

  it("une image publiée (avec sa copie) s'affiche dans l'aperçu comme elle part", async () => {
    const published = documentWith({
      ...DRAFT_IMAGE,
      copySrc: "https://mail.lfc.test/templates/copie.png",
    });
    expect(await faithful(published)).toBe(sent(published));
  });
});
