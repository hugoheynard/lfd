/**
 * E2E des **commandes** — checkout muré, sur un vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve : le mur (membre), le gate d'activation
 * (entreprise `active` requise pour commander), la **résolution serveur des
 * prix** (le client n'envoie que sku+qté), l'isolation de l'adresse de livraison
 * (une commande ne peut pointer l'adresse d'une autre entreprise), et la lecture.
 */
import type { CompanyStatus } from "../src/infra/database/client/client.js";
import { AddressKind, CustomerRole } from "../src/infra/database/client/client.js";
import type { OrderView, PlacedOrderResponse } from "@lfd/contracts";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const ADMIN = "auth0|admin";
const MEMBER = "auth0|member";
const STRANGER = "auth0|stranger";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Sème une entreprise (statut choisi) + un membre + une adresse de livraison. */
async function seedCompany(
  status: CompanyStatus,
): Promise<{ companyId: string; addressId: string }> {
  const admin = await createUser(ctx.prisma, { auth0Sub: ADMIN });
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await createUser(ctx.prisma, { auth0Sub: STRANGER });
  const company = await createCompany(ctx.prisma, { status });
  await attachTo(ctx.prisma, admin.id, company.id, CustomerRole.company_admin);
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.member);
  const address = await ctx.prisma.address.create({
    data: {
      companyId: company.id,
      kind: AddressKind.livraison,
      label: "Boutique",
      ligne1: "9 rue de la Roquette",
      codePostal: "75011",
      ville: "Paris",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  return { companyId: company.id, addressId: address.id };
}

function order(addressId: string): Record<string, unknown> {
  return {
    deliveryAddressId: addressId,
    requestedDeliveryDate: null,
    note: "Livrer avant 8h",
    lines: [{ sku: "VIE-001", quantity: 3 }],
  };
}

describe("le mur des commandes", () => {
  it("un non-membre reçoit 404 (lecture et passation)", async () => {
    const { companyId, addressId } = await seedCompany("active");
    await ctx.asSub(STRANGER).get(`/companies/${companyId}/orders`).expect(404);
    await ctx
      .asSub(STRANGER)
      .post(`/companies/${companyId}/orders`)
      .send(order(addressId))
      .expect(404);
  });
});

describe("gate d'activation", () => {
  it("une entreprise pending refuse la commande (409) mais pas la lecture", async () => {
    const { companyId, addressId } = await seedCompany("pending");
    await ctx.asSub(MEMBER).get(`/companies/${companyId}/orders`).expect(200);
    await ctx
      .asSub(MEMBER)
      .post(`/companies/${companyId}/orders`)
      .send(order(addressId))
      .expect(409);
    expect(await ctx.prisma.order.count({ where: { companyId } })).toBe(0);
  });

  it("une entreprise active accepte la commande d'un membre", async () => {
    const { companyId, addressId } = await seedCompany("active");
    await ctx
      .asSub(MEMBER)
      .post(`/companies/${companyId}/orders`)
      .send(order(addressId))
      .expect(201);
  });
});

describe("checkout → Order", () => {
  it("résout les prix au serveur et persiste la commande + ses lignes", async () => {
    const { companyId, addressId } = await seedCompany("active");

    const response = await ctx
      .asSub(MEMBER)
      .post(`/companies/${companyId}/orders`)
      .send(order(addressId))
      .expect(201);
    const placed = jsonBody<PlacedOrderResponse>(response);
    expect(placed.orderNumber).toMatch(/^ORD-/u);

    const list = jsonBody<readonly OrderView[]>(
      await ctx.asSub(MEMBER).get(`/companies/${companyId}/orders`).expect(200),
    );
    expect(list).toHaveLength(1);
    const stored = list[0];
    expect(stored?.orderNumber).toBe(placed.orderNumber);
    expect(stored?.note).toBe("Livrer avant 8h");
    // Croissant = 200c au catalogue serveur × 3.
    expect(stored?.lines).toEqual([
      {
        sku: "VIE-001",
        productName: "Croissant",
        unitPriceCents: 200,
        vatRate: 0,
        quantity: 3,
        lineTotalCents: 600,
      },
    ]);
    expect(stored?.subtotalCents).toBe(600);
    expect(stored?.totalCents).toBe(600);
  });

  it("refuse un SKU inconnu (400), rien n'est écrit", async () => {
    const { companyId, addressId } = await seedCompany("active");
    await ctx
      .asSub(MEMBER)
      .post(`/companies/${companyId}/orders`)
      .send({ ...order(addressId), lines: [{ sku: "NOPE-999", quantity: 1 }] })
      .expect(400);
    expect(await ctx.prisma.order.count({ where: { companyId } })).toBe(0);
  });

  it("refuse l'adresse de livraison d'une AUTRE entreprise (400)", async () => {
    const { companyId } = await seedCompany("active");
    const other = await createCompany(ctx.prisma, { siret: "99999999900017" });
    const otherAddress = await ctx.prisma.address.create({
      data: {
        companyId: other.id,
        kind: AddressKind.livraison,
        label: "Ailleurs",
        ligne1: "1 rue d'à côté",
        codePostal: "69001",
        ville: "Lyon",
        pays: "France",
        isDefault: true,
      },
      select: { id: true },
    });

    await ctx
      .asSub(MEMBER)
      .post(`/companies/${companyId}/orders`)
      .send(order(otherAddress.id))
      .expect(400);
    expect(await ctx.prisma.order.count({ where: { companyId } })).toBe(0);
  });
});

describe("retrait (fallback sans livraison)", () => {
  const LABO = {
    label: "Labo",
    ligne1: "5 rue du Four",
    ligne2: "",
    codePostal: "75002",
    ville: "Paris",
    pays: "France",
  };

  /** Sème un point de retrait par défaut (table globale). */
  async function seedPickup(): Promise<void> {
    await ctx.prisma.pickupAddress.create({ data: { ...LABO, isDefault: true } });
  }

  it("passe une commande en RETRAIT : adresse labo figée, sans adresse de livraison", async () => {
    const { companyId } = await seedCompany("active");
    await seedPickup();

    const response = await ctx
      .asSub(MEMBER)
      .post(`/companies/${companyId}/orders`)
      .send({
        fulfillmentMethod: "pickup",
        note: "",
        lines: [{ sku: "VIE-001", quantity: 2 }],
      })
      .expect(201);

    const stored = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: jsonBody<PlacedOrderResponse>(response).id },
    });
    expect(stored.fulfillmentMethod).toBe("pickup");
    expect(stored.deliveryAddressId).toBeNull();
    expect(stored.pickupAddress).toEqual(LABO);
  });

  it("refuse le retrait si aucun point de retrait n'est configuré (409)", async () => {
    const { companyId } = await seedCompany("active");
    // Aucun point de retrait semé → résolution nulle → refus.

    await ctx
      .asSub(MEMBER)
      .post(`/companies/${companyId}/orders`)
      .send({ fulfillmentMethod: "pickup", note: "", lines: [{ sku: "VIE-001", quantity: 1 }] })
      .expect(409);
    expect(await ctx.prisma.order.count({ where: { companyId } })).toBe(0);
  });
});
