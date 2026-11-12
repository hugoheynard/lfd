import { jsonBody, type E2eContext } from "../e2e-harness.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";
import { companyWithOwner } from "./seeds.js";

const HTTP = "lafoliecoffee/growth/http";
const CLIENT = "replay-client";
const DAY_MS = 86_400_000;

/** Une disponibilité large : tous les jours 08:00–18:00, sans prévenance. */
async function declareAvailability(ctx: E2eContext): Promise<void> {
  await ctx
    .asSub(STAFF)
    .put("/admin/availability")
    .send({
      rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startTime: "08:00",
        endTime: "18:00",
      })),
      exceptions: [],
      policy: { slotMinutes: 30, leadTimeHours: 0, horizonDays: 30, channels: ["phone", "visio"] },
    })
    .expect(200);
}

/** Le premier créneau proposé au client, demain → dans 8 jours. */
async function firstSlot(ctx: E2eContext, now: Date): Promise<string> {
  const day = (offset: number): string =>
    new Date(now.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
  const response = await ctx
    .asSub(CLIENT)
    .get(`/appointments/slots?from=${day(1)}&to=${day(8)}`)
    .expect(200);
  const slot = jsonBody<{ slots: { startAt: string }[] }>(response).slots[0];
  if (slot === undefined) throw new Error("e2e : aucun créneau proposé.");
  return slot.startAt;
}

/** Le commercial : prospects et rendez-vous. */
export const GROWTH_SCENARIOS: ScenarioSet = {
  [routeKey(`${HTTP}/admin-leads.controller.ts`, "capture")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/leads",
      body: { businessName: "Bistrot du Coin", email: "marie@bistrot.test" },
    }),

  [routeKey(`${HTTP}/admin-appointments.controller.ts`, "schedule")]: async ({ ctx, clock }) => {
    await declareAvailability(ctx);
    return {
      sub: STAFF,
      path: "/admin/appointments",
      body: {
        startAt: new Date(clock.now().getTime() + 3 * DAY_MS).toISOString(),
        channel: "phone",
        purpose: "discover",
        subjectType: "lead",
        subjectId: "lead_123",
        contactName: "Camille",
      },
    };
  },

  [routeKey(`${HTTP}/appointments.controller.ts`, "book")]: async ({ ctx, clock }) => {
    await companyWithOwner(ctx, CLIENT);
    await declareAvailability(ctx);
    return {
      sub: CLIENT,
      path: "/appointments",
      body: {
        startAt: await firstSlot(ctx, clock.now()),
        channel: "phone",
        purpose: "discover",
        companyId: null,
      },
    };
  },
};
