import {
  EMPTY_STAFF_NAV_PREFERENCES,
  mergeStaffNavPreferences,
  parseStaffNavPreferences,
} from "../staff-nav-preferences.js";

describe("parseStaffNavPreferences — la colonne est neuve, donc vide partout", () => {
  /**
   * Le cas NORMAL, et de loin le plus fréquent : `nav_prefs` a été ajoutée le
   * 2026-09-13, toutes les fiches d'avant valent `NULL`. Une exception ici
   * casserait `/admin/me`, c'est-à-dire l'amorçage de tout le back-office.
   */
  it("rend « aucun choix » sur une colonne nulle", () => {
    expect(parseStaffNavPreferences(null)).toEqual(EMPTY_STAFF_NAV_PREFERENCES);
  });

  it("rend « aucun choix » sur un sac vide", () => {
    expect(parseStaffNavPreferences({})).toEqual({ worksheetCategory: null });
  });

  it.each([["une chaîne"], [42], [true], [[]]])(
    "rend « aucun choix » sur une valeur qui n'est pas un sac (%p)",
    (value) => {
      expect(parseStaffNavPreferences(value)).toEqual({ worksheetCategory: null });
    },
  );

  it("rend la catégorie rangée, sans ses espaces", () => {
    expect(parseStaffNavPreferences({ worksheetCategory: " pains " })).toEqual({
      worksheetCategory: "pains",
    });
  });

  it.each([[12], [null], [{}]])(
    "retombe sur « aucun choix » quand la clé porte n'importe quoi (%p)",
    (category) => {
      expect(parseStaffNavPreferences({ worksheetCategory: category })).toEqual({
        worksheetCategory: null,
      });
    },
  );

  it("ne s'occupe pas des clés qu'il ne connaît pas", () => {
    expect(parseStaffNavPreferences({ worksheetCategory: "pains", futur: "x" })).toEqual({
      worksheetCategory: "pains",
    });
  });
});

describe("mergeStaffNavPreferences — une préférence n'en efface pas une autre", () => {
  it("pose la catégorie dans un sac vide", () => {
    expect(mergeStaffNavPreferences(null, { worksheetCategory: "pains" })).toEqual({
      worksheetCategory: "pains",
    });
  });

  /**
   * Le sac grossira : le jour où une deuxième préférence existe, remplacer le
   * sac entier ferait s'effacer l'une par l'autre sans que rien ne le signale.
   */
  it("recopie les clés qu'il ne connaît pas", () => {
    expect(
      mergeStaffNavPreferences(
        { worksheetCategory: "pains", densite: "compacte" },
        { worksheetCategory: "viennoiseries" },
      ),
    ).toEqual({ worksheetCategory: "viennoiseries", densite: "compacte" });
  });

  it("ne touche à rien quand la charge ne dit rien", () => {
    expect(
      mergeStaffNavPreferences({ worksheetCategory: "pains", densite: "compacte" }, {}),
    ).toEqual({ worksheetCategory: "pains", densite: "compacte" });
  });

  it("efface le choix sur un `null` explicite, et lui seul", () => {
    expect(
      mergeStaffNavPreferences(
        { worksheetCategory: "pains", densite: "compacte" },
        { worksheetCategory: null },
      ),
    ).toEqual({ worksheetCategory: null, densite: "compacte" });
  });

  it("ne modifie pas le sac qu'on lui donne", () => {
    const stored = { worksheetCategory: "pains" };

    mergeStaffNavPreferences(stored, { worksheetCategory: "viennoiseries" });

    expect(stored).toEqual({ worksheetCategory: "pains" });
  });
});
