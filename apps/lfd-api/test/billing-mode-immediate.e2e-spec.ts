/**
 * E2E du **changement de mode immédiat** (plan
 * `documentation/comptabilite/facturation/plan-changement-de-mode-immediat.md`,
 * lot I2) : un payeur qui n'a jamais commandé change de mode tout de suite,
 * daté de la dernière clôture passée ; dès qu'une commande le touche, par
 * lui ou facturée à lui, le changement est programmé.
 *
 * Ce que seul le vrai serveur prouve : la lecture large des commandes, la
 * date d'écriture relue par le calendrier, et la fiche de l'entité dont la
 * dernière clôture n'est aucun lundi passé.
 *
 * Aucune date absolue : C0 et la prochaine clôture sont calculées depuis
 * l'instant présent.
 */
import type { PayerBillingModeView } from "@lfd/contracts";
import { jsonBody } from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import {
  BASE,
  ctx,
  declare,
  lastMonthlyClosure,
  mandated,
  nextMonthlyClosure,
  ordered,
  read,
  staff,
  useBillingModeScene,
} from "./billing-mode-scene.js";

useBillingModeScene();

async function setWeekly(id: string, payerId: string): Promise<PayerBillingModeView> {
  const route = `${BASE}/${id}/payers/${payerId}/billing-mode`;
  await staff().put(route).send({ mode: "weekly" }).expect(204);
  return jsonBody<PayerBillingModeView>(await staff().get(route).expect(200));
}

async function lastFact(payerId: string): Promise<unknown> {
  const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
    where: { subjectId: payerId, type: "payer.billing_mode_changed" },
    select: { payload: true },
  });
  return fact.payload;
}

describe("le changement de mode immédiat", () => {
  it("un client sans commande passe à hebdomadaire tout de suite, sans clôture passée", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "Le Nouveau SAS" });
    const c0 = lastMonthlyClosure();
    await mandated(id, payer.id);
    // La page des entités le compte « sans mode choisi » tant qu'il n'a rien choisi.
    expect((await read(id)).payersWithoutModeCount).toBe(1);

    const view = await setWeekly(id, payer.id);

    expect(view).toMatchObject({
      mode: "weekly",
      since: c0,
      scheduled: null,
      changeLockedUntil: null,
    });
    expect(await lastFact(payer.id)).toMatchObject({ effectiveAt: c0, immediate: true });
    // Aucun lundi entre C0 et maintenant n'est une clôture de l'entité.
    expect((await read(id)).lastClosure).toBe(c0);
    expect((await read(id)).payersWithoutModeCount).toBe(0);
  });

  it("un client qui a commandé reste programmé à la prochaine clôture", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "L'Habitué SAS" });
    await ordered(payer.id);

    const view = await setWeekly(id, payer.id);

    expect(view).toMatchObject({
      mode: "monthly",
      scheduled: { mode: "weekly", effectiveAt: nextMonthlyClosure() },
    });
    expect(await lastFact(payer.id)).toMatchObject({ immediate: false });
  });

  it("une commande facturée au payeur par un site parti bloque l'immédiat", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "Groupe SAS" });
    // Le site ne suit plus le payeur : seule la commande facturée le relie.
    const formerSite = await createCompany(ctx.prisma, { raisonSociale: "Ancien Site SAS" });
    await ordered(formerSite.id, payer.id);

    const view = await setWeekly(id, payer.id);

    expect(view).toMatchObject({ mode: "monthly", scheduled: { mode: "weekly" } });
  });
});
