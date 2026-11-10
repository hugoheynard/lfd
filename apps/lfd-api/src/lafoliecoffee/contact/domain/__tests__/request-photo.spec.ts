import { Buffer } from "node:buffer";

import { REQUEST_PHOTO_BOUNDS } from "@lfd/contracts";

import { InvalidRequestPhotoError } from "../errors/contact-errors.js";
import { RequestPhoto, requestPhotoContentType } from "../request-photo.js";
import { pngOf, webpOf } from "./request-fixtures.js";

/** Un JPEG minimal : SOI puis un SOF0 qui porte 40 × 30. */
function jpegOf(): Buffer {
  const frame = Buffer.alloc(17);
  frame.writeUInt16BE(0xffc0, 0);
  frame.writeUInt16BE(17, 2);
  frame[4] = 8;
  frame.writeUInt16BE(30, 5);
  frame.writeUInt16BE(40, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), frame]);
}

describe("RequestPhoto — la photo d'un signalement", () => {
  it.each([
    ["JPEG", jpegOf(), "image/jpeg"],
    ["PNG", pngOf(40, 30), "image/png"],
    ["WebP", webpOf(), "image/webp"],
  ])("accepte un %s, reconnu à ses octets", (_label, bytes, type) => {
    expect(RequestPhoto.create(bytes).contentType).toBe(type);
  });

  it("refuse une image vide", () => {
    expect(() => RequestPhoto.create(Buffer.alloc(0))).toThrow(InvalidRequestPhotoError);
  });

  it("refuse au-delà de 5 Mo, et accepte la borne exacte", () => {
    const png = pngOf(40, 30);
    const exact = Buffer.concat([png, Buffer.alloc(REQUEST_PHOTO_BOUNDS.maxBytes - png.length)]);
    expect(RequestPhoto.create(exact).sizeBytes).toBe(REQUEST_PHOTO_BOUNDS.maxBytes);
    expect(() => RequestPhoto.create(Buffer.concat([exact, Buffer.alloc(1)]))).toThrow(/5,0 Mo/u);
  });

  it("refuse ce qui n'est pas une image admise, quel que soit le nom annoncé", () => {
    expect(requestPhotoContentType(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(() => RequestPhoto.create(Buffer.from("\0\0\0\x18ftypheic\0\0\0\0", "latin1"))).toThrow(
      InvalidRequestPhotoError,
    );
  });

  it("refuse une image tronquée", () => {
    expect(() =>
      RequestPhoto.create(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toThrow(/tronquée/u);
  });
});
