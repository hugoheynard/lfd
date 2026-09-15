import { Buffer } from "node:buffer";

import { DomainError } from "../../../../../../platform/shared/errors/app-error.js";
import { CardPhoto, type CardPhotoRules, cardPhotoContentType, megabytes } from "../card-photo.js";
import { readPhotoChange } from "../photo-change.js";

/**
 * **La photo d'une carte.** Refusé, dans cet ordre : le vide, le trop lourd
 * (borne en paramètre), ce qui n'est ni JPEG ni PNG AUX OCTETS, l'image
 * tronquée. Chaque refus sort de la fabrique de l'usage.
 */

class PhotoError extends DomainError {
  constructor(reason: string) {
    super("test.photo", reason);
  }
}

/** Un JPEG minimal : SOI puis un SOF0 qui porte ses dimensions. */
function jpegOf(width: number, height: number): Buffer {
  const frame = Buffer.alloc(17);
  frame.writeUInt16BE(0xffc0, 0);
  frame.writeUInt16BE(17, 2);
  frame[4] = 8;
  frame.writeUInt16BE(height, 5);
  frame.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), frame]);
}

/** Un PNG minimal : signature puis IHDR. */
function pngOf(width: number, height: number): Buffer {
  const header = Buffer.alloc(25);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.write("IHDR", 12, "latin1");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

function rulesOf(maxBytes: number): CardPhotoRules {
  return {
    maxBytes,
    refusals: {
      empty: () => new PhotoError("vide"),
      tooHeavy: (size, max) => new PhotoError(`lourde ${size}/${max}`),
      unsupportedFormat: () => new PhotoError("format"),
      truncated: () => new PhotoError("tronquée"),
    },
  };
}

const ROOMY = rulesOf(10_000);

describe("CardPhoto", () => {
  it.each([
    ["un JPEG", jpegOf(40, 30), "image/jpeg"],
    ["un PNG allongé, sans taille minimale", pngOf(1, 900), "image/png"],
  ])("accepte %s et relit son type dans les octets", (_, bytes, contentType) => {
    const photo = CardPhoto.create(bytes, ROOMY);
    expect(photo.contentType).toBe(contentType);
    expect(photo.bytes).toBe(bytes);
    expect(cardPhotoContentType(bytes)).toBe(contentType);
  });

  it("refuse un fichier vide", () => {
    expect(() => CardPhoto.create(Buffer.alloc(0), ROOMY)).toThrow("vide");
  });

  it("prend la borne en paramètre : accepte pile, refuse un octet de plus", () => {
    const bytes = jpegOf(40, 30);
    expect(CardPhoto.create(bytes, rulesOf(bytes.length)).contentType).toBe("image/jpeg");
    expect(() => CardPhoto.create(bytes, rulesOf(bytes.length - 1))).toThrow(
      `lourde ${bytes.length}/${bytes.length - 1}`,
    );
  });

  it("dit le poids avant le format : un PDF trop lourd est « trop lourd »", () => {
    const pdf = Buffer.from("%PDF-1.4 porte.jpg", "latin1");
    expect(() => CardPhoto.create(pdf, rulesOf(4))).toThrow(/lourde/);
  });

  it("refuse ce qui n'est ni JPEG ni PNG, quel que soit le nom annoncé", () => {
    const pdf = Buffer.from("%PDF-1.4\nporte.jpg", "latin1");
    expect(() => CardPhoto.create(pdf, ROOMY)).toThrow("format");
    expect(cardPhotoContentType(pdf)).toBeNull();
  });

  it("refuse une image tronquée dont les dimensions ne se lisent pas", () => {
    const truncated = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => CardPhoto.create(truncated, ROOMY)).toThrow("tronquée");
  });
});

describe("megabytes", () => {
  it("énonce une taille en Mo à une décimale", () => {
    expect(megabytes(1024 * 1024)).toBe("1.0");
    expect(megabytes(600 * 1024)).toBe("0.6");
  });
});

describe("readPhotoChange", () => {
  const rules = {
    accept: (bytes: Buffer) => CardPhoto.create(bytes, ROOMY),
    ambiguous: () => new PhotoError("ambiguë"),
  };

  it("lit garder, retirer, remplacer", () => {
    expect(readPhotoChange(false, null, rules)).toEqual({ kind: "keep" });
    expect(readPhotoChange(true, null, rules)).toEqual({ kind: "remove" });
    const change = readPhotoChange(false, pngOf(2, 2), rules);
    expect(change.kind === "replace" && change.photo.contentType).toBe("image/png");
  });

  it("refuse retirer ET remplacer avant de valider la photo", () => {
    expect(() => readPhotoChange(true, Buffer.from("nope"), rules)).toThrow("ambiguë");
  });

  it("valide la photo de remplacement par la règle de l'usage", () => {
    expect(() => readPhotoChange(false, Buffer.from("nope"), rules)).toThrow("format");
  });
});
