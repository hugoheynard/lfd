import { mailLocaleOf } from "../mail-locale.js";

describe("mailLocaleOf — la langue lue dans les données du modèle", () => {
  it("lit `locale` quand le modèle le déclare", () => {
    expect(mailLocaleOf({ locale: "it", sheet: {} })).toBe("it");
  });

  it.each([
    ["sans champ locale", { firstName: "Ada" }],
    ["un locale qui n'est pas du texte", { locale: 3 }],
    ["des données nulles", null],
    ["des données qui ne sont pas un objet", "fr"],
  ])("rend null pour %s — on n'invente pas de langue", (_label, data) => {
    expect(mailLocaleOf(data)).toBeNull();
  });
});
