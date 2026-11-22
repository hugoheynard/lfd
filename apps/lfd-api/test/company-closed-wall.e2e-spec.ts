/**
 * E2E du **mur d'une société fermée** — supprimée (archivée) ou résiliée
 * (`documentation/comptes-client/plan-archiver-un-compte-jamais-servi.md`,
 * lot A2 : § 3.3, § 3.4, § 6, § 7 Q3).
 *
 * Ce que seul le vrai SQL prouve :
 * - le membre ne voit plus la société dans son espace, garde ses autres
 *   sociétés, et n'y lit plus rien (`readCompanyStanding`) ;
 * - une invitation vers une société fermée ne s'accepte pas ;
 * - la saisie de l'équipe et le rattachement refusent une société supprimée ;
 * - le verrou de la passation (`FOR SHARE` dans `PrismaOrderRepository.place`)
 *   refuse une commande dont la société se ferme pendant qu'elle s'écrit ;
 * - suppression et passation lancées ensemble : jamais les deux.
 *
 * Seules frontières doublées : la signature des jetons et l'encaissement.
 */
import { randomUUID } from "node:crypto";

import { WORKSPACE_HEADER, type AccountView } from "@lfd/contracts";

import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { stubAdminVerifier } from "./operations-at-commerce-scene.js";
import { cardGatewayDouble, pickupSite } from "./order-factory.js";

const MEMBER = "auth0|mur-ferme-membre";
const SKU = "VIE-001-1";
const REASON = "Doublon";
/** Le délai laissé à la passation pour atteindre le verrou. */
const LOCK_WAIT_MS = 10_000;
const POLL_MS = 50;

let ctx: E2eContext;
let companyId = "";
let otherCompanyId = "";
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CardProviders, value: cardGatewayDouble("pi_mur_ferme") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  companyId = (await createCompany(ctx.prisma, { status: CompanyStatus.active })).id;
  otherCompanyId = (await createCompany(ctx.prisma, { status: CompanyStatus.active })).id;
  await attachTo(ctx.prisma, member.id, companyId, CustomerRole.owner);
  await attachTo(ctx.prisma, member.id, otherCompanyId, CustomerRole.owner);
  pickupId = await pickupSite(ctx.prisma);
  // Première entrée : les rattachements sont acceptés ici, hors des tests.
  await ctx.asSub(MEMBER).get("/me").expect(200);
});

function archive(id: string) {
  return ctx.asSub(E2E_STAFF_SUB).post(`/admin/companies/${id}/archive`).send({ reason: REASON });
}

async function myCompanyIds(sub = MEMBER): Promise<string[]> {
  const me = jsonBody<AccountView>(await ctx.asSub(sub).get("/me").expect(200));
  return me.companies.map((company) => company.id);
}

/** Une commande par carte, au nom de la société, au retrait. */
function placeMine() {
  return ctx
    .asSub(MEMBER)
    .post("/orders")
    .set(WORKSPACE_HEADER, companyId)
    .send({
      idempotencyKey: randomUUID(),
      salesTerms: null,
      fulfillmentMethod: "pickup",
      requestedWindow: { start: "07:00", end: "08:00" },
      pickupAddressId: pickupId,
      deliveryAddress: null,
      deliveryAddressId: null,
      requestedDeliveryDate: serviceDay(),
      note: "",
      lines: [{ sku: SKU, quantity: 2 }],
    });
}

/** Une requête de la base attend un verrou — la passation est au `FOR SHARE`. */
async function someoneWaitsOnALock(): Promise<void> {
  for (let waited = 0; waited < LOCK_WAIT_MS; waited += POLL_MS) {
    const [row] = await ctx.prisma.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if ((row?.waiting ?? 0) > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error("La passation n'a jamais atteint le verrou de la société.");
}

describe("le membre d'une société fermée", () => {
  it("supprimée : elle sort de son espace, ses autres sociétés restent", async () => {
    expect(await myCompanyIds()).toEqual([companyId, otherCompanyId]);

    await archive(companyId).expect(204);

    expect(await myCompanyIds()).toEqual([otherCompanyId]);
  });

  it("résiliée : elle sort de son espace de la même façon", async () => {
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { status: CompanyStatus.terminated },
    });

    expect(await myCompanyIds()).toEqual([otherCompanyId]);
  });

  it.each(["archived", "terminated"] as const)(
    "%s : une route murée de la société ne l'ouvre plus (404)",
    async (closure) => {
      const route = `/companies/${companyId}/fulfillment-preference`;
      await ctx.asSub(MEMBER).patch(route).send({ method: "pickup" }).expect(204);

      if (closure === "archived") {
        await archive(companyId).expect(204);
      } else {
        await ctx.prisma.company.update({
          where: { id: companyId },
          data: { status: CompanyStatus.terminated },
        });
      }

      await ctx.asSub(MEMBER).patch(route).send({ method: "pickup" }).expect(404);
    },
  );

  /**
   * L'espace déclaré n'est plus le sien : `resolveCompany` retombe sur ce
   * qu'il lui reste (ici son autre société). Ce qui compte au mur : plus rien
   * ne s'écrit au nom de la société supprimée.
   */
  it("supprimée : aucune commande ne s'écrit plus à son nom", async () => {
    await archive(companyId).expect(204);

    const response = await placeMine();

    expect(response.status).toBeLessThan(500);
    expect(await ctx.prisma.order.count({ where: { companyId } })).toBe(0);
  });
});

describe("l'invitation vers une société fermée", () => {
  it("ne s'accepte pas : l'invitée n'entre pas, le rattachement reste en attente", async () => {
    const invited = await createUser(ctx.prisma, {
      auth0Sub: "auth0|mur-ferme-invitee",
      status: "invited",
    });
    await attachTo(ctx.prisma, invited.id, companyId, CustomerRole.orders);
    await archive(companyId).expect(204);

    const response = await ctx.asSub("auth0|mur-ferme-invitee").get("/me");

    expect(response.status).toBeGreaterThanOrEqual(400);
    const membership = await ctx.prisma.membership.findFirstOrThrow({
      where: { userId: invited.id, companyId },
      select: { acceptedAt: true },
    });
    expect(membership.acceptedAt).toBeNull();
  });
});

describe("l'équipe devant une société supprimée", () => {
  it("la liste au prix du client la refuse, en disant de la rendre", async () => {
    await archive(companyId).expect(204);

    const response = await ctx
      .asSub(E2E_STAFF_SUB)
      .get(`/admin/catalog/companies/${companyId}/shelf-prices`)
      .expect(409);

    expect(JSON.stringify(response.body)).toContain("orders.staff_entry.company_archived");
  });

  it("refuse de la rattacher comme site, et de lui rattacher un site", async () => {
    const principal = (await createCompany(ctx.prisma, { status: CompanyStatus.active })).id;
    await archive(companyId).expect(204);

    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/companies/${companyId}/parent`)
      .send({ parentId: principal })
      .expect(409);
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/companies/${principal}/parent`)
      .send({ parentId: companyId })
      .expect(409);
  });

  it("refuse de supprimer un principal qui a des sites", async () => {
    const site = (await createCompany(ctx.prisma, { status: CompanyStatus.active })).id;
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/companies/${site}/parent`)
      .send({ parentId: otherCompanyId })
      .expect(204);

    const response = await archive(otherCompanyId).expect(409);

    expect(JSON.stringify(response.body)).toContain("détachez-les d'abord");
  });
});

describe("le verrou de la passation", () => {
  it("🔴 la société se ferme pendant que la commande s'écrit : refusée au verrou", async () => {
    let placing: Promise<{ readonly status: number; readonly body: unknown }> | undefined;
    // Le geste de suppression, joué à la main : la ligne prise `FOR UPDATE`,
    // la passation lancée et laissée attendre, puis la suppression écrite.
    await ctx.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE`;
        placing = placeMine().then((response) => response);
        await someoneWaitsOnALock();
        await tx.$executeRaw`
          UPDATE companies SET archived_at = now(), archive_reason = ${REASON}
          WHERE id = ${companyId}`;
      },
      { timeout: LOCK_WAIT_MS * 2 },
    );
    const response = await placing;

    expect(response?.status).toBe(409);
    expect(JSON.stringify(response?.body)).toContain("orders.company_closed");
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("🔴 suppression et passation ensemble : l'une des deux seulement", async () => {
    const [archived, placed] = await Promise.all([archive(companyId), placeMine()]);

    expect([archived.status, placed.status].filter((status) => status >= 500)).toEqual([]);
    const row = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { archivedAt: true },
    });
    const orders = await ctx.prisma.order.count({ where: { companyId } });
    // Jamais les deux : un compte supprimé n'a pas de commande.
    expect(row.archivedAt !== null && orders > 0).toBe(false);
    // Et l'un des deux a réussi.
    expect(row.archivedAt !== null || orders === 1).toBe(true);
    expect(archived.status === 204).toBe(row.archivedAt !== null);
  });
});
