import type { FreeBlock, MailBlock, MailDocument } from "@lfd/mail-blocks";

import {
  renderColumnsText,
  renderFreeBlockText,
  renderMailDocumentText,
} from "../document-text.js";
import type { LayoutInput } from "../layout-input.js";
import type { LayoutSectionId } from "../layout-sections.js";
import { renderLayoutText } from "../layout-text.js";
import type { MailDocumentRenderOptions } from "../render-document.js";
import { ResendMailer, type ResendLike } from "../resend-mailer.js";
import { TEXT_LINE_WIDTH, wrapText } from "../text-format.js";
import type { TemplateRegistry } from "../types.js";

/** Ce qu'une version texte ne doit JAMAIS contenir : une balise ou une entité du rendu HTML. */
const MARKUP = /<\/?(?:p|a|h1|h2|img|table|tr|td|div|span|hr|br|html|body)\b|&(?:#\d+|[a-z]+);/iu;

const INPUT: LayoutInput = {
  title: "Commande confirmée",
  body: "Votre commande ORD-1 a bien été prise en compte.\n\nÀ demain.",
  brand: "La Folie Coffee",
  rows: [
    { label: "2 × Croissant", value: "3,00 €" },
    { label: "Total", value: "3,00 €", strong: true },
  ],
  image: { contentId: "qr", alt: "Code de retrait ORD-1", sizePx: 180, caption: "ORD-1" },
  cta: { label: "Voir ma commande", url: "https://shop.lfc.test/c/1" },
  secondaryLink: { label: "Gérer", url: "https://shop.lfc.test/g/1" },
  footer: "Merci <de> votre confiance & à bientôt",
  supportEmail: "admin@lfc.test",
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

function documentOf(...blocks: readonly MailBlock[]): MailDocument {
  return { template: "customer.test", blocks };
}

const SIMPLE: LayoutInput = {
  title: "Titre",
  body: "Corps",
  cta: { label: "Voir", url: "https://lfc.test/c" },
  footer: "Pied",
};

describe("la version texte de la coquille", () => {
  const text = renderLayoutText(INPUT);

  it("souligne le titre et sépare les paragraphes d'une ligne vide", () => {
    expect(text).toContain("Commande confirmée\n==================");
    expect(text).toContain("prise en compte.\n\nÀ demain.");
  });

  it("rend le récapitulatif en lignes, le total sous un filet", () => {
    expect(text).toContain("2 × Croissant — 3,00 €\n");
    expect(text).toMatch(/\n-{78}\nTotal — 3,00 €/u);
  });

  it("dit le QR par son texte de remplacement et son code en clair", () => {
    expect(text).toContain("Code de retrait ORD-1\nORD-1");
  });

  it("rend un bouton en « Libellé : adresse », et le lien secondaire sous lui", () => {
    expect(text).toContain(
      "Voir ma commande : https://shop.lfc.test/c/1\n\nGérer : https://shop.lfc.test/g/1",
    );
  });

  it("garde le texte tel quel — ni balise, ni entité, rien d'échappé", () => {
    expect(text).toContain("Merci <de> votre confiance & à bientôt");
    expect(text).not.toMatch(MARKUP);
  });

  it("pose l'enseigne en tête et le recours en bas", () => {
    expect(text.startsWith("La Folie Coffee\n\n")).toBe(true);
    expect(text.trimEnd().endsWith("admin@lfc.test")).toBe(true);
  });

  it("ne rend ni bouton hostile, ni lien secondaire sans bouton", () => {
    const hostile = renderLayoutText({
      ...SIMPLE,
      cta: { label: "Cliquez", url: "javascript:alert(1)" },
      secondaryLink: { label: "Ou", url: "https://lfc.test/o" },
    });
    expect(hostile).not.toContain("Cliquez");
    expect(hostile).not.toContain("https://lfc.test/o");
  });

  it("suit l'ordre des sections demandé", () => {
    const moved = renderLayoutText({ ...SIMPLE, sections: ["footer", "title"] });
    expect(moved.indexOf("Pied")).toBeLessThan(moved.indexOf("Titre"));
  });
});

describe("la largeur des lignes", () => {
  it("coupe à 78 caractères aux espaces, sans couper une adresse", () => {
    const long = `${"mot ".repeat(40)}https://lfc.test/${"x".repeat(90)}`;
    const lines = wrapText(long).split("\n");
    expect(lines.slice(0, -1).every((line) => line.length <= TEXT_LINE_WIDTH)).toBe(true);
    expect(lines.at(-1)).toBe(`https://lfc.test/${"x".repeat(90)}`);
  });

  it("passe une longue adresse de bouton à la ligne suivante", () => {
    const url = `https://lfc.test/${"x".repeat(80)}`;
    expect(renderLayoutText({ ...SIMPLE, cta: { label: "Itinéraire", url } })).toContain(
      `Itinéraire :\n${url}`,
    );
  });
});

describe("le texte de chaque bloc libre", () => {
  const blocks: readonly [FreeBlock, string][] = [
    [{ id: "h", kind: "heading", text: { fr: "Nouveautés" } }, "Nouveautés\n----------"],
    [{ id: "p", kind: "paragraph", text: { fr: "Un paragraphe." } }, "Un paragraphe."],
    [
      { id: "c", kind: "callout", tone: "warning", text: { fr: "Fermé le 1er mai" } },
      "Fermé le 1er mai",
    ],
    [
      { id: "b", kind: "button", label: { fr: "Réserver" }, href: "https://lfc.test/r" },
      "Réserver : https://lfc.test/r",
    ],
    [{ id: "d", kind: "divider" }, "-".repeat(TEXT_LINE_WIDTH)],
    [
      { id: "i", kind: "image", src: "https://cdn.test/a.jpg", alt: { fr: "Le fournil" } },
      "Le fournil",
    ],
    [
      {
        id: "il",
        kind: "image",
        src: "https://cdn.test/a.jpg",
        alt: { fr: "Le fournil" },
        href: "https://lfc.test/f",
      },
      "Le fournil : https://lfc.test/f",
    ],
  ];

  it.each(blocks.map(([block, expected]) => [block.kind, block, expected] as const))(
    "%s",
    (_kind, block, expected) => {
      expect(renderFreeBlockText(block, "fr")).toBe(expected);
    },
  );

  it("une image décorative ne dit rien", () => {
    expect(
      renderFreeBlockText(
        {
          id: "i",
          kind: "image",
          src: "https://cdn.test/a.jpg",
          alt: { fr: "x" },
          decorative: true,
        },
        "fr",
      ),
    ).toBe("");
  });

  it("un bouton sur une adresse hostile ne dit rien", () => {
    expect(
      renderFreeBlockText(
        { id: "b", kind: "button", label: { fr: "X" }, href: "javascript:x" },
        "fr",
      ),
    ).toBe("");
  });

  it("un texte absent dans la langue de l'envoi ne rend rien — aucun repli inventé", () => {
    const paragraph: FreeBlock = { id: "p", kind: "paragraph", text: { fr: "Bonjour" } };
    expect(renderFreeBlockText(paragraph, "en")).toBe("");
    expect(renderFreeBlockText({ ...paragraph, text: { fr: "Bonjour", en: "Hello" } }, "en")).toBe(
      "Hello",
    );
  });

  it("des colonnes s'empilent dans l'ordre de lecture", () => {
    expect(
      renderColumnsText(
        {
          id: "cols",
          kind: "columns",
          widths: [50, 50],
          cells: [
            [{ id: "a", kind: "heading", text: { fr: "Gauche" } }],
            [{ id: "b", kind: "paragraph", text: { fr: "Droite" } }],
          ],
        },
        "fr",
      ),
    ).toBe("Gauche\n------\n\nDroite");
  });
});

describe("la version texte d'un document", () => {
  it("le document de départ dit le texte de la coquille", () => {
    const starting = documentOf(model("title"), model("body"), model("cta"), model("footer"));
    expect(renderMailDocumentText(SIMPLE, starting, OPTIONS)).toBe(renderLayoutText(SIMPLE));
  });

  it("un document réarrangé dit ses blocs à leur place, blocs libres compris", () => {
    const rearranged = documentOf(
      model("footer"),
      { id: "free", kind: "paragraph", text: { fr: "Fermé le 1er mai" } },
      model("title"),
      model("body"),
      model("cta"),
    );
    const text = renderMailDocumentText(SIMPLE, rearranged, OPTIONS);
    const order = ["Pied", "Fermé le 1er mai", "Titre", "Corps", "Voir : https://lfc.test/c"];
    const positions = order.map((part) => text.indexOf(part));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text).not.toMatch(MARKUP);
  });

  it("un bloc libre sans texte dans la langue de l'envoi disparaît du texte", () => {
    const document = documentOf(
      model("title"),
      { id: "free", kind: "paragraph", text: { fr: "Seulement en français" } },
      model("body"),
    );
    const text = renderMailDocumentText(SIMPLE, document, { ...OPTIONS, locale: "en" });
    expect(text).not.toContain("Seulement en français");
    expect(text).not.toMatch(/\n{3,}/u);
  });
});

describe("l'adaptateur Resend", () => {
  interface Mails {
    "test.hello": { name: string };
  }

  function send(registry: TemplateRegistry<Mails>): Promise<unknown> {
    const calls: unknown[] = [];
    const client: ResendLike = {
      emails: {
        send: (payload) => {
          calls.push(payload);
          return Promise.resolve({ data: { id: "re_1" }, error: null });
        },
      },
    };
    return new ResendMailer<Mails>({ client, registry, fromAddress: "a@lfc.fr" })
      .send({ to: "c@exemple.fr", template: "test.hello", data: { name: "Camille" } })
      .then(() => calls[0]);
  }

  it("transmet la version texte à côté du HTML", async () => {
    const payload = await send({
      "test.hello": (data) => ({ subject: "S", html: "<p>h</p>", text: `Bonjour ${data.name}` }),
    });
    expect(payload).toMatchObject({ html: "<p>h</p>", text: "Bonjour Camille" });
  });

  it("n'envoie pas de champ texte quand le rendu n'en fabrique pas", async () => {
    const payload = await send({ "test.hello": () => ({ subject: "S", html: "<p>h</p>" }) });
    expect(payload).not.toHaveProperty("text");
  });
});
