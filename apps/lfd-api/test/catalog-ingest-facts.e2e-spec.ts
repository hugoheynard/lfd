/**
 * E2E — **ce que chaque fait transporte** du référentiel jusqu'au miroir B2B.
 *
 * Sœur de `catalog-ingest.e2e-spec.ts`, qui éprouve ce que l'ingestion ÉCRIT :
 * les compteurs, les retraits, ce qu'elle ne cascade pas. Ici on ne regarde
 * qu'une chose à la fois — le taux, les allergènes, les mentions d'étiquette,
 * les limites de commande — et on la suit d'un bout à l'autre du fil.
 *
 * Le découpage est venu d'un fichier à 604 lignes contre une convention à ≲300.
 * Il ne coupe pas au milieu : les deux moitiés répondent à deux questions
 * différentes, et c'est cette frontière-là qu'on suit.
 */
import { type CatalogSnapshot, type SyncOrderTimeLimitRule } from "@lfd/catalog-sync";

import { B2bCatalogDriver } from "../src/pim/channels/b2b-platform/products/driver.js";
import { CATEGORY, snapshotOf } from "./catalog-ingest-fixtures.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  // Comme sa sœur : ces suites mesurent ce qu'une INGESTION dépose, elles
  // doivent donc partir d'un catalogue vide. Le harnais en sème un depuis la
  // bascule (il est l'autorité de prix du checkout).
  await ctx.prisma.catalogPriceHistory.deleteMany();
  await ctx.prisma.catalogItem.deleteMany();
  await ctx.prisma.catalogCategory.deleteMany();
});

function push(body: CatalogSnapshot) {
  return ctx.app.get(B2bCatalogDriver).send(body, {
    revisionId: "rev_e2e",
    fingerprint: "empreinte-e2e",
  });
}

describe("le taux de TVA arrive sur l’ARTICLE", () => {
  /**
   * Le défaut corrigé : la boutique retrouvait le taux en rejoignant la
   * famille, donc la ligne facturée dépendait d'une jointure et d'un
   * rafraîchissement de famille réussi. Un article se vend seul ; il doit
   * pouvoir se facturer seul.
   */
  it("écrit le taux reçu sur la ligne d’article", async () => {
    await push(snapshotOf([{ sku: "VIE-002", priceMillicents: 220_000, vatRatePercent: 20 }]));

    const item = await ctx.prisma.catalogItem.findUniqueOrThrow({ where: { sku: "VIE-002-1" } });

    expect(item.vatRatePercent?.toNumber()).toBe(20);
  });

  /** Famille non réglée dans le référentiel : l'article entre sans taux. */
  it("laisse le taux vide quand le référentiel n’en a pas", async () => {
    await push(snapshotOf([{ sku: "VIE-003", priceMillicents: 240_000, vatRatePercent: null }]));

    const item = await ctx.prisma.catalogItem.findUniqueOrThrow({ where: { sku: "VIE-003-1" } });

    expect(item.vatRatePercent).toBeNull();
  });
});

describe("les allergènes traversent le fil", () => {
  /**
   * Les trois états doivent arriver DISTINCTS jusqu'à la colonne. C'est la
   * seule faute qui compte sur ce champ : confondre « rien n'a été déclaré »
   * avec « rien ne s'y trouve », c'est afficher un oubli de saisie comme une
   * promesse au consommateur.
   */
  it("distingue « pas de fiche », « fiche vide » et « des codes »", async () => {
    await push(
      snapshotOf([
        { sku: "ALG-001", priceMillicents: 100_000, allergens: ["AW", "AM"] },
        { sku: "ALG-002", priceMillicents: 100_000, allergens: [] },
        { sku: "ALG-003", priceMillicents: 100_000, allergens: null },
      ]),
    );

    const rows = await ctx.prisma.catalogItem.findMany({
      where: { sku: { in: ["ALG-001-1", "ALG-002-1", "ALG-003-1"] } },
      orderBy: { sku: "asc" },
      select: { sku: true, allergens: true },
    });

    expect(rows.map((row) => row.allergens)).toEqual([["AW", "AM"], [], null]);
  });

  it("efface la fiche quand le PIM la retire", async () => {
    // Un `undefined` laisserait la colonne inchangée sur l'upsert, et l'article
    // garderait des allergènes que le référentiel ne déclare plus.
    await push(snapshotOf([{ sku: "ALG-004", priceMillicents: 100_000, allergens: ["AW"] }]));
    await push(snapshotOf([{ sku: "ALG-004", priceMillicents: 100_000, allergens: null }]));

    const row = await ctx.prisma.catalogItem.findUnique({
      where: { sku: "ALG-004-1" },
      select: { allergens: true },
    });

    expect(row?.allergens).toBeNull();
  });
});

/**
 * **Les mentions d'étiquette arrivent projetées** (D6, v5 du fil).
 *
 * La plateforme n'a plus le référentiel réglementaire : elle range ce que le
 * PIM lui envoie, `incomplete` compris. Le vrai SQL compte ici — c'est une
 * colonne `jsonb` de plus, et le repli `DbNull` de l'upsert est exactement ce
 * qui empêche une fiche retirée de laisser des mentions derrière elle.
 */
describe("les mentions d’étiquette traversent le fil", () => {
  const MENTIONS = {
    labels: [{ category: "gluten", label: "Céréales contenant du gluten" }],
    incomplete: false,
  };

  it("écrit les mentions à côté des codes, sans les remplacer", async () => {
    await push(
      snapshotOf([
        {
          sku: "LBL-001",
          priceMillicents: 100_000,
          allergens: ["UW"],
          allergenLabels: MENTIONS,
        },
      ]),
    );

    const row = await ctx.prisma.catalogItem.findUniqueOrThrow({
      where: { sku: "LBL-001-1" },
      select: { allergens: true, allergenLabels: true },
    });

    expect(row.allergens).toEqual(["UW"]);
    expect(row.allergenLabels).toEqual(MENTIONS);
  });

  /**
   * Le drapeau doit survivre au transport : sans lui, l'écran lirait une liste
   * vide comme « sans allergène » sur un article qui déclare la noix de coco.
   */
  it("conserve l’aveu d’une liste amputée", async () => {
    await push(
      snapshotOf([
        {
          sku: "LBL-002",
          priceMillicents: 100_000,
          allergens: ["SO"],
          allergenLabels: { labels: [], incomplete: true },
        },
      ]),
    );

    const row = await ctx.prisma.catalogItem.findUniqueOrThrow({
      where: { sku: "LBL-002-1" },
      select: { allergenLabels: true },
    });

    expect(row.allergenLabels).toEqual({ labels: [], incomplete: true });
  });

  it("efface les mentions quand le PIM retire la fiche", async () => {
    await push(
      snapshotOf([
        {
          sku: "LBL-003",
          priceMillicents: 100_000,
          allergens: ["UW"],
          allergenLabels: MENTIONS,
        },
      ]),
    );
    await push(
      snapshotOf([
        { sku: "LBL-003", priceMillicents: 100_000, allergens: null, allergenLabels: null },
      ]),
    );

    const row = await ctx.prisma.catalogItem.findUniqueOrThrow({
      where: { sku: "LBL-003-1" },
      select: { allergenLabels: true },
    });

    expect(row.allergenLabels).toBeNull();
  });
});

/**
 * **L'échelle des limites traverse ; sa résolution arrive** (v7 du fil).
 *
 * Ce que seul ce niveau prouve : les colonnes `order_limit_*` du miroir sont
 * remplies par une DESCENTE faite à l'ingestion, à partir de quelques règles —
 * là où la v6 recopiait une valeur toute faite sur chaque déclinaison, si bien
 * que passer la limite globale de 18 h à 16 h réécrivait le catalogue entier.
 *
 * Un test du service verrait la descente ; il ne verrait ni ce que Postgres
 * garde, ni que les trois colonnes restent vides quand personne n'a rien posé.
 */
describe("les limites de commande traversent le fil, en RÈGLES", () => {
  function rule(
    scope: SyncOrderTimeLimitRule["scope"],
    values: Omit<SyncOrderTimeLimitRule, "scope">,
  ): SyncOrderTimeLimitRule {
    return { scope, ...values };
  }

  /** L'échelle se pose sur le snapshot, plus sur les déclinaisons. */
  function withLimits(
    base: CatalogSnapshot,
    orderTimeLimits: readonly SyncOrderTimeLimitRule[],
  ): CatalogSnapshot {
    return { ...base, orderTimeLimits: [...orderTimeLimits] };
  }

  function limitOf(sku: string) {
    return ctx.prisma.catalogItem.findUniqueOrThrow({
      where: { sku },
      select: {
        orderLimitDaysBefore: true,
        orderLimitTime: true,
        orderLimitGraceMinutes: true,
      },
    });
  }

  /**
   * 🔴 Le cœur de la v7 : UNE règle globale, aucune limite portée par les
   * déclinaisons, et chaque article ingéré porte la limite résolue.
   */
  it("résout une règle globale sur chaque article ingéré", async () => {
    await push(
      withLimits(
        snapshotOf([
          { sku: "VIE-001", priceMillicents: 200_000 },
          { sku: "VIE-002", priceMillicents: 220_000 },
        ]),
        [rule({ type: "global", id: null }, { daysBefore: 1, time: "18:00", graceMinutes: null })],
      ),
    );

    // `graceMinutes` vaut `0` : le `null` du fil dit « ce rang ne se prononce
    // pas », et pas de rattrapage déclaré signifie limite ferme.
    const attendu = {
      orderLimitDaysBefore: 1,
      orderLimitTime: "18:00",
      orderLimitGraceMinutes: 0,
    };
    expect(await limitOf("VIE-001-1")).toEqual(attendu);
    expect(await limitOf("VIE-002-1")).toEqual(attendu);
  });

  /**
   * L'héritage est **champ par champ**, et il l'est jusqu'ici : la famille ne
   * redit pas le nombre de jours du global, la déclinaison ne redit pas
   * l'heure de sa famille. Ce cas éprouve au passage le rang « déclinaison »,
   * seul motif pour lequel l'identifiant traverse depuis la v7.
   */
  it("compose les rangs, du global à la déclinaison", async () => {
    await push(
      withLimits(
        snapshotOf([
          { sku: "VIE-001", priceMillicents: 200_000 },
          { sku: "VIE-002", priceMillicents: 220_000 },
        ]),
        [
          rule({ type: "global", id: null }, { daysBefore: 1, time: "18:00", graceMinutes: 30 }),
          rule(
            { type: "category", id: CATEGORY.id },
            { daysBefore: null, time: "16:00", graceMinutes: null },
          ),
          rule(
            { type: "variant", id: "var_VIE-002" },
            { daysBefore: 3, time: null, graceMinutes: null },
          ),
        ],
      ),
    );

    expect(await limitOf("VIE-001-1")).toEqual({
      orderLimitDaysBefore: 1,
      orderLimitTime: "16:00",
      orderLimitGraceMinutes: 30,
    });
    expect(await limitOf("VIE-002-1")).toEqual({
      orderLimitDaysBefore: 3,
      orderLimitTime: "16:00",
      orderLimitGraceMinutes: 30,
    });
  });

  /**
   * Le cas courant, et il doit rester net : aucune règle, donc rien ne ferme.
   * Une valeur inventée ici refuserait des commandes au nom d'une décision que
   * personne n'a prise.
   */
  it("laisse les trois colonnes vides quand l'échelle est vide", async () => {
    await push(snapshotOf([{ sku: "VIE-001", priceMillicents: 200_000 }]));

    expect(await limitOf("VIE-001-1")).toEqual({
      orderLimitDaysBefore: null,
      orderLimitTime: null,
      orderLimitGraceMinutes: null,
    });
  });
});

/**
 * **L'historique du tarif, relu.**
 *
 * Le vrai SQL est indispensable ici : la trace est écrite par un `createMany`
 * dans la transaction de l'article, et relue par un `DISTINCT ON`. Ce que ces
 * cas tiennent, c'est que les deux emploient la **même clé** — l'article. Ils
 * n'existaient pas, et l'écriture comme la lecture avaient chacune l'air juste
 * en isolation : c'est leur rencontre qui était fausse.
 */
