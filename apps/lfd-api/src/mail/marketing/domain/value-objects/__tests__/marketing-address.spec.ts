import { InvalidMarketingPreferenceError } from "../../errors/marketing-preference.errors.js";
import { MarketingAddress, marketingKeyOf } from "../marketing-address.js";

const PRINT = "0123456789abcdef".repeat(4);

describe("MarketingAddress", () => {
  it("la clé suit la règle de `MailRequest` : blancs retirés, minuscules", () => {
    expect(marketingKeyOf("  Colette@Halles.FR ")).toBe("colette@halles.fr");
  });

  it("accepte une clé normalisée et une empreinte hexadécimale de 64 caractères", () => {
    expect(MarketingAddress.of("colette@halles.fr", PRINT)).toMatchObject({
      key: "colette@halles.fr",
      print: PRINT,
    });
  });

  it.each([
    ["une clé vide", "", PRINT],
    ["une clé non normalisée", "Colette@halles.fr", PRINT],
    ["une clé trop longue", `${"a".repeat(320)}@x`, PRINT],
    ["une empreinte courte", "colette@halles.fr", "abc"],
    ["une empreinte en majuscules", "colette@halles.fr", PRINT.toUpperCase()],
  ])("refuse %s", (_case, key, print) => {
    expect(() => MarketingAddress.of(key, print)).toThrow(InvalidMarketingPreferenceError);
  });
});
