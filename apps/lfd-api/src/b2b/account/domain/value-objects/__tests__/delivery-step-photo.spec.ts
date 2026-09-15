import { Buffer } from "node:buffer";

import {
  DELIVERY_STEP_BODY_MAX as CONTRACT_BODY_MAX,
  DELIVERY_STEP_PHOTO_MAX_BYTES as CONTRACT_PHOTO_MAX_BYTES,
  DELIVERY_STEP_TITLE_MAX as CONTRACT_TITLE_MAX,
} from "@lfd/contracts";

import {
  DeliveryStepPhotoIntentError,
  InvalidDeliveryStepError,
  InvalidDeliveryStepPhotoError,
} from "../../errors/delivery-procedure-errors.js";
import {
  DELIVERY_STEP_BODY_MAX,
  DELIVERY_STEP_TITLE_MAX,
  DeliveryStepContent,
} from "../delivery-step-content.js";
import { deliveryStepPhotoChange } from "../delivery-step-photo-change.js";
import {
  DELIVERY_STEP_PHOTO_MAX_BYTES,
  DeliveryStepPhoto,
  deliveryStepPhotoContentType,
  deliveryStepPhotoKey,
  deliveryStepPhotoRevision,
} from "../delivery-step-photo.js";

/**
 * **La photo et le contenu d'une étape.** Refusé : le vide, le trop lourd, ce
 * qui n'est ni JPEG ni PNG AUX OCTETS, l'image tronquée, le titre vide ou trop
 * long. Accepté sans condition de taille ni de ratio : une photo de téléphone
 * n'est ni carrée ni grande, et c'est très bien.
 */

/** Un JPEG minimal : SOI puis un SOF0 qui porte 40 × 30. */
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

describe("DeliveryStepPhoto", () => {
  it.each([
    ["un JPEG", jpegOf(40, 30), "image/jpeg"],
    ["un PNG allongé, sans taille minimale", pngOf(1, 900), "image/png"],
  ])("accepte %s et relit son type dans les octets", (_, bytes, contentType) => {
    expect(DeliveryStepPhoto.create(bytes).contentType).toBe(contentType);
    expect(deliveryStepPhotoContentType(bytes)).toBe(contentType);
  });

  it("refuse un fichier vide", () => {
    expect(() => DeliveryStepPhoto.create(Buffer.alloc(0))).toThrow(InvalidDeliveryStepPhotoError);
  });

  it("refuse au-delà d'1 Mo, et accepte pile 1 Mo", () => {
    const exact = Buffer.concat([jpegOf(40, 30), Buffer.alloc(DELIVERY_STEP_PHOTO_MAX_BYTES - 19)]);
    expect(exact.length).toBe(DELIVERY_STEP_PHOTO_MAX_BYTES);
    expect(DeliveryStepPhoto.create(exact).contentType).toBe("image/jpeg");
    const over = Buffer.concat([exact, Buffer.alloc(1)]);
    expect(() => DeliveryStepPhoto.create(over)).toThrow(/1\.0 Mo/);
  });

  it("refuse ce qui n'est ni JPEG ni PNG, quel que soit le nom annoncé", () => {
    const pdf = Buffer.from("%PDF-1.4\nporte.jpg", "latin1");
    expect(() => DeliveryStepPhoto.create(pdf)).toThrow(InvalidDeliveryStepPhotoError);
    expect(deliveryStepPhotoContentType(pdf)).toBeNull();
  });

  it("refuse une image tronquée dont les dimensions ne se lisent pas", () => {
    const truncated = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => DeliveryStepPhoto.create(truncated)).toThrow(/tronquée/);
  });

  it("garde la borne que l'écran énonce", () => {
    expect(DELIVERY_STEP_PHOTO_MAX_BYTES).toBe(CONTRACT_PHOTO_MAX_BYTES);
  });
});

describe("la clé d'une photo d'étape", () => {
  it("s'ancre sur la société et porte une révision relisible", () => {
    const key = deliveryStepPhotoKey("c1", "a1", "01STEP", "01REV");
    expect(key).toBe("companies/c1/delivery-procedures/a1/01STEP-01REV");
    expect(deliveryStepPhotoRevision(key)).toBe("01REV");
  });
});

describe("DeliveryStepContent", () => {
  it("nettoie les espaces de bord", () => {
    expect(DeliveryStepContent.create({ title: "  Portail ", body: " Code " })).toEqual({
      title: "Portail",
      body: "Code",
    });
  });

  /**
   * Les messages sont écrits en clair : en HTTP, le schéma du contrat refuse ces
   * trois cas AVANT le value object (vérifié le 2026-09-15), si bien que seul ce
   * test les tient — le socle partagé du plan des notes photo ne doit pas les
   * changer.
   */
  it.each([
    [
      "un titre vide",
      { title: "   ", body: "" },
      "Étape de livraison : le titre est vide. Donnez un titre à l'étape.",
    ],
    [
      "un titre trop long",
      { title: "x".repeat(DELIVERY_STEP_TITLE_MAX + 1), body: "" },
      "Étape de livraison : le titre fait 81 caractères, 80 au plus. " +
        "Raccourcissez-le et mettez le détail dans le texte.",
    ],
    [
      "un texte trop long",
      { title: "Portail", body: "x".repeat(DELIVERY_STEP_BODY_MAX + 1) },
      "Étape de livraison : le texte fait 1001 caractères, 1000 au plus. " +
        "Découpez-le en deux étapes.",
    ],
  ])("refuse %s, en le disant", (_, input, message) => {
    expect(() => DeliveryStepContent.create(input)).toThrow(InvalidDeliveryStepError);
    expect(() => DeliveryStepContent.create(input)).toThrow(message);
  });

  it("accepte les bornes exactes, et garde celles que l'écran énonce", () => {
    const content = DeliveryStepContent.create({
      title: "x".repeat(DELIVERY_STEP_TITLE_MAX),
      body: "y".repeat(DELIVERY_STEP_BODY_MAX),
    });
    expect(content.title).toHaveLength(CONTRACT_TITLE_MAX);
    expect(content.body).toHaveLength(CONTRACT_BODY_MAX);
  });
});

describe("deliveryStepPhotoChange", () => {
  it("lit garder, retirer, remplacer", () => {
    expect(deliveryStepPhotoChange(false, null)).toEqual({ kind: "keep" });
    expect(deliveryStepPhotoChange(true, null)).toEqual({ kind: "remove" });
    expect(deliveryStepPhotoChange(false, pngOf(2, 2)).kind).toBe("replace");
  });

  it("refuse retirer ET remplacer — l'intention serait illisible", () => {
    expect(() => deliveryStepPhotoChange(true, pngOf(2, 2))).toThrow(DeliveryStepPhotoIntentError);
  });

  it("valide la photo de remplacement", () => {
    expect(() => deliveryStepPhotoChange(false, Buffer.from("nope"))).toThrow(
      InvalidDeliveryStepPhotoError,
    );
  });
});
