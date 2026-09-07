import { inflateSync } from "node:zlib";

import { greyscalePng } from "../png.js";
import { qrPng } from "../qr-image.js";

/**
 * Un encodeur d'images ne se relit pas : on le PROUVE. Ces cas ouvrent les
 * octets produits et vérifient qu'ils disent ce qu'on croit — signature,
 * dimensions, et le fait qu'un module noir soit noir au bon endroit.
 *
 * Le déterminisme est éprouvé explicitement : c'est lui qui permettra plus tard
 * d'affirmer qu'un e-mail relancé porte la même pièce jointe.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Les dimensions déclarées dans l'IHDR : après la signature et l'en-tête. */
function dimensions(png: Buffer): { readonly width: number; readonly height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Les octets bruts de l'image, dé-compressés depuis l'IDAT. */
function pixels(png: Buffer): Buffer {
  const start = png.indexOf(Buffer.from("IDAT", "ascii")) + 4;
  const length = png.readUInt32BE(start - 8);
  return inflateSync(png.subarray(start, start + length));
}

describe("l'encodeur PNG", () => {
  it("commence par la signature PNG, et rien d'autre", () => {
    const png = greyscalePng([[true]], 1, 0);

    expect(png.subarray(0, 8)).toEqual(SIGNATURE);
  });

  it("déclare les cotes attendues, marge comprise", () => {
    // 3 modules, 2 px chacun, 4 modules de marge de chaque côté :
    // (3 + 8) × 2 = 22.
    const png = greyscalePng(
      [
        [true, false, true],
        [false, true, false],
        [true, false, true],
      ],
      2,
      4,
    );

    expect(dimensions(png)).toEqual({ width: 22, height: 22 });
  });

  it("peint un module noir en NOIR, et le reste en blanc", () => {
    const png = greyscalePng([[true]], 1, 0);
    // Une ligne = un octet de filtre + un pixel.
    expect([...pixels(png)]).toEqual([0, 0x00]);
  });

  it("laisse la zone de silence BLANCHE — sans elle, un lecteur perd le code", () => {
    const png = greyscalePng([[true]], 1, 1);
    // 3×3 : la marge tout autour, le module noir au centre.
    expect([...pixels(png)]).toEqual([
      0, 0xff, 0xff, 0xff, 0, 0xff, 0x00, 0xff, 0, 0xff, 0xff, 0xff,
    ]);
  });

  it("refuse une grille vide plutôt que de rendre un fichier de zéro pixel", () => {
    expect(() => greyscalePng([], 1, 0)).toThrow(RangeError);
  });

  it("refuse une échelle nulle — une image sans pixel n'est pas une image", () => {
    expect(() => greyscalePng([[true]], 0, 0)).toThrow(RangeError);
  });
});

describe("le QR d'un e-mail", () => {
  const URL = "https://app.lafolie.test/mes-commandes/retrait/tok_abcdef";

  it("est un PNG carré, assez grand pour être scanné à l'écran", () => {
    const { width, height } = dimensions(qrPng(URL));

    expect(width).toBe(height);
    // 21 modules au minimum + 8 de marge, à 6 px : jamais moins de 174 px.
    expect(width).toBeGreaterThanOrEqual(174);
  });

  it("rend les MÊMES octets deux fois — aucune date, aucun aléa", () => {
    // C'est ce qui permettra d'affirmer qu'un e-mail relancé porte la même
    // pièce jointe, et non une seconde image qui ne diffère que par du bruit.
    expect(qrPng(URL)).toEqual(qrPng(URL));
  });

  it("grandit quand la donnée grandit, au lieu d'échouer", () => {
    // La version du code est choisie par la bibliothèque : écrire une version
    // en dur ferait échouer l'encodage le jour où une URL gagne un segment.
    const petit = dimensions(qrPng("a")).width;
    const grand = dimensions(qrPng("a".repeat(300))).width;

    expect(grand).toBeGreaterThan(petit);
  });
});
