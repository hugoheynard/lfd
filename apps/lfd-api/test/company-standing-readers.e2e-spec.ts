/**
 * E2E de **non-fuite** des lecteurs de rôle (plan
 * `documentation/comptes-client/plan-entrer-dans-ses-sites.md`, §3) — une
 * frontière de sécurité : le mur tenant.
 *
 * Pour chaque lecteur branché sur la requête partagée (`readCompanyStanding`) :
 * l'héritier entre ; un frère n'entre pas ; un membre de site n'entre pas au
 * principal ; après détachement, plus rien ; principal inactif, plus rien.
 * Puis Q1 : le détenteur du principal lit la facturation du site, un admin
 * hérité non, et aucun geste réservé n'est ouvert.
 *
 * Aucune date absolue ; la seule frontière doublée est la signature du jeton.
 */
import type request from "supertest";

import { CompanyStatus, PaymentStatus } from "../src/platform/database/client/client.js";
import type { E2eContext } from "./e2e-harness.js";
import { bootCustomerScene, seedCustomerOrder } from "./order-customer-cancel-scene.js";
import { resetScene } from "./order-staff-cancel-scene.js";
import { detach, family, type Person, setStatus } from "./company-standing-scene.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootCustomerScene();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene();
});

/** Une lecture murée d'une société, par le lecteur de rôle qu'elle traverse. */
interface Probe {
  readonly reader: string;
  readonly call: (who: Person, companyId: string) => request.Test;
}

/** Une commande de la société, pour le lecteur d'accès aux commandes (C1). */
async function orderOf(companyId: string, author: Person): Promise<string> {
  const { orderId } = await seedCustomerOrder({
    placedByUserId: author.id,
    companyId,
    payment: PaymentStatus.not_required,
  });
  return orderId;
}

const PROBES: readonly Probe[] = [
  {
    reader: "MembershipReader (adresses)",
    call: (who, id) => ctx.asSub(who.sub).get(`/companies/${id}/addresses`),
  },
  {
    reader: "OrderGuardReader (devis)",
    call: (who, id) =>
      ctx
        .asSub(who.sub)
        .post("/orders/quote")
        .send({ companyId: id, lines: [{ sku: "VIE-001", quantity: 6 }] }),
  },
  {
    reader: "company-order-wall (« Mes commandes »)",
    call: (who, id) => ctx.asSub(who.sub).get(`/companies/${id}/orders`),
  },
];

describe.each(PROBES)("$reader — sur la requête partagée", ({ call }) => {
  it("l'héritier (détenteur ou admin du principal) entre dans le site", async () => {
    const f = await family();
    await call(f.heir, f.site).expect(200);
    await call(f.adminHeir, f.site).expect(200);
  });

  it("🔴 un frère n'entre pas ; un membre de site n'entre ni au principal ni chez le frère", async () => {
    const f = await family();
    await call(f.siblingOwner, f.site).expect(404);
    await call(f.siteOwner, f.principal).expect(404);
    await call(f.siteOwner, f.sibling).expect(404);
  });

  it("🔴 après détachement, plus rien — à la requête suivante (R6)", async () => {
    const f = await family();
    await call(f.heir, f.site).expect(200);
    await detach(f.site);
    await call(f.heir, f.site).expect(404);
  });

  it.each([CompanyStatus.suspended, CompanyStatus.terminated, CompanyStatus.pending])(
    "🔴 principal %s : plus rien",
    async (status) => {
      const f = await family();
      await setStatus(f.principal, status);
      await call(f.heir, f.site).expect(404);
    },
  );

  it("🔴 site suspendu : l'héritage se ferme, le détenteur du site garde sa place", async () => {
    const f = await family();
    await setStatus(f.site, CompanyStatus.suspended);
    await call(f.heir, f.site).expect(404);
  });
});

describe("OrderAccessReader — la commande d'un site (C1, devenu lecteur de la requête)", () => {
  it("l'héritier lit ; le frère et le membre du site, hors de leur société, non", async () => {
    const f = await family();
    const siteOrder = await orderOf(f.site, f.siteOwner);
    const principalOrder = await orderOf(f.principal, f.heir);
    await ctx.asSub(f.heir.sub).get(`/orders/${siteOrder}`).expect(200);
    await ctx.asSub(f.siblingOwner.sub).get(`/orders/${siteOrder}`).expect(404);
    await ctx.asSub(f.siteOwner.sub).get(`/orders/${principalOrder}`).expect(404);

    await detach(f.site);
    await ctx.asSub(f.heir.sub).get(`/orders/${siteOrder}`).expect(404);
  });
});

/** Les trois lectures de la facturation que Q1 ouvre au seul détenteur hérité. */
const BILLING_READS: readonly Probe[] = [
  {
    reader: "UnpaidAccessReader (factures)",
    call: (who, id) => ctx.asSub(who.sub).get(`/companies/${id}/invoices`),
  },
  {
    reader: "UnpaidAccessReader (impayés détachés)",
    call: (who, id) => ctx.asSub(who.sub).get(`/companies/${id}/detached-unpaid-orders`),
  },
  {
    reader: "BankAccountReadingGuard (compte bancaire)",
    call: (who, id) => ctx.asSub(who.sub).get(`/companies/${id}/bank-account`),
  },
];

describe.each(BILLING_READS)("$reader — la facturation du site (Q1)", ({ call }) => {
  it("🔴 le détenteur du principal lit ; un admin hérité, non", async () => {
    const f = await family();
    await call(f.heir, f.site).expect(200);
    await call(f.adminHeir, f.site).expect(404);
  });

  it("🔴 un frère, un membre de site au principal, un détaché : rien", async () => {
    const f = await family();
    await call(f.siblingOwner, f.site).expect(404);
    await call(f.siteOwner, f.principal).expect(404);
    await detach(f.site);
    await call(f.heir, f.site).expect(404);
  });

  it("🔴 principal suspendu : rien", async () => {
    const f = await family();
    await setStatus(f.principal, CompanyStatus.suspended);
    await call(f.heir, f.site).expect(404);
  });
});

describe("aucun geste réservé n'est ouvert à l'héritier (R2, Q1)", () => {
  it("🔴 le détenteur du principal ne pose pas le RIB du site (403)", async () => {
    const f = await family();
    await ctx
      .asSub(f.heir.sub)
      .put(`/companies/${f.site}/bank-account`)
      .send({
        iban: "FR1420041010050500013M02606",
        bic: "CEPAFRPP751",
        holder: "Refuge du Col SARL",
        line1: "12 rue des Alpages",
        line2: "",
        postalCode: "73150",
        city: "Val d'Isère",
        countryCode: "FR",
      })
      .expect(403);
  });
});
