/**
 * **LE tarificateur** — le seul appelant de `resolvePrice` du dépôt.
 *
 * ## Pourquoi cette suite est la plus importante du contexte
 *
 * Les six gestes qu'un prix demande — contexte, engagement, mesure retenue,
 * plancher, porte dynamique, assemblage — vivaient chez **cinq** appelants.
 * Deux s'étaient trompés, et aucun n'avait rougi : un prix auquel il manque un
 * étage reste un prix parfaitement plausible.
 *
 * Ces gestes sont ici, une fois. Ce fichier est donc le seul endroit où
 * l'ORDRE des décisions s'éprouve — et il s'éprouve **sans un seul doublé** :
 * les matériaux sont des valeurs, l'objet ne lit rien.
 *
 * ## Ce que les autres suites couvrent, et qu'on ne redouble pas ici
 *
 * La composition des étages et l'arrondi unique sont à `resolve-price.spec` ;
 * la mise en forme d'une ligne de commande à `price-line.spec` ; le contenu
 * d'une grille de paliers à `volume-tier-prices.spec`. Ici on éprouve ce que
 * **seul cet objet** décide : quelle méthode lit quoi, et ce que chacune écarte
 * délibérément.
 *
 * Les dates sont absolues et ne sont comparées **qu'entre elles** — rien ici ne
 * se compare à l'horloge, donc rien n'y vieillit (`CLAUDE.md` §5).
 */
import { millicentsFromCents } from "@lfd/money";

import { CompanyMercuriale } from "../entities/company-mercuriale.js";
import type { PriceFloorPolicy } from "../floor-policy.js";
import { LoadedPricer, type PricedItem } from "../loaded-pricer.js";
import type { PriceRule, ScopedPriceFloor } from "../price-rule.js";
import {
  materialsOf,
  NO_EVIDENCE,
  type PricingEvidence,
  type PricingMaterials,
} from "../pricing-materials.js";
import type { VolumeCommitment } from "../volume-commitment.js";
import type { VolumeLadder } from "../volume-ladder.js";

const AT = new Date("2026-06-15T09:00:00.000Z");
const WIDE = {
  validFrom: new Date("2020-01-01T00:00:00.000Z"),
  validTo: null,
  suspendedFrom: null,
};

const CROISSANT: PricedItem = {
  sku: "VIE-001",
  name: "Croissant au beurre",
  category: "viennoiserie",
  canonicalMillicents: 200_000,
};

const PAIN: PricedItem = {
  sku: "PAI-001",
  name: "Baguette",
  category: "pain",
  canonicalMillicents: 100_000,
};

// ── Les matériaux ─────────────────────────────────────────────────────────

/** Une altération globale, ouverte à tous. */
function alteration(
  id: string,
  bp: number,
  over: Partial<Extract<PriceRule, { nature: "alter" }>> = {},
): PriceRule {
  return {
    id,
    stage: "promotion",
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    minQuantity: null,
    label: id,
    stacksOverMercuriale: false,
    nature: "alter",
    alteration: { direction: "decrease", mode: "percent", bp },
    ...WIDE,
    ...over,
  };
}

/** Une baisse EN EUROS — la façon la plus banale de passer sous zéro. */
function rebate(id: string, millicents: number): PriceRule {
  return {
    ...alteration(id, 1),
    nature: "alter",
    alteration: { direction: "decrease", mode: "amount", millicents },
  };
}

/** Un barème qui s'ouvre à `from` pièces, sur le croissant. */
function ladder(from: number, bp: number): VolumeLadder {
  return {
    id: `ladder_${String(from)}`,
    scope: { type: "product", id: "VIE-001" },
    audience: { type: "all", id: null },
    unit: "percent",
    tiers: [{ minQuantity: from, value: bp }],
    label: `Barème ${String(from)}`,
    ...WIDE,
  };
}

function floor(policy: PriceFloorPolicy): ScopedPriceFloor {
  return { id: "floor_1", scope: { type: "global", id: null }, policy };
}

/** Un mur dur à 90 % du canonique, sans porte. */
const HARD_90: PriceFloorPolicy = { hard: { mode: "percent", bp: 9_000 }, dynamic: null };

/** Un mur à 90 %, qui s'abaisse à 50 % quand le volume observé le mérite. */
const GATED_ON_VOLUME: PriceFloorPolicy = {
  hard: { mode: "percent", bp: 9_000 },
  dynamic: {
    floor: { mode: "percent", bp: 5_000 },
    unlock: { minQuantity: null, minVolumeRatioBp: 12_000 },
  },
};

/** Un engagement : 10 000 pièces promises sur la saison. */
const PROMISE: VolumeCommitment = {
  id: "com_1",
  companyId: "cmp_1",
  scope: { type: "product", id: "VIE-001" },
  promisedQuantity: 10_000,
  validFrom: new Date("2026-01-01T00:00:00.000Z"),
  validTo: new Date("2027-01-01T00:00:00.000Z"),
};

/** Une mercuriale : le croissant à 1,50 € ferme, dès la première pièce. */
function mercurialeAt(cents: number, minQuantity = 1): CompanyMercuriale {
  return CompanyMercuriale.pose(
    "merc_1",
    {
      companyId: "cmp_1",
      label: "Mercuriale 2026",
      lines: [
        {
          sku: "VIE-001",
          tiers: [{ minQuantity, unitPriceMillicents: millicentsFromCents(cents) }],
        },
      ],
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: null,
    },
    "staff_test",
  );
}

function pricerOver(
  parts: {
    rules?: readonly PriceRule[];
    floors?: readonly ScopedPriceFloor[];
    ladders?: readonly VolumeLadder[];
    commitments?: readonly VolumeCommitment[];
    mercuriale?: CompanyMercuriale | null;
  } = {},
  evidence: PricingEvidence = NO_EVIDENCE,
  companyId: string | null = "cmp_1",
): LoadedPricer {
  const materials: PricingMaterials = materialsOf({
    rules: parts.rules ?? [],
    floors: parts.floors ?? [],
    ladders: parts.ladders ?? [],
    commitments: parts.commitments ?? [],
    mercuriale: parts.mercuriale ?? null,
  });
  return LoadedPricer.over(materials, evidence, { companyId }, AT);
}

describe("price — la question ordinaire", () => {
  it("rend le tarif de liste quand rien ne vise l'article", () => {
    const priced = pricerOver().price(CROISSANT, 1);

    expect(priced).toMatchObject({
      sku: "VIE-001",
      name: "Croissant au beurre",
      canonicalMillicents: 200_000,
      finalMillicents: 200_000,
      quantity: 1,
      steps: [],
      sealedByRuleId: null,
      sealedRuleIds: [],
      floored: false,
      clampedToZero: false,
      floorMillicents: null,
      floorDecision: null,
      commitment: null,
    });
  });

  /**
   * 🔴 **Le contexte est construit ICI.**
   *
   * Un appelant ne fournit qu'un article et une quantité. C'est ce qui rend
   * l'oubli d'un étage inexprimable : il n'y a plus rien à oublier de fournir.
   */
  it("🔴 fait entrer barème ET mercuriale sans que l'appelant les passe", () => {
    const pricer = pricerOver({
      rules: [alteration("promo", 1_000)],
      ladders: [ladder(1, 2_000)],
      mercuriale: mercurialeAt(150),
    });

    const priced = pricer.price(CROISSANT, 1);

    // La mercuriale SCELLE : ni le barème ni la promotion ne s'ajoutent au
    // tarif négocié.
    expect(priced.finalMillicents).toBe(millicentsFromCents(150));
    expect(priced.sealedByRuleId).toBe("merc_1");
    expect(priced.sealedRuleIds).toEqual(expect.arrayContaining(["promo", "ladder_1"]));
  });

  it("compose les étages, il ne les additionne pas", () => {
    const pricer = pricerOver({
      rules: [alteration("promo", 2_000), alteration("geste", 1_000, { stage: "geste" })],
    });

    // −20 % puis −10 % font −28 %, pas −30 % : 200 → 160 → 144.
    expect(pricer.price(CROISSANT, 1).finalMillicents).toBe(144_000);
  });

  /**
   * 🔴 **L'engagement ouvre le palier que la commande n'ouvrirait pas.**
   *
   * C'est la décision la plus facile à perdre en déplaçant la recette : sous
   * engagement, l'étage volume se juge sur le **volume annoncé**, pas sur le
   * panier du jour. Un client qui a promis 10 000 pièces paie le palier
   * « 5 000+ » dès sa première commande de dix.
   */
  it("🔴 retient le volume PROMIS, pas la quantité commandée", () => {
    const pricer = pricerOver({
      rules: [alteration("volume", 1_000, { stage: "volume", minQuantity: 5_000 })],
      commitments: [PROMISE],
    });

    const priced = pricer.price(CROISSANT, 10);

    expect(priced.finalMillicents).toBe(180_000);
    expect(priced.commitment).toEqual({
      commitmentId: "com_1",
      promisedQuantity: 10_000,
      cumulativeQuantity: 10,
      retainedQuantity: 10_000,
    });
  });

  it("compte ce qui a DÉJÀ été commandé dans le cumul", () => {
    const pricer = pricerOver(
      { commitments: [PROMISE] },
      { orderedBySku: new Map([["VIE-001", 1_200]]), volumeRatioBySku: new Map() },
    );

    expect(pricer.price(CROISSANT, 10).commitment?.cumulativeQuantity).toBe(1_210);
  });

  it("ne voit aucun engagement quand il vise un autre article", () => {
    const pricer = pricerOver({ commitments: [PROMISE] });

    expect(pricer.price(PAIN, 10).commitment).toBeNull();
  });

  /** Le plancher **relève**, et le dit — un prix relevé est un prix qu'une règle n'a pas produit. */
  it("consigne le relèvement au lieu de l'avaler", () => {
    const pricer = pricerOver({
      rules: [alteration("promo", 5_000)],
      floors: [floor(HARD_90)],
    });

    const priced = pricer.price(CROISSANT, 1);

    expect(priced.finalMillicents).toBe(180_000);
    expect(priced.floored).toBe(true);
    expect(priced.floorMillicents).toBe(180_000);
    expect(priced.floorDecision).toMatchObject({ tier: "hard", floorMillicents: 180_000 });
  });

  /**
   * La porte dynamique s'ouvre sur une mesure **prise**, jamais supposée. La
   * décision part figée avec le prix : sans elle, un prix qui dépend de
   * l'historique cesse d'être explicable dès que l'historique bouge.
   */
  it("ouvre la porte du plancher dynamique sur la mesure relevée", () => {
    const pricer = pricerOver(
      { rules: [alteration("promo", 5_000)], floors: [floor(GATED_ON_VOLUME)] },
      { orderedBySku: new Map(), volumeRatioBySku: new Map([["VIE-001", 13_000]]) },
    );

    const priced = pricer.price(CROISSANT, 1);

    expect(priced.floorDecision).toMatchObject({
      tier: "dynamic",
      observedVolumeRatioBp: 13_000,
      volumeMet: true,
    });
    // La porte ouverte laisse la promotion descendre jusqu'à −50 %.
    expect(priced.finalMillicents).toBe(100_000);
  });

  /**
   * La mesure **absente** du relevé vaut `null` — exactement ce que la lecture
   * paresseuse rendait quand aucun plancher ne la réclamait. La porte reste
   * fermée, et le défaut penche du côté de la maison.
   */
  it("garde la porte fermée quand la mesure n'a pas été prise", () => {
    const pricer = pricerOver({
      rules: [alteration("promo", 5_000)],
      floors: [floor(GATED_ON_VOLUME)],
    });

    expect(pricer.price(CROISSANT, 1).finalMillicents).toBe(180_000);
  });

  /** Une baisse en euros plus grande que le prix : ramené à zéro, et consigné. */
  it("consigne le passage sous zéro", () => {
    const priced = pricerOver({ rules: [rebate("cadeau", 500_000)] }).price(CROISSANT, 1);

    expect(priced.finalMillicents).toBe(0);
    expect(priced.clampedToZero).toBe(true);
  });

  it("ne lit pas la mercuriale d'un client pour un visiteur sans société", () => {
    const pricer = pricerOver({ mercuriale: mercurialeAt(150) }, NO_EVIDENCE, null);

    const priced = pricer.price(CROISSANT, 1);

    expect(priced.finalMillicents).toBe(200_000);
    expect(priced.sealedByRuleId).toBeNull();
  });
});

describe("priceAll — plusieurs articles, un seul jeu de matériaux", () => {
  it("résout chaque article à SA quantité", () => {
    const pricer = pricerOver({ ladders: [ladder(10, 2_000)] });

    const priced = pricer.priceAll([
      { item: CROISSANT, quantity: 12 },
      { item: CROISSANT, quantity: 1 },
      { item: PAIN, quantity: 50 },
    ]);

    expect(priced.map((article) => article.finalMillicents)).toEqual([160_000, 200_000, 100_000]);
    expect(priced.map((article) => article.quantity)).toEqual([12, 1, 50]);
  });

  it("rend les articles dans l'ordre demandé", () => {
    const priced = pricerOver().priceAll([
      { item: PAIN, quantity: 1 },
      { item: CROISSANT, quantity: 1 },
    ]);

    expect(priced.map((article) => article.sku)).toEqual(["PAI-001", "VIE-001"]);
  });
});

describe("priceAtCumulative — « si ce niveau était atteint »", () => {
  it("juge l'étage volume sur le cumul projeté", () => {
    const pricer = pricerOver({
      rules: [alteration("volume", 1_000, { stage: "volume", minQuantity: 500 })],
    });

    expect(pricer.priceAtCumulative(CROISSANT, 100).finalMillicents).toBe(200_000);
    expect(pricer.priceAtCumulative(CROISSANT, 500).finalMillicents).toBe(180_000);
  });

  /**
   * 🔴 **Elle écarte les preuves, et c'est une décision.**
   *
   * Une projection ne peut pas prouver un volume observé : ouvrir la porte d'un
   * plancher dynamique sur une hypothèse accorderait une remise que rien n'a
   * établie. La différence avec `price` se voit ici, et **nulle part ailleurs**
   * — les deux méthodes reçoivent les mêmes matériaux et les mêmes preuves.
   */
  it("🔴 n'ouvre PAS la porte dynamique, même quand la mesure existe", () => {
    const evidence: PricingEvidence = {
      orderedBySku: new Map(),
      volumeRatioBySku: new Map([["VIE-001", 13_000]]),
    };
    const pricer = pricerOver(
      { rules: [alteration("promo", 5_000)], floors: [floor(GATED_ON_VOLUME)] },
      evidence,
    );

    // La même question, posée par `price`, ouvre la porte : 100 000.
    expect(pricer.price(CROISSANT, 1).finalMillicents).toBe(100_000);
    // La projection, elle, reste au mur dur.
    expect(pricer.priceAtCumulative(CROISSANT, 1).finalMillicents).toBe(180_000);
  });

  /**
   * Elle ne consulte **aucun** engagement : elle répond à « si le cumul valait
   * N », pas à « où en est ce client ». Les deux questions se ressemblent et
   * n'ont pas la même réponse.
   */
  it("🔴 ignore l'engagement du client", () => {
    const pricer = pricerOver({
      rules: [alteration("volume", 1_000, { stage: "volume", minQuantity: 5_000 })],
      commitments: [PROMISE],
    });

    // `price` retiendrait 10 000 promis et appliquerait le palier ; la
    // projection répond bien « à 10 pièces, rien ne s'ouvre ».
    expect(pricer.price(CROISSANT, 10).finalMillicents).toBe(180_000);
    expect(pricer.priceAtCumulative(CROISSANT, 10).finalMillicents).toBe(200_000);
    expect(pricer.priceAtCumulative(CROISSANT, 10).commitment).toBeNull();
  });
});

describe("tiers — la grille des paliers", () => {
  it("rend `null` quand le prix ne dépend d'aucune quantité", () => {
    expect(pricerOver({ rules: [alteration("promo", 1_000)] }).tiers(CROISSANT, 1)).toBeNull();
  });

  /** Chaque ligne est une résolution COMPLÈTE — la promotion compose avec le palier. */
  it("résout chaque palier au lieu d'appliquer la remise nue", () => {
    const pricer = pricerOver({
      rules: [alteration("promo", 1_000)],
      ladders: [ladder(10, 2_000)],
    });

    // 200 000 → −20 % (palier) → −10 % (promotion) = 144 000, et non 160 000.
    expect(pricer.tiers(CROISSANT, 1)).toEqual([
      { minQuantity: 10, unitPriceMillicents: 144_000, discountBp: 2_800 },
    ]);
  });

  /**
   * 🔴 **Les seuils d'une mercuriale à paliers comptent aussi.**
   *
   * Une mercuriale n'est pas un barème, et un commercial qui demande « à
   * combien je lui fais les 100 ? » pour un client négocié sans barème public
   * ne voyait rien avant que la grille ne lise les deux.
   */
  it("🔴 énumère aussi les paliers de la mercuriale", () => {
    const pricer = pricerOver({ mercuriale: mercurialeAt(150, 100) });

    expect(pricer.tiers(CROISSANT, 1)).toEqual([
      { minQuantity: 100, unitPriceMillicents: millicentsFromCents(150), discountBp: 2_500 },
    ]);
  });
});

describe("mercurialeAlone — ce que le marché paie", () => {
  /**
   * 🔴 **Sans barème ni plancher, et c'est tout l'objet.**
   *
   * On mesure ce qu'une mercuriale accorde SEULE, pour la comparer à celle d'un
   * autre client qui n'a pas les mêmes barèmes. Y ajouter un étage mesurerait
   * autre chose — et un plancher, propre à un compte, dirait ce qu'UN client
   * paie et non ce que le marché paie.
   */
  it("🔴 n'applique ni barème ni plancher", () => {
    const price = LoadedPricer.mercurialeAlone(
      mercurialeAt(150),
      "cmp_1",
      { sku: "VIE-001", canonicalMillicents: 200_000 },
      1,
      AT,
    );

    expect(price).toBe(millicentsFromCents(150));
  });

  /** Chaque palier est mesuré **à sa propre quantité** — sinon le marché perd ses prix de volume. */
  it("mesure un palier à sa propre quantité", () => {
    const mercuriale = mercurialeAt(150, 500);
    const item = { sku: "VIE-001", canonicalMillicents: 200_000 };

    expect(LoadedPricer.mercurialeAlone(mercuriale, "cmp_1", item, 500, AT)).toBe(
      millicentsFromCents(150),
    );
    // À une pièce, aucun palier n'est atteint : il n'y a pas d'observation.
    expect(LoadedPricer.mercurialeAlone(mercuriale, "cmp_1", item, 1, AT)).toBeNull();
  });

  it("rend `null` quand la mercuriale ne porte pas l'article", () => {
    expect(
      LoadedPricer.mercurialeAlone(
        mercurialeAt(150),
        "cmp_1",
        { sku: "PAI-001", canonicalMillicents: 100_000 },
        1,
        AT,
      ),
    ).toBeNull();
  });
});
