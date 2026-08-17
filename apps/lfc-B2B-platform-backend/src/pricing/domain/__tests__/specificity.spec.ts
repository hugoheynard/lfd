import type { PriceRule, PricingContext } from "../price-rule.js";
import { AmbiguousPriceRulesError } from "../pricing-errors.js";
import { applies, winnerOf } from "../specificity.js";

/**
 * **Qui gagne dans un étage.** Le doc posait « la plus spécifique sur les deux
 * axes » sans dire lequel prime — ces tests figent la réponse : l'audience
 * d'abord, la portée produit ensuite, le palier de quantité en dernier.
 */

const AT = new Date("2026-08-17T10:00:00.000Z");

function context(over: Partial<PricingContext> = {}): PricingContext {
  return {
    at: AT,
    quantity: 1,
    variantSku: "VIE-001-1",
    productSku: "VIE-001",
    categoryId: "cat_vien",
    companyId: "cmp_dupont",
    segmentId: "seg_boulangerie",
    ...over,
  };
}

function rule(over: Partial<PriceRule> = {}): PriceRule {
  return {
    id: "r",
    stage: "promotion",
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    minQuantity: null,
    validFrom: new Date("2026-08-01T00:00:00.000Z"),
    validTo: null,
    label: "règle",
    nature: "alter",
    alteration: { direction: "decrease", mode: "percent", bp: 1000 },
    ...over,
  } as PriceRule;
}

describe("applies — la fenêtre de validité", () => {
  it("prend la borne basse INCLUSE", () => {
    const exact = rule({ validFrom: AT });

    expect(applies(exact, context())).toBe(true);
  });

  /**
   * Borne haute exclue : deux règles qui se succèdent au même instant ne se
   * chevauchent jamais, et personne n'a à se demander laquelle vaut à minuit.
   */
  it("prend la borne haute EXCLUE", () => {
    const ends = rule({ validTo: AT });

    expect(applies(ends, context())).toBe(false);
  });

  it("écarte une règle pas encore en vigueur", () => {
    const future = rule({ validFrom: new Date("2026-09-01T00:00:00.000Z") });

    expect(applies(future, context())).toBe(false);
  });
});

describe("applies — la portée et l'audience", () => {
  it("reconnaît une règle qui vise la variante, le produit ou la famille", () => {
    expect(applies(rule({ scope: { type: "variant", id: "VIE-001-1" } }), context())).toBe(true);
    expect(applies(rule({ scope: { type: "product", id: "VIE-001" } }), context())).toBe(true);
    expect(applies(rule({ scope: { type: "category", id: "cat_vien" } }), context())).toBe(true);
  });

  it("écarte une règle qui vise un AUTRE article", () => {
    expect(applies(rule({ scope: { type: "product", id: "PAI-001" } }), context())).toBe(false);
  });

  /**
   * Le parcours zéro friction n'est pas un cas limite : c'est le défaut de la
   * boutique. Sans entreprise, seules les règles ouvertes à tous s'appliquent.
   */
  it("une commande sans entreprise ne prend que les règles ouvertes à tous", () => {
    const anonymous = context({ companyId: null, segmentId: null });

    expect(applies(rule(), anonymous)).toBe(true);
    expect(applies(rule({ audience: { type: "company", id: "cmp_dupont" } }), anonymous)).toBe(
      false,
    );
    expect(applies(rule({ audience: { type: "segment", id: "seg_boulangerie" } }), anonymous)).toBe(
      false,
    );
  });

  it("écarte une règle dont le palier n'est pas atteint", () => {
    const tier = rule({ minQuantity: 100 });

    expect(applies(tier, context({ quantity: 99 }))).toBe(false);
    expect(applies(tier, context({ quantity: 100 }))).toBe(true);
  });
});

describe("winnerOf — l'ordre des critères", () => {
  it("ne rend rien quand aucune règle ne s'applique : l'étage est transparent", () => {
    expect(winnerOf([], context())).toBeNull();
  });

  /**
   * LA décision que le doc laissait ouverte. Une règle *globale / ce client* bat
   * une règle *produit / tous clients* — sans quoi une promotion générale
   * écraserait un engagement négocié individuellement, ce qu'un client appelle
   * précisément pour contester.
   */
  it("l'audience prime sur la portée produit", () => {
    const cible = rule({ id: "client", audience: { type: "company", id: "cmp_dupont" } });
    const large = rule({ id: "produit", scope: { type: "variant", id: "VIE-001-1" } });

    expect(winnerOf([large, cible], context())?.id).toBe("client");
  });

  it("à audience égale, la portée la plus précise gagne", () => {
    const famille = rule({ id: "famille", scope: { type: "category", id: "cat_vien" } });
    const variante = rule({ id: "variante", scope: { type: "variant", id: "VIE-001-1" } });

    expect(winnerOf([famille, variante], context())?.id).toBe("variante");
  });

  it("le segment bat « tous », et l'entreprise bat le segment", () => {
    const tous = rule({ id: "tous" });
    const segment = rule({ id: "segment", audience: { type: "segment", id: "seg_boulangerie" } });
    const client = rule({ id: "client", audience: { type: "company", id: "cmp_dupont" } });

    expect(winnerOf([tous, segment], context())?.id).toBe("segment");
    expect(winnerOf([tous, segment, client], context())?.id).toBe("client");
  });

  /**
   * Le palier fait fonctionner l'étage volume sans traitement particulier :
   * « 100+ » bat « 50+ » parce qu'il est plus spécifique, pas parce que c'est
   * du volume.
   */
  it("à audience et portée égales, le palier le plus haut atteint gagne", () => {
    const cinquante = rule({ id: "50+", stage: "volume", minQuantity: 50 });
    const cent = rule({ id: "100+", stage: "volume", minQuantity: 100 });

    expect(winnerOf([cinquante, cent], context({ quantity: 120 }))?.id).toBe("100+");
    expect(winnerOf([cinquante, cent], context({ quantity: 60 }))?.id).toBe("50+");
  });

  it("refuse deux règles strictement aussi spécifiques", () => {
    const first = rule({ id: "a" });
    const second = rule({ id: "b" });

    expect(() => winnerOf([first, second], context())).toThrow(AmbiguousPriceRulesError);
  });

  it("ne crie pas à l'ambiguïté quand l'une des deux ne s'applique pas", () => {
    const applicable = rule({ id: "a" });
    const expiree = rule({ id: "b", validTo: new Date("2026-08-10T00:00:00.000Z") });

    expect(winnerOf([applicable, expiree], context())?.id).toBe("a");
  });
});
