/**
 * E2E des **refus du réassort que le comptoir et le fournil lisent par leur
 * code** — ceux qui n'étaient éprouvés qu'au domaine (audit final du
 * réassort, 2026-11-03). Un code est un contrat avec l'écran : il se vérifie
 * là où l'écran le reçoit, par la route.
 *
 * L'horloge est figée la veille du jour servi, à midi, puis le matin du jour
 * servi pour un « au plus tôt ». Aucune date du calendrier.
 */
import type { SiteResuppliesView } from "@lfd/contracts";
import { addDays, localToInstant } from "@lfd/contracts";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  bootstrapProductionDay,
  closePlan,
  CROISSANT,
  MEMBER,
  place,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import { counterSends, counterSent, seedLabo } from "./site-resupply-scene.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const EVE = addDays(SERVICE_DAY, -1);
const clock = new FixedClock(new Date());
let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([
    { token: Clock, value: clock },
    ADMIN_VERIFIER_OVERRIDE,
  ]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  clock.set(local(EVE, "12:00"));
});

function local(day: string, time: string): Date {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new TypeError(`heure locale inexistante : ${day} ${time}`);
  }
  return instant;
}

const staff = () => ctx.asSub(STAFF);

/** Une commande, puis l'arrêt : la journée a un plan figé. */
async function stoppedWithAnOrder(): Promise<void> {
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 3 }]);
  await closePlan(ctx);
  await ctx.drain();
}

describe("les refus du réassort, par leur code", () => {
  it("un « pour demain » envoyé après l'arrêt du plan : 409 `resupply.order.plan_stopped`", async () => {
    await stoppedWithAnOrder();
    const labo = await seedLabo(ctx);

    const { sent } = await counterSends(staff(), labo, "tomorrow", [
      { sku: CROISSANT, quantity: 2 },
    ]);

    expect(sent.status).toBe(409);
    expect(jsonBody<{ code: string }>(sent).code).toBe("resupply.order.plan_stopped");
  });

  it("« Lancer » sur une journée rouverte : 409 `production.resupply.launch_on_reopened_plan`", async () => {
    await stoppedWithAnOrder();
    await staff().post(`/admin/production/batch/${SERVICE_DAY}/reopen`).expect(201);
    clock.set(local(SERVICE_DAY, "08:00"));
    const id = await counterSent(staff(), await seedLabo(ctx), "asap", [
      { sku: CROISSANT, quantity: 2 },
    ]);

    const refused = await staff()
      .post(`/admin/production/batch/${SERVICE_DAY}/resupplies/${id}/launch`)
      .expect(409);

    expect(jsonBody<{ code: string }>(refused).code).toBe(
      "production.resupply.launch_on_reopened_plan",
    );
    expect(await ctx.prisma.productionResupply.count({ where: { resupplyId: id } })).toBe(0);
  });
});

describe("le double clic sur « Envoyer » au comptoir (D5)", () => {
  it("deux envois simultanés de la même demande : 204 aux deux, un seul réassort envoyé", async () => {
    const labo = await seedLabo(ctx);
    const base = `/admin/site-resupplies/sites/${labo}`;
    const added = await staff()
      .post(`${base}/drafts/tomorrow/lines`)
      .set(INTENT_KEY, freshIntent())
      .send({ sku: CROISSANT, quantity: 4 })
      .expect(201);
    const id = jsonBody<{ id: string }>(added).id;
    const view = jsonBody<SiteResuppliesView>(await staff().get(base).expect(200));
    const version = view.drafts.find((draft) => draft.id === id)?.version;
    expect(version).toBeDefined();

    const answers = await Promise.all([
      staff().post(`${base}/${id}/send`).send({ version }),
      staff().post(`${base}/${id}/send`).send({ version }),
    ]);

    expect(answers.map((answer) => answer.status)).toEqual([204, 204]);
    const rows = await ctx.prisma.siteResupply.findMany({
      where: { siteId: labo },
      select: { id: true, placedAt: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.placedAt).not.toBeNull();
  });
});
