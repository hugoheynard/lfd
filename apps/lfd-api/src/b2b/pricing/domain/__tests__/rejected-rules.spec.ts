import { CompanyMercuriale } from "../entities/company-mercuriale.js";
import type { PriceRule, PricingContext } from "../price-rule.js";
import { resolvePrice } from "../resolve-price.js";
import type { VolumeLadder } from "../volume-ladder.js";

/**
 * **Ce que le moteur a regardé et n'a pas appliqué** — la moitié de « pourquoi
 * ce prix » que rien ne gardait (R25).
 *
 * Ces cas visent la **cause** autant que la présence : une trace qui dirait
 * « palier non atteint » d'une promotion expirée serait pire qu'une trace vide,
 * parce qu'on la lit en litige et qu'on la croit.
 *
 * Les dates sont absolues et ne sont comparées **qu'entre elles** — `AT` est
 * dans la fenêtre, `AVANT_HIER`/`HIER` la bornent. Rien ici ne se compare à
 * l'horloge, donc rien n'y vieillit (exception écrite au §5 de `CLAUDE.md`).
 */
const AT = new Date("2026-08-17T10:00:00.000Z");
const AVANT_HIER = new Date("2026-08-15T00:00:00.000Z");
const HIER = new Date("2026-08-16T00:00:00.000Z");

function context(over: Partial<PricingContext> = {}): PricingContext {
  return {
    at: AT,
    quantity: 1,
    variantSku: "VIE-001-1",
    productSku: "VIE-001",
    categoryId: "cat_vien",
    companyId: "cmp_dupont",
    segmentId: "seg_boulangerie",
    cumulativeQuantity: null,
    ...over,
  };
}

/**
 * Les surcharges excluent la NATURE : `PriceRule` est une union discriminée, et
 * l'étaler avec un `Partial` complet ferait perdre au compilateur le lien entre
 * `nature` et son effet. C'est ce que le `as PriceRule` des specs voisines
 * achète — on s'en passe en resserrant le paramètre.
 */
type RuleOverride = Partial<Omit<PriceRule, "nature" | "alteration">>;

function promo(over: RuleOverride = {}): PriceRule {
  return {
    id: "promo",
    stage: "promotion",
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    minQuantity: null,
    validFrom: AVANT_HIER,
    validTo: null,
    suspendedFrom: null,
    label: "Promo de rentrée",
    stacksOverMercuriale: false,
    nature: "alter",
    alteration: { direction: "decrease", mode: "percent", bp: 1_000 },
    ...over,
  };
}

/** Une mercuriale posée sur `VIE-001`, dont le premier palier est à `minQuantity`. */
function grid(minQuantity: number, sku = "VIE-001"): CompanyMercuriale {
  return CompanyMercuriale.pose(
    "merc",
    {
      companyId: "cmp_dupont",
      label: "Mercuriale Dupont",
      lines: [{ sku, tiers: [{ minQuantity, unitPriceMillicents: 150_000 }] }],
      validFrom: AVANT_HIER,
      validTo: null,
    },
    "auth0|staff",
  );
}

function ladder(over: Partial<VolumeLadder> = {}): VolumeLadder {
  return {
    id: "ladder",
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    unit: "percent",
    tiers: [{ minQuantity: 100, value: 2_000 }],
    label: "Barème volume",
    validFrom: AVANT_HIER,
    validTo: null,
    suspendedFrom: null,
    ...over,
  };
}

const NOTHING = { rules: [], ladders: [], mercuriale: null } as const;

describe("ce que le moteur écarte", () => {
  it("n'écarte personne quand tout s'applique — et le DIT", () => {
    // Vide est une affirmation : le moteur a regardé et n'a rien recalé. C'est
    // la colonne persistée, nullable, qui portera « on ne consignait pas ».
    const result = resolvePrice(200_000, { ...NOTHING, rules: [promo()] }, context());

    expect(result.rejected).toEqual([]);
    expect(result.steps).toHaveLength(1);
  });

  it("nomme le seuil quand c'est le seuil", () => {
    const result = resolvePrice(
      200_000,
      { ...NOTHING, rules: [promo({ minQuantity: 50 })] },
      context({ quantity: 12 }),
    );

    expect(result.rejected).toEqual([
      {
        stage: "promotion",
        ruleId: "promo",
        label: "Promo de rentrée",
        scope: { type: "global", id: null },
        cause: "below_threshold",
      },
    ]);
  });

  /**
   * 🔴 Le cas qui justifie de rejouer les prédicats un à un plutôt que
   * d'écrire « `!applies` ⇒ seuil ». Une règle peut échouer sur plusieurs ; la
   * PREMIÈRE dans l'ordre d'`applies` est celle qu'on nomme.
   *
   * En production ces règles-là n'atteignent pas le moteur — l'adaptateur les
   * écarte au chargement. Mais `resolvePrice` est pure et doit rester juste sur
   * un tableau fabriqué à la main, ce que fait chacun de ses tests.
   */
  it.each([
    ["expired", promo({ validTo: HIER, minQuantity: 50 })],
    ["suspended", promo({ suspendedFrom: HIER, minQuantity: 50 })],
    ["out_of_scope", promo({ scope: { type: "product", id: "AUTRE" }, minQuantity: 50 })],
    ["out_of_audience", promo({ audience: { type: "company", id: "cmp_autre" }, minQuantity: 50 })],
  ])("dit « %s » plutôt que « seuil » quand les deux sont vrais", (cause, rule) => {
    const result = resolvePrice(200_000, { ...NOTHING, rules: [rule] }, context({ quantity: 1 }));

    expect(result.rejected).toEqual([expect.objectContaining({ cause })]);
  });

  it("consigne la scellée ET la perdante de son étage", () => {
    // Le scellement rend l'étage entier transparent : il n'y a pas de barre de
    // gagnant sur laquelle barrer la perdante, donc les deux vont à la trace.
    const result = resolvePrice(
      200_000,
      {
        ...NOTHING,
        rules: [
          promo(),
          promo({
            id: "promo_ciblee",
            label: "Promo Dupont",
            audience: { type: "company", id: "cmp_dupont" },
          }),
        ],
        mercuriale: grid(1),
      },
      context(),
    );

    expect(result.rejected).toEqual([
      expect.objectContaining({ ruleId: "promo_ciblee", cause: "sealed" }),
      expect.objectContaining({ ruleId: "promo", label: "Promo de rentrée", cause: "superseded" }),
    ]);
    // La dérivation rend exactement ce que la construction rendait.
    expect(result.sealedRuleIds).toEqual(["promo_ciblee"]);
    expect(result.sealedByRuleId).toBe("merc");
  });

  it("consigne la perdante d'un étage qui a bien produit un prix", () => {
    const result = resolvePrice(
      200_000,
      {
        ...NOTHING,
        rules: [
          promo(),
          promo({
            id: "promo_ciblee",
            label: "Promo Dupont",
            audience: { type: "company", id: "cmp_dupont" },
          }),
        ],
      },
      context(),
    );

    expect(result.steps[0]?.ruleId).toBe("promo_ciblee");
    // Même source, deux formes : `supersedes` se dessine sur la barre du
    // gagnant, `rejected` se persiste.
    expect(result.steps[0]?.supersedes).toEqual([{ ruleId: "promo", label: "Promo de rentrée" }]);
    expect(result.rejected).toEqual([
      expect.objectContaining({ ruleId: "promo", cause: "superseded" }),
    ]);
  });
});

describe("les matériaux recalés AVANT le moteur", () => {
  it("consigne un barème dont aucun palier n'est atteint, avec son libellé", () => {
    // `ladderAsRule` rend `null` : le barème ne devient jamais une règle, donc
    // la boucle du moteur ne peut pas le voir. Sans `assembled`, « pourquoi je
    // n'ai pas eu mon prix de volume ? » n'a aucune réponse.
    const result = resolvePrice(
      200_000,
      { ...NOTHING, ladders: [ladder()] },
      context({ quantity: 10 }),
    );

    expect(result.rejected).toEqual([
      {
        stage: "volume",
        ruleId: "ladder",
        label: "Barème volume",
        scope: { type: "global", id: null },
        cause: "below_threshold",
      },
    ]);
  });

  it("consigne une mercuriale qui porte l'article sans que le palier soit atteint", () => {
    const result = resolvePrice(
      200_000,
      { ...NOTHING, mercuriale: grid(500) },
      context({ quantity: 10 }),
    );

    expect(result.rejected).toEqual([
      expect.objectContaining({ stage: "mercuriale", ruleId: "merc", cause: "below_threshold" }),
    ]);
  });

  /**
   * 🔴 **Le cas qui aurait écrit un motif faux en masse.** `asRuleFor` rend
   * `null` pour DEUX raisons, et la mercuriale est passée entière, non filtrée
   * par portée : confondre les deux aurait marqué « palier non atteint » sur
   * chaque ligne de chaque commande d'un client sous mercuriale, pour tout
   * article hors grille.
   *
   * Un article hors grille n'est pas une règle écartée — la mercuriale n'avait
   * rien à en dire.
   */
  it("ne consigne RIEN quand la grille ne porte pas l'article", () => {
    const result = resolvePrice(
      200_000,
      { ...NOTHING, mercuriale: grid(1, "PAI-042") },
      context({ quantity: 1_000 }),
    );

    expect(result.rejected).toEqual([]);
  });
});
