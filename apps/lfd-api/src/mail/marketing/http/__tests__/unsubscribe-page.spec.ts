import { confirmPage, donePage, pageLocaleOf, UNSUBSCRIBE_PAGE_CSP } from "../unsubscribe-page.js";
import { unsubscribeFormSchema } from "../unsubscribe-form.js";

describe("pageLocaleOf — la langue de la page", () => {
  it.each([
    [undefined, "fr"],
    ["", "fr"],
    ["en-GB,en;q=0.9", "en"],
    ["de-DE,it;q=0.8,en;q=0.5", "it"],
    ["en;q=0.2,it;q=0.9", "it"],
    ["de,es", "fr"],
    ["en;q=0,fr;q=0.1", "fr"],
  ])("« %s » → %s", (header, locale) => {
    expect(pageLocaleOf(header)).toBe(locale);
  });
});

describe("la page de désinscription — neutre (pas d'oracle)", () => {
  it("la page du GET poste vers elle-même, sans charte ni nom d'espace", () => {
    const page = confirmPage("fr", false);
    expect(page).toContain('<form method="post">');
    expect(page).not.toContain("action=");
    expect(page).not.toContain("La Folie Coffee");
    expect(page).not.toContain('name="group"');
  });

  it("propose « tout le groupe » seulement quand le groupe existe", () => {
    expect(confirmPage("fr", true)).toContain('name="group" value="all"');
  });

  it("ne charge rien : aucun script, aucune feuille, aucune image", () => {
    for (const page of [confirmPage("en", true), donePage("it")]) {
      expect(page).not.toMatch(/<script|<link|<img|src=/u);
    }
    expect(UNSUBSCRIBE_PAGE_CSP).toContain("default-src 'none'");
  });

  it("parle la langue demandée", () => {
    expect(donePage("en")).toContain('lang="en"');
    expect(donePage("it")).toContain("Fatto");
  });
});

describe("unsubscribeFormSchema — un corps indulgent", () => {
  it("le one-click de la RFC 8058", () => {
    expect(unsubscribeFormSchema.parse({ "List-Unsubscribe": "One-Click" })).toEqual({
      oneClick: true,
      wholeGroup: false,
    });
  });

  it("le bouton de la page, avec « tout le groupe »", () => {
    expect(unsubscribeFormSchema.parse({ group: "all" })).toEqual({
      oneClick: false,
      wholeGroup: true,
    });
  });

  it.each([undefined, null, "texte", { "List-Unsubscribe": 3, group: ["all"] }])(
    "un corps inattendu (%p) vaut le bouton seul, jamais un refus",
    (body) => {
      expect(unsubscribeFormSchema.parse(body)).toEqual({ oneClick: false, wholeGroup: false });
    },
  );
});
