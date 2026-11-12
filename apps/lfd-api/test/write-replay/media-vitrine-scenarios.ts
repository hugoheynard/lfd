import { jsonBody, type E2eContext } from "../e2e-harness.js";
import { INTENT_KEY, freshIntent } from "../intent-key.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";

const SUBSCRIBERS = "/admin/vitrine/subscribers";
const SUBSCRIBER = {
  name: "Agence du site",
  endpointUrl: "https://agence.e2e.test/hook",
  contents: ["catalogue", "operations", "texts", "featured"],
};

/** Un abonné de la vitrine, déclaré par la route. */
async function subscriber(ctx: E2eContext): Promise<string> {
  const response = await ctx
    .asSub(STAFF)
    .post(SUBSCRIBERS)
    .set(INTENT_KEY, freshIntent())
    .send(SUBSCRIBER)
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

/** La médiathèque et la vitrine. */
export const MEDIA_VITRINE_SCENARIOS: ScenarioSet = {
  [routeKey("media/http/media-series.controller.ts", "declare")]: () =>
    Promise.resolve({
      sub: STAFF,
      path: "/media/series",
      body: { title: "Shooting de printemps", shotOn: null, note: null },
    }),

  [routeKey("lafoliecoffee/vitrine/http/admin-vitrine.controller.ts", "create")]: () =>
    Promise.resolve({ sub: STAFF, path: SUBSCRIBERS, body: SUBSCRIBER, replay: "shown-once" }),

  [routeKey("lafoliecoffee/vitrine/http/admin-vitrine.controller.ts", "rotate")]: async ({
    ctx,
  }) => ({
    sub: STAFF,
    path: `${SUBSCRIBERS}/${await subscriber(ctx)}/rotate`,
    replay: "shown-once",
  }),
};
