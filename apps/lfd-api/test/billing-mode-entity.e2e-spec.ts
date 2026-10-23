/**
 * E2E des modes de facturation — **les dates de l'entité** : programmer, annuler, refuser,
 * et le droit.
 *
 * Découpé de `billing-modes.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `billing-mode-scene.ts`.
 */
import { createCompany } from "./factories.js";
import {
  BASE,
  ctx,
  declare,
  modeOf,
  nextMonthlyClosure,
  read,
  staff,
  useBillingModeScene,
} from "./billing-mode-scene.js";

useBillingModeScene();

describe("les dates des modes de l'entité", () => {
  it("naissent aux trois défauts, sans programmé ni verrou", async () => {
    const id = await declare();

    const view = await read(id);
    expect(view.billingModes.map((mode) => [mode.mode, mode.current.days, mode.scheduled])).toEqual(
      [
        ["monthly", [1], null],
        ["semimonthly", [1, 16], null],
        ["weekly", [1], null],
      ],
    );
    expect(view.billingModes[0]?.upcomingClosures[0]?.closesAt).toBe(nextMonthlyClosure());
  });

  it("programme des dates à la prochaine clôture du mode, et le journalise", async () => {
    const id = await declare();
    const effectiveAt = nextMonthlyClosure();

    await staff()
      .put(`${BASE}/${id}/billing-modes/monthly`)
      .send({ days: [15] })
      .expect(204);

    expect(await modeOf(id, "monthly")).toMatchObject({
      current: { days: [1], since: null },
      scheduled: { days: [15], effectiveAt },
      changeLockedUntil: effectiveAt,
    });
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: id, type: "legal_entity.billing_mode_dates_changed" },
      select: { payload: true },
    });
    expect(facts).toEqual([
      {
        payload: {
          subjectLabel: "La Folie Douce",
          mode: "monthly",
          from: [1],
          to: [15],
          effectiveAt,
          cancelled: false,
        },
      },
    ]);
  });

  it("refuse en 409 un second changement du même mode, en nommant le geste, sans rien écrire", async () => {
    const id = await declare();
    await staff()
      .put(`${BASE}/${id}/billing-modes/monthly`)
      .send({ days: [15] })
      .expect(204);

    const response = await staff()
      .put(`${BASE}/${id}/billing-modes/monthly`)
      .send({ days: [10] })
      .expect(409);

    expect(JSON.stringify(response.body)).toContain("annulez d'abord le changement programmé");
    expect((await modeOf(id, "monthly")).scheduled?.days).toEqual([15]);
  });

  it("annule le programmé : la ligne reste, annulée, et le mode redevient libre", async () => {
    const id = await declare();
    await staff()
      .put(`${BASE}/${id}/billing-modes/weekly`)
      .send({ days: [5] })
      .expect(204);

    await staff().delete(`${BASE}/${id}/billing-modes/weekly/scheduled`).expect(204);

    expect(await modeOf(id, "weekly")).toMatchObject({ scheduled: null, changeLockedUntil: null });
    const rows = await ctx.prisma.billingModeDates.findMany({ where: { legalEntityId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cancelledAt).not.toBeNull();
    expect(rows[0]?.cancelledByStaffId).not.toBeNull();
  });

  it("refuse en 409 l'annulation quand rien n'est programmé", async () => {
    const id = await declare();

    await staff().delete(`${BASE}/${id}/billing-modes/monthly/scheduled`).expect(409);
  });

  it("refuse le 29 et un mode inconnu en 400", async () => {
    const id = await declare();

    const day = await staff()
      .put(`${BASE}/${id}/billing-modes/monthly`)
      .send({ days: [29] })
      .expect(400);
    expect(JSON.stringify(day.body)).toContain("1 à 28");
    await staff()
      .put(`${BASE}/${id}/billing-modes/yearly`)
      .send({ days: [1] })
      .expect(400);
  });

  it("la base refuse d'effacer ou de réécrire un segment (append-only)", async () => {
    const id = await declare();
    await staff()
      .put(`${BASE}/${id}/billing-modes/monthly`)
      .send({ days: [15] })
      .expect(204);

    await expect(
      ctx.prisma.billingModeDates.updateMany({
        where: { legalEntityId: id },
        data: { days: [10] },
      }),
    ).rejects.toThrow(/append_only/u);
    await expect(
      ctx.prisma.billingModeDates.deleteMany({ where: { legalEntityId: id } }),
    ).rejects.toThrow(/append_only/u);
  });
});

describe("le droit", () => {
  it("refuse les gestes à la seule lecture comptable (403), sans rien écrire", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma);
    const reader = await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "lecture",
        email: "lecture@lfc.test",
        role: "communication",
        status: "active",
        auth0Id: "staff-lecture",
      },
    });
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: reader.id, resource: "b2b_accounting", action: "read", effect: "allow" },
    });

    await ctx
      .asSub("staff-lecture")
      .put(`${BASE}/${id}/billing-modes/weekly`)
      .send({ days: [3] })
      .expect(403);
    await ctx
      .asSub("staff-lecture")
      .put(`${BASE}/${id}/payers/${payer.id}/billing-mode`)
      .send({ mode: "weekly" })
      .expect(403);
    expect(await ctx.prisma.billingModeDates.count({ where: { legalEntityId: id } })).toBe(0);
    expect(await ctx.prisma.payerBillingMode.count({ where: { legalEntityId: id } })).toBe(0);
  });
});
