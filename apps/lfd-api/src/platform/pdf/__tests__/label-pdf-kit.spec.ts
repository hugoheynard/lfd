import type { Buffer } from "node:buffer";

import { BRAND_LOGO } from "../../brand/__tests__/fixed-brand-logo.js";
import {
  drawLabelHeader,
  eachLabel,
  fittedSize,
  LABEL_INNER,
  putCentered,
} from "../label-pdf-kit.js";
import { render } from "../paper-pdf-kit.js";
import { pdfPages } from "./pdf-text.js";

// Un instant comparé à rien : il ne sert qu'à figer les dates du fichier.
const AT = new Date(0);

/** Les `/MediaBox` du fichier, une par page. */
function mediaBoxes(pdf: Buffer): readonly string[] {
  return [...pdf.toString("latin1").matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((match) =>
    (match[1] ?? "").trim(),
  );
}

describe("la trousse des étiquettes", () => {
  it("une étiquette par feuille A6 portrait (105 × 148 mm)", async () => {
    const pdf = await render(
      AT,
      "test",
      (doc) => {
        eachLabel(doc, ["un", "deux", "trois"], (label) => {
          drawLabelHeader(doc, BRAND_LOGO, "Étiquette");
          putCentered(doc, label, 100, { max: 20, min: 10 });
        });
      },
      false,
      "portrait",
      "A6",
    );
    expect(pdfPages(pdf)).toHaveLength(3);
    expect(mediaBoxes(pdf)).toEqual([
      "0 0 297.64 419.53",
      "0 0 297.64 419.53",
      "0 0 297.64 419.53",
    ]);
  });

  it("resserre une ligne trop longue, sans descendre sous le corps minimal", async () => {
    await render(AT, "test", (doc) => {
      expect(fittedSize(doc, "ORD-1", { max: 40, min: 20, bold: true })).toBe(40);
      const long = "Une raison sociale vraiment beaucoup trop longue pour une étiquette";
      const size = fittedSize(doc, long, { max: 40, min: 6 });
      expect(size).toBeLessThan(40);
      expect(doc.font("Helvetica").fontSize(size).widthOfString(long)).toBeLessThanOrEqual(
        LABEL_INNER,
      );
      expect(fittedSize(doc, long, { max: 40, min: 30 })).toBe(30);
    });
  });

  it("coupe d'un « … » une ligne qui ne tient toujours pas au corps minimal", async () => {
    const pdf = await render(
      AT,
      "test",
      (doc) => {
        putCentered(doc, "X".repeat(200), 100, { max: 12, min: 12 });
      },
      false,
      "portrait",
      "A6",
    );
    // L'ellipse est 0x85 en WinAnsi ; `pdfPages` décode en latin1.
    const text = pdfPages(pdf).join(" ");
    const kept = text.replace(/[^X]/gu, "").length;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(200);
    expect(text).toContain("\u0085");
  });
});
