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
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

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
  readonly stacksOverMercuriale?: boolean;
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
      stacksOverMercuriale: seed.stacksOverMercuriale ?? false,
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

/** La ligne complète — la trace y est figée à côté du prix. */
function lineOf(orderId: string) {
  return ctx.prisma.orderLine.findFirstOrThrow({ where: { orderId } });
}

describe("la trace figée sur la ligne", () => {
  /**
   * Sans règle, la trace existe quand même et dit « aucun étage n'a joué ».
   * C'est une AFFIRMATION, distincte du `null` des commandes antérieures qui,
   * lui, avoue qu'on ne sait pas.
   */
  it("existe même sans règle, et dit qu'aucun étage n'a joué", async () => {
    const response = await placeOrder(1);

    const line = await lineOf(jsonBody<{ id: string }>(response).id);
    expect(line.basePriceCents).toBe(CANONICAL);
    expect(line.pricingSteps).toEqual([]);
    expect(line.pricingFloored).toBe(false);
  });

  it("garde le prix d'entrée ET chaque étage qui a joué", async () => {
    await seedRule({ id: "vol", stage: "volume", bp: 2000 });
    await seedRule({ id: "promo", stage: "promotion", bp: 1000 });

    const line = await lineOf(jsonBody<{ id: string }>(await placeOrder(1)).id);

    expect(line.basePriceCents).toBe(CANONICAL);
    expect(line.pricingSteps).toEqual([
      { stage: "volume", ruleId: "vol", label: "vol", resultCents: 160 },
      { stage: "promotion", ruleId: "promo", label: "promo", resultCents: 144 },
    ]);
    expect(line.unitPriceCents).toBe(144);
  });

  it("consigne que le plancher a relevé le prix", async () => {
    await seedRule({ id: "promo", stage: "promotion", bp: 5000 });
    await seedFloor("global", null, 150);

    const line = await lineOf(jsonBody<{ id: string }>(await placeOrder(1)).id);

    expect(line.pricingFloored).toBe(true);
    // La trace garde ce que la RÈGLE a produit (100), le prix garde ce que le
    // plancher a imposé (150). Les deux nombres sont vrais, et leur écart est
    // exactement ce qu'on veut pouvoir montrer.
    expect(line.pricingSteps).toEqual([
      { stage: "promotion", ruleId: "promo", label: "promo", resultCents: 100 },
    ]);
    expect(line.unitPriceCents).toBe(150);
  });

  /**
   * La trace SURVIT à la règle qui l'a produite : `ruleId` est une piste pour le
   * service client, pas une clé étrangère. Une règle effacée ne doit pas emporter
   * l'explication d'une facture déjà payée.
   */
  it("survit à la suppression de la règle qui l'a produite", async () => {
    await seedRule({ id: "promo", stage: "promotion", bp: 1000 });
    const orderId = jsonBody<{ id: string }>(await placeOrder(1)).id;

    await ctx.prisma.priceRule.delete({ where: { id: "promo" } });

    const line = await lineOf(orderId);
    expect(line.pricingSteps).toEqual([
      { stage: "promotion", ruleId: "promo", label: "promo", resultCents: 180 },
    ]);
  });
});

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

/**
 * **La mercuriale scelle** — éprouvé sur le chemin qui FACTURE, pas sur une
 * simulation.
 *
 * Avant le 2026-08-18, la chaîne composait jusqu'au bout : un compte au tarif
 * négocié empochait aussi la promotion publique. Personne n'avait décidé ce
 * cumul, et il ne se voyait qu'en comparant deux factures.
 */
describe("le scellement par la mercuriale", () => {
  it("une promotion ne s'applique PAS par-dessus un tarif négocié", async () => {
    await seedRule({ id: "merc", stage: "mercuriale", amountCents: 180 });
    await seedRule({ id: "promo", stage: "promotion", bp: 1000 });

    const line = await lineOf(jsonBody<{ id: string }>(await placeOrder(1)).id);

    // 180 et non 162 : la promotion a été écartée, pas appliquée.
    expect(line.unitPriceCents).toBe(180);
    // La trace ne cite QUE l'étage qui a joué — elle décrit ce qui a fait le
    // prix, pas ce qui aurait pu le faire.
    expect(line.pricingSteps).toEqual([
      { stage: "mercuriale", ruleId: "merc", label: "merc", resultCents: 180 },
    ]);
  });

  it("une promotion explicitement cumulable franchit le scellement", async () => {
    await seedRule({ id: "merc", stage: "mercuriale", amountCents: 180 });
    await seedRule({
      id: "promo",
      stage: "promotion",
      bp: 1000,
      stacksOverMercuriale: true,
    });

    const line = await lineOf(jsonBody<{ id: string }>(await placeOrder(1)).id);

    expect(line.unitPriceCents).toBe(162);
  });

  /**
   * Le cas le plus coûteux du lot, et le moins visible : un tarif négocié EST
   * déjà le prix du volume négocié. Le barème par-dessus accordait une seconde
   * fois la remise que la mercuriale avait consentie en euros.
   */
  it("un barème de volume ne franchit jamais un tarif négocié", async () => {
    await seedRule({ id: "merc", stage: "mercuriale", amountCents: 180 });
    await ctx.prisma.volumeLadder.create({
      data: {
        id: "ladder",
        scopeType: "global",
        scopeId: null,
        audienceType: "all",
        audienceId: null,
        unit: "percent",
        tiers: [{ minQuantity: 10, value: 2000 }],
        label: "10+ à −20 %",
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        createdBy: "e2e",
      },
    });

    const line = await lineOf(jsonBody<{ id: string }>(await placeOrder(20)).id);

    expect(line.unitPriceCents).toBe(180);
  });
});

/**
 * **Le devis, et ce qu'il rend visible.**
 *
 * Un prix seul ne se discute pas au téléphone. Le devis rend donc la grille du
 * barème — chaque palier RÉSOLU, pas un « canonique moins la remise » — et le
 * scellement quand il y en a un. C'est ce qui permet d'éprouver le système sur
 * des volumes sans passer dix commandes pour connaître la réponse.
 */
describe("POST /orders/quote — la grille et le scellement", () => {
  const quote = (quantity: number) =>
    ctx
      .asSub("auth0|solo")
      .post("/orders/quote")
      .send({ companyId: null, lines: [{ sku: SKU, quantity }] });

  it("rend le barème palier par palier, résolu", async () => {
    await ctx.prisma.volumeLadder.create({
      data: {
        id: "ladder",
        scopeType: "global",
        scopeId: null,
        audienceType: "all",
        audienceId: null,
        unit: "percent",
        tiers: [
          { minQuantity: 10, value: 1000 },
          { minQuantity: 50, value: 2000 },
        ],
        label: "Barème",
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        createdBy: "e2e",
      },
    });

    const body = jsonBody<{
      lines: {
        unitPriceCents: number;
        volumeTiers: { minQuantity: number; unitPriceCents: number }[] | null;
      }[];
    }>(await quote(1).expect(200));

    // À 1 pièce aucun palier n'est atteint : le prix reste le canonique…
    expect(body.lines[0]?.unitPriceCents).toBe(CANONICAL);
    // …mais la grille dit ce que coûteraient 10 et 50, ce qui est la question.
    expect(body.lines[0]?.volumeTiers).toEqual([
      { minQuantity: 10, unitPriceCents: 180, discountBp: 1000 },
      { minQuantity: 50, unitPriceCents: 160, discountBp: 2000 },
    ]);
  });

  it("nomme la mercuriale qui scelle, et la règle qu'elle écarte", async () => {
    await seedRule({ id: "merc", stage: "mercuriale", amountCents: 180 });
    await seedRule({ id: "promo", stage: "promotion", bp: 1000 });

    const body = jsonBody<{
      lines: { sealedByRuleId: string | null; sealedRuleIds: string[] }[];
    }>(await quote(1).expect(200));

    expect(body.lines[0]?.sealedByRuleId).toBe("merc");
    // Sans ce champ, un commercial ne saurait pas si sa promotion a expiré, si
    // elle a été évincée par plus spécifique, ou si le tarif du client l'écarte.
    expect(body.lines[0]?.sealedRuleIds).toEqual(["promo"]);
  });
});

/**
 * **L'engagement de volume** — le volume ANNONCÉ ouvre le palier.
 *
 * La story du commercial : « ma saison, c'est 6 000 » — et le prix négocié est
 * là dès la première commande, pas au bout de la cinq-centième pièce. Le palier
 * se juge donc sur `max(promis, livré)` : le promis ouvre, le livré reprend la
 * main s'il dépasse.
 *
 * Ces tests sont le seul endroit où la forme retenue se prouve de bout en bout.
 * Sans eux, le palier pourrait se rejouer sur la quantité du panier, ou sur le
 * cumul seul, sans que rien ne le dise.
 */
describe("l'engagement de volume", () => {
  const CLIENT = "auth0|engage";
  let companyId = "";

  /**
   * Le barème global : 500+ à −20 %, puis 10 000+ à −40 %. Le second palier est
   * au-DESSUS de la promesse : c'est lui qui prouve que le livré reprend la main.
   */
  async function seedLadder(): Promise<void> {
    await ctx.prisma.volumeLadder.create({
      data: {
        id: "ladder",
        scopeType: "global",
        scopeId: null,
        audienceType: "all",
        audienceId: null,
        unit: "percent",
        tiers: [
          { minQuantity: 500, value: 2000 },
          { minQuantity: 10_000, value: 4000 },
        ],
        label: "500+ à −20 %, 10 000+ à −40 %",
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        createdBy: "e2e",
      },
    });
  }

  async function seedCommitment(): Promise<void> {
    await ctx.prisma.volumeCommitment.create({
      data: {
        id: "cmt",
        companyId,
        scopeType: "product",
        scopeId: SKU,
        promisedQuantity: 6000,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: new Date("2027-01-01T00:00:00.000Z"),
        createdBy: "e2e",
      },
    });
  }

  /** Une commande de ce client, portée par sa société. */
  function order(quantity: number) {
    return ctx
      .asSub(CLIENT)
      .post("/orders")
      .send({ ...pickupContent(), companyId, lines: [{ sku: SKU, quantity }] });
  }

  beforeEach(async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: CLIENT });
    const company = await createCompany(ctx.prisma);
    companyId = company.id;
    await attachTo(ctx.prisma, user.id, companyId, "orders");
  });

  /**
   * **Le cas qui décide de tout.** Sans engagement, une commande de 100 n'ouvre
   * pas un palier posé à 500 : elle paie le tarif d'entrée.
   */
  it("sans engagement, une petite commande n'ouvre pas le palier", async () => {
    await seedLadder();

    const line = await lineOf(jsonBody<{ id: string }>(await order(100)).id);

    expect(line.unitPriceCents).toBe(CANONICAL);
  });

  /**
   * **Le cas qui porte toute la story.** Le client a annoncé 6 000 ; sa toute
   * première commande de 100 est facturée au palier de son annonce. Le faire
   * attendre le volume réel reviendrait à ne pas lui avoir accordé ce qu'on lui
   * a vendu au téléphone.
   */
  it("le volume ANNONCÉ ouvre le palier dès la première commande", async () => {
    await seedLadder();
    await seedCommitment();

    const line = await lineOf(jsonBody<{ id: string }>(await order(100)).id);

    // 6 000 promis → palier 500+ → 200 × 0,8 = 160, dès la première pièce.
    expect(line.unitPriceCents).toBe(160);
  });

  /**
   * **Le livré reprend la main dès qu'il dépasse la promesse.** Sans ce `max`,
   * dépasser son engagement coûterait un palier au client — l'inverse exact de
   * ce qu'un barème de volume encourage.
   */
  it("dépasser la promesse ouvre le palier supérieur", async () => {
    await seedLadder();
    await seedCommitment();

    const line = await lineOf(jsonBody<{ id: string }>(await order(10_000)).id);

    // 10 000 livrés > 6 000 promis → palier 10 000+ → 200 × 0,6 = 120.
    expect(line.unitPriceCents).toBe(120);
  });

  /**
   * La **mesure figée** avec le prix, exactement comme la décision de plancher —
   * et les TROIS nombres, pas seulement celui qui décide. Une ligne facturée au
   * palier de 6 000 alors que 600 ont été livrés n'est relisible que si la trace
   * dit que c'est la promesse qui a ouvert ce palier ; sans quoi elle passerait
   * pour une erreur.
   */
  it("fige la mesure retenue sur la ligne, avec le prix", async () => {
    await seedLadder();
    await seedCommitment();
    await order(300).expect(201);

    const line = await lineOf(jsonBody<{ id: string }>(await order(300)).id);

    expect(line.pricingCommitment).toEqual({
      commitmentId: "cmt",
      promisedQuantity: 6000,
      cumulativeQuantity: 600,
      retainedQuantity: 6000,
    });
  });

  /** L'engagement d'un client ne franchit pas le mur : un autre n'en profite pas. */
  it("ne profite qu'au client qui l'a signé", async () => {
    await seedLadder();
    await seedCommitment();

    const line = await lineOf(jsonBody<{ id: string }>(await placeOrder(300)).id);

    expect(line.unitPriceCents).toBe(CANONICAL);
    expect(line.pricingCommitment).toBeNull();
  });

  /**
   * **Clore ne révise rien.** La commande passée garde le prix qu'elle a été
   * facturée, et la suivante repart sur la quantité du panier. C'est ce qui rend
   * le volume annoncé tenable : la remise est accordée d'avance, mais aucune
   * facture n'est jamais réécrite — ni à la hausse si la promesse tombe, ni à
   * la baisse si elle est dépassée.
   */
  it("clore n'a aucun effet rétroactif sur les commandes passées", async () => {
    await seedLadder();
    await seedCommitment();
    const first = jsonBody<{ id: string }>(await order(500)).id;

    await ctx.prisma.volumeCommitment.update({
      where: { id: "cmt" },
      data: { archivedAt: new Date(), archivedBy: "e2e" },
    });

    expect((await lineOf(first)).unitPriceCents).toBe(160);
    // …mais la commande SUIVANTE repart sur la quantité du panier.
    const after = await lineOf(jsonBody<{ id: string }>(await order(300)).id);
    expect(after.unitPriceCents).toBe(CANONICAL);
  });
});
