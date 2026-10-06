/**
 * E2E **situer l'adresse dès la commande** (`documentation/livraisons/composition-automatique.md`,
 * Q4, lot CA0), sur la vraie base.
 *
 * Ce que seule cette suite prouve : la passation HTTP rend la main pendant
 * que le géocodeur travaille encore (elle ne l'attend pas), le cache
 * `delivery_geocode` se remplit après coup, et un géocodeur en panne ne fait
 * pas échouer la commande — l'adresse est rattrapée au passage suivant.
 *
 * Le géocodeur est doublé (le harnais ne sort pas sur le réseau) : un double
 * qu'on retient, qu'on met en panne, qu'on répare.
 */
import { randomUUID } from "node:crypto";

import type { BillingAddressPayload, DeliveryAddressPayload } from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { GeocoderUnavailableError } from "../src/delivery/domain/errors/delivery-routing-errors.js";
import {
  type GeocodeAnswer,
  Geocoder,
  type GeocodeRequest,
} from "../src/delivery/domain/ports/geocoder.js";
import { geoPoint } from "../src/delivery/domain/value-objects/geo-point.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, daysAgo, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const OWNER = "auth0|owner";
const SERVICE_DAY = serviceDay();

/** Une intention NEUVE par commande : l'identifiant Stripe est unique en base. */
const fakeGateway = {
  createIntent: () => {
    const id = `pi_${randomUUID()}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

/** Le géocodeur du test : retenu jusqu'à `release()`, ou en panne. */
class HeldGeocoder extends Geocoder {
  down = false;
  calls = 0;
  private gate: Promise<void> = Promise.resolve();
  private open: () => void = () => undefined;

  hold(): void {
    this.gate = new Promise((resolve) => {
      this.open = resolve;
    });
  }

  release(): void {
    this.open();
  }

  async geocode(requests: readonly GeocodeRequest[]): Promise<readonly GeocodeAnswer[]> {
    this.calls += 1;
    await this.gate;
    if (this.down) {
      throw new GeocoderUnavailableError();
    }
    return requests.map((request) => ({
      key: request.key,
      point: geoPoint(45.45, 6.98),
      score: 0.9,
    }));
  }
}

const POSTAL: BillingAddressPayload = {
  label: "Hôtel",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const geocoder = new HeldGeocoder();
let ctx: E2eContext;
let companyId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: PaymentGateway, value: fakeGateway },
      { token: Geocoder, value: geocoder },
    ],
  });
});

afterAll(async () => {
  geocoder.release();
  await ctx.close();
});

beforeEach(async () => {
  geocoder.release();
  geocoder.down = false;
  geocoder.calls = 0;
  await ctx.reset();
  const owner = await createUser(ctx.prisma, { auth0Sub: OWNER });
  const company = await createCompany(ctx.prisma, { status: "active" });
  companyId = company.id;
  await attachTo(ctx.prisma, owner.id, companyId, CustomerRole.owner);
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
  });
});

/** Une adresse du carnet SANS point GPS : seul le géocodage peut la situer. */
async function bookAddress(): Promise<string> {
  const payload: DeliveryAddressPayload = {
    ...POSTAL,
    isDefault: true,
    specs: {
      signatureRequired: null,
      note: "",
      slots: { mode: "everyday", slot: null },
      deliveryContact: null,
      gps: null,
      windowMode: "deadline",
    },
  };
  const created = await ctx
    .asSub(OWNER)
    .post(`/companies/${companyId}/delivery-addresses`)
    .send(payload)
    .expect(201);
  return jsonBody<{ id: string }>(created).id;
}

async function placeDelivery(addressId: string): Promise<string> {
  const placed = await ctx
    .asSub(OWNER)
    .post("/orders")
    .send({
      idempotencyKey: randomUUID(),
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "delivery",
      deliveryAddress: POSTAL,
      deliveryAddressId: addressId,
      note: "",
      lines: [{ sku: "VIE-001", quantity: 2 }],
      requestedWindow: { start: null, end: "06:00" },
    })
    .expect(201);
  return jsonBody<{ id: string }>(placed).id;
}

describe("situer l'adresse dès la commande (CA0)", () => {
  it("la passation rend la main pendant que le géocodeur travaille, puis l'adresse est située", async () => {
    const addressId = await bookAddress();
    geocoder.hold();

    const orderId = await placeDelivery(addressId);

    expect(await ctx.prisma.order.count({ where: { id: orderId } })).toBe(1);
    expect(await ctx.prisma.deliveryGeocode.count()).toBe(0);
    geocoder.release();
    await ctx.drain();
    expect(geocoder.calls).toBe(1);
    expect(await ctx.prisma.deliveryGeocode.count()).toBe(1);
  });

  it("géocodeur en panne : la commande passe, l'adresse reste non située, puis la commande suivante la rattrape", async () => {
    const addressId = await bookAddress();
    geocoder.down = true;

    const first = await placeDelivery(addressId);
    await ctx.drain();

    expect(await ctx.prisma.order.count({ where: { id: first } })).toBe(1);
    expect(await ctx.prisma.deliveryGeocode.count()).toBe(0);

    geocoder.down = false;
    await placeDelivery(addressId);
    await ctx.drain();

    expect(await ctx.prisma.deliveryGeocode.count()).toBe(1);
  });
});

/**
 * La purge du cache à 365 jours (`documentation/legal/rgpd-purge-du-geocodage.md`) :
 * la route machine efface ce que la lecture ne croit plus, garde le reste, et
 * refuse sans jeton.
 */
const PURGE_ROUTE = "/admin/livraison/geocodage/sweep";
const OLD_FINGERPRINT = "a".repeat(64);
const RECENT_FINGERPRINT = "b".repeat(64);

async function seedGeocode(fingerprint: string, geocodedAt: string): Promise<void> {
  await ctx.prisma.deliveryGeocode.create({
    data: { fingerprint, lat: 45.56, lng: 5.92, score: 0.9, geocodedAt: new Date(geocodedAt) },
  });
}

describe("la purge du cache du géocodage", () => {
  it("efface l'entrée de plus de 365 jours, garde la récente, et rend le compte", async () => {
    await seedGeocode(OLD_FINGERPRINT, daysAgo(366));
    await seedGeocode(RECENT_FINGERPRINT, daysAgo(364));

    const response = await ctx
      .http()
      .post(PURGE_ROUTE)
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);

    expect(response.body).toEqual({ purged: 1 });
    const left = await ctx.prisma.deliveryGeocode.findMany({ select: { fingerprint: true } });
    expect(left).toEqual([{ fingerprint: RECENT_FINGERPRINT }]);
  });

  it("est idempotent : un second passage n'efface plus rien", async () => {
    await seedGeocode(OLD_FINGERPRINT, daysAgo(400));
    const post = () =>
      ctx.http().post(PURGE_ROUTE).set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN).expect(200);

    await post();
    expect((await post()).body).toEqual({ purged: 0 });
  });

  it("refuse sans le jeton machine", async () => {
    await seedGeocode(OLD_FINGERPRINT, daysAgo(400));

    await ctx.http().post(PURGE_ROUTE).expect(401);

    expect(await ctx.prisma.deliveryGeocode.count()).toBe(1);
  });
});
