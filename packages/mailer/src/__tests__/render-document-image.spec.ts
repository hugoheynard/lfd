import type { ImageBlock, MailBlock, MailDocument } from "@lfd/mail-blocks";

import type { LayoutInput } from "../html.js";
import { IMAGE_LINK_STYLE, IMAGE_STYLE } from "../layout-styles.js";
import { renderMailDocument, type MailDocumentRenderOptions } from "../render-document.js";

/** Le bloc image (plan `plan-editeur-par-blocs.md`, § 19, S5d). */

const INPUT: LayoutInput = { title: "Titre", body: "Corps", footer: "Pied", brand: "Enseigne" };
const OPTIONS: MailDocumentRenderOptions = {
  charter: "lfc",
  locale: "fr",
  declaredSections: ["title", "body", "footer"],
};
const SRC = "https://mail.lfc.test/templates/abc.png";
const IMAGE: ImageBlock = {
  id: "i",
  kind: "image",
  src: SRC,
  alt: { fr: "Un pain « maison »", en: "A loaf" },
};

function rendered(block: MailBlock): string {
  const document: MailDocument = {
    template: "customer.test",
    blocks: [
      { id: "model:title", kind: "model", section: "title" },
      block,
      { id: "model:footer", kind: "model", section: "footer" },
    ],
  };
  return renderMailDocument(INPUT, document, OPTIONS);
}

describe("le bloc image", () => {
  it("rend un <img> pleine largeur, son texte de remplacement échappé, le style de la constante", () => {
    expect(rendered(IMAGE)).toContain(
      `<img src="${SRC}" alt="Un pain « maison »" width="100%" style="${IMAGE_STYLE}" />`,
    );
  });

  it("s'enveloppe d'un lien quand il en a un", () => {
    const html = rendered({ ...IMAGE, href: "https://lfc.test/pain" });
    expect(html).toContain(`<a href="https://lfc.test/pain" style="${IMAGE_LINK_STYLE}"><img`);
  });

  it("une image décorative rend un alt vide, voulu, et pas de lien", () => {
    const html = rendered({ ...IMAGE, alt: {}, decorative: true, href: "https://lfc.test/x" });
    expect(html).toContain(`<img src="${SRC}" alt=""`);
    expect(html).not.toContain("https://lfc.test/x");
  });

  it("ne rend rien sans texte dans la langue de l'envoi, sans adresse, ou sur une adresse hostile", () => {
    expect(rendered({ ...IMAGE, alt: { en: "A loaf" } })).not.toContain("<img src");
    expect(rendered({ ...IMAGE, src: "" })).not.toContain("<img src");
    expect(rendered({ ...IMAGE, src: "javascript:alert(1)" })).not.toContain("javascript:");
  });

  it("se rend dans une colonne", () => {
    const html = rendered({ id: "c", kind: "columns", widths: [50, 50], cells: [[IMAGE], []] });
    expect(html).toMatch(/<td class="lfd-col"[^>]*><table role="presentation"[^>]*><tr><td><img/);
  });
});
