/**
 * E2E — **les options de commande, du référentiel jusqu'au fait du catalogue**
 * (`documentation/catalogue/plan-options-de-commande.md`, lot G1).
 *
 * Ce que seul ce niveau prouve : les trois tables neuves et leurs contraintes,
 * l'activation écrite par la fiche dans la même unité de travail que son fait
 * v19, la réémission des fiches qui activent un groupe quand il change, et les
 * refus traduits en statuts HTTP (fiche archivée, groupe archivé, déclinaison
 * étrangère).
 *
 * Doublées : la signature des jetons (le jeton EST le `sub`) et le réveil du
 * relais — la suite lit la boîte d'envoi elle-même.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import {
  aDraftFiche,
  anActiveFiche,
  productFactsOf,
  SILENT_TRIGGER,
} from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const GROUPS = "/pim/option-groups";
const PRODUCTS = "/pim/catalogue/products";

const SLICED = { key: "tranche", label: "Tranché", audience: "both" };
const THIN = { key: "tranche-fin", label: "Tranché fin", audience: "pro" };

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

async function aGroup(choices: readonly object[] = [SLICED, THIN]): Promise<string> {
  return jsonBody<{ id: string }>(
    await staff()
      .post(GROUPS)
      .set(INTENT_KEY, freshIntent())
      .send({ name: "Tranchage", choices })
      .expect(201),
  ).id;
}

/** Les groupes que le dernier fait de la fiche porte sur sa première déclinaison. */
async function lastOptionGroups(productId: string): Promise<unknown> {
  const facts = await productFactsOf(ctx, productId);
  const last = facts.at(-1)?.payload;
  const variants = (last?.["variants"] ?? []) as readonly Record<string, unknown>[];
  return variants[0]?.["optionGroups"];
}

describe("les options de commande — G1", () => {
  it("un groupe activé sur une fiche part dans son fait, par déclinaison", async () => {
    const fiche = await anActiveFiche(staff, "Pain de campagne", "both");
    const groupId = await aGroup();

    await staff()
      .put(`${PRODUCTS}/${fiche.id}/option-groups/${groupId}`)
      .send({ variantIds: null })
      .expect(200);

    expect(await lastOptionGroups(fiche.id)).toEqual([
      { id: groupId, name: "Tranchage", choices: [SLICED, THIN] },
    ]);
    const listed = jsonBody<unknown[]>(
      await staff().get(`${PRODUCTS}/${fiche.id}/option-groups`).expect(200),
    );
    expect(listed).toEqual([{ groupId, name: "Tranchage", archived: false, variantIds: null }]);
    const groups = jsonBody<{ id: string; products: number }[]>(
      await staff().get(GROUPS).expect(200),
    );
    expect(groups.find((group) => group.id === groupId)?.products).toBe(1);
  });

  it("réviser le groupe réémet la fiche ; l'archiver le retire du fait", async () => {
    const fiche = await anActiveFiche(staff, "Pain de seigle", "both");
    const groupId = await aGroup();
    await staff()
      .put(`${PRODUCTS}/${fiche.id}/option-groups/${groupId}`)
      .send({ variantIds: null })
      .expect(200);

    await staff()
      .put(`${GROUPS}/${groupId}`)
      .send({ name: "Tranchage", choices: [SLICED] })
      .expect(200);
    expect(await lastOptionGroups(fiche.id)).toEqual([
      { id: groupId, name: "Tranchage", choices: [SLICED] },
    ]);
    const archivedChoice = await ctx.prisma.optionChoice.findUnique({
      where: { optionGroupId_key: { optionGroupId: groupId, key: THIN.key } },
    });
    expect(archivedChoice?.archivedAt).not.toBeNull();

    await staff().delete(`${GROUPS}/${groupId}`).expect(200);
    expect(await lastOptionGroups(fiche.id)).toEqual([]);
    await staff()
      .put(`${PRODUCTS}/${fiche.id}/option-groups/${groupId}`)
      .send({ variantIds: null })
      .expect(409);
  });

  it("retirer le groupe de la fiche le retire du fait, sans effacer la ligne", async () => {
    const fiche = await anActiveFiche(staff, "Pain complet", "both");
    const groupId = await aGroup();
    await staff()
      .put(`${PRODUCTS}/${fiche.id}/option-groups/${groupId}`)
      .send({ variantIds: null })
      .expect(200);

    await staff().delete(`${PRODUCTS}/${fiche.id}/option-groups/${groupId}`).expect(200);

    expect(await lastOptionGroups(fiche.id)).toEqual([]);
    const row = await ctx.prisma.productOptionActivation.findUnique({
      where: { productId_optionGroupId: { productId: fiche.id, optionGroupId: groupId } },
    });
    expect(row?.revokedAt).not.toBeNull();
  });

  it("refuse une fiche archivée (409) et une déclinaison étrangère (404)", async () => {
    const groupId = await aGroup();
    const other = await aDraftFiche(staff, "Baguette");
    const archived = await aDraftFiche(staff, "Fougasse");
    await staff().put(`${PRODUCTS}/${archived.id}/archive`).send({}).expect(200);

    await staff()
      .put(`${PRODUCTS}/${archived.id}/option-groups/${groupId}`)
      .send({ variantIds: null })
      .expect(409);
    const detail = jsonBody<{ variants: { id: string }[] }>(
      await staff().get(`${PRODUCTS}/${archived.id}`).expect(200),
    );
    await staff()
      .put(`${PRODUCTS}/${other.id}/option-groups/${groupId}`)
      .send({ variantIds: [detail.variants[0]?.id ?? "absent"] })
      .expect(404);
    expect(await ctx.prisma.productOptionActivation.count()).toBe(0);
  });

  it("refuse un choix de clé invalide (400), et une même intention n'ouvre qu'un groupe", async () => {
    await staff()
      .post(GROUPS)
      .set(INTENT_KEY, freshIntent())
      .send({ name: "Tranchage", choices: [{ ...SLICED, key: "Tranché" }] })
      .expect(400);

    const intent = freshIntent();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await staff()
        .post(GROUPS)
        .set(INTENT_KEY, intent)
        .send({ name: "Tranchage", choices: [SLICED] })
        .expect(201);
    }
    expect(await ctx.prisma.optionGroup.count()).toBe(1);
  });
});
