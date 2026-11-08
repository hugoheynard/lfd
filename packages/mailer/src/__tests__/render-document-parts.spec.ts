import type { MailBlock, MailDocument } from "@lfd/mail-blocks";

import { renderLayout, type LayoutInput } from "../html.js";
import type { LayoutSectionId } from "../layout-sections.js";
import { renderMailDocument, type MailDocumentRenderOptions } from "../render-document.js";
import { renderMailDocumentParts } from "../render-document-parts.js";

const INPUT: LayoutInput = {
  title: "Titre <b>",
  body: "Corps",
  cta: { label: "Voir", url: "https://lfc.test/c" },
  secondaryLink: { label: "Gérer", url: "https://lfc.test/g" },
  footer: "Pied",
  brand: "Enseigne",
  kicker: "Commande prête",
  supportEmail: "aide@lfc.test",
};

const DECLARED: readonly LayoutSectionId[] = ["title", "body", "cta", "secondaryLink", "footer"];

const OPTIONS: MailDocumentRenderOptions = {
  charter: "lfc",
  locale: "fr",
  declaredSections: DECLARED,
};

function model(section: "title" | "body" | "cta" | "footer"): MailBlock {
  return { id: `model:${section}`, kind: "model", section };
}

const PARAGRAPH: MailBlock = {
  id: "free-1",
  kind: "paragraph",
  text: { fr: "Merci <script>alert(1)</script>", en: "Thanks" },
};

const DOCUMENT: MailDocument = {
  template: "customer.test",
  blocks: [model("title"), PARAGRAPH, model("body"), model("cta"), model("footer")],
};

describe("le document découpé en blocs (S5f)", () => {
  const parts = renderMailDocumentParts(INPUT, DOCUMENT, OPTIONS);

  it("rend un fragment par bloc, dans l'ordre du document", () => {
    expect(parts.blocks.map((block) => block.blockId)).toEqual([
      "model:title",
      "free-1",
      "model:body",
      "model:cta",
      "model:footer",
    ]);
  });

  it("chaque fragment est une portion de l'e-mail envoyé, à l'octet (hors marqueur de bloc libre)", () => {
    const sent = renderMailDocument(INPUT, DOCUMENT, OPTIONS);
    for (const block of parts.blocks) {
      const unmarked = block.html
        .replace(/<span data-free-block="[^"]*" data-locale="[a-z]+">/gu, "")
        .replace(/<\/span>/gu, "");
      expect({ id: block.blockId, inSent: sent.includes(unmarked) }).toEqual({
        id: block.blockId,
        inSent: true,
      });
    }
  });

  it("le bouton porte son lien secondaire : un seul bloc", () => {
    const cta = parts.blocks.find((block) => block.blockId === "model:cta");
    expect(cta?.html).toContain("https://lfc.test/c");
    expect(cta?.html).toContain("https://lfc.test/g");
  });

  it("marque le texte d'un bloc libre de son identifiant et de sa langue, échappé", () => {
    const free = parts.blocks.find((block) => block.blockId === "free-1");
    expect(free?.html).toContain(
      '<span data-free-block="free-1" data-locale="fr">Merci &lt;script&gt;alert(1)&lt;/script&gt;</span>',
    );
    expect(free?.html).not.toContain("<script");
  });

  it("donne aux cadres leur table, l'en-tête avec son surtitre, le pied avec le recours", () => {
    expect(parts.header).toMatch(/^<table role="presentation"[^>]*><tr>/u);
    expect(parts.header).toContain("Commande prête");
    expect(parts.footer).toMatch(/^<table role="presentation"[^>]*><tr>/u);
    expect(parts.footer).toContain("aide@lfc.test");
  });

  it("sans recours ni bandeau, les cadres sont vides", () => {
    const bare = renderMailDocumentParts({ title: "T", body: "B" }, DOCUMENT, OPTIONS);
    expect(bare.header).toBe("");
    expect(bare.footer).toBe("");
  });

  it("l'envoi ne porte jamais le marqueur des blocs libres", () => {
    expect(renderMailDocument(INPUT, DOCUMENT, OPTIONS)).not.toContain("data-free-block");
    expect(renderLayout(INPUT)).not.toContain("data-free-block");
  });
});

describe("les blocs rangés dans des colonnes (canevas)", () => {
  const COLUMNS: MailBlock = {
    id: "cols-1",
    kind: "columns",
    widths: [50, 50],
    cells: [
      [
        { id: "in-text", kind: "paragraph", text: { fr: "Gauche", en: "Left" } },
        { id: "in-rule", kind: "divider" },
      ],
      [{ id: "in-image", kind: "image", src: "https://lfc.test/i.png", alt: { fr: "Pain" } }],
    ],
  };
  const document: MailDocument = { template: "customer.test", blocks: [model("title"), COLUMNS] };
  const parts = renderMailDocumentParts(INPUT, document, OPTIONS);

  it("rend un fragment par bloc de cellule, identifié par l'id du bloc, dans l'ordre", () => {
    expect(parts.cellBlocks.map((block) => block.blockId)).toEqual([
      "in-text",
      "in-rule",
      "in-image",
    ]);
  });

  it("chaque fragment de cellule est la portion même de la mise en page", () => {
    const layout = parts.blocks.find((block) => block.blockId === "cols-1")?.html ?? "";
    for (const block of parts.cellBlocks) {
      expect(block.html).not.toBe("");
      expect(layout).toContain(block.html);
    }
    expect(parts.cellBlocks[0]?.html).toContain('data-free-block="in-text"');
  });

  it("la mise en page entière garde son fragment", () => {
    expect(parts.blocks.map((block) => block.blockId)).toEqual(["model:title", "cols-1"]);
  });

  it("un document sans colonnes n'a aucun fragment de cellule", () => {
    expect(renderMailDocumentParts(INPUT, DOCUMENT, OPTIONS).cellBlocks).toEqual([]);
  });
});
