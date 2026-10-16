import type { SyncOperation } from "@lfd/catalog-sync";
import type {
  CommerceOperationView,
  OperationsMigrationReport,
  ShopCatalogueView,
} from "@lfd/contracts";
import request from "supertest";

import { CatalogOperationsReader } from "../src/b2b/catalog/domain/ports/catalog-operations.reader.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { AppConfig } from "../src/platform/config/app-config.js";
import { MediaStore } from "../src/platform/storage/media-store.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { InMemoryMediaStore } from "./in-memory-media-store.js";
import {
  depositImage,
  noelBody,
  OPERATIONS,
  stubAdminVerifier,
  SwitchableOperationsConfig,
} from "./operations-at-commerce-scene.js";
import { pimSku, push, settle } from "./operations-switch-scene.js";

/**
 * E2E — **la bascule des opérations au commerce, interrupteur OUVERT** (lot 3
 * de `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`).
 *
 * Ce que seul ce niveau prouve, sur le vrai module et la vraie base : le push
 * n'écrase plus rien, le référentiel refuse d'écrire, son fait d'image est
 * inerte, l'aperçu compare EXACTEMENT référentiel, miroir et résultat sur un
 * semis avec surcharge, l'application est rejouable et ne déplace aucune
 * fenêtre effective — et la boutique lit l'opération du commerce : son encart
 * sans article pendant l'annonce, `awaitingProducts`, le texte alternatif de
 * la médiathèque.
 */

let ctx: E2eContext;
const config = new SwitchableOperationsConfig();

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: AppConfig, value: config },
      { token: MediaStore, value: new InMemoryMediaStore() },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  config.atCommerce = true;
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);
const MIGRATION = `${OPERATIONS}/migration`;

/** Annoncée dans un mois, ouverte à six semaines, close à onze, retirée la semaine d'après. */
const ANNOUNCE = daysAgo(-30);
const ORDER_FROM = daysAgo(-45);
const ORDER_UNTIL = daysAgo(-80);
/** La clôture que la réception avait avancée. */
const EARLIER = daysAgo(-60);
const PICKUP_FROM = serviceDay(78);
const PICKUP_UNTIL = serviceDay(84);

function pimNoel(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: "noel-2026",
    name: { fr: "Noël" },
    lede: { fr: "La bûche revient" },
    image: null,
    announceFrom: ANNOUNCE,
    orderFrom: ORDER_FROM,
    orderUntil: ORDER_UNTIL,
    pickupFrom: PICKUP_FROM,
    pickupUntil: PICKUP_UNTIL,
    audience: "both",
    ...over,
  };
}

function syncNoel(skus: readonly string[], over: Partial<SyncOperation> = {}): SyncOperation {
  return {
    key: "noel-2026",
    name: { fr: "Noël" },
    lede: { fr: "La bûche revient" },
    image: null,
    announceFrom: ANNOUNCE,
    orderFrom: ORDER_FROM,
    orderUntil: ORDER_UNTIL,
    pickupFrom: PICKUP_FROM,
    pickupUntil: PICKUP_UNTIL,
    audience: "both",
    skus: [...skus],
    ...over,
  };
}

/**
 * Le semis d'avant la bascule, interrupteur FERMÉ : Noël préparé au
 * référentiel avec deux articles, poussé, restreint à la réception (clôture
 * avancée, pros seulement, galette retirée) — puis RENOMMÉ au référentiel
 * sans push : le miroir est périmé, la migration doit repartir du référentiel.
 */
async function seedBeforeSwitch(): Promise<{ buche: string; galette: string }> {
  return config.closedFor(async () => {
    const buche = await pimSku(ctx, "Bûche");
    const galette = await pimSku(ctx, "Galette");
    await staff().post("/pim/operations").send(pimNoel()).expect(201);
    await staff()
      .put("/pim/operations/noel-2026/selection")
      .send({ skus: [buche, galette] })
      .expect(200);
    await push(ctx, [buche, galette], [syncNoel([buche, galette])]);
    await staff()
      .put("/admin/catalog/operations/noel-2026/override")
      .send({ isHidden: false, orderUntil: EARLIER, audience: "pro", hiddenSkus: [galette] })
      .expect(204);
    await staff()
      .put("/pim/operations/noel-2026/presentation")
      .send({ name: { fr: "Noël 2026" }, lede: { fr: "La bûche revient" }, image: null })
      .expect(200);
    return { buche, galette };
  });
}

async function preview(): Promise<OperationsMigrationReport> {
  return jsonBody<OperationsMigrationReport>(await staff().get(MIGRATION).expect(200));
}

async function apply(): Promise<OperationsMigrationReport> {
  return jsonBody<OperationsMigrationReport>(await staff().post(MIGRATION).expect(201));
}

function fieldOf(report: OperationsMigrationReport, field: string) {
  return report.operations[0]?.fields.find((line) => line.field === field);
}

async function carriedOver(): Promise<number> {
  return ctx.prisma.activityEvent.count({
    where: { type: "catalog_operation.restriction_carried_over" },
  });
}

/** Ce que la boutique applique — ce que la migration ne doit pas déplacer. */
async function applied() {
  const [operation] = await ctx.app.get(CatalogOperationsReader).sellableOperations();
  return operation === undefined
    ? null
    : { orderUntil: operation.orderUntil, audience: operation.audience, skus: operation.skus };
}

describe("la migration depuis le référentiel", () => {
  it("l'aperçu compare champ par champ, sur un semis avec surcharge", async () => {
    const { buche, galette } = await seedBeforeSwitch();

    const report = await preview();

    expect(report).toMatchObject({
      blocked: false,
      counts: { referential: 1, mirror: 1, restrictions: 1, toWrite: 1, alreadyAtCommerce: 0 },
    });
    expect(report.operations[0]).toMatchObject({
      key: "noel-2026",
      outcome: "adopt",
      droppedSkus: [],
      problems: [],
      restriction: { audience: "pro", hiddenSkus: [galette], decidedBy: E2E_STAFF_ID },
    });
    expect(fieldOf(report, "name")).toEqual({
      field: "name",
      referential: "Noël 2026",
      mirror: "Noël",
      result: "Noël 2026",
      restricted: false,
      explanation: "referential_newer",
    });
    expect(fieldOf(report, "orderUntil")).toEqual({
      field: "orderUntil",
      referential: ORDER_UNTIL,
      mirror: EARLIER,
      result: EARLIER,
      restricted: true,
      explanation: "same",
    });
    expect(fieldOf(report, "audience")).toMatchObject({ result: "pro", restricted: true });
    expect(fieldOf(report, "skus")).toMatchObject({
      referential: `${buche}, ${galette}`,
      mirror: buche,
      result: buche,
      explanation: "same",
    });
    expect(
      await ctx.prisma.catalogOperation.findUniqueOrThrow({ where: { key: "noel-2026" } }),
    ).toMatchObject({ writtenAt: null });
  });

  it("l'aperçu se lit interrupteur fermé ; l'application, non", async () => {
    await seedBeforeSwitch();
    config.atCommerce = false;

    await staff().get(MIGRATION).expect(200);
    const refused = await staff().post(MIGRATION).expect(409);

    expect(refused.body).toMatchObject({ code: "operations.writing_closed" });
  });

  it("applique, trace la restriction, ne déplace aucune fenêtre effective, et se rejoue sans rien écrire", async () => {
    const { buche } = await seedBeforeSwitch();
    const before = await applied();

    const after = await apply();

    expect(after.counts).toMatchObject({ toWrite: 0, alreadyAtCommerce: 1 });
    expect(after.operations[0]?.outcome).toBe("already_at_commerce");
    const row = await ctx.prisma.catalogOperation.findUniqueOrThrow({
      where: { key: "noel-2026" },
      include: { items: { orderBy: { position: "asc" } } },
    });
    expect(row).toMatchObject({
      name: { fr: "Noël 2026" },
      audience: "pro",
      orderUntil: new Date(EARLIER),
      hidden: false,
      writtenBy: E2E_STAFF_ID,
      items: [expect.objectContaining({ sku: buche })],
    });
    expect(row.receivedAt).toEqual(row.writtenAt);
    expect(await applied()).toEqual(before);
    expect(await carriedOver()).toBe(1);

    const again = await apply();

    expect(again.counts).toMatchObject({ toWrite: 0, alreadyAtCommerce: 1 });
    expect(await carriedOver()).toBe(1);
    expect(
      await ctx.prisma.catalogOperation.findUniqueOrThrow({ where: { key: "noel-2026" } }),
    ).toMatchObject({ writtenAt: row.writtenAt });
  });

  it("une copie pas encore reprise ne s'écrit pas au commerce", async () => {
    await seedBeforeSwitch();

    const refused = await staff()
      .put(`${OPERATIONS}/noel-2026/visibility`)
      .send({ hidden: true })
      .expect(409);

    expect(refused.body).toMatchObject({ code: "operations.awaiting_migration" });
  });
});

describe("ce que la bascule coupe", () => {
  it("le push n'écrase plus une opération, et n'en retire plus", async () => {
    const { buche } = await seedBeforeSwitch();
    await apply();
    const migrated = await ctx.prisma.catalogOperation.findUniqueOrThrow({
      where: { key: "noel-2026" },
    });

    await push(ctx, [buche], [syncNoel([buche], { key: "galette-2027", name: { fr: "Galette" } })]);

    expect(
      await ctx.prisma.catalogOperation.findUniqueOrThrow({ where: { key: "noel-2026" } }),
    ).toEqual(migrated);
    expect(await ctx.prisma.catalogOperation.count()).toBe(1);
  });

  it("le référentiel refuse d'écrire une opération", async () => {
    const refused = await staff().post("/pim/operations").send(pimNoel()).expect(409);

    expect(refused.body).toMatchObject({ code: "pim.operation.moved_to_commerce" });
    expect(await ctx.prisma.operation.count()).toBe(0);
  });

  it("le fait d'image du référentiel n'écrit plus au commerce", async () => {
    await seedBeforeSwitch();
    const image = await depositImage(ctx, 1003, null);
    await config.closedFor(() =>
      staff()
        .put("/pim/operations/noel-2026/presentation")
        .send({ name: { fr: "Noël 2026" }, lede: null, image: { url: image, alt: "" } })
        .expect(200),
    );

    await settle(ctx);

    // Le fait est bien parti ET a été livré à l'abonné — qui n'a rien écrit.
    const deliveries = await ctx.prisma.outboxDelivery.findMany({
      where: {
        subscriber: "catalog.project-operation-image",
        message: { type: "pim.operation_image_changed" },
      },
      select: { deliveredAt: true, lastError: true },
    });
    expect(
      deliveries.map((row) => ({ delivered: row.deliveredAt !== null, lastError: row.lastError })),
    ).toEqual([{ delivered: true, lastError: null }]);
    expect(
      await ctx.prisma.catalogOperation.findUniqueOrThrow({ where: { key: "noel-2026" } }),
    ).toMatchObject({ imageUrl: null });
  });
});

describe("les lectures de l'écran et la boutique", () => {
  const shop = async (): Promise<ShopCatalogueView> =>
    jsonBody<ShopCatalogueView>(
      await request(ctx.app.getHttpServer()).get("/shop/catalogue").expect(200),
    );

  /** Annoncée depuis hier, commandes dans cinq jours : la fenêtre d'annonce court. */
  const announced = () =>
    noelBody({
      announceFrom: daysAgo(1),
      orderFrom: daysAgo(-5),
      orderUntil: daysAgo(-20),
      pickupFrom: serviceDay(22),
      pickupUntil: serviceDay(24),
    });

  it("pendant l'annonce, le rayon paraît sur son seul encart ; commandes ouvertes, il attend ses produits", async () => {
    const body = announced();
    await staff().post(OPERATIONS).send(body).expect(201);

    const [shown, ...others] = (await shop()).operations;
    expect(others).toEqual([]);
    expect(shown).toMatchObject({
      key: "noel-2026",
      state: "announced",
      skus: [],
      awaitingProducts: false,
    });
    expect(shown?.announceFrom).toBe(new Date(body.announceFrom).toISOString());
    const view = jsonBody<CommerceOperationView>(
      await staff().get(`${OPERATIONS}/noel-2026`).expect(200),
    );
    expect(view).toMatchObject({
      state: "announced",
      withoutSellingArticle: true,
      shopDisplay: "announcement_only",
      awaitingProducts: false,
    });

    const { announceFrom, orderUntil, pickupFrom, pickupUntil } = body;
    await staff()
      .put(`${OPERATIONS}/noel-2026/schedule`)
      .send({ announceFrom, orderFrom: daysAgo(0.5), orderUntil, pickupFrom, pickupUntil })
      .expect(200);

    expect((await shop()).operations[0]).toMatchObject({ state: "open", awaitingProducts: true });
  });

  it("masquée : rien en boutique, et l'écran le dit", async () => {
    await staff().post(OPERATIONS).send(announced()).expect(201);
    await staff().put(`${OPERATIONS}/noel-2026/visibility`).send({ hidden: true }).expect(200);

    expect((await shop()).operations).toEqual([]);
    const [view] = jsonBody<CommerceOperationView[]>(await staff().get(OPERATIONS).expect(200));
    expect(view).toMatchObject({ hidden: true, shopDisplay: "nothing" });
  });

  it("le texte alternatif vient de la médiathèque, à l'écran comme en boutique", async () => {
    const url = await depositImage(ctx, 1004, { x: 0.3, y: 0.7 });
    await staff()
      .put("/media")
      .send({
        url,
        name: "bûche",
        tags: [],
        alt: { fr: "Une bûche roulée" },
        focal: { x: 0.3, y: 0.7 },
      })
      .expect(200);
    await staff()
      .post(OPERATIONS)
      .send({ ...announced(), image: { url } })
      .expect(201);

    const view = jsonBody<CommerceOperationView>(
      await staff().get(`${OPERATIONS}/noel-2026`).expect(200),
    );
    expect(view.image).toEqual({ url, alt: "Une bûche roulée", focal: { x: 0.3, y: 0.7 } });
    expect((await shop()).operations[0]?.image).toMatchObject({ url, alt: "Une bûche roulée" });
    expect(
      await ctx.prisma.catalogOperation.findUniqueOrThrow({ where: { key: "noel-2026" } }),
    ).toMatchObject({ imageAlt: null });
  });
});
