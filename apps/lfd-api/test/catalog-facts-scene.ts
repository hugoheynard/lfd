import { AppConfig } from "../src/platform/config/app-config.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { OutboxRelay } from "../src/platform/outbox/outbox-relay.js";
import { OnCatalogProductChangedHandler } from "../src/b2b/catalog/application/handlers/on-catalog-product-changed.handler.js";
import type { E2eContext } from "./e2e-harness.js";
import { jsonBody } from "./e2e-harness.js";

/**
 * La scène des faits du catalogue (lot 2a de
 * `documentation/pim/plan-catalogue-synchronise-par-audience.md`) : une
 * configuration aux faits OUVERTS, et les gestes du référentiel qui rendent
 * une fiche vendable — par l'API, comme le staff les fait.
 */

/** La configuration réelle, faits du catalogue OUVERTS — fermés par défaut. */
export class OpenCatalogFactsConfig extends AppConfig {
  override catalogFactsEnabled(): boolean {
    return true;
  }
}

/** Le réveil du relais coupé : rien ne part tant que le test ne balaie pas. */
export const SILENT_TRIGGER = { wake: (): void => undefined };

type Staff = () => ReturnType<E2eContext["http"]>;

const PRODUCTS = "/pim/catalogue/products";
const CATEGORIES = "/pim/catalogue/categories";
const FOOD_PERCENT = 5.5;
const PRICE_CENTS = 200;
const PRO_RATIO_BP = 9_000;

export interface Fiche {
  readonly id: string;
  readonly sku: string;
  readonly variantSku: string;
  readonly categoryId: string;
}

interface Detail {
  readonly sku: string;
  readonly categoryId: string;
  readonly variants: readonly {
    readonly id: string;
    readonly sku: string;
    readonly isDefault: boolean;
  }[];
}

/** Une fiche créée, inactive, sans prix : ce que la plateforme doit voir apparaître. */
export async function aDraftFiche(staff: Staff, name: string): Promise<Fiche> {
  const family = await staff()
    .post(CATEGORIES)
    .send({ name: { fr: `Famille ${name}` } })
    .expect(201);
  const categoryId = jsonBody<{ id: string }>(family).id;
  const created = await staff()
    .post(PRODUCTS)
    .send({ name: { fr: name }, kind: "daily", categoryId })
    .expect(201);
  const id = jsonBody<{ id: string }>(created).id;
  const detail = await detailOf(staff, id);
  const variant = detail.variants.find((entry) => entry.isDefault);
  return { id, sku: detail.sku, variantSku: variant?.sku ?? "", categoryId };
}

/**
 * Une fiche ACTIVE, vendue aux deux clientèles : déclaration d'allergènes,
 * prix, un taux pour chaque contexte en service — `b2b`, `takeaway`, `eatIn`
 * (le comptoir ouvert aux deux contextes de boutique pour que leurs taux s'y
 * posent, lot 2b) —, rapport pro réglé. `audience` déroge à celle de la
 * famille avant l'activation ; `null` = elle hérite.
 */
export async function anActiveFiche(
  staff: Staff,
  name: string,
  audience: "pro" | "public" | "both" | null = null,
): Promise<Fiche> {
  const fiche = await aDraftFiche(staff, name);
  const detail = await detailOf(staff, fiche.id);
  const variantId = detail.variants.find((entry) => entry.isDefault)?.id ?? "";
  await staff()
    .put(`${PRODUCTS}/${fiche.id}/variants/${variantId}/allergens`)
    .send({ allergens: [] })
    .expect(200);
  const rateId = await foodRate(staff);
  const shop = await staff()
    .post("/pim/points-of-sale")
    .send({
      kind: "shop",
      label: `Comptoir ${name}`,
      contexts: ["takeaway", "eatIn"],
      baseUrl: "",
      tableCount: 0,
    })
    .expect(201);
  const category = `${CATEGORIES}/${fiche.categoryId}`;
  await staff()
    .put(`${category}/channels`)
    .send([
      { pointOfSaleId: "pos_b2b", context: "b2b" },
      { pointOfSaleId: jsonBody<{ id: string }>(shop).id, context: "takeaway" },
      { pointOfSaleId: jsonBody<{ id: string }>(shop).id, context: "eatIn" },
    ])
    .expect(200);
  await staff()
    .put(`${category}/vat`)
    .send({ vatByContext: { b2b: rateId, takeaway: rateId, eatIn: rateId } })
    .expect(200);
  await staff()
    .put(`${PRODUCTS}/${fiche.id}/variants/${variantId}/pricing`)
    .send({ priceCents: PRICE_CENTS, weightGrams: null })
    .expect(200);
  await staff()
    .put("/pim/accounting-rules/pro-price-ratio")
    .send({ ratioBp: PRO_RATIO_BP })
    .expect(200);
  // Lot S : une ligne neuve naît sur « prix saisi ». Ce décor vend au RAPPORT
  // (le repli d'origine) : la méthode est posée explicitement.
  await staff()
    .put("/pim/accounting-rules/pro-price-method")
    .send({ method: "ratio_ttc" })
    .expect(200);
  if (audience !== null) {
    // Posée AVANT l'activation : la première ligne en vente naît avec elle (lot 3).
    await staff().put(`${PRODUCTS}/${fiche.id}/audience`).send({ audience }).expect(200);
  }
  await staff().put(`${PRODUCTS}/${fiche.id}/publish`).send({}).expect(200);
  return fiche;
}

async function detailOf(staff: Staff, id: string): Promise<Detail> {
  return jsonBody<Detail>(await staff().get(`${PRODUCTS}/${id}`).expect(200));
}

async function foodRate(staff: Staff): Promise<string> {
  const rates = jsonBody<{ id: string; percent: number }[]>(
    await staff().get("/pim/vat-rates").expect(200),
  );
  const existing = rates.find((rate) => rate.percent === FOOD_PERCENT);
  if (existing !== undefined) {
    return existing.id;
  }
  return jsonBody<{ id: string }>(
    await staff()
      .post("/pim/vat-rates")
      .send({ name: "Alimentaire", percent: FOOD_PERCENT })
      .expect(201),
  ).id;
}

/**
 * Balaie la boîte d'envoi jusqu'à ce qu'elle soit vide.
 *
 * @throws {RangeError} une livraison a échoué — un fait que la plateforme
 *   n'a pas su appliquer ne doit pas passer pour livré.
 */
export async function relayAll(ctx: E2eContext): Promise<void> {
  const relay = ctx.app.get(OutboxRelay);
  for (;;) {
    const report = await relay.sweep();
    if (report.failed > 0) {
      throw new RangeError(`${String(report.failed)} livraison(s) en échec`);
    }
    if (report.delivered === 0) {
      return;
    }
  }
}

/** Les faits « fiche changée » d'une fiche encore dans la boîte, par numéro croissant. */
export async function productFactsOf(
  ctx: E2eContext,
  productId: string,
): Promise<{ readonly seq: number; readonly payload: Readonly<Record<string, unknown>> }[]> {
  const rows = await ctx.prisma.outboxMessage.findMany({
    where: {
      type: "pim.catalog_product_changed",
      key: { startsWith: `pim.catalog_product_changed:${productId}:` },
    },
    select: { payload: true },
  });
  return rows
    .map((row) => recordOf(row.payload))
    .map((payload) => ({ seq: Number(payload["seq"]), payload }))
    .sort((left, right) => left.seq - right.seq);
}

/** Livre un fait à l'abonné, dans une transaction, comme le relais — sans son reçu. */
export async function deliverDirectly(
  ctx: E2eContext,
  payload: Readonly<Record<string, unknown>>,
): Promise<void> {
  const handler = ctx.app.get(OnCatalogProductChangedHandler);
  await ctx.app
    .get(UnitOfWork)
    .run(() =>
      handler.handle({ eventId: "evt_direct", type: "pim.catalog_product_changed", payload }),
    );
}

function recordOf(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RangeError("payload de fait hors forme");
  }
  return Object.fromEntries(Object.entries(value));
}
