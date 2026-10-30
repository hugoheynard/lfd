/**
 * **La scène des reports de décision** (`plan-report-apres-detachement.md`,
 * § 7) — partagée par les cinq e2e de famille, calquée sur
 * `mercuriale-carry-over.e2e-spec.ts` : une fiche « Ancolie » et sa
 * déclinaison « part », une décision posée sur la part par l'appelant, puis
 * la part détachée en fiche à elle, publiée et reçue au commerce.
 *
 * Aucune date absolue : les fenêtres sont posées autour de « maintenant »
 * (`daysAgo`), et le report part de maintenant.
 */
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { anActiveFiche, relayAll } from "./catalog-facts-scene.js";
import { E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/** La vérification Auth0 doublée : le jeton EST le `sub`. */
export const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
/** Le prix pro HT de la part : 10 €, soit 1 000 000 millicentimes. */
export const PART_PRO_PRICE_MILLICENTS = 1_000_000;
export const CARRY_REASON = "Report de la déclinaison détachée";

export const staffOf = (ctx: E2eContext): ReturnType<E2eContext["http"]> =>
  ctx.asSub(E2E_STAFF_SUB);

async function approveAll(ctx: E2eContext): Promise<void> {
  const skus = (
    await ctx.prisma.catalogItem.findMany({ where: { withdrawnAt: null }, select: { sku: true } })
  ).map((row) => row.sku);
  await staffOf(ctx)
    .post("/admin/catalog/review/approve")
    .send({ skus, audiences: ["pro", "public"] })
    .expect(204);
}

/** La part, vendue aux pros et aux particuliers, avant tout détachement. */
export async function aPart(
  ctx: E2eContext,
): Promise<{ ficheId: string; partId: string; oldSku: string }> {
  const staff = () => staffOf(ctx);
  const fiche = await anActiveFiche(staff, "Ancolie", "both");
  const partId = jsonBody<{ id: string }>(
    await staff()
      .post(`${PRODUCTS}/${fiche.id}/variants`)
      .send({ name: { fr: "Ancolie part" } })
      .expect(201),
  ).id;
  await staff()
    .put(`${PRODUCTS}/${fiche.id}/variants/${partId}/pricing`)
    .send({ priceCents: 450, weightGrams: null, proPriceHt: "10" })
    .expect(200);
  const detail = jsonBody<{ variants: { id: string; sku: string }[] }>(
    await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200),
  );
  const oldSku = detail.variants.find((variant) => variant.id === partId)?.sku ?? "";
  await relayAll(ctx);
  await approveAll(ctx);
  return { ficheId: fiche.id, partId, oldSku };
}

/** Détache la part en fiche à elle, publiée et reçue au commerce ; rend la nouvelle référence. */
export async function detach(
  ctx: E2eContext,
  part: { ficheId: string; partId: string },
): Promise<string> {
  const staff = () => staffOf(ctx);
  const bornId = jsonBody<{ id: string }>(
    await staff().post(`${PRODUCTS}/${part.ficheId}/variants/${part.partId}/detach`).expect(201),
  ).id;
  await staff().put(`${PRODUCTS}/${bornId}/publish`).send({}).expect(200);
  await relayAll(ctx);
  await approveAll(ctx);
  const born = await ctx.prisma.catalogItem.findFirstOrThrow({
    where: { productId: bornId, isDefault: true, withdrawnAt: null },
    select: { sku: true },
  });
  return born.sku;
}

/** Un client actif et la personne qui commande pour lui. */
export async function aClient(ctx: E2eContext, sub: string): Promise<string> {
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  const owner = await createUser(ctx.prisma, { auth0Sub: sub });
  await attachTo(ctx.prisma, owner.id, company.id);
  return company.id;
}

/** Le prix unitaire HT que la caisse rend à ce client pour `quantity` pièces. */
export async function quotedPrice(
  ctx: E2eContext,
  sub: string,
  companyId: string,
  sku: string,
  quantity = 1,
): Promise<number | null> {
  const quoted = jsonBody<{ lines: readonly { unitPriceMillicents: number }[] }>(
    await ctx
      .asSub(sub)
      .post("/orders/quote")
      .send({ companyId, lines: [{ sku, quantity }] })
      .expect(200),
  );
  return quoted.lines[0]?.unitPriceMillicents ?? null;
}

/** Le report, par la route de la famille. */
export function carryOver(
  ctx: E2eContext,
  route: string,
  body: { fromSku: string; toSku: string },
): ReturnType<ReturnType<E2eContext["http"]>["post"]> {
  return staffOf(ctx)
    .post(route)
    .send({ ...body, reason: CARRY_REASON });
}
