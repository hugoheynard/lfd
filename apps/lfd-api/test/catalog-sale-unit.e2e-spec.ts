/**
 * E2E — **l'unité de vente, de la saisie au référentiel jusqu'au miroir du
 * commerce** (`documentation/pricing/plan-vente-au-poids.md`, P2).
 *
 * Ce que seul ce niveau prouve : qu'une déclinaison saisie au poids dans
 * « Tarif & TVA » traverse le fil v14 par les faits du catalogue et se range
 * dans `catalog_items` avec son unité, son pas et son minimum — sous les
 * `CHECK` de la migration —, et qu'une pièce y reste à la pièce. Rien ne la
 * lit encore pour commander ni pour afficher (P3, P4).
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import {
  activateFiche,
  aDraftFiche,
  anActiveFiche,
  relayAll,
  SILENT_TRIGGER,
  type Fiche,
} from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";

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

async function defaultVariantId(fiche: Fiche): Promise<string> {
  const detail = jsonBody<{ variants: { id: string; isDefault: boolean }[] }>(
    await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200),
  );
  return detail.variants.find((variant) => variant.isDefault)?.id ?? "";
}

function mirrored(fiche: Fiche) {
  return ctx.prisma.catalogItem.findUnique({
    where: { sku: fiche.variantSku },
    select: { saleUnit: true, weightMinGrams: true, weightStepGrams: true },
  });
}

describe("l'unité de vente au commerce", () => {
  it("une déclinaison saisie au poids arrive avec son unité, son pas et son minimum", async () => {
    const fiche = await aDraftFiche(staff, "Graines au chocolat");
    const variantId = await defaultVariantId(fiche);
    await staff()
      .put(`${PRODUCTS}/${fiche.id}/variants/${variantId}/pricing`)
      .send({
        priceCents: 2_400,
        weightGrams: null,
        saleUnit: "weight",
        weightStepGrams: 100,
        weightMinGrams: 200,
      })
      .expect(200);
    await activateFiche(staff, fiche, "both");

    await relayAll(ctx);

    expect(await mirrored(fiche)).toEqual({
      saleUnit: "weight",
      weightMinGrams: 200,
      weightStepGrams: 100,
    });
  });

  it("une pièce reste à la pièce, sans pas ni minimum", async () => {
    const fiche = await anActiveFiche(staff, "Croissant", "both");

    await relayAll(ctx);

    expect(await mirrored(fiche)).toEqual({
      saleUnit: "piece",
      weightMinGrams: null,
      weightStepGrams: null,
    });
  });
});
