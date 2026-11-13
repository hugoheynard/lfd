import { randomUUID } from "node:crypto";
/**
 * E2E de la **fiche du fournil servie par l'objet des journées**
 * (`le-cache-du-back-office.md`, § 3.1) — sans objet ici (`NoDayContentsCache`,
 * aucune URL d'objet en e2e) : ce qui se prouve est le câblage réel, numéros
 * `production` et `orders` lus en base avant les données.
 *
 * - un geste sur une commande du jour, puis une relecture immédiate, rend le
 *   nouvel état — de même pour une coche du fournil ;
 * - la fiche datée et la colonne Préparation de la Supervision rendent les
 *   mêmes octets : elles partagent la clé `worksheet`.
 */
import type { ProductionWorksheetView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { cardProvidersDouble, settleCardPayments } from "./card-payments.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

const MEMBER = "auth0|member";
const STAFF = "staff-e2e";
const SERVICE_DAY = serviceDay();
const CROISSANT = "VIE-001-1";

const SITE = {
  label: "Boutique",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: STAFF, scopes: [] }),
};

const cards = cardProvidersDouble("pi_e2e_contents");
/** L'horloge du serveur, figée à MAINTENANT avant chaque test. */
const clock = new FixedClock(new Date());

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CardProviders, value: cards },
      { token: Clock, value: clock },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  clock.set(new Date());
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

async function place(quantity: number): Promise<void> {
  const point = await ctx.prisma.site.findFirst({ select: { id: true } });
  const id = point?.id ?? (await ctx.prisma.site.create({ data: { ...SITE, isDefault: true } })).id;
  await ctx
    .asSub(MEMBER)
    .post(`/orders`)
    .send({
      idempotencyKey: randomUUID(),
      salesTerms: null,
      companyId: null,
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "pickup",
      requestedWindow: { start: "07:00", end: "08:00" },
      pickupAddressId: id,
      note: "",
      lines: [{ sku: CROISSANT, quantity }],
    })
    .expect(201);
  await settleCardPayments(ctx, cards.provider.issued);
}

async function worksheet(): Promise<ProductionWorksheetView> {
  return jsonBody<ProductionWorksheetView>(
    await ctx.asSub(STAFF).get(`/admin/production/worksheet?date=${SERVICE_DAY}`).expect(200),
  );
}

function croissantOf(view: ProductionWorksheetView): ProductionWorksheetView["lines"][number] {
  const line = view.lines.find((candidate) => candidate.sku === CROISSANT);
  if (line === undefined) {
    throw new Error(`La fiche du ${view.date} ne porte aucun croissant.`);
  }
  return line;
}

describe("la fiche servie par l'objet des journées", () => {
  it("rend une commande du jour passée juste après une première lecture", async () => {
    await place(12);
    expect(croissantOf(await worksheet()).quantity).toBe(12);

    await place(5);

    expect(croissantOf(await worksheet()).quantity).toBe(17);
  });

  it("rend une coche du fournil faite juste après une première lecture", async () => {
    await place(12);
    await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/close`).expect(201);
    expect(croissantOf(await worksheet()).done).toBe(false);

    await ctx
      .asSub(STAFF)
      .put(`/admin/production/worksheet/${SERVICE_DAY}/lines/${CROISSANT}/done`)
      .send({ initials: "HH" })
      .expect(204);

    expect(croissantOf(await worksheet()).done).toBe(true);
  });

  it("sert les mêmes octets à la fiche datée et à la Préparation de la Supervision", async () => {
    await place(12);

    const sheet = await ctx
      .asSub(STAFF)
      .get(`/admin/production/worksheet?date=${SERVICE_DAY}`)
      .expect(200);
    const preparation = await ctx
      .asSub(STAFF)
      .get(`/admin/supervision/preparation?date=${SERVICE_DAY}`)
      .expect(200);

    expect(preparation.text).toBe(sheet.text);
  });
});
