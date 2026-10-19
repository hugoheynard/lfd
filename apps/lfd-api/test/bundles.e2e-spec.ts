import type { BundleChoiceCandidateView, BundleView, CreateBundlePayload } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { deliverAsFacts } from "./catalog-facts-delivery.js";
import { snapshotOf } from "./catalog-ingest-fixtures.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { staffWith, stubAdminVerifier } from "./operations-at-commerce-scene.js";

/**
 * E2E — **les formules, leur composition** (lot F2a de
 * `documentation/formules/plan-les-formules.md`) : l'agrégat écrit vraiment
 * `bundles`, `bundle_groups` et `bundle_choices`, sous ses invariants, avec
 * son auteur et son journal ; les articles sont jugés par le VRAI catalogue
 * du commerce (`servedTo(item, "public")`, `operationOnly`).
 */

const BUNDLES = "/admin/bundles";
const KEY = "petit-dejeuner";

/** Un croissant et un café servis à tous ; un article pro ; une bûche réservée aux opérations. */
const CROISSANT = "VIE-001-1";
const COFFEE = "BOI-001-1";
const PRO_ONLY = "PRO-001-1";
const YULE_LOG = "PAT-002-1";

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
  await deliverAsFacts(
    ctx,
    snapshotOf([
      { sku: "VIE-001", priceMillicents: 110_000 },
      { sku: "BOI-001", priceMillicents: 150_000 },
      { sku: "PRO-001", priceMillicents: 900_000 },
      { sku: "PAT-002", priceMillicents: 2_900_000, operationOnly: true },
    ]),
  );
  // Réservé aux pros par le référentiel : le fait de la fiche l'aurait dit ainsi.
  await ctx.prisma.catalogItem.update({ where: { sku: PRO_ONLY }, data: { audience: "pro" } });
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

function breakfast(over: Partial<CreateBundlePayload> = {}): CreateBundlePayload {
  return {
    name: "Petit déjeuner",
    description: "Une douceur et une boisson.",
    groups: [
      { label: "Douceur", choices: [CROISSANT] },
      { label: "Boisson", choices: [COFFEE] },
    ],
    ...over,
  };
}

async function create(): Promise<void> {
  const created = await staff().post(BUNDLES).send(breakfast()).expect(201);
  expect(jsonBody<{ key: string }>(created)).toEqual({ key: KEY });
}

async function view(): Promise<BundleView> {
  return jsonBody<BundleView>(await staff().get(`${BUNDLES}/${KEY}`).expect(200));
}

async function factTypes(): Promise<string[]> {
  const events = await ctx.prisma.activityEvent.findMany({
    where: { type: { startsWith: "bundle." } },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    select: { type: true },
  });
  return events.map((event) => event.type);
}

describe("créer une formule", () => {
  it("l'écrit en brouillon pour le public, avec son auteur, et la journalise", async () => {
    await create();

    expect(await view()).toMatchObject({
      key: KEY,
      name: "Petit déjeuner",
      audience: "public",
      status: "draft",
      writtenBy: E2E_STAFF_ID,
      groups: [
        {
          key: "douceur",
          label: "Douceur",
          choices: [{ sku: CROISSANT, standing: "admissible" }],
        },
        { key: "boisson", label: "Boisson", choices: [{ sku: COFFEE, standing: "admissible" }] },
      ],
    });
    expect(await factTypes()).toEqual(["bundle.created"]);
  });

  it("refuse une clé déjà prise en 409", async () => {
    await create();

    const taken = await staff()
      .post(BUNDLES)
      .send(breakfast({ name: "Petit-déjeuner" }))
      .expect(409);
    expect(taken.body).toMatchObject({ code: "bundles.key_taken" });
  });

  it("refuse moins de deux groupes, et un article en double, en 400 sans rien écrire", async () => {
    const lonely = await staff()
      .post(BUNDLES)
      .send(breakfast({ groups: [{ label: "Douceur", choices: [CROISSANT] }] }))
      .expect(400);
    expect(lonely.body).toMatchObject({ code: "bundles.too_few_groups" });

    const twice = await staff()
      .post(BUNDLES)
      .send(
        breakfast({
          groups: [
            { label: "Douceur", choices: [CROISSANT] },
            { label: "Encore", choices: [CROISSANT] },
          ],
        }),
      )
      .expect(400);
    expect(twice.body).toMatchObject({ code: "bundles.choice_duplicate" });
    expect(await ctx.prisma.bundle.count()).toBe(0);
  });

  it("refuse un article pas servi au public, et un article réservé aux opérations, en 409", async () => {
    const pro = await staff()
      .post(BUNDLES)
      .send(
        breakfast({
          groups: [
            { label: "A", choices: [CROISSANT] },
            { label: "B", choices: [PRO_ONLY] },
          ],
        }),
      )
      .expect(409);
    expect(pro.body).toMatchObject({ code: "bundles.choice_not_served_to_public" });
    expect(jsonBody<{ message: string }>(pro).message).toContain(PRO_ONLY);

    const yule = await staff()
      .post(BUNDLES)
      .send(
        breakfast({
          groups: [
            { label: "A", choices: [CROISSANT] },
            { label: "B", choices: [YULE_LOG] },
          ],
        }),
      )
      .expect(409);
    expect(yule.body).toMatchObject({ code: "bundles.choice_operation_only" });
    expect(await ctx.prisma.bundle.count()).toBe(0);
  });
});

describe("composer une formule", () => {
  it("réordonne, renomme un groupe sans changer sa clé, et journalise avant → après", async () => {
    await create();

    await staff()
      .put(`${BUNDLES}/${KEY}/composition`)
      .send({
        groups: [
          { key: "boisson", label: "Boisson chaude", choices: [COFFEE] },
          { key: "douceur", label: "Douceur", choices: [CROISSANT] },
        ],
      })
      .expect(200);

    const groups = (await view()).groups.map((group) => [group.key, group.label]);
    expect(groups).toEqual([
      ["boisson", "Boisson chaude"],
      ["douceur", "Douceur"],
    ]);
    expect(await factTypes()).toEqual(["bundle.created", "bundle.composition_saved"]);
  });

  it("refuse d'y ajouter un article pro, sans rien changer", async () => {
    await create();

    const refused = await staff()
      .put(`${BUNDLES}/${KEY}/composition`)
      .send({
        groups: [
          { key: "douceur", label: "Douceur", choices: [CROISSANT, PRO_ONLY] },
          { key: "boisson", label: "Boisson", choices: [COFFEE] },
        ],
      })
      .expect(409);

    expect(refused.body).toMatchObject({ code: "bundles.choice_not_served_to_public" });
    expect(await ctx.prisma.bundleChoice.count()).toBe(2);
  });

  it("renomme sans changer de clé", async () => {
    await create();

    await staff()
      .put(`${BUNDLES}/${KEY}/presentation`)
      .send({ name: "Le petit déjeuner", description: null })
      .expect(200);

    expect(await view()).toMatchObject({ key: KEY, name: "Le petit déjeuner", description: null });
  });
});

describe("retirer, remettre en brouillon", () => {
  it("retire, refuse alors toute composition, puis remet en brouillon", async () => {
    await create();

    await staff().put(`${BUNDLES}/${KEY}/withdraw`).expect(200);
    expect((await view()).status).toBe("withdrawn");
    const locked = await staff()
      .put(`${BUNDLES}/${KEY}/presentation`)
      .send({ name: "Autre", description: null })
      .expect(409);
    expect(locked.body).toMatchObject({ code: "bundles.withdrawn" });
    await staff().put(`${BUNDLES}/${KEY}/withdraw`).expect(409);

    await staff().put(`${BUNDLES}/${KEY}/draft`).expect(200);
    expect((await view()).status).toBe("draft");
    expect(await factTypes()).toEqual([
      "bundle.created",
      "bundle.withdrawn",
      "bundle.returned_to_draft",
    ]);
    expect(await ctx.prisma.bundle.count()).toBe(1);
  });

  it("répond 404 pour une formule inconnue", async () => {
    await staff().get(`${BUNDLES}/fantome`).expect(404);
  });
});

describe("chercher un article à ajouter", () => {
  it("ne propose que les articles servis au public et pas réservés aux opérations", async () => {
    const found = jsonBody<BundleChoiceCandidateView[]>(
      await staff().get("/admin/bundle-choices").expect(200),
    );

    expect(found.map((candidate) => candidate.sku).sort()).toEqual([COFFEE, CROISSANT]);
    const coffee = jsonBody<BundleChoiceCandidateView[]>(
      await staff().get("/admin/bundle-choices?q=boi").expect(200),
    );
    expect(coffee.map(({ sku, name, thumbnailUrl }) => ({ sku, name, thumbnailUrl }))).toEqual([
      { sku: COFFEE, name: "Produit BOI-001", thumbnailUrl: null },
    ]);
  });
});

describe("le droit `shop_bundles`", () => {
  it("ferme les formules à qui ne l'a pas", async () => {
    const sub = await staffWith(ctx, "sans-formules", [
      { resource: "lfc_catalog", action: "write" },
    ]);

    await ctx.asSub(sub).get(BUNDLES).expect(403);
    await ctx.asSub(sub).post(BUNDLES).send(breakfast()).expect(403);
    await ctx.asSub(sub).get("/admin/bundle-choices").expect(403);
  });

  it("ouvre la lecture sans l'écriture à qui n'a que `read`", async () => {
    const sub = await staffWith(ctx, "lecteur-formules", [
      { resource: "shop_bundles", action: "read" },
    ]);

    await ctx.asSub(sub).get(BUNDLES).expect(200);
    await ctx.asSub(sub).post(BUNDLES).send(breakfast()).expect(403);
  });
});
