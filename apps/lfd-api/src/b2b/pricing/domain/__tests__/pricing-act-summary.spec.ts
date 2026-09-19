import {
  describeArticleCount,
  describeLadder,
  describeRule,
  describeScope,
  describeWindowOf,
} from "../pricing-act.js";
import type { PriceAudience, PriceRule, PriceScope } from "../price-rule.js";

/**
 * **La phrase figée d'un acte tarifaire nomme ce qu'elle vise** (plan des
 * phrases du journal, lot B).
 *
 * Régression : elle citait l'identifiant brut — « famille viennoiserie »,
 * « produit P-7K2 » —, illisible à la relecture et faux le jour où l'article
 * change de nom. Seul le TEXTE change : aucun calcul ne lit cette phrase.
 */

/** Aucun nom connu : ni pour la portée, ni pour la société. */
const NO_NAMES = { scopeName: null, audienceName: null };

/** Seule la portée est nommée. */
function scopeNamed(scopeName: string) {
  return { scopeName, audienceName: null };
}

function rule(scope: PriceScope, audience: PriceAudience = { type: "all", id: null }): PriceRule {
  return {
    id: "rule_1",
    stage: "promotion",
    scope,
    audience,
    minQuantity: null,
    // La fenêtre n'est comparée à rien : elle n'est que mise en mots.
    validFrom: new Date(0),
    validTo: null,
    suspendedFrom: null,
    label: "Rentrée",
    stacksOverMercuriale: false,
    nature: "alter",
    alteration: { direction: "decrease", mode: "percent", bp: 1_000 },
  };
}

describe("describeRule — la portée, nommée", () => {
  it("nomme la famille visée par son nom du moment", () => {
    const summary = describeRule(
      rule({ type: "category", id: "viennoiserie" }),
      scopeNamed("Viennoiseries"),
    );

    expect(summary).toContain("famille « Viennoiseries »");
    expect(summary).not.toContain("famille viennoiserie");
  });

  it("nomme l'article visé plutôt que son SKU", () => {
    const summary = describeRule(rule({ type: "product", id: "VIE-001" }), scopeNamed("Croissant"));

    expect(summary).toContain("produit « Croissant »");
    expect(summary).not.toContain("VIE-001");
  });

  it("garde l'identifiant quand aucun nom n'est connu : il n'en invente pas", () => {
    expect(describeRule(rule({ type: "category", id: "inconnu" }), NO_NAMES)).toContain(
      "famille inconnu",
    );
  });

  it("ne change rien au reste de la phrase", () => {
    expect(describeRule(rule({ type: "global", id: null }), NO_NAMES)).toMatch(
      /^Promotion « Rentrée » · −10 % · tout le catalogue, tous clients · du /u,
    );
  });
});

/**
 * Régression (lot B, 2026-09-19) : l'audience d'une règle se disait par
 * l'identifiant brut de la société (« cmp_01J… »).
 */
describe("describeRule — l'audience, nommée", () => {
  const global: PriceScope = { type: "global", id: null };

  it("nomme la société visée par son nom du moment", () => {
    const summary = describeRule(rule(global, { type: "company", id: "cmp_1" }), {
      scopeName: null,
      audienceName: "Le Comptoir",
    });

    expect(summary).toContain("tout le catalogue, client « Le Comptoir »");
    expect(summary).not.toContain("cmp_1");
  });

  it("garde l'identifiant d'une société que l'annuaire ne nomme pas", () => {
    expect(describeRule(rule(global, { type: "company", id: "cmp_1" }), NO_NAMES)).toContain(
      "client cmp_1",
    );
  });

  it("dit un segment par son code — il n'a pas d'autre nom", () => {
    expect(describeRule(rule(global, { type: "segment", id: "cafes" }), NO_NAMES)).toContain(
      "segment cafes",
    );
  });
});

describe("describeScope — le nom du sujet d'une limite", () => {
  it("dit « tout le catalogue » pour la portée globale", () => {
    expect(describeScope({ type: "global", id: null }, null)).toBe("tout le catalogue");
  });

  it("nomme une déclinaison", () => {
    expect(describeScope({ type: "variant", id: "VIE-001" }, "Croissant")).toBe(
      "déclinaison « Croissant »",
    );
  });
});

/**
 * Régression (lot D, 2026-09-19) : la phrase figée écrivait ses dates en ISO
 * (« du 2026-09-01 au sans terme » pour une mercuriale) ou en chiffres
 * (« 01/09/2026 »). Seul le TEXTE change : les bornes restent celles stockées.
 *
 * Les dates ne sont comparées à aucune horloge — elles ne sont que mises en
 * mots —, d'où leur écriture absolue.
 */
describe("describeWindowOf — une fenêtre, en français", () => {
  const firstOfSeptember = new Date("2026-09-01T00:00:00+02:00");
  const endOfSeptember = new Date("2026-09-30T00:00:00+02:00");

  it("dit un jour en toutes lettres, « 1er » compris", () => {
    expect(describeWindowOf(firstOfSeptember, endOfSeptember)).toBe(
      "du 1er septembre 2026 au 30 septembre 2026",
    );
  });

  it("dit une fenêtre ouverte « sans date de fin », sans casser la phrase", () => {
    const window = describeWindowOf(firstOfSeptember, null);

    expect(window).toBe("du 1er septembre 2026, sans date de fin");
    expect(window).not.toContain("sans terme");
  });

  it("lit le jour à Paris, pas dans le fuseau du serveur", () => {
    // 22 h 30 UTC le 31 août = 0 h 30 à Paris le 1er septembre.
    expect(describeWindowOf(new Date("2026-08-31T22:30:00Z"), null)).toMatch(/^du 1er septembre/u);
  });

  it("ne réécrit ni ISO ni chiffres dans une règle", () => {
    const summary = describeRule(
      {
        ...rule({ type: "global", id: null }),
        validFrom: firstOfSeptember,
        validTo: endOfSeptember,
      },
      NO_NAMES,
    );

    expect(summary).toContain("du 1er septembre 2026 au 30 septembre 2026");
    expect(summary).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/u);
  });

  it("dit la fenêtre d'un barème avec les mêmes mots", () => {
    const summary = describeLadder({
      id: "ladder_1",
      label: "Gros volumes",
      scope: { type: "global", id: null },
      audience: { type: "all", id: null },
      unit: "percent",
      tiers: [{ minQuantity: 50, value: 500 }],
      validFrom: firstOfSeptember,
      validTo: null,
      suspendedFrom: null,
    });

    expect(summary).toBe(
      "Barème « Gros volumes » · 50+ à −5 % · du 1er septembre 2026, sans date de fin",
    );
  });
});

describe("describeArticleCount — un compte accordé", () => {
  it("écrit « article » au singulier et « articles » au pluriel, jamais « article(s) »", () => {
    expect(describeArticleCount(1)).toBe("1 article");
    expect(describeArticleCount(12)).toBe("12 articles");
  });
});
