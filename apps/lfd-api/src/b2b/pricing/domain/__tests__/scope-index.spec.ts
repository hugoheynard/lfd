import { candidatesIn, indexByScope, scopeKeyOf, scopeKeysOf } from "../scope-index.js";
import { inForceFor, matchesScope } from "../specificity.js";
import type { PriceAudience, PriceScope, PricingContext } from "../price-rule.js";

/**
 * **L'index de portée** — le petit tableau que le `WHERE` rend aujourd'hui,
 * reconstruit en mémoire.
 *
 * Les dates sont absolues et ne sont comparées **qu'entre elles** : rien ici ne
 * se compare à l'horloge, donc rien n'y vieillit — l'exception écrite dans
 * `CLAUDE.md` §5.
 */
const AT = new Date("2026-08-17T10:00:00.000Z");
const BEFORE = new Date("2026-08-01T00:00:00.000Z");
const AFTER = new Date("2026-09-01T00:00:00.000Z");

function context(over: Partial<PricingContext> = {}): PricingContext {
  return {
    at: AT,
    quantity: 1,
    variantSku: "VIE-001-1",
    productSku: "VIE-001",
    categoryId: "cat_vien",
    companyId: "cmp_dupont",
    segmentId: null,
    cumulativeQuantity: null,
    ...over,
  };
}

/** Un matériau réduit à ce que l'index lit : une portée, et un nom pour l'assertion. */
interface Material {
  readonly name: string;
  readonly scope: PriceScope;
}

const scopeOf = (item: Material): PriceScope => item.scope;
const namesOf = (items: readonly Material[]): string[] => items.map((item) => item.name);

/** Toutes les portées représentables, y compris celles qui ne visent rien. */
const EVERY_SCOPE: readonly Material[] = [
  { name: "global", scope: { type: "global", id: null } },
  { name: "sa famille", scope: { type: "category", id: "cat_vien" } },
  { name: "une autre famille", scope: { type: "category", id: "cat_pain" } },
  { name: "son produit", scope: { type: "product", id: "VIE-001" } },
  { name: "un autre produit", scope: { type: "product", id: "PAI-001" } },
  { name: "sa déclinaison", scope: { type: "variant", id: "VIE-001-1" } },
  { name: "une autre déclinaison", scope: { type: "variant", id: "VIE-001-2" } },
  // Interdite par l'invariant de `PriceScope`, mais représentable — et
  // `matchesScope` la refuse déjà.
  { name: "famille sans identifiant", scope: { type: "category", id: null } },
];

describe("scopeKeyOf", () => {
  it("range chaque forme de portée sous sa clé", () => {
    expect(scopeKeyOf({ type: "global", id: null })).toBe("global");
    expect(scopeKeyOf({ type: "category", id: "cat_vien" })).toBe("category:cat_vien");
    expect(scopeKeyOf({ type: "product", id: "VIE-001" })).toBe("product:VIE-001");
    expect(scopeKeyOf({ type: "variant", id: "VIE-001-1" })).toBe("variant:VIE-001-1");
  });

  /**
   * Une portée sans identifiant ne vise rien — `matchesScope` compare `null` à
   * une chaîne. Lui fabriquer une clé `category:null` la rendrait atteignable
   * par une famille réellement nommée « null ».
   */
  it("n'a pas de clé pour une portée qui ne vise rien", () => {
    expect(scopeKeyOf({ type: "category", id: null })).toBeNull();
    expect(scopeKeyOf({ type: "product", id: null })).toBeNull();
  });

  /** Un `global` porteur d'un identifiant reste global : c'est son type qui décide. */
  it("ignore un identifiant sur une portée globale", () => {
    expect(scopeKeyOf({ type: "global", id: "parasite" })).toBe("global");
  });
});

describe("scopeKeysOf", () => {
  it("rend les quatre clés de l'article, de la plus large à la plus étroite", () => {
    expect(scopeKeysOf(context())).toEqual([
      "global",
      "category:cat_vien",
      "product:VIE-001",
      "variant:VIE-001-1",
    ]);
  });
});

describe("l'index rend exactement ce que matchesScope retenait", () => {
  /**
   * 🔴 **L'équivalence qui autorise tout le reste.**
   *
   * Confrontée au prédicat lui-même plutôt qu'à une liste écrite à la main :
   * une liste recopierait la même hypothèse des deux côtés, et le jour où
   * `matchesScope` gagnerait une cinquième forme, elle resterait verte pendant
   * que l'index perdrait des candidats en silence — donc facturerait le prix
   * d'à côté.
   */
  it("sur toutes les portées représentables, y compris celles qui ne visent rien", () => {
    const at = context();
    const index = indexByScope(EVERY_SCOPE, scopeOf);

    const byIndex = namesOf(candidatesIn(index, at)).sort();
    const byPredicate = namesOf(EVERY_SCOPE.filter((item) => matchesScope(item.scope, at))).sort();

    expect(byIndex).toEqual(byPredicate);
    expect(byIndex).toEqual(["global", "sa famille", "sa déclinaison", "son produit"].sort());
  });

  it("et sur un article d'une autre famille, qui ne partage que le seau global", () => {
    const elsewhere = context({
      categoryId: "cat_pain",
      productSku: "PAI-001",
      variantSku: "PAI-001-1",
    });
    const index = indexByScope(EVERY_SCOPE, scopeOf);

    expect(namesOf(candidatesIn(index, elsewhere)).sort()).toEqual(
      namesOf(EVERY_SCOPE.filter((item) => matchesScope(item.scope, elsewhere))).sort(),
    );
  });

  it("rend un tableau vide, pas une erreur, quand aucun seau ne répond", () => {
    expect(candidatesIn(indexByScope([], scopeOf), context())).toEqual([]);
  });
});

describe("indexByScope", () => {
  /**
   * 🔴 **Plusieurs matériaux par seau**, et c'est le cas NORMAL : la contrainte
   * d'exclusion porte aussi sur `coalesce("min_quantity", 0)`, et
   * `template-to-rules.ts` pose une règle par palier. Une `Map` 1:1 en perdrait
   * tous sauf un — sur les clients négociés, précisément.
   */
  it("garde tous les matériaux d'une même clé, dans l'ordre reçu", () => {
    const tiers: Material[] = [
      { name: "palier 1", scope: { type: "product", id: "VIE-001" } },
      { name: "palier 50", scope: { type: "product", id: "VIE-001" } },
      { name: "palier 100", scope: { type: "product", id: "VIE-001" } },
    ];

    expect(namesOf(candidatesIn(indexByScope(tiers, scopeOf), context()))).toEqual([
      "palier 1",
      "palier 50",
      "palier 100",
    ]);
  });

  it("jette ce qui n'a pas de clé plutôt que de l'attribuer au hasard", () => {
    const index = indexByScope(
      [{ name: "orpheline", scope: { type: "category", id: null } }],
      scopeOf,
    );

    expect(index.size).toBe(0);
  });
});

describe("inForceFor", () => {
  interface Timed {
    readonly name: string;
    readonly audience: PriceAudience;
    readonly validFrom: Date;
    readonly validTo: Date | null;
    readonly suspendedFrom: Date | null;
  }

  function timed(over: Partial<Timed> = {}): Timed {
    return {
      name: "en vigueur",
      audience: { type: "all", id: null },
      validFrom: BEFORE,
      validTo: null,
      suspendedFrom: null,
      ...over,
    };
  }

  const kept = (items: readonly Timed[], over: Partial<PricingContext> = {}): string[] =>
    inForceFor(items, context(over)).map((item) => item.name);

  it("garde ce qui est en vigueur et ouvert à tous", () => {
    expect(kept([timed()])).toEqual(["en vigueur"]);
  });

  it("écarte ce qui n'a pas encore commencé", () => {
    expect(kept([timed({ validFrom: AFTER })])).toEqual([]);
  });

  /** Borne haute **exclue** : à l'instant de fermeture, la règle n'agit plus. */
  it("écarte ce dont la fenêtre s'est refermée, bornes comprises", () => {
    expect(kept([timed({ validTo: AT })])).toEqual([]);
    expect(kept([timed({ validTo: AFTER })])).toEqual(["en vigueur"]);
  });

  /**
   * La suspension se juge **à l'instant demandé**, pas au présent : une
   * promotion suspendue le 1er septembre s'appliquait encore le 17 août.
   */
  it("écarte ce qui était déjà suspendu, mais pas ce qui l'a été après", () => {
    expect(kept([timed({ suspendedFrom: BEFORE })])).toEqual([]);
    expect(kept([timed({ suspendedFrom: AFTER })])).toEqual(["en vigueur"]);
  });

  it("garde ce qui vise ce client, écarte ce qui en vise un autre", () => {
    const items = [
      timed({ name: "pour Dupont", audience: { type: "company", id: "cmp_dupont" } }),
      timed({ name: "pour Martin", audience: { type: "company", id: "cmp_martin" } }),
    ];

    expect(kept(items)).toEqual(["pour Dupont"]);
  });

  /**
   * Une commande **sans entreprise** — le parcours de la boutique — ne prend que
   * ce qui est ouvert à tous. Ce n'est pas un cas limite, c'est le défaut.
   */
  it("ne rend que l'offre publique à une commande sans entreprise", () => {
    const items = [
      timed({ name: "publique" }),
      timed({ name: "négociée", audience: { type: "company", id: "cmp_dupont" } }),
    ];

    expect(kept(items, { companyId: null })).toEqual(["publique"]);
  });
});
