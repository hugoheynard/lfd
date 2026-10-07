/**
 * E2E de la **lecture des réglages par qui lit les tournées**
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, § 6, Q10 « A »).
 *
 * La flotte, le point de départ et les réglages du calcul se lisent sous
 * `delivery_settings:read` OU `delivery_rounds:read` ; leur écriture reste sous
 * `delivery_settings:write`. Seul l'e2e le prouve : les droits sont relus en
 * base, dérogations comprises.
 *
 * Aucun rôle du contrat n'a `delivery_rounds` sans `delivery_settings` (vérifié
 * le 2026-09-29 : admin et comptoir ont les deux) : le lecteur des tournées est
 * donc une fiche `support` qui le reçoit par dérogation.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const VEHICLES = "/admin/livraison/vehicules";
const DEPARTURE = "/admin/livraison/depart";
const ROUTING = "/admin/livraison/calcul";

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

/** Une fiche `support`, avec ou sans la lecture des tournées par dérogation. */
async function supportStaff(readsRounds: boolean): Promise<ReturnType<E2eContext["asSub"]>> {
  const sub = readsRounds ? "staff-rounds-reader" : "staff-support";
  const row = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: sub,
      email: `${sub}@lfc.test`,
      role: "support",
      status: "active",
      auth0Id: sub,
    },
  });
  if (readsRounds) {
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: row.id, resource: "delivery_rounds", action: "read", effect: "allow" },
    });
  }
  return ctx.asSub(sub);
}

describe("qui lit les tournées lit les réglages (Q10 « A »)", () => {
  it("lit la flotte, le départ et les réglages du calcul (200)", async () => {
    const reader = await supportStaff(true);

    await reader.get(VEHICLES).expect(200);
    await reader.get(DEPARTURE).expect(200);
    await reader.get(ROUTING).expect(200);
  });

  it("🔴 ne les modifie pas (403), sans rien écrire", async () => {
    const reader = await supportStaff(true);

    await reader.post(VEHICLES).send({ name: "X", plate: "AB-123-CD" }).expect(403);
    await reader.put(DEPARTURE).send({ pickupAddressId: null }).expect(403);
    await reader.put(ROUTING).send({}).expect(403);
    expect(await ctx.prisma.deliveryVehicle.count()).toBe(0);
  });

  it("🔴 reste fermé à qui n'a ni l'un ni l'autre droit (403)", async () => {
    const support = await supportStaff(false);

    await support.get(VEHICLES).expect(403);
    await support.get(DEPARTURE).expect(403);
    await support.get(ROUTING).expect(403);
  });
});
