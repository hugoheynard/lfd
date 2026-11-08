import { InvalidMailSearchAddressError } from "../../errors/mail-sends.errors.js";
import { mailSearchKeyOf } from "../mail-search-address.js";

describe("mailSearchKeyOf — l'adresse cherchée, normalisée comme recipient_key", () => {
  it("rogne et met en minuscules", () => {
    expect(mailSearchKeyOf("  Colette@Halles.FR ")).toBe("colette@halles.fr");
  });

  it.each(["", "   ", "colette", `${"a".repeat(320)}@x.fr`])(
    "refuse ce qui n'est pas une adresse (%s)",
    (address) => {
      expect(() => mailSearchKeyOf(address)).toThrow(InvalidMailSearchAddressError);
    },
  );
});
