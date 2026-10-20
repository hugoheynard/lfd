import { ALLERGEN_MATRIX_WORDING, type Locale } from "@lfd/pim-contracts";

import type { MatrixColumn } from "../allergen-matrix.js";
import { shortNameNotes } from "../allergen-matrix-pdf-foot.js";

/**
 * Le pied du PDF rend chaque nom COURANT d'en-tête à son libellé
 * réglementaire (Hugo, 2026-10-20), dans la langue du document.
 */

/** Les libellés du référentiel, tels que semés (annexe II). */
const LABELS: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  fr: {
    gluten: "Céréales contenant du gluten",
    milk: "Lait",
    sesame: "Graines de sésame",
    sulphites: "Anhydride sulfureux et sulfites",
  },
  en: {
    gluten: "Cereals containing gluten",
    milk: "Milk",
    sesame: "Sesame seeds",
    sulphites: "Sulphur dioxide and sulphites",
  },
  it: {
    gluten: "Cereali contenenti glutine",
    milk: "Latte",
    sesame: "Semi di sesamo",
    sulphites: "Anidride solforosa e solfiti",
  },
};

function columnsIn(locale: Locale): MatrixColumn[] {
  const shortNames = ALLERGEN_MATRIX_WORDING[locale].columnShortNames;
  return (["gluten", "milk", "sesame", "sulphites"] as const).map((category) => {
    const label = LABELS[locale][category] ?? "";
    return { category, label, header: shortNames[category] ?? label };
  });
}

describe("shortNameNotes", () => {
  it("en français", () => {
    expect(shortNameNotes(columnsIn("fr"), ALLERGEN_MATRIX_WORDING.fr)).toBe(
      "Gluten : céréales contenant du gluten · Sésame : graines de sésame · Sulfites : anhydride sulfureux et sulfites, au-delà de 10 mg/kg ou 10 mg/l",
    );
  });

  it("en anglais", () => {
    expect(shortNameNotes(columnsIn("en"), ALLERGEN_MATRIX_WORDING.en)).toBe(
      "Gluten: cereals containing gluten · Sesame: sesame seeds · Sulphites: sulphur dioxide and sulphites, above 10 mg/kg or 10 mg/litre",
    );
  });

  it("en italien, le seuil verbatim de l'annexe II pt 12", () => {
    expect(shortNameNotes(columnsIn("it"), ALLERGEN_MATRIX_WORDING.it)).toBe(
      "Glutine: cereali contenenti glutine · Sesamo: semi di sesamo · Solfiti: anidride solforosa e solfiti in concentrazioni superiori a 10 mg/kg o 10 mg/litro",
    );
  });

  it("ne dit rien d'une colonne qui garde son libellé", () => {
    const milkOnly = columnsIn("fr").filter((column) => column.category === "milk");
    expect(shortNameNotes(milkOnly, ALLERGEN_MATRIX_WORDING.fr)).toBe("");
  });
});
