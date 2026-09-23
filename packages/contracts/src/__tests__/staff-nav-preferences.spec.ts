import {
  productSectionFamilySchema,
  staffNavPreferencesPatchSchema,
  staffNavPreferencesSchema,
} from "../staff-user.js";

describe("staffNavPreferencesSchema — la relecture d'un sac neuf", () => {
  /**
   * Régression par anticipation : la colonne `nav_prefs` est neuve, donc TOUTES
   * les fiches déjà en base valent `NULL`. Un schéma qui exigerait la clé ferait
   * échouer `/admin/me` à la première connexion de chaque personne existante.
   */
  it("relit un sac vide en appliquant « aucun choix »", () => {
    expect(staffNavPreferencesSchema.parse({})).toEqual({
      worksheetCategory: null,
      productSectionFamily: null,
    });
  });

  it("relit une catégorie explicitement nulle", () => {
    expect(staffNavPreferencesSchema.parse({ worksheetCategory: null })).toMatchObject({
      worksheetCategory: null,
    });
  });

  it("garde la catégorie choisie, débarrassée de ses espaces", () => {
    expect(staffNavPreferencesSchema.parse({ worksheetCategory: "  pains  " })).toMatchObject({
      worksheetCategory: "pains",
    });
  });

  it("ignore une clé inconnue plutôt que de refuser le sac", () => {
    // Le sac est extensible : un front d'une version antérieure ou postérieure
    // ne doit pas rendre la fiche illisible.
    expect(staffNavPreferencesSchema.parse({ worksheetCategory: "pains", futur: 12 })).toEqual({
      worksheetCategory: "pains",
      productSectionFamily: null,
    });
  });

  it("refuse une catégorie vide ou démesurée", () => {
    expect(staffNavPreferencesSchema.safeParse({ worksheetCategory: "   " }).success).toBe(false);
    expect(staffNavPreferencesSchema.safeParse({ worksheetCategory: "x".repeat(41) }).success).toBe(
      false,
    );
  });
});

describe("la famille de sections de la fiche produit — une liste FERMÉE", () => {
  /**
   * `null` est le défaut, et ce n'est pas un détail d'affichage : un compte qui
   * ne s'est jamais prononcé voit la fiche entière. Un défaut posé sur une
   * famille amputerait l'écran d'une personne qui n'a rien masqué.
   */
  it("vaut « tout voir » tant que personne ne s'est prononcé", () => {
    expect(staffNavPreferencesSchema.parse({})).toMatchObject({ productSectionFamily: null });
  });

  it.each(productSectionFamilySchema.options)("accepte la famille « %s »", (family) => {
    expect(staffNavPreferencesSchema.parse({ productSectionFamily: family })).toMatchObject({
      productSectionFamily: family,
    });
  });

  /**
   * L'écriture, elle, refuse : contrairement à la catégorie de fiche d'atelier
   * qui vit dans le référentiel, la découpe en familles est celle de l'écran.
   * Ranger une famille qu'aucun onglet ne porte ne rendrait service à personne.
   */
  it("refuse à l'écriture une famille qui n'existe pas", () => {
    expect(
      staffNavPreferencesPatchSchema.safeParse({ productSectionFamily: "photos" }).success,
    ).toBe(false);
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

  /**
   * 🔴 Le cas qui justifie le `.partial()` : une charge qui ne porte QUE la
   * famille ne mentionne pas la catégorie, donc le serveur n'y touche pas. Un
   * schéma à défauts y aurait glissé `worksheetCategory: null`, et l'écriture
   * d'une préférence aurait effacé l'autre.
   */
  it("n'invente pas la catégorie quand la charge ne porte que la famille", () => {
    expect(staffNavPreferencesPatchSchema.parse({ productSectionFamily: "communication" })).toEqual(
      { productSectionFamily: "communication" },
    );
  });

  it("accepte l'effacement explicite de la famille", () => {
    expect(staffNavPreferencesPatchSchema.parse({ productSectionFamily: null })).toEqual({
      productSectionFamily: null,
    });
  });
});
