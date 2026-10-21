/**
 * E2E du **signal d'heure limite du devis** (point 8 de
 * `limites-de-commande/schema-des-reglages.md`, 2026-10-21).
 *
 * Régression : le devis n'appelait aucune garde d'heure limite — un panier
 * chiffré sans réserve pouvait être refusé à la passation. Le devis ne refuse
 * toujours pas (200), mais il dit `open` / `grace` / `closed` pour le jour visé,
 * par la même décision que la passation, lue en base.
 */
import { addDays, instantToLocal, type OrderQuoteView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";

const STAFF = "staff-e2e";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: STAFF, scopes: [] }),
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

async function seedCutoff(rule: {
  daysBefore: number;
  time: string;
  graceMinutes?: number;
}): Promise<void> {
  await ctx.prisma.orderCutoff.create({
    data: {
      pickupAddressId: null,
      weekday: null,
      daysBefore: rule.daysBefore,
      time: rule.time,
      graceMinutes: rule.graceMinutes ?? 0,
    },
  });
}

const LIMIT_DAYS_BEFORE = 2;

/** Une règle tombée il y a `minutesAgo`, et le jour qu'elle vise (cf. `order-cutoffs.e2e-spec.ts`). */
async function seedCutoffPassedBy(minutesAgo: number, graceMinutes: number): Promise<string> {
  const limit = instantToLocal(new Date(Date.now() - minutesAgo * 60_000));
  await seedCutoff({ daysBefore: LIMIT_DAYS_BEFORE, time: limit.time, graceMinutes });
  return addDays(limit.day, LIMIT_DAYS_BEFORE);
}

async function quote(requestedDeliveryDate?: string): Promise<OrderQuoteView> {
  const response = await ctx
    .asSub(STAFF)
    .post("/admin/orders/quote")
    .send({
      companyId: null,
      lines: [{ sku: "VIE-001", quantity: 3 }],
      ...(requestedDeliveryDate === undefined ? {} : { requestedDeliveryDate }),
    })
    .expect(200);
  return jsonBody<OrderQuoteView>(response);
}

describe("le devis signale l'heure limite du jour visé, sans refuser", () => {
  it("ne dit rien de l'heure limite sans jour visé", async () => {
    await seedCutoff({ daysBefore: 1, time: "00:01" });
    expect((await quote()).cutoff).toBeNull();
  });

  it("dit « fermé » pour un jour dont la limite est passée — et chiffre quand même", async () => {
    await seedCutoff({ daysBefore: 1, time: "00:01" });
    const view = await quote(serviceDay(0));
    expect(view.cutoff).toEqual({ status: "closed", until: null });
    expect(view.lines).toHaveLength(1);
  });

  it("dit « rattrapage » pendant la grâce, avec sa fin", async () => {
    const day = await seedCutoffPassedBy(10, 45);
    const view = await quote(day);
    expect(view.cutoff?.status).toBe("grace");
    expect(view.cutoff?.until).not.toBeNull();
  });

  it("dit « ouvert » avec l'heure limite quand elle est devant", async () => {
    await seedCutoff({ daysBefore: 1, time: "00:01" });
    const view = await quote(serviceDay(30));
    expect(view.cutoff?.status).toBe("open");
    expect(view.cutoff?.until).not.toBeNull();
  });

  it("refuse en 400 une date mal formée", async () => {
    await ctx
      .asSub(STAFF)
      .post("/admin/orders/quote")
      .send({
        companyId: null,
        lines: [{ sku: "VIE-001", quantity: 1 }],
        requestedDeliveryDate: "demain",
      })
      .expect(400);
  });
});
