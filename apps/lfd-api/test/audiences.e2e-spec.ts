/**
 * E2E des **audiences de la clientèle** (lot A1 de
 * `documentation/recommandation-produit/plan-audiences.md`).
 *
 * Ce qu'aucun test unitaire ne prouve : les agrégats SQL eux-mêmes — le
 * client distinct (société pour un pro, personne sinon), les exclusions en
 * base, le moment lu à l'heure de PARIS et non en UTC, les clés lues dans
 * les JSON figés (`pickup_address`, `delivery_address_snapshot`), la
 * jointure du code NAF — puis le seuil appliqué à une vraie réponse, et le
 * mur `b2b_growth`.
 */
import { addDays, instantToLocal, localToInstant, type AudiencesView } from "@lfd/contracts";
import { lineTotalCents } from "@lfd/money";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { createCompany, createUser } from "./factories.js";
import { bootstrapE2e, E2E_STAFF_ID, jsonBody, type E2eContext } from "./e2e-harness.js";
import { staffWith, stubAdminVerifier } from "./operations-at-commerce-scene.js";

const AUDIENCES = "/admin/audiences";

/** Une baguette à 1,20 € HT, deux par commande : 240 c HT, 253 c TTC. */
const BAGUETTE = { sku: "PAI-001", unitPriceMillicents: 120_000, quantity: 2 };
const LINE_HT = lineTotalCents(BAGUETTE.unitPriceMillicents, BAGUETTE.quantity);
const ORDER_TTC = 253;

let ctx: E2eContext;
let seq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Hier, jour métier du serveur — jamais une date écrite en dur. */
function yesterday(): string {
  return addDays(instantToLocal(ctx.app.get(Clock).now()).day, -1);
}

/** Hier à 8 h 30 À PARIS : 6 h 30 ou 7 h 30 en UTC, donc « nuit » si la base lisait l'UTC. */
function yesterdayMorning(): Date {
  const at = localToInstant(yesterday(), "08:30");
  if (at === null) {
    throw new Error("8 h 30 existe tous les jours à Paris");
  }
  return at;
}

interface SeedOrder {
  readonly userId: string;
  readonly companyId?: string;
  readonly status?: OrderStatus;
  readonly paymentStatus?: PaymentStatus;
  readonly byStaff?: boolean;
  readonly fromSubscription?: boolean;
  readonly delivery?: { readonly codePostal: string; readonly ville: string };
}

/** Une commande figée telle que la passation l'écrit : retrait au Fournil, sinon livraison. */
async function seedOrder(order: SeedOrder): Promise<void> {
  seq += 1;
  const place = { label: "", ligne1: "1 rue du Test", ligne2: "", pays: "FR" };
  await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-AUDIENCES-${String(seq)}`,
      placedByUserId: order.userId,
      companyId: order.companyId ?? null,
      placedByStaffId: order.byStaff === true ? E2E_STAFF_ID : null,
      clientele: order.companyId === undefined ? OrderClientele.public : OrderClientele.pro,
      status: order.status ?? OrderStatus.placed,
      paymentStatus: order.paymentStatus ?? PaymentStatus.not_required,
      fromSubscriptionId: order.fromSubscription === true ? `sub-${String(seq)}` : null,
      fulfillmentMethod: order.delivery === undefined ? "pickup" : "delivery",
      pickupAddress:
        order.delivery === undefined
          ? {
              ...place,
              label: "Le Fournil",
              codePostal: "73150",
              ville: "Val-d'Isère",
              siteId: "site-fournil",
            }
          : Prisma.DbNull,
      deliveryAddressSnapshot:
        order.delivery === undefined ? Prisma.DbNull : { ...place, ...order.delivery },
      subtotalCents: LINE_HT,
      vatCents: ORDER_TTC - LINE_HT,
      totalCents: ORDER_TTC,
      createdAt: yesterdayMorning(),
      lines: {
        create: [{ ...BAGUETTE, productNameSnapshot: "Baguette", lineTotalCents: LINE_HT }],
      },
    },
  });
}

async function person(): Promise<string> {
  seq += 1;
  const user = await createUser(ctx.prisma, {
    auth0Sub: `auth0|audiences-${String(seq)}`,
    email: `audiences-${String(seq)}@example.test`,
  });
  return user.id;
}

async function read(query: string): Promise<AudiencesView> {
  return jsonBody<AudiencesView>(
    await ctx.asSub("staff-e2e").get(`${AUDIENCES}${query}`).expect(200),
  );
}

function cellsOf(view: AudiencesView, dimension: string) {
  return view.segmentations.find((segmentation) => segmentation.dimension === dimension)?.cells;
}

/** Cinq particuliers, une commande chacun — dont une saisie par le staff. */
async function fivePeople(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await seedOrder({ userId: await person(), byStaff: index === 0 });
  }
}

describe("les audiences de la clientèle (A1)", () => {
  it("chiffre une case de cinq clients et exclut brouillon, annulée, carte non encaissée et abonnement", async () => {
    await fivePeople();
    const outsider = await person();
    await seedOrder({ userId: outsider, status: OrderStatus.cancelled });
    await seedOrder({ userId: outsider, status: OrderStatus.draft });
    await seedOrder({ userId: outsider, paymentStatus: PaymentStatus.pending });
    await seedOrder({ userId: outsider, fromSubscription: true });

    const view = await read("?days=7&dimension=clientele");

    expect(view).toMatchObject({ days: 7, minClients: 5 });
    expect(cellsOf(view, "clientele")).toEqual([
      { status: "too_few_clients", key: "pro", label: "Professionnels" },
      {
        status: "shown",
        key: "public",
        label: "Particuliers",
        clients: 5,
        orders: 5,
        revenueHtCents: 5 * LINE_HT,
        revenueTtcCents: 5 * ORDER_TTC,
        averageBasketHtCents: LINE_HT,
        averageBasketTtcCents: ORDER_TTC,
        topFamilies: [{ familyId: "fam-pains", name: "Pains", revenueHtCents: 5 * LINE_HT }],
      },
    ]);
    // L'abonnement est à part, et une seule personne ne passe pas le seuil.
    expect(view.subscriptions).toEqual({
      status: "too_few_clients",
      key: "subscriptions",
      label: "Commandes d'abonnement",
    });
  });

  it("compte le client pro par SOCIÉTÉ, et masque une famille d'activité sous cinq sociétés", async () => {
    const buyer = await person();
    for (let index = 0; index < 4; index += 1) {
      const company = await createCompany(ctx.prisma, { nafCode: "56.10A" });
      // Deux commandes par société, par la même personne : quatre clients, pas un.
      await seedOrder({
        userId: buyer,
        companyId: company.id,
        delivery: { codePostal: "73150", ville: "Val-d'Isère" },
      });
      await seedOrder({
        userId: buyer,
        companyId: company.id,
        delivery: { codePostal: "73150", ville: "Val-d'Isère" },
      });
    }
    const fifth = await createCompany(ctx.prisma, { nafCode: "56.21Z" });
    await seedOrder({
      userId: buyer,
      companyId: fifth.id,
      delivery: { codePostal: "73150", ville: "Val-d'Isère" },
    });

    const view = await read("?days=7");

    // 56.10A (quatre sociétés) et 56.21Z (une) font ensemble cinq restaurants.
    expect(cellsOf(view, "activity")?.find((cell) => cell.key === "restaurant")).toMatchObject({
      status: "shown",
      clients: 5,
      orders: 9,
    });
    expect(cellsOf(view, "delivery_zone")).toEqual([
      expect.objectContaining({
        status: "shown",
        key: "73150",
        label: "73150 Val-d'Isère",
        clients: 5,
      }),
    ]);
    expect(cellsOf(view, "loyalty")).toEqual([
      { status: "too_few_clients", key: "once", label: "1 commande" },
      { status: "too_few_clients", key: "regular", label: "2 à 4 commandes" },
      { status: "too_few_clients", key: "loyal", label: "5 commandes et plus" },
    ]);
  });

  it("range le moment à l'heure de Paris, et le site par l'identifiant figé du point", async () => {
    await fivePeople();

    const view = await read("?days=7");

    const weekday = new Date(`${yesterday()}T12:00:00.000Z`).getUTCDay();
    const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][weekday];
    const shown = cellsOf(view, "moment")?.filter((cell) => cell.status === "shown");
    expect(shown?.map((cell) => cell.key)).toEqual([`${String(dayKey)}-morning`]);
    expect(cellsOf(view, "pickup_site")).toEqual([
      expect.objectContaining({
        status: "shown",
        key: "site-fournil",
        label: "Le Fournil",
        clients: 5,
      }),
    ]);
    expect(cellsOf(view, "fulfillment")?.map((cell) => [cell.key, cell.status])).toEqual([
      ["pickup", "shown"],
      ["delivery", "too_few_clients"],
    ]);
  });

  it("ne rend aucun identifiant de client", async () => {
    await fivePeople();
    const body = JSON.stringify(await read("?days=7"));
    const users = await ctx.prisma.user.findMany({ select: { id: true } });
    for (const user of users) {
      expect(body).not.toContain(user.id);
    }
  });

  it("refuse une autre période, et se ferme à qui n'a pas b2b_growth", async () => {
    await ctx.asSub("staff-e2e").get(`${AUDIENCES}?days=14`).expect(400);
    const outsider = await staffWith(ctx, "sans-croissance", [
      { resource: "b2b_orders", action: "read" },
    ]);
    const reader = await staffWith(ctx, "lecteur-croissance", [
      { resource: "b2b_growth", action: "read" },
    ]);
    await ctx.asSub(outsider).get(AUDIENCES).expect(403);
    await ctx.asSub(reader).get(AUDIENCES).expect(200);
  });
});
