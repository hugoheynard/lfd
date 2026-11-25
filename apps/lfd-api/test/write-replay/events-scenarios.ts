import { jsonBody, serviceDay, type E2eContext } from "../e2e-harness.js";
import { INTENT_KEY, freshIntent } from "../intent-key.js";
import { routeKey, STAFF, type ReplayFile, type ScenarioSet } from "./scenario.js";
import { PDF } from "./seeds.js";

const EVENT_HTTP = "events/event/http";
const SHEET_HTTP = "events/function-sheet/http";

const SHEET: ReplayFile = {
  field: "file",
  content: PDF,
  filename: "fiche-de-fonction.pdf",
  contentType: "application/pdf",
};

/** Les événements et leurs fiches de fonction : créer, déposer, remplacer. */
export const EVENTS_SCENARIOS: ScenarioSet = {
  [routeKey(`${EVENT_HTTP}/admin-events.controller.ts`, "create")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/admin/events",
      body: { name: "Salon du rejeu", date: serviceDay(10) },
    }),

  [routeKey(`${SHEET_HTTP}/admin-event-function-sheets.controller.ts`, "deposit")]: async ({
    ctx,
  }) => {
    const eventId = await createEvent(ctx);
    return { sub: STAFF, path: `/admin/events/${eventId}/function-sheets`, files: [SHEET] };
  },

  [routeKey(`${SHEET_HTTP}/admin-event-function-sheets.controller.ts`, "replace")]: async ({
    ctx,
  }) => {
    const eventId = await createEvent(ctx);
    const deposited = await ctx
      .asSub(STAFF)
      .post(`/admin/events/${eventId}/function-sheets`)
      .set(INTENT_KEY, freshIntent())
      .attach("file", PDF, { filename: "v1.pdf", contentType: "application/pdf" })
      .expect(201);
    const sheetId = jsonBody<{ id: string }>(deposited).id;
    return {
      sub: STAFF,
      path: `/admin/events/${eventId}/function-sheets/${sheetId}/replacement`,
      files: [SHEET],
    };
  },
};

async function createEvent(ctx: E2eContext): Promise<string> {
  const created = await ctx
    .asSub(STAFF)
    .post("/admin/events")
    .set(INTENT_KEY, freshIntent())
    .send({ name: "Salon du rejeu", date: serviceDay(10) })
    .expect(201);
  return jsonBody<{ id: string }>(created).id;
}
