import { UnknownMailBrandError } from "../../errors/mail-request.errors.js";
import { MailBrand } from "../mail-brand.js";

describe("MailBrand", () => {
  it("connaît La Folie Coffee", () => {
    expect(MailBrand.of("lfc").code).toBe("lfc");
  });

  it("connaît La Folie Douce : la marque est l'espace (C3)", () => {
    expect(MailBrand.of("lfd").code).toBe("lfd");
  });

  it.each(["", "LFC", "billetterie", "internal"])("refuse « %s »", (code) => {
    expect(() => MailBrand.of(code)).toThrow(UnknownMailBrandError);
  });
});
