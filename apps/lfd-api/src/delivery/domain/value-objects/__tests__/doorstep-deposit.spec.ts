import {
  DepositPhotoMissingError,
  InvalidHandoverPictureError,
} from "../../errors/delivery-doorstep-errors.js";
import { DoorstepDeposit } from "../doorstep-deposit.js";
import { INCIDENT_PHOTO_MAX_BYTES } from "../incident-photo.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe("DoorstepDeposit — la pièce d'un dépôt (B2, § 9)", () => {
  it("prend la photo, relue dans ses octets", () => {
    expect(DoorstepDeposit.take(JPEG).photo.contentType).toBe("image/jpeg");
  });

  it("🔴 refuse un dépôt sans photo : c'est sa seule preuve", () => {
    expect(() => DoorstepDeposit.take(null)).toThrow(DepositPhotoMissingError);
  });

  it("refuse une image vide, trop lourde, ou d'un format inconnu", () => {
    expect(() => DoorstepDeposit.take(Buffer.alloc(0))).toThrow(InvalidHandoverPictureError);
    expect(() => DoorstepDeposit.take(Buffer.alloc(INCIDENT_PHOTO_MAX_BYTES + 1, 0xff))).toThrow(
      InvalidHandoverPictureError,
    );
    expect(() => DoorstepDeposit.take(Buffer.from("pas une image"))).toThrow(
      InvalidHandoverPictureError,
    );
  });
});
