/**
 * **Les refus décidés par Hugo le 2026-11-03, rejoués au golden master** (lot
 * L1b de `documentation/pricing/centime-et-tva/plan-un-seul-assemblage.md`,
 * § 6). Le corpus tiré ne les touchait pas : une révision de l'équipe y reste
 * sur l'échéance du pro, et aucune société n'y change de statut.
 *
 * - **É12** : l'équipe révise une commande pro vers une échéance que
 *   l'adresse n'inscrit pas — refusée, comme la passation (règle E1).
 * - **É13** : une commande pro retirée à un point réservé aux pros, dont la
 *   société est suspendue après la passation — la révision juge la clientèle
 *   de la COMMANDE, et le point reste ouvert.
 * - **É18** (lot L1c) : une société SUSPENDUE, au crédit pourtant accordé,
 *   saisie par l'équipe au compte — refusée pour sa suspension, hors
 *   comptoir comme au comptoir. Au lien, elle passe (`refusal-order` →
 *   `suspended.only`).
 */
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { contentOf, staffBody, type Agents } from "./pricing-golden-master-bodies.js";
import type { GoldenBasket } from "./pricing-golden-master-corpus.js";
import { arrange, placed, type Paths } from "./pricing-golden-master-paths.js";
import {
  createdIdOf,
  fromOrderRow,
  fromRevisionQuote,
  refusalOf,
} from "./pricing-golden-master-record.js";
import type { GoldenScene, ScenePro } from "./pricing-golden-master-scene.js";

const LINES = [
  { sku: "VIE-001-1", quantity: 3 },
  { sku: "PAI-001-1", quantity: 2 },
] as const;

const COURIER: GoldenBasket = {
  key: "decision-courier",
  lines: [...LINES],
  fulfillment: "courier_flat",
  deliveryVat: "standard",
  promotions: [],
  voucherSteps: 0,
  clientRevision: [],
  staffRevision: [],
};

const PICKUP: GoldenBasket = { ...COURIER, key: "decision-pickup", fulfillment: "pickup" };

/** Le devis puis l'écriture d'une révision de l'équipe, chacun enregistré. */
async function staffRevision(
  ctx: E2eContext,
  http: Agents,
  orderId: string,
  content: Record<string, unknown>,
): Promise<Paths> {
  const base = `/admin/orders/${orderId}/revisions`;
  const { revision } = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { revision: true },
  });
  const quoted = await http.as(E2E_STAFF_SUB).post(`${base}/quote`).send(content);
  const written = await http
    .as(E2E_STAFF_SUB)
    .post(base)
    .send({ expectedRevision: revision, ...content });
  return {
    "D.revision-quote.staff": fromRevisionQuote(quoted),
    "D.revision.staff":
      written.status === 200 ? await fromOrderRow(ctx.prisma, 200, orderId) : refusalOf(written),
  };
}

/** Passe la saisie de l'équipe au compte ; rend la commande, ou lève : le cas ne prouverait rien. */
async function placeOnAccount(
  ctx: E2eContext,
  http: Agents,
  body: Record<string, unknown>,
): Promise<{ readonly orderId: string; readonly paths: Paths }> {
  const response = await http.as(E2E_STAFF_SUB).post("/admin/orders").send(body);
  const orderId = createdIdOf(response);
  if (orderId === null) {
    throw new Error(`Golden master : passation refusée ${JSON.stringify(response.body)}`);
  }
  return { orderId, paths: { "C.admin-orders.account": await placed(ctx, response) } };
}

/** É12 : l'équipe déplace l'échéance du pro à une heure que son adresse n'inscrit pas. */
async function unregisteredDeadline(
  ctx: E2eContext,
  scene: GoldenScene,
  http: Agents,
): Promise<Paths> {
  await arrange({ ctx, scene, basket: COURIER, http });
  const { orderId, paths } = await placeOnAccount(ctx, http, staffBody(scene, COURIER, "account"));
  const content = {
    ...contentOf(scene, COURIER, "pro"),
    requestedWindow: { start: null, end: "11:00" },
  };
  return { ...paths, ...(await staffRevision(ctx, http, orderId, content)) };
}

/** Un pro au compte, sans adresse du carnet : il retire. Actif sauf mention. */
async function creditedPro(
  ctx: E2eContext,
  slug = "devenu-suspendu",
  status: CompanyStatus = CompanyStatus.active,
): Promise<ScenePro> {
  const company = await createCompany(ctx.prisma, { status });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const buyer = await createUser(ctx.prisma, {
    auth0Sub: `auth0|golden-${slug}`,
    email: `${slug}@golden.fr`,
  });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  return { companyId: company.id, buyerUserId: buyer.id, addressId: "", percentAddressId: "" };
}

/** Un point réservé aux pros, aux horaires du Labo. */
async function proOnlySite(ctx: E2eContext): Promise<string> {
  const site = await ctx.prisma.site.create({
    data: {
      label: "Le comptoir pro",
      ligne1: "3 place du Centre",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: false,
      pickupForB2c: false,
      opening: {
        publicOpening: { start: "07:00", end: "19:00" },
        proPickup: { start: "07:00", end: "19:00" },
      },
    },
    select: { id: true },
  });
  return site.id;
}

/** É13 : la société est suspendue après la passation, au point réservé aux pros. */
async function audienceChangedSince(
  ctx: E2eContext,
  scene: GoldenScene,
  http: Agents,
): Promise<Paths> {
  await arrange({ ctx, scene, basket: PICKUP, http });
  const pro = await creditedPro(ctx);
  const at = { ...scene, siteId: await proOnlySite(ctx), pro };
  const { orderId, paths } = await placeOnAccount(ctx, http, staffBody(at, PICKUP, "account"));
  await ctx.prisma.company.update({
    where: { id: pro.companyId },
    data: { status: CompanyStatus.suspended },
  });
  const content = {
    ...contentOf(at, PICKUP, "pro"),
    requestedWindow: { start: "08:00", end: "09:00" },
  };
  return { ...paths, ...(await staffRevision(ctx, http, orderId, content)) };
}

/**
 * É18 : une société suspendue au crédit accordé, saisie au compte — hors
 * comptoir puis au comptoir, puis par lien au comptoir. Le crédit accordé écarte « faute de crédit » :
 * seul le statut peut refuser.
 */
async function suspendedOnAccount(
  ctx: E2eContext,
  scene: GoldenScene,
  http: Agents,
): Promise<Paths> {
  await arrange({ ctx, scene, basket: PICKUP, http });
  const pro = await creditedPro(ctx, "suspendu-au-compte", CompanyStatus.suspended);
  const body = staffBody({ ...scene, pro }, PICKUP, "account");
  const post = async (extra: Record<string, unknown>): Promise<Paths[string]> =>
    placed(
      ctx,
      await http
        .as(E2E_STAFF_SUB)
        .post("/admin/orders")
        .send({ ...body, ...extra }),
    );
  return {
    "C.admin-orders.account": await post({}),
    "C.admin-orders.counter-account": await post({ entryOrigin: "counter" }),
    // Le lien au comptoir nomme la suspension, pas « Au compte » (rang 0, 2026-11-03).
    "C.admin-orders.counter-link": await post({ entryOrigin: "counter", settlement: "link" }),
  };
}

/** Les cas, chacun sous son préfixe. */
export async function revisionDecisionCases(
  ctx: E2eContext,
  scene: GoldenScene,
  http: Agents,
): Promise<Paths> {
  const prefixed = (prefix: string, paths: Paths): Paths =>
    Object.fromEntries(Object.entries(paths).map(([key, out]) => [`${prefix}.${key}`, out]));
  return {
    ...prefixed("e12-unregistered-deadline", await unregisteredDeadline(ctx, scene, http)),
    ...prefixed("e13-suspended-since", await audienceChangedSince(ctx, scene, http)),
    ...prefixed("e18-suspended-on-account", await suspendedOnAccount(ctx, scene, http)),
  };
}
