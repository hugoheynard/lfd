/**
 * E2E des modes de facturation — **le calendrier des trois rythmes** et ses comptes.
 *
 * Découpé de `billing-modes.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `billing-mode-scene.ts`.
 */
import type { BillingRhythmsCalendarView } from "@lfd/contracts";
import { jsonBody } from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import {
  BASE,
  ctx,
  declare,
  mandated,
  modeOf,
  nextMonthlyClosure,
  read,
  staff,
  useBillingModeScene,
} from "./billing-mode-scene.js";

useBillingModeScene();

describe("le calendrier des trois rythmes", () => {
  it("rend les trois rythmes sur l'axe, leurs jalons dans l'ordre, et la prochaine clôture mensuelle", async () => {
    const id = await declare();

    const view = jsonBody<BillingRhythmsCalendarView>(
      await staff().get(`${BASE}/${id}/billing-modes/calendar`).expect(200),
    );

    expect(view.legalEntityId).toBe(id);
    expect(view.rhythms.map((lane) => lane.mode)).toEqual(["weekly", "semimonthly", "monthly"]);
    expect(view.today >= view.startsOn && view.today < view.endsOn).toBe(true);
    const monthly = view.rhythms.find((lane) => lane.mode === "monthly");
    expect(monthly?.followed).toBe(true);
    expect(monthly?.periods.map((period) => period.closesAt)).toContain(nextMonthlyClosure());
    for (const period of view.rhythms.flatMap((lane) => lane.periods)) {
      expect(period.invoicedOn < period.noticeOn).toBe(true);
      expect(period.noticeOn < period.collectionDay).toBe(true);
    }
  });

  /**
   * Régression : le mensuel ne comptait que les payeurs ayant CHOISI un mode,
   * jamais ceux qui l'ont par défaut (2026-10-23).
   */
  it("le mensuel ne comptait pas les clients au mode par défaut", async () => {
    const id = await declare();
    for (const raisonSociale of ["Sans Choix SAS", "Sans Choix Non Plus SAS"]) {
      await mandated(id, (await createCompany(ctx.prisma, { raisonSociale })).id);
    }

    const view = jsonBody<BillingRhythmsCalendarView>(
      await staff().get(`${BASE}/${id}/billing-modes/calendar`).expect(200),
    );

    expect(view.rhythms.map((lane) => [lane.mode, lane.payerCount])).toEqual([
      ["weekly", 0],
      ["semimonthly", 0],
      ["monthly", 2],
    ]);
  });

  /** Régression : un compte suspendu, mandat signé compris, comptait au mensuel (2026-10-23). */
  it("une société désactivée comptait comme client", async () => {
    const id = await declare();
    const on = await createCompany(ctx.prisma, { raisonSociale: "Active SAS" });
    const off = await createCompany(ctx.prisma, { raisonSociale: "Suspendue SAS" });
    await mandated(id, on.id);
    await mandated(id, off.id);
    await ctx.prisma.company.update({ where: { id: off.id }, data: { status: "suspended" } });

    const view = jsonBody<BillingRhythmsCalendarView>(
      await staff().get(`${BASE}/${id}/billing-modes/calendar`).expect(200),
    );

    expect(view.rhythms.find((lane) => lane.mode === "monthly")?.payerCount).toBe(1);
  });

  /** Régression : tout compte comptait au mensuel, mandat ou pas (2026-10-23). */
  it("un client sans mandat signé comptait au mensuel", async () => {
    const id = await declare();
    const signed = await createCompany(ctx.prisma, { raisonSociale: "Mandatée SAS" });
    await createCompany(ctx.prisma, { raisonSociale: "Sans Mandat SAS" });
    await mandated(id, signed.id);

    const view = jsonBody<BillingRhythmsCalendarView>(
      await staff().get(`${BASE}/${id}/billing-modes/calendar`).expect(200),
    );

    expect(view.rhythms.find((lane) => lane.mode === "monthly")?.payerCount).toBe(1);
  });

  /** Régression : la fiche et le tableau de bord annonçaient deux nombres (2026-10-23). */
  it("la fiche et le calendrier rendent le même nombre par rythme", async () => {
    const id = await declare();
    const ids: string[] = [];
    for (const raisonSociale of ["Défaut SAS", "Programmé SAS", "Sans Mandat SAS"]) {
      ids.push((await createCompany(ctx.prisma, { raisonSociale })).id);
    }
    const [byDefault, scheduled, unmandated] = ids;
    await mandated(id, byDefault ?? "");
    await mandated(id, scheduled ?? "");
    for (const payer of [scheduled, unmandated]) {
      await staff()
        .put(`${BASE}/${id}/payers/${payer ?? ""}/billing-mode`)
        .send({ mode: "weekly" })
        .expect(204);
    }

    const calendar = jsonBody<BillingRhythmsCalendarView>(
      await staff().get(`${BASE}/${id}/billing-modes/calendar`).expect(200),
    );
    const sheet = await read(id);

    const fromCalendar = new Map(calendar.rhythms.map((lane) => [lane.mode, lane.payerCount]));
    const fromSheet = new Map(sheet.billingModes.map((mode) => [mode.mode, mode.payerCount]));
    expect(fromSheet).toEqual(fromCalendar);
    // L'hebdomadaire programmé ne compte pas encore ; le sans-mandat jamais.
    expect(fromSheet.get("monthly")).toBe(2);
    expect(fromSheet.get("weekly")).toBe(0);
  });

  it("la fiche compte les mêmes clients : un hebdomadaire sans mandat n'y compte pas", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "Sans Mandat SAS" });
    await staff()
      .put(`${BASE}/${id}/payers/${payer.id}/billing-mode`)
      .send({ mode: "weekly" })
      .expect(204);

    expect((await modeOf(id, "weekly")).payerCount).toBe(0);
  });

  it("refuse une entité inconnue en 404", async () => {
    await staff().get(`${BASE}/inconnue/billing-modes/calendar`).expect(404);
  });
});
