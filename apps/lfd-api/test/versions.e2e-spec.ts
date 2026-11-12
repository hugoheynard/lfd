/**
 * E2E de **la porte des versions** et des deux journaux globaux —
 * `documentation/caching-usage/plan-veilleur-unique.md`, § 3.2 et 3.3.
 *
 * Ce que seule la base migrée peut dire :
 *
 * - chaque table nommée au plan a ses trois déclencheurs d'INSTRUCTION qui
 *   écrivent dans SON journal (`pg_trigger`) ;
 * - une écriture sur une adresse fait monter `companies`, une commande passée
 *   fait monter `orders-all` — sans qu'aucun code ne les avance ;
 * - une validation tardive (A prend un id plus petit que B, valide après lui)
 *   change quand même le numéro ;
 * - le droit, sujet par sujet.
 */
import type { VersionsView } from "@lfd/contracts";
import { Client } from "pg";
import type request from "supertest";

import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { addBillingAddress, createCompany, createUser } from "./factories.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { cardGatewayDouble, pickupSite, placeOrder } from "./order-factory.js";
import { testDatabaseUrl } from "./setup-env.js";

const VERSIONS = "/admin/versions";
const DAY = serviceDay();
const BUYER = "auth0|buyer-versions";

/** Les tables que chaque journal surveille — la liste de la migration. */
const WATCHED: Readonly<Record<"company_change" | "order_change", readonly string[]>> = {
  company_change: [
    "addresses",
    "companies",
    "company_bank_accounts",
    "company_collection_form",
    "company_contacts",
    "company_follows",
    "delivery_procedure_steps",
    "delivery_procedures",
    "memberships",
    "payment_mandates",
    "subscriptions",
    "support_requests",
    "users",
  ],
  order_change: ["order_lines", "order_shortfall", "orders"],
};

/** Signature du jeton staff doublée : le jeton porteur EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CardProviders, value: cardGatewayDouble("pi_e2e_versions") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

async function versionsOf(agent: request.Agent, query: string): Promise<VersionsView> {
  return jsonBody<VersionsView>(await agent.get(`${VERSIONS}?${query}`).expect(200));
}

async function globalVersion(subject: "companies" | "orders-all"): Promise<number> {
  const view = await versionsOf(ctx.asSub(E2E_STAFF_SUB), `subjects=${subject}`);
  const version = view.versions[subject];
  expect({ subject, permitted: version !== undefined }).toEqual({ subject, permitted: true });
  return version ?? 0;
}

describe("les déclencheurs des journaux globaux", () => {
  it.each(Object.entries(WATCHED))(
    "`public.%s` : trois déclencheurs d'instruction sur chaque table nommée, et aucune autre",
    async (journal, tables) => {
      const rows = await ctx.prisma.$queryRaw<{ tbl: string; event: string }[]>`
        SELECT n.nspname || '.' || c.relname AS tbl, e.event_manipulation AS event
          FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_proc p ON p.oid = t.tgfoid
          JOIN information_schema.triggers e
            ON e.trigger_name = t.tgname
           AND e.event_object_schema = n.nspname
           AND e.event_object_table = c.relname
         WHERE NOT t.tgisinternal
           AND e.action_orientation = 'STATEMENT'
           AND p.proname = ${`record_${journal}`}`;
      const found = new Map<string, string[]>();
      for (const { tbl, event } of rows) {
        found.set(tbl, [...(found.get(tbl) ?? []), event].sort());
      }

      expect(Object.fromEntries(found)).toEqual(
        Object.fromEntries(
          tables.map((table) => [`public.${table}`, ["DELETE", "INSERT", "UPDATE"]]),
        ),
      );
    },
  );

  it("une instruction qui ne touche aucune ligne n'écrit rien", async () => {
    const before = await globalVersion("companies");

    await ctx.prisma.company.updateMany({ where: { id: "aucune" }, data: { enseigne: "x" } });

    expect(await globalVersion("companies")).toBe(before);
  });
});

describe("une écriture fait monter le numéro de son sujet", () => {
  it("une adresse posée sur une société fait monter `companies`", async () => {
    const company = await createCompany(ctx.prisma);
    const before = await globalVersion("companies");

    await addBillingAddress(ctx.prisma, company.id);

    expect(await globalVersion("companies")).not.toBe(before);
  });

  it("une commande passée fait monter `orders-all`, et pas `companies`", async () => {
    const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER });
    const pickupSiteId = await pickupSite(ctx.prisma);
    const orders = await globalVersion("orders-all");
    const companies = await globalVersion("companies");

    await placeOrder(ctx, {
      buyerUserId: buyer.id,
      fulfillment: { method: "pickup", pickupSiteId },
    });

    expect(await globalVersion("orders-all")).not.toBe(orders);
    expect(await globalVersion("companies")).toBe(companies);
  });
});

/**
 * Régression : avec `max(id)` seul, A prend l'id 100, B le 101 et valide
 * d'abord ; A valide ensuite, le max reste 101 et le changement de A est
 * invisible jusqu'à l'écriture suivante.
 */
describe("une validation tardive change le numéro (max(id) et count(*))", () => {
  async function lateCommit(insert: string, read: () => Promise<number>): Promise<void> {
    const first = new Client({ connectionString: testDatabaseUrl() });
    const second = new Client({ connectionString: testDatabaseUrl() });
    await first.connect();
    await second.connect();
    try {
      await first.query("BEGIN");
      await first.query(insert);
      await second.query("BEGIN");
      await second.query(insert);
      await second.query("COMMIT");
      const seenAfterSecond = await read();
      await first.query("COMMIT");

      expect(await read()).not.toBe(seenAfterSecond);
    } finally {
      await first.end();
      await second.end();
    }
  }

  it("journal global `companies`", async () => {
    await lateCommit('INSERT INTO "public"."company_change" DEFAULT VALUES', () =>
      globalVersion("companies"),
    );
  });

  it("journal de journée `orders`", async () => {
    await lateCommit(
      `INSERT INTO "public"."day_change" ("service_day") VALUES ('${DAY}')`,
      async () => {
        const view = await versionsOf(ctx.asSub(E2E_STAFF_SUB), `date=${DAY}&subjects=orders`);
        return view.versions.orders ?? -1;
      },
    );
  });
});

describe("la porte et ses droits, sujet par sujet", () => {
  async function staffWith(
    sub: string,
    resources: readonly ("b2b_orders" | "b2b_companies" | "handover_counter" | "b2b_supervision")[],
  ) {
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
    for (const resource of resources) {
      await ctx.prisma.staffPermissionOverride.create({
        data: { staffUserId: row.id, resource, action: "read", effect: "allow" },
      });
    }
    return ctx.asSub(sub);
  }

  const EVERYTHING = `date=${DAY}&subjects=orders,production,delivery,my-round,companies,orders-all`;

  it("mêle sujets journaliers et globaux en une réponse", async () => {
    const view = await versionsOf(
      ctx.asSub(E2E_STAFF_SUB),
      `date=${DAY}&subjects=orders,companies`,
    );

    expect(view.date).toBe(DAY);
    expect(Object.keys(view.versions).sort()).toEqual(["companies", "orders"]);
  });

  it("sans sujet journalier, la date n'est pas exigée et revient `null`", async () => {
    const view = await versionsOf(ctx.asSub(E2E_STAFF_SUB), "subjects=companies,orders-all");

    expect(view.date).toBeNull();
  });

  it("`b2b_companies:read` reçoit `companies`, rien d'autre", async () => {
    const view = await versionsOf(
      await staffWith("staff-v-comptes", ["b2b_companies"]),
      EVERYTHING,
    );

    expect(Object.keys(view.versions)).toEqual(["companies"]);
  });

  it("`b2b_orders:read` reçoit `orders` et `orders-all`", async () => {
    const view = await versionsOf(await staffWith("staff-v-commandes", ["b2b_orders"]), EVERYTHING);

    expect(Object.keys(view.versions).sort()).toEqual(["orders", "orders-all"]);
  });

  it("🔴 le comptoir et la Supervision ne reçoivent PAS `orders-all`", async () => {
    const agent = await staffWith("staff-v-comptoir", ["handover_counter", "b2b_supervision"]);

    const view = await versionsOf(agent, EVERYTHING);

    expect(view.versions["orders-all"]).toBeUndefined();
    expect(view.versions.orders).toBeDefined();
  });

  it("une fiche sans droit reçoit une réponse vide, sans refus", async () => {
    const view = await versionsOf(await staffWith("staff-v-rien", []), EVERYTHING);

    expect(view.versions).toEqual({});
  });

  it("refuse un sujet inconnu en le nommant, et un sujet journalier sans date", async () => {
    const unknown = await ctx
      .asSub(E2E_STAFF_SUB)
      .get(`${VERSIONS}?subjects=companies,stock`)
      .expect(400);
    expect(JSON.stringify(unknown.body)).toContain("stock");
    await ctx.asSub(E2E_STAFF_SUB).get(`${VERSIONS}?subjects=orders`).expect(400);
    await ctx.asSub(E2E_STAFF_SUB).get(`${VERSIONS}`).expect(400);
  });

  it("l'ancienne porte `admin/day-versions` reste servie", async () => {
    await ctx
      .asSub(E2E_STAFF_SUB)
      .get(`/admin/day-versions?date=${DAY}&journals=orders`)
      .expect(200);
  });
});
