/**
 * E2E de la **limite de dépôt sur le calendrier des rythmes** (tableau de
 * bord comptabilité, `GET …/billing-modes/calendar`).
 *
 * Ce que seul le vrai serveur prouve : le cut-off réglé par la route du
 * calendrier de prélèvement est relu par la lecture des rythmes, et chaque
 * période sert la limite que `depositDeadlineOf` tire de SON échéance —
 * `null` tant que rien n'est réglé. Aucun lot constitué : `batchId` est `null`.
 *
 * Aucune date absolue : la limite attendue est recalculée par le domaine
 * depuis l'échéance servie.
 */
import type { BillingRhythmsCalendarView } from "@lfd/contracts";

import { depositDeadlineOf } from "../src/b2b/accounting/domain/services/collection-calendar.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

const BASE = "/admin/accounting/legal-entities";
const CUTOFF = { businessDaysBefore: 2, time: "16:00" };

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
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
  return ctx.asSub("staff-e2e");
}

async function declare(): Promise<string> {
  const response = await staff()
    .post(BASE)
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: "552100554",
      rcs: "",
      shareCapitalCents: 1_000_000,
      vatNumber: "",
      address: {
        line1: "12 rue du Fournil",
        line2: "",
        postalCode: "73000",
        city: "Chambéry",
        countryCode: "FR",
      },
    })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

async function calendar(id: string): Promise<BillingRhythmsCalendarView> {
  return jsonBody<BillingRhythmsCalendarView>(
    await staff().get(`${BASE}/${id}/billing-modes/calendar`).expect(200),
  );
}

describe("la limite de dépôt sur le calendrier des rythmes", () => {
  it("non réglée : chaque période sert `null`, et aucun lot", async () => {
    const id = await declare();

    const periods = (await calendar(id)).rhythms.flatMap((lane) => lane.periods);

    expect(periods.length).toBeGreaterThan(0);
    for (const period of periods) {
      expect(period).toMatchObject({ depositDeadline: null, batchId: null });
    }
  });

  it("réglée : chaque période sert la limite tirée de son échéance", async () => {
    const id = await declare();
    await staff()
      .put(`${BASE}/${id}/collection-schedule`)
      .send({ delayHours: 1, daysAfterClosure: null, depositCutoff: CUTOFF })
      .expect(204);

    const periods = (await calendar(id)).rhythms.flatMap((lane) => lane.periods);

    expect(periods.length).toBeGreaterThan(0);
    for (const period of periods) {
      expect(period.depositDeadline).toEqual(depositDeadlineOf(period.collectionDay, CUTOFF));
    }
  });
});
