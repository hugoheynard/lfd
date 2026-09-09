import { PricedLot } from "../../../../pricing/application/priced-lot.js";
import { LoadedPricer } from "../../../../pricing/domain/loaded-pricer.js";
import type {
  PricingEvidence,
  PricingMaterials,
} from "../../../../pricing/domain/pricing-materials.js";
import { materialsOf, NO_EVIDENCE } from "../../../../pricing/domain/pricing-materials.js";
import type { PriceRule, ScopedPriceFloor } from "../../../../pricing/domain/price-rule.js";
import type { VolumeCommitment } from "../../../../pricing/domain/volume-commitment.js";
import { catalogueArticle } from "../../../../catalog/domain/catalogue-article.js";
import { priceLine, type LinePricingInput, type LineToPrice } from "../price-line.js";

/**
 * **La recette entière, éprouvée SANS un seul doublé.**
 *
 * C'est tout l'objet du lot : ce qui décide d'un prix — quel engagement couvre
 * l'article, quelle mesure est retenue, quel plancher le vise, quel étage
 * s'ouvre, comment un barème devient une règle — vivait dans quatre-vingt-dix
 * lignes `async`, et ne s'éprouvait qu'en montant sept ports.
 *
 * Ces cas-là s'écrivent en posant des valeurs. Le jour où l'ordre des décisions
 * change, ils le disent ; auparavant, seul un e2e l'aurait dit, et seulement
 * pour les chemins qu'il traverse.
 */

const AT = new Date("2026-03-01T09:00:00.000Z");
const WIDE = {
  validFrom: new Date("2020-01-01T00:00:00.000Z"),
  validTo: null,
  suspendedFrom: null,
};

const CROISSANT: LineToPrice = {
  sku: "VIE-001",
  name: "Croissant au beurre",
  unitPriceMillicents: 200_000,
  vatRate: 5.5,
  category: "viennoiserie",
  allergens: null,
  // La suite déclare SON catalogue, et le scelle comme le port le ferait. Le
  // tarificateur n'accepte plus un article construit à la main — c'est ce qui
  // interdit à la production de lui présenter un prix qu'elle aurait recopié.
  article: catalogueArticle({
    sku: "VIE-001",
    name: "Croissant au beurre",
    category: "viennoiserie",
    unitPriceMillicents: 200_000,
  }),
};

function input(over: Partial<LinePricingInput> = {}): LinePricingInput {
  return {
    item: CROISSANT,
    quantity: 10,
    withTiers: false,
    ...over,
  };
}

/**
 * La ligne, tarificateur monté à la volée.
 *
 * `priceLine` ne compose plus le prix : elle le demande au tarificateur, qui
 * porte désormais la recette (contexte, engagement, mesure, plancher,
 * assemblage). Les cas ci-dessous n'ont pas changé d'un mot — c'est la preuve
 * que la bascule n'a déplacé aucune décision.
 */
function line(
  over: Partial<LinePricingInput>,
  materials: PricingMaterials,
  evidence: PricingEvidence,
  companyId: string | null = null,
) {
  // Un LOT, pas un tarificateur nu : `priceLine` parle désormais par SKU, et le
  // lot est ce qui sait à quel article ce SKU correspond.
  const built = input(over);
  return priceLine(
    built,
    new PricedLot(LoadedPricer.over(materials, evidence, { companyId }, AT), [built.item.article]),
  );
}

/** Une promotion globale de −10 %, ouverte à tous. */
function promotion(over: Partial<Extract<PriceRule, { nature: "alter" }>> = {}): PriceRule {
  return {
    id: "rule_promo",
    stage: "promotion",
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    minQuantity: null,
    label: "Promotion de printemps",
    stacksOverMercuriale: false,
    nature: "alter",
    alteration: { direction: "decrease", mode: "percent", bp: 1_000 },
    ...WIDE,
    ...over,
  };
}

/** Un prix négocié, posé à l'étage mercuriale — il POSE, il n'altère pas. */
function mercuriale(amountMillicents: number): PriceRule {
  return {
    id: "rule_merc",
    stage: "mercuriale",
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    minQuantity: null,
    label: "Mercuriale",
    stacksOverMercuriale: false,
    nature: "replace",
    amountMillicents,
    ...WIDE,
  };
}

/** Un mur à 90 % du canonique, sans porte. */
function hardFloor(bp: number): ScopedPriceFloor {
  return {
    id: "floor_global",
    scope: { type: "global", id: null },
    policy: { hard: { mode: "percent", bp }, dynamic: null },
    // Fenêtre ouverte : ces cas éprouvent la PORTÉE et la porte, pas la date.
    validFrom: new Date(0),
    validTo: null,
  };
}

const NOTHING = materialsOf({
  rules: [],
  floors: [],
  ladders: [],
  commitments: [],
  // Aucun tarif négocié : le champ est DÉCLARÉ, jamais omis.
  mercuriale: null,
});

describe("priceLine — la recette, sans base ni doublé", () => {
  it("rend le tarif de liste quand rien ne le touche", () => {
    const resolved = line({}, NOTHING, NO_EVIDENCE);

    expect(resolved.line.unitPriceMillicents).toBe(200_000);
    expect(resolved.canonicalMillicents).toBe(200_000);
    expect(resolved.line.pricing?.steps).toEqual([]);
    expect(resolved.floorMillicents).toBeNull();
  });

  it("applique l'étage de promotion, et consigne l'étage qui a joué", () => {
    const materials = materialsOf({
      rules: [promotion()],
      floors: [],
      ladders: [],
      commitments: [],
      // Aucun tarif négocié : le champ est DÉCLARÉ, jamais omis.
      mercuriale: null,
    });

    const resolved = line({}, materials, NO_EVIDENCE);

    expect(resolved.line.unitPriceMillicents).toBe(180_000);
    expect(resolved.line.pricing?.steps).toHaveLength(1);
    expect(resolved.line.pricing?.steps[0]?.stage).toBe("promotion");
  });

  /**
   * La mercuriale SCELLE : un compte au tarif négocié n'empoche pas AUSSI la
   * promotion publique. Un cumul que personne n'a décidé ne se lit nulle part et
   * ne se découvre qu'en comparant deux factures.
   */
  it("une mercuriale scelle les étages suivants, et le dit", () => {
    const materials = materialsOf({
      rules: [promotion(), mercuriale(150_000)],
      floors: [],
      ladders: [],
      commitments: [],
      // Aucun tarif négocié : le champ est DÉCLARÉ, jamais omis.
      mercuriale: null,
    });

    const resolved = line({}, materials, NO_EVIDENCE);

    expect(resolved.line.unitPriceMillicents).toBe(150_000);
    expect(resolved.sealedByRuleId).toBe("rule_merc");
    expect(resolved.sealedRuleIds).toEqual(["rule_promo"]);
  });

  it("le plancher relève un prix descendu trop bas, et le consigne", () => {
    const materials = materialsOf({
      rules: [promotion({ alteration: { direction: "decrease", mode: "percent", bp: 5_000 } })],
      floors: [hardFloor(9_000)],
      ladders: [],
      commitments: [],
      mercuriale: null,
    });

    const resolved = line({}, materials, NO_EVIDENCE);

    // −50 % ferait 100 000 ; le mur à 90 % du canonique remonte à 180 000.
    expect(resolved.line.unitPriceMillicents).toBe(180_000);
    expect(resolved.line.pricing?.floored).toBe(true);
    expect(resolved.floorMillicents).toBe(180_000);
  });

  /**
   * 🔴 **C'est la PROMESSE qui ouvre le palier, pas le livré.** Sans cela, la
   * première commande d'une période partirait d'un cumul nul et le palier
   * arriverait avec une commande de retard.
   */
  it("sous engagement, le volume promis ouvre le palier dès la première commande", () => {
    const commitment: VolumeCommitment = {
      id: "com_1",
      companyId: "co_1",
      scope: { type: "product", id: "VIE-001" },
      promisedQuantity: 10_000,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: new Date("2027-01-01T00:00:00.000Z"),
    };
    const materials = materialsOf({
      rules: [promotion({ id: "rule_volume", stage: "volume", minQuantity: 5_000 })],
      floors: [],
      ladders: [],
      commitments: [commitment],
      mercuriale: null,
    });

    const resolved = line({ quantity: 10 }, materials, NO_EVIDENCE, "co_1");

    // Dix pièces commandées, mais dix mille promises : le palier « 5 000+ » joue.
    expect(resolved.line.unitPriceMillicents).toBe(180_000);
    expect(resolved.line.pricing?.commitment).toEqual({
      commitmentId: "com_1",
      promisedQuantity: 10_000,
      cumulativeQuantity: 10,
      retainedQuantity: 10_000,
    });
  });

  /**
   * La mesure ABSENTE du relevé vaut `null` — exactement ce que la lecture
   * paresseuse rendait quand aucun plancher ne la réclamait. C'est cette
   * équivalence qui rend le hissage inoffensif.
   */
  it("une porte de volume sans mesure reste fermée — faute de mesure, on protège", () => {
    const gated: ScopedPriceFloor = {
      id: "floor_gate",
      scope: { type: "global", id: null },
      policy: {
        hard: { mode: "percent", bp: 9_000 },
        dynamic: {
          floor: { mode: "percent", bp: 5_000 },
          unlock: { minQuantity: null, minVolumeRatioBp: 12_500 },
        },
      },
      validFrom: new Date(0),
      validTo: null,
    };
    const materials = materialsOf({
      rules: [promotion({ alteration: { direction: "decrease", mode: "percent", bp: 5_000 } })],
      floors: [gated],
      ladders: [],
      commitments: [],
      mercuriale: null,
    });

    const resolved = line({}, materials, NO_EVIDENCE);

    expect(resolved.line.pricing?.floorDecision?.tier).toBe("hard");
    expect(resolved.line.pricing?.floorDecision?.volumeMet).toBe(false);
    expect(resolved.line.unitPriceMillicents).toBe(180_000);
  });

  it("la même porte s'ouvre quand la mesure la satisfait", () => {
    const gated: ScopedPriceFloor = {
      id: "floor_gate",
      scope: { type: "global", id: null },
      policy: {
        hard: { mode: "percent", bp: 9_000 },
        dynamic: {
          floor: { mode: "percent", bp: 5_000 },
          unlock: { minQuantity: null, minVolumeRatioBp: 12_500 },
        },
      },
      validFrom: new Date(0),
      validTo: null,
    };
    const materials = materialsOf({
      rules: [promotion({ alteration: { direction: "decrease", mode: "percent", bp: 5_000 } })],
      floors: [gated],
      ladders: [],
      commitments: [],
      mercuriale: null,
    });

    const resolved = line({}, materials, {
      orderedBySku: new Map(),
      volumeRatioBySku: new Map([["VIE-001", 13_000]]),
    });

    expect(resolved.line.pricing?.floorDecision?.tier).toBe("dynamic");
    // La porte ouverte laisse la promotion descendre jusqu'à −50 %.
    expect(resolved.line.unitPriceMillicents).toBe(100_000);
  });

  /**
   * La grille coûte une résolution complète par palier. La facturer à chaque
   * commande ferait payer à toutes les ventes un tableau que seul le devis
   * affiche — et lui donnerait un mode de défaillance qu'une vente n'a pas à
   * connaître.
   */
  it("ne calcule la grille des paliers que pour un DEVIS", () => {
    const materials = materialsOf({
      rules: [],
      floors: [],
      ladders: [
        {
          id: "ladder_1",
          scope: { type: "global", id: null },
          audience: { type: "all", id: null },
          unit: "percent",
          tiers: [
            { minQuantity: 100, value: 500 },
            { minQuantity: 1_000, value: 1_200 },
          ],
          label: "Barème public",
          ...WIDE,
        },
      ],
      commitments: [],
      mercuriale: null,
    });

    expect(line({}, materials, NO_EVIDENCE).volumeTiers).toBeNull();
    expect(line({ withTiers: true }, materials, NO_EVIDENCE).volumeTiers).toHaveLength(2);
  });
});
