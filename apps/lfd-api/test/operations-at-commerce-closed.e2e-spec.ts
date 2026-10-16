import type { StoredCatalogSnapshot, SyncOperation } from "@lfd/catalog-sync";
import type {
  OperationsMigrationReport,
  PendingDeliveryView,
  ReceivedOperationView,
  ShopCatalogueView,
} from "@lfd/contracts";
import request from "supertest";

import { CatalogDelivery } from "../src/b2b/catalog/domain/entities/catalog-delivery.js";
import { CatalogDeliveryRepository } from "../src/b2b/catalog/domain/ports/catalog-delivery.repository.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { snapshotOf } from "./catalog-ingest-fixtures.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  noelBody,
  OPERATIONS,
  staffWith,
  stubAdminVerifier,
} from "./operations-at-commerce-scene.js";

/**
 * E2E — **l'écriture des opérations au commerce, FERMÉE** : l'état dans
 * lequel le lot 1 de `plan-l-operation-passe-au-commerce.md` se déploie
 * (`OPERATIONS_AT_COMMERCE` absent).
 *
 * Ce que seul ce niveau prouve : les sept routes répondent le refus de la
 * porte sur le vrai module, rien n'est écrit en base, le mur `lfc_operations`
 * tient — et rien de servi ne change : le push écrit le miroir comme avant,
 * la surcharge de la réception se pose comme avant.
 */

let ctx: E2eContext;

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

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

const SCHEDULE = (({ announceFrom, orderFrom, orderUntil, pickupFrom, pickupUntil }) => ({
  announceFrom,
  orderFrom,
  orderUntil,
  pickupFrom,
  pickupUntil,
}))(noelBody());

/** Les sept gestes, chacun avec un corps de la bonne forme : seul l'interrupteur doit refuser. */
const WRITES: readonly [string, (who: () => ReturnType<E2eContext["http"]>) => Promise<unknown>][] =
  [
    ["préparer", (who) => who().post(OPERATIONS).send(noelBody())],
    [
      "éditer",
      (who) =>
        who()
          .put(`${OPERATIONS}/noel-2026/presentation`)
          .send({ name: { fr: "Noël" }, lede: null, image: null }),
    ],
    ["redater", (who) => who().put(`${OPERATIONS}/noel-2026/schedule`).send(SCHEDULE)],
    [
      "changer la clientèle",
      (who) => who().put(`${OPERATIONS}/noel-2026/audience`).send({ audience: "pro" }),
    ],
    ["masquer", (who) => who().put(`${OPERATIONS}/noel-2026/visibility`).send({ hidden: true })],
    [
      "choisir la sélection",
      (who) =>
        who()
          .put(`${OPERATIONS}/noel-2026/selection`)
          .send({ skus: ["VIE-001-1"] }),
    ],
    ["archiver", (who) => who().put(`${OPERATIONS}/noel-2026/archive`).send({})],
  ];

/** Le miroir tel que le push l'écrit — l'état servi qu'aucune route fermée ne doit toucher. */
async function mirrorRow() {
  return ctx.prisma.catalogOperation.findUnique({
    where: { key: "noel-2026" },
    include: { items: { orderBy: { position: "asc" } } },
  });
}

/** Une arrivée v11 portant Noël, déposée puis acceptée comme le fait la réception. */
async function pushNoel(): Promise<void> {
  const noel: SyncOperation = {
    key: "noel-2026",
    name: { fr: "Noël" },
    lede: null,
    image: null,
    announceFrom: daysAgo(-30),
    orderFrom: null,
    orderUntil: daysAgo(-77),
    pickupFrom: SCHEDULE.pickupFrom,
    pickupUntil: SCHEDULE.pickupUntil,
    audience: "both",
    skus: ["VIE-001-1"],
  };
  const snapshot: StoredCatalogSnapshot = snapshotOf(
    [{ sku: "VIE-001", priceMillicents: 210_000 }],
    [],
    [noel],
  );
  await ctx.app.get(CatalogDeliveryRepository).deliver(
    CatalogDelivery.receive({
      id: "d_closed",
      revisionId: "rev_closed",
      snapshot,
      fingerprint: "empreinte-closed",
      receivedAt: new Date(daysAgo(0)),
    }),
  );
  const pending = jsonBody<PendingDeliveryView>(
    await staff().get("/admin/catalog/delivery").expect(200),
  );
  await staff()
    .post("/admin/catalog/delivery/accept")
    .send({ deliveryId: pending.id, excludedSkus: [] })
    .expect(201);
}

describe("interrupteur fermé : les routes refusent, et n'écrivent rien", () => {
  it.each(WRITES)("refuse de %s en 409, et le refus nomme la bascule", async (_name, write) => {
    const refusal = (await write(staff)) as { status: number; body: unknown };

    expect(refusal.status).toBe(409);
    expect(refusal.body).toMatchObject({ code: "operations.writing_closed" });
    expect(await ctx.prisma.catalogOperation.count()).toBe(0);
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: { startsWith: "catalog_operation." } },
      }),
    ).toBe(0);
  });
});

describe("le mur `lfc_operations`", () => {
  it("sans le droit — le catalogue vendu ne suffit pas — : 403 avant la porte", async () => {
    const sub = await staffWith(ctx, "commercial-catalogue", [
      { resource: "b2b_catalog", action: "write" },
    ]);

    await ctx.asSub(sub).post(OPERATIONS).send(noelBody()).expect(403);
  });

  it("en lecture seule : 403 sur une écriture", async () => {
    const sub = await staffWith(ctx, "lecteur-operations", [
      { resource: "lfc_operations", action: "read" },
    ]);

    await ctx.asSub(sub).put(`${OPERATIONS}/noel-2026/archive`).send({}).expect(403);
  });

  it("avec le droit seul : la porte répond, fermée", async () => {
    const sub = await staffWith(ctx, "operations", [
      { resource: "lfc_operations", action: "write" },
    ]);

    await ctx.asSub(sub).post(OPERATIONS).send(noelBody()).expect(409);
  });
});

describe("rien de servi ne change", () => {
  it("le push écrit le miroir, que les routes fermées laissent intact", async () => {
    await pushNoel();
    const pushed = await mirrorRow();
    expect(pushed).toMatchObject({
      key: "noel-2026",
      hidden: false,
      writtenBy: null,
      writtenAt: null,
      withdrawnAt: null,
    });

    for (const [, write] of WRITES) {
      await write(staff);
    }

    expect(await mirrorRow()).toEqual(pushed);
  });

  it("la surcharge de la réception se pose et se lit comme avant", async () => {
    await pushNoel();

    await staff()
      .put("/admin/catalog/operations/noel-2026/override")
      .send({ isHidden: true, orderUntil: null, audience: "pro", hiddenSkus: [] })
      .expect(204);

    const [shown] = jsonBody<ReceivedOperationView[]>(
      await staff().get("/admin/catalog/operations").expect(200),
    );
    expect(shown).toMatchObject({
      key: "noel-2026",
      skus: ["VIE-001-1"],
      override: { isHidden: true, audience: "pro" },
      effective: { isHidden: true, audience: "pro", skus: ["VIE-001-1"] },
    });
  });
});

/**
 * Lot 3 : tout ce que la bascule ajoute est derrière l'interrupteur — fermé,
 * l'écran ne lit rien, la migration ne s'applique pas, et la vitrine sert
 * EXACTEMENT ce qu'elle servait.
 */
describe("lot 3, interrupteur fermé", () => {
  /** Annoncée depuis hier, commandes dans cinq jours — par défaut, aucun article au rayon. */
  async function pushAnnounced(skus: readonly string[] = []): Promise<void> {
    const noel: SyncOperation = {
      key: "noel-2026",
      name: { fr: "Noël" },
      lede: null,
      image: null,
      announceFrom: daysAgo(1),
      orderFrom: daysAgo(-5),
      orderUntil: daysAgo(-20),
      pickupFrom: SCHEDULE.pickupFrom,
      pickupUntil: SCHEDULE.pickupUntil,
      audience: "both",
      skus: [...skus],
    };
    await ctx.app.get(CatalogDeliveryRepository).deliver(
      CatalogDelivery.receive({
        id: "d_closed_empty",
        revisionId: "rev_closed_empty",
        snapshot: snapshotOf([{ sku: "VIE-001", priceMillicents: 210_000 }], [], [noel]),
        fingerprint: "empreinte-closed-empty",
        receivedAt: new Date(daysAgo(0)),
      }),
    );
    const pending = jsonBody<PendingDeliveryView>(
      await staff().get("/admin/catalog/delivery").expect(200),
    );
    await staff()
      .post("/admin/catalog/delivery/accept")
      .send({ deliveryId: pending.id, excludedSkus: [] })
      .expect(201);
  }

  it("l'écran ne lit rien : 409, il ouvre avec la bascule", async () => {
    await pushNoel();

    for (const path of [OPERATIONS, `${OPERATIONS}/noel-2026`]) {
      const refused = await staff().get(path).expect(409);
      expect(refused.body).toMatchObject({ code: "operations.not_at_commerce" });
    }
  });

  it("l'aperçu de la migration se relit, l'application refuse et n'écrit rien", async () => {
    await pushNoel();
    const pushed = await mirrorRow();

    const report = jsonBody<OperationsMigrationReport>(
      await staff().get(`${OPERATIONS}/migration`).expect(200),
    );
    const refused = await staff().post(`${OPERATIONS}/migration`).expect(409);

    expect(report.counts).toMatchObject({ referential: 0, mirror: 1, mirrorOnly: 1 });
    expect(refused.body).toMatchObject({ code: "operations.writing_closed" });
    expect(await mirrorRow()).toEqual(pushed);
  });

  it("la vitrine ne montre pas un rayon d'opération vide, et sa vue n'a pas un champ de plus", async () => {
    await pushAnnounced();

    const shop = jsonBody<ShopCatalogueView>(
      await request(ctx.app.getHttpServer()).get("/shop/catalogue").expect(200),
    );

    expect(shop.operations).toEqual([]);
  });

  it("un rayon peuplé se sert comme avant, sans date d'annonce ni attente", async () => {
    await pushAnnounced(["VIE-001-1"]);

    const shop = jsonBody<ShopCatalogueView>(
      await request(ctx.app.getHttpServer()).get("/shop/catalogue").expect(200),
    );

    expect(shop.operations).toHaveLength(1);
    expect(Object.keys(shop.operations[0] ?? {}).sort()).toEqual([
      "image",
      "key",
      "lede",
      "name",
      "orderFrom",
      "orderUntil",
      "pickupFrom",
      "pickupUntil",
      "skus",
      "state",
    ]);
  });
});
