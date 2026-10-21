import { CSV_BOM, csvEuros, csvQuoted } from "../csv-cells.js";

describe("csv-cells — les cellules des tableurs", () => {
  it("écrit les centimes à la virgule, signe compris", () => {
    expect(csvEuros(151_648)).toBe("1516,48");
    expect(csvEuros(-1_250)).toBe("-12,50");
    expect(csvEuros(5)).toBe("0,05");
  });

  it("cite tout et double les guillemets", () => {
    expect(csvQuoted('Café "Le Zinc"; Lyon')).toBe('"Café ""Le Zinc""; Lyon"');
  });

  it.each(["=SOMME(A1:A9)", "+33 6 12", "-1+cmd|' /C calc'!A0", "@SUM(1)"])(
    "neutralise une cellule qui commence comme une formule : %s",
    (value) => {
      expect(csvQuoted(value)).toBe(`"'${value.replace(/"/gu, '""')}"`);
    },
  );

  it("ne neutralise pas un nombre écrit en texte : « -12,50 » reste un montant", () => {
    expect(csvQuoted("-12,50")).toBe('"-12,50"');
    expect(csvQuoted("+5,5")).toBe('"+5,5"');
    expect(csvQuoted("-3")).toBe('"-3"');
  });

  it("garde le BOM en séquence UTF-8", () => {
    expect(CSV_BOM.charCodeAt(0)).toBe(0xfeff);
  });
});
