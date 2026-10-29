/**
 * E2E — **une décision tarifaire ne vise que ce qui se vend**
 * (`documentation/catalogue/plan-pro-voit-les-declinaisons.md`, L5).
 *
 * Régression : ni la mercuriale ni l'engagement ne lisaient le catalogue. Un
 * SKU mal tapé, ou celui d'un article retiré, posait une décision qui ne
 * s'appliquait jamais, sans un mot (relevé par `vitruve` le 2026-10-29).
 *
 * Ce que seul ce niveau prouve : que le refus traverse le vrai miroir — un
 * article retiré par le référentiel l'est pour la tarification — et qu'une
 * grille refusée n'écrit rien.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { anActiveFiche, relayAll, SILENT_TRIGGER } from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** Vendu dans le catalogue semé. */
const SKU = "VIE-001";
/** Une faute de frappe plausible : un zéro devenu « O ». */
const TYPO = "VIE-0O1";
/**
 * Fenêtres absolues : l'exception écrite du dépôt — aucun cas ne les compare à
 * l'horloge, le refus tombe avant toute lecture de fenêtre.
 */
const FROM = "2026-01-01T00:00:00.000Z";
const TO = "2027-01-01T00:00:00.000Z";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: OutboxRelayTrigger, value: SILENT_TRIGGER },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

/** Une fiche vendue, puis désactivée au référentiel : son article est retiré. */
async function aWithdrawnSku(): Promise<string> {
  const fiche = await anActiveFiche(staff, "Financier retiré", "both");
  await relayAll(ctx);
  await staff().put(`/pim/catalogue/products/${fiche.id}/unpublish`).send({}).expect(200);
  await relayAll(ctx);
  return fiche.sku;
}

interface Refusal {
  readonly code: string;
  readonly message: string;
}

describe("la mercuriale d'un client", () => {
  const pose = (companyId: string, skus: readonly string[]) =>
    staff()
      .post(`/admin/pricing/companies/${companyId}/mercuriale`)
      .send({
        label: "Mercuriale L5",
        validFrom: FROM,
        validTo: TO,
        lines: skus.map((sku) => ({ sku, unitPriceMillicents: 150_000 })),
      });

  it("refuse la grille entière quand une ligne parmi plusieurs est inconnue, et la nomme", async () => {
    const company = await createCompany(ctx.prisma);

    const body = jsonBody<Refusal>(await pose(company.id, [SKU, TYPO]).expect(409));

    expect(body.code).toBe("pricing.sale_reference.not_on_sale");
    expect(body.message).toContain(`« ${TYPO} »`);
    expect(body.message).not.toContain(`« ${SKU} »`);
    expect(await ctx.prisma.companyMercuriale.count({ where: { companyId: company.id } })).toBe(0);
  });

  it("refuse un article retiré avec son propre message", async () => {
    const company = await createCompany(ctx.prisma);
    const withdrawn = await aWithdrawnSku();

    const body = jsonBody<Refusal>(await pose(company.id, [SKU, withdrawn]).expect(409));

    expect(body.code).toBe("pricing.sale_reference.withdrawn");
    expect(body.message).toContain(`« ${withdrawn} »`);
  });

  it("pose une grille dont chaque ligne est en vente", async () => {
    const company = await createCompany(ctx.prisma);

    await pose(company.id, [SKU]).expect(201);
  });
});

describe("l'engagement de volume", () => {
  const sign = (companyId: string, sku: string) =>
    staff()
      .post("/admin/pricing/commitments")
      .send({
        companyId,
        scope: { type: "product", id: sku },
        promisedQuantity: 600,
        validFrom: FROM,
        validTo: TO,
      });

  it("refuse une référence inconnue et ne signe rien", async () => {
    const company = await createCompany(ctx.prisma);

    const body = jsonBody<Refusal>(await sign(company.id, TYPO).expect(409));

    expect(body.code).toBe("pricing.sale_reference.not_on_sale");
    expect(body.message).toContain(`« ${TYPO} »`);
    expect(await ctx.prisma.volumeCommitment.count({ where: { companyId: company.id } })).toBe(0);
  });

  it("refuse un article retiré", async () => {
    const company = await createCompany(ctx.prisma);
    const withdrawn = await aWithdrawnSku();

    const body = jsonBody<Refusal>(await sign(company.id, withdrawn).expect(409));

    expect(body.code).toBe("pricing.sale_reference.withdrawn");
  });

  it("signe sur une référence en vente", async () => {
    const company = await createCompany(ctx.prisma);

    await sign(company.id, SKU).expect(201);
  });
});

describe("la règle tarifaire", () => {
  it("refuse une portée article sur une référence inconnue", async () => {
    const body = jsonBody<Refusal>(
      await staff()
        .post("/admin/pricing/rules")
        .send({
          stage: "promotion",
          label: "Promo L5",
          scope: { type: "product", id: TYPO },
          audience: { type: "all", id: null },
          minQuantity: null,
          effect: { nature: "alter", direction: "decrease", mode: "percent", value: 1000 },
          validFrom: FROM,
          validTo: TO,
        })
        .expect(409),
    );

    expect(body.code).toBe("pricing.sale_reference.not_on_sale");
  });
});
