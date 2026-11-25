/**
 * E2E de **Réglages › Comptoir** — le suivi du stock au comptoir, point par
 * point (décidé par Hugo le 2026-11-19 ; `reassort-boutiques/reception-et-stock.md`).
 *
 * Ce qui ne s'éprouve qu'ici : le défaut sans ligne (désactivé), le droit
 * `lfc_order_settings`, le refus de la déclaration par le vrai serveur, et
 * l'alerte ouverte avant la désactivation toujours servie au comptoir et au
 * fournil.
 */
import type {
  CounterSettingsView,
  LiveStockAlertsView,
  ResupplyArticleView,
  SiteResuppliesView,
  SiteStockAlertsView,
} from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

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

async function seedSite(label: string): Promise<string> {
  const site = await ctx.prisma.site.create({
    data: { label, ligne1: "1 place", codePostal: "73150", ville: "Val d'Isère", pays: "France" },
    select: { id: true },
  });
  return site.id;
}

/** Un rôle créé à l'écran, qui ne tient que ces droits, et une personne qui le porte. */
async function holderOf(
  key: string,
  grants: readonly { resource: string; action: string }[],
): Promise<request.Agent> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/staff-roles")
    .send({ key, label: key, grants })
    .expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

function admin(): request.Agent {
  return ctx.asSub(E2E_STAFF_SUB);
}

function setTracking(
  siteId: string,
  stockTracking: boolean,
  immediateWithoutStock = false,
): request.Test {
  return admin()
    .put(`/admin/counter-settings/${siteId}`)
    .send({ stockTracking, immediateWithoutStock });
}

async function settingsOf(
  siteId: string,
): Promise<CounterSettingsView["sites"][number] | undefined> {
  const view = jsonBody<CounterSettingsView>(
    await admin().get("/admin/counter-settings").expect(200),
  );
  return view.sites.find((site) => site.siteId === siteId);
}

async function firstArticleSku(): Promise<string> {
  const [article] = jsonBody<readonly ResupplyArticleView[]>(
    await admin().get("/admin/resupply-receipts/articles").expect(200),
  );
  if (article === undefined) {
    throw new Error("Le catalogue semé doit proposer un article.");
  }
  return article.sku;
}

function declare(siteId: string, sku: string): request.Test {
  return admin()
    .post(`/admin/site-stock-alerts/sites/${siteId}`)
    .send({ sku, level: "out_of_stock" });
}

describe("le réglage", () => {
  it("un point jamais réglé ne suit pas son stock ; activer puis désactiver se relit", async () => {
    const siteId = await seedSite("Val Village");
    const archived = await seedSite("Ancien point");
    await ctx.prisma.site.update({
      where: { id: archived },
      data: { archivedAt: new Date("2026-01-01T00:00:00Z") },
    });

    await expect(settingsOf(siteId)).resolves.toEqual({
      siteId,
      siteLabel: "Val Village",
      stockTracking: false,
      immediateWithoutStock: false,
      updatedAt: null,
      updatedBy: null,
    });
    await expect(settingsOf(archived)).resolves.toBeUndefined();

    await setTracking(siteId, true).expect(204);
    const enabled = await settingsOf(siteId);
    expect(enabled?.stockTracking).toBe(true);
    expect(enabled?.updatedAt).not.toBeNull();

    await setTracking(siteId, false).expect(204);
    await expect(settingsOf(siteId)).resolves.toMatchObject({ stockTracking: false });
    expect(await ctx.prisma.counterStockSetting.count()).toBe(1);
  });

  it("la vue du comptoir dit si le point suit son stock", async () => {
    const siteId = await seedSite("Val Village");
    const counterView = async (): Promise<boolean> =>
      jsonBody<SiteResuppliesView>(
        await admin().get(`/admin/site-resupplies/sites/${siteId}`).expect(200),
      ).stockTracking;

    expect(await counterView()).toBe(false);
    await setTracking(siteId, true).expect(204);
    expect(await counterView()).toBe(true);
  });

  it("le retrait immédiat sans stock se pose et se relit, sans toucher au suivi", async () => {
    const siteId = await seedSite("Val Village");

    await setTracking(siteId, false, true).expect(204);

    await expect(settingsOf(siteId)).resolves.toMatchObject({
      stockTracking: false,
      immediateWithoutStock: true,
    });
  });

  it("refuse un point inconnu (404) et une charge mal formée (400)", async () => {
    const siteId = await seedSite("Val Village");

    await setTracking("site_inconnu", true).expect(404);
    await admin()
      .put(`/admin/counter-settings/${siteId}`)
      .send({ stockTracking: "oui", immediateWithoutStock: false })
      .expect(400);
    await admin()
      .put(`/admin/counter-settings/${siteId}`)
      .send({ stockTracking: true })
      .expect(400);
    expect(await ctx.prisma.counterStockSetting.count()).toBe(0);
  });

  it("sans `lfc_order_settings`, ni lire ni écrire (403)", async () => {
    const siteId = await seedSite("Val Village");
    const counter = await holderOf("comptoir-seul", [
      { resource: "handover_counter", action: "write" },
    ]);

    await counter.get("/admin/counter-settings").expect(403);
    await counter
      .put(`/admin/counter-settings/${siteId}`)
      .send({ stockTracking: true, immediateWithoutStock: false })
      .expect(403);

    const reader = await holderOf("reglages-lecture", [
      { resource: "lfc_order_settings", action: "read" },
    ]);
    await reader.get("/admin/counter-settings").expect(200);
    await reader
      .put(`/admin/counter-settings/${siteId}`)
      .send({ stockTracking: true, immediateWithoutStock: false })
      .expect(403);
  });
});

describe("la déclaration d'un état au comptoir", () => {
  it("refusée (409) tant que le suivi n'est pas activé, acceptée une fois activé", async () => {
    const siteId = await seedSite("Val Village");
    const sku = await firstArticleSku();

    const refused = await declare(siteId, sku).expect(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe("resupply.stock_tracking.disabled");
    expect(await ctx.prisma.siteStockAlert.count()).toBe(0);

    await setTracking(siteId, true).expect(204);
    await declare(siteId, sku).expect(204);

    await setTracking(siteId, false).expect(204);
    await declare(siteId, sku).expect(409);
  });

  it("l'alerte ouverte avant la désactivation reste lisible au comptoir et au fournil, et se lève à la main", async () => {
    const siteId = await seedSite("Val Village");
    const sku = await firstArticleSku();
    await setTracking(siteId, true).expect(204);
    await declare(siteId, sku).expect(204);

    await setTracking(siteId, false).expect(204);

    const site = jsonBody<SiteStockAlertsView>(
      await admin().get(`/admin/site-stock-alerts/sites/${siteId}`).expect(200),
    );
    expect(site.alerts).toEqual([expect.objectContaining({ sku, level: "out_of_stock" })]);
    const live = jsonBody<LiveStockAlertsView>(
      await admin().get("/admin/site-stock-alerts/live").expect(200),
    );
    expect(live.sites).toEqual([expect.objectContaining({ siteId })]);
    await admin()
      .post(`/admin/site-stock-alerts/sites/${siteId}/${site.alerts[0]?.id ?? ""}/lift`)
      .expect(204);
  });
});
