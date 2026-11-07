import { framingOf, imageCopyKey, isImageFocal } from "../image-framing.js";
import type { ImageBlock, MailDocument } from "../mail-document.js";
import { imageBlocksOf, imageCopiesOf, withImageSources } from "../image-sources.js";
import { validateMailDocument } from "../validate-mail-document.js";
import { startingMailDocument } from "../starting-document.js";

const TEMPLATE = "customer.order-ready";
const DECLARATION = {
  modelBlocks: ["title", "body", "cta", "footer"],
  locales: ["fr"],
  charter: "lfc",
} as const;
const SRC = "https://media.lafoliedouce.fr/products/pain.png";
const IMAGE: ImageBlock = { id: "i1", kind: "image", src: SRC, alt: { fr: "Un pain" } };
const START = startingMailDocument(TEMPLATE, DECLARATION);

function codes(...images: readonly ImageBlock[]): readonly (readonly [string, string | null])[] {
  const document: MailDocument = { template: TEMPLATE, blocks: [...START.blocks, ...images] };
  return validateMailDocument(document, DECLARATION, TEMPLATE).map(
    (v) => [v.code, v.blockId] as const,
  );
}

describe("le cadrage d'une image — la forme", () => {
  it("admet chaque format, avec ou sans point focal", () => {
    expect(
      codes(
        { ...IMAGE, format: "original" },
        { ...IMAGE, id: "i2", format: "3:2", focal: { x: 0, y: 1 } },
        { ...IMAGE, id: "i3", format: "2:1" },
        { ...IMAGE, id: "i4", format: "1:1", focal: { x: 0.25, y: 0.75 } },
      ),
    ).toEqual([]);
  });

  it("refuse un point focal hors de l'image, ou qui n'est pas un nombre", () => {
    expect(
      codes(
        { ...IMAGE, format: "1:1", focal: { x: 1.2, y: 0.5 } },
        { ...IMAGE, id: "i2", format: "1:1", focal: { x: Number.NaN, y: 0.5 } },
        { ...IMAGE, id: "i3", format: "1:1", focal: { x: 0.5, y: -0.1 } },
      ),
    ).toEqual([
      ["image-focal-invalid", "i1"],
      ["image-focal-invalid", "i2"],
      ["image-focal-invalid", "i3"],
    ]);
    expect(isImageFocal({ x: 0, y: 1 })).toBe(true);
  });

  it("refuse un format inconnu (une donnée relue d'ailleurs que le type)", () => {
    const parsed: ImageBlock = JSON.parse(JSON.stringify({ ...IMAGE, format: "4:3" }));
    expect(codes(parsed)).toEqual([["image-format-invalid", "i1"]]);
  });
});

describe("framingOf et imageCopyKey", () => {
  it("sans format ou en original : aucun cadrage, l'adresse seule pour clé", () => {
    expect(framingOf(IMAGE)).toBeNull();
    expect(framingOf({ ...IMAGE, format: "original", focal: { x: 0, y: 0 } })).toBeNull();
    expect(imageCopyKey(IMAGE)).toBe(SRC);
    expect(imageCopyKey({ ...IMAGE, format: "original", focal: { x: 0, y: 0 } })).toBe(SRC);
  });

  it("un format sans point focal se recadre au centre", () => {
    expect(framingOf({ ...IMAGE, format: "2:1" })).toEqual({
      format: "2:1",
      focal: { x: 0.5, y: 0.5 },
    });
  });

  it("deux formats ou deux points focaux font deux clés", () => {
    const keys = new Set([
      imageCopyKey(IMAGE),
      imageCopyKey({ ...IMAGE, format: "1:1" }),
      imageCopyKey({ ...IMAGE, format: "3:2" }),
      imageCopyKey({ ...IMAGE, format: "3:2", focal: { x: 0.1, y: 0.5 } }),
    ]);
    expect(keys.size).toBe(4);
  });

  it("withImageSources rend à chaque bloc la copie de SON cadrage, et garde le cadrage", () => {
    const square: ImageBlock = { ...IMAGE, id: "i2", format: "1:1" };
    const document: MailDocument = { template: TEMPLATE, blocks: [IMAGE, square] };
    const rewritten = withImageSources(
      document,
      new Map([
        [imageCopyKey(IMAGE), "https://mail.example/a.png"],
        [imageCopyKey(square), "https://mail.example/b.png"],
      ]),
    );
    expect(imageBlocksOf(rewritten)).toEqual([
      { ...IMAGE, copySrc: "https://mail.example/a.png" },
      { ...square, copySrc: "https://mail.example/b.png" },
    ]);
    expect(imageCopiesOf(rewritten)).toEqual(
      new Map([
        [SRC, "https://mail.example/a.png"],
        [imageCopyKey(square), "https://mail.example/b.png"],
      ]),
    );
  });

  it("refuse une copie publiée qui n'est pas en https", () => {
    expect(codes({ ...IMAGE, copySrc: "ftp://x/y.png" })).toEqual([["image-src-invalid", "i1"]]);
  });
});
