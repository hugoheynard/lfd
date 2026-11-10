import { InvalidPhoneError } from "../../../account/domain/errors/account-errors.js";
import { ContactPhone, type ContactPhoneSettings } from "../contact-phone.js";
import {
  ContactPhoneIncompleteError,
  ContactPositionInvalidError,
} from "../errors/contact-errors.js";

const AT = new Date(0);
const LATER = new Date(60_000);
const SHOP: ContactPhoneSettings = {
  label: { fr: " Boutique de Val d'Isère ", en: "", it: "" },
  number: " 04  79 00 00 00 ",
  audience: "b2c",
  position: 0,
  active: true,
};

describe("ContactPhone — un numéro de contact", () => {
  it("se crée rogné, le numéro tel que saisi (espaces resserrés)", () => {
    const state = ContactPhone.create({ ...SHOP, id: "p1", at: AT }).toPersistence();
    expect(state.label.fr).toBe("Boutique de Val d'Isère");
    expect(state.number).toBe("04 79 00 00 00");
  });

  it("refuse un numéro sans libellé français, ou sans numéro", () => {
    expect(() =>
      ContactPhone.create({ ...SHOP, label: { fr: "", en: "Shop", it: "" }, id: "p1", at: AT }),
    ).toThrow(ContactPhoneIncompleteError);
    expect(() => ContactPhone.create({ ...SHOP, number: "  ", id: "p1", at: AT })).toThrow(
      ContactPhoneIncompleteError,
    );
  });

  it("refuse un numéro mal formé, et un rang négatif", () => {
    expect(() =>
      ContactPhone.create({ ...SHOP, number: "appelez-nous", id: "p1", at: AT }),
    ).toThrow(InvalidPhoneError);
    expect(() => ContactPhone.create({ ...SHOP, number: "12 34", id: "p1", at: AT })).toThrow(
      InvalidPhoneError,
    );
    expect(() => ContactPhone.create({ ...SHOP, position: -1, id: "p1", at: AT })).toThrow(
      ContactPositionInvalidError,
    );
  });

  it("la révision revalide ; l'archivage est idempotent", () => {
    const phone = ContactPhone.create({ ...SHOP, id: "p1", at: AT });
    expect(() => phone.revise({ ...SHOP, number: "" }, LATER)).toThrow(ContactPhoneIncompleteError);
    phone.archive(AT);
    phone.archive(LATER);
    expect(phone.toPersistence().archivedAt).toEqual(AT);
  });
});
