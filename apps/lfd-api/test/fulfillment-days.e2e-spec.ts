/**
 * E2E de **`GET /fulfillment-days`** — la prochaine journée demandable.
 *
 * 🔴 Ce que cette route retire au front : `slotDate()`, qui posait « demain »
 * depuis `new Date()`, c'est-à-dire depuis **l'horloge du navigateur du
 * client**, et sans jamais regarder l'heure limite.
 *
 * Ce que seul le vrai SQL prouve ici : la journée est calculée sur les règles
 * **lues en base**, la règle du point l'emporte sur le défaut, et l'horloge est
 * celle du serveur — la suite la gèle pour l'exiger.
 */
import type { CreatedOrderCutoffResponse, FulfillmentDayView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

const STAFF = "staff-e2e";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: STAFF, scopes: [] }),
};

/** Mardi 8 septembre 2026, 15 h UTC = **17 h à Paris** (heure d'été). */
const MARDI_17H = new Date("2026-09-08T15:00:00Z");

const clock = new FixedClock(MARDI_17H);

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: Clock, value: clock },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  clock.set(MARDI_17H);
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub(STAFF);
}

async function createPoint(label: string): Promise<string> {
  const response = await staff()
    .post("/admin/pickup-addresses")
    .send({
      label,
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: false,
    })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

async function createRule(rule: Record<string, unknown>): Promise<string> {
  const response = await staff().post("/admin/order-cutoffs").send(rule).expect(201);
  return jsonBody<CreatedOrderCutoffResponse>(response).id;
}

async function days(): Promise<readonly FulfillmentDayView[]> {
  const response = await ctx.http().get("/fulfillment-days").expect(200);
  return jsonBody<readonly FulfillmentDayView[]>(response);
}

/** La journée du défaut plateforme — celle du chemin livraison. */
function fallbackDay(rows: readonly FulfillmentDayView[]): string | null {
  return rows.find((row) => row.pickupAddressId === null)?.date ?? null;
}

describe("prochaine journée demandable", () => {
  it("rend le défaut plateforme MÊME sans aucun point de retrait", async () => {
    // Le chemin livraison ne vise aucun point : une réponse qui ne listerait
    // que les points le laisserait sans date, donc à réinventer côté écran.
    const rows = await days();

    expect(rows).toEqual([{ pickupAddressId: null, date: "2026-09-08" }]);
  });

  it("propose demain tant que la limite de la veille n’est pas tombée", async () => {
    await createRule({ pickupAddressId: null, daysBefore: 1, time: "18:00", graceMinutes: 0 });

    expect(fallbackDay(await days())).toBe("2026-09-09");
  });

  /** 18 h 01 à Paris : le 9 est fermé. L'écran doit proposer le 10, pas le 9. */
  it("passe au surlendemain une fois la limite tombée", async () => {
    await createRule({ pickupAddressId: null, daysBefore: 1, time: "18:00", graceMinutes: 0 });
    clock.set(new Date("2026-09-08T16:01:00Z"));

    expect(fallbackDay(await days())).toBe("2026-09-10");
  });

  it("donne sa PROPRE journée à un point qui a sa propre règle", async () => {
    const labo = await createPoint("Le Labo");
    await createRule({ pickupAddressId: null, daysBefore: 1, time: "18:00", graceMinutes: 0 });
    await createRule({ pickupAddressId: labo, daysBefore: 3, time: "18:00", graceMinutes: 0 });

    const rows = await days();

    expect(fallbackDay(rows)).toBe("2026-09-09");
    expect(rows.find((row) => row.pickupAddressId === labo)?.date).toBe("2026-09-11");
  });

  /**
   * Aucune journée dans l'horizon ⇒ `null`, jamais une date de repli : y
   * retomber réintroduirait le « demain » qu'on vient de retirer.
   */
  it("rend null quand aucune journée de l’horizon n’est ouverte", async () => {
    await createRule({ pickupAddressId: null, daysBefore: 14, time: "00:00", graceMinutes: 0 });

    expect(fallbackDay(await days())).toBeNull();
  });

  it("s’ouvre sans compte — on choisit son service avant d’en avoir un", async () => {
    await ctx.http().get("/fulfillment-days").expect(200);
  });
});
