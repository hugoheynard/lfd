import { InvalidIncidentPhotoError } from "../../errors/delivery-doorstep-errors.js";
import {
  INCIDENT_PHOTO_MAX_BYTES,
  IncidentPhoto,
  incidentPhotoContentType,
} from "../incident-photo.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1");
const HEIC = Buffer.from("\0\0\0\x18ftypheic\0\0\0\0", "latin1");

describe("IncidentPhoto — la photo d'un problème", () => {
  it.each([
    ["JPEG", JPEG, "image/jpeg"],
    ["PNG", PNG, "image/png"],
    ["WebP", WEBP, "image/webp"],
    ["HEIC", HEIC, "image/heic"],
  ])("reconnaît un %s à ses octets", (_label, bytes, type) => {
    expect(incidentPhotoContentType(bytes)).toBe(type);
    expect(IncidentPhoto.create(bytes).contentType).toBe(type);
  });

  it("refuse une image vide", () => {
    expect(() => IncidentPhoto.create(Buffer.alloc(0))).toThrow(InvalidIncidentPhotoError);
  });

  it("refuse ce qui n'est pas une image, quel que soit le nom annoncé", () => {
    expect(() => IncidentPhoto.create(Buffer.from("%PDF-1.7"))).toThrow(InvalidIncidentPhotoError);
  });

  it("refuse au-delà de 10 Mo, en le disant", () => {
    const heavy = Buffer.concat([JPEG, Buffer.alloc(INCIDENT_PHOTO_MAX_BYTES)]);
    expect(() => IncidentPhoto.create(heavy)).toThrow(/10\.0 Mo/u);
  });
});
