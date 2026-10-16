import type { CommerceOperationView, ReceivedOperationView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { AppConfig } from "../src/platform/config/app-config.js";
import { MediaStore } from "../src/platform/storage/media-store.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { InMemoryMediaStore } from "./in-memory-media-store.js";
import {
  depositImage,
  noelBody,
  OpenOperationsAtCommerceConfig,
  OPERATIONS,
  stubAdminVerifier,
} from "./operations-at-commerce-scene.js";

/**
 * E2E — **l'écriture des opérations au commerce, OUVERTE** par la scène :
 * l'agrégat du lot 1 de `plan-l-operation-passe-au-commerce.md` écrit
 * vraiment `catalog_operations`, sous ses invariants, avec son auteur et son
 * journal — et ce que le commerce écrit se lit déjà par les lectures du
 * miroir, qui n'ont pas changé.
 *
 * Ouvert ici seulement : en production, l'interrupteur s'ouvre avec la
 * bascule (lot 3), quand le push ne porte plus d'opérations.
 */

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: AppConfig, value: new OpenOperationsAtCommerceConfig() },
      { token: MediaStore, value: new InMemoryMediaStore() },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

async function prepareNoel(): Promise<void> {
  const created = await staff().post(OPERATIONS).send(noelBody()).expect(201);
  expect(jsonBody<{ key: string }>(created)).toEqual({ key: "noel-2026" });
}

async function row() {
  return ctx.prisma.catalogOperation.findUniqueOrThrow({
    where: { key: "noel-2026" },
    include: { items: { orderBy: { position: "asc" } } },
  });
}

async function factTypes(): Promise<string[]> {
  const events = await ctx.prisma.activityEvent.findMany({
    where: { type: { startsWith: "catalog_operation." } },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    select: { type: true },
  });
  return events.map((event) => event.type);
}

describe("préparer au commerce", () => {
  it("écrit l'opération, son auteur, et la journalise ; le miroir la lit déjà", async () => {
    await prepareNoel();

    expect(await row()).toMatchObject({
      name: { fr: "Noël", en: "Christmas" },
      audience: "both",
      hidden: false,
      withdrawnAt: null,
      writtenBy: E2E_STAFF_ID,
      items: [],
    });
    expect(await factTypes()).toEqual(["catalog_operation.prepared"]);
    const [shown] = jsonBody<ReceivedOperationView[]>(
      await staff().get("/admin/catalog/operations").expect(200),
    );
    expect(shown).toMatchObject({ key: "noel-2026", withdrawn: false, override: null });
  });

  it("refuse une clé déjà prise en 409, et une clé mal formée en 400", async () => {
    await prepareNoel();

    const taken = await staff().post(OPERATIONS).send(noelBody()).expect(409);
    expect(taken.body).toMatchObject({ code: "operations.key_taken" });
    const malformed = await staff()
      .post(OPERATIONS)
      .send(noelBody({ key: "Noël" }))
      .expect(400);
    expect(malformed.body).toMatchObject({ code: "operations.key_invalid" });
  });

  it("refuse des dates qui se contredisent, sans rien écrire", async () => {
    const body = noelBody();

    const refused = await staff()
      .post(OPERATIONS)
      .send({ ...body, pickupFrom: body.pickupUntil, pickupUntil: body.pickupFrom })
      .expect(400);

    expect(refused.body).toMatchObject({ code: "operations.pickup_window_inverted" });
    expect(await ctx.prisma.catalogOperation.count()).toBe(0);
  });
});

/** Hugo, 2026-10-16 : « Commandez avant le… » dit l'heure, réglée par opération avec le calendrier. */
describe("l'heure de clôture, par opération", () => {
  async function shown(): Promise<boolean> {
    const view = jsonBody<CommerceOperationView>(
      await staff().get(`${OPERATIONS}/noel-2026`).expect(200),
    );
    return view.showsOrderUntilTime;
  }

  it("est affichée à la préparation, s'éteint avec le calendrier, et se journalise seule", async () => {
    await prepareNoel();
    expect(await row()).toMatchObject({ showsOrderUntilTime: true });
    expect(await shown()).toBe(true);

    const { announceFrom, orderFrom, orderUntil, pickupFrom, pickupUntil } = noelBody();
    const dates = { announceFrom, orderFrom, orderUntil, pickupFrom, pickupUntil };
    await staff()
      .put(`${OPERATIONS}/noel-2026/schedule`)
      .send({ ...dates, showsOrderUntilTime: false })
      .expect(200);

    expect(await row()).toMatchObject({ showsOrderUntilTime: false });
    expect(await shown()).toBe(false);
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "catalog_operation.rescheduled" },
    });
    expect(fact.payload).toMatchObject({
      changes: { showsOrderUntilTime: { from: true, to: false } },
    });

    // Un écran d'avant le réglage n'envoie pas le champ : il vaut « affichée ».
    await staff().put(`${OPERATIONS}/noel-2026/schedule`).send(dates).expect(200);
    expect(await shown()).toBe(true);
  });
});

describe("composer, masquer, archiver", () => {
  it("pose la sélection parmi les SKU du commerce, dans l'ordre, et refuse un inconnu", async () => {
    await prepareNoel();

    await staff()
      .put(`${OPERATIONS}/noel-2026/selection`)
      .send({ skus: ["VIE-002-1", "VIE-001-1"] })
      .expect(200);
    const unknown = await staff()
      .put(`${OPERATIONS}/noel-2026/selection`)
      .send({ skus: ["XXX-999-1"] })
      .expect(400);

    expect(unknown.body).toMatchObject({ code: "operations.sku_unknown" });
    expect((await row()).items.map((item) => item.sku)).toEqual(["VIE-002-1", "VIE-001-1"]);
  });

  it("masque et affiche — réversible, sans archiver — et change la clientèle", async () => {
    await prepareNoel();

    await staff().put(`${OPERATIONS}/noel-2026/visibility`).send({ hidden: true }).expect(200);
    expect(await row()).toMatchObject({ hidden: true, withdrawnAt: null });
    await staff().put(`${OPERATIONS}/noel-2026/visibility`).send({ hidden: false }).expect(200);
    await staff().put(`${OPERATIONS}/noel-2026/audience`).send({ audience: "pro" }).expect(200);

    expect(await row()).toMatchObject({ hidden: false, audience: "pro" });
    expect(await factTypes()).toEqual([
      "catalog_operation.prepared",
      "catalog_operation.hidden",
      "catalog_operation.shown",
      "catalog_operation.audience_changed",
    ]);
  });

  /**
   * Depuis le lot 2, l'image se choisit dans la médiathèque : une adresse
   * libre est refusée, et une image changée prend le point focal de LA
   * NOUVELLE — celui de l'ancienne décrivait une autre image.
   */
  it("redate et réécrit les textes ; une image changée prend le point de la nouvelle", async () => {
    await prepareNoel();
    const a = await depositImage(ctx, 1001, { x: 0.2, y: 0.8 });
    const b = await depositImage(ctx, 1002, null);
    await staff()
      .put(`${OPERATIONS}/noel-2026/presentation`)
      .send({ name: { fr: "Noël" }, lede: null, image: { url: a, alt: "" } })
      .expect(200);
    expect(await row()).toMatchObject({ imageUrl: a, imageFocalX: 0.2, imageFocalY: 0.8 });

    await staff()
      .put(`${OPERATIONS}/noel-2026/presentation`)
      .send({ name: { fr: "Noël" }, lede: null, image: { url: b, alt: "" } })
      .expect(200);
    const body = noelBody();
    const emptyWindow = await staff()
      .put(`${OPERATIONS}/noel-2026/schedule`)
      .send({
        announceFrom: body.announceFrom,
        orderFrom: null,
        orderUntil: body.announceFrom,
        pickupFrom: body.pickupFrom,
        pickupUntil: body.pickupUntil,
      })
      .expect(400);
    expect(emptyWindow.body).toMatchObject({ code: "operations.order_window_empty" });

    expect(await row()).toMatchObject({ imageUrl: b, imageFocalX: null, imageFocalY: null });
  });

  it("archive — la date du retrait est celle du geste — puis refuse tout geste en 409", async () => {
    await prepareNoel();

    await staff().put(`${OPERATIONS}/noel-2026/archive`).send({}).expect(200);
    const archived = await row();
    expect(archived.withdrawnAt).not.toBeNull();
    expect(archived.withdrawnAt).toEqual(archived.writtenAt);

    const refused = await staff()
      .put(`${OPERATIONS}/noel-2026/visibility`)
      .send({ hidden: true })
      .expect(409);
    expect(refused.body).toMatchObject({ code: "operations.archived" });
    const [shown] = jsonBody<ReceivedOperationView[]>(
      await staff().get("/admin/catalog/operations").expect(200),
    );
    expect(shown).toMatchObject({ key: "noel-2026", withdrawn: true });
  });

  it("répond 404 sur une opération inconnue", async () => {
    const missing = await staff()
      .put(`${OPERATIONS}/inconnue/audience`)
      .send({ audience: "pro" })
      .expect(404);

    expect(missing.body).toMatchObject({ code: "operations.not_found" });
  });
});
