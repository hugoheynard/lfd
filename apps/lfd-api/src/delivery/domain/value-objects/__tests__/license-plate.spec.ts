import { InvalidLicensePlateError } from "../../errors/delivery-errors.js";
import { LicensePlate } from "../license-plate.js";

describe("LicensePlate", () => {
  it.each(["AB-123-CD", "ab 123 cd", "AB123CD", " ab.123.cd ", "Ab-123 cD"])(
    "normalise la plaque SIV « %s » en AB-123-CD",
    (raw) => {
      expect(LicensePlate.of(raw).value).toBe("AB-123-CD");
    },
  );

  it.each([
    ["123 ABC 75", "123 ABC 75"],
    ["123abc75", "123 ABC 75"],
    ["1234-AB-2A", "1234 AB 2A"],
    ["12 A 971", "12 A 971"],
  ])("normalise l'ancienne plaque FNI « %s » en « %s »", (raw, expected) => {
    expect(LicensePlate.of(raw).value).toBe(expected);
  });

  it.each(["", "AB-12-CD", "AB-1234-CD", "IO-123-UA", "ABCDEFG", "12345 AB 75", "玉-123-CD"])(
    "refuse « %s », en nommant la forme attendue",
    (raw) => {
      expect(() => LicensePlate.of(raw)).toThrow(InvalidLicensePlateError);
      expect(() => LicensePlate.of(raw)).toThrow(/AB-123-CD/u);
    },
  );

  it("deux saisies de la même plaque sont la même plaque", () => {
    expect(LicensePlate.of("ab 123 cd").equals(LicensePlate.of("AB123CD"))).toBe(true);
    expect(LicensePlate.of("AB-123-CD").equals(LicensePlate.of("AB-123-CE"))).toBe(false);
  });
});
