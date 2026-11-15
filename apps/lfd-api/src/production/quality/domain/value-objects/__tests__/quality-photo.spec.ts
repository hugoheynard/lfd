import { QUALITY_PHOTO_MAX_BYTES as CONTRACT_MAX_BYTES } from "@lfd/contracts";

import { InvalidQualityPhotoError } from "../../errors/quality-record-errors.js";
import {
  QUALITY_PHOTO_MAX_BYTES,
  QualityPhoto,
  qualityPhotoContentType,
} from "../quality-photo.js";

const ftyp = (brand: string): Buffer =>
  Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftyp"), Buffer.from(brand)]);

describe("QualityPhoto — les quatre formats de D8, reconnus aux octets", () => {
  it.each([
    ["image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe1])],
    ["image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])],
    ["image/webp", Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")])],
    ["image/heic", ftyp("heic")],
    ["image/heic", ftyp("mif1")],
  ])("%s", (contentType, bytes) => {
    expect(QualityPhoto.create(bytes).contentType).toBe(contentType);
  });

  it("refuse le vide, un PDF, un MP4 et une image au-delà de 10 Mo", () => {
    expect(() => QualityPhoto.create(null)).toThrow(InvalidQualityPhotoError);
    expect(() => QualityPhoto.create(Buffer.alloc(0))).toThrow(InvalidQualityPhotoError);
    expect(() => QualityPhoto.create(Buffer.from("%PDF-1.7"))).toThrow(/JPEG, un PNG/u);
    expect(qualityPhotoContentType(ftyp("isom"))).toBeNull();
    const heavy = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(QUALITY_PHOTO_MAX_BYTES),
    ]);
    expect(() => QualityPhoto.create(heavy)).toThrow(/limite est de 10\.0 Mo/u);
  });

  it("la borne du contrat est celle du domaine", () => {
    expect(CONTRACT_MAX_BYTES).toBe(QUALITY_PHOTO_MAX_BYTES);
  });
});
