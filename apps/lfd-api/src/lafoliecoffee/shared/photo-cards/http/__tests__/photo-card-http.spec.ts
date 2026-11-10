import { Buffer } from "node:buffer";

import { StreamableFile } from "@nestjs/common";

import { photoBytesOf, type PhotoResponseHeaders, servePhoto } from "../photo-card-http.js";

/**
 * **Le transport commun des photos.** Les en-têtes sont le sujet : ils sont
 * aussi figés en e2e pour la procédure (client et staff), mais c'est ici que
 * tout usage à venir les hérite.
 */

class RecordedHeaders implements PhotoResponseHeaders {
  readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }
}

describe("servePhoto", () => {
  it("pose le type relu, nosniff et un cache privé immuable", () => {
    const res = new RecordedHeaders();
    const bytes = Buffer.from([0xff, 0xd8, 0xff]);

    const file = servePhoto(res, { bytes, contentType: "image/jpeg" });

    expect(file).toBeInstanceOf(StreamableFile);
    expect(Object.fromEntries(res.headers)).toEqual({
      "Content-Type": "image/jpeg",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=31536000, immutable",
    });
  });
});

describe("photoBytesOf", () => {
  it("rend les octets du fichier joint, ou null sans fichier", () => {
    const buffer = Buffer.from("photo");
    expect(photoBytesOf({ buffer })).toBe(buffer);
    expect(photoBytesOf(undefined)).toBeNull();
  });
});
