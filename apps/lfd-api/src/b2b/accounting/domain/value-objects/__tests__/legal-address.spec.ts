import { InvalidLegalAddressError } from "../../errors/accounting-errors.js";
import { LegalAddress } from "../legal-address.js";

const SIEGE = {
  line1: "12 rue des Lilas",
  line2: "",
  postalCode: "75011",
  city: "Paris",
  countryCode: "fr",
};

describe("LegalAddress", () => {
  it("met le pays en majuscules et coupe les blancs", () => {
    const address = LegalAddress.create({ ...SIEGE, line1: "  12 rue des Lilas  " });
    expect(address.line1).toBe("12 rue des Lilas");
    expect(address.countryCode).toBe("FR");
  });

  it("rend les lignes à imprimer, sans les vides", () => {
    expect(LegalAddress.create(SIEGE).lines()).toEqual(["12 rue des Lilas", "75011 Paris", "FR"]);
  });

  it("garde le complément d'adresse quand il existe", () => {
    const address = LegalAddress.create({ ...SIEGE, line2: "Bâtiment C" });
    expect(address.lines()).toEqual(["12 rue des Lilas", "Bâtiment C", "75011 Paris", "FR"]);
  });

  it("refuse une adresse incomplète — elle s'imprime sur un document opposable", () => {
    expect(() => LegalAddress.create({ ...SIEGE, line1: "   " })).toThrow(InvalidLegalAddressError);
    expect(() => LegalAddress.create({ ...SIEGE, city: "" })).toThrow(/Ville/u);
    expect(() => LegalAddress.create({ ...SIEGE, postalCode: "" })).toThrow(/Code postal/u);
  });

  it("refuse un pays qui n'est pas un code ISO à deux lettres", () => {
    expect(() => LegalAddress.create({ ...SIEGE, countryCode: "France" })).toThrow(/ISO/u);
  });
});
