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
 * - **l'ordre et la complétude** de `forAll` ;
 * - **l'instant** — que `at` soit réellement lu, et que l'horloge injectée
 *   serve quand il est absent.
 *
 * Les ports sont doublés par de vraies sous-classes, jamais par un cast : un
 * doublé qui dérive du port qu'il prétend jouer ne fait rougir personne.
 */
import type { OrderLineAllergens, OrderLimitSpec } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import { Clock } from "../../../../platform/time/clock.js";
import type { Instant } from "../../../../platform/context/request-context.js";
import { UnknownSkuError } from "../../../orders/domain/errors/order-errors.js";
import { PricingMaterialsLoader } from "../pricing-materials.loader.js";
import {
  ProductCatalogReader,
  type CatalogItem,
} from "../../../orders/domain/ports/product-catalog.reader.js";
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
import type { VolumeLadder } from "../../domain/volume-ladder.js";
import { Pricer } from "../pricer.js";

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
  };
}

const CATALOGUE: readonly CatalogItem[] = [
  item("CRO-001", 100, "Croissant"),
  item("PAI-001", 200, "Pain"),
  item("CHO-001", 300, "Chocolatine"),
];

class StubCatalog extends ProductCatalogReader {
  /** Ce que le catalogue a été SOLLICITÉ de résoudre — une lecture par appel. */
  readonly calls: string[][] = [];

  resolve(sku: string): Promise<CatalogItem | null> {
    return Promise.resolve(CATALOGUE.find((entry) => entry.sku === sku) ?? null);
  }
  all(): Promise<readonly CatalogItem[]> {
    return Promise.resolve(CATALOGUE);
  }
  resolveMany(skus: readonly string[]): Promise<ReadonlyMap<string, CatalogItem>> {
    this.calls.push([...skus]);
    return Promise.resolve(
      new Map(
        CATALOGUE.filter((entry) => skus.includes(entry.sku)).map((entry) => [entry.sku, entry]),
      ),
    );
  }
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
  listAll(): Promise<PriceRule[]> {
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
}

class StubCustomerVolumes extends CustomerVolumeReader {
  constructor(private readonly volumes: ReadonlyMap<string, number> = new Map()) {
    super();
  }
  volumesFor(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(this.volumes);
  }
}

class StubSkuVolumes extends SkuVolumeReader {
  volumesFor(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(new Map());
  }
}

interface Doubles {
  readonly catalog: StubCatalog;
  readonly rules: StubRules;
  readonly mercuriales: StubMercuriales;
  readonly commitments: StubCommitments;
}

function pricerWith(
  parts: {
    rules?: readonly PriceRule[];
    floors?: readonly ScopedPriceFloor[];
    ladders?: readonly VolumeLadder[];
    mercuriales?: readonly PosedMercuriale[];
    commitments?: readonly VolumeCommitment[];
    ordered?: ReadonlyMap<string, number>;
  } = {},
): { pricer: Pricer; doubles: Doubles } {
  const catalog = new StubCatalog();
  const rules = new StubRules(parts.rules ?? []);
  const mercuriales = new StubMercuriales(parts.mercuriales ?? []);
  const commitments = new StubCommitments(parts.commitments ?? []);
  const loader = new PricingMaterialsLoader(
    rules,
    mercuriales,
    new StubFloors(parts.floors ?? []),
    new StubSkuVolumes(),
    new StubLadders(parts.ladders ?? []),
    commitments,
    new StubCustomerVolumes(parts.ordered ?? new Map()),
  );
  return {
    pricer: new Pricer(catalog, loader, new FrozenClock(NOW)),
    doubles: { catalog, rules, mercuriales, commitments },
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

describe("Pricer.for — le prix d'un article", () => {
  it("rend le tarif catalogue quand rien ne le touche", async () => {
    const { pricer } = pricerWith();

    const priced = await pricer.for({ sku: "CRO-001", companyId: null, quantity: 1 });

    expect(priced).toMatchObject({
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
   * Sans ce cas, rien n'empêcherait `articleOf` de n'emporter que le chiffre —
   * ce qui serait plus commode, et supprimerait la propriété qui fait la valeur
   * de toute la chaîne : pouvoir défendre un prix six mois plus tard, quand la
   * règle qui l'a produit a été retirée.
   */
  it("🔴 emporte la trace, pas seulement le chiffre", async () => {
    const { pricer } = pricerWith({ rules: [TEN_PERCENT_OFF] });

    const priced = await pricer.for({ sku: "CRO-001", companyId: null, quantity: 1 });

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

    const alone = await pricer.for({ sku: "CRO-001", companyId: null, quantity: 1 });
    const byTen = await pricer.for({ sku: "CRO-001", companyId: null, quantity: 10 });

    expect(alone.finalMillicents).toBe(millicentsFromCents(100));
    expect(byTen.finalMillicents).toBe(millicentsFromCents(80));
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

    const priced = await pricer.for({ sku: "CRO-001", companyId: "cmp_1", quantity: 1 });

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

    const priced = await pricer.for({ sku: "CRO-001", companyId: null, quantity: 1 });

    expect(priced.finalMillicents).toBe(millicentsFromCents(100));
    expect(doubles.mercuriales.asked).toEqual([{ companyId: null, at: NOW }]);
    expect(doubles.commitments.asked).toEqual([null]);
  });

  it("ne prend pas la mercuriale d'un AUTRE client", async () => {
    const { pricer } = pricerWith({ mercuriales: [mercurialeFor("cmp_1", 80)] });

    const priced = await pricer.for({ sku: "CRO-001", companyId: "cmp_2", quantity: 1 });

    expect(priced.finalMillicents).toBe(millicentsFromCents(100));
    expect(priced.sealedByRuleId).toBeNull();
  });

  it("refuse un SKU que le catalogue ne connaît pas", async () => {
    const { pricer } = pricerWith();

    await expect(
      pricer.for({ sku: "INCONNU", companyId: null, quantity: 1 }),
    ).rejects.toBeInstanceOf(UnknownSkuError);
  });
});

describe("Pricer.for — l'instant", () => {
  it("résout à l'horloge injectée quand `at` est absent", async () => {
    const { pricer, doubles } = pricerWith();

    await pricer.for({ sku: "CRO-001", companyId: null, quantity: 1 });

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

    const today = await pricer.for({ sku: "CRO-001", companyId: "cmp_1", quantity: 1 });
    const back = await pricer.for({
      sku: "CRO-001",
      companyId: "cmp_1",
      quantity: 1,
      at: BEFORE_NOW,
    });

    expect(today.finalMillicents).toBe(millicentsFromCents(100));
    expect(back.finalMillicents).toBe(millicentsFromCents(80));
    expect(doubles.rules.seenAt).toEqual([NOW, BEFORE_NOW]);
  });
});

describe("Pricer.forAll — plusieurs articles", () => {
  /**
   * 🔴 **Un seul chargement, quel que soit le nombre d'articles.**
   *
   * C'est la méthode qui empêche la façade de devenir le problème qu'elle
   * prétend résoudre : `for` dans une boucle réintroduirait le N+1 que
   * `materialsOf` existe pour empêcher. Le compte des sollicitations le dit
   * ici ; le budget e2e le mesure sur la vraie base.
   */
  it("🔴 ne charge qu'une fois pour trois articles", async () => {
    const { pricer, doubles } = pricerWith({ rules: [TEN_PERCENT_OFF] });

    await pricer.forAll({
      articles: [
        { sku: "CRO-001", quantity: 1 },
        { sku: "PAI-001", quantity: 1 },
        { sku: "CHO-001", quantity: 1 },
      ],
      companyId: "cmp_1",
    });

    expect(doubles.catalog.calls).toEqual([["CRO-001", "PAI-001", "CHO-001"]]);
    expect(doubles.rules.seenAt).toEqual([NOW]);
    expect(doubles.mercuriales.asked).toHaveLength(1);
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

    const priced = await pricer.forAll({
      articles: [
        { sku: "CHO-001", quantity: 1 },
        { sku: "CRO-001", quantity: 1 },
        { sku: "PAI-001", quantity: 1 },
      ],
      companyId: null,
    });

    expect(priced.map((article) => article.sku)).toEqual(["CHO-001", "CRO-001", "PAI-001"]);
    expect(priced.map((article) => article.finalMillicents)).toEqual([
      millicentsFromCents(300),
      millicentsFromCents(100),
      millicentsFromCents(200),
    ]);
  });

  /**
   * 🔴 **Un SKU inconnu fait échouer l'appel ENTIER.**
   *
   * Il ne raccourcit pas la liste : une liste plus courte que demandée est un
   * écran qui ment par omission, et personne ne compte les lignes.
   */
  it("🔴 échoue en entier sur un SKU inconnu, plutôt que de raccourcir la liste", async () => {
    const { pricer } = pricerWith();

    await expect(
      pricer.forAll({
        articles: [
          { sku: "CRO-001", quantity: 1 },
          { sku: "INCONNU", quantity: 1 },
          { sku: "PAI-001", quantity: 1 },
        ],
        companyId: null,
      }),
    ).rejects.toBeInstanceOf(UnknownSkuError);
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
      pricer.forAll({
        articles: [
          { sku: "CRO-001", quantity: 5 },
          { sku: "CRO-001", quantity: 5 },
        ],
        companyId: null,
      }),
    ).rejects.toBeInstanceOf(DuplicateArticleError);
  });

  /** Une demande vide ne coûte **aucune** lecture — pas même celle du catalogue. */
  it("ne lit rien pour une demande vide", async () => {
    const { pricer, doubles } = pricerWith();

    await expect(pricer.forAll({ articles: [], companyId: "cmp_1" })).resolves.toEqual([]);
    expect(doubles.catalog.calls).toEqual([]);
    expect(doubles.rules.seenAt).toEqual([]);
  });

  /**
   * Chaque article porte **sa** quantité : le barème s'ouvre pour l'un et pas
   * pour l'autre, dans le même appel. Une façade qui aurait hissé la quantité au
   * niveau de la demande aurait rendu ce cas inexprimable.
   */
  it("résout chaque article à SA quantité", async () => {
    const { pricer } = pricerWith({ ladders: [LADDER_FROM_TEN] });

    const priced = await pricer.forAll({
      articles: [
        { sku: "CRO-001", quantity: 12 },
        { sku: "PAI-001", quantity: 1 },
      ],
      companyId: null,
    });

    expect(priced[0]).toMatchObject({
      sku: "CRO-001",
      quantity: 12,
      finalMillicents: millicentsFromCents(80),
    });
    expect(priced[1]).toMatchObject({ sku: "PAI-001", quantity: 1 });
  });
});
