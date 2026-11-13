/**
 * E2E de **la version de journée de la livraison** —
 * `documentation/livraisons/architecture/plan-schema-delivery.md`, SD-D3, sur le vrai
 * Postgres jetable.
 *
 * Ce que seule la base migrée peut dire : une tournée fait avancer le journal
 * de la LIVRAISON (`delivery.day_change`) et plus celui du fournil ; un geste
 * du fournil ne fait pas bouger la livraison. Le dialogue en base qui passait
 * par aucun port est coupé dans les deux sens.
 *
 * Lue par la porte `GET admin/versions`, sujet `delivery`.
 */
import { DAY_VERSIONS, dayVersionOf, dayVersionsOf } from "./day-versions-door.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  addVehicle,
  ADMIN_VERIFIER_OVERRIDE,
  admin,
  forgetCustomer,
  openRound,
} from "./delivery-rounds-scene.js";

const DAY = serviceDay();
const OTHER_DAY = serviceDay(8);

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
});

async function version(day: string = DAY): Promise<number> {
  return dayVersionOf(admin(ctx), "delivery", day);
}

async function productionVersion(day: string = DAY): Promise<number> {
  return dayVersionOf(admin(ctx), "production", day);
}

describe("le journal `delivery` de la porte unique", () => {
  it("rend zéro pour une journée que rien n'a touchée", async () => {
    expect(await version()).toBe(0);
  });

  it("bouge quand une tournée change, et ne fait plus bouger le fournil", async () => {
    const vehicle = await addVehicle(ctx, "Kangoo");
    const [before, bakeryBefore] = [await version(), await productionVersion()];

    await openRound(ctx, DAY, vehicle);

    expect(await version()).toBeGreaterThan(before);
    expect(await productionVersion()).toBe(bakeryBefore);
    // Une autre journée n'a pas bougé.
    expect(await version(OTHER_DAY)).toBe(0);
  });

  it("ne bouge pas quand le fournil change", async () => {
    await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const before = await version();

    await ctx.prisma.productionDay.create({ data: { serviceDay: DAY } });

    expect(await productionVersion()).toBeGreaterThan(0);
    expect(await version()).toBe(before);
  });

  it("refuse une date absente, mal formée ou hors calendrier", async () => {
    await admin(ctx).get(`${DAY_VERSIONS}?subjects=delivery`).expect(400);
    await admin(ctx).get(`${DAY_VERSIONS}?date=03/10/2026&subjects=delivery`).expect(400);
    await admin(ctx).get(`${DAY_VERSIONS}?date=2030-02-30&subjects=delivery`).expect(400);
  });
});

describe("les droits", () => {
  async function staffWith(sub: string, resource: "delivery_rounds" | "delivery_loading" | null) {
    const row = await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: sub,
        email: `${sub}@lfc.test`,
        role: "communication",
        status: "active",
        auth0Id: sub,
      },
    });
    if (resource !== null) {
      await ctx.prisma.staffPermissionOverride.create({
        data: { staffUserId: row.id, resource, action: "read", effect: "allow" },
      });
    }
    return ctx.asSub(sub);
  }

  it("se lit sous `delivery_rounds:read`", async () => {
    const reader = await staffWith("staff-livraison-tournees", "delivery_rounds");
    expect(await dayVersionOf(reader, "delivery", DAY)).toBe(0);
  });

  it("se lit aussi sous `delivery_loading:read` — le panneau des bacs du colisage", async () => {
    const reader = await staffWith("staff-livraison-chargement", "delivery_loading");
    expect(await dayVersionOf(reader, "delivery", DAY)).toBe(0);
  });

  it("est OMIS pour une personne sans aucun des deux droits — sans refuser la porte", async () => {
    const nobody = await staffWith("staff-livraison-sans-droit", null);
    expect((await dayVersionsOf(nobody, DAY, ["delivery"])).versions).toEqual({});
  });
});
