/**
 * E2E de **l'aperçu d'un avenant** (`plan-avenant-dans-la-table.md`, § 2 et
 * § 2.2) : ce que le client paierait, article par article, si l'avenant
 * proposé était enregistré — résolu par la caisse à la date d'effet, sans
 * rien écrire. Et le refus d'un avenant enregistré par-dessus un autre.
 *
 * Seule frontière doublée : la signature du jeton — le jeton EST le `sub`.
 * Les dates sont relatives à maintenant (`daysAgo`) : aucune n'est en dur.
 */
import type {
  AmendedMercurialeResponse,
  CreatedIdResponse,
  MercurialeAmendmentPreviewItem,
  MercurialeAmendmentPreviewView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import { onlyVariant, posePromotion, promotionTerms } from "./promotion-fixtures.js";

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

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Croissant, 2,00 € pro. */
const CROISSANT = "VIE-001-1";
/** Patte d'ours, 3,00 € pro. */
const FIRM = "VIE-003-1";
/** Baguette tradition, 2,00 € pro. */
const BAGUETTE = "PAI-001-1";

const DELIVERY = {
  label: "Établissement",
  ligne1: "1 route du Lac",
  ligne2: "",
  codePostal: "74400",
  ville: "Chamonix",
  pays: "France",
  isDefault: true,
  specs: {
    signatureRequired: false,
    note: "",
    slotList: { mode: "everyday", slots: [] },
    deliveryContact: null,
    gps: null,
  },
};

let companyId = "";

beforeEach(async () => {
  await ctx.reset();
  companyId = (await createCompany(ctx.prisma, { status: "active" })).id;
});

async function pose(body: Record<string, unknown>, company = companyId): Promise<string> {
  await staff()
    .post(`/admin/pricing/companies/${company}/mercuriale`)
    .send({ label: "Mercuriale négociée", validFrom: daysAgo(30), validTo: null, ...body })
    .expect(201);
  const row = await ctx.prisma.companyMercuriale.findFirstOrThrow({
    where: { companyId: company },
    select: { id: true },
  });
  return row.id;
}

function previewRequest(mercurialeId: string, body: Record<string, unknown>, company = companyId) {
  return staff()
    .post(`/admin/pricing/companies/${company}/mercuriale/${mercurialeId}/amendments/preview`)
    .send({ reason: "Renégociation", ...body });
}

async function preview(
  mercurialeId: string,
  body: Record<string, unknown>,
  company = companyId,
): Promise<MercurialeAmendmentPreviewView> {
  return jsonBody<MercurialeAmendmentPreviewView>(
    await previewRequest(mercurialeId, body, company).expect(200),
  );
}

function amend(mercurialeId: string, body: Record<string, unknown>) {
  return staff()
    .post(`/admin/pricing/companies/${companyId}/mercuriale/${mercurialeId}/amendments`)
    .send({ reason: "Renégociation", ...body });
}

function itemOf(view: MercurialeAmendmentPreviewView, sku: string): MercurialeAmendmentPreviewItem {
  const found = view.items.find((item) => item.sku === sku);
  if (found === undefined) {
    throw new Error(`l'aperçu ne rend pas ${sku}`);
  }
  return found;
}

describe("l'aperçu d'un avenant", () => {
  it("un prix changé : avant et après, résolus par la caisse, et rien n'est écrit", async () => {
    const mercurialeId = await pose({ lines: [{ sku: FIRM, unitPriceMillicents: 100_000 }] });

    const view = await preview(mercurialeId, {
      endedSkus: [FIRM],
      lines: [{ sku: FIRM, unitPriceMillicents: 120_000 }],
    });

    expect(view.refusals).toEqual([]);
    expect(view.basedOnAmendmentId).toBeNull();
    expect(itemOf(view, FIRM)).toMatchObject({
      beforeMillicents: 100_000,
      afterMillicents: 120_000,
      source: "firm",
    });
    expect(itemOf(view, CROISSANT).source).toBe("chain");
    expect(view.state.firm).toEqual([
      { sku: FIRM, tiers: [{ minQuantity: 1, unitPriceMillicents: 100_000 }] },
    ]);
    expect(await ctx.prisma.companyMercurialeAmendment.count()).toBe(0);
  });

  // Régression : un prix ferme retiré retombait sur la chaîne (3,00 €) au lieu de la remise (2,10 €).
  it("un prix ferme retiré passe à la remise générale (Q1)", async () => {
    const mercurialeId = await pose({
      lines: [{ sku: FIRM, unitPriceMillicents: 100_000 }],
      generalDiscount: { mode: "all_except", baseBp: 3_000, rules: [] },
    });

    const view = await preview(mercurialeId, { endedSkus: [FIRM] });

    expect(itemOf(view, FIRM)).toMatchObject({
      beforeMillicents: 100_000,
      afterMillicents: 210_000,
      source: "general_discount",
    });
    expect(view.state.generalDiscount).toMatchObject({ mode: "all_except", baseBp: 3_000 });
  });

  it("un article qui sort revient à la chaîne, avec la promotion de CE client", async () => {
    await posePromotion(
      staff(),
      promotionTerms({
        internalName: "Fidélité",
        effect: { kind: "percent_off", value: 1_000 },
        audiences: [{ kind: "company", companyId }],
        scope: onlyVariant(CROISSANT),
      }),
    );
    const mercurialeId = await pose({ lines: [{ sku: CROISSANT, unitPriceMillicents: 150_000 }] });

    const view = await preview(mercurialeId, { endedSkus: [CROISSANT] });

    expect(itemOf(view, CROISSANT)).toMatchObject({
      beforeMillicents: 150_000,
      afterMillicents: 180_000,
      source: "chain",
    });
  });

  it("à une date future, l'état de référence tient compte d'un avenant à venir", async () => {
    const mercurialeId = await pose({ lines: [{ sku: FIRM, unitPriceMillicents: 100_000 }] });
    const upcoming = jsonBody<AmendedMercurialeResponse>(
      await amend(mercurialeId, {
        validFrom: daysAgo(-10),
        endedSkus: [FIRM],
        lines: [{ sku: FIRM, unitPriceMillicents: 110_000 }],
      }).expect(201),
    );
    const at = daysAgo(-20);

    const view = await preview(mercurialeId, {
      validFrom: at,
      lines: [{ sku: BAGUETTE, unitPriceMillicents: 150_000 }],
    });

    expect(view.at).toBe(at);
    expect(view.basedOnAmendmentId).toBe(upcoming.amendmentId);
    expect(view.state.firm).toEqual([
      { sku: FIRM, tiers: [{ minQuantity: 1, unitPriceMillicents: 110_000 }] },
    ]);
    expect(itemOf(view, FIRM)).toMatchObject({
      beforeMillicents: 110_000,
      afterMillicents: 110_000,
    });
    expect(itemOf(view, BAGUETTE)).toMatchObject({ afterMillicents: 150_000, source: "firm" });
  });

  it("rend le refus du domaine avec son code et son article, sans 4xx", async () => {
    const mercurialeId = await pose({ lines: [{ sku: FIRM, unitPriceMillicents: 100_000 }] });

    const view = await preview(mercurialeId, {
      lines: [{ sku: FIRM, unitPriceMillicents: 120_000 }],
    });

    expect(view.refusals).toEqual([
      expect.objectContaining({
        code: "pricing.mercuriale.amendment.sku_already_negotiated",
        sku: FIRM,
      }),
    ]);
    expect(itemOf(view, FIRM)).toMatchObject({
      beforeMillicents: 100_000,
      afterMillicents: 100_000,
    });
  });
});

describe("le mur du compte de tarif", () => {
  it("🔴 la mercuriale d'une autre société est introuvable par la route de celle-ci (404)", async () => {
    const mercurialeId = await pose({ lines: [{ sku: FIRM, unitPriceMillicents: 100_000 }] });
    const other = (await createCompany(ctx.prisma, { status: "active" })).id;

    await previewRequest(mercurialeId, { endedSkus: [FIRM] }, other).expect(404);
  });

  it("un site qui suit le tarif de son principal voit la mercuriale du principal", async () => {
    const mercurialeId = await pose({ lines: [{ sku: FIRM, unitPriceMillicents: 100_000 }] });
    const site = jsonBody<CreatedIdResponse>(
      await staff()
        .post(`/admin/companies/${companyId}/sub-accounts`)
        .send({ enseigne: "Site du lac", deliveryAddress: DELIVERY, follows: [] })
        .expect(201),
    ).id;

    // Sans suivre : la mercuriale du principal n'est pas la sienne.
    await previewRequest(mercurialeId, { endedSkus: [FIRM] }, site).expect(404);

    await staff().post(`/admin/companies/${site}/pricing-follow`).expect(204);
    const view = await preview(mercurialeId, { endedSkus: [FIRM] }, site);
    expect(itemOf(view, FIRM)).toMatchObject({ beforeMillicents: 100_000, source: "chain" });
  });
});

describe("deux commerciaux en même temps", () => {
  it("refuse (409) l'avenant calculé sur un état qu'un collègue a changé", async () => {
    const mercurialeId = await pose({ lines: [{ sku: FIRM, unitPriceMillicents: 100_000 }] });
    const seen = await preview(mercurialeId, { endedSkus: [FIRM] });
    const colleague = jsonBody<AmendedMercurialeResponse>(
      await amend(mercurialeId, {
        lines: [{ sku: BAGUETTE, unitPriceMillicents: 150_000 }],
      }).expect(201),
    );

    const refused = await amend(mercurialeId, {
      endedSkus: [FIRM],
      basedOnAmendmentId: seen.basedOnAmendmentId,
    }).expect(409);
    expect(JSON.stringify(refused.body)).toContain(
      "Un autre avenant a été enregistré pendant votre saisie.",
    );

    await amend(mercurialeId, {
      endedSkus: [FIRM],
      basedOnAmendmentId: colleague.amendmentId,
    }).expect(201);
  });
});
