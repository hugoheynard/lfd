/**
 * E2E du **moyen d'encaissement d'un payeur** (plan
 * `documentation/comptabilite/plan-paiement-au-compte-par-virement.md`, T1 :
 * V1, V2, V10, V11).
 *
 * Ce que seul le vrai serveur prouve : la table append-only et ses CHECK
 * acceptent ce que le domaine écrit ; la prise d'effet se lit sur le mode du
 * payeur, immédiate pour un payeur qui n'a jamais commandé ; un site lit le
 * moyen de son principal ; le droit propre `b2b_collection_means` garde le
 * geste ; le mandat reste en place ; le fait tombe au journal.
 *
 * Aucune date absolue : les clôtures attendues se calculent depuis l'instant
 * présent.
 */
import type { PayerCollectionMeansView } from "@lfd/contracts";
import { daysAgo, jsonBody } from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import {
  BASE,
  ctx,
  declare,
  lastMonthlyClosure,
  mandated,
  nextMonthlyClosure,
  ordered,
  staff,
  useBillingModeScene,
} from "./billing-mode-scene.js";

useBillingModeScene();

const REASON = "Le client règle par virement, à sa demande écrite";
const route = (entityId: string, companyId: string): string =>
  `${BASE}/${entityId}/payers/${companyId}/collection-means`;

async function toTransfer(entityId: string, companyId: string): Promise<PayerCollectionMeansView> {
  await staff()
    .put(route(entityId, companyId))
    .send({ means: "bank_transfer", reason: REASON })
    .expect(204);
  return jsonBody<PayerCollectionMeansView>(
    await staff().get(route(entityId, companyId)).expect(200),
  );
}

describe("le moyen d'encaissement d'un payeur", () => {
  it("prélèvement par défaut ; un payeur sans commande passe au virement tout de suite", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "Le Nouveau SAS" });
    await mandated(id, payer.id);
    const before = jsonBody<PayerCollectionMeansView>(
      await staff().get(route(id, payer.id)).expect(200),
    );
    expect(before).toMatchObject({ means: "sepa_debit", since: null, scheduled: null });

    const view = await toTransfer(id, payer.id);

    expect(view).toMatchObject({
      means: "bank_transfer",
      since: lastMonthlyClosure(),
      scheduled: null,
    });
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { subjectId: payer.id, type: "payer.collection_means_changed" },
      select: { payload: true },
    });
    expect(fact.payload).toMatchObject({ immediate: true, to: "bank_transfer", reason: REASON });
    // V11 : le mandat reste en place ; le moyen n'écrit aucun segment de mode.
    expect(
      await ctx.prisma.paymentMandate.count({ where: { companyId: payer.id, status: "active" } }),
    ).toBe(1);
    expect(await ctx.prisma.payerBillingMode.count()).toBe(0);
  });

  it("un payeur qui a commandé passe au virement à sa prochaine clôture ; s'annule avant", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "L'Habitué SAS" });
    await ordered(payer.id);

    const view = await toTransfer(id, payer.id);

    expect(view).toMatchObject({
      means: "sepa_debit",
      scheduled: { means: "bank_transfer", effectiveAt: nextMonthlyClosure(), reason: REASON },
    });
    // Un rejeu du même geste n'écrit rien.
    await staff()
      .put(route(id, payer.id))
      .send({ means: "bank_transfer", reason: REASON })
      .expect(204);
    expect(await ctx.prisma.payerCollectionMeans.count()).toBe(1);
    // Revenir au prélèvement pendant que le virement est programmé : annuler d'abord.
    const refused = await staff()
      .put(route(id, payer.id))
      .send({ means: "sepa_debit", reason: REASON })
      .expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe(
      "accounting.collection_means.change_pending",
    );

    await staff()
      .delete(`${route(id, payer.id)}/scheduled`)
      .expect(204);

    const after = jsonBody<PayerCollectionMeansView>(
      await staff().get(route(id, payer.id)).expect(200),
    );
    expect(after).toMatchObject({ means: "sepa_debit", scheduled: null });
    const row = await ctx.prisma.payerCollectionMeans.findFirstOrThrow();
    expect(row.cancelledAt).not.toBeNull();
    await staff()
      .delete(`${route(id, payer.id)}/scheduled`)
      .expect(409);
  });

  it("un site qui suit son principal lit le moyen du principal et ne se change pas", async () => {
    const id = await declare();
    const principal = await createCompany(ctx.prisma, { raisonSociale: "Groupe SAS" });
    const site = await createCompany(ctx.prisma, { raisonSociale: "Site Annexe SAS" });
    // Un site ne suit que son principal ACTUEL (`company_follows_parent`) : le rattachement d'abord.
    await ctx.prisma.company.update({
      where: { id: site.id },
      data: { parentCompanyId: principal.id },
    });
    await ctx.prisma.companyFollow.create({
      data: {
        companyId: site.id,
        parentId: principal.id,
        aspect: "billing",
        validFrom: new Date(daysAgo(60)),
      },
    });
    await toTransfer(id, principal.id);

    const view = jsonBody<PayerCollectionMeansView>(
      await staff().get(route(id, site.id)).expect(200),
    );
    expect(view).toMatchObject({
      payerCompanyId: principal.id,
      followsPayer: { id: principal.id, name: "Groupe SAS" },
      means: "bank_transfer",
    });
    const refused = await staff()
      .put(route(id, site.id))
      .send({ means: "bank_transfer", reason: REASON })
      .expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe(
      "accounting.collection_means.not_a_payer",
    );
  });

  it("refuse un motif vide (400) et un moyen inconnu (400)", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "Sans Motif SAS" });
    const blank = await staff()
      .put(route(id, payer.id))
      .send({ means: "bank_transfer", reason: "  " })
      .expect(400);
    expect(jsonBody<{ code: string }>(blank).code).toBe(
      "accounting.collection_means.reason_required",
    );
    await staff().put(route(id, payer.id)).send({ means: "cheque", reason: REASON }).expect(400);
    expect(await ctx.prisma.payerCollectionMeans.count()).toBe(0);
  });

  it("refuse (403) le geste à qui n'a que la comptabilité ; la lecture reste ouverte", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "Le Muré SAS" });
    await ctx.prisma.staffUser.create({
      data: {
        id: "fiche-comptable-means",
        firstName: "Fiche",
        lastName: "Comptable",
        email: "comptable-means@lfc.test",
        role: "comptabilite",
        status: "active",
        auth0Id: "staff-comptable-means",
      },
    });
    const accountant = () => ctx.asSub("staff-comptable-means");

    await accountant().get(route(id, payer.id)).expect(200);
    await accountant()
      .put(route(id, payer.id))
      .send({ means: "bank_transfer", reason: REASON })
      .expect(403);
    await accountant()
      .delete(`${route(id, payer.id)}/scheduled`)
      .expect(403);
    expect(await ctx.prisma.payerCollectionMeans.count()).toBe(0);
  });
});

describe("un seul changement en attente par payeur, mode et moyen confondus (K1, K11)", () => {
  const modeRoute = (entityId: string, companyId: string): string =>
    `${BASE}/${entityId}/payers/${companyId}/billing-mode`;

  it("un moyen programmé refuse un mode, et un mode programmé refuse un moyen (409 nommé)", async () => {
    const id = await declare();
    const meansFirst = await createCompany(ctx.prisma, { raisonSociale: "Moyen D'abord SAS" });
    const modeFirst = await createCompany(ctx.prisma, { raisonSociale: "Mode D'abord SAS" });
    await ordered(meansFirst.id);
    await ordered(modeFirst.id);
    await toTransfer(id, meansFirst.id);
    await staff().put(modeRoute(id, modeFirst.id)).send({ mode: "weekly" }).expect(204);

    const modeRefused = await staff()
      .put(modeRoute(id, meansFirst.id))
      .send({ mode: "weekly" })
      .expect(409);
    const meansRefused = await staff()
      .put(route(id, modeFirst.id))
      .send({ means: "bank_transfer", reason: REASON })
      .expect(409);

    expect(jsonBody<{ code: string; message: string }>(modeRefused)).toMatchObject({
      code: "accounting.payer_change.means_pending",
      message: expect.stringContaining("passe déjà au virement bancaire") as unknown,
    });
    expect(jsonBody<{ code: string; message: string }>(meansRefused)).toMatchObject({
      code: "accounting.payer_change.mode_pending",
      message: expect.stringContaining("passe déjà au mode hebdomadaire") as unknown,
    });
    expect(
      await ctx.prisma.payerBillingMode.count({ where: { payerCompanyId: meansFirst.id } }),
    ).toBe(0);
    expect(
      await ctx.prisma.payerCollectionMeans.count({ where: { payerCompanyId: modeFirst.id } }),
    ).toBe(0);
  });

  it("deux gestes simultanés sur le même payeur : un seul passe, l'autre lit le premier et refuse", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "Le Disputé SAS" });
    await ordered(payer.id);

    const [mode, means] = await Promise.all([
      staff().put(modeRoute(id, payer.id)).send({ mode: "weekly" }),
      staff().put(route(id, payer.id)).send({ means: "bank_transfer", reason: REASON }),
    ]);

    expect([mode.status, means.status].sort()).toEqual([204, 409]);
    const written =
      (await ctx.prisma.payerBillingMode.count({ where: { payerCompanyId: payer.id } })) +
      (await ctx.prisma.payerCollectionMeans.count({ where: { payerCompanyId: payer.id } }));
    expect(written).toBe(1);
  });
});
