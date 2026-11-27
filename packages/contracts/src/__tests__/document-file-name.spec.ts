import { fileNameCustomerPart, orderDocumentFileName } from "../document-file-name.js";

describe("fileNameCustomerPart", () => {
  it("met en majuscules et retire les accents", () => {
    expect(fileNameCustomerPart("Crème Brûlée & Cie")).toBe("CREME-BRULEE-CIE");
  });

  it("remplace l'apostrophe par un tiret", () => {
    expect(fileNameCustomerPart("L'Épi d'or")).toBe("L-EPI-D-OR");
  });

  it("compresse les espaces multiples et nettoie les bornes", () => {
    expect(fileNameCustomerPart("  Les   Tommeuses  ")).toBe("LES-TOMMEUSES");
  });

  it("rend vide un nom sans rien de lisible", () => {
    expect(fileNameCustomerPart("")).toBe("");
    expect(fileNameCustomerPart(" — ")).toBe("");
  });

  it("borne un nom très long sans finir sur un tiret", () => {
    const part = fileNameCustomerPart(`${"A".repeat(39)} BCDEF`);
    expect(part).toBe("A".repeat(39));
    expect(fileNameCustomerPart("X".repeat(80))).toHaveLength(40);
  });
});

describe("orderDocumentFileName", () => {
  it("assemble la marque, la référence, le client et le suffixe", () => {
    expect(orderDocumentFileName("ORD-35", "Les Tommeuses", "confirmation")).toBe(
      "LFC-ORD-35-LES-TOMMEUSES-confirmation.pdf",
    );
  });

  it("omet le client quand son nom ne laisse rien", () => {
    expect(orderDocumentFileName("ORD-35", "  ", "BL-35-1")).toBe("LFC-ORD-35-BL-35-1.pdf");
  });
});
