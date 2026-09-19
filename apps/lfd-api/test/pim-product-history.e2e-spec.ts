/**
 * E2E de l'**onglet « Historique » d'une fiche produit**
 * (`GET /pim/catalogue/products/:id/history`) — sur un vrai Postgres.
 *
 * Ce que seul ce niveau prouve : que les trois cercles (la fiche, ce dont elle
 * hérite, les révisions qui l'ont emportée) se lisent en UNE requête sur le
 * journal, avec des identifiants résolus dans les tables du référentiel ; que
 * le filtre par préfixe écarte un fait d'un autre bloc qui porte pourtant le
 * sujet `product` ; que l'ancre fige l'instantané ; et que le mur du
 * référentiel tient.
 *
 * Tous les faits sont écrits par les vrais gestes, sauf le fait étranger —
 * aucun geste du référentiel ne peut le produire, c'est tout son intérêt.
 */
import type { ProductHistoryEntryView, ProductHistoryPageView } from "@lfd/pim-contracts";
import type { Response } from "supertest";

import { ActivityRecorder } from "../src/b2b/growth/domain/ports/activity-recorder.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

/** Le jeton porteur EST le `sub` : deux personnes distinctes dans une même suite. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const RATES = "/pim/vat-rates";
const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";
const REVISIONS = "/pim/catalogue/revisions";
const historyOf = (productId: string): string => `${PRODUCTS}/${productId}/history`;

/** Le support n'a aucun droit sur le référentiel (`ROLE_GRANTS`). */
const SUPPORT_SUB = "staff-support";

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

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub("staff-e2e");

async function createdId(pending: PromiseLike<Response>): Promise<string> {
  const response = await pending;
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

const createRate = (name: string, percent: number): Promise<string> =>
  createdId(staff().post(RATES).send({ name, percent }));

async function createCategory(nameFr: string, parentId?: string): Promise<string> {
  const name = { fr: nameFr };
  return createdId(
    staff()
      .post(CATEGORIES)
      .send(parentId === undefined ? { name } : { name, parentId }),
  );
}

/** Une famille qui vend en B2B et y vise `rate`. */
async function sellInB2b(categoryId: string, rate: string): Promise<void> {
  await staff()
    .put(`${CATEGORIES}/${categoryId}/channels`)
    .send([{ pointOfSaleId: "pos_b2b", context: "b2b" }])
    .expect(200);
  await staff()
    .put(`${CATEGORIES}/${categoryId}/vat`)
    .send({ vatByContext: { b2b: rate } })
    .expect(200);
}

const createProduct = (nameFr: string, categoryId: string): Promise<string> =>
  createdId(
    staff()
      .post(PRODUCTS)
      .send({ name: { fr: nameFr }, kind: "daily", categoryId }),
  );

async function renameProduct(productId: string, categoryId: string, nameFr: string) {
  await staff()
    .put(`${PRODUCTS}/${productId}/identity`)
    .send({ name: { fr: nameFr }, kind: "daily", categoryId })
    .expect(200);
}

async function renameCategory(categoryId: string, nameFr: string): Promise<void> {
  await staff()
    .put(`${CATEGORIES}/${categoryId}/name`)
    .send({ name: { fr: nameFr } })
    .expect(200);
}

async function renameRate(rateId: string, name: string, percent: number): Promise<void> {
  await staff().put(`${RATES}/${rateId}`).send({ name, percent }).expect(200);
}

async function read(
  productId: string,
  query: Record<string, string> = { pageSize: "100" },
): Promise<ProductHistoryPageView> {
  return jsonBody<ProductHistoryPageView>(
    await staff().get(historyOf(productId)).query(query).expect(200),
  );
}

interface Scene {
  readonly productId: string;
  readonly familyId: string;
  readonly ancestorId: string;
  readonly appliedRate: string;
  readonly strangerRate: string;
}

/** Une tarte, dans une famille rangée sous une autre, qui vend en B2B à 5,5 %. */
async function aScene(): Promise<Scene> {
  const appliedRate = await createRate("Réduit", 5.5);
  const strangerRate = await createRate("Normal", 20);
  const ancestorId = await createCategory("Pâtisserie");
  const familyId = await createCategory("Tartes", ancestorId);
  await sellInB2b(familyId, appliedRate);
  const productId = await createProduct("Tarte au citron", familyId);
  return { productId, familyId, ancestorId, appliedRate, strangerRate };
}

const ofType = (
  entries: readonly ProductHistoryEntryView[],
  type: string,
  subjectId: string,
): ProductHistoryEntryView[] =>
  entries.filter((entry) => entry.type === type && entry.subjectId === subjectId);

describe("l'historique d'une fiche — les trois cercles", () => {
  it("montre la fiche, sa famille, son ancêtre, son taux et sa révision, chacun dans son cercle", async () => {
    const scene = await aScene();
    await renameProduct(scene.productId, scene.familyId, "Tarte au citron meringuée");
    await renameCategory(scene.familyId, "Tartes du jour");
    await renameCategory(scene.ancestorId, "Pâtisseries");
    await renameRate(scene.appliedRate, "Réduit alimentaire", 5.5);
    const revision = jsonBody<{ hash: string }>(
      await staff().post(REVISIONS).send({ label: "rentrée" }).expect(201),
    );

    const { entries } = await read(scene.productId);

    expect(ofType(entries, "product.identity_saved", scene.productId)).toEqual([
      expect.objectContaining({ circle: "product", subjectType: "product" }),
    ]);
    expect(ofType(entries, "product_category.renamed", scene.familyId)).toEqual([
      expect.objectContaining({
        circle: "inherited",
        inheritedFrom: { kind: "category", id: scene.familyId, label: "Tartes du jour" },
      }),
    ]);
    expect(ofType(entries, "product_category.renamed", scene.ancestorId)).toEqual([
      expect.objectContaining({
        circle: "inherited",
        inheritedFrom: { kind: "category", id: scene.ancestorId, label: "Pâtisseries" },
      }),
    ]);
    expect(ofType(entries, "vat_rate.renamed", scene.appliedRate)).toEqual([
      expect.objectContaining({
        circle: "inherited",
        inheritedFrom: { kind: "vat_rate", id: scene.appliedRate, label: "Réduit alimentaire" },
      }),
    ]);
    expect(ofType(entries, "catalog_revision.taken", revision.hash)).toEqual([
      expect.objectContaining({ circle: "revision" }),
    ]);
  });

  /** Une déclinaison est un fait DE la fiche : son sujet est le produit, son type `variant.*`. */
  it("range une déclinaison ajoutée dans le cercle de la fiche", async () => {
    const scene = await aScene();
    await staff()
      .post(`${PRODUCTS}/${scene.productId}/variants`)
      .send({ name: { fr: "Tartelette" } })
      .expect(201);

    const { entries } = await read(scene.productId);

    expect(ofType(entries, "variant.added", scene.productId)).toEqual([
      // L'auteur est un membre de l'équipe, et le contrat le DIT : un nom
      // absent ne se lira pas « le système » par défaut.
      expect.objectContaining({ circle: "product", subjectType: "product", actorType: "staff" }),
    ]);
  });

  it("ne montre pas un taux que la fiche n'applique pas", async () => {
    const scene = await aScene();
    await renameRate(scene.strangerRate, "Normal plein", 20);

    const { entries } = await read(scene.productId);

    // Le fait existe bien au journal : c'est la lecture qui l'écarte.
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "vat_rate.renamed", subjectId: scene.strangerRate },
      }),
    ).toBe(1);
    expect(entries.filter((entry) => entry.subjectId === scene.strangerRate)).toEqual([]);
  });

  /**
   * Le taux de la famille, remplacé par la dérogation de la fiche sur le même
   * contexte, n'est plus appliqué : il sort de l'historique, et celui de la
   * dérogation y entre.
   */
  it("suit le taux EFFECTIF : une dérogation remplace celui de la famille", async () => {
    const scene = await aScene();
    await staff()
      .put(`${PRODUCTS}/${scene.productId}/vat`)
      .send({ vatByContext: { b2b: scene.strangerRate } })
      .expect(200);
    await renameRate(scene.appliedRate, "Réduit alimentaire", 5.5);
    await renameRate(scene.strangerRate, "Normal plein", 20);

    const { entries } = await read(scene.productId);

    expect(ofType(entries, "vat_rate.renamed", scene.appliedRate)).toEqual([]);
    expect(ofType(entries, "vat_rate.renamed", scene.strangerRate)).toHaveLength(1);
    expect(ofType(entries, "product.vat_changed", scene.productId)).toHaveLength(1);
  });

  it("n'accueille pas un fait d'un autre bloc qui porte le sujet de la fiche", async () => {
    const FOREIGN = "catalog_item.hidden";
    const scene = await aScene();
    // Un type du catalogue des faits (le journal est strict sous le harnais) :
    // le catalogue B2B masque un article — un autre bloc que la fiche.
    await ctx.app.get(ActivityRecorder).record({
      type: FOREIGN,
      subjectType: "product",
      subjectId: scene.productId,
      idempotencyKey: `${FOREIGN}:${scene.productId}`,
      payload: { sku: "TARTE-CITRON" },
    });
    await ctx.drain();

    const { entries } = await read(scene.productId);

    // Le fait étranger est bien écrit, sur le sujet de la fiche.
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: FOREIGN, subjectId: scene.productId },
      }),
    ).toBe(1);
    expect(entries.filter((entry) => entry.type === FOREIGN)).toEqual([]);
    expect(
      entries.every(
        (entry) =>
          entry.circle !== "product" ||
          entry.type.startsWith("product.") ||
          entry.type.startsWith("variant."),
      ),
    ).toBe(true);
  });

  it("trie la chronologie du plus récent au plus ancien", async () => {
    const scene = await aScene();
    await renameProduct(scene.productId, scene.familyId, "Tarte au citron meringuée");

    const { entries } = await read(scene.productId);
    const instants = entries.map((entry) => entry.occurredAt);

    expect(instants).toEqual([...instants].sort().reverse());
    expect(entries[0]?.type).toBe("product.identity_saved");
  });

  /** Le fait dédié du 2026-09-19 entre par le préfixe `product.`, sans fil neuf. */
  it("montre le reclassement de la fiche dans son propre cercle", async () => {
    const scene = await aScene();
    await renameProduct(scene.productId, scene.ancestorId, "Tarte au citron");

    const { entries } = await read(scene.productId);
    const reclassified = entries.filter((entry) => entry.type === "product.reclassified");

    expect(reclassified.map((entry) => entry.circle)).toEqual(["product"]);
    expect(reclassified[0]?.payload).toEqual({ from: scene.familyId, to: scene.ancestorId });
  });
});

describe("l'historique d'une fiche — les pages", () => {
  it("se suivent sans doublon ni trou, sur un instantané que l'écriture ne déplace pas", async () => {
    const scene = await aScene();
    await renameProduct(scene.productId, scene.familyId, "Tarte au citron meringuée");
    const all = (await read(scene.productId)).entries.map((entry) => entry.id);

    const first = await read(scene.productId, { page: "1", pageSize: "2" });
    await renameProduct(scene.productId, scene.familyId, "Tarte au citron vert");
    const asOf = first.asOf ?? "";
    const rest = [];
    for (let page = 2; page <= Math.ceil(all.length / 2); page += 1) {
      rest.push(await read(scene.productId, { page: String(page), pageSize: "2", asOf }));
    }
    const fresh = await read(scene.productId, { page: "1", pageSize: "2" });

    expect(first.asOf).toBe(all[0]);
    expect([first, ...rest].flatMap((page) => page.entries.map((entry) => entry.id))).toEqual(all);
    expect(rest.every((page) => page.total === all.length && page.asOf === asOf)).toBe(true);
    // Sans ancre, le fait écrit entre-temps est là, et le total a bougé.
    expect(fresh.total).toBe(all.length + 1);
    expect(fresh.asOf).not.toBe(asOf);
  });

  it("refuse une ancre qui n'est pas un fait de cet historique", async () => {
    const scene = await aScene();

    const response = await staff()
      .get(historyOf(scene.productId))
      .query({ page: "2", asOf: "evt_inconnu" });

    expect(response.status).toBe(400);
    expect(jsonBody<{ code: string }>(response).code).toBe("pim.history.anchor_unknown");
  });

  it("refuse une page trop grande plutôt que de la tronquer", async () => {
    const scene = await aScene();

    await staff().get(historyOf(scene.productId)).query({ pageSize: "500" }).expect(400);
  });
});

describe("l'historique d'une fiche — les droits", () => {
  it("répond 404 pour une fiche inconnue", async () => {
    await staff().get(historyOf("prd_inconnu")).expect(404);
  });

  it("refuse un membre du staff sans droit sur le référentiel", async () => {
    const scene = await aScene();
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Sacha",
        lastName: "Lenoir",
        email: "support@lfc.test",
        role: "support",
        status: "active",
        auth0Id: SUPPORT_SUB,
      },
    });

    await ctx.asSub(SUPPORT_SUB).get(historyOf(scene.productId)).expect(403);
  });

  it("refuse un appel anonyme", async () => {
    await ctx.http().get(historyOf("prd_inconnu")).expect(401);
  });
});
