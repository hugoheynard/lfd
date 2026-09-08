import type { PriceFloorPolicy } from "../floor-policy.js";
import type { PriceRule, PricingContext } from "../price-rule.js";
import type { VolumeLadder } from "../volume-ladder.js";
import { resolvePrice } from "../resolve-price.js";
import { volumeTierPrices } from "../volume-tier-prices.js";
import type { CompanyMercuriale } from "../entities/company-mercuriale.js";
import type { PriceFloor } from "../price-rule.js";

/**
 * La grille, avec sa résolution **fournie** — comme le tarificateur la fournit.
 *
 * `volumeTierPrices` n'importe plus `resolvePrice` : c'est ce qui garde une
 * seule porte sur la fonction qui facture. Le doublé qu'on lui passe ici est la
 * vraie résolution, pas un simulacre — un simulacre ferait passer la grille
 * sans rien prouver de ce qu'elle affiche.
 */
function grid(
  canonicalMillicents: number,
  ladders: readonly VolumeLadder[],
  rules: readonly PriceRule[],
  ctx: PricingContext,
  floor: { policy: PriceFloorPolicy; observedVolumeRatioBp: number | null } | null,
  mercuriale: CompanyMercuriale | null = null,
) {
  return volumeTierPrices(
    canonicalMillicents,
    ladders,
    rules,
    ctx,
    floor,
    mercuriale,
    (probe: PricingContext, applied: PriceFloor | null) =>
      resolvePrice(canonicalMillicents, { rules, ladders, mercuriale }, probe, applied),
  );
}

/**
 * **La grille que le commercial lit au téléphone** — « à combien je lui fais les
 * cent ? ».
 *
 * Les dates sont absolues et ne sont comparées **qu'entre elles** : une règle en
 * vigueur depuis `HIER` l'est à `AT`. Rien ici ne se compare à l'horloge, donc
 * rien n'y vieillit — c'est l'exception écrite dans `CLAUDE.md` §5.
 */
const AT = new Date("2026-08-17T10:00:00.000Z");
const HIER = new Date("2026-08-16T00:00:00.000Z");
const CANONICAL = 200_000;

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

/** Un palier de mercuriale, tel que `template-to-rules` le pose : une RÈGLE. */
function mercurialeTier(minQuantity: number, amountMillicents: number): PriceRule {
  return {
    id: `merc_${String(minQuantity)}`,
    stage: "mercuriale",
    scope: { type: "product", id: "VIE-001" },
    audience: { type: "company", id: "cmp_dupont" },
    minQuantity,
    validFrom: HIER,
    validTo: null,
    suspendedFrom: null,
    label: "Mercuriale Dupont",
    stacksOverMercuriale: false,
    nature: "replace",
    amountMillicents,
  };
}

function ladder(tiers: readonly { minQuantity: number; value: number }[]): VolumeLadder {
  return {
    id: "ladder",
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    unit: "percent",
    tiers: tiers.map((tier) => ({ ...tier })),
    label: "Barème public",
    validFrom: HIER,
    validTo: null,
    suspendedFrom: null,
  };
}

const thresholds = (grid: readonly { minQuantity: number }[] | null) =>
  (grid ?? []).map((line) => line.minQuantity);

describe("volumeTierPrices", () => {
  /**
   * 🔴 **Le trou que ce lot ferme.**
   *
   * Une mercuriale à paliers n'est pas un `VolumeLadder` : c'est une règle par
   * palier. La grille rendait `null` pour ces clients-là — les négociés — et un
   * commercial ne voyait rien.
   */
  it("rend la grille d'une mercuriale à paliers, sans aucun barème", () => {
    const rules = [mercurialeTier(1, 190_000), mercurialeTier(50, 170_000)];

    const built = grid(CANONICAL, [], rules, context(), null);

    expect(built).toEqual([
      { minQuantity: 1, unitPriceMillicents: 190_000, discountBp: 500 },
      { minQuantity: 50, unitPriceMillicents: 170_000, discountBp: 1500 },
    ]);
  });

  it("réunit les seuils du barème et ceux des règles, triés et dédupliqués", () => {
    const rules = [mercurialeTier(50, 170_000)];
    const ladders = [
      ladder([
        { minQuantity: 10, value: 1000 },
        { minQuantity: 50, value: 2000 },
      ]),
    ];

    expect(thresholds(grid(CANONICAL, ladders, rules, context(), null))).toEqual([10, 50]);
  });

  /**
   * Une règle est retenue si elle s'applique **à son propre seuil**.
   *
   * L'évaluer à la quantité du panier l'écarterait dès qu'il est en dessous —
   * c'est-à-dire précisément quand la grille sert à répondre « et si j'en
   * prends cent ? ».
   */
  it("retient un palier que la quantité courante n'atteint pas", () => {
    const rules = [mercurialeTier(100, 150_000)];

    expect(thresholds(grid(CANONICAL, [], rules, context({ quantity: 1 }), null))).toEqual([100]);
  });

  it("ne retient pas une règle qui vise un autre article", () => {
    const other: PriceRule = {
      ...mercurialeTier(50, 150_000),
      scope: { type: "product", id: "PAI-001" },
    };

    expect(grid(CANONICAL, [], [other], context(), null)).toBeNull();
  });

  /**
   * 🔴 **Le plancher est redécidé à CHAQUE palier.**
   *
   * Il ne l'était pas : la décision prise à la quantité de la commande valait
   * pour toute la grille. Une porte qui s'ouvre à 50 restait donc fermée sur la
   * ligne « 100 », et cette ligne annonçait un prix relevé par le mur dur —
   * c'est-à-dire un prix que la commande n'aurait pas appliqué.
   */
  it("rouvre la porte du plancher sur les paliers qui l'atteignent", () => {
    const policy: PriceFloorPolicy = {
      hard: { mode: "amount", millicents: 180_000 },
      dynamic: {
        floor: { mode: "amount", millicents: 140_000 },
        unlock: { minQuantity: 50, minVolumeRatioBp: null },
      },
    };
    const rules = [mercurialeTier(1, 150_000), mercurialeTier(100, 150_000)];

    const built = grid(CANONICAL, [], rules, context({ quantity: 1 }), {
      policy,
      observedVolumeRatioBp: null,
    });

    // À 1, la porte est fermée : le mur dur relève à 180 000.
    expect(built?.[0]).toMatchObject({ minQuantity: 1, unitPriceMillicents: 180_000 });
    // À 100, elle s'ouvre : le prix négocié passe.
    expect(built?.[1]).toMatchObject({ minQuantity: 100, unitPriceMillicents: 150_000 });
  });

  /**
   * 🔴 Régression : la porte du plancher se juge sur la **commande**, le seuil
   * du palier sur le **cumul**.
   *
   * Sous engagement, un palier se lit « quand le cumul de la saison atteint
   * N » — ce n'est pas une opération. Passer ce seuil à `decideFloor`, dont
   * l'`UnlockEvidence.quantity` dit « la quantité de CE SKU dans CETTE
   * commande », ouvrirait la porte sur une quantité que le client ne commande
   * pas : la grille annoncerait 150 000 là où la commande servirait 180 000.
   */
  it("sous engagement, n'ouvre pas la porte du plancher sur un seuil de cumul", () => {
    const policy: PriceFloorPolicy = {
      hard: { mode: "amount", millicents: 180_000 },
      dynamic: {
        floor: { mode: "amount", millicents: 140_000 },
        unlock: { minQuantity: 50, minVolumeRatioBp: null },
      },
    };
    const rules = [mercurialeTier(100, 150_000)];

    const withCommitment = grid(
      CANONICAL,
      [],
      rules,
      // Le client est engagé : il a déjà pris 40 pièces sur la saison, et en
      // commande une aujourd'hui.
      context({ quantity: 1, cumulativeQuantity: 40 }),
      { policy, observedVolumeRatioBp: null },
    );

    // Le palier est atteignable — le cumul en décide — mais la porte reste
    // fermée : la commande fait une pièce.
    expect(withCommitment).toEqual([
      { minQuantity: 100, unitPriceMillicents: 180_000, discountBp: 1000 },
    ]);
  });

  it("rend `null` quand aucun seuil n'existe nulle part", () => {
    // Le prix ne dépend pas de la quantité : une grille à une ligne dirait le
    // contraire.
    const flat: PriceRule = { ...mercurialeTier(1, 190_000), minQuantity: null };

    expect(grid(CANONICAL, [], [flat], context(), null)).toBeNull();
  });
});
