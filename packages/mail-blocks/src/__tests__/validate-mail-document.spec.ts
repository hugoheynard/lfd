import type {
  ColumnsBlock,
  FreeBlock,
  MailBlock,
  MailDocument,
  MailTemplateDeclaration,
} from "../mail-document.js";
import { startingMailDocument } from "../starting-document.js";
import {
  validateMailDocument,
  validateMailDocumentForPublication,
} from "../validate-mail-document.js";

const TEMPLATE = "customer.order-ready";
const DECLARATION: MailTemplateDeclaration = {
  modelBlocks: ["title", "body", "cta", "footer"],
  locales: ["fr", "en"],
  charter: "lfc",
};

const START = startingMailDocument(TEMPLATE, DECLARATION);

const PARAGRAPH: FreeBlock = { id: "p1", kind: "paragraph", text: { fr: "Fermé", en: "Closed" } };
const HEADING: FreeBlock = { id: "h1", kind: "heading", text: { fr: "Titre", en: "Title" } };
const BUTTON: FreeBlock = {
  id: "b1",
  kind: "button",
  label: { fr: "Voir", en: "See" },
  href: "https://lafoliedouce.fr/horaires",
};

/**
 * Un document arrive au serveur en JSON : ni le cran, ni la sorte d'un bloc
 * n'y sont garantis par le type. Ce passage rend ce que l'API recevrait.
 */
function fromJson<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value));
}

function withBlocks(...extra: readonly MailBlock[]): MailDocument {
  return { template: TEMPLATE, blocks: [...START.blocks, ...extra] };
}

function columns(
  widths: readonly number[],
  cells: readonly (readonly MailBlock[])[],
): ColumnsBlock {
  return fromJson({ id: "c1", kind: "columns", widths, cells });
}

const codesOf = (document: MailDocument) =>
  validateMailDocument(document, DECLARATION, TEMPLATE).map((v) => v.code);

describe("validateMailDocument — les blocs du modèle", () => {
  it("admet le document de départ, et des blocs libres autour", () => {
    expect(codesOf(withBlocks(PARAGRAPH, HEADING, { id: "d1", kind: "divider" }))).toEqual([]);
  });

  it("refuse un document d'un autre modèle", () => {
    expect(codesOf({ ...START, template: "customer.order-placed" })).toEqual(["template-mismatch"]);
  });

  it("refuse un bloc du modèle retiré, en le nommant", () => {
    const document: MailDocument = {
      template: TEMPLATE,
      blocks: START.blocks.filter((block) => block.id !== "model:footer"),
    };

    const [refusal] = validateMailDocument(document, DECLARATION, TEMPLATE);

    expect(refusal?.code).toBe("model-block-missing");
    expect(refusal?.message).toContain("Pied");
  });

  it("refuse un bloc du modèle présent deux fois", () => {
    expect(codesOf(withBlocks({ id: "again", kind: "model", section: "title" }))).toEqual([
      "model-block-repeated",
    ]);
  });

  it("refuse un bloc du modèle que l'e-mail ne déclare pas", () => {
    expect(codesOf(withBlocks({ id: "qr", kind: "model", section: "image" }))).toEqual([
      "model-block-undeclared",
    ]);
  });

  it("refuse deux blocs du même identifiant, colonnes comprises", () => {
    expect(codesOf(withBlocks(PARAGRAPH, columns([50, 50], [[PARAGRAPH], [HEADING]])))).toEqual([
      "duplicate-block-id",
    ]);
  });

  it("refuse une sorte de bloc inconnue", () => {
    const image = fromJson<MailBlock>({ id: "i1", kind: "image" });

    expect(codesOf(withBlocks(image))).toEqual(["unknown-block-kind"]);
  });
});

describe("validateMailDocument — les colonnes", () => {
  it("admet deux et trois colonnes sur des crans qui font 100", () => {
    expect(codesOf(withBlocks(columns([33, 67], [[PARAGRAPH], [BUTTON]])))).toEqual([]);
    expect(codesOf(withBlocks(columns([33, 33, 33], [[HEADING], [BUTTON], []])))).toEqual([]);
  });

  it("refuse une colonne seule, ou quatre", () => {
    expect(codesOf(withBlocks(columns([100], [[PARAGRAPH]])))).toEqual(["column-count"]);
    expect(codesOf(withBlocks(columns([25, 25, 25, 25], [[], [], [], []])))).toEqual([
      "column-count",
    ]);
  });

  it("refuse une largeur par colonne qui manque", () => {
    expect(codesOf(withBlocks(columns([50], [[PARAGRAPH], [HEADING]])))).toEqual([
      "column-cells-mismatch",
    ]);
  });

  it("refuse un cran inconnu, puis des crans qui ne font pas 100", () => {
    expect(codesOf(withBlocks(columns([40, 60], [[], []])))).toEqual(["column-width-step"]);
    expect(codesOf(withBlocks(columns([50, 25], [[], []])))).toEqual(["column-widths-sum"]);
  });

  it("refuse un bloc du modèle dans une colonne", () => {
    const title: MailBlock = { id: "t", kind: "model", section: "title" };

    expect(codesOf(withBlocks(columns([50, 50], [[title], []])))).toContain(
      "model-block-in-column",
    );
  });

  it("refuse des colonnes dans une colonne", () => {
    const inner = { ...columns([50, 50], [[], []]), id: "inner" };

    expect(codesOf(withBlocks(columns([50, 50], [[inner], []])))).toEqual(["columns-in-column"]);
  });

  it("refuse un paragraphe en trois colonnes, l'admet en deux", () => {
    expect(codesOf(withBlocks(columns([33, 33, 33], [[PARAGRAPH], [], []])))).toEqual([
      "long-block-in-three-columns",
    ]);
    expect(codesOf(withBlocks(columns([50, 50], [[PARAGRAPH], []])))).toEqual([]);
  });

  it("tient la règle d'adresse jusque dans une colonne", () => {
    const http: FreeBlock = { ...BUTTON, id: "b2", href: "http://lafoliedouce.fr" };

    expect(codesOf(withBlocks(columns([50, 50], [[http], []])))).toEqual(["href-not-https"]);
  });
});

describe("validateMailDocument — les blocs libres", () => {
  it.each(["http://lafoliedouce.fr", "lafoliedouce.fr", "javascript:alert(1)", ""])(
    "refuse le bouton vers « %s »",
    (href) => {
      expect(codesOf(withBlocks({ ...BUTTON, href }))).toEqual(["href-not-https"]);
    },
  );

  it("refuse un encadré au ton inconnu", () => {
    const callout = fromJson<MailBlock>({ id: "k", kind: "callout", tone: "danger", text: {} });

    expect(codesOf(withBlocks(callout))).toEqual(["unknown-callout-tone"]);
  });
});

describe("validateMailDocumentForPublication", () => {
  it("laisse un brouillon incomplet s'enregistrer, mais pas se publier", () => {
    const incomplete: FreeBlock = {
      id: "p2",
      kind: "callout",
      tone: "info",
      text: { fr: "Fermé" },
    };
    const document = withBlocks(incomplete);

    expect(validateMailDocument(document, DECLARATION, TEMPLATE)).toEqual([]);
    const [refusal] = validateMailDocumentForPublication(document, DECLARATION, TEMPLATE);
    expect(refusal?.code).toBe("missing-text");
    expect(refusal?.message).toContain("anglais");
  });

  it("tient un texte blanc pour absent, jusque dans une colonne", () => {
    const blank: FreeBlock = { ...BUTTON, id: "b3", label: { fr: "Voir", en: "  " } };

    const codes = validateMailDocumentForPublication(
      withBlocks(columns([50, 50], [[blank], []])),
      DECLARATION,
      TEMPLATE,
    ).map((v) => v.code);

    expect(codes).toEqual(["missing-text"]);
  });

  it("n'exige que les langues du modèle", () => {
    const frenchOnly: MailTemplateDeclaration = { ...DECLARATION, locales: ["fr"] };
    const callout: FreeBlock = { id: "p3", kind: "callout", tone: "info", text: { fr: "Fermé" } };

    expect(validateMailDocumentForPublication(withBlocks(callout), frenchOnly, TEMPLATE)).toEqual(
      [],
    );
  });

  it("ne cherche pas de texte avant que la forme soit admise", () => {
    expect(
      validateMailDocumentForPublication({ ...START, template: "x" }, DECLARATION, TEMPLATE).map(
        (v) => v.code,
      ),
    ).toEqual(["template-mismatch"]);
  });
});
