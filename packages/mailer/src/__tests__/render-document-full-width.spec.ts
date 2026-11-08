import type { ImageBlock, MailBlock, MailDocument } from "@lfd/mail-blocks";

import { DOCUMENT_CLASSES } from "../document-theme.js";
import type { LayoutInput } from "../html.js";
import { STARTING_MAIL_CHARTER } from "../render-charter.js";
import { renderMailDocument, type MailDocumentRenderOptions } from "../render-document.js";
import { renderMailDocumentParts } from "../render-document-parts.js";

/** L'image pleine largeur (Hugo, 2026-11-08) : bord à bord, comme le bandeau. */

const BANDED: LayoutInput = { title: "Titre", body: "Corps", footer: "Pied", brand: "Enseigne" };
const BARE: LayoutInput = { title: "Titre", body: "Corps", footer: "Pied" };
const OPTIONS: MailDocumentRenderOptions = {
  charter: "lfc",
  locale: "fr",
  declaredSections: ["title", "body", "footer"],
};
const SRC = "https://mail.lfc.test/templates/abc.png";
const FULL: ImageBlock = {
  id: "full",
  kind: "image",
  src: SRC,
  alt: { fr: "Le fournil" },
  width: "full",
};
const RADIUS = STARTING_MAIL_CHARTER.radius;
const TITLE: MailBlock = { id: "model:title", kind: "model", section: "title" };
const BODY: MailBlock = { id: "model:body", kind: "model", section: "body" };
const FOOTER: MailBlock = { id: "model:footer", kind: "model", section: "footer" };

function documentOf(...blocks: readonly MailBlock[]): MailDocument {
  return { template: "customer.test", blocks };
}

function render(input: LayoutInput, ...blocks: readonly MailBlock[]): string {
  return renderMailDocument(input, documentOf(...blocks), OPTIONS);
}

/** La ligne de carte de l'image : `<tr><td …>` jusqu'à sa fermeture. */
function imageRow(html: string): string {
  const start = html.indexOf('<tr><td style="padding:', html.indexOf(`src="${SRC}"`) - 200);
  return html.slice(start, html.indexOf("</td></tr>", start));
}

describe("l'image pleine largeur — bord à bord", () => {
  const html = render(BANDED, TITLE, FULL, BODY, FOOTER);

  it("se rend en pixels pour Outlook, en bloc et sans bordure", () => {
    expect(html).toContain(
      `<img src="${SRC}" alt="Le fournil" width="558" style="display:block;width:100%;max-width:558px;height:auto;border:0;" />`,
    );
  });

  it("coupe le corps : le contenu au-dessus, l'image hors marges, le contenu en dessous", () => {
    const cells = html.match(/<tr><td style="padding:[^"]*">/gu) ?? [];
    expect(cells).toEqual([
      '<tr><td style="padding:32px 32px 8px;">',
      '<tr><td style="padding:20px 0 0px;font-size:0;line-height:0;">',
      '<tr><td style="padding:20px 32px 8px;">',
    ]);
    expect(html.indexOf("Titre")).toBeLessThan(html.indexOf(SRC));
    expect(html.indexOf(SRC)).toBeLessThan(html.indexOf("Corps"));
  });

  it("ne laisse pas d'espace sous l'image : cellule sans hauteur de ligne", () => {
    expect(imageRow(html)).toContain("font-size:0;line-height:0;");
  });
});

describe("l'image pleine largeur — sa place dans la carte", () => {
  it("collée au bandeau quand elle le suit, sans arrondi", () => {
    const row = imageRow(render(BANDED, FULL, TITLE, BODY, FOOTER));
    expect(row).toContain('style="padding:0px 0 0px;font-size:0;line-height:0;"');
    expect(row).not.toContain("border-radius");
  });

  it("premier élément sans bandeau : l'arrondi du haut de la carte", () => {
    const row = imageRow(render(BARE, FULL, TITLE, BODY, FOOTER));
    expect(row).toContain(`border-radius:${RADIUS} ${RADIUS} 0 0;`);
    expect(row).toContain("padding:0px 0 0px;");
  });

  it("dernier élément sans pied : l'arrondi du bas de la carte, collée au bord", () => {
    const row = imageRow(render(BANDED, TITLE, BODY, FOOTER, FULL));
    expect(row).toContain(`border-radius:0 0 ${RADIUS} ${RADIUS};`);
    expect(row).toContain('style="padding:20px 0 0px;');
  });

  it("dernier élément avant le recours : espacée du pied, sans arrondi", () => {
    const html = render({ ...BANDED, supportEmail: "aide@lfc.test" }, TITLE, BODY, FOOTER, FULL);
    expect(imageRow(html)).toContain("padding:20px 0 24px;");
    expect(imageRow(html)).not.toContain("border-radius");
  });

  it("une image sans texte de remplacement ne coupe rien", () => {
    const html = render(BANDED, TITLE, { ...FULL, alt: {} }, BODY, FOOTER);
    expect(html).not.toContain(SRC);
    expect(html.match(/<tr><td style="padding:[^"]*">/gu)).toEqual([
      '<tr><td style="padding:32px 32px 8px;">',
    ]);
  });
});

describe("l'image pleine largeur — rien ne change sans elle", () => {
  it("une image « dans le texte » rend les octets d'une image sans largeur", () => {
    const content: ImageBlock = { ...FULL, width: "content" };
    const absent: ImageBlock = { id: "full", kind: "image", src: SRC, alt: { fr: "Le fournil" } };
    expect(render(BANDED, TITLE, content, FOOTER)).toBe(render(BANDED, TITLE, absent, FOOTER));
    expect(render(BANDED, TITLE, content, FOOTER)).toContain('width="100%"');
  });

  it("dans une colonne (refusé à l'enregistrement), elle reste à la largeur de sa cellule", () => {
    const html = render(BANDED, TITLE, {
      id: "c",
      kind: "columns",
      widths: [50, 50],
      cells: [[FULL], []],
    });
    expect(html).toContain('width="100%"');
    expect(html).not.toContain('width="558"');
  });
});

describe("l'image pleine largeur — les trois audiences, et le sombre", () => {
  const framed: ImageBlock = { ...FULL, format: "2:1", focal: { x: 0.25, y: 0.75 } };

  it("l'envoi ne porte ni marque ni recadrage d'aperçu", () => {
    const html = render(BANDED, TITLE, framed, FOOTER);
    expect(html).not.toContain("data-image");
    expect(html).not.toContain("aspect-ratio");
  });

  it("l'aperçu fidèle recadre un brouillon, en pleine largeur aussi", () => {
    const html = renderMailDocument(BANDED, documentOf(TITLE, framed, FOOTER), {
      ...OPTIONS,
      framePreviewImages: true,
    });
    expect(html).toContain(
      'width="558" style="display:block;width:100%;max-width:558px;height:auto;border:0;aspect-ratio:2;object-fit:cover;object-position:25% 75%;"',
    );
  });

  it("le canevas rend la même ligne, avec ses marques", () => {
    const parts = renderMailDocumentParts(BARE, documentOf(framed, TITLE, FOOTER), OPTIONS);
    const fragment = parts.blocks.find((block) => block.blockId === "full")?.html ?? "";
    expect(fragment).toContain(
      'width="558" data-image-format="2:1" data-image-focal-x="0.25" data-image-focal-y="0.75" data-image-width="full"',
    );
    expect(fragment).toContain(`border-radius:${RADIUS} ${RADIUS} 0 0;`);
    expect(fragment.startsWith('<table role="presentation" width="100%"')).toBe(true);
  });

  it("l'aperçu à sections marquées nomme la ligne de l'image", () => {
    const html = render({ ...BANDED, markSections: true }, TITLE, FULL, FOOTER);
    expect(html).toContain('<tr><td data-mail-block="full" style="padding:20px 0 0px;');
  });

  it("garde la variante sombre : la carte thémée, l'image sans fond propre", () => {
    const html = render(BANDED, TITLE, FULL, FOOTER);
    expect(html).toContain(`class="${DOCUMENT_CLASSES.card}"`);
    expect(html).toContain("prefers-color-scheme:dark");
    expect(imageRow(html)).not.toContain("background");
  });
});
