import { describe, it, expect } from "@jest/globals";
import { contentDispositionAttachment } from "../content-disposition.js";

/** Pull the quoted ASCII fallback out of the header. */
function asciiPart(header: string): string | undefined {
  return /filename="([^"]*)"/.exec(header)?.[1];
}

/** Pull the RFC 5987 ext-value out of the header. */
function extPart(header: string): string | undefined {
  return /filename\*=UTF-8''(.*)$/.exec(header)?.[1];
}

describe("contentDispositionAttachment", () => {
  describe("empty / absent", () => {
    it("returns a bare attachment with no name", () => {
      expect(contentDispositionAttachment()).toBe("attachment");
      expect(contentDispositionAttachment("")).toBe("attachment");
      expect(contentDispositionAttachment(undefined)).toBe("attachment");
    });
  });

  describe("happy path", () => {
    it("emits both an ascii and an rfc5987 filename, always attachment", () => {
      const header = contentDispositionAttachment("contract.pdf");
      expect(header).toBe("attachment; filename=\"contract.pdf\"; filename*=UTF-8''contract.pdf");
    });

    it("always starts with the attachment disposition", () => {
      for (const name of ["a.pdf", "résumé.pdf", "🎵.mp3", "..", "   "]) {
        expect(contentDispositionAttachment(name).startsWith("attachment")).toBe(true);
      }
    });
  });

  describe("header-injection (the whole point)", () => {
    it("strips a double-quote breakout", () => {
      const header = contentDispositionAttachment('a".pdf');
      expect(asciiPart(header)).toBe("a_.pdf");
      expect(header).not.toContain('a".pdf');
    });

    it("strips a backslash escape attempt", () => {
      expect(asciiPart(contentDispositionAttachment('a\\".pdf'))).toBe("a__.pdf");
    });

    it("neutralises a quote-then-new-param breakout", () => {
      // Classic: close the quoted-string, inject a new disposition param.
      const header = contentDispositionAttachment('x";filename=evil.exe;a="');
      // Every quote is stripped → the whole payload stays inert inside the
      // quoted ascii value; the injected `filename=` can't become a real param.
      expect(asciiPart(header)).toBe("x_;filename=evil.exe;a=_");
      // Exactly two quotes survive — the matched pair around the value; every
      // injected quote was stripped, so the pair can't be unbalanced.
      expect(header.match(/"/g)?.length).toBe(2);
    });

    it.each([
      ["CR", "evil\rSet-Cookie: x=1.pdf"],
      ["LF", "evil\nSet-Cookie: x=1.pdf"],
      ["CRLF", "evil\r\nSet-Cookie: x=1.pdf"],
      ["NUL", "evil\0.pdf"],
      ["vertical tab", "evil\v.pdf"],
      ["form feed", "evil\f.pdf"],
      ["tab", "evil\t.pdf"],
      ["DEL 0x7f", "evil\x7f.pdf"],
      ["unit separator 0x1f", "evil\x1f.pdf"],
    ])("removes %s from the ascii fallback so no header line can be forged", (_label, name) => {
      const header = contentDispositionAttachment(name);
      // No control byte survives anywhere in the header (checked by code-point
      // to avoid a control-char regex literal).
      const hasControl = [...header].some((ch) => {
        const code = ch.charCodeAt(0);
        return code < 0x20 || code === 0x7f;
      });
      expect(hasControl).toBe(false);
      // The ext-value percent-encodes the byte rather than dropping it.
      expect(extPart(header)).toBeDefined();
    });
  });

  describe("RFC 5987 encoding", () => {
    it("percent-encodes non-ascii (latin) and degrades the ascii fallback", () => {
      const header = contentDispositionAttachment("résumé.pdf");
      expect(extPart(header)).toBe("r%C3%A9sum%C3%A9.pdf");
      expect(asciiPart(header)).toBe("r_sum_.pdf");
    });

    it("percent-encodes the attr-char exclusions !'()*", () => {
      expect(extPart(contentDispositionAttachment("a!'()*.pdf"))).toBe("a%21%27%28%29%2A.pdf");
    });

    it("percent-encodes param separators ; , =", () => {
      expect(extPart(contentDispositionAttachment("a;b,c=d.pdf"))).toBe("a%3Bb%2Cc%3Dd.pdf");
    });

    it("re-encodes a literal percent so it cannot be double-decoded", () => {
      // `%41` must NOT survive as a raw `%41` (which would decode to `A`).
      expect(extPart(contentDispositionAttachment("%41.pdf"))).toBe("%2541.pdf");
    });

    it("handles CJK and emoji (astral / surrogate pairs)", () => {
      expect(extPart(contentDispositionAttachment("日本語.pdf"))).toBe(
        "%E6%97%A5%E6%9C%AC%E8%AA%9E.pdf",
      );
      // 🎵 = U+1F3B5, a valid surrogate pair → 4 UTF-8 bytes.
      expect(extPart(contentDispositionAttachment("🎵.mp3"))).toBe("%F0%9F%8E%B5.mp3");
    });

    it("does not throw on a LONE high surrogate (would crash encodeURIComponent)", () => {
      const header = contentDispositionAttachment("evil\uD800.pdf");
      expect(header.startsWith("attachment")).toBe(true);
      // The unpaired surrogate became U+FFFD (%EF%BF%BD), not a crash.
      expect(extPart(header)).toBe("evil%EF%BF%BD.pdf");
    });

    it("does not throw on a LONE low surrogate", () => {
      expect(() => contentDispositionAttachment("\uDC00x.pdf")).not.toThrow();
      expect(extPart(contentDispositionAttachment("\uDC00x.pdf"))).toBe("%EF%BF%BDx.pdf");
    });

    it("preserves a valid surrogate pair split across a lone one", () => {
      // valid 🎵 then a lone high surrogate.
      const header = contentDispositionAttachment("🎵\uD800.mp3");
      expect(extPart(header)).toBe("%F0%9F%8E%B5%EF%BF%BD.mp3");
    });
  });

  describe("degenerate names", () => {
    it("handles an all-non-ascii name (ascii fallback becomes underscores)", () => {
      const header = contentDispositionAttachment("日本語");
      expect(asciiPart(header)).toBe("___");
      expect(extPart(header)).toBe("%E6%97%A5%E6%9C%AC%E8%AA%9E");
    });

    it("handles a very long name without crashing", () => {
      const name = `${"a".repeat(5000)}.pdf`;
      const header = contentDispositionAttachment(name);
      expect(header.startsWith("attachment")).toBe(true);
      expect(extPart(header)?.endsWith(".pdf")).toBe(true);
    });

    it("handles whitespace-only and dot-only names", () => {
      expect(asciiPart(contentDispositionAttachment("   "))).toBe("   ");
      expect(extPart(contentDispositionAttachment(".."))).toBe("..");
    });
  });
});
