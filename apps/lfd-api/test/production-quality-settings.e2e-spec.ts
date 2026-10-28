/**
 * E2E : **où le contrôle qualité se rend** — Réglages › Commandes (décision de
 * Hugo, 2026-10-26, `documentation/fournil/plan-controle-qualite.md`, D10),
 * sur le vrai Postgres jetable.
 *
 * Ce que seule cette suite prouve : les défauts quand la ligne n'existe pas
 * (fournil désactivé, colisage activé), le réglage posé et journalisé dans la
 * même transaction, le droit des réglages de commande voisins, et le refus
 * d'un verdict à un niveau désactivé AVANT toute lecture de la journée. La
 * retenue déjà posée qu'on ne lève pas en désactivant, et la réactivation,
 * sont dans `handover-quality-hold.e2e-spec.ts`.
 */
import type { QualityBoardView, QualityControlSettingsView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";

const ROUTE = "/admin/production/quality-settings";
const READER = "staff-reglages-qualite-lecture";
const DAY = serviceDay();

/** Signature du jeton staff doublée : le jeton porteur EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
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

const admin = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

let sequence = 0;
function ulid(): string {
  sequence += 1;
  return `01JQR${String(sequence).padStart(21, "0")}`;
}

async function read(): Promise<QualityControlSettingsView> {
  return jsonBody<QualityControlSettingsView>(await admin().get(ROUTE).expect(200));
}

function verdict(target: { kind: "line"; sku: string } | { kind: "order"; orderId: string }) {
  return admin().post("/admin/supervision/quality/checks").send({
    id: ulid(),
    serviceDay: DAY,
    target,
    verdict: "ok",
    note: null,
    uploadIds: [],
  });
}

describe("Réglages › Commandes › Contrôle qualité", () => {
  it("rend les défauts tant que personne n'a rien réglé", async () => {
    await expect(read()).resolves.toEqual({
      lineChecks: false,
      orderChecks: true,
      source: "default",
    });
    await expect(ctx.prisma.productionQualitySettings.count()).resolves.toBe(0);
  });

  it("pose le réglage, fige l'auteur, journalise l'avant et l'après ; reposer n'écrit rien", async () => {
    await admin().put(ROUTE).send({ lineChecks: true, orderChecks: false }).expect(204);
    await admin().put(ROUTE).send({ lineChecks: true, orderChecks: false }).expect(204);

    await expect(read()).resolves.toEqual({
      lineChecks: true,
      orderChecks: false,
      source: "explicit",
    });
    const row = await ctx.prisma.productionQualitySettings.findFirstOrThrow();
    expect(row.updatedBy).toBe(E2E_STAFF_ID);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "production_quality_settings.updated" },
      select: { payload: true },
    });
    expect(facts).toEqual([
      {
        payload: {
          lineChecks: true,
          orderChecks: false,
          previous: { lineChecks: false, orderChecks: true },
        },
      },
    ]);
  });

  it("refuse une charge mal formée (400)", async () => {
    await admin().put(ROUTE).send({ lineChecks: "oui", orderChecks: true }).expect(400);
  });

  it("se lit en `read`, ne se règle qu'en `write`", async () => {
    const row = await ctx.prisma.staffUser.create({
      data: {
        firstName: "Lecture",
        lastName: "Réglages",
        email: `${READER}@lfc.test`,
        role: "communication",
        status: "active",
        auth0Id: READER,
      },
    });
    await ctx.prisma.staffPermissionOverride.create({
      data: {
        staffUserId: row.id,
        resource: "lfc_order_settings",
        action: "read",
        effect: "allow",
      },
    });

    await ctx.asSub(READER).get(ROUTE).expect(200);
    await ctx.asSub(READER).put(ROUTE).send({ lineChecks: true, orderChecks: true }).expect(403);
  });
});

describe("un verdict à un niveau désactivé", () => {
  it("par défaut, refuse une ligne (409) en nommant le réglage, sans rien écrire", async () => {
    const refused = await verdict({ kind: "line", sku: "VIE-001" }).expect(409);

    const body = jsonBody<{ code: string; message: string }>(refused);
    expect(body.code).toBe("production.quality.disabled");
    expect(body.message).toContain("au fournil");
    expect(body.message).toContain("Réglages › Commandes");
    await expect(ctx.prisma.productionQualityCheck.count()).resolves.toBe(0);
  });

  it("colisage désactivé : refuse une commande (409) ; les pastilles disent où l'on juge", async () => {
    await admin().put(ROUTE).send({ lineChecks: true, orderChecks: false }).expect(204);

    const refused = await verdict({ kind: "order", orderId: "ord_absente" }).expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe("production.quality.disabled");
    const board = jsonBody<QualityBoardView>(
      await admin().get(`/admin/supervision/quality?date=${DAY}`).expect(200),
    );
    expect(board.enabled).toEqual({ lineChecks: true, orderChecks: false });
  });
});
