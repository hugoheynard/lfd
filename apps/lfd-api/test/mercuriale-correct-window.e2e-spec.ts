/**
 * E2E de **« Corriger les dates »** d'une mercuriale à venir
 * (`documentation/pricing/mercuriales/comprendre-une-mercuriale.md`, § 9).
 *
 * Ce que seul ce niveau prouve : la nouvelle fenêtre écrite en base et lue
 * par la caisse (le prix s'applique dès le nouveau début), le mur
 * `company_id`, et les refus rejoués contre les vraies lectures — une
 * mercuriale en cours, un engagement de volume, un avenant écrit entre-temps.
 *
 * Toutes les dates sont relatives : chaque refus compare la fenêtre à
 * l'horloge. La pause n'a pas de geste sur une mercuriale ; elle se prouve au
 * niveau du domaine.
 */
import type { CompanyPricingView } from "@lfd/contracts";
import { instantToLocal, localToInstant } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

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

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** VIE-001-1 vaut 200 c dans le catalogue qui facture. */
const SKU = "VIE-001-1";
const CANONICAL_MILLICENTS = 200_000;
const NEGOTIATED_MILLICENTS = 150_000;
const REASON = "Posée un an trop tard par erreur";

/** Minuit à Paris, dans `days` jours (négatif = passé). */
function parisMidnight(days: number): string {
  const today = instantToLocal(new Date()).day;
  const base = localToInstant(today, "00:00");
  if (base === null) {
    throw new Error(`Minuit introuvable à Paris le ${today}.`);
  }
  // 12 h de marge puis retour à minuit : un changement d'heure ne décale pas le jour.
  const shifted = new Date(base.getTime() + days * 86_400_000 + 12 * 3_600_000);
  const instant = localToInstant(instantToLocal(shifted).day, "00:00");
  if (instant === null) {
    throw new Error("Minuit introuvable à Paris.");
  }
  return instant.toISOString();
}

const pose = (companyId: string, body: Record<string, unknown> = {}) =>
  staff()
    .post(`/admin/pricing/companies/${companyId}/mercuriale`)
    .set(INTENT_KEY, freshIntent())
    .send({
      label: "Mercuriale de saison",
      validFrom: parisMidnight(365),
      validTo: null,
      lines: [{ sku: SKU, unitPriceMillicents: NEGOTIATED_MILLICENTS }],
      ...body,
    });

const correct = (
  companyId: string,
  mercurialeId: string,
  body: Record<string, unknown> = {},
  intent: string = freshIntent(),
) =>
  staff()
    .patch(`/admin/pricing/companies/${companyId}/mercuriale/${mercurialeId}/window`)
    .set(INTENT_KEY, intent)
    .send({
      validFrom: parisMidnight(0),
      validTo: null,
      reason: REASON,
      basedOnAmendmentId: null,
      ...body,
    });

const read = async (companyId: string): Promise<CompanyPricingView> =>
  jsonBody<CompanyPricingView>(
    await staff().get(`/admin/pricing/companies/${companyId}`).expect(200),
  );

const priceOf = (view: CompanyPricingView, sku: string): number | undefined =>
  view.categories.flatMap((category) => category.items).find((item) => item.sku === sku)
    ?.finalMillicents;

async function scheduledOn(
  body: Record<string, unknown> = {},
): Promise<{ companyId: string; mercurialeId: string }> {
  const company = await createCompany(ctx.prisma, { status: "active" });
  await pose(company.id, body).expect(201);
  const row = await ctx.prisma.companyMercuriale.findFirstOrThrow({
    where: { companyId: company.id },
    orderBy: { validFrom: "desc" },
    select: { id: true },
  });
  return { companyId: company.id, mercurialeId: row.id };
}

const windowOf = (id: string) =>
  ctx.prisma.companyMercuriale.findUniqueOrThrow({
    where: { id },
    select: { validFrom: true, validTo: true },
  });

describe("corriger une mercuriale à venir", () => {
  it("la fait commencer aujourd'hui : le prix négocié s'applique dès maintenant", async () => {
    const { companyId, mercurialeId } = await scheduledOn();
    expect(priceOf(await read(companyId), SKU)).toBe(CANONICAL_MILLICENTS);
    expect((await read(companyId)).mercuriales[0]).toMatchObject({
      status: "scheduled",
      latestAmendmentId: null,
    });

    await correct(companyId, mercurialeId).expect(204);

    const view = await read(companyId);
    expect(priceOf(view, SKU)).toBe(NEGOTIATED_MILLICENTS);
    expect(view.mercuriales[0]).toMatchObject({ status: "active", validFrom: parisMidnight(0) });
  });

  it("écrit l'acte au journal, avec le motif et les deux fenêtres", async () => {
    const { companyId, mercurialeId } = await scheduledOn();

    await correct(companyId, mercurialeId, { validTo: parisMidnight(30) }).expect(204);

    const act = await ctx.prisma.pricingEvent.findFirstOrThrow({
      where: { subjectId: mercurialeId, act: "amended" },
      select: { reason: true, summary: true },
    });
    expect(act.reason).toBe(REASON);
    expect(act.summary).toMatch(/^Dates corrigées : du .+, sans date de fin → du .+ au .+$/);
  });

  it("refuse la mercuriale d'un autre client (404) : le mur company_id", async () => {
    const { mercurialeId } = await scheduledOn();
    const other = await createCompany(ctx.prisma, { status: "active" });

    await correct(other.id, mercurialeId).expect(404);
    expect((await windowOf(mercurialeId)).validFrom.toISOString()).toBe(parisMidnight(365));
  });
});

describe("les refus", () => {
  it("refuse une mercuriale commencée (409), en disant de la clore puis d'en reposer une", async () => {
    const { companyId, mercurialeId } = await scheduledOn({ validFrom: parisMidnight(-10) });

    const refused = await correct(companyId, mercurialeId, { validFrom: parisMidnight(5) }).expect(
      409,
    );
    expect(JSON.stringify(refused.body)).toContain("clôturez-la, puis posez-en une autre");
    expect((await windowOf(mercurialeId)).validFrom.toISOString()).toBe(parisMidnight(-10));
  });

  it("refuse un nouveau début passé (400)", async () => {
    const { companyId, mercurialeId } = await scheduledOn();

    await correct(companyId, mercurialeId, { validFrom: parisMidnight(-1) }).expect(400);
  });

  it("refuse un motif blanc (400)", async () => {
    const { companyId, mercurialeId } = await scheduledOn();

    await correct(companyId, mercurialeId, { reason: "   " }).expect(400);
  });

  it("refuse une nouvelle période qui laisserait un avenant dehors (409)", async () => {
    const { companyId, mercurialeId } = await scheduledOn();
    const amendmentId = jsonBody<{ amendmentId: string }>(
      await staff()
        .post(`/admin/pricing/companies/${companyId}/mercuriale/${mercurialeId}/amendments`)
        .set(INTENT_KEY, freshIntent())
        .send({ reason: "Fin de la ligne", validFrom: parisMidnight(400), endedSkus: [SKU] })
        .expect(201),
    ).amendmentId;

    await correct(companyId, mercurialeId, {
      validFrom: parisMidnight(10),
      validTo: parisMidnight(390),
      basedOnAmendmentId: amendmentId,
    }).expect(409);
    // Contenu, il passe.
    await correct(companyId, mercurialeId, {
      validFrom: parisMidnight(10),
      basedOnAmendmentId: amendmentId,
    }).expect(204);
  });

  it("refuse quand un avenant a été écrit depuis celui que l'écran a vu (409)", async () => {
    const { companyId, mercurialeId } = await scheduledOn();
    await staff()
      .post(`/admin/pricing/companies/${companyId}/mercuriale/${mercurialeId}/amendments`)
      .set(INTENT_KEY, freshIntent())
      .send({ reason: "Fin de la ligne", validFrom: parisMidnight(400), endedSkus: [SKU] })
      .expect(201);

    const refused = await correct(companyId, mercurialeId, { basedOnAmendmentId: null }).expect(
      409,
    );
    expect(JSON.stringify(refused.body)).toContain("Un autre avenant a été enregistré");
  });

  it("refuse de recouvrir une mercuriale en cours (409), en la nommant", async () => {
    const company = await createCompany(ctx.prisma, { status: "active" });
    await pose(company.id, {
      label: "Mercuriale en cours",
      validFrom: parisMidnight(-30),
      validTo: parisMidnight(100),
    }).expect(201);
    await pose(company.id, { label: "Mercuriale suivante", validFrom: parisMidnight(200) }).expect(
      201,
    );
    const next = await ctx.prisma.companyMercuriale.findFirstOrThrow({
      where: { companyId: company.id, label: "Mercuriale suivante" },
      select: { id: true },
    });

    const refused = await correct(company.id, next.id, { validFrom: parisMidnight(50) }).expect(
      409,
    );
    expect(JSON.stringify(refused.body)).toContain("Mercuriale en cours");
    // Accolée à la fin de l'autre, elle passe : borne haute exclue.
    await correct(company.id, next.id, { validFrom: parisMidnight(100) }).expect(204);
  });

  it("refuse une remise générale sur un engagement de volume de la nouvelle période (409)", async () => {
    const { companyId, mercurialeId } = await scheduledOn({
      lines: [],
      generalDiscount: { mode: "all_except", baseBp: 3_000, rules: [] },
    });
    await staff()
      .post("/admin/pricing/commitments")
      .send({
        companyId,
        scope: { type: "product", id: SKU },
        promisedQuantity: 1_000,
        validFrom: parisMidnight(20),
        validTo: parisMidnight(60),
      })
      .expect(201);

    await correct(companyId, mercurialeId, { validFrom: parisMidnight(10) }).expect(409);
    await correct(companyId, mercurialeId, { validFrom: parisMidnight(60) }).expect(204);
  });
});

describe("une correction, une fois par intention (Idempotency-Key)", () => {
  it("le même envoi deux fois : 204 les deux fois, un seul acte au journal", async () => {
    const { companyId, mercurialeId } = await scheduledOn();
    const intent = freshIntent();

    await correct(companyId, mercurialeId, {}, intent).expect(204);
    // Sans la clé, ce second envoi viserait une mercuriale déjà commencée.
    await correct(companyId, mercurialeId, {}, intent).expect(204);

    expect(
      await ctx.prisma.pricingEvent.count({ where: { subjectId: mercurialeId, act: "amended" } }),
    ).toBe(1);
  });

  it("sans clé d'intention : 400, et les dates ne bougent pas", async () => {
    const { companyId, mercurialeId } = await scheduledOn();

    await staff()
      .patch(`/admin/pricing/companies/${companyId}/mercuriale/${mercurialeId}/window`)
      .send({
        validFrom: parisMidnight(0),
        validTo: null,
        reason: REASON,
        basedOnAmendmentId: null,
      })
      .expect(400);
    expect(
      await ctx.prisma.pricingEvent.count({ where: { subjectId: mercurialeId, act: "amended" } }),
    ).toBe(0);
  });
});
