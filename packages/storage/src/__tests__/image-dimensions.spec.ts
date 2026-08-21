import { imageDimensions } from "../image-dimensions.js";
import { sha256Hex, extensionForMime, contentAddressedKey } from "../content-address.js";

/** PNG : signature + IHDR, seuls les 24 premiers octets comptent. */
function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function gif(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(10);
  buffer.write("GIF89a", 0, "latin1");
  buffer.writeUInt16LE(width, 6);
  buffer.writeUInt16LE(height, 8);
  return buffer;
}

function webpLossy(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(32);
  buffer.write("RIFF", 0, "latin1");
  buffer.write("WEBP", 8, "latin1");
  buffer.write("VP8 ", 12, "latin1");
  buffer.writeUInt16LE(width, 26);
  buffer.writeUInt16LE(height, 28);
  return buffer;
}

function webpExtended(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(32);
  buffer.write("RIFF", 0, "latin1");
  buffer.write("WEBP", 8, "latin1");
  buffer.write("VP8X", 12, "latin1");
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

/** JPEG : SOI, puis `segments` segments de bourrage, puis le SOF0 qui porte la taille. */
function jpeg(width: number, height: number, padding: number[] = []): Buffer {
  const head = [0xff, 0xd8];
  const filler: number[] = [];
  for (const size of padding) {
    filler.push(0xff, 0xe0, (size >> 8) & 0xff, size & 0xff, ...new Array(size - 2).fill(0));
  }
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff];
  return Buffer.from([...head, ...filler, ...sof, ...new Array(16).fill(0)]);
}

describe("imageDimensions", () => {
  it("lit un PNG, un GIF et les deux dispositions WebP", () => {
    expect(imageDimensions(png(1200, 800))).toEqual({ width: 1200, height: 800 });
    expect(imageDimensions(gif(64, 48))).toEqual({ width: 64, height: 48 });
    expect(imageDimensions(webpLossy(300, 200))).toEqual({ width: 300, height: 200 });
    expect(imageDimensions(webpExtended(4096, 2160))).toEqual({ width: 4096, height: 2160 });
  });

  it("traverse les segments de métadonnées d'un JPEG jusqu'au SOF", () => {
    // Une photo d'appareil porte EXIF + vignette + profil couleur AVANT sa taille :
    // lire à un décalage fixe donnerait un nombre pris dans la vignette.
    expect(imageDimensions(jpeg(3000, 2000))).toEqual({ width: 3000, height: 2000 });
    expect(imageDimensions(jpeg(3000, 2000, [120, 4000, 60]))).toEqual({
      width: 3000,
      height: 2000,
    });
  });

  it("rend null sur un en-tête inconnu ou tronqué, jamais zéro", () => {
    expect(imageDimensions(Buffer.from("%PDF-1.7\n"))).toBeNull();
    expect(imageDimensions(png(10, 10).subarray(0, 12))).toBeNull();
    expect(imageDimensions(Buffer.alloc(0))).toBeNull();
  });

  it("ne boucle pas sur un JPEG dont la chaîne de segments est corrompue", () => {
    // Une longueur nulle est impossible (elle s'inclut elle-même) : on refuse
    // plutôt que de continuer à lire une chaîne dont on sait qu'elle ment.
    const corrupted = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, ...new Array(32).fill(0)]);
    expect(imageDimensions(corrupted)).toBeNull();
  });
});

describe("contentAddressedKey", () => {
  it("donne la même clé aux mêmes octets, une autre au moindre changement", () => {
    const bytes = png(10, 10);
    expect(contentAddressedKey("products", bytes, "image/png")).toBe(
      contentAddressedKey("products", Buffer.from(bytes), "image/png"),
    );
    expect(contentAddressedKey("products", png(10, 11), "image/png")).not.toBe(
      contentAddressedKey("products", bytes, "image/png"),
    );
  });

  it("refuse un type hors table plutôt que d'inventer une extension", () => {
    expect(extensionForMime("image/svg+xml")).toBeNull();
    expect(contentAddressedKey("products", Buffer.from("x"), "text/html")).toBeNull();
  });

  it("porte le préfixe et l'extension du type validé", () => {
    const key = contentAddressedKey("products", png(1, 1), "image/png");
    expect(key).toMatch(/^products\/[0-9a-f]{64}\.png$/);
  });

  it("hache indépendamment du nom du fichier d'origine", () => {
    expect(sha256Hex(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
