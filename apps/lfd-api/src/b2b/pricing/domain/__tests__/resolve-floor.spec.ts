import { AmbiguousPriceFloorsError } from "../pricing-errors.js";
import { resolveScopedFloor } from "../resolve-floor.js";
import type { PriceScopeType, PricingContext, ScopedPriceFloor } from "../price-rule.js";

const CONTEXT: PricingContext = {
  at: new Date("2026-08-17T10:00:00.000Z"),
  quantity: 1,
  variantSku: "VIE-001-U",
  productSku: "VIE-001",
  categoryId: "viennoiserie",
  companyId: null,
  segmentId: null,
  cumulativeQuantity: null,
};

function floor(
  id: string,
  type: PriceScopeType,
  scopeId: string | null,
  millicents: number,
): ScopedPriceFloor {
  return {
    id,
    scope: { type, id: scopeId },
    policy: { hard: { mode: "amount", millicents }, dynamic: null },
    // Fenêtre ouverte : ces cas éprouvent la PORTÉE et la porte, pas la date.
    validFrom: new Date(0),
    validTo: null,
  };
}

/** Le mur du plancher gagnant — ce que ces cas mesurent. */
function resolveFloor(
  floors: readonly ScopedPriceFloor[],
  context: typeof CONTEXT,
): { mode: string; millicents?: number; bp?: number } | null {
  return resolveScopedFloor(floors, context)?.policy.hard ?? null;
}

describe("resolveFloor", () => {
  it("rend null quand aucun plancher n'est posé", () => {
    expect(resolveFloor([], CONTEXT)).toBeNull();
  });

  it("rend null quand les planchers posés visent autre chose", () => {
    const ailleurs = [
      floor("a", "category", "boulangerie", 100),
      floor("b", "product", "PAT-009", 200),
    ];

    expect(resolveFloor(ailleurs, CONTEXT)).toBeNull();
  });

  it("prend le plancher global à défaut de mieux", () => {
    expect(resolveFloor([floor("g", "global", null, 50)], CONTEXT)).toEqual({
      mode: "amount",
      millicents: 50,
    });
  });

  /**
   * L'héritage, dans le seul sens utile : une famille couvre ses articles.
   */
  it("le plancher de la famille couvre l'article", () => {
    expect(resolveFloor([floor("c", "category", "viennoiserie", 120)], CONTEXT)).toEqual({
      mode: "amount",
      millicents: 120,
    });
  });

  /**
   * Le point qui décide de la lecture de l'écran : un plancher d'article
   * REMPLACE celui de sa famille. Il peut donc descendre la limite — c'est
   * exactement le geste « cet article-là est une exception », et c'est pour ça
   * que l'écran doit montrer les deux.
   */
  it("le plancher de l'article remplace celui de la famille, MÊME s'il est plus bas", () => {
    const posés = [
      floor("c", "category", "viennoiserie", 150),
      floor("p", "product", "VIE-001", 100),
    ];

    expect(resolveFloor(posés, CONTEXT)).toEqual({ mode: "amount", millicents: 100 });
  });

  it("la déclinaison l'emporte sur le produit, qui l'emporte sur la famille", () => {
    const posés = [
      floor("g", "global", null, 10),
      floor("c", "category", "viennoiserie", 20),
      floor("p", "product", "VIE-001", 30),
      floor("v", "variant", "VIE-001-U", 40),
    ];

    expect(resolveFloor(posés, CONTEXT)).toEqual({ mode: "amount", millicents: 40 });
  });

  it("l'ordre de la liste ne change rien", () => {
    const posés = [floor("p", "product", "VIE-001", 30), floor("g", "global", null, 10)];

    expect(resolveFloor(posés, CONTEXT)).toEqual(resolveFloor([...posés].reverse(), CONTEXT));
  });

  it("porte la fraction telle quelle — c'est resolvePrice qui la rapporte au canonique", () => {
    const fraction: ScopedPriceFloor = {
      id: "f",
      scope: { type: "global", id: null },
      policy: { hard: { mode: "percent", bp: 5000 }, dynamic: null },
      // Fenêtre ouverte : ces cas éprouvent la PORTÉE et la porte, pas la date.
      validFrom: new Date(0),
      validTo: null,
    };

    expect(resolveFloor([fraction], CONTEXT)).toEqual({ mode: "percent", bp: 5000 });
  });

  /**
   * La base l'interdit par un index unique. On le revérifie ici parce qu'une
   * fonction pure doit rester déterministe même appelée avec des données
   * fabriquées à la main — un test, un import, une migration.
   */
  it("refuse deux planchers de même portée plutôt que d'en tirer un au hasard", () => {
    const doublon = [
      floor("a", "category", "viennoiserie", 100),
      floor("b", "category", "viennoiserie", 200),
    ];

    expect(() => resolveFloor(doublon, CONTEXT)).toThrow(AmbiguousPriceFloorsError);
  });

  it("ne voit pas d'ambiguïté entre deux portées différentes", () => {
    const posés = [floor("c", "category", "viennoiserie", 100), floor("g", "global", null, 200)];

    expect(() => resolveFloor(posés, CONTEXT)).not.toThrow();
  });
});

/**
 * 🔴 **Le plancher se lit AUSSI à la date.**
 *
 * Il était la seule décision tarifaire sans fenêtre : l'index de sa migration
 * l'écrivait, « la résolution filtre sur la portée, **jamais sur la date** ». Et
 * re-poser réécrivait la ligne en place, si bien qu'une lecture datée appliquait
 * les valeurs d'aujourd'hui à une période où la limite disait autre chose.
 *
 * Un plancher **relève** un prix : le mode de défaillance était un prix
 * historique **gonflé**, et rien ne le signalait.
 */
describe("la fenêtre du plancher", () => {
  const dated = (from: Date, to: Date | null): ScopedPriceFloor => ({
    ...floor("flr_daté", "global", null, 150),
    validFrom: from,
    validTo: to,
  });

  it("n'applique pas une limite qui n'avait pas encore été posée", () => {
    const posedLater = dated(new Date(CONTEXT.at.getTime() + 86_400_000), null);

    expect(resolveFloor([posedLater], CONTEXT)).toBeNull();
  });

  it("n'applique pas une limite déjà remplacée à cet instant", () => {
    const replaced = dated(new Date(0), new Date(CONTEXT.at.getTime() - 86_400_000));

    expect(resolveFloor([replaced], CONTEXT)).toBeNull();
  });

  /**
   * Le cas qui donne son sens au versionnage : deux limites sur la même portée,
   * qui se succèdent. Sans fenêtre, elles ne pouvaient pas coexister — la
   * seconde écrasait la première, et l'histoire disparaissait.
   */
  it("choisit celle qui arbitrait à CET instant, parmi deux qui se succèdent", () => {
    const avant = { ...dated(new Date(0), new Date(CONTEXT.at.getTime() - 1)), id: "flr_avant" };
    const apres = { ...dated(new Date(CONTEXT.at.getTime() - 1), null), id: "flr_apres" };

    expect(resolveScopedFloor([avant, apres], CONTEXT)?.id).toBe("flr_apres");
  });
});
