/**
 * E2E — **les règles et les familles sur la plateforme**, en processus (lot
 * 2b de `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`).
 *
 * Ce que seul ce niveau prouve : l'échelle des limites de commande voyage en
 * RÈGLES (`pim.catalog_rules_changed`), se range sous condition `applied_seq`
 * contre le vrai SQL, et se descend sur un article NEUF reçu par le fait de
 * sa fiche — par l'identifiant de déclinaison que seul ce fait porte. Et
 * qu'une famille archivée pose une date sans jamais se supprimer : la clé
 * étrangère en cascade emporterait ses articles.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { aDraftFiche, anActiveFiche, relayAll, SILENT_TRIGGER } from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const LIMITS = "/pim/order-time-limits";
const CATEGORIES = "/pim/catalogue/categories";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: OutboxRelayTrigger, value: SILENT_TRIGGER },
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

function limitOf(sku: string) {
  return ctx.prisma.catalogItem.findUnique({
    where: { sku },
    select: {
      variantId: true,
      orderLimitDaysBefore: true,
      orderLimitTime: true,
      orderLimitGraceMinutes: true,
    },
  });
}

/**
 * Depuis le 2026-10-21 (décision de Hugo, `limites-de-commande/
 * schema-des-reglages.md` §4) : une limite par PRODUIT, règle entière, sans
 * rattrapage. Ce sont toujours des RÈGLES qui voyagent — des règles de produit.
 */
describe("les limites de commande voyagent en règles", () => {
  it("rangées sous leur numéro, puis descendues sur l'article du produit", async () => {
    const fiche = await anActiveFiche(staff, "Pain aux raisins");
    await relayAll(ctx);
    expect(await limitOf(fiche.variantSku)).toMatchObject({ orderLimitTime: null });

    await staff()
      .put(LIMITS)
      .send({ scope: { type: "product", id: fiche.id }, daysBefore: 1, time: "18:00" })
      .expect(200);
    await relayAll(ctx);

    const rules = await ctx.prisma.catalogRules.findUnique({
      where: { kind: "order_time_limits" },
    });
    expect(rules?.rules).toEqual([
      {
        scope: { type: "product", id: fiche.id },
        daysBefore: 1,
        time: "18:00",
        graceMinutes: null,
      },
    ]);
    expect(await limitOf(fiche.variantSku)).toMatchObject({
      orderLimitDaysBefore: 1,
      orderLimitTime: "18:00",
      orderLimitGraceMinutes: 0,
    });
  });

  it("un article NEUF prend la limite déjà posée sur son produit", async () => {
    const fiche = await anActiveFiche(staff, "Chausson");
    await staff()
      .put(LIMITS)
      .send({ scope: { type: "product", id: fiche.id }, daysBefore: 2, time: "12:00" })
      .expect(200);
    await relayAll(ctx);

    expect(await limitOf(fiche.variantSku)).toMatchObject({
      orderLimitDaysBefore: 2,
      orderLimitTime: "12:00",
      orderLimitGraceMinutes: 0,
    });
  });

  /** Une déclinaison suit son produit : elle n'a plus de limite propre. */
  it("refuse une limite de déclinaison, et la déclinaison suit son produit", async () => {
    const fiche = await anActiveFiche(staff, "Galette");
    await relayAll(ctx);
    const item = await limitOf(fiche.variantSku);
    expect(item?.variantId).not.toBeNull();

    await staff()
      .put(LIMITS)
      .send({ scope: { type: "variant", id: item?.variantId ?? "" }, daysBefore: 3, time: "09:00" })
      .expect(400);
    await relayAll(ctx);

    expect(await limitOf(fiche.variantSku)).toMatchObject({ orderLimitTime: null });
  });
});

describe("une famille archivée pose une date, jamais une suppression", () => {
  it("garde la famille et ses articles, avec sa date de retrait et son audience", async () => {
    const fiche = await anActiveFiche(staff, "Kouign-amann");
    await relayAll(ctx);
    await staff()
      .put(`${CATEGORIES}/${fiche.categoryId}/audience`)
      .send({ audience: "pro" })
      .expect(200);
    await relayAll(ctx);
    expect(
      await ctx.prisma.catalogCategory.findUnique({ where: { id: fiche.categoryId } }),
    ).toMatchObject({ audience: "pro", withdrawnAt: null });

    // Une famille ne s'archive que vide de fiches actives : la fiche d'abord.
    await staff().put(`/pim/catalogue/products/${fiche.id}/archive`).send({}).expect(200);
    await staff().put(`${CATEGORIES}/${fiche.categoryId}/archive`).send({}).expect(200);
    await relayAll(ctx);

    const family = await ctx.prisma.catalogCategory.findUnique({ where: { id: fiche.categoryId } });
    expect(family?.withdrawnAt).not.toBeNull();
    expect(family?.audience).toBe("pro");
    // La cascade n'a rien emporté : l'article est toujours là, retiré.
    const item = await ctx.prisma.catalogItem.findUnique({ where: { sku: fiche.variantSku } });
    expect(item).not.toBeNull();
    expect(item?.withdrawnAt).not.toBeNull();
  });

  it("une famille inactive arrive avec son audience, en service", async () => {
    const fiche = await aDraftFiche(staff, "Sablé");

    await relayAll(ctx);

    expect(
      await ctx.prisma.catalogCategory.findUnique({ where: { id: fiche.categoryId } }),
    ).toMatchObject({ audience: "both", withdrawnAt: null });
  });
});
