/**
 * E2E des **annonces liées à une opération datée** — D11 de
 * `documentation/order/architecture-operations-datees.md`, lot 5.
 *
 * Ce que seul ce niveau prouve : une annonce enregistrée par le vrai `PUT`
 * (titre vide, hérité) se relit par la vraie route publique, résolue contre le
 * vrai miroir des opérations écrit par un envoi v11 — et s'éteint hors de sa
 * fenêtre, pour une autre clientèle, ou quand la réception masque l'opération.
 * Et que la base refuse, elle aussi, un rayon ET une opération à la fois.
 *
 * 🔴 Toutes les dates d'opération sont RELATIVES à maintenant : la lecture
 * les compare à l'horloge.
 */
import { randomUUID } from "node:crypto";

import type { SyncOperation } from "@lfd/catalog-sync";
import type {
  PublicStorefrontContent,
  PublicStorefrontPageView,
  StorefrontPayloadInput,
  StorefrontView,
} from "@lfd/contracts";

import { CustomerRole } from "../src/platform/database/client/client.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { B2bCatalogDriver } from "../src/pim/channels/b2b-platform/products/driver.js";
import { snapshotOf } from "./catalog-ingest-fixtures.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const MEMBER = "auth0|storefront-op-member";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;
let companyId = "";

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
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const company = await createCompany(ctx.prisma, { status: "active" });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  companyId = company.id;
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Noël, ANNONCÉ : annoncé il y a deux jours, commande ouverte dans trois. */
function noel(over: Partial<SyncOperation> = {}): SyncOperation {
  return {
    key: "noel",
    name: { fr: "Noël", en: "Christmas" },
    lede: { fr: "Bûches et chocolats" },
    image: { url: "https://cdn.example/noel.jpg", alt: "Une bûche" },
    announceFrom: daysAgo(2),
    orderFrom: daysAgo(-3),
    orderUntil: daysAgo(-10),
    pickupFrom: serviceDay(12),
    pickupUntil: serviceDay(14),
    audience: "both",
    skus: ["VIE-001-1"],
    ...over,
  };
}

async function receive(operations: readonly SyncOperation[]): Promise<void> {
  await ctx.app
    .get(B2bCatalogDriver)
    .send(snapshotOf([{ sku: "VIE-001", priceMillicents: 210_000 }], [], operations), {
      revisionId: `rev_${randomUUID()}`,
      fingerprint: `empreinte-${randomUUID()}`,
    });
}

type ContentInput = StorefrontPayloadInput["objects"][number]["contents"][number];

/** L'annonce liée à Noël : tout hérité. */
const LINKED: ContentInput = {
  kind: "info",
  badge: null,
  title: { fr: "" },
  lede: null,
  image: null,
  linkShelfKey: null,
  operationKey: "noel",
  action: "operation",
};

const CLOSED_ON_25: ContentInput = {
  kind: "info",
  badge: null,
  title: { fr: "Fermé le 25" },
  lede: null,
  image: null,
  linkShelfKey: null,
};

/** Enregistre une vitrine à un objet (bande à plusieurs contenus) sur « Tout ». */
async function compose(contents: readonly ContentInput[]): Promise<void> {
  const payload: StorefrontPayloadInput = {
    revision: 0,
    pages: [{ shelfKey: "all", rows: 2 }],
    templates: [],
    objects: [
      {
        shape: "band",
        applyOnMobile: true,
        mediaFit: "cover",
        mediaSide: "left",
        multiple: true,
        carousel: {
          nav: "dots",
          autoplay: false,
          intervalSeconds: 5,
          firstSeconds: 8,
          sampleCount: 3,
        },
        column: 1,
        row: 1,
        shelves: ["all"],
        contents: [...contents],
      },
    ],
  };
  await staff().put("/admin/storefront").send(payload).expect(204);
}

async function publicContents(): Promise<readonly PublicStorefrontContent[]> {
  const page = jsonBody<PublicStorefrontPageView>(
    await ctx.http().get("/shop/storefront/all").expect(200),
  );
  return page.objects[0]?.contents ?? [];
}

async function proContents(): Promise<readonly PublicStorefrontContent[]> {
  const page = jsonBody<PublicStorefrontPageView>(
    await ctx
      .asSub(MEMBER)
      .get("/shop/storefront/all/mine")
      .set("x-lfc-company", companyId)
      .expect(200),
  );
  return page.objects[0]?.contents ?? [];
}

describe("l'annonce liée, enregistrée", () => {
  it("s'enregistre sans titre, et l'éditeur la relit hérité, action comprise", async () => {
    await compose([LINKED]);

    const view = jsonBody<StorefrontView>(await staff().get("/admin/storefront").expect(200));
    expect(view.objects[0]?.contents).toEqual([
      { ...LINKED, title: { fr: "" }, operationKey: "noel", action: "operation" },
    ]);
  });

  it("une opération que le miroir ne connaît pas encore s'enregistre quand même", async () => {
    await compose([{ ...LINKED, operationKey: "paques-2031" }]);
  });

  it("refuse un rayon ET une opération, et une clé mal formée (400)", async () => {
    const refused = (content: ContentInput) =>
      staff()
        .put("/admin/storefront")
        .send({
          revision: 0,
          pages: [{ shelfKey: "all", rows: 2 }],
          templates: [],
          objects: [
            {
              shape: "card",
              applyOnMobile: true,
              mediaFit: "cover",
              mediaSide: "top",
              multiple: false,
              carousel: {
                nav: "dots",
                autoplay: false,
                intervalSeconds: 5,
                firstSeconds: 8,
                sampleCount: 3,
              },
              column: 1,
              row: 1,
              shelves: ["all"],
              contents: [content],
            },
          ],
        })
        .expect(400);

    await refused({ ...LINKED, linkShelfKey: "cat_vien", action: undefined });
    await refused({ ...LINKED, operationKey: "Noël 2026" });
  });

  it("compose la page du rayon op:<key>", async () => {
    await staff()
      .put("/admin/storefront")
      .send({ revision: 0, pages: [{ shelfKey: "op:noel", rows: 1 }], templates: [], objects: [] })
      .expect(204);

    const page = jsonBody<PublicStorefrontPageView>(
      await ctx.http().get("/shop/storefront/op:noel").expect(200),
    );
    expect(page).toEqual({ rows: 1, objects: [] });
  });
});

describe("la lecture publique", () => {
  it("sert l'annonce d'une opération annoncée, héritée, avec son bloc", async () => {
    const announced = noel();
    await receive([announced]);
    await compose([LINKED]);

    const [content] = await publicContents();
    expect(content).toEqual({
      ...LINKED,
      title: { fr: "Noël", en: "Christmas" },
      lede: { fr: "Bûches et chocolats" },
      image: { url: "https://cdn.example/noel.jpg", alt: { fr: "Une bûche" } },
      operation: {
        key: "noel",
        state: "announced",
        orderFrom: announced.orderFrom,
        orderUntil: announced.orderUntil,
        pickupFrom: announced.pickupFrom,
        pickupUntil: announced.pickupUntil,
      },
    });
  });

  it("un champ rempli surcharge l'héritage", async () => {
    await receive([noel()]);
    await compose([{ ...LINKED, title: { fr: "Le rayon de Noël" }, badge: { fr: "J-18" } }]);

    const [content] = await publicContents();
    expect(content).toMatchObject({
      title: { fr: "Le rayon de Noël" },
      badge: { fr: "J-18" },
      lede: { fr: "Bûches et chocolats" },
    });
  });

  it("hors fenêtre, l'annonce s'éteint ; les autres contenus restent", async () => {
    await receive([
      noel({
        announceFrom: daysAgo(-20),
        orderFrom: null,
        orderUntil: daysAgo(-40),
        pickupFrom: serviceDay(41),
        pickupUntil: serviceDay(43),
      }),
    ]);
    await compose([LINKED, CLOSED_ON_25]);

    expect(await publicContents()).toEqual([
      { ...CLOSED_ON_25, operationKey: null, action: "none", operation: null },
    ]);
  });

  it("réservée aux pros : éteinte pour un visiteur, allumée pour une société", async () => {
    await receive([noel({ audience: "pro" })]);
    await compose([LINKED]);

    expect(await publicContents()).toEqual([]);
    expect(await proContents()).toEqual([
      expect.objectContaining({ operationKey: "noel", title: { fr: "Noël", en: "Christmas" } }),
    ]);
  });

  it("masquée à la réception, elle s'éteint", async () => {
    await receive([noel()]);
    await staff()
      .put("/admin/catalog/operations/noel/override")
      .send({ isHidden: true, orderUntil: null, audience: null, hiddenSkus: [] })
      .expect(204);
    await compose([LINKED]);

    expect(await publicContents()).toEqual([]);
  });

  it("retirée du dernier envoi, elle s'éteint", async () => {
    await receive([noel()]);
    await receive([]);
    await compose([LINKED]);

    expect(await publicContents()).toEqual([]);
  });
});

describe("la base refuse ce que le domaine refuse", () => {
  it("un rayon ET une opération, une clé mal formée, une info sans titre ni opération", async () => {
    await compose([CLOSED_ON_25]);
    const refuses = async (sql: string): Promise<void> => {
      await expect(ctx.prisma.$executeRawUnsafe(sql)).rejects.toThrow(/check constraint/iu);
    };
    const host = await ctx.prisma.storefrontObject.findFirstOrThrow({ select: { id: true } });
    const insert = (id: string, position: number, columns: string, values: string): string =>
      `INSERT INTO "public"."storefront_content" ("id", "object_id", "position", "kind", ${columns}) VALUES ('${id}', '${host.id}', ${String(position)}, 'info', ${values})`;

    await refuses(insert("c1", 5, `"link_shelf_key", "operation_key"`, `'cat_vien', 'noel'`));
    await refuses(insert("c2", 6, `"operation_key"`, `'Noël'`));
    await refuses(insert("c3", 7, `"link_shelf_key"`, `'cat_vien'`));
    await ctx.prisma.$executeRawUnsafe(insert("c4", 8, `"operation_key"`, `'noel'`));
  });
});
