/**
 * Le **`Pricer`** — la porte d'entrée du prix.
 *
 * ## Ce que cette suite éprouve, et ce qu'elle n'a PAS à éprouver
 *
 * La façade ne calcule rien : elle appelle la recette de la caisse sur les
 * matériaux que la caisse charge. Ce qui est donc HORS sujet ici, et couvert
 * par `price-line.spec.ts` et `resolve-price.spec.ts` : la composition des
 * étages, l'arbitrage de spécificité, l'arrondi unique.
 *
 * Ce qui EST le sujet, et que rien d'autre ne couvre :
 *
 * - **la surface** — ce qu'elle accepte, ce qu'elle refuse, ce qu'elle rend ;
 * - **la traversée de la trace** — une façade qui aplatirait `steps` rendrait
 *   la chaîne indéfendable, et rien ne rougirait ;
 * - **l'ordre et la complétude** d'un lot de plusieurs articles ;
 * - **l'instant** — que `at` soit réellement lu, et que l'horloge injectée
 *   serve quand il est absent.
 *
 * Les ports sont doublés par de vraies sous-classes, jamais par un cast : un
 * doublé qui dérive du port qu'il prétend jouer ne fait rougir personne.
 */
import type { OrderLineAllergens, OrderLimitSpec } from "@lfd/contracts";
import {
  catalogueArticle,
  type CatalogArticle,
} from "../../../catalog/domain/catalogue-article.js";
import { millicentsFromCents } from "@lfd/money";

import { Clock } from "../../../../platform/time/clock.js";
import type { Instant } from "../../../../platform/context/request-context.js";
import { PricingMaterialsLoader } from "../pricing-materials.loader.js";
import {
  ProductCatalogReader,
  type CatalogItem,
} from "../../../catalog/domain/ports/product-catalog.reader.js";
import { CompanyMercuriale } from "../../domain/entities/company-mercuriale.js";
import { CompanyMercurialeReader } from "../../domain/ports/company-mercuriale.reader.js";
import { CustomerVolumeReader } from "../../domain/ports/customer-volume.reader.js";
import { PriceFloorReader } from "../../domain/ports/price-floor.reader.js";
import { PriceRuleReader } from "../../domain/ports/price-rule.reader.js";
import { SkuVolumeReader } from "../../domain/ports/sku-volume.reader.js";
import { VolumeCommitmentReader } from "../../domain/ports/volume-commitment.reader.js";
import { VolumeLadderReader } from "../../domain/ports/volume-ladder.reader.js";
import type { PriceRule, ScopedPriceFloor } from "../../domain/price-rule.js";
import { DuplicateArticleError } from "../../domain/pricing-errors.js";
import type { VolumeCommitment } from "../../domain/volume-commitment.js";
import { CanonicalPriceHistoryReader } from "../../../catalog/domain/ports/canonical-price-history.reader.js";
import type { CatalogPricing } from "@lfd/contracts";
import type { VolumeLadder } from "../../domain/volume-ladder.js";
import { EmptyLotError, type PricedLot } from "../priced-lot.js";
import { NoCanonicalPriceAtError, Pricer } from "../pricer.js";

// ── L'instant, et les fenêtres ────────────────────────────────────────────
//
// Les dates sont ABSOLUES ici, et c'est le cas d'exception écrit au §5 de
// `CLAUDE.md` : rien dans ce fichier ne compare une date au calendrier. Toutes
// sont comparées à `NOW`, qui est lui-même une fixture — l'horloge est doublée.
const NOW = new Date("2026-06-15T09:00:00.000Z");
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z");
const BEFORE_NOW = new Date("2026-03-01T00:00:00.000Z");

class FrozenClock extends Clock {
  constructor(private readonly instant: Date) {
    super();
  }
  now(): Instant {
    return this.instant;
  }
}

// ── Le catalogue ──────────────────────────────────────────────────────────

function item(sku: string, cents: number, name = `Article ${sku}`): CatalogItem {
  return {
    sku,
    name,
    unitPriceMillicents: millicentsFromCents(cents),
    vatRate: 5.5,
    category: "viennoiserie",
    allergens: null satisfies OrderLineAllergens | null,
    orderTimeLimit: null satisfies OrderLimitSpec | null,
    // Ce double SCELLE ce qu'il rend, comme la source le fait : c'est ce qui le
    // garde substituable au vrai catalogue. Un double qui rendrait un article
    // non scellé éprouverait un monde que la production ne peut pas produire.
    article: catalogueArticle({
      sku,
      name,
      category: "viennoiserie",
      unitPriceMillicents: millicentsFromCents(cents),
    }),
  };
}

const CATALOGUE: readonly CatalogItem[] = [
  item("CRO-001", 100, "Croissant"),
  item("PAI-001", 200, "Pain"),
  item("CHO-001", 300, "Chocolatine"),
];

class StubCatalog extends ProductCatalogReader {
  resolve(sku: string): Promise<CatalogItem | null> {
    return Promise.resolve(CATALOGUE.find((entry) => entry.sku === sku) ?? null);
  }
  all(): Promise<readonly CatalogItem[]> {
    return Promise.resolve(CATALOGUE);
  }
  resolveMany(skus: readonly string[]): Promise<ReadonlyMap<string, CatalogItem>> {
    return Promise.resolve(
      new Map(
        CATALOGUE.filter((entry) => skus.includes(entry.sku)).map((entry) => [entry.sku, entry]),
      ),
    );
  }
}

const catalog = new StubCatalog();

/**
 * Résout un article **au catalogue**, comme le fait la production.
 *
 * La porte prend des `CatalogArticle` scellés et non des SKU : c'est l'appelant
 * qui a déjà lu son catalogue, et le sceau ne se pose que là. Fabriquer
 * l'article dans la fixture éprouverait un monde que la production ne produit
 * pas — d'où ce détour par le double du port.
 */
async function articleOf(sku: string): Promise<CatalogArticle> {
  const found = await catalog.resolve(sku);
  if (found === null) {
    throw new Error(`Le catalogue doublé ne connaît pas « ${sku} ».`);
  }
  return found.article;
}

/** Charge un lot pour ces SKU du catalogue doublé, dans l'ordre donné. */
async function lotOf(
  pricer: Pricer,
  lines: readonly { readonly sku: string; readonly quantity: number }[],
  companyId: string | null,
  at?: Date,
): Promise<PricedLot> {
  const articles = await Promise.all(
    lines.map(async (line) => ({
      article: await articleOf(line.sku),
      quantity: line.quantity,
    })),
  );
  return pricer.load({ articles, companyId, at });
}

/** Le même lot, mais pour une question qui ne prouve rien. */
async function unprovenLotOf(
  pricer: Pricer,
  lines: readonly { readonly sku: string; readonly quantity: number }[],
  companyId: string | null,
): Promise<PricedLot> {
  const articles = await Promise.all(
    lines.map(async (line) => ({
      article: await articleOf(line.sku),
      quantity: line.quantity,
    })),
  );
  return pricer.load({ articles, companyId, lens: "unproven" });
}

// ── Les matériaux ─────────────────────────────────────────────────────────

class StubRules extends PriceRuleReader {
  /** Les instants auxquels ce port a été interrogé — c'est ce qui prouve que `at` porte. */
  readonly seenAt: Date[] = [];

  constructor(private readonly rules: readonly PriceRule[] = []) {
    super();
  }
  inScopes(scopes: { readonly at: Date }): Promise<PriceRule[]> {
    this.seenAt.push(scopes.at);
    return Promise.resolve([...this.rules]);
  }
  /**
   * ⚠️ La relecture datée n'emprunte PAS `inScopes` : `inScopesAt` est concrète
   * sur le port et passe par `listAll(at)`, hors cache et rangées comprises.
   * L'instant se note donc ici aussi, sans quoi `seenAt` ne verrait que les
   * questions du présent — et le cas qui prouve que `at` porte deviendrait muet.
   */
  listAll(at: Date): Promise<PriceRule[]> {
    this.seenAt.push(at);
    return Promise.resolve([...this.rules]);
  }
  listArchived(): Promise<PriceRule[]> {
    return Promise.resolve([]);
  }
}

class StubFloors extends PriceFloorReader {
  constructor(private readonly floors: readonly ScopedPriceFloor[] = []) {
    super();
  }
  inScopes(): Promise<ScopedPriceFloor[]> {
    return Promise.resolve([...this.floors]);
  }
  listAll(): Promise<ScopedPriceFloor[]> {
    return Promise.resolve([...this.floors]);
  }
}

class StubLadders extends VolumeLadderReader {
  constructor(private readonly ladders: readonly VolumeLadder[] = []) {
    super();
  }
  inScopes(): Promise<VolumeLadder[]> {
    return Promise.resolve([...this.ladders]);
  }
  listAll(): Promise<VolumeLadder[]> {
    return Promise.resolve([...this.ladders]);
  }
}

/**
 * Une mercuriale et **sa fenêtre**, tenue à côté d'elle.
 *
 * L'agrégat n'expose pas `validFrom` / `validTo` : la fenêtre est une clause
 * SQL chez le vrai lecteur, pas une lecture du domaine. Le doublé porte donc la
 * sienne plutôt que de fabriquer un accesseur que la production n'a pas.
 */
interface PosedMercuriale {
  readonly companyId: string;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly mercuriale: CompanyMercuriale;
}

class StubMercuriales extends CompanyMercurialeReader {
  /** Les couples (client, instant) demandés : la preuve qu'un visiteur n'en fait lire aucune. */
  readonly asked: { companyId: string | null; at: Date }[] = [];

  constructor(private readonly posed: readonly PosedMercuriale[] = []) {
    super();
  }
  liveFor(companyId: string | null, at: Date): Promise<CompanyMercuriale | null> {
    this.asked.push({ companyId, at });
    if (companyId === null) {
      return Promise.resolve(null);
    }
    return Promise.resolve(
      this.posed.find(
        (entry) =>
          entry.companyId === companyId &&
          entry.validFrom.getTime() <= at.getTime() &&
          (entry.validTo === null || entry.validTo.getTime() > at.getTime()),
      )?.mercuriale ?? null,
    );
  }
  /**
   * Le doublé rend la MÊME chose aux deux questions : ces cas n'éprouvent pas
   * la relecture datée, et faire diverger les deux réponses ici cacherait un
   * appelant qui se serait trompé de méthode.
   */
  liveAsOf(companyId: string | null, at: Date): Promise<CompanyMercuriale | null> {
    return this.liveFor(companyId, at);
  }
  listFor(): Promise<readonly CompanyMercuriale[]> {
    return Promise.resolve(this.posed.map((entry) => entry.mercuriale));
  }
  liveEverywhere(): Promise<readonly CompanyMercuriale[]> {
    return Promise.resolve(this.posed.map((entry) => entry.mercuriale));
  }
}

class StubCommitments extends VolumeCommitmentReader {
  /** Les clients pour lesquels un engagement a été demandé. */
  readonly asked: (string | null)[] = [];

  constructor(private readonly commitments: readonly VolumeCommitment[] = []) {
    super();
  }
  liveFor(companyId: string | null): Promise<readonly VolumeCommitment[]> {
    this.asked.push(companyId);
    return Promise.resolve(companyId === null ? [] : this.commitments);
  }
  /** Même réponse : la relecture datée n'est pas le sujet de ces cas. */
  liveAsOf(companyId: string | null): Promise<readonly VolumeCommitment[]> {
    return this.liveFor(companyId);
  }
}

class StubCustomerVolumes extends CustomerVolumeReader {
  /**
   * Les fenêtres de MESURE demandées — c'est ce qui prouve que le cumul est
   * borné à l'instant de la question, et non à la fin de l'engagement.
   */
  readonly windows: { from: Date; to: Date }[] = [];

  constructor(private readonly volumes: ReadonlyMap<string, number> = new Map()) {
    super();
  }
  volumesFor(
    _companyId: string,
    _skus: readonly string[],
    window: { readonly from: Date; readonly to: Date },
  ): Promise<ReadonlyMap<string, number>> {
    this.windows.push({ from: window.from, to: window.to });
    return Promise.resolve(this.volumes);
  }
}

/**
 * L'historique du tarif canonique.
 *
 * Par défaut il rend **le tarif d'aujourd'hui** pour chaque article du
 * catalogue : les cas de ce fichier n'éprouvent pas la dérive du canonique, et
 * leur faire refuser une relecture faute d'historique déplacerait leur sujet.
 *
 * Un cas qui veut prouver que le canonique est bien daté passe `pastPrices`.
 */
class StubPriceHistory extends CanonicalPriceHistoryReader {
  constructor(private readonly past: ReadonlyMap<string, number> | null = null) {
    super();
  }
  pricingAt(): Promise<ReadonlyMap<string, CatalogPricing>> {
    const prices =
      this.past ??
      new Map(CATALOGUE.map((entry) => [entry.sku, entry.unitPriceMillicents] as const));
    return Promise.resolve(
      new Map(
        [...prices].map(([sku, unitPriceMillicents]) => [
          sku,
          { sku, unitPriceMillicents, vatRatePercent: 5.5 },
        ]),
      ),
    );
  }
  startsAt(): Promise<Date | null> {
    return Promise.resolve(LONG_AGO);
  }
}

class StubSkuVolumes extends SkuVolumeReader {
  volumesFor(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(new Map());
  }
}

interface Doubles {
  readonly rules: StubRules;
  readonly mercuriales: StubMercuriales;
  readonly commitments: StubCommitments;
  readonly volumes: StubCustomerVolumes;
}

function pricerWith(
  parts: {
    rules?: readonly PriceRule[];
    floors?: readonly ScopedPriceFloor[];
    ladders?: readonly VolumeLadder[];
    mercuriales?: readonly PosedMercuriale[];
    commitments?: readonly VolumeCommitment[];
    ordered?: ReadonlyMap<string, number>;
    /** Le tarif canonique À LA DATE, quand un cas veut prouver qu'il est daté. */
    pastPrices?: ReadonlyMap<string, number>;
  } = {},
): { pricer: Pricer; doubles: Doubles } {
  const rules = new StubRules(parts.rules ?? []);
  const mercuriales = new StubMercuriales(parts.mercuriales ?? []);
  const commitments = new StubCommitments(parts.commitments ?? []);
  const volumes = new StubCustomerVolumes(parts.ordered ?? new Map());
  const loader = new PricingMaterialsLoader(
    rules,
    mercuriales,
    new StubFloors(parts.floors ?? []),
    new StubSkuVolumes(),
    new StubLadders(parts.ladders ?? []),
    commitments,
    volumes,
  );
  return {
    pricer: new Pricer(
      loader,
      new FrozenClock(NOW),
      new StubPriceHistory(parts.pastPrices ?? null),
    ),
    doubles: { rules, mercuriales, commitments, volumes },
  };
}

// ── Des matériaux tout faits ──────────────────────────────────────────────

/** Une promotion de −10 % sur tout le catalogue, ouverte à tous. */
const TEN_PERCENT_OFF: PriceRule = {
  id: "rule_promo",
  stage: "promotion",
  scope: { type: "global", id: null },
  audience: { type: "all", id: null },
  minQuantity: null,
  validFrom: LONG_AGO,
  validTo: null,
  suspendedFrom: null,
  label: "Promotion de printemps",
  stacksOverMercuriale: false,
  nature: "alter",
  alteration: { direction: "decrease", mode: "percent", bp: 1_000 },
};

/** Un barème qui s'ouvre dès la dixième pièce, sur le croissant. */
const LADDER_FROM_TEN: VolumeLadder = {
  id: "ladder_ten",
  scope: { type: "product", id: "CRO-001" },
  audience: { type: "all", id: null },
  unit: "percent",
  tiers: [{ minQuantity: 10, value: 2_000 }],
  label: "Barème dix pièces",
  validFrom: LONG_AGO,
  validTo: null,
  suspendedFrom: null,
};

/** La mercuriale d'un client : le croissant à 0,80 € ferme, dès la première pièce. */
function mercurialeFor(
  companyId: string,
  cents: number,
  validTo: Date | null = null,
): PosedMercuriale {
  return {
    companyId,
    validFrom: LONG_AGO,
    validTo,
    mercuriale: CompanyMercuriale.pose(
      `merc_${companyId}`,
      {
        companyId,
        label: "Mercuriale 2026",
        lines: [
          {
            sku: "CRO-001",
            tiers: [{ minQuantity: 1, unitPriceMillicents: millicentsFromCents(cents) }],
          },
        ],
        validFrom: LONG_AGO,
        validTo,
      },
      "staff_e2e",
    ),
  };
}

// Le refus d'un SKU que le catalogue ne connaît pas n'appartient plus à cette
// porte : il vit dans `ProductCatalogReader` (et l'`UnknownSkuError` que ses
// appelants lèvent), qui a ses propres tests.
describe("Pricer.load — le prix d'un article", () => {
  it("rend le tarif catalogue quand rien ne le touche", async () => {
    const { pricer } = pricerWith();

    const lot = await lotOf(pricer, [{ sku: "CRO-001", quantity: 1 }], null);

    expect(lot.price("CRO-001", 1)).toMatchObject({
      sku: "CRO-001",
      name: "Croissant",
      canonicalMillicents: millicentsFromCents(100),
      finalMillicents: millicentsFromCents(100),
      quantity: 1,
      steps: [],
      sealedByRuleId: null,
      floored: false,
      clampedToZero: false,
      floorMillicents: null,
    });
  });

  /**
   * 🔴 **La trace traverse la façade intacte.**
   *
   * Sans ce cas, rien n'empêcherait la porte de n'emporter que le chiffre —
   * ce qui serait plus commode, et supprimerait la propriété qui fait la valeur
   * de toute la chaîne : pouvoir défendre un prix six mois plus tard, quand la
   * règle qui l'a produit a été retirée.
   */
  it("🔴 emporte la trace, pas seulement le chiffre", async () => {
    const { pricer } = pricerWith({ rules: [TEN_PERCENT_OFF] });

    const lot = await lotOf(pricer, [{ sku: "CRO-001", quantity: 1 }], null);

    const priced = lot.price("CRO-001", 1);
    expect(priced.finalMillicents).toBe(millicentsFromCents(90));
    expect(priced.steps).toHaveLength(1);
    expect(priced.steps[0]).toMatchObject({
      stage: "promotion",
      ruleId: "rule_promo",
      label: "Promotion de printemps",
      resultMillicents: millicentsFromCents(90),
    });
  });

  /**
   * 🔴 **La quantité change le prix — donc elle ne peut pas avoir de défaut.**
   *
   * C'est la raison écrite de la rendre obligatoire : un défaut à `1` aurait
   * rendu 0,90 € ici, un chiffre parfaitement plausible et faux d'un cinquième.
   */
  it("🔴 lit la quantité : le barème ne s'ouvre qu'au dixième article", async () => {
    const { pricer } = pricerWith({ ladders: [LADDER_FROM_TEN] });

    const lot = await lotOf(pricer, [{ sku: "CRO-001", quantity: 1 }], null);

    expect(lot.price("CRO-001", 1).finalMillicents).toBe(millicentsFromCents(100));
    expect(lot.price("CRO-001", 10).finalMillicents).toBe(millicentsFromCents(80));
  });

  /**
   * La mercuriale **scelle** : la promotion publique ne s'ajoute pas au tarif
   * négocié. C'est la décision du 2026-08-18, et la façade doit la porter
   * puisqu'elle appelle la même recette.
   */
  it("scelle la chaîne quand le client a une mercuriale", async () => {
    const { pricer } = pricerWith({
      rules: [TEN_PERCENT_OFF],
      mercuriales: [mercurialeFor("cmp_1", 80)],
    });

    const lot = await lotOf(pricer, [{ sku: "CRO-001", quantity: 1 }], "cmp_1");

    const priced = lot.price("CRO-001", 1);
    expect(priced.finalMillicents).toBe(millicentsFromCents(80));
    expect(priced.sealedByRuleId).toBe("merc_cmp_1");
    expect(priced.sealedRuleIds).toContain("rule_promo");
  });

  /**
   * 🔴 **Sans société, aucune mercuriale n'est LUE.**
   *
   * Pas seulement « aucune n'est appliquée » : le port n'a rien à interroger.
   * L'assertion porte donc sur ce qui a été demandé, et pas sur le prix rendu —
   * un prix juste ne prouverait pas qu'on n'est pas allé chercher le tarif
   * négocié de quelqu'un d'autre.
   */
  it("🔴 ne lit aucune mercuriale pour un visiteur sans société", async () => {
    const { pricer, doubles } = pricerWith({ mercuriales: [mercurialeFor("cmp_1", 80)] });

    const lot = await lotOf(pricer, [{ sku: "CRO-001", quantity: 1 }], null);

    expect(lot.price("CRO-001", 1).finalMillicents).toBe(millicentsFromCents(100));
    expect(doubles.mercuriales.asked).toEqual([{ companyId: null, at: NOW }]);
    expect(doubles.commitments.asked).toEqual([null]);
  });

  /**
   * 🔴 **`unproven` n'interroge pas les engagements** — elle ne les écarte pas
   * après coup, elle ne les lit pas.
   *
   * C'est ce que la lentille achète. La projection payait cette lecture puis
   * l'ignorait : `priceAtCumulative` ne consulte aucun engagement, mais le
   * chargeur, lui, en demandait quand même. La décision « quelles preuves sont
   * recevables » vivait dans la méthode qui pose la question, donc trop tard
   * pour éviter la requête (2026-09-09).
   */
  it("🔴 ne lit AUCUN engagement pour une question qui ne prouve rien", async () => {
    const { pricer, doubles } = pricerWith();

    await unprovenLotOf(pricer, [{ sku: "CRO-001", quantity: 1 }], "cmp_1");

    expect(doubles.commitments.asked).toEqual([]);
    // La mercuriale, elle, reste lue : un tarif négocié n'est pas une preuve à
    // prouver, c'est une décision déjà prise pour ce client.
    expect(doubles.mercuriales.asked).toHaveLength(1);
  });

  it("ne prend pas la mercuriale d'un AUTRE client", async () => {
    const { pricer } = pricerWith({ mercuriales: [mercurialeFor("cmp_1", 80)] });

    const lot = await lotOf(pricer, [{ sku: "CRO-001", quantity: 1 }], "cmp_2");

    const priced = lot.price("CRO-001", 1);
    expect(priced.finalMillicents).toBe(millicentsFromCents(100));
    expect(priced.sealedByRuleId).toBeNull();
  });
});

describe("Pricer.load — l'instant", () => {
  it("résout à l'horloge injectée quand `at` est absent", async () => {
    const { pricer, doubles } = pricerWith();

    await lotOf(pricer, [{ sku: "CRO-001", quantity: 1 }], null);

    expect(doubles.rules.seenAt).toEqual([NOW]);
  });

  /**
   * 🔴 **`at` est réellement lu, et pas seulement accepté.**
   *
   * Une façade qui prendrait `at` et résoudrait quand même à l'horloge rendrait
   * un prix plausible sur la question « que payait-il le 3 mars ? » — le mode de
   * défaillance de tout ce dossier. Le cas le prouve deux fois : sur l'instant
   * transmis aux ports, ET sur un tarif négocié qui n'est plus en vigueur
   * aujourd'hui mais l'était à cette date-là.
   */
  it("🔴 relit un prix à une date passée, mercuriale expirée comprise", async () => {
    const expired = mercurialeFor("cmp_1", 80, new Date("2026-04-01T00:00:00.000Z"));
    const { pricer, doubles } = pricerWith({ mercuriales: [expired] });

    const today = await lotOf(pricer, [{ sku: "CRO-001", quantity: 1 }], "cmp_1");
    const back = await lotOf(pricer, [{ sku: "CRO-001", quantity: 1 }], "cmp_1", BEFORE_NOW);

    expect(today.price("CRO-001", 1).finalMillicents).toBe(millicentsFromCents(100));
    expect(back.price("CRO-001", 1).finalMillicents).toBe(millicentsFromCents(80));
    expect(doubles.rules.seenAt).toEqual([NOW, BEFORE_NOW]);
  });
});

describe("Pricer.load — plusieurs articles", () => {
  /**
   * 🔴 **Un seul chargement, quel que soit le nombre d'articles.**
   *
   * C'est la méthode qui empêche la façade de devenir le problème qu'elle
   * prétend résoudre : un chargement par article réintroduirait le N+1 que
   * `materialsOf` existe pour empêcher. Le compte des sollicitations le dit
   * ici ; le budget e2e le mesure sur la vraie base.
   */
  it("🔴 ne charge qu'une fois pour trois articles", async () => {
    const { pricer, doubles } = pricerWith({ rules: [TEN_PERCENT_OFF] });

    await lotOf(
      pricer,
      [
        { sku: "CRO-001", quantity: 1 },
        { sku: "PAI-001", quantity: 1 },
        { sku: "CHO-001", quantity: 1 },
      ],
      "cmp_1",
    );

    expect(doubles.rules.seenAt).toEqual([NOW]);
    expect(doubles.mercuriales.asked).toHaveLength(1);
    expect(doubles.commitments.asked).toHaveLength(1);
  });

  /**
   * 🔴 **L'ordre rendu est l'ordre demandé.**
   *
   * La caisse fusionne ses lignes par SKU et rend donc l'ordre de SA fusion.
   * Les deux coïncident aujourd'hui ; s'en remettre à cette coïncidence rendrait
   * la promesse fausse au premier changement de la fusion — et un prix attribué
   * au mauvais article ne se voit pas.
   */
  it("🔴 rend les articles dans l'ordre demandé", async () => {
    const { pricer } = pricerWith();
    const lines = [
      { sku: "CHO-001", quantity: 1 },
      { sku: "CRO-001", quantity: 1 },
      { sku: "PAI-001", quantity: 1 },
    ];

    const lot = await lotOf(pricer, lines, null);

    const priced = lot.all(lines);
    expect(priced.map((article) => article.sku)).toEqual(["CHO-001", "CRO-001", "PAI-001"]);
    expect(priced.map((article) => article.finalMillicents)).toEqual([
      millicentsFromCents(300),
      millicentsFromCents(100),
      millicentsFromCents(200),
    ]);
  });

  /**
   * Le même article deux fois est une question **ambiguë** : 5 + 5 font-ils 10
   * — ce que la caisse en fait, parce qu'un palier se juge sur le total — ou
   * deux demandes indépendantes ? Fusionner en silence aurait aussi rendu un
   * tableau plus court que celui demandé.
   */
  it("refuse le même article demandé deux fois", async () => {
    const { pricer } = pricerWith();

    await expect(
      lotOf(
        pricer,
        [
          { sku: "CRO-001", quantity: 5 },
          { sku: "CRO-001", quantity: 5 },
        ],
        null,
      ),
    ).rejects.toBeInstanceOf(DuplicateArticleError);
  });

  /**
   * Un lot vide est **refusé**, et non servi vide : charger des matériaux pour
   * zéro article rend un tarificateur auquel on ne peut plus rien demander. Le
   * refus est ici, plutôt qu'une lecture qui ne coûte rien, pour que l'appelant
   * qui peut avoir un panier vide le teste **avant** de charger.
   */
  it("refuse un lot vide", async () => {
    const { pricer, doubles } = pricerWith();

    await expect(pricer.load({ articles: [], companyId: "cmp_1" })).rejects.toBeInstanceOf(
      EmptyLotError,
    );
    expect(doubles.rules.seenAt).toEqual([]);
  });

  /**
   * Chaque article porte **sa** quantité : le barème s'ouvre pour l'un et pas
   * pour l'autre, dans le même appel. Une façade qui aurait hissé la quantité au
   * niveau de la demande aurait rendu ce cas inexprimable.
   */
  it("résout chaque article à SA quantité", async () => {
    const { pricer } = pricerWith({ ladders: [LADDER_FROM_TEN] });
    const lines = [
      { sku: "CRO-001", quantity: 12 },
      { sku: "PAI-001", quantity: 1 },
    ];

    const lot = await lotOf(pricer, lines, null);

    const priced = lot.all(lines);
    expect(priced[0]).toMatchObject({
      sku: "CRO-001",
      quantity: 12,
      finalMillicents: millicentsFromCents(80),
    });
    expect(priced[1]).toMatchObject({ sku: "PAI-001", quantity: 1 });
  });
});

/**
 * 🔴 **Le cumul se mesure jusqu'à la QUESTION, pas jusqu'à la fin de
 * l'engagement.**
 *
 * La fenêtre d'un engagement est aussi sa fenêtre de mesure. Compter jusqu'à sa
 * fin sur une relecture datée revenait à répondre « ce qu'il payait le 3 mars »
 * avec un palier qu'il n'a atteint qu'en novembre — un prix **plausible**, et
 * faux, que rien ne signalait. Même famille que R15 : une preuve qu'on n'était
 * pas en mesure de mesurer à cette date.
 *
 * ⚠️ Le cas du présent compte autant, et il faut le dire juste : la fenêtre y
 * est bornée elle aussi, à l'instant courant. Ce qui ne change pas, c'est le
 * RÉSULTAT — le cumul se compte sur `order.createdAt`, et aucune commande n'est
 * créée dans le futur.
 */
describe("Pricer.load — la fenêtre de mesure du cumul", () => {
  const COMMITMENT: VolumeCommitment = {
    id: "cmt_1",
    companyId: "cmp_1",
    scope: { type: "global", id: null },
    promisedQuantity: 5_000,
    validFrom: LONG_AGO,
    validTo: new Date("2026-12-31T00:00:00.000Z"),
  };

  it("borne la mesure à l'instant demandé sur une relecture", async () => {
    const { pricer, doubles } = pricerWith({ commitments: [COMMITMENT] });

    await lotOf(pricer, [{ sku: "CRO-001", quantity: 1 }], "cmp_1", BEFORE_NOW);

    expect(doubles.volumes.windows).toEqual([{ from: LONG_AGO, to: BEFORE_NOW }]);
  });

  /**
   * Au présent aussi la fenêtre est bornée — à `NOW`, et non au terme de
   * l'engagement. **L'effet, lui, est nul** : le cumul se compte sur
   * `order.createdAt`, et aucune commande n'est créée dans le futur. Dit ainsi
   * plutôt que « ça ne change rien au présent », qui serait faux de la fenêtre
   * et vrai seulement du résultat.
   */
  it("borne aussi au présent — sans effet, faute de commande à venir", async () => {
    const { pricer, doubles } = pricerWith({ commitments: [COMMITMENT] });

    await lotOf(pricer, [{ sku: "CRO-001", quantity: 1 }], "cmp_1");

    expect(doubles.volumes.windows).toEqual([{ from: LONG_AGO, to: NOW }]);
  });
});

/**
 * 🔴 **Le tarif d'entrée aussi se lit à la date.**
 *
 * C'était la dernière entrée fausse d'une reconstitution datée. Toutes les
 * décisions — règles, barèmes, mercuriale, engagements — étaient relues à leur
 * date, mais l'article restait scellé au tarif d'**aujourd'hui**. Le lot
 * combinait donc les décisions d'alors avec le prix d'entrée du jour : une
 * remise de 10 % appliquée au bon pourcentage, sur le mauvais nombre.
 *
 * La faute ne se voit pas — elle rend un prix plausible.
 */
describe("Pricer.load — le tarif canonique à la date", () => {
  it("rescelle l'article au tarif d'alors, pas à celui d'aujourd'hui", async () => {
    const { pricer } = pricerWith({
      pastPrices: new Map([["CRO-001", millicentsFromCents(80)]]),
    });

    const lot = await lotOf(pricer, [{ sku: "CRO-001", quantity: 1 }], null, BEFORE_NOW);

    // 80 c en mars, contre 100 c au catalogue d'aujourd'hui.
    expect(lot.price("CRO-001", 1).finalMillicents).toBe(millicentsFromCents(80));
    expect(lot.price("CRO-001", 1).canonicalMillicents).toBe(millicentsFromCents(80));
  });

  /**
   * 🔴 **Sans trace, on REFUSE** — jamais le tarif du jour à la place.
   *
   * C'est la doctrine que `CanonicalPriceHistoryReader` porte déjà : « rendre le
   * prix d'aujourd'hui à sa place serait exactement le mensonge que cet
   * historique existe pour supprimer ». Un prix inventé pour une date qu'on ne
   * couvre pas serait indistinguable d'un prix vrai.
   */
  it("refuse un article dont l'historique ne connaît pas le tarif à cette date", async () => {
    const { pricer } = pricerWith({ pastPrices: new Map() });

    await expect(
      lotOf(pricer, [{ sku: "CRO-001", quantity: 1 }], null, BEFORE_NOW),
    ).rejects.toBeInstanceOf(NoCanonicalPriceAtError);
  });

  it("ne rescelle RIEN au présent : le sceau de l'appelant fait foi", async () => {
    const { pricer } = pricerWith({
      pastPrices: new Map([["CRO-001", millicentsFromCents(80)]]),
    });

    const lot = await lotOf(pricer, [{ sku: "CRO-001", quantity: 1 }], null);

    expect(lot.price("CRO-001", 1).finalMillicents).toBe(millicentsFromCents(100));
  });
});
