import type { ImageBlock, MailBlock, MailDocument } from "@lfd/mail-blocks";

import type { LayoutInput } from "../html.js";
import { IMAGE_LINK_STYLE, IMAGE_STYLE } from "../layout-styles.js";
import { renderFreeBlock } from "../document-blocks.js";
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

describe("le cadrage d'une image (§ 19, « Format et point focal »)", () => {
  const FRAMED: ImageBlock = { ...IMAGE, format: "3:2", focal: { x: 0.2, y: 0.8 } };

  it("un e-mail envoyé n'en porte rien : l'image publiée est déjà au format", () => {
    expect(rendered(FRAMED)).toContain(
      `<img src="${SRC}" alt="Un pain « maison »" width="100%" style="${IMAGE_STYLE}" />`,
    );
    expect(rendered(FRAMED)).not.toContain("data-image");
  });

  it("l'aperçu de l'éditeur le signale pour que l'écran recadre la source", () => {
    expect(renderFreeBlock(FRAMED, "fr", true)).toContain(
      'width="100%" data-image-format="3:2" data-image-focal-x="0.2" data-image-focal-y="0.8" style=',
    );
  });

  it("l'aperçu d'un format sans point focal signale le centre ; l'original, rien", () => {
    expect(renderFreeBlock({ ...IMAGE, format: "1:1" }, "fr", true)).toContain(
      'data-image-format="1:1" data-image-focal-x="0.5" data-image-focal-y="0.5"',
    );
    expect(
      renderFreeBlock({ ...IMAGE, format: "original", focal: { x: 0, y: 0 } }, "fr", true),
    ).not.toContain("data-image");
  });
});

describe("la copie publiée et la source (copySrc)", () => {
  const COPY = "https://mail.lfc.test/templates/carree.png";
  const SOURCE = "https://media.lfc.test/products/vitrine.png";
  const PUBLISHED: ImageBlock = { ...IMAGE, src: SOURCE, format: "1:1", copySrc: COPY };

  it("l'envoi lit la copie, jamais la source", () => {
    expect(rendered(PUBLISHED)).toContain(`<img src="${COPY}"`);
    expect(rendered(PUBLISHED)).not.toContain(SOURCE);
  });

  it("l'aperçu de l'éditeur lit la source, que l'écran recadre", () => {
    expect(renderFreeBlock(PUBLISHED, "fr", true)).toContain(`<img src="${SOURCE}"`);
  });

  it("une version publiée avant copySrc (la copie dans src) s'envoie comme avant", () => {
    expect(rendered(IMAGE)).toContain(`<img src="${SRC}"`);
  });
});
