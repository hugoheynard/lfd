import { b2bMailTemplates } from "../../mail-templates.js";
import { isMailKey, mailFollowsLocale, mailKeys, renderMailSpecimen } from "../mail-specimens.js";
import { SPECIMEN_MARK } from "../mail-specimen.types.js";

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});

describe("les e-mails d'exemple de l'aperçu (C6)", () => {
  it("couvrent les 28 e-mails du registre", () => {
    expect([...mailKeys()].sort()).toEqual(Object.keys(REGISTRY).sort());
    expect(isMailKey("pas.un.mail")).toBe(false);
  });

  it.each(mailKeys())("« %s » se rend par son vrai gabarit, marqué EXEMPLE", (mail) => {
    const rendered = renderMailSpecimen(REGISTRY, mail, "fr", {});
    expect(rendered.subject.trim()).not.toBe("");
    expect(rendered.html).toContain("<html");
    // Ce qui désigne quelqu'un dit « EXEMPLE » — sauf les e-mails qui ne citent personne.
    const anonymous = ["customer.password-reset", "staff.access-suspended"];
    if (!anonymous.includes(mail)) {
      expect(`${rendered.subject}${rendered.html}`).toContain(SPECIMEN_MARK);
    }
  });

  it("applique les textes donnés, et seulement le temps du rendu", () => {
    const overlay = { fr: { "customer.order-placed": { subject: "Aperçu {ref}" } } };
    expect(renderMailSpecimen(REGISTRY, "customer.order-placed", "fr", overlay).subject).toBe(
      `Aperçu ${SPECIMEN_MARK}-0001`,
    );
    expect(renderMailSpecimen(REGISTRY, "customer.order-placed", "fr", {}).subject).not.toContain(
      "Aperçu",
    );
  });

  it("rend dans la langue demandée l'e-mail qui la suit, en français celui qui ne la suit pas", () => {
    expect(mailFollowsLocale("customer.order-placed")).toBe(true);
    expect(mailFollowsLocale("staff.invited")).toBe(false);
    const english = renderMailSpecimen(REGISTRY, "customer.order-placed", "en", {});
    const french = renderMailSpecimen(REGISTRY, "customer.order-placed", "fr", {});
    expect(english.subject).not.toBe(french.subject);
  });
});
