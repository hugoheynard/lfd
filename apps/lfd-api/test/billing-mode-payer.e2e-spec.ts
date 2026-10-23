/**
 * E2E des modes de facturation — **le mode d'un payeur**
 *
 * Découpé de `billing-modes.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `billing-mode-scene.ts`.
 */
import type { PayerBillingModeView } from "@lfd/contracts";
import { daysAgo, jsonBody } from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import {
  BASE,
  ctx,
  declare,
  mandated,
  modeOf,
  nextMonthlyClosure,
  staff,
  useBillingModeScene,
} from "./billing-mode-scene.js";

useBillingModeScene();

describe("le mode d'un payeur", () => {
  it("se lit mensuel par défaut, puis se programme à sa prochaine clôture, et se journalise", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "Le Bistrot SAS" });
    await mandated(id, payer.id);
    const effectiveAt = nextMonthlyClosure();

    const before = jsonBody<PayerBillingModeView>(
      await staff().get(`${BASE}/${id}/payers/${payer.id}/billing-mode`).expect(200),
    );
    expect(before).toMatchObject({ mode: "monthly", since: null, scheduled: null });

    await staff()
      .put(`${BASE}/${id}/payers/${payer.id}/billing-mode`)
      .send({ mode: "weekly" })
      .expect(204);

    const after = jsonBody<PayerBillingModeView>(
      await staff().get(`${BASE}/${id}/payers/${payer.id}/billing-mode`).expect(200),
    );
    expect(after).toMatchObject({
      mode: "monthly",
      scheduled: { mode: "weekly", effectiveAt },
      changeLockedUntil: effectiveAt,
    });
    expect(after.upcomingClosures[0]?.closesAt).toBe(effectiveAt);
    // Programmé, pas encore en vigueur : il compte au mensuel, comme au tableau de bord.
    expect((await modeOf(id, "weekly")).payerCount).toBe(0);
    expect((await modeOf(id, "monthly")).payerCount).toBe(1);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: payer.id, type: "payer.billing_mode_changed" },
      select: { payload: true },
    });
    expect(facts).toHaveLength(1);
  });

  it("refuse en 409 un second changement, puis admet l'annulation", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma);
    const route = `${BASE}/${id}/payers/${payer.id}/billing-mode`;
    await staff().put(route).send({ mode: "weekly" }).expect(204);

    await staff().put(route).send({ mode: "semimonthly" }).expect(409);
    await staff().delete(`${route}/scheduled`).expect(204);

    const view = jsonBody<PayerBillingModeView>(await staff().get(route).expect(200));
    expect(view.scheduled).toBeNull();
  });

  it("refuse un site facturé chez un autre, en nommant le payeur (409)", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "Groupe Payeur SAS" });
    const site = await createCompany(ctx.prisma, { raisonSociale: "Site Annexe SAS" });
    // Comme `cycle-statements-payer` : un site ne suit que son principal ACTUEL
    // (contrainte `company_follows_parent`) — le rattachement d'abord.
    await ctx.prisma.company.update({
      where: { id: site.id },
      data: { parentCompanyId: payer.id },
    });
    await ctx.prisma.companyFollow.create({
      data: {
        companyId: site.id,
        parentId: payer.id,
        aspect: "billing",
        validFrom: new Date(daysAgo(30)),
        validTo: null,
      },
    });

    const response = await staff()
      .put(`${BASE}/${id}/payers/${site.id}/billing-mode`)
      .send({ mode: "weekly" })
      .expect(409);

    expect(JSON.stringify(response.body)).toContain("Groupe Payeur SAS");
    expect(await ctx.prisma.payerBillingMode.count({ where: { legalEntityId: id } })).toBe(0);
  });

  it("refuse un compte inconnu en 404", async () => {
    const id = await declare();

    await staff()
      .put(`${BASE}/${id}/payers/cmp_inconnu/billing-mode`)
      .send({ mode: "weekly" })
      .expect(404);
  });
});
