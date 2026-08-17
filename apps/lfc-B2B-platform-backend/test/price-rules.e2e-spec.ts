/**
 * E2E des **règles tarifaires** — sur un vrai Postgres.
 *
 * Deux choses que seul ce niveau prouve, et qu'aucun test unitaire ne peut :
 *
 * 1. la **contrainte d'exclusion** existe et mord. C'est elle qui porte la
 *    garantie « deux règles également spécifiques n'existent pas » ; sans elle,
 *    la fonction pure aurait beau refuser l'ambiguïté, la base l'aurait déjà
 *    laissée entrer ;
 * 2. une règle posée en base **change réellement le prix facturé** au bout de la
 *    chaîne HTTP → handler → drafting → résolution → `order_lines`.
 */
import { PaymentGateway } from "../src/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const SERVICE_DAY = "2026-09-01";
let pickupId = "pickup_absent";

/**
 * Passerelle de paiement doublée : l'intention change à chaque appel, la colonne
 * étant `@unique` — un double constant ferait échouer la deuxième commande et
 * n'apprendrait rien sur le produit.
 */
let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      id: `pi_${String(intentCounter)}`,
      clientSecret: `secret_${String(intentCounter)}`,
    });
  },
  publishableKey: () => "pk_test",
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: PaymentGateway, value: fakeGateway }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const point = await ctx.prisma.pickupAddress.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
});

/** L'acheminement minimal d'une commande valide : un jour de service et un point. */
const pickupContent = (): Record<string, unknown> => ({
  fulfillmentMethod: "pickup",
  pickupAddressId: pickupId,
  requestedDeliveryDate: SERVICE_DAY,
});

/** VIE-001 vaut 200 c dans le catalogue semé — l'autorité de prix actuelle. */
const SKU = "VIE-001";
const CANONICAL = 200;

interface RuleSeed {
  readonly id: string;
  readonly stage: string;
  readonly scopeType?: string;
  readonly scopeId?: string | null;
  readonly audienceType?: string;
  readonly audienceId?: string | null;
  readonly minQuantity?: number | null;
  readonly bp?: number;
  readonly amountCents?: number;
  readonly validFrom?: Date;
  readonly validTo?: Date | null;
}

/** Sème une règle directement : la saisie staff est la slice S3. */
function seedRule(seed: RuleSeed) {
  const alter = seed.amountCents === undefined;
  return ctx.prisma.priceRule.create({
    data: {
      id: seed.id,
      stage: seed.stage,
      nature: alter ? "alter" : "replace",
      scopeType: seed.scopeType ?? "global",
      scopeId: seed.scopeId ?? null,
      audienceType: seed.audienceType ?? "all",
      audienceId: seed.audienceId ?? null,
      minQuantity: seed.minQuantity ?? null,
      amountCents: seed.amountCents ?? null,
      direction: alter ? "decrease" : null,
      mode: alter ? "percent" : null,
      value: alter ? (seed.bp ?? 1000) : null,
      validFrom: seed.validFrom ?? new Date("2026-01-01T00:00:00.000Z"),
      validTo: seed.validTo ?? null,
      label: seed.id,
      createdBy: "e2e",
    },
  });
}

/** Pose un plancher. La saisie staff est la slice S3 ; ici on sème. */
function seedFloor(scopeType: string, scopeId: string | null, cents: number) {
  return ctx.prisma.priceFloor.create({
    data: { scopeType, scopeId, mode: "amount", value: cents, createdBy: "e2e" },
  });
}

function placeOrder(quantity: number) {
  return ctx
    .asSub("auth0|solo")
    .post("/orders")
    .send({ ...pickupContent(), lines: [{ sku: SKU, quantity }] });
}

/** Le prix unitaire réellement écrit sur la ligne — la seule mesure qui compte. */
async function unitPriceOf(orderId: string): Promise<number> {
  const line = await ctx.prisma.orderLine.findFirstOrThrow({ where: { orderId } });
  return line.unitPriceCents;
}

describe("la contrainte d'exclusion", () => {
  it("refuse deux règles également spécifiques aux fenêtres qui se chevauchent", async () => {
    await seedRule({ id: "a", stage: "promotion" });

    await expect(seedRule({ id: "b", stage: "promotion" })).rejects.toThrow();
  });

  /**
   * Le piège que `coalesce` répare : dans une contrainte d'exclusion, NULL
   * n'entre jamais en conflit avec NULL. Sans lui, ce cas — le plus courant de
   * tous — serait passé.
   */
  it("mord AUSSI sur deux règles globales / tous clients", async () => {
    await seedRule({ id: "a", stage: "volume", scopeType: "global", audienceType: "all" });

    await expect(
      seedRule({ id: "b", stage: "volume", scopeType: "global", audienceType: "all" }),
    ).rejects.toThrow();
  });

  it("laisse passer deux règles qui se SUCCÈDENT sans se chevaucher", async () => {
    await seedRule({
      id: "a",
      stage: "promotion",
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: new Date("2026-02-01T00:00:00.000Z"),
    });

    await expect(
      seedRule({ id: "b", stage: "promotion", validFrom: new Date("2026-02-01T00:00:00.000Z") }),
    ).resolves.toBeDefined();
  });

  it("laisse passer deux paliers de volume différents", async () => {
    await seedRule({ id: "50", stage: "volume", minQuantity: 50 });

    await expect(seedRule({ id: "100", stage: "volume", minQuantity: 100 })).resolves.toBeDefined();
  });
});

describe("une règle change le prix facturé", () => {
  it("sans règle, le prix reste celui du catalogue", async () => {
    const response = await placeOrder(1);

    expect(response.status).toBe(201);
    expect(await unitPriceOf(jsonBody<{ id: string }>(response).id)).toBe(CANONICAL);
  });

  it("une remise globale s'applique à la ligne", async () => {
    await seedRule({ id: "promo", stage: "promotion", bp: 1000 });

    const response = await placeOrder(1);

    expect(await unitPriceOf(jsonBody<{ id: string }>(response).id)).toBe(180);
  });

  /**
   * Le palier se mesure sur la quantité **fusionnée**, ce que `resolveLines`
   * fait avant de résoudre. Deux lignes de 60 ouvrent le palier « 100+ » là où
   * aucune ne l'ouvrirait seule — c'est le comportement voulu, et il ne se voit
   * qu'ici.
   */
  it("le palier de volume s'ouvre sur la quantité fusionnée", async () => {
    await seedRule({ id: "vol", stage: "volume", minQuantity: 100, bp: 500 });

    const petit = await placeOrder(50);
    expect(await unitPriceOf(jsonBody<{ id: string }>(petit).id)).toBe(CANONICAL);

    const gros = await ctx
      .asSub("auth0|solo")
      .post("/orders")
      .send({
        ...pickupContent(),
        lines: [
          { sku: SKU, quantity: 60 },
          { sku: SKU, quantity: 60 },
        ],
      });
    expect(await unitPriceOf(jsonBody<{ id: string }>(gros).id)).toBe(190);
  });

  it("deux étages se COMPOSENT, ils ne s'additionnent pas", async () => {
    await seedRule({ id: "vol", stage: "volume", bp: 2000 });
    await seedRule({ id: "promo", stage: "promotion", bp: 1000 });

    const response = await placeOrder(1);

    // 200 × 0,8 × 0,9 = 144. L'addition (−30 %) aurait donné 140.
    expect(await unitPriceOf(jsonBody<{ id: string }>(response).id)).toBe(144);
  });

  it("une règle expirée ne s'applique plus", async () => {
    await seedRule({
      id: "vieille",
      stage: "promotion",
      bp: 5000,
      validFrom: new Date("2020-01-01T00:00:00.000Z"),
      validTo: new Date("2020-02-01T00:00:00.000Z"),
    });

    const response = await placeOrder(1);

    expect(await unitPriceOf(jsonBody<{ id: string }>(response).id)).toBe(CANONICAL);
  });

  /**
   * Le parcours zéro friction est le défaut de la boutique : une commande sans
   * entreprise ne doit pas hériter d'un tarif négocié pour quelqu'un d'autre.
   */
  /**
   * Le plancher est le seul garde-fou contre l'empilement accidentel : quatre
   * étages qui se composent, un barème recopié une fois de trop, et le prix
   * passe sous ce que la maison peut vendre. Ce test prouve qu'il **relève**
   * réellement la ligne, pas seulement qu'il se lit.
   */
  it("le plancher relève un prix que les règles ont trop descendu", async () => {
    await seedRule({ id: "promo", stage: "promotion", bp: 5000 }); // 200 → 100
    await seedFloor("global", null, 150);

    const response = await placeOrder(1);

    expect(await unitPriceOf(jsonBody<{ id: string }>(response).id)).toBe(150);
  });

  it("un plancher que le prix ne touche pas ne change rien", async () => {
    await seedRule({ id: "promo", stage: "promotion", bp: 1000 }); // 200 → 180
    await seedFloor("global", null, 150);

    const response = await placeOrder(1);

    expect(await unitPriceOf(jsonBody<{ id: string }>(response).id)).toBe(180);
  });

  /**
   * L'héritage, sur le chemin qui facture : le plancher de la FAMILLE couvre
   * l'article sans que personne n'ait eu à le recopier dessus.
   */
  it("le plancher de la famille couvre ses articles", async () => {
    await seedRule({ id: "promo", stage: "promotion", bp: 5000 });
    await seedFloor("category", "viennoiserie", 170);

    const response = await placeOrder(1);

    expect(await unitPriceOf(jsonBody<{ id: string }>(response).id)).toBe(170);
  });

  /** Un plancher d'article REMPLACE celui de sa famille — il peut donc l'abaisser. */
  it("le plancher de l'article l'emporte sur celui de sa famille", async () => {
    await seedRule({ id: "promo", stage: "promotion", bp: 5000 });
    await seedFloor("category", "viennoiserie", 170);
    await seedFloor("product", SKU, 120);

    const response = await placeOrder(1);

    expect(await unitPriceOf(jsonBody<{ id: string }>(response).id)).toBe(120);
  });

  /**
   * Le piège que `coalesce` répare, dans sa seconde occurrence : sans lui, deux
   * planchers GLOBAUX cohabiteraient, Postgres tenant deux NULL pour distincts —
   * et la résolution en tirerait un au hasard.
   */
  it("refuse deux planchers de même portée, globaux compris", async () => {
    await seedFloor("global", null, 100);

    await expect(seedFloor("global", null, 200)).rejects.toThrow();
    await expect(seedFloor("category", "viennoiserie", 100)).resolves.toBeDefined();
  });

  it("une règle visant une entreprise n'atteint pas une commande sans entreprise", async () => {
    const company = await createCompany(ctx.prisma, { name: "Dupont" });
    await seedRule({
      id: "merc",
      stage: "mercuriale",
      audienceType: "company",
      audienceId: company.id,
      amountCents: 150,
    });

    const response = await placeOrder(1);

    expect(await unitPriceOf(jsonBody<{ id: string }>(response).id)).toBe(CANONICAL);
  });
});
