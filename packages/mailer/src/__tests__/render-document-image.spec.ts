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

  /**
   * Régression : « deux photos en 50/50 n'ont pas la même hauteur » (2026-11-08).
   * Une image 3:2 prend toute la largeur de sa colonne : même largeur de
   * colonne, même hauteur d'image — à 6/6, 4/4/4 et 3/3/6 douzièmes.
   */
  it.each([
    [[50, 50], [[0, 1]]],
    [[33, 33, 33], [[0, 1, 2]]],
    [[25, 25, 50], [[0, 1]]],
  ] as const)(
    "des images 3:2 dans des colonnes de même cran ont la même largeur (%j)",
    (widths, groups) => {
      const html = rendered({
        id: "c",
        kind: "columns",
        widths: [...widths],
        cells: widths.map(() => [{ ...IMAGE, format: "3:2" as const }]),
      });
      const cells = [
        ...html.matchAll(
          /<td class="lfd-col" width="([\d.]+)%"[^>]*><table[^>]*><tr><td><img[^>]*width="100%"/gu,
        ),
      ].map((match) => match[1]);
      expect(cells).toHaveLength(widths.length);
      for (const group of groups) {
        expect(new Set(group.map((index) => cells[index])).size).toBe(1);
      }
    },
  );
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
    expect(renderFreeBlock(FRAMED, "fr", "canvas")).toContain(
      'width="100%" data-image-format="3:2" data-image-focal-x="0.2" data-image-focal-y="0.8" style=',
    );
  });

  it("l'aperçu d'un format sans point focal signale le centre ; l'original, rien", () => {
    expect(renderFreeBlock({ ...IMAGE, format: "1:1" }, "fr", "canvas")).toContain(
      'data-image-format="1:1" data-image-focal-x="0.5" data-image-focal-y="0.5"',
    );
    expect(
      renderFreeBlock({ ...IMAGE, format: "original", focal: { x: 0, y: 0 } }, "fr", "canvas"),
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
    expect(renderFreeBlock(PUBLISHED, "fr", "canvas")).toContain(`<img src="${SOURCE}"`);
  });

  it("une version publiée avant copySrc (la copie dans src) s'envoie comme avant", () => {
    expect(rendered(IMAGE)).toContain(`<img src="${SRC}"`);
  });
});

/**
 * Régression : une image posée en 2:1 dans un brouillon apparaissait ENTIÈRE
 * dans l'aperçu fidèle — le brouillon n'a pas encore de copie recadrée (2026-11-08).
 */
describe("l'aperçu fidèle recadre l'image d'un brouillon (framePreviewImages)", () => {
  const DRAFT: ImageBlock = { ...IMAGE, format: "2:1", focal: { x: 0.25, y: 0.75 } };
  const CROP = "aspect-ratio:2;object-fit:cover;object-position:25% 75%;";

  function previewed(block: MailBlock): string {
    const document: MailDocument = { template: "customer.test", blocks: [block] };
    return renderMailDocument(INPUT, document, { ...OPTIONS, framePreviewImages: true });
  }

  it("une image 2:1 sans copie s'affiche recadrée au point focal", () => {
    expect(previewed(DRAFT)).toContain(`<img src="${SRC}"`);
    expect(previewed(DRAFT)).toContain(`style="${IMAGE_STYLE}${CROP}"`);
  });

  it("dans une colonne aussi", () => {
    expect(
      previewed({ id: "c", kind: "columns", widths: [50, 50], cells: [[DRAFT], []] }),
    ).toContain(CROP);
  });

  it("sans l'option (l'envoi), rien ne change", () => {
    expect(rendered(DRAFT)).toContain(`style="${IMAGE_STYLE}" />`);
    expect(rendered(DRAFT)).not.toContain("object-fit");
  });

  it("une image qui a sa copie publiée n'est pas recadrée : la copie est au format", () => {
    const html = previewed({ ...DRAFT, copySrc: "https://mail.lfc.test/templates/copie.png" });
    expect(html).toContain(`<img src="https://mail.lfc.test/templates/copie.png"`);
    expect(html).not.toContain("object-fit");
  });

  it("une image en original n'est pas recadrée", () => {
    expect(previewed({ ...DRAFT, format: "original" })).not.toContain("object-fit");
  });

  it("aucun marqueur du canevas n'y entre", () => {
    expect(previewed(DRAFT)).not.toContain("data-image");
  });
});
