import { DiskInvoiceFontSource } from "../disk-invoice-font-source.js";

/**
 * Les polices de la facture sont lues par le MÊME chemin que le conteneur
 * (`fonts/` à côté de `src/` et de `dist/`). Un dossier déplacé ou renommé
 * rougit ici, plutôt qu'au premier rendu en production.
 */
describe("DiskInvoiceFontSource", () => {
  it("lit les deux graisses TrueType, une seule fois", async () => {
    const source = new DiskInvoiceFontSource();

    const fonts = await source.load();

    // Un fichier TrueType commence par la version 1.0 (00 01 00 00).
    expect(fonts.regular.subarray(0, 4).toString("hex")).toBe("00010000");
    expect(fonts.bold.subarray(0, 4).toString("hex")).toBe("00010000");
    expect(fonts.regular.equals(fonts.bold)).toBe(false);
    expect(await source.load()).toBe(fonts);
  });
});
