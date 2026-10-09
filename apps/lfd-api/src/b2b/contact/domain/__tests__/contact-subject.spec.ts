import { InvalidEmailError } from "../../../account/domain/errors/account-errors.js";
import { ContactSubject, type ContactSubjectSettings } from "../contact-subject.js";
import {
  ContactSubjectLabelMissingError,
  ContactSubjectPositionInvalidError,
  ContactTextTooLongError,
} from "../errors/contact-errors.js";

const AT = new Date(0);
const LATER = new Date(60_000);

const SETTINGS: ContactSubjectSettings = {
  label: { fr: "  Devenir client pro ", en: "Become a pro customer", it: "" },
  recipientEmail: "Commercial@LFC.fr",
  position: 1,
  active: true,
  audience: "b2b",
  priority: "urgent",
};

describe("ContactSubject — un objet de « Nous écrire »", () => {
  it("se crée rogné, l'adresse normalisée", () => {
    const subject = ContactSubject.create({ ...SETTINGS, id: "s1", at: AT });
    expect(subject.labelFr).toBe("Devenir client pro");
    expect(subject.recipientEmail).toBe("commercial@lfc.fr");
    expect(subject.toPersistence().archivedAt).toBeNull();
  });

  it("refuse un objet sans libellé français", () => {
    expect(() =>
      ContactSubject.create({
        ...SETTINGS,
        label: { fr: "   ", en: "x", it: "" },
        id: "s1",
        at: AT,
      }),
    ).toThrow(ContactSubjectLabelMissingError);
  });

  it("refuse une adresse de destination invalide", () => {
    expect(() =>
      ContactSubject.create({ ...SETTINGS, recipientEmail: "pas-une-adresse", id: "s1", at: AT }),
    ).toThrow(InvalidEmailError);
  });

  it("refuse un rang qui n'est pas un entier positif", () => {
    expect(() => ContactSubject.create({ ...SETTINGS, position: -1, id: "s1", at: AT })).toThrow(
      ContactSubjectPositionInvalidError,
    );
    expect(() => ContactSubject.create({ ...SETTINGS, position: 1.5, id: "s1", at: AT })).toThrow(
      ContactSubjectPositionInvalidError,
    );
  });

  it("refuse un libellé trop long, dans n'importe quelle langue", () => {
    expect(() =>
      ContactSubject.create({
        ...SETTINGS,
        label: { fr: "ok", en: "x".repeat(81), it: "" },
        id: "s1",
        at: AT,
      }),
    ).toThrow(ContactTextTooLongError);
  });

  it("la révision revalide : elle ne peut pas vider le libellé français", () => {
    const subject = ContactSubject.create({ ...SETTINGS, id: "s1", at: AT });
    expect(() => subject.revise({ ...SETTINGS, label: { fr: "", en: "", it: "" } }, LATER)).toThrow(
      ContactSubjectLabelMissingError,
    );
  });

  it("n'est proposé qu'à son public, actif et non archivé", () => {
    const pro = ContactSubject.create({ ...SETTINGS, id: "s1", at: AT });
    expect(pro.isOfferedTo("b2b")).toBe(true);
    expect(pro.isOfferedTo("b2c")).toBe(false);

    const both = ContactSubject.create({ ...SETTINGS, audience: "both", id: "s2", at: AT });
    expect(both.isOfferedTo("b2c")).toBe(true);

    const inactive = ContactSubject.create({ ...SETTINGS, active: false, id: "s3", at: AT });
    expect(inactive.isOfferedTo("b2b")).toBe(false);

    pro.archive(LATER);
    expect(pro.isOfferedTo("b2b")).toBe(false);
  });

  it("l'archivage est idempotent : la date du premier reste", () => {
    const subject = ContactSubject.create({ ...SETTINGS, id: "s1", at: AT });
    subject.archive(AT);
    subject.archive(LATER);
    expect(subject.toPersistence().archivedAt).toEqual(AT);
  });
});
