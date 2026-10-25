import { handoverProofImageContentType } from "../handover-proof-image.js";

describe("handoverProofImageContentType", () => {
  it("relit les quatre formats dans les octets", () => {
    expect(handoverProofImageContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(
      handoverProofImageContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("image/png");
    expect(handoverProofImageContentType(Buffer.from("RIFF0000WEBPVP8 ", "latin1"))).toBe(
      "image/webp",
    );
    expect(handoverProofImageContentType(Buffer.from("0000ftypheic", "latin1"))).toBe("image/heic");
  });

  it("refuse ce qui n'est pas une image, et un fichier tronqué", () => {
    expect(handoverProofImageContentType(Buffer.from("%PDF-1.7", "latin1"))).toBeNull();
    expect(handoverProofImageContentType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(handoverProofImageContentType(Buffer.alloc(0))).toBeNull();
  });
});

describe("handoverProofImageContentType — les bords", () => {
  it.each(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"])(
    "reconnaît la marque HEIF %s",
    (brand) => {
      expect(handoverProofImageContentType(Buffer.from(`0000ftyp${brand}`, "latin1"))).toBe(
        "image/heic",
      );
    },
  );

  it("refuse une marque ftyp qui n'est pas HEIF (un MP4)", () => {
    expect(handoverProofImageContentType(Buffer.from("0000ftypisom", "latin1"))).toBeNull();
  });

  it("refuse un RIFF qui n'est pas du WebP (un WAV), et un WebP tronqué", () => {
    expect(handoverProofImageContentType(Buffer.from("RIFF0000WAVEfmt ", "latin1"))).toBeNull();
    expect(handoverProofImageContentType(Buffer.from("RIFF0000WEB", "latin1"))).toBeNull();
  });

  it("refuse un PNG dont la signature est tronquée à 7 octets", () => {
    expect(
      handoverProofImageContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a])),
    ).toBeNull();
  });
});
