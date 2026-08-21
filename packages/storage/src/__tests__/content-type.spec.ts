import { describe, it, expect } from "@jest/globals";
import { sniffContentType } from "../content-type.js";

/** Build a buffer from a leading byte array padded to `size` with 0x00. */
function withHeader(bytes: number[], size = 64): Buffer {
  const b = Buffer.alloc(Math.max(size, bytes.length), 0x00);
  Buffer.from(bytes).copy(b);
  return b;
}

const riff = (tag: string): Buffer =>
  Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4, 0), Buffer.from(tag)]);
const form = (tag: string): Buffer =>
  Buffer.concat([Buffer.from("FORM"), Buffer.alloc(4, 0), Buffer.from(tag)]);
const ftyp = (brand: string): Buffer =>
  Buffer.concat([Buffer.alloc(4, 0), Buffer.from("ftyp"), Buffer.from(brand)]);

describe("sniffContentType", () => {
  describe("documents & images", () => {
    it("detects pdf / png / jpeg / gif by magic", () => {
      expect(sniffContentType(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
      expect(sniffContentType(withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
        "image/png",
      );
      expect(sniffContentType(withHeader([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
      expect(sniffContentType(Buffer.from("GIF89a...."))).toBe("image/gif");
      expect(sniffContentType(Buffer.from("GIF87a...."))).toBe("image/gif");
    });
  });

  describe("audio", () => {
    it("detects flac / ogg / id3-mp3", () => {
      expect(sniffContentType(Buffer.from("fLaC...."))).toBe("audio/flac");
      expect(sniffContentType(Buffer.from("OggS...."))).toBe("audio/ogg");
      expect(sniffContentType(Buffer.from("ID3\x03...."))).toBe("audio/mpeg");
    });

    it("detects WAV only when the WAVE marker is present at offset 8", () => {
      expect(sniffContentType(riff("WAVE"))).toBe("audio/wav");
    });

    it("detects AIFF only when the AIFF marker is present at offset 8", () => {
      expect(sniffContentType(form("AIFF"))).toBe("audio/aiff");
    });

    it("detects mp4/m4a via ftyp at offset 4 for several brands", () => {
      expect(sniffContentType(ftyp("M4A "))).toBe("audio/mp4");
      expect(sniffContentType(ftyp("mp42"))).toBe("audio/mp4");
      expect(sniffContentType(ftyp("isom"))).toBe("audio/mp4");
    });

    describe("mp3 frame-sync (no ID3 tag)", () => {
      it.each([
        ["0xFF 0xFB", [0xff, 0xfb]],
        ["0xFF 0xF3", [0xff, 0xf3]],
        ["0xFF 0xE0 (lowest valid sync)", [0xff, 0xe0]],
        ["0xFF 0xFF (all bits)", [0xff, 0xff]],
      ])("accepts %s as audio/mpeg", (_l, bytes) => {
        expect(sniffContentType(withHeader(bytes))).toBe("audio/mpeg");
      });

      it.each([
        ["0xFF 0xC0 (sync bits not all set)", [0xff, 0xc0]],
        ["0xFF 0x00", [0xff, 0x00]],
        ["0xFE 0xFB (first byte not 0xFF)", [0xfe, 0xfb]],
      ])("rejects %s (not a real frame sync)", (_l, bytes) => {
        expect(sniffContentType(withHeader(bytes))).toBeNull();
      });
    });
  });

  describe("vicious overlaps & container false-positives", () => {
    it("classifies 0xFF 0xD8 0xFF as JPEG, NOT mp3 frame-sync", () => {
      // 0xFF first byte would also pass the mp3 sync fallback — order matters.
      expect(sniffContentType(withHeader([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    });

    it("classifies RIFF/WEBP as an image, and still rejects other RIFF (avi)", () => {
      // WEBP was rejected until product imagery needed it: matching "RIFF" alone
      // would have claimed AVI too, so each container is claimed by its OWN
      // secondary marker, never by the envelope.
      expect(sniffContentType(riff("WEBP"))).toBe("image/webp");
      expect(sniffContentType(riff("AVI "))).toBeNull();
    });

    it("rejects FORM containers that are not AIFF (e.g. AIFF-C)", () => {
      expect(sniffContentType(form("AIFC"))).toBeNull();
    });

    it("classifies a zip container as application/zip (docx indistinguishable)", () => {
      expect(sniffContentType(withHeader([0x50, 0x4b, 0x03, 0x04]))).toBe("application/zip");
      // Empty-archive / spanned zip variants are NOT matched.
      expect(sniffContentType(withHeader([0x50, 0x4b, 0x05, 0x06]))).toBeNull();
    });

    it("documents the polyglot limitation: a GIF/JS polyglot still sniffs as gif", () => {
      // The sniff is header-only; W1.1 (forced attachment) is what stops execution.
      expect(sniffContentType(Buffer.from("GIF89a/*<script>*/"))).toBe("image/gif");
    });
  });

  describe("hostile / unknown content", () => {
    it.each([
      ["html", "<!DOCTYPE html><script>alert(1)</script>"],
      ["svg", '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'],
      ["svg with leading BOM", "﻿<svg></svg>"],
      ["plain text", "just some text"],
      ["xml", '<?xml version="1.0"?><x/>'],
      ["windows exe (MZ)", "MZ\x90\x00"],
      ["elf binary", "\x7fELF"],
    ])("returns null for %s", (_l, content) => {
      expect(sniffContentType(Buffer.from(content))).toBeNull();
    });

    it("rejects a PDF whose magic is not at offset 0 (leading junk)", () => {
      // We require %PDF- at the very start; PDFs with leading bytes are rejected.
      expect(sniffContentType(Buffer.from("   %PDF-1.7"))).toBeNull();
      expect(sniffContentType(Buffer.from("\n%PDF-1.7"))).toBeNull();
    });
  });

  describe("boundary sizes", () => {
    it("returns null for an empty buffer", () => {
      expect(sniffContentType(Buffer.alloc(0))).toBeNull();
    });

    it("returns null for a buffer shorter than the signature", () => {
      expect(sniffContentType(Buffer.from([0x52, 0x49]))).toBeNull(); // "RI"
      expect(sniffContentType(Buffer.from([0xff]))).toBeNull(); // half a frame-sync
      expect(sniffContentType(Buffer.from("%PD"))).toBeNull();
    });

    it("matches a buffer exactly the signature length (png = 8 bytes)", () => {
      expect(sniffContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
        "image/png",
      );
    });

    it("does not read past a short RIFF when checking offset 8", () => {
      // "RIFF" + only 4 more bytes: cannot reach offset 8 marker → null, no throw.
      expect(sniffContentType(Buffer.from("RIFF1234"))).toBeNull();
    });

    it("does not misread ftyp when the buffer is too short", () => {
      expect(sniffContentType(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x66, 0x74]))).toBeNull();
    });
  });
});
