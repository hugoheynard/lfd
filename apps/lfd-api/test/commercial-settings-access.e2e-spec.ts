/**
 * E2E des **droits des réglages commerciaux** (Hugo, 2026-10-13) — vrai
 * Postgres, vrais rôles.
 *
 * La disponibilité des rendez-vous passe sous `b2b_commercial_appointment`, les
 * règles d'alerte globales sous `b2b_commercial_alert`. Ce que seul l'e2e
 * prouve : que les anciennes ressources (`b2b_appointments`, `b2b_alerts`) ne
 * les ouvrent plus, et que la file des rendez-vous — que le calendrier lit —
 * reste sous `b2b_appointments`.
 */
import type { RoleGrant } from "@lfd/contracts";

import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Un membre du staff dont le rôle porte exactement `grants`. */
async function staffWith(key: string, grants: readonly RoleGrant[]): Promise<string> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/staff-roles")
    .send({ key, label: key, grants })
    .expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return sub;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const at = (offset: number): Date => new Date(Date.now() + offset * DAY_MS);
/** La file prend des instants ISO ; l'aperçu, des jours `AAAA-MM-JJ`. */
const RANGE = `from=${at(1).toISOString()}&to=${at(8).toISOString()}`;
const DAYS = `from=${at(1).toISOString().slice(0, 10)}&to=${at(8).toISOString().slice(0, 10)}`;

const DRIFT_RULE = {
  enabled: true,
  params: {
    kind: "product.quantity_drift",
    riseTiers: [{ upToQuantity: null, thresholdPercent: 150 }],
    dropTiers: [{ upToQuantity: null, thresholdPercent: 40 }],
    direction: "both",
    baselineOrders: 6,
    minBaselineOrders: 3,
    windowDays: 365,
  },
  delivery: { staffInApp: true, staffEmail: false, customerVisible: false },
};

describe("les anciennes ressources n'ouvrent plus les réglages commerciaux", () => {
  it("rendez-vous, alertes et croissance en écriture : 403 sur les réglages, la file reste lisible", async () => {
    const sub = await staffWith("commercial-ancien", [
      { resource: "b2b_appointments", action: "write" },
      { resource: "b2b_alerts", action: "write" },
      { resource: "b2b_growth", action: "write" },
    ]);
    const as = () => ctx.asSub(sub);

    await as().get("/admin/availability").expect(403);
    await as().get(`/admin/availability/slots?${DAYS}`).expect(403);
    await as().put("/admin/availability/exceptions").send({ exceptions: [] }).expect(403);
    await as().get("/admin/alert-rules").expect(403);
    await as()
      .put("/admin/alert-rules")
      .send({ rule: DRIFT_RULE, expectedUpdatedAt: null })
      .expect(403);
    // Le calendrier lit la file : elle n'a pas changé de ressource.
    await as().get(`/admin/appointments?${RANGE}`).expect(200);
  });
});

describe("b2b_commercial_appointment", () => {
  it("en lecture : lit la disponibilité et son aperçu, n'écrit pas", async () => {
    const sub = await staffWith("dispo-lecture", [
      { resource: "b2b_commercial_appointment", action: "read" },
    ]);

    await ctx.asSub(sub).get("/admin/availability").expect(200);
    await ctx.asSub(sub).get(`/admin/availability/slots?${DAYS}`).expect(200);
    await ctx.asSub(sub).put("/admin/availability/exceptions").send({ exceptions: [] }).expect(403);
    // Elle n'ouvre ni la file des rendez-vous, ni les alertes.
    await ctx.asSub(sub).get(`/admin/appointments?${RANGE}`).expect(403);
    await ctx.asSub(sub).get("/admin/alert-rules").expect(403);
  });

  it("en écriture : règle les exceptions", async () => {
    const sub = await staffWith("dispo-ecriture", [
      { resource: "b2b_commercial_appointment", action: "write" },
    ]);

    await ctx.asSub(sub).put("/admin/availability/exceptions").send({ exceptions: [] }).expect(200);
  });
});

describe("b2b_commercial_alert", () => {
  it("en lecture : lit les règles globales, n'écrit pas", async () => {
    const sub = await staffWith("alertes-lecture", [
      { resource: "b2b_commercial_alert", action: "read" },
    ]);

    await ctx.asSub(sub).get("/admin/alert-rules").expect(200);
    await ctx
      .asSub(sub)
      .put("/admin/alert-rules")
      .send({ rule: DRIFT_RULE, expectedUpdatedAt: null })
      .expect(403);
    await ctx.asSub(sub).get("/admin/availability").expect(403);
  });

  it("en écriture : enregistre une règle globale", async () => {
    const sub = await staffWith("alertes-ecriture", [
      { resource: "b2b_commercial_alert", action: "write" },
    ]);

    await ctx
      .asSub(sub)
      .put("/admin/alert-rules")
      .send({ rule: DRIFT_RULE, expectedUpdatedAt: null })
      .expect(204);
  });
});
