import { describe, it, expect } from "@jest/globals";
import { sanitiseFileName } from "../sanitise-file-name.js";

const OK = /^[A-Za-z0-9._-]*$/;

describe("sanitiseFileName", () => {
  describe("happy path", () => {
    it("keeps already-safe names verbatim", () => {
      expect(sanitiseFileName("mix-final_v2.wav")).toBe("mix-final_v2.wav");
      expect(sanitiseFileName("track.mp3")).toBe("track.mp3");
    });

    it("is idempotent", () => {
      const once = sanitiseFileName("Naïve Résumé (final).wav");
      expect(sanitiseFileName(once)).toBe(once);
    });

    it("always returns only the safe charset", () => {
      for (const name of ["../../x", "Mix (1).wav", "日本語.pdf", "🎵.mp3", "...", "\0\r\n"]) {
        expect(sanitiseFileName(name)).toMatch(OK);
      }
    });
  });

  describe("diacritics & non-ascii", () => {
    it("strips combining marks (é → e)", () => {
      expect(sanitiseFileName("Naïve.wav")).toBe("Naive.wav");
      expect(sanitiseFileName("Café.mp3")).toBe("Cafe.mp3");
    });

    it("replaces fully non-ascii names, falling back when empty", () => {
      expect(sanitiseFileName("日本語.wav")).toBe("wav");
      expect(sanitiseFileName("日本語")).toBe("file");
      expect(sanitiseFileName("🎵🎵🎵")).toBe("file");
    });
  });

  describe("path traversal (the security point)", () => {
    it("replaces slashes and strips leading dots so `..` cannot survive", () => {
      expect(sanitiseFileName("../../etc/passwd")).toBe("etc_passwd");
      expect(sanitiseFileName("..")).toBe("file");
      expect(sanitiseFileName("...mp3")).toBe("mp3");
      expect(sanitiseFileName(".htaccess")).toBe("htaccess");
    });

    it("neutralises a windows-style backslash traversal", () => {
      expect(sanitiseFileName("..\\..\\windows\\system32")).toBe("windows_system32");
    });

    it("collapses interior `..` so no traversal token remains", () => {
      expect(sanitiseFileName("a..b..c.wav")).toBe("a.b.c.wav");
      // slashes → `_`, then `..` collapses to `.` — crucially, no `..` survives.
      expect(sanitiseFileName("a/../b.wav")).toBe("a_._b.wav");
      expect(sanitiseFileName("a/../b.wav")).not.toContain("..");
    });
  });

  describe("control chars & whitespace", () => {
    it("replaces control bytes (CR/LF/NUL/tab) with `_` and collapses", () => {
      expect(sanitiseFileName("a\r\n\t\0b.wav")).toBe("a_b.wav");
    });

    it("replaces spaces and brackets, collapses runs", () => {
      expect(sanitiseFileName("Mix (final).wav")).toBe("Mix_final_.wav");
      expect(sanitiseFileName("a   b   c.wav")).toBe("a_b_c.wav");
    });
  });

  describe("extension handling & truncation", () => {
    it("truncates the base while preserving the extension", () => {
      const out = sanitiseFileName(`${"a".repeat(500)}.wav`);
      expect(out.endsWith(".wav")).toBe(true);
      expect(out.length).toBeLessThanOrEqual(100 + ".wav".length);
    });

    it("treats a leading-dot-only name as having no extension", () => {
      expect(sanitiseFileName(".wav")).toBe("wav"); // leading dot stripped
    });

    it("treats a trailing dot as no extension", () => {
      expect(sanitiseFileName("name.")).toBe("name.");
    });

    it("handles a name that is one giant extension-less token", () => {
      const out = sanitiseFileName("x".repeat(300));
      expect(out.length).toBe(100);
      expect(out).toBe("x".repeat(100));
    });
  });

  describe("degenerate inputs", () => {
    it("falls back on empty / whitespace-only / punctuation-only", () => {
      expect(sanitiseFileName("")).toBe("file");
      expect(sanitiseFileName("___")).toBe("file"); // leading-strip removes all
      expect(sanitiseFileName("@#$%^&")).toBe("file");
    });

    it("honours a custom fallback", () => {
      expect(sanitiseFileName("", "track")).toBe("track");
      expect(sanitiseFileName("日本語", "track")).toBe("track");
    });
  });
});
