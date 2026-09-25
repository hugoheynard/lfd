/**
 * E2E du **catalogue de l'éditeur de vitrine** — `GET /admin/storefront/catalog`.
 *
 * Pourquoi cette route existe : l'éditeur lisait `/admin/catalog`, muré par
 * `b2b_catalog`, que la communication n'a pas — l'éditeur lui rendait un 403.
 * Ce que seul ce niveau prouve : le mur `b2b_storefront` réellement résolu, la
 * lecture traversant le vrai catalogue ingéré, et qu'aucun prix n'en sort.
 */
import type { StorefrontCatalogView } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";
import {
  CATALOG_SNAPSHOT_VERSION,
  type CatalogSnapshot,
  type SyncOperation,
} from "@lfd/catalog-sync";

import { B2bCatalogDriver } from "../src/pim/channels/b2b-platform/products/driver.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";

const ROUTE = "/admin/storefront/catalog";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

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
  await ctx.app.get(B2bCatalogDriver).send(snapshot(), {
    revisionId: "rev_e2e",
    fingerprint: "empreinte-e2e",
  });
});

function product(id: string, sku: string, name: string): CatalogSnapshot["products"][number] {
  return {
    id,
    sku,
    name,
    categoryId: "cat_vien",
    kind: "daily",
    variants: [
      {
        id: `${id}_v`,
        sku: `${sku}-1`,
        name,
        priceMillicents: millicentsFromCents(200),
        weightGrams: null,
        isDefault: true,
        position: 0,
        vatRatePercent: 5.5,
        publicTtcCents: 250,
        publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 236_967 } },
        allergens: null,
        allergenLabels: null,
      },
    ],
    note: null,
    image: null,
    thumbnail: null,
    operationOnly: false,
  };
}

/** Noël, annoncé il y a deux jours, commande ouverte dans trois — dates relatives. */
const NOEL: SyncOperation = {
  key: "noel",
  name: { fr: "Noël", en: "Christmas" },
  lede: null,
  image: null,
  announceFrom: daysAgo(2),
  orderFrom: daysAgo(-3),
  orderUntil: daysAgo(-10),
  pickupFrom: serviceDay(12),
  pickupUntil: serviceDay(14),
  audience: "both",
  skus: ["VIE-001-1"],
};

/** `generatedAt` n'est comparé à aucune horloge : c'est une étiquette de push. */
function snapshot(operations: SyncOperation[] = []): CatalogSnapshot {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt: "2026-08-17T08:00:00.000Z",
    categories: [
      {
        id: "cat_vien",
        name: "Viennoiseries",
        slug: "viennoiseries",
        parentId: null,
        position: 0,
        vatRatePercent: 5.5,
      },
    ],
    products: [
      product("prd_1", "VIE-001", "Croissant"),
      product("prd_2", "VIE-002", "Chocolatine"),
    ],
    orderTimeLimits: [],
    operations,
  };
}

async function person(role: "communication" | "commercial"): Promise<string> {
  const sub = `staff-${role}`;
  await ctx.prisma.staffUser.create({
    data: {
      id: `fiche-${role}`,
      firstName: "Fiche",
      lastName: role,
      email: `${role}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  return sub;
}

describe("GET /admin/storefront/catalog", () => {
  it("la communication lit les rayons et les articles, sans aucun prix", async () => {
    const sub = await person("communication");

    const response = await ctx.asSub(sub).get(ROUTE).expect(200);

    expect(jsonBody<StorefrontCatalogView>(response)).toEqual({
      shelves: [{ key: "cat_vien", name: "Viennoiseries", operation: false }],
      items: [
        { sku: "VIE-001", name: "Croissant", shelfKey: "cat_vien", served: true },
        { sku: "VIE-002", name: "Chocolatine", shelfKey: "cat_vien", served: true },
      ],
      operations: [],
    });
    expect(response.text).not.toMatch(/price|millicents|cents|vat/iu);
  });

  it("le commercial, sans `b2b_storefront`, est refusé", async () => {
    const sub = await person("commercial");

    await ctx.asSub(sub).get(ROUTE).expect(403);
  });

  it("un article masqué des deux boutiques est rendu, mais non servi", async () => {
    const staff = ctx.asSub(E2E_STAFF_SUB);
    await staff.put("/admin/catalog/VIE-002-1/visibility").send({ hidden: true }).expect(204);
    await ctx
      .asSub(E2E_STAFF_SUB)
      .put("/admin/catalog/VIE-002-1/public-visibility")
      .send({ hidden: true })
      .expect(204);

    const view = jsonBody<StorefrontCatalogView>(await staff.get(ROUTE).expect(200));

    expect(view.items).toContainEqual({
      sku: "VIE-002",
      name: "Chocolatine",
      shelfKey: "cat_vien",
      served: false,
    });
    expect(view.items).toContainEqual(expect.objectContaining({ sku: "VIE-001", served: true }));
  });

  it("propose le rayon op:<key> d'une opération reçue, et l'opération comme cible d'annonce", async () => {
    await ctx.app.get(B2bCatalogDriver).send(snapshot([NOEL]), {
      revisionId: "rev_e2e_op",
      fingerprint: "empreinte-e2e-op",
    });
    const sub = await person("communication");

    const view = jsonBody<StorefrontCatalogView>(await ctx.asSub(sub).get(ROUTE).expect(200));

    expect(view.shelves).toEqual([
      { key: "op:noel", name: "Noël", operation: true },
      { key: "cat_vien", name: "Viennoiseries", operation: false },
    ]);
    expect(view.operations).toEqual([
      {
        key: "noel",
        name: { fr: "Noël", en: "Christmas" },
        lede: null,
        image: null,
        state: "announced",
        announceFrom: NOEL.announceFrom,
        orderFrom: NOEL.orderFrom,
        orderUntil: NOEL.orderUntil,
        pickupFrom: NOEL.pickupFrom,
        pickupUntil: NOEL.pickupUntil,
      },
    ]);
  });
});
