/**
 * E2E du **référentiel d'allergènes** semé par la migration
 * `20260902120000_referentiel_allergenes` — sur un vrai Postgres.
 *
 * Deux choses que seul ce niveau prouve, et qu'aucun test à Prisma stubbé ne
 * pourrait donner :
 *
 * 1. **L'officiel a traversé sans perte.** Les codes GS1 et les catégories INCO
 *    de `ALLERGEN_MAPPINGS` sont rejoués un par un contre la table semée : un
 *    code manquant, un rattachement décalé, un libellé retouché fait échouer la
 *    suite. C'est la pièce qui atteste que le transfert de la constante vers la
 *    base est fidèle — la constante reste, pour ce déploiement-ci, la source.
 * 2. **Le verrou d'immuabilité tient en base.** Le trigger `BEFORE UPDATE OR
 *    DELETE` refuse toute atteinte à une ligne officielle. Il ne se teste que
 *    contre le vrai SQL : c'est précisément un invariant que le code applicatif
 *    n'exprime nulle part.
 *
 * Doc : documentation/pim/data-model/05-allergenes-gs1-inco.md
 */
import {
  ALLERGEN_MAPPINGS,
  incoLabel,
  type IncoCategory,
} from "../src/pim/allergens/allergen-mapping.js";
import { allergenReference } from "../src/pim/allergens/allergen-reference.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** La catégorie d'accueil des codes GS1 sans obligation de déclaration UE. */
const NON_EU_KEY = "non_eu";

/** Les 14 catégories de l'annexe II, telles que la constante les cite. */
const INCO_KEYS: readonly IncoCategory[] = [
  ...new Set(
    ALLERGEN_MAPPINGS.map((mapping) => mapping.incoCategory).filter(
      (category): category is IncoCategory => category !== null,
    ),
  ),
];

/** La clé de catégorie qu'un mapping attend en base — `non_eu` s'il n'a pas d'INCO. */
function expectedCategoryKey(incoCategory: IncoCategory | null): string {
  return incoCategory ?? NON_EU_KEY;
}

/**
 * Lit un libellé localisé sans traverser `any` : la colonne est un `Json`, donc
 * `unknown` côté client, et c'est justement sa forme que le test vérifie.
 */
function localizedText(
  value: unknown,
  subject: string,
): { readonly fr: string; readonly en: string } {
  if (typeof value === "object" && value !== null && "fr" in value && "en" in value) {
    const { fr, en } = value;
    if (typeof fr === "string" && typeof en === "string") {
      return { fr, en };
    }
  }
  throw new Error(`libellé localisé illisible sur ${subject} : ${JSON.stringify(value)}`);
}

describe("le référentiel semé par la migration", () => {
  it("sème une catégorie par catégorie INCO, plus la catégorie hors obligation UE", async () => {
    const categories = await ctx.prisma.allergenCategory.findMany({ orderBy: { position: "asc" } });

    // 15 et non 14 : `official` (« semé et verrouillé ») et `inco_category`
    // (« annexe II ») disent deux choses différentes, et `non_eu` est la preuve
    // vivante de cette distinction.
    expect(categories).toHaveLength(INCO_KEYS.length + 1);
    expect(categories.every((category) => category.official)).toBe(true);
    expect(categories.filter((category) => category.incoCategory !== null)).toHaveLength(
      INCO_KEYS.length,
    );
    expect(categories.every((category) => category.archivedAt === null)).toBe(true);
    expect([...categories.map((category) => category.key)].sort()).toEqual(
      [...INCO_KEYS, NON_EU_KEY].sort(),
    );
    // Les 14 de l'annexe II d'abord, dans l'ordre où l'annexe les énumère, et
    // `non_eu` en dernier : elle n'appartient pas à cette liste-là.
    expect(categories[categories.length - 1]?.key).toBe(NON_EU_KEY);
    expect(categories[0]?.key).toBe("gluten");
  });

  it("donne aux catégories officielles un identifiant lisible et figé", async () => {
    // `alg_cat_tree_nuts`, pas un ULID : c'est un registre, et une migration
    // future doit pouvoir viser ces lignes sans les chercher.
    const categories = await ctx.prisma.allergenCategory.findMany();

    for (const category of categories) {
      expect(category.id).toBe(`alg_cat_${category.key}`);
    }
  });

  it("porte sur la catégorie la MENTION D'ÉTIQUETTE, pas le libellé granulaire", async () => {
    // « Céréales contenant du gluten », jamais « Blé » : c'est la catégorie qui
    // figure sur l'étiquette UE, et son libellé est du droit.
    for (const key of INCO_KEYS) {
      const category = await ctx.prisma.allergenCategory.findUniqueOrThrow({ where: { key } });

      expect(localizedText(category.name, `catégorie ${key}`)).toEqual({
        fr: incoLabel(key, "fr"),
        en: incoLabel(key, "en"),
      });
      expect(category.incoCategory).toBe(key);
    }
  });

  it("nomme la catégorie hors obligation UE par son périmètre, pas par une innocuité", async () => {
    // « Hors obligation UE » et non « non réglementé » : le sarrasin est à
    // déclaration obligatoire au Japon et en Corée.
    const category = await ctx.prisma.allergenCategory.findUniqueOrThrow({
      where: { key: NON_EU_KEY },
    });

    expect(localizedText(category.name, "catégorie non_eu")).toEqual({
      fr: "Hors obligation UE",
      en: "Not EU-declarable",
    });
    expect(category.incoCategory).toBeNull();
    expect(category.official).toBe(true);
  });

  it("rejoue chaque code GS1 de la constante : code, rattachement et libellés", async () => {
    for (const mapping of ALLERGEN_MAPPINGS) {
      const entry = await ctx.prisma.allergenEntry.findUnique({
        where: { code: mapping.gs1Code },
        include: { category: true },
      });

      expect(entry).not.toBeNull();
      // `findUnique` rend `null`, pas une absence de propriété : on relit après
      // l'assertion plutôt que de la contourner par une non-nullité assertée.
      const found = await ctx.prisma.allergenEntry.findUniqueOrThrow({
        where: { code: mapping.gs1Code },
        include: { category: true },
      });

      expect(found.id).toBe(`alg_${mapping.gs1Code}`);
      expect(found.official).toBe(true);
      expect(found.archivedAt).toBeNull();
      expect(found.category.key).toBe(expectedCategoryKey(mapping.incoCategory));
      expect(localizedText(found.name, `entrée ${mapping.gs1Code}`)).toEqual(mapping.labels);
    }
  });

  it("n'invente aucun code que la constante ne connaît pas", async () => {
    // L'assertion inverse de la précédente : sans elle, une entrée semée en trop
    // — un code retiré du référentiel mais oublié dans le SQL — passerait.
    const entries = await ctx.prisma.allergenEntry.findMany();

    expect(entries.map((entry) => entry.code).sort()).toEqual(
      ALLERGEN_MAPPINGS.map((mapping) => mapping.gs1Code).sort(),
    );
  });

  it("rattache toute entrée officielle à une catégorie officielle", async () => {
    // La clé étrangère `NOT NULL` interdit déjà l'orphelin ; ce qu'on vérifie
    // ici est plus fort : aucune entrée réglementaire ne pend à une catégorie
    // que le staff pourrait renommer.
    const orphans = await ctx.prisma.allergenEntry.findMany({
      where: { official: true, category: { official: false } },
    });

    expect(orphans).toEqual([]);
  });

  it("reproduit exactement le catalogue eu/world que le code sert aujourd'hui", async () => {
    // La preuve que ce déploiement ne change RIEN pour l'utilisateur : le
    // catalogue légal se dérive de `inco_category IS NOT NULL` (D2) et rend
    // les mêmes codes que le filtre `incoCategory !== null` de la constante.
    const euCodes = await ctx.prisma.allergenEntry.findMany({
      where: { category: { incoCategory: { not: null } } },
      select: { code: true },
    });
    const worldCodes = await ctx.prisma.allergenEntry.findMany({ select: { code: true } });

    const codesOf = (rows: readonly { readonly code: string }[]): string[] =>
      rows.map((row) => row.code).sort();
    const referenceCodes = (scope: "eu" | "world"): string[] =>
      allergenReference(scope, "fr")
        .entries.map((entry) => entry.code)
        .sort();

    expect(codesOf(euCodes)).toEqual(referenceCodes("eu"));
    expect(codesOf(worldCodes)).toEqual(referenceCodes("world"));
  });
});

describe("le verrou d'immuabilité", () => {
  it("refuse la suppression d'une entrée officielle", async () => {
    await expect(ctx.prisma.allergenEntry.delete({ where: { code: "SH" } })).rejects.toThrow(
      /suppression refusée/u,
    );

    await expect(
      ctx.prisma.allergenEntry.findUniqueOrThrow({ where: { code: "SH" } }),
    ).resolves.toBeDefined();
  });

  it("refuse de retoucher le libellé, le code ou le rattachement d'une entrée officielle", async () => {
    // Les trois atteintes que la table « ce qui est permanent » interdit : le
    // libellé est une mention légale, le code est l'identité de stockage, le
    // rattachement décide de la mention d'étiquette.
    await expect(
      ctx.prisma.allergenEntry.update({
        where: { code: "SH" },
        data: { name: { fr: "Noisette du coin", en: "Local hazelnut" } },
      }),
    ).rejects.toThrow(/ne se modifie pas/u);

    await expect(
      ctx.prisma.allergenEntry.update({ where: { code: "SH" }, data: { code: "XX" } }),
    ).rejects.toThrow(/ne se modifie pas/u);

    await expect(
      ctx.prisma.allergenEntry.update({
        where: { code: "SH" },
        data: { categoryId: "alg_cat_milk" },
      }),
    ).rejects.toThrow(/ne se modifie pas/u);
  });

  it("refuse d'archiver une entrée officielle", async () => {
    // L'archivage EST la suppression dans ce dépôt (`CLAUDE.md` §3) : sans cette
    // colonne dans le verrou, retirer de la saisie un allergène que le règlement
    // impose de proposer ne coûterait qu'un `archived_at`, et la table « ce qui
    // est permanent » dit « suppression : interdite ».
    await expect(
      ctx.prisma.allergenEntry.update({
        where: { code: "SH" },
        data: { archivedAt: new Date() },
      }),
    ).rejects.toThrow(/ne se modifie pas/u);

    await expect(
      ctx.prisma.allergenEntry.findUniqueOrThrow({ where: { code: "SH" } }),
    ).resolves.toMatchObject({ archivedAt: null });
  });

  it("refuse d'archiver une catégorie officielle", async () => {
    // Le jumeau du cas précédent, côté catégories : retirer « Fruits à coque »
    // du référentiel, ce serait retirer une mention d'étiquette que l'annexe II
    // impose de proposer.
    await expect(
      ctx.prisma.allergenCategory.update({
        where: { key: "tree_nuts" },
        data: { archivedAt: new Date() },
      }),
    ).rejects.toThrow(/ne se modifie pas/u);

    await expect(
      ctx.prisma.allergenCategory.findUniqueOrThrow({ where: { key: "tree_nuts" } }),
    ).resolves.toMatchObject({ archivedAt: null });
  });

  it("refuse de dégrader une ligne officielle en ligne maison", async () => {
    // Sans cette garde, le contournement serait d'une ligne : passer `official`
    // à faux, puis faire ce qu'on veut — le trigger ne se déclencherait plus.
    await expect(
      ctx.prisma.allergenEntry.update({ where: { code: "SH" }, data: { official: false } }),
    ).rejects.toThrow(/ne se modifie pas/u);

    await expect(
      ctx.prisma.allergenCategory.update({
        where: { key: "tree_nuts" },
        data: { official: false },
      }),
    ).rejects.toThrow(/ne se modifie pas/u);
  });

  it("refuse la suppression et la retouche d'une catégorie officielle", async () => {
    await expect(ctx.prisma.allergenCategory.delete({ where: { key: "gluten" } })).rejects.toThrow(
      /suppression refusée/u,
    );

    await expect(
      ctx.prisma.allergenCategory.update({
        where: { key: "gluten" },
        data: { name: { fr: "Gluten", en: "Gluten" } },
      }),
    ).rejects.toThrow(/ne se modifie pas/u);

    await expect(
      ctx.prisma.allergenCategory.update({ where: { key: "gluten" }, data: { key: "cereals" } }),
    ).rejects.toThrow(/ne se modifie pas/u);
  });

  /**
   * Régression : le verrou comparait `code`, `category_id`, `name`,
   * `official` et `archived_at` — **pas `id`**. Or le semis fait de
   * `alg_SH` un contrat (« une migration future doit pouvoir les viser sans
   * les chercher »), et la FK d'`ingredient_allergen` est en
   * `ON UPDATE CASCADE` : un identifiant réécrit aurait entraîné ses enfants
   * sans que rien ne le signale (fix 2026-08-31).
   */
  it("refuse de réécrire l'identifiant d'une entrée officielle", async () => {
    await expect(
      ctx.prisma.$executeRawUnsafe(`UPDATE pim.allergen_entry SET id = 'usurpe' WHERE code = 'SH'`),
    ).rejects.toThrow(/réglementaire et ne se modifie pas/u);
  });

  it("refuse de réécrire l'identifiant d'une catégorie officielle", async () => {
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `UPDATE pim.allergen_category SET id = 'usurpe' WHERE key = 'tree_nuts'`,
      ),
    ).rejects.toThrow(/réglementaire et ne se modifie pas/u);
  });

  /**
   * `inco_category` est un `TEXT` libre côté Postgres, alors que le domaine en
   * fait une union fermée (D1). Sans ce `CHECK`, une seule ligne hors liste
   * ferait lever le value object À LA RELECTURE — donc un 500 sur le
   * référentiel entier, pas une ligne écartée.
   */
  it("refuse une catégorie dont la mention INCO n'est pas de l'annexe II", async () => {
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `INSERT INTO pim.allergen_category (id, key, name, inco_category, official, position, updated_at)
         VALUES ('cat_faux', 'faux', '{"fr":"Faux"}'::jsonb, 'inventé', false, 0, now())`,
      ),
    ).rejects.toThrow(/allergen_category_inco_category_check/u);
  });

  it("laisse `position` libre sur une catégorie officielle", async () => {
    // L'ordre d'affichage n'a aucune portée réglementaire : le staff doit
    // pouvoir ranger son écran sans se heurter au droit.
    const before = await ctx.prisma.allergenCategory.findUniqueOrThrow({
      where: { key: "gluten" },
    });

    const moved = await ctx.prisma.allergenCategory.update({
      where: { key: "gluten" },
      data: { position: before.position + 100 },
    });
    expect(moved.position).toBe(before.position + 100);

    // On remet la position semée : les lignes officielles échappent au
    // `TRUNCATE` du harnais, donc ce déplacement survivrait à la suite.
    await ctx.prisma.allergenCategory.update({
      where: { key: "gluten" },
      data: { position: before.position },
    });
  });

  it("laisse une catégorie et une entrée maison se modifier puis disparaître", async () => {
    // Le verrou doit être GRATUIT pour tout ce qui n'est pas du droit : le
    // `WHEN (OLD.official)` du trigger est ce qui le garantit, et c'est ce que
    // ce cas éprouve.
    //
    // Écriture Prisma directe faute d'agrégat : les entités `AllergenCategory` /
    // `AllergenEntry` arrivent au lot 2, et cette fixture basculera dessus.
    const category = await ctx.prisma.allergenCategory.create({
      data: {
        id: "alg_cat_maison_e2e",
        key: "fruits-coque-exotiques",
        name: { fr: "Fruits à coque exotiques", en: "Exotic nuts" },
        official: false,
      },
    });
    const entry = await ctx.prisma.allergenEntry.create({
      data: {
        id: "alg_maison_e2e",
        code: "X-NOIX-TIGRE",
        name: { fr: "Noix tigrée", en: "Tiger nut" },
        categoryId: category.id,
        official: false,
      },
    });

    const renamed = await ctx.prisma.allergenEntry.update({
      where: { id: entry.id },
      data: { name: { fr: "Souchet", en: "Tiger nut" } },
    });
    expect(localizedText(renamed.name, "entrée maison").fr).toBe("Souchet");

    // Le pendant du cas précédent : une entrée maison, elle, s'archive — c'est
    // le retrait normal du référentiel administrable.
    const archived = await ctx.prisma.allergenEntry.update({
      where: { id: entry.id },
      data: { archivedAt: new Date() },
    });
    expect(archived.archivedAt).not.toBeNull();

    // Et la catégorie maison s'archive elle aussi — c'est son retrait normal du
    // référentiel administrable, celui que l'agrégat expose par `archive()`.
    const archivedCategory = await ctx.prisma.allergenCategory.update({
      where: { id: category.id },
      data: { archivedAt: new Date() },
    });
    expect(archivedCategory.archivedAt).not.toBeNull();

    await expect(
      ctx.prisma.allergenEntry.delete({ where: { id: entry.id } }),
    ).resolves.toBeDefined();
    await expect(
      ctx.prisma.allergenCategory.delete({ where: { id: category.id } }),
    ).resolves.toBeDefined();
  });

  it("refuse d'effacer une catégorie encore citée par une entrée", async () => {
    // `RESTRICT`, et non `CASCADE` : effacer une catégorie sous ses entrées
    // laisserait des allergènes sans mention d'étiquette possible.
    const category = await ctx.prisma.allergenCategory.create({
      data: {
        id: "alg_cat_citee_e2e",
        key: "categorie-citee",
        name: { fr: "Catégorie citée", en: "Cited category" },
        official: false,
      },
    });
    await ctx.prisma.allergenEntry.create({
      data: {
        id: "alg_citee_e2e",
        code: "X-CITEE",
        name: { fr: "Citée", en: "Cited" },
        categoryId: category.id,
        official: false,
      },
    });

    await expect(
      ctx.prisma.allergenCategory.delete({ where: { id: category.id } }),
    ).rejects.toThrow();
  });
});
