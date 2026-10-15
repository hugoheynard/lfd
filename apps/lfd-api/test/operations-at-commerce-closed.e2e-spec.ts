import type { StoredCatalogSnapshot, SyncOperation } from "@lfd/catalog-sync";
import type { PendingDeliveryView, ReceivedOperationView } from "@lfd/contracts";

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
