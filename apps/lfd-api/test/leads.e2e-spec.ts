/**
 * E2E des leads cold (`POST` / `GET /admin/leads`) — vrai Postgres.
 *
 * Prouve : la route est **murée staff**, la saisie **persiste l'agrégat** dans
 * `growth.leads` (statut initial `new`, e-mail normalisé) **et journalise
 * `lead.captured`**, et la lecture rend la file. La saisie invalide (raison
 * sociale vide) est **rejetée** par la validation Zod (400).
 */
import type { CreatedLeadResponse, LeadView } from "@lfd/contracts";
import { EventBus } from "@nestjs/cqrs";

import { UserRegisteredEvent } from "../src/b2b/account/domain/events/user-registered.event.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

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

function staff(): ReturnType<E2eContext["http"]> {
  return ctx.http().set("Authorization", "Bearer staff-e2e");
}

/** Attend qu'une condition asynchrone (abonné détaché) se réalise, ou échoue. */
async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("condition non réalisée dans le délai imparti");
}

describe("POST /admin/leads", () => {
  it("mure la route côté staff (401 sans jeton porteur)", async () => {
    await ctx.http().post("/admin/leads").send({ businessName: "X" }).expect(401);
  });

  it("rejette une raison sociale vide (400)", async () => {
    await staff().post("/admin/leads").send({ businessName: "   " }).expect(400);
  });

  it("persiste le lead (statut new, e-mail normalisé) et journalise lead.captured", async () => {
    const created = jsonBody<CreatedLeadResponse>(
      await staff()
        .post("/admin/leads")
        .send({ businessName: "Bistrot du Coin", email: "Marie@Bistrot.FR" })
        .expect(201),
    );
    expect(created.id).toMatch(/^lead_/);

    const row = await ctx.prisma.lead.findUnique({ where: { id: created.id } });
    expect(row).toMatchObject({
      businessName: "Bistrot du Coin",
      email: "marie@bistrot.fr",
      status: "new",
    });

    const journal = await ctx.prisma.activityEvent.findMany({ where: { type: "lead.captured" } });
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ subjectType: "lead", subjectId: created.id });
  });
});

describe("GET /admin/leads", () => {
  it("mure la route côté staff (401 sans jeton porteur)", async () => {
    await ctx.http().get("/admin/leads").expect(401);
  });

  it("liste les leads saisis, le plus récent en tête", async () => {
    await staff().post("/admin/leads").send({ businessName: "Ancien" }).expect(201);
    await staff().post("/admin/leads").send({ businessName: "Récent" }).expect(201);

    const leads = jsonBody<LeadView[]>(await staff().get("/admin/leads").expect(200));
    expect(leads.map((lead) => lead.businessName)).toEqual(["Récent", "Ancien"]);
    expect(leads[0]).toMatchObject({ status: "new", linkedUserId: null, lastContactedAt: null });
  });
});

describe("PATCH /admin/leads/:id", () => {
  async function captureLead(businessName: string): Promise<string> {
    const created = jsonBody<CreatedLeadResponse>(
      await staff().post("/admin/leads").send({ businessName }).expect(201),
    );
    return created.id;
  }

  it("avance un lead et journalise lead.stage_changed", async () => {
    const id = await captureLead("Bistrot");
    await staff().patch(`/admin/leads/${id}`).send({ status: "contacted" }).expect(204);

    const row = await ctx.prisma.lead.findUnique({ where: { id } });
    expect(row?.status).toBe("contacted");
    expect(row?.lastContactedAt).not.toBeNull();
    const journal = await ctx.prisma.activityEvent.count({ where: { type: "lead.stage_changed" } });
    expect(journal).toBe(1);
  });

  it("convertit manuellement et journalise lead.converted (via manual)", async () => {
    const id = await captureLead("Bistrot");
    await staff().patch(`/admin/leads/${id}`).send({ status: "converted" }).expect(204);

    const row = await ctx.prisma.lead.findUnique({ where: { id } });
    expect(row?.status).toBe("converted");
    const journal = await ctx.prisma.activityEvent.findMany({ where: { type: "lead.converted" } });
    expect(journal).toHaveLength(1);
  });

  it("refuse un recul de pipeline (409) — l'invariant remonte", async () => {
    const id = await captureLead("Bistrot");
    await staff().patch(`/admin/leads/${id}`).send({ status: "negotiating" }).expect(204);
    await staff().patch(`/admin/leads/${id}`).send({ status: "contacted" }).expect(409);
  });

  it("404 sur un lead inexistant", async () => {
    await staff().patch("/admin/leads/lead_nope").send({ status: "contacted" }).expect(404);
  });
});

describe("Rapprochement automatique à l'inscription (user.registered)", () => {
  it("rattache et convertit un lead ouvert dont l'e-mail matche l'inscription", async () => {
    const created = jsonBody<CreatedLeadResponse>(
      await staff()
        .post("/admin/leads")
        .send({ businessName: "Bistrot", email: "Marie@Bistrot.fr" })
        .expect(201),
    );

    // Le prospect démarché finit par s'inscrire (même e-mail, casse différente).
    ctx.app.get(EventBus).publish(new UserRegisteredEvent("user_99", "marie@bistrot.fr"));

    await waitFor(async () => {
      const row = await ctx.prisma.lead.findUnique({ where: { id: created.id } });
      return row?.status === "converted";
    });
    const row = await ctx.prisma.lead.findUnique({ where: { id: created.id } });
    expect(row?.linkedUserId).toBe("user_99");

    const journal = await ctx.prisma.activityEvent.findMany({ where: { type: "lead.converted" } });
    expect(journal).toHaveLength(1);
    expect(journal[0]?.payload).toMatchObject({ via: "registration", linkedUserId: "user_99" });
  });

  it("laisse intact un lead quand aucun e-mail ne correspond", async () => {
    const created = jsonBody<CreatedLeadResponse>(
      await staff()
        .post("/admin/leads")
        .send({ businessName: "Bistrot", email: "marie@bistrot.fr" })
        .expect(201),
    );

    ctx.app.get(EventBus).publish(new UserRegisteredEvent("user_99", "autre@resto.fr"));

    // On laisse une fenêtre au handler détaché, puis on vérifie l'absence d'effet.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const row = await ctx.prisma.lead.findUnique({ where: { id: created.id } });
    expect(row?.status).toBe("new");
    expect(row?.linkedUserId).toBeNull();
  });
});
