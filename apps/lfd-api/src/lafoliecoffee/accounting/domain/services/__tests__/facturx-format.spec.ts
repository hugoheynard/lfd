import {
  basisPointsPercent,
  centsAmount,
  date102,
  escapeXml,
  millicentsPrice,
  ratePercent,
  thousandthsQuantity,
} from "../facturx-format.js";

/** Les écritures élémentaires du XML Factur-X, en arithmétique entière. */
describe("facturx-format", () => {
  it("écrit des centimes en euros à deux décimales", () => {
    expect(centsAmount(0)).toBe("0.00");
    expect(centsAmount(5)).toBe("0.05");
    expect(centsAmount(1_234)).toBe("12.34");
    expect(centsAmount(-101)).toBe("-1.01");
    expect(centsAmount(123_456_789_01)).toBe("123456789.01");
  });

  it("écrit un prix en millicentimes : deux décimales au moins, cinq au plus", () => {
    expect(millicentsPrice(500_000)).toBe("5.00");
    expect(millicentsPrice(123_456)).toBe("1.23456");
    expect(millicentsPrice(123_450)).toBe("1.2345");
    expect(millicentsPrice(7)).toBe("0.00007");
    expect(millicentsPrice(0)).toBe("0.00");
  });

  it("écrit une quantité en millièmes sans zéro superflu", () => {
    expect(thousandthsQuantity(2_000)).toBe("2");
    expect(thousandthsQuantity(1_250)).toBe("1.25");
    expect(thousandthsQuantity(1)).toBe("0.001");
  });

  it("écrit un taux en pourcentage à deux décimales", () => {
    expect(ratePercent(5.5)).toBe("5.50");
    expect(ratePercent(2.1)).toBe("2.10");
    expect(ratePercent(20)).toBe("20.00");
    expect(basisPointsPercent(1_415)).toBe("14.15");
  });

  it("écrit une date au format 102", () => {
    expect(date102("2026-09-30")).toBe("20260930");
  });

  it("échappe les cinq caractères réservés et neutralise les contrôles", () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe("a&amp;b&lt;c&gt;d&quot;e&apos;f");
    expect(escapeXml("a\u0000b\tc\nd")).toBe("a b\tc\nd");
    expect(escapeXml("pain 🥖")).toBe("pain 🥖");
  });
});
