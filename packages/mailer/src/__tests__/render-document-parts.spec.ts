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
