import { imageCopyKey } from "../image-framing.js";
import { imageBlocksOf, withImageSources } from "../image-sources.js";
import type {
  ImageBlock,
  MailBlock,
  MailDocument,
  MailTemplateDeclaration,
} from "../mail-document.js";
import { startingMailDocument } from "../starting-document.js";
import { isImageSourceUrl } from "../urls.js";
import {
  validateMailDocument,
  validateMailDocumentForPublication,
} from "../validate-mail-document.js";

const TEMPLATE = "customer.order-ready";
const DECLARATION: MailTemplateDeclaration = {
  modelBlocks: ["title", "body", "cta", "footer"],
  locales: ["fr", "en"],
  charter: "lfc",
  nature: "transactional",
};
const START = startingMailDocument(TEMPLATE, DECLARATION);
const SRC = "https://media.lafoliedouce.fr/products/pain.png";

const IMAGE: ImageBlock = {
  id: "i1",
  kind: "image",
  src: SRC,
  alt: { fr: "Un pain de campagne", en: "A country loaf" },
};

function withBlocks(...extra: readonly MailBlock[]): MailDocument {
  return { template: TEMPLATE, blocks: [...START.blocks, ...extra] };
}

const shape = (document: MailDocument) =>
  validateMailDocument(document, DECLARATION, TEMPLATE).map((v) => [v.code, v.blockId]);
const publication = (document: MailDocument) =>
  validateMailDocumentForPublication(document, DECLARATION, TEMPLATE).map((v) => [
    v.code,
    v.blockId,
  ]);

describe("le bloc image — la forme", () => {
  it("admet une image en https, avec ou sans lien", () => {
    expect(
      shape(withBlocks(IMAGE, { ...IMAGE, id: "i2", href: "https://lafoliedouce.fr" })),
    ).toEqual([]);
  });

  it("admet une image encore sans adresse dans un brouillon, la refuse à la publication", () => {
    const draft = withBlocks({ ...IMAGE, src: "" });
    expect(shape(draft)).toEqual([]);
    expect(publication(draft)).toEqual([["image-src-missing", "i1"]]);
  });

  it("refuse une adresse en clair hors de la boucle locale, ou illisible", () => {
    expect(shape(withBlocks({ ...IMAGE, src: "http://media.exemple.fr/a.png" }))).toEqual([
      ["image-src-invalid", "i1"],
    ]);
    expect(shape(withBlocks({ ...IMAGE, src: "javascript:alert(1)" }))).toEqual([
      ["image-src-invalid", "i1"],
    ]);
  });

  it("admet la boucle locale en clair (la médiathèque de développement)", () => {
    expect(isImageSourceUrl("http://localhost:9100/media/a.png")).toBe(true);
    expect(isImageSourceUrl("http://127.0.0.1/a.png")).toBe(true);
    expect(isImageSourceUrl("http://exemple.fr/a.png")).toBe(false);
  });

  it("refuse un lien qui n'est pas en https", () => {
    expect(shape(withBlocks({ ...IMAGE, href: "http://exemple.fr" }))).toEqual([
      ["href-not-https", "i1"],
    ]);
  });

  it("refuse un lien sur une image décorative", () => {
    expect(
      shape(withBlocks({ ...IMAGE, decorative: true, href: "https://lafoliedouce.fr" })),
    ).toEqual([["decorative-image-link", "i1"]]);
  });

  it("admet une image en deux colonnes, la refuse en trois", () => {
    const two = withBlocks({ id: "c1", kind: "columns", widths: [50, 50], cells: [[IMAGE], []] });
    const three = withBlocks({
      id: "c1",
      kind: "columns",
      widths: [33, 33, 33],
      cells: [[IMAGE], [], []],
    });
    expect(shape(two)).toEqual([]);
    expect(shape(three)).toEqual([["long-block-in-three-columns", "i1"]]);
  });
});

describe("le bloc image — le texte de remplacement à la publication", () => {
  it("refuse une image sans texte de remplacement dans une langue du modèle", () => {
    const [refusal] = validateMailDocumentForPublication(
      withBlocks({ ...IMAGE, alt: { fr: "Un pain", en: "  " } }),
      DECLARATION,
      TEMPLATE,
    );
    expect(refusal).toMatchObject({ code: "missing-text", blockId: "i1" });
    expect(refusal?.message).toContain("texte de remplacement en anglais");
  });

  it("publie une image décorative sans texte de remplacement", () => {
    expect(publication(withBlocks({ ...IMAGE, decorative: true, alt: {} }))).toEqual([]);
  });
});

describe("imageBlocksOf et withImageSources", () => {
  const COPY = "https://mail.lafoliedouce.fr/templates/abc.png";
  const document = withBlocks(IMAGE, {
    id: "c1",
    kind: "columns",
    widths: [50, 50],
    cells: [[{ ...IMAGE, id: "i2" }], [{ id: "p1", kind: "paragraph", text: { fr: "x" } }]],
  });

  it("trouve les images du fil et des colonnes, dans l'ordre", () => {
    expect(imageBlocksOf(document).map((image) => image.id)).toEqual(["i1", "i2"]);
  });

  it("pose la copie à côté de la source, et ne touche ni les autres blocs ni l'original", () => {
    const rewritten = withImageSources(document, new Map([[imageCopyKey(IMAGE), COPY]]));
    expect(imageBlocksOf(rewritten).map((image) => [image.src, image.copySrc])).toEqual([
      [SRC, COPY],
      [SRC, COPY],
    ]);
    expect(imageBlocksOf(document).map((image) => image.copySrc)).toEqual([undefined, undefined]);
    expect(rewritten.blocks.slice(0, START.blocks.length)).toEqual(START.blocks);
  });
});
