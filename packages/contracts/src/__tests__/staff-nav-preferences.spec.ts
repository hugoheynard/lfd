import { staffNavPreferencesPatchSchema, staffNavPreferencesSchema } from "../staff-user.js";

describe("staffNavPreferencesSchema — la relecture d'un sac neuf", () => {
  /**
   * Régression par anticipation : la colonne `nav_prefs` est neuve, donc TOUTES
   * les fiches déjà en base valent `NULL`. Un schéma qui exigerait la clé ferait
   * échouer `/admin/me` à la première connexion de chaque personne existante.
   */
  it("relit un sac vide en appliquant « aucun choix »", () => {
    expect(staffNavPreferencesSchema.parse({})).toEqual({ worksheetCategory: null });
  });

  it("relit une catégorie explicitement nulle", () => {
    expect(staffNavPreferencesSchema.parse({ worksheetCategory: null })).toEqual({
      worksheetCategory: null,
    });
  });

  it("garde la catégorie choisie, débarrassée de ses espaces", () => {
    expect(staffNavPreferencesSchema.parse({ worksheetCategory: "  pains  " })).toEqual({
      worksheetCategory: "pains",
    });
  });

  it("ignore une clé inconnue plutôt que de refuser le sac", () => {
    // Le sac est extensible : un front d'une version antérieure ou postérieure
    // ne doit pas rendre la fiche illisible.
    expect(staffNavPreferencesSchema.parse({ worksheetCategory: "pains", futur: 12 })).toEqual({
      worksheetCategory: "pains",
    });
  });

  it("refuse une catégorie vide ou démesurée", () => {
    expect(staffNavPreferencesSchema.safeParse({ worksheetCategory: "   " }).success).toBe(false);
    expect(staffNavPreferencesSchema.safeParse({ worksheetCategory: "x".repeat(41) }).success).toBe(
      false,
    );
  });
});

describe("staffNavPreferencesPatchSchema — une préférence à la fois", () => {
  /**
   * Le cœur de la fusion : une charge vide ne dit RIEN, elle ne remet aucun
   * défaut. Sans ça, une future préférence envoyée seule effacerait la catégorie.
   */
  it("laisse une clé absente absente, sans lui inventer de défaut", () => {
    expect(staffNavPreferencesPatchSchema.parse({})).toEqual({});
  });

  it("accepte l'effacement explicite du choix", () => {
    expect(staffNavPreferencesPatchSchema.parse({ worksheetCategory: null })).toEqual({
      worksheetCategory: null,
    });
  });

  it("accepte un choix", () => {
    expect(staffNavPreferencesPatchSchema.parse({ worksheetCategory: "viennoiseries" })).toEqual({
      worksheetCategory: "viennoiseries",
    });
  });
});
