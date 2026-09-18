/**
 * E2E du **réglage de livraison par clientèle** (plan
 * `remise-et-livraison-par-clientele`, D4) : lecture publique, lecture et
 * écriture staff, ligne absente = ouverte, auteur figé, fait au journal.
 */
import {
  DEFAULT_DELIVERY_AVAILABILITY,
  type DeliveryAvailabilityView,
  type PublicDeliveryAvailabilityView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
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
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub(E2E_STAFF_SUB);
}

async function publicView(): Promise<PublicDeliveryAvailabilityView> {
  return jsonBody<PublicDeliveryAvailabilityView>(
    await ctx.http().get("/delivery-availability").expect(200),
  );
}

async function adminView(): Promise<DeliveryAvailabilityView> {
  return jsonBody<DeliveryAvailabilityView>(
    await staff().get("/admin/delivery-availability").expect(200),
  );
}

describe("le réglage de livraison", () => {
  it("ligne absente : ouvert aux deux, sans auteur ni instant — sur les deux routes", async () => {
    expect(await publicView()).toEqual({ openToB2b: true, openToB2c: true });
    expect(await adminView()).toEqual(DEFAULT_DELIVERY_AVAILABILITY);
    expect(await ctx.prisma.deliveryAvailability.count()).toBe(0);
  });

  it("ferme une clientèle en laissant l'autre, et fige qui et quand", async () => {
    await staff().patch("/admin/delivery-availability").send({ openToB2c: false }).expect(204);

    expect(await publicView()).toEqual({ openToB2b: true, openToB2c: false });
    const view = await adminView();
    expect(view.updatedAt).not.toBeNull();
    expect(view.updatedBy).not.toBeNull();

    const row = await ctx.prisma.deliveryAvailability.findUniqueOrThrow({
      where: { key: "delivery" },
    });
    // L'id de fiche, dans l'ancienne colonne ET sa jumelle, le temps de la
    // bascule (plan de l'auteur, étape 5A).
    expect(row.updatedBySub).toBe(E2E_STAFF_ID);
    expect(row.updatedByStaffId).toBe(E2E_STAFF_ID);
  });

  /**
   * Régression (2026-09-15) : la route publique servait la vue admin entière,
   * nom de l'agent compris, à n'importe quel visiteur sans jeton.
   */
  it("ne sert JAMAIS l'auteur ni l'instant sur la route publique", async () => {
    await staff().patch("/admin/delivery-availability").send({ openToB2c: false }).expect(204);

    const body = (await ctx.http().get("/delivery-availability").expect(200)).body as Record<
      string,
      unknown
    >;
    expect(Object.keys(body).sort()).toEqual(["openToB2b", "openToB2c"]);
  });

  it("un second patch part de l'état posé, pas du défaut", async () => {
    await staff().patch("/admin/delivery-availability").send({ openToB2c: false }).expect(204);
    await staff().patch("/admin/delivery-availability").send({ openToB2b: false }).expect(204);

    const view = await publicView();
    expect([view.openToB2b, view.openToB2c]).toEqual([false, false]);
    expect(await ctx.prisma.deliveryAvailability.count()).toBe(1);
  });

  it("refuse un patch vide (400) — il faut dire quelle clientèle change", async () => {
    await staff().patch("/admin/delivery-availability").send({}).expect(400);
  });

  it("refuse l'écriture sans jeton staff", async () => {
    const response = await ctx
      .http()
      .patch("/admin/delivery-availability")
      .send({ openToB2c: false });

    expect([401, 403]).toContain(response.status);
    expect(await ctx.prisma.deliveryAvailability.count()).toBe(0);
  });

  it("journalise le geste avec l'état remplacé", async () => {
    await staff().patch("/admin/delivery-availability").send({ openToB2c: false }).expect(204);
    await ctx.drain();

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "delivery_availability.updated" },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toEqual({
      openToB2b: true,
      openToB2c: false,
      previous: { openToB2b: true, openToB2c: true },
    });
  });
});
