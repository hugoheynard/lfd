import { UnknownMailBrandError } from "../../errors/mail-request.errors.js";
import { MailBrand } from "../mail-brand.js";

describe("MailBrand", () => {
  it("connaît La Folie Coffee", () => {
    expect(MailBrand.of("lfc").code).toBe("lfc");
  });

  it.each(["", "LFC", "billetterie"])("refuse « %s »", (code) => {
    expect(() => MailBrand.of(code)).toThrow(UnknownMailBrandError);
  });
});
