import {
  HandoverPhotoMissingError,
  HandoverSignatureMissingError,
  InvalidHandoverPictureError,
  ReceiverNameLengthError,
} from "../../errors/delivery-doorstep-errors.js";
import { DoorstepReceipt } from "../doorstep-receipt.js";
import { INCIDENT_PHOTO_MAX_BYTES } from "../incident-photo.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe("DoorstepReceipt — les pièces d'une remise (B1, § 9)", () => {
  it("prend la photo, le nom rogné, et la signature relue dans ses octets", () => {
    const receipt = DoorstepReceipt.take({
      receiverName: "  Mme Durand ",
      photo: JPEG,
      signature: PNG,
    });

    expect(receipt.receiverName).toBe("Mme Durand");
    expect(receipt.photo.contentType).toBe("image/jpeg");
    expect(receipt.signature?.contentType).toBe("image/png");
    expect(receipt.signed).toBe(true);
  });

  it("🔴 refuse une remise sans photo — même signée (§ 9)", () => {
    expect(() =>
      DoorstepReceipt.take({ receiverName: "Mme Durand", photo: null, signature: PNG }),
    ).toThrow(HandoverPhotoMissingError);
  });

  it.each([
    ["vide", ""],
    ["d'une lettre", " A "],
    ["de 81 caractères", "x".repeat(81)],
  ])("refuse un nom %s, en disant les bornes", (_label, receiverName) => {
    expect(() => DoorstepReceipt.take({ receiverName, photo: JPEG, signature: null })).toThrow(
      ReceiverNameLengthError,
    );
  });

  it("accepte les bornes : 2 et 80 caractères", () => {
    expect(
      DoorstepReceipt.take({ receiverName: "Al", photo: JPEG, signature: null }).receiverName,
    ).toBe("Al");
    expect(
      DoorstepReceipt.take({ receiverName: "x".repeat(80), photo: JPEG, signature: null })
        .receiverName,
    ).toHaveLength(80);
  });

  it("refuse une image vide, illisible ou trop lourde, en nommant la pièce", () => {
    expect(() =>
      DoorstepReceipt.take({ receiverName: "Paul", photo: Buffer.from("texte"), signature: null }),
    ).toThrow(/Photo de la remise/u);
    expect(() =>
      DoorstepReceipt.take({ receiverName: "Paul", photo: JPEG, signature: Buffer.alloc(0) }),
    ).toThrow(/Signature/u);
    const heavy = Buffer.concat([JPEG, Buffer.alloc(INCIDENT_PHOTO_MAX_BYTES)]);
    expect(() =>
      DoorstepReceipt.take({ receiverName: "Paul", photo: heavy, signature: null }),
    ).toThrow(InvalidHandoverPictureError);
  });

  it("🔴 exige la signature quand l'arrêt l'exige au départ (AP-D4)", () => {
    const unsigned = DoorstepReceipt.take({ receiverName: "Paul", photo: JPEG, signature: null });

    expect(() => unsigned.ensureSignedIf(true, "CMD-1")).toThrow(HandoverSignatureMissingError);
    expect(() => unsigned.ensureSignedIf(false, "CMD-1")).not.toThrow();
  });

  it("garde une signature jointe sans être exigée", () => {
    const signed = DoorstepReceipt.take({ receiverName: "Paul", photo: JPEG, signature: PNG });

    expect(() => signed.ensureSignedIf(false, "CMD-1")).not.toThrow();
    expect(signed.signed).toBe(true);
  });
});
