import { imageCopyWidthPx, type ImageFraming, type ImageShaping } from "@lfd/mail-blocks";
import { sniffContentType } from "@lfd/storage";
import sharp, { type Sharp } from "sharp";

import { MailImageUnreadableError } from "../../domain/errors/mail-image.errors.js";
import { SharpMailImageReframer } from "../sharp-mail-image.reframer.js";

/**
 * De vraies petites images, fabriquées dans le test : la moitié gauche rouge,
 * la moitié droite bleue — le point focal se lit à la couleur gardée.
 */
async function halves(
  width: number,
  height: number,
  encode: (image: Sharp) => Sharp,
): Promise<Buffer> {
  const half = Math.floor(width / 2);
  const blue = await sharp({
    create: { width: width - half, height, channels: 3, background: "#0000ff" },
  })
    .png()
    .toBuffer();
  return encode(
    sharp({ create: { width, height, channels: 3, background: "#ff0000" } }).composite([
      { input: blue, left: half, top: 0 },
    ]),
  ).toBuffer();
}

async function sizeOf(bytes: Buffer): Promise<readonly [number, number]> {
  const meta = await sharp(bytes).metadata();
  return [meta.width, meta.height];
}

async function dominant(bytes: Buffer): Promise<"red" | "blue"> {
  const { dominant: color } = await sharp(bytes).stats();
  return color.r > color.b ? "red" : "blue";
}

const reframer = new SharpMailImageReframer();
/** La borne de la copie avant le 2026-11-08 : les cas de recadrage la gardent. */
const BOUND_PX = 1_200;

function shaped(framing: ImageFraming | null, maxWidthPx = BOUND_PX): ImageShaping {
  return { framing, maxWidthPx };
}

const SQUARE_LEFT = shaped({ format: "1:1", focal: { x: 0, y: 0.5 } });
const SQUARE_RIGHT = shaped({ format: "1:1", focal: { x: 1, y: 0.5 } });

describe("SharpMailImageReframer — de vraies images", () => {
  it("recadre un PNG au format, autour du point focal, et reste un PNG", async () => {
    const png = await halves(400, 100, (image) => image.png());
    const left = await reframer.reframe(png, "image/png", SQUARE_LEFT);
    const right = await reframer.reframe(png, "image/png", SQUARE_RIGHT);
    expect(await sizeOf(left)).toEqual([100, 100]);
    expect(sniffContentType(left)).toBe("image/png");
    expect(await dominant(left)).toBe("red");
    expect(await dominant(right)).toBe("blue");
  });

  it("ramène un JPEG large à 1200 px, au rapport du format, et reste un JPEG", async () => {
    const jpeg = await halves(3000, 3000, (image) => image.jpeg());
    const framed = await reframer.reframe(
      jpeg,
      "image/jpeg",
      shaped({ format: "3:2", focal: { x: 0.5, y: 0.5 } }),
    );
    expect(await sizeOf(framed)).toEqual([1200, 800]);
    expect(sniffContentType(framed)).toBe("image/jpeg");
  });

  it("n'agrandit jamais une image plus étroite que 1200 px", async () => {
    const png = await halves(300, 300, (image) => image.png());
    const framed = await reframer.reframe(
      png,
      "image/png",
      shaped({ format: "2:1", focal: { x: 0.5, y: 0.5 } }),
    );
    expect(await sizeOf(framed)).toEqual([300, 150]);
  });

  it("applique l'orientation EXIF avant de recadrer", async () => {
    // 200 × 100 rangée « tournée d'un quart » (orientation 6) : on la voit en 100 × 200.
    const turned = await halves(200, 100, (image) => image.jpeg().withMetadata({ orientation: 6 }));
    const framed = await reframer.reframe(
      turned,
      "image/jpeg",
      shaped({ format: "2:1", focal: { x: 0.5, y: 0.5 } }),
    );
    expect(await sizeOf(framed)).toEqual([100, 50]);
  });

  it("recadre un GIF et reste un GIF", async () => {
    const gif = await halves(400, 100, (image) => image.gif());
    const framed = await reframer.reframe(gif, "image/gif", SQUARE_RIGHT);
    expect(sniffContentType(framed)).toBe("image/gif");
    expect(await sizeOf(framed)).toEqual([100, 100]);
    expect(await dominant(framed)).toBe("blue");
  });

  it("un GIF animé garde toutes ses images, chacune recadrée pareil", async () => {
    const frame = (color: string) =>
      sharp({ create: { width: 400, height: 100, channels: 3, background: color } })
        .png()
        .toBuffer();
    const animated = await sharp([await frame("#ff0000"), await frame("#0000ff")], {
      join: { animated: true },
    })
      .gif()
      .toBuffer();
    const framed = await reframer.reframe(animated, "image/gif", SQUARE_RIGHT);
    const meta = await sharp(framed, { animated: true }).metadata();
    expect([meta.pages, meta.width, meta.pageHeight]).toEqual([2, 100, 100]);
  });

  it("même image, même cadrage : mêmes octets (l'adresse par le contenu tient)", async () => {
    const png = await halves(400, 100, (image) => image.png());
    const once = await reframer.reframe(png, "image/png", SQUARE_LEFT);
    const twice = await reframer.reframe(png, "image/png", SQUARE_LEFT);
    expect(once.equals(twice)).toBe(true);
  });

  it("refuse une image tronquée par une erreur du domaine", async () => {
    const png = await halves(400, 100, (image) => image.png());
    await expect(
      reframer.reframe(png.subarray(0, 40), "image/png", SQUARE_LEFT),
    ).rejects.toBeInstanceOf(MailImageUnreadableError);
  });
});

describe("SharpMailImageReframer — la largeur de la copie (2026-11-08)", () => {
  const FULL_PX = imageCopyWidthPx({ width: "full" });
  const CONTENT_PX = imageCopyWidthPx({ width: "content" });

  it("ramène une image originale large à la borne, en gardant ses proportions", async () => {
    const jpeg = await halves(3000, 1500, (image) => image.jpeg());
    expect(await sizeOf(await reframer.reframe(jpeg, "image/jpeg", shaped(null, FULL_PX)))).toEqual(
      [1116, 558],
    );
    expect(
      await sizeOf(await reframer.reframe(jpeg, "image/jpeg", shaped(null, CONTENT_PX))),
    ).toEqual([988, 494]);
  });

  it("une image originale plus étroite garde ses octets : ni agrandie, ni réencodée", async () => {
    const png = await halves(600, 200, (image) => image.png());
    const copy = await reframer.reframe(png, "image/png", shaped(null, FULL_PX));
    expect(copy.equals(png)).toBe(true);
  });

  it("une image recadrée plus étroite que la borne n'est jamais agrandie", async () => {
    const png = await halves(500, 500, (image) => image.png());
    const framed = shaped({ format: "2:1", focal: { x: 0.5, y: 0.5 } }, FULL_PX);
    expect(await sizeOf(await reframer.reframe(png, "image/png", framed))).toEqual([500, 250]);
  });

  it("recadre puis borne : un 3:2 pleine largeur fait 1116 × 744", async () => {
    const jpeg = await halves(3000, 3000, (image) => image.jpeg());
    const framed = shaped({ format: "3:2", focal: { x: 0.5, y: 0.5 } }, FULL_PX);
    expect(await sizeOf(await reframer.reframe(jpeg, "image/jpeg", framed))).toEqual([1116, 744]);
  });

  it("une image originale tournée (EXIF) est bornée sur sa largeur VUE", async () => {
    // 2000 × 3000 rangée « tournée d'un quart » : on la voit en 3000 × 2000.
    const turned = await halves(2000, 3000, (image) =>
      image.jpeg().withMetadata({ orientation: 6 }),
    );
    const copy = await reframer.reframe(turned, "image/jpeg", shaped(null, CONTENT_PX));
    expect(await sizeOf(copy)).toEqual([988, 659]);
  });
});
