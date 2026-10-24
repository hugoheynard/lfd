/**
 * E2E du **crédit de points** (plan `documentation/comptabilite/fidelite/plan-points-de-fidelite.md`,
 * lot D) : une commande remise ET encaissée rapporte ses points, une fois.
 *
 * Ce que seul le vrai SQL et le vrai bus prouvent :
 * - les deux abonnés (remise, règlement) créditent au second des deux faits,
 *   quel que soit l'ordre ;
 * - l'abonné et le rattrapage ne créditent jamais deux fois la même commande ;
 * - la lecture « définitive » d'`orders` : `not_required` et `pending` n'en
 *   sont pas, un invité ne gagne rien, un pro sans société non plus.
 *
 * Les commandes sont passées par le vrai chemin (`placeOrder`, plan T) ; le
 * règlement et la remise passent par les vraies commandes du commerce. Une
 * seule écriture brute reste, datée : la société disparue.
 * Frontière doublée : la signature du jeton staff.
 */
import type { SetLoyaltySettingsPayload } from "@lfd/contracts";

import { LoyaltySettings } from "../src/b2b/loyalty/domain/value-objects/loyalty-settings.js";
import { PrismaLoyaltySettingsStore } from "../src/b2b/loyalty/infrastructure/prisma-loyalty-settings.store.js";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createGuest, createUser } from "./factories.js";
import {
  cardGatewayDouble,
  handOver as handOverOrder,
  payByCard,
  pickupSite,
  placeOrder,
  type PlacedTestOrder,
} from "./order-factory.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const SETTINGS: SetLoyaltySettingsPayload = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
  welcomeBonusPoints: null,
};

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: cardGatewayDouble("pi_fidelite") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

async function openProgram(settings: SetLoyaltySettingsPayload = SETTINGS): Promise<void> {
  await ctx.asSub(E2E_STAFF_SUB).put("/admin/loyalty/settings").send(settings).expect(204);
}

/**
 * Ouvre AUSSI les pros — ce que l'écran et la commande refusent jusqu'au
 * lot F. On passe donc par l'adaptateur de stockage, pour éprouver dès
 * maintenant le crédit d'une société.
 */
async function openProgramToPro(): Promise<void> {
  await ctx.app
    .get(PrismaLoyaltySettingsStore)
    .write(LoyaltySettings.of({ ...SETTINGS, openToPro: true }), new Date(), E2E_STAFF_ID);
}

interface OrderSeed {
  readonly placedByUserId: string;
  /** La société au nom de qui l'auteur commande ; absente = commande personnelle. */
  readonly companyId?: string;
  /** Au compte (`not_required`) plutôt que par carte. */
  readonly onAccount?: boolean;
  /** L'instant de passation ; maintenant par défaut. */
  readonly placedAt?: Date;
}

interface SeededOrder {
  readonly order: PlacedTestOrder;
  readonly id: string;
  /** L'assiette des points : hors taxe, remise déduite — relue, jamais recopiée. */
  readonly basisCents: number;
}

/** Une commande passée par le vrai chemin ; carte en attente par défaut. */
async function seedOrder(seed: OrderSeed): Promise<SeededOrder> {
  const order = await placeOrder(ctx, {
    buyerUserId: seed.placedByUserId,
    companyId: seed.companyId ?? null,
    settlement: seed.onAccount === true ? "account" : "card",
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    ...(seed.placedAt === undefined ? {} : { placedAt: seed.placedAt }),
  });
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { subtotalCents: true, discountCents: true },
  });
  return { order, id: order.id, basisCents: row.subtotalCents - row.discountCents };
}

async function pay(seeded: SeededOrder): Promise<void> {
  await payByCard(ctx, seeded.order);
}

async function handOver(seeded: SeededOrder): Promise<void> {
  await handOverOrder(ctx, seeded.order);
}

/** Un membre de la société, pour qu'il puisse commander à son nom. */
async function proMember(companyId: string): Promise<string> {
  const userId = await member();
  await attachTo(ctx.prisma, userId, companyId);
  return userId;
}

async function sweep(): Promise<{
  scanned: number;
  credited: number;
  expired: number;
  vouchers: { reserved: number; settled: number; stalled: number };
  welcome: { scanned: number; credited: number };
}> {
  const response = await ctx
    .http()
    .post("/admin/loyalty/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  return jsonBody(response);
}

function earned(): Promise<
  { orderId: string | null; points: number; userId: string | null; companyId: string | null }[]
> {
  return ctx.prisma.loyaltyLedgerEntry.findMany({
    where: { kind: "earned" },
    select: { orderId: true, points: true, userId: true, companyId: true },
  });
}

async function member(): Promise<string> {
  return (await createUser(ctx.prisma, { auth0Sub: "auth0|fidele", firstName: "Léa" })).id;
}

describe("le crédit au fil de l'eau — remise ET encaissement", () => {
  // L'assiette (hors taxe, sans port ni surtaxe) est éprouvée sur le service
  // pur `order-earning` ; une commande passée au comptoir n'a ni port ni surtaxe.
  it("crédite au second fait quand la carte est réglée avant la remise — hors taxe", async () => {
    await openProgram();
    const userId = await member();
    const order = await seedOrder({ placedByUserId: userId });

    await pay(order);
    expect(await earned()).toEqual([]);
    await handOver(order);

    expect(await earned()).toEqual([
      { orderId: order.id, points: order.basisCents, userId, companyId: null },
    ]);
  });

  it("crédite aussi quand la remise précède le règlement", async () => {
    await openProgram();
    const userId = await member();
    const order = await seedOrder({ placedByUserId: userId });

    await handOver(order);
    expect(await earned()).toEqual([]);
    await pay(order);

    expect(await earned()).toMatchObject([{ orderId: order.id, points: order.basisCents }]);
  });

  it("🔴 ne crédite jamais deux fois : abonné, puis rattrapage, puis un fait rejoué", async () => {
    await openProgram();
    const order = await seedOrder({ placedByUserId: await member() });
    await pay(order);
    await handOver(order);

    expect(await sweep()).toMatchObject({ scanned: 1, credited: 0 });
    await pay(order);
    expect(await earned()).toHaveLength(1);
  });

  it("crédite la société pour une commande pro", async () => {
    await openProgramToPro();
    const company = await createCompany(ctx.prisma);
    const order = await seedOrder({
      placedByUserId: await proMember(company.id),
      companyId: company.id,
    });
    await pay(order);
    await handOver(order);

    expect(await earned()).toMatchObject([{ companyId: company.id, userId: null }]);
  });
});

describe("ce qui ne crédite pas", () => {
  it("🔴 `not_required` n'est pas un encaissement", async () => {
    // Au compte : seul un pro y commande, d'où le programme ouvert aux pros.
    await openProgramToPro();
    const company = await createCompany(ctx.prisma);
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { grantedTerms: ["monthly"] },
    });
    const order = await seedOrder({
      placedByUserId: await proMember(company.id),
      companyId: company.id,
      onAccount: true,
    });
    await handOver(order);

    expect(await sweep()).toMatchObject({ scanned: 0, credited: 0 });
    expect(await earned()).toEqual([]);
  });

  it("une carte encore en attente, remise quand même", async () => {
    await openProgram();
    const order = await seedOrder({ placedByUserId: await member() });
    await handOver(order);

    expect(await sweep()).toMatchObject({ scanned: 0, credited: 0 });
    expect(await earned()).toEqual([]);
  });

  it("un invité, sans compte connectable", async () => {
    await openProgram();
    const guest = await createGuest(ctx.prisma, { email: "invite@lfc.test" });
    const order = await seedOrder({ placedByUserId: guest.id });
    await pay(order);
    await handOver(order);

    expect(await sweep()).toMatchObject({ scanned: 1, credited: 0 });
    expect(await earned()).toEqual([]);
  });

  it("un pro dont la société a disparu", async () => {
    await openProgramToPro();
    const company = await createCompany(ctx.prisma);
    const order = await seedOrder({
      placedByUserId: await proMember(company.id),
      companyId: company.id,
    });
    // Une société ne disparaît plus (pas de suppression physique) : une
    // commande pro sans société est un état d'avant, qu'aucune route ne
    // produit. Posé après la vraie passation (plan T, 2026-10-25).
    // Le payeur part avec elle : la base refuse un payeur sans société.
    await ctx.prisma.order.update({
      where: { id: order.id },
      data: { companyId: null, billedCompanyId: null },
    });
    await pay(order);
    await handOver(order);

    expect(await earned()).toEqual([]);
  });

  it("rien tant que le programme est fermé — et le rattrapage ne parcourt rien", async () => {
    const order = await seedOrder({ placedByUserId: await member() });
    await pay(order);
    await handOver(order);

    // `vouchers` : le rattrapage des bons engagés (lot C, 2026-09-27). Il ne
    // dépend pas du réglage — un bon déjà engagé se solde même programme fermé.
    expect(await sweep()).toEqual({
      scanned: 0,
      credited: 0,
      expired: 0,
      vouchers: { reserved: 0, settled: 0, stalled: 0 },
      // La passe du bonus de bienvenue (plan bienvenue, lot C) : programme
      // fermé, elle ne parcourt rien non plus.
      welcome: { scanned: 0, credited: 0 },
    });
    expect(await earned()).toEqual([]);
  });
});

describe("le rattrapage — POST /admin/loyalty/sweep", () => {
  it("crédite ce que les abonnés ont manqué, une seule fois", async () => {
    // Le public est FERMÉ pendant les deux faits : les abonnés n'ont rien
    // écrit. Il a été ouvert une première fois AVANT la commande — sans quoi
    // R4 (plan bienvenue, 2026-10-11) la refuserait : jusqu'à ce jour, ce
    // test ouvrait le programme après la passation.
    await openProgram();
    await openProgram({ ...SETTINGS, openToPublic: false });
    const userId = await member();
    const order = await seedOrder({ placedByUserId: userId });
    await pay(order);
    await handOver(order);
    expect(await earned()).toEqual([]);
    await openProgram();

    expect(await sweep()).toMatchObject({ scanned: 1, credited: 1 });
    expect(await sweep()).toMatchObject({ scanned: 1, credited: 0 });
    expect(await earned()).toEqual([
      { orderId: order.id, points: order.basisCents, userId, companyId: null },
    ]);
  });

  it("est murée : sans le jeton machine, rien", async () => {
    await ctx.http().post("/admin/loyalty/sweep").expect(401);
  });
});

/**
 * R4 du plan bienvenue (2026-10-11) : une commande de particulier passée
 * avant la PREMIÈRE ouverture du programme au public ne rapporte rien, même
 * définitive et même rattrapée — une fiche ancienne ne se crédite pas d'un
 * coup, au barème du jour, d'achats faits programme fermé.
 */
describe("avant l'ouverture au public (R4)", () => {
  it("ne crédite pas une commande passée avant la première ouverture", async () => {
    const order = await seedOrder({
      placedByUserId: await member(),
      placedAt: new Date(daysAgo(3)),
    });
    await pay(order);
    await handOver(order);
    await openProgram();

    expect(await sweep()).toMatchObject({ scanned: 1, credited: 0 });
    expect(await earned()).toEqual([]);
  });

  it("pose l'instant d'ouverture une fois : fermer puis rouvrir ne le déplace pas", async () => {
    await openProgram();
    const first = await ctx.prisma.loyaltySettings.findUniqueOrThrow({ where: { id: "default" } });
    await openProgram({ ...SETTINGS, openToPublic: false });
    await openProgram();
    const after = await ctx.prisma.loyaltySettings.findUniqueOrThrow({ where: { id: "default" } });

    expect(first.publicOpenedAt).not.toBeNull();
    expect(after.publicOpenedAt).toEqual(first.publicOpenedAt);
  });
});
