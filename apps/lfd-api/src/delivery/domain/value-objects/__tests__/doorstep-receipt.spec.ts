import {
  HandoverPhotoMissingError,
  HandoverSignatureMissingError,
  InvalidHandoverPictureError,
  ReceiverNameLengthError,
  ReceiverNameRequiredError,
  SignedSlipPhotoMissingError,
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
      signedSlip: JPEG,
    });

    expect(receipt.receiverName).toBe("Mme Durand");
    expect(receipt.photo.contentType).toBe("image/jpeg");
    expect(receipt.signature?.contentType).toBe("image/png");
    expect(receipt.signed).toBe(true);
    expect(receipt.signedSlip?.contentType).toBe("image/jpeg");
  });

  it("🔴 refuse une remise sans photo — même signée (§ 9)", () => {
    expect(() =>
      DoorstepReceipt.take({
        receiverName: "Mme Durand",
        photo: null,
        signature: PNG,
        signedSlip: null,
      }),
    ).toThrow(HandoverPhotoMissingError);
  });

  it.each([
    ["d'une lettre", " A "],
    ["de 81 caractères", "x".repeat(81)],
  ])("refuse un nom %s, en disant les bornes", (_label, receiverName) => {
    expect(() =>
      DoorstepReceipt.take({ receiverName, photo: JPEG, signature: null, signedSlip: null }),
    ).toThrow(ReceiverNameLengthError);
  });

  /**
   * Hugo, 2026-10-25 (arrêt « SARL Salon Olympique », signature non exigée) :
   * le nom était exigé partout ; il n'est obligatoire qu'avec la signature.
   */
  it("un nom vide ou blanc vaut « personne n'est nommé » (null), admis sans signature exigée", () => {
    const anonymous = DoorstepReceipt.take({
      receiverName: "   ",
      photo: JPEG,
      signature: null,
      signedSlip: null,
    });

    expect(anonymous.receiverName).toBeNull();
    expect(() => anonymous.ensureSignedIf(false, "ORD-1")).not.toThrow();
  });

  it("🔴 signature exigée : refuse sans nom, même signé, en nommant la commande", () => {
    const signedAnonymous = DoorstepReceipt.take({
      receiverName: "",
      photo: JPEG,
      signature: PNG,
      signedSlip: null,
    });

    expect(() => signedAnonymous.ensureSignedIf(true, "ORD-1")).toThrow(ReceiverNameRequiredError);
    expect(() => signedAnonymous.ensureSignedIf(true, "ORD-1")).toThrow(/ORD-1/u);
  });

  it("accepte les bornes : 2 et 80 caractères", () => {
    expect(
      DoorstepReceipt.take({ receiverName: "Al", photo: JPEG, signature: null, signedSlip: null })
        .receiverName,
    ).toBe("Al");
    expect(
      DoorstepReceipt.take({
        receiverName: "x".repeat(80),
        photo: JPEG,
        signature: null,
        signedSlip: null,
      }).receiverName,
    ).toHaveLength(80);
  });

  it("refuse une image vide, illisible ou trop lourde, en nommant la pièce", () => {
    expect(() =>
      DoorstepReceipt.take({
        receiverName: "Paul",
        photo: Buffer.from("texte"),
        signature: null,
        signedSlip: null,
      }),
    ).toThrow(/Photo de la commande déposée/u);
    expect(() =>
      DoorstepReceipt.take({
        receiverName: "Paul",
        photo: JPEG,
        signature: Buffer.alloc(0),
        signedSlip: null,
      }),
    ).toThrow(/Signature/u);
    const heavy = Buffer.concat([JPEG, Buffer.alloc(INCIDENT_PHOTO_MAX_BYTES)]);
    expect(() =>
      DoorstepReceipt.take({
        receiverName: "Paul",
        photo: heavy,
        signature: null,
        signedSlip: null,
      }),
    ).toThrow(InvalidHandoverPictureError);
  });

  it("🔴 exige la signature quand l'arrêt l'exige au départ (AP-D4)", () => {
    const unsigned = DoorstepReceipt.take({
      receiverName: "Paul",
      photo: JPEG,
      signature: null,
      signedSlip: null,
    });

    expect(() => unsigned.ensureSignedIf(true, "ORD-1")).toThrow(HandoverSignatureMissingError);
    expect(() => unsigned.ensureSignedIf(false, "ORD-1")).not.toThrow();
  });

  it("🔴 signature exigée : refuse sans photo du bon signé, même signé et nommé", () => {
    const noSlip = DoorstepReceipt.take({
      receiverName: "Paul",
      photo: JPEG,
      signature: PNG,
      signedSlip: null,
    });
    const complete = DoorstepReceipt.take({
      receiverName: "Paul",
      photo: JPEG,
      signature: PNG,
      signedSlip: JPEG,
    });

    expect(() => noSlip.ensureSignedIf(true, "ORD-1")).toThrow(SignedSlipPhotoMissingError);
    expect(() => complete.ensureSignedIf(true, "ORD-1")).not.toThrow();
  });

  it("refuse une photo du bon illisible, en la nommant", () => {
    expect(() =>
      DoorstepReceipt.take({
        receiverName: "Paul",
        photo: JPEG,
        signature: PNG,
        signedSlip: Buffer.from("texte"),
      }),
    ).toThrow(/Photo du bon signé/u);
  });

  it("garde une signature jointe sans être exigée", () => {
    const signed = DoorstepReceipt.take({
      receiverName: "Paul",
      photo: JPEG,
      signature: PNG,
      signedSlip: null,
    });

    expect(() => signed.ensureSignedIf(false, "ORD-1")).not.toThrow();
    expect(signed.signed).toBe(true);
  });
});

describe("DoorstepReceipt — frontières du nom et ordre des refus", () => {
  const take = (
    receiverName: string,
    signature: Buffer | null = null,
    signedSlip: Buffer | null = null,
  ) => DoorstepReceipt.take({ receiverName, photo: JPEG, signature, signedSlip });

  // Les bornes se mesurent APRÈS rognage : un seul caractère utile entouré
  // d'espaces n'est pas un nom, et 80 caractères + espaces en est un.
  it("refuse 1 caractère et 81 caractères, en rendant la longueur lue", () => {
    expect(() => take("a")).toThrow(ReceiverNameLengthError);
    expect(() => take("  a  ")).toThrow(ReceiverNameLengthError);
    expect(() => take("x".repeat(81))).toThrow(ReceiverNameLengthError);
    expect(take(` ${"x".repeat(80)} `).receiverName).toHaveLength(80);
  });

  it("ne rogne que les bords : une espace intérieure compte et reste", () => {
    expect(take("A  B").receiverName).toBe("A  B");
  });

  // Une signature exigée sans rien : c'est la signature qui manque d'abord,
  // puis le nom, puis le bon — le message doit nommer la première pièce absente.
  it("🔴 signature exigée : la première pièce manquante est nommée (signature, nom, bon)", () => {
    expect(() => take("", null, null).ensureSignedIf(true, "ORD-1")).toThrow(
      HandoverSignatureMissingError,
    );
    expect(() => take("", PNG, null).ensureSignedIf(true, "ORD-1")).toThrow(
      ReceiverNameRequiredError,
    );
    expect(() => take("Paul", PNG, null).ensureSignedIf(true, "ORD-1")).toThrow(
      SignedSlipPhotoMissingError,
    );
  });

  it("un bon signé sans signature est gardé quand rien n'est exigé, et refusé quand c'est exigé", () => {
    const slipOnly = take("Paul", null, JPEG);
    expect(slipOnly.signed).toBe(false);
    expect(slipOnly.signedSlip).not.toBeNull();
    expect(() => slipOnly.ensureSignedIf(false, "ORD-1")).not.toThrow();
    expect(() => slipOnly.ensureSignedIf(true, "ORD-1")).toThrow(HandoverSignatureMissingError);
  });
});
