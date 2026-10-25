/**
 * E2E du cockpit (`GET /admin/cockpit`) — vrai Postgres.
 *
 * Ce que seul le bout-en-bout prouve : la queue lit le **read-model matérialisé**
 * `lead_scores` (pas le journal brut), la route est **murée staff**, et afficher
 * la queue **journalise `reco.shown`** — de façon **idempotente** par fenêtre de
 * recompute (rouvrir le cockpit ne recompte pas l'affichage). On matérialise via
 * le vrai `POST /admin/recompute` pour éprouver la chaîne complète.
 */
import type { CreatedLeadResponse, LeadScoreView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";
import type { InputJsonObject } from "../src/platform/database/client/internal/prismaNamespace.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let ctx: E2eContext;
let sequence = 0;

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
  sequence = 0;
});

function staff(): ReturnType<E2eContext["http"]> {
  return ctx.http().set("Authorization", "Bearer staff-e2e");
}

/** Insère une ligne de journal (sujet = personne). */
async function seed(
  type: string,
  subjectId: string,
  occurredAt: string,
  payload: InputJsonObject,
): Promise<void> {
  sequence += 1;
  await ctx.prisma.activityEvent.create({
    data: {
      id: `evt_${String(sequence).padStart(6, "0")}`,
      type,
      occurredAt: new Date(occurredAt),
      subjectType: "user",
      subjectId,
      actorType: "customer",
      traceId: "0".repeat(32),
      idempotencyKey: `${type}:${subjectId}:${sequence}`,
      payload,
    },
  });
}

/** Un établissement démarché, saisi par la vraie route : le coup `nurture`. */
async function captureLead(businessName: string): Promise<string> {
  const created = jsonBody<CreatedLeadResponse>(
    await staff().post("/admin/leads").send({ businessName }).expect(201),
  );
  return created.id;
}

/** Matérialise le read-model via le vrai endpoint de recompute. */
async function recompute(): Promise<void> {
  await ctx
    .http()
    .post("/admin/recompute")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
}

describe("GET /admin/cockpit", () => {
  it("mure la route côté staff (401 sans jeton porteur)", async () => {
    await ctx.http().get("/admin/cockpit").expect(401);
  });

  it("rend la queue top-5 du read-model matérialisé et journalise reco.shown", async () => {
    const id = await captureLead("Bistrot du Coin");
    await recompute();

    const queue = jsonBody<LeadScoreView[]>(await staff().get("/admin/cockpit").expect(200));
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ subjectId: id, play: "nurture" });

    // reco.shown a bien été journalisé pour le coup affiché.
    const shown = await ctx.prisma.activityEvent.findMany({ where: { type: "reco.shown" } });
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ subjectType: "lead", subjectId: id });
  });

  /**
   * Régression : l'auteur de `reco.shown` était la personne qui ouvrait le
   * cockpit — et seulement la PREMIÈRE de la fenêtre, la clé ne dépendant pas
   * d'elle. La ligne lisait « Hugo » là où c'est le cockpit qui recommande
   * (relevé par Hugo le 2026-09-19 sur l'écran Journal).
   */
  it("inscrit reco.shown au nom du système, pas de la personne qui ouvre le cockpit", async () => {
    await captureLead("Bistrot du Coin");
    await recompute();

    await staff().get("/admin/cockpit").expect(200);

    const shown = await ctx.prisma.activityEvent.findMany({ where: { type: "reco.shown" } });
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ actorType: "system", actorId: null, actorName: null });
  });

  it("reste idempotent : rouvrir le cockpit dans la même fenêtre ne recompte pas reco.shown", async () => {
    await captureLead("Bistrot du Coin");
    await recompute();

    await staff().get("/admin/cockpit").expect(200);
    await staff().get("/admin/cockpit").expect(200);

    const shown = await ctx.prisma.activityEvent.count({ where: { type: "reco.shown" } });
    expect(shown).toBe(1);
  });

  it("rend une queue vide quand le read-model n'a pas été matérialisé", async () => {
    const queue = jsonBody<LeadScoreView[]>(await staff().get("/admin/cockpit").expect(200));
    expect(queue).toEqual([]);
  });

  it("fait remonter un lead cold actif dans la queue avec la play nurture", async () => {
    const id = await captureLead("Traiteur Démarché");
    await staff().patch(`/admin/leads/${id}`).send({ status: "negotiating" }).expect(204);
    await recompute();

    const queue = jsonBody<LeadScoreView[]>(await staff().get("/admin/cockpit").expect(200));
    const cold = queue.find((entry) => entry.subjectId === id);
    expect(cold).toMatchObject({
      subjectType: "lead",
      play: "nurture",
      label: "Traiteur Démarché",
    });
  });

  /**
   * Régression (lot P3, 2026-10-25) : un particulier qui commandait sans
   * société entrait dans « les 5 meilleurs coups » en `lock_in`.
   */
  it("ne met aucun particulier dans la queue", async () => {
    await seed("user.registered", "u_perso", daysAgo(10), {});
    await seed("order.placed", "u_perso", daysAgo(3), { totalCents: 5000, companyId: null });
    await recompute();

    const queue = jsonBody<LeadScoreView[]>(await staff().get("/admin/cockpit").expect(200));
    expect(queue).toEqual([]);
  });

  /**
   * Le read-model calculé avant P3 porte encore des lignes « personne »
   * jusqu'au prochain recompute : le cockpit ne doit pas les montrer d'ici là.
   */
  it("écarte une ligne « personne » restée dans le read-model d'avant P3", async () => {
    await ctx.prisma.leadScore.create({
      data: {
        subjectType: "user",
        subjectId: "u_stale",
        label: "chef@resto.fr",
        play: "lock_in",
        score: 99,
        reason: "…",
        momentum: "stable",
        monetaryCents: 5000,
        recencyDays: 1,
        computedAt: new Date(daysAgo(0)),
      },
    });

    const queue = jsonBody<LeadScoreView[]>(await staff().get("/admin/cockpit").expect(200));
    expect(queue).toEqual([]);
  });
});
