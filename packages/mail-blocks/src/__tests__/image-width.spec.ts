import { imageCopyKey, imageShapingOf } from "../image-framing.js";
import {
  imageCopyWidthPx,
  imageDisplayWidthPx,
  MAIL_BODY_WIDTH_PX,
  MAIL_CARD_INNER_WIDTH_PX,
} from "../image-width.js";
import type { ImageBlock, MailBlock, MailDocument } from "../mail-document.js";
import { startingMailDocument } from "../starting-document.js";
import { validateMailDocument } from "../validate-mail-document.js";

/** L'image pleine largeur (Hugo, 2026-11-08) : une propriété du bloc image. */

const TEMPLATE = "customer.order-ready";
const DECLARATION = {
  modelBlocks: ["title", "body", "cta", "footer"],
  locales: ["fr"],
  charter: "lfc",
} as const;
const SRC = "https://media.lafoliedouce.fr/products/pain.png";
const IMAGE: ImageBlock = { id: "i1", kind: "image", src: SRC, alt: { fr: "Un pain" } };
const START = startingMailDocument(TEMPLATE, DECLARATION);

function codes(...extra: readonly MailBlock[]): readonly (readonly [string, string | null])[] {
  const document: MailDocument = { template: TEMPLATE, blocks: [...START.blocks, ...extra] };
  return validateMailDocument(document, DECLARATION, TEMPLATE).map(
    (v) => [v.code, v.blockId] as const,
  );
}

describe("la largeur d'une image — la forme", () => {
  it("admet content, full, et l'absence (un document rangé avant le champ)", () => {
    expect(
      codes(IMAGE, { ...IMAGE, id: "i2", width: "content" }, { ...IMAGE, id: "i3", width: "full" }),
    ).toEqual([]);
  });

  it("refuse une largeur inconnue, avec un message lisible", () => {
    const parsed: ImageBlock = JSON.parse(JSON.stringify({ ...IMAGE, width: "wide" }));
    const document: MailDocument = { template: TEMPLATE, blocks: [...START.blocks, parsed] };
    const [refusal] = validateMailDocument(document, DECLARATION, TEMPLATE);
    expect(refusal?.code).toBe("image-width-invalid");
    expect(refusal?.message).toContain("« wide »");
  });

  it("refuse une image pleine largeur dans une colonne, et nomme le geste de sortie", () => {
    const document: MailDocument = {
      template: TEMPLATE,
      blocks: [
        ...START.blocks,
        {
          id: "c",
          kind: "columns",
          widths: [50, 50],
          cells: [[{ ...IMAGE, width: "full" }], [{ ...IMAGE, id: "i2", width: "content" }]],
        },
      ],
    };
    const refusals = validateMailDocument(document, DECLARATION, TEMPLATE);
    expect(refusals.map((v) => [v.code, v.blockId])).toEqual([
      ["full-width-image-in-column", "i1"],
    ]);
    expect(refusals[0]?.message).toContain("sortez-la des colonnes");
  });
});

describe("la largeur de la copie", () => {
  it("vient de la géométrie de la carte : 558 px pleine largeur, 494 px dans le corps", () => {
    expect(MAIL_CARD_INNER_WIDTH_PX).toBe(558);
    expect(MAIL_BODY_WIDTH_PX).toBe(494);
    expect(imageDisplayWidthPx("full")).toBe(558);
    expect(imageCopyWidthPx({ width: "full" })).toBe(1116);
    expect(imageCopyWidthPx({})).toBe(988);
    expect(imageCopyWidthPx({ width: "content" })).toBe(988);
  });

  it("deux blocs sur la même image, l'un pleine largeur, font deux clés de copie", () => {
    expect(imageCopyKey(IMAGE)).not.toBe(imageCopyKey({ ...IMAGE, width: "full" }));
    expect(imageCopyKey(IMAGE)).toBe(imageCopyKey({ ...IMAGE, width: "content" }));
    expect(imageCopyKey({ ...IMAGE, format: "2:1", width: "full" })).toBe(
      `${SRC}#2:1@0.5,0.5~1116w`,
    );
  });

  it("la mise en forme d'une copie porte le cadrage et la largeur", () => {
    expect(imageShapingOf({ ...IMAGE, width: "full" })).toEqual({
      framing: null,
      maxWidthPx: 1116,
    });
    expect(imageShapingOf({ ...IMAGE, format: "1:1" })).toEqual({
      framing: { format: "1:1", focal: { x: 0.5, y: 0.5 } },
      maxWidthPx: 988,
    });
  });
});
