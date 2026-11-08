import type { MailBlock, MailDocument } from "@lfd/mail-blocks";

import { renderLayout, type LayoutInput } from "../html.js";
import type { LayoutSectionId } from "../layout-sections.js";
import {
  BUTTON_STYLE,
  CALLOUT_TEXT_STYLE,
  RULE_STYLE,
  TEXT_STYLE,
  TITLE_TEXT_STYLE,
} from "../layout-styles.js";
import { MAIL_CHARTER_DARK } from "../document-theme.js";
import {
  isRearrangedDocument,
  renderMailDocument,
  type MailDocumentRenderOptions,
} from "../render-document.js";

const INPUT: LayoutInput = {
  title: "Titre",
  body: "Corps",
  cta: { label: "Voir", url: "https://lfc.test/c" },
  secondaryLink: { label: "Gérer", url: "https://lfc.test/g" },
  footer: "Pied",
  brand: "Enseigne",
};

/** Un modèle qui ne déclare ni récapitulatif, ni image, ni itinéraire. */
const DECLARED: readonly LayoutSectionId[] = ["title", "body", "cta", "secondaryLink", "footer"];

const OPTIONS: MailDocumentRenderOptions = {
  charter: "lfc",
  locale: "fr",
  declaredSections: DECLARED,
};

function model(section: "title" | "body" | "cta" | "footer"): MailBlock {
  return { id: `model:${section}`, kind: "model", section };
}

function documentOf(...blocks: readonly MailBlock[]): MailDocument {
  return { template: "customer.test", blocks };
}

const STARTING = documentOf(model("title"), model("body"), model("cta"), model("footer"));

describe("le document de départ : la coquille, à l'octet", () => {
  it("l'ordre du code rend la coquille sans ordre", () => {
    expect(renderMailDocument(INPUT, STARTING, OPTIONS)).toBe(renderLayout(INPUT));
  });

  it("un autre ordre des blocs du modèle rend la coquille avec cet ordre de sections", () => {
    const moved = documentOf(model("footer"), model("cta"), model("title"), model("body"));
    const order: readonly LayoutSectionId[] = ["footer", "cta", "secondaryLink", "title", "body"];

    expect(renderMailDocument(INPUT, moved, OPTIONS)).toBe(
      renderLayout({ ...INPUT, sections: order }),
    );
  });

  it("n'émet ni <head>, ni variante sombre, ni règle @media", () => {
    const html = renderMailDocument(INPUT, STARTING, OPTIONS);

    expect(html).not.toContain("<head>");
    expect(html).not.toContain("prefers-color-scheme");
    expect(html).not.toContain("@media");
  });

  it("ignore un ordre de sections passé dans l'entrée : c'est le document qui ordonne", () => {
    const withOrder: LayoutInput = { ...INPUT, sections: ["footer", "title"] };

    expect(renderMailDocument(withOrder, STARTING, OPTIONS)).toBe(renderLayout(INPUT));
  });

  it("n'est pas un document réarrangé", () => {
    expect(isRearrangedDocument(STARTING)).toBe(false);
  });
});

const NOTICE: MailBlock = {
  id: "free:1",
  kind: "callout",
  tone: "warning",
  text: { fr: "Fermé le 1er mai", en: "Closed on May 1st" },
};

describe("un document réarrangé", () => {
  const rearranged = documentOf(
    model("title"),
    NOTICE,
    model("body"),
    model("cta"),
    model("footer"),
  );

  it("place le bloc libre entre les blocs du modèle, le lien secondaire suivant son bouton", () => {
    const html = renderMailDocument(INPUT, rearranged, OPTIONS);
    const at = (text: string): number => html.indexOf(text);

    expect(isRearrangedDocument(rearranged)).toBe(true);
    expect(at("Titre")).toBeLessThan(at("Fermé le 1er mai"));
    expect(at("Fermé le 1er mai")).toBeLessThan(at("Corps"));
    expect(at("Voir")).toBeLessThan(at("Gérer"));
    expect(at("Gérer")).toBeLessThan(at("Pied"));
  });

  it("émet la variante sombre de sa charte et l'empilement des colonnes", () => {
    const html = renderMailDocument(INPUT, rearranged, { ...OPTIONS, charter: "internal" });

    expect(html).toContain('<meta name="color-scheme" content="light dark" />');
    expect(html).toContain("@media (prefers-color-scheme:dark)");
    expect(html).toContain(MAIL_CHARTER_DARK.internal.page);
    expect(html).toContain("@media only screen and (max-width:600px)");
    expect(html).toContain('<body class="lfd-page"');
  });

  it("garde la police de l'enseigne dans son <head>", () => {
    const html = renderMailDocument(
      { ...INPUT, brandFontUrl: "https://cdn.lfc.test/chunk.woff2" },
      rearranged,
      OPTIONS,
    );

    expect(html).toContain("@font-face{font-family:'Chunk'");
    expect(html.match(/<head>/gu)).toHaveLength(1);
  });

  it("parle la langue de l'envoi", () => {
    const html = renderMailDocument(INPUT, rearranged, { ...OPTIONS, locale: "en" });

    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Closed on May 1st");
    expect(html).not.toContain("Fermé le 1er mai");
  });

  it("ne rend rien d'un texte manquant dans la langue de l'envoi — aucun repli inventé", () => {
    const html = renderMailDocument(INPUT, rearranged, { ...OPTIONS, locale: "it" });

    expect(html).not.toContain("Fermé le 1er mai");
    expect(html).not.toContain("Closed on May 1st");
  });

  it("garde la ligne vide des sections que le modèle ne déclare pas, après le document", () => {
    const html = renderMailDocument(INPUT, rearranged, OPTIONS);

    expect(html).toContain("Pied</p>\n        \n        \n      </td></tr>");
  });

  it("nomme ses blocs libres pour l'aperçu, jamais pour un envoi", () => {
    const marked = renderMailDocument({ ...INPUT, markSections: true }, rearranged, OPTIONS);
    const sent = renderMailDocument(INPUT, rearranged, OPTIONS);

    expect(marked).toContain('<div data-mail-block="free:1">');
    expect(marked).toContain('<div data-mail-section="title">');
    expect(sent).not.toContain("data-mail-block");
  });
});

describe("les blocs libres : les styles de la coquille, jamais une copie", () => {
  function rendered(block: MailBlock): string {
    return renderMailDocument(INPUT, documentOf(...STARTING.blocks, block), OPTIONS);
  }

  it("un titre prend le texte du titre de la coquille", () => {
    expect(rendered({ id: "h", kind: "heading", text: { fr: "Nouveau" } })).toContain(
      `<h2 style="margin:24px 0 12px;${TITLE_TEXT_STYLE}">Nouveau</h2>`,
    );
  });

  it("un paragraphe prend le texte courant, retours à la ligne gardés, et s'échappe", () => {
    expect(rendered({ id: "p", kind: "paragraph", text: { fr: "a <b>\nc" } })).toContain(
      `<p style="margin:16px 0 0;${TEXT_STYLE}">a &lt;b&gt;\nc</p>`,
    );
  });

  it("un encadré prend le corps et sa teinte", () => {
    const html = rendered(NOTICE);

    expect(html).toContain(`<p style="${CALLOUT_TEXT_STYLE}">Fermé le 1er mai</p>`);
    expect(html).toContain('class="lfd-callout-warning"');
  });

  it("un bouton prend le style du bouton principal", () => {
    const button: MailBlock = {
      id: "b",
      kind: "button",
      label: { fr: "Nos horaires" },
      href: "https://lfc.test/horaires",
    };

    expect(rendered(button)).toContain(
      `<a href="https://lfc.test/horaires" style="${BUTTON_STYLE}">Nos horaires</a>`,
    );
  });

  it("un bouton vers une adresse qui n'est pas un lien web ne se rend pas", () => {
    const hostile: MailBlock = {
      id: "b",
      kind: "button",
      label: { fr: "Piège" },
      href: "javascript:alert(1)",
    };

    expect(rendered(hostile)).not.toContain("Piège");
  });

  it("un séparateur prend le filet du recours", () => {
    expect(rendered({ id: "d", kind: "divider" })).toContain(
      `<hr style="${RULE_STYLE}margin:24px 0;" />`,
    );
  });
});

describe("les colonnes", () => {
  const columns: MailBlock = {
    id: "c",
    kind: "columns",
    widths: [33, 33, 33],
    cells: [
      [{ id: "c1", kind: "heading", text: { fr: "Un" } }],
      [{ id: "c2", kind: "heading", text: { fr: "Deux" } }],
      [{ id: "c3", kind: "button", label: { fr: "Trois" }, href: "https://lfc.test/3" }],
    ],
  };

  it("se rendent en tableau, une cellule par largeur, la gouttière à gauche de la dernière", () => {
    const html = renderMailDocument(INPUT, documentOf(...STARTING.blocks, columns), OPTIONS);
    const cells = html.match(/<td class="lfd-col" width="(\d+)%" valign="top"/gu);

    expect(cells).toHaveLength(3);
    expect(html).toContain("padding:0 12px 0 0;");
    expect(html.indexOf("Un")).toBeLessThan(html.indexOf("Deux"));
    expect(html.indexOf("Deux")).toBeLessThan(html.indexOf("Trois"));
  });

  /** Les crans sont des douzièmes arrondis : la dernière colonne prend le reste (2026-11-08). */
  it("une ligne fait toujours 100 % : 33 + 33 + 34, 17 + 17 + 66", () => {
    const widthsIn = (html: string): number[] =>
      [...html.matchAll(/<td class="lfd-col" width="(\d+)%"/gu)].map((match) => Number(match[1]));

    expect(
      widthsIn(renderMailDocument(INPUT, documentOf(...STARTING.blocks, columns), OPTIONS)),
    ).toEqual([33, 33, 34]);
    const narrow: MailBlock = { ...columns, widths: [17, 17, 67] };
    expect(
      widthsIn(renderMailDocument(INPUT, documentOf(...STARTING.blocks, narrow), OPTIONS)),
    ).toEqual([17, 17, 66]);
  });
});
