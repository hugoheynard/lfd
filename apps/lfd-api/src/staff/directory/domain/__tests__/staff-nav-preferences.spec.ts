import { productSectionFamilySchema } from "@lfd/contracts";

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
    expect(parseStaffNavPreferences({})).toEqual({
      worksheetCategory: null,
      productSectionFamily: null,
    });
  });

  it.each([["une chaîne"], [42], [true], [[]]])(
    "rend « aucun choix » sur une valeur qui n'est pas un sac (%p)",
    (value) => {
      expect(parseStaffNavPreferences(value)).toEqual(EMPTY_STAFF_NAV_PREFERENCES);
    },
  );

  it("rend la catégorie rangée, sans ses espaces", () => {
    expect(parseStaffNavPreferences({ worksheetCategory: " pains " })).toMatchObject({
      worksheetCategory: "pains",
    });
  });

  it.each([[12], [null], [{}]])(
    "retombe sur « aucun choix » quand la clé porte n'importe quoi (%p)",
    (category) => {
      expect(parseStaffNavPreferences({ worksheetCategory: category })).toMatchObject({
        worksheetCategory: null,
      });
    },
  );

  it("ne s'occupe pas des clés qu'il ne connaît pas", () => {
    expect(parseStaffNavPreferences({ worksheetCategory: "pains", futur: "x" })).toEqual({
      worksheetCategory: "pains",
      productSectionFamily: null,
    });
  });
});

describe("parseStaffNavPreferences — la famille de sections de la fiche produit", () => {
  /**
   * 🔴 Le seul point de contact entre la liste fermée du contrat et celle que
   * le domaine redit à la main (il ne lit pas les schémas Zod). Une cinquième
   * famille ajoutée au contrat sans lecteur rougit ICI, au lieu de disparaître
   * en silence à la relecture du sac.
   */
  it.each(productSectionFamilySchema.options)("relit la famille « %s »", (family) => {
    expect(parseStaffNavPreferences({ productSectionFamily: family })).toMatchObject({
      productSectionFamily: family,
    });
  });

  it("relit la famille rangée, sans ses espaces", () => {
    expect(parseStaffNavPreferences({ productSectionFamily: " communication " })).toMatchObject({
      productSectionFamily: "communication",
    });
  });

  /**
   * « Aucun choix » montre la fiche ENTIÈRE : c'est le repli utile quand la
   * valeur rangée ne désigne plus rien — un onglet renommé, un front plus
   * récent. Filtrer sur une famille que l'écran ne connaît pas masquerait tout.
   */
  it.each([["photos"], [12], [null], [{}], [true]])(
    "retombe sur « tout voir » quand la valeur ne désigne aucune famille (%p)",
    (family) => {
      expect(parseStaffNavPreferences({ productSectionFamily: family })).toMatchObject({
        productSectionFamily: null,
      });
    },
  );

  it("relit les deux préférences ensemble", () => {
    expect(
      parseStaffNavPreferences({ worksheetCategory: "pains", productSectionFamily: "identite" }),
    ).toEqual({ worksheetCategory: "pains", productSectionFamily: "identite" });
  });
});

describe("mergeStaffNavPreferences — une préférence n'en efface pas une autre", () => {
  it("pose la catégorie dans un sac vide", () => {
    expect(mergeStaffNavPreferences(null, { worksheetCategory: "pains" })).toEqual({
      worksheetCategory: "pains",
    });
  });

  /**
   * 🔴 La raison d'être du `.partial()` du contrat, et le cas que la fusion
   * énumérée aurait raté : une charge qui ne porte QUE la famille laisse la
   * catégorie de fiche d'atelier où elle est. Sans ça, un communicant qui
   * change de famille perdrait le réglage du fournil, et réciproquement.
   */
  it("pose la famille sans toucher à la catégorie déjà choisie", () => {
    expect(
      mergeStaffNavPreferences(
        { worksheetCategory: "pains" },
        { productSectionFamily: "communication" },
      ),
    ).toEqual({ worksheetCategory: "pains", productSectionFamily: "communication" });
  });

  it("n'efface pas la famille quand la charge ne parle que de la catégorie", () => {
    expect(
      mergeStaffNavPreferences(
        { productSectionFamily: "communication" },
        { worksheetCategory: "pains" },
      ),
    ).toEqual({ productSectionFamily: "communication", worksheetCategory: "pains" });
  });

  it("efface la famille sur un `null` explicite, et elle seule", () => {
    expect(
      mergeStaffNavPreferences(
        { worksheetCategory: "pains", productSectionFamily: "communication" },
        { productSectionFamily: null },
      ),
    ).toEqual({ worksheetCategory: "pains", productSectionFamily: null });
  });

  /**
   * Le sac grossit encore : une clé posée par un front plus récent — ou plus
   * ancien — que cette API survit à une écriture. Remplacer le sac entier la
   * ferait disparaître sans que rien ne le signale.
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
      mergeStaffNavPreferences(
        { worksheetCategory: "pains", productSectionFamily: "identite", densite: "compacte" },
        {},
      ),
    ).toEqual({
      worksheetCategory: "pains",
      productSectionFamily: "identite",
      densite: "compacte",
    });
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
