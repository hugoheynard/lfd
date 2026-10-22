/**
 * E2E de **Réglages › Sites** (doc
 * `documentation/sites/sites.md`,
 * lot S1) : la surface `admin/sites` sous `lfc_site_settings`, les rôles, les
 * couleurs libres (vert / rouge / rose refusés), l'archivage, et ce que le
 * client voit encore — les seuls sites actifs qui remettent.
 */
import type {
  CreatedPickupResponse,
  PickupAddressView,
  RoleGrant,
  SitePaletteView,
  SiteView,
} from "@lfd/contracts";

import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub(E2E_STAFF_SUB);
}

const place = (label: string): Record<string, unknown> => ({
  label,
  ligne1: "1 place du Village",
  ligne2: "",
  codePostal: "73150",
  ville: "Val-d'Isère",
  pays: "France",
});

const ROLES = {
  pickup: true,
  supply: "on_site",
  deliveryDeparture: false,
  transferMode: "integrated",
  counterSetupMinutes: 0,
} as const;

const NO_COLORS = {
  pickupColorB2b: null,
  pickupColorB2c: null,
  deliveryColorB2b: null,
  deliveryColorB2c: null,
  resupplyColor: null,
} as const;

async function create(label: string): Promise<string> {
  const response = await staff().post("/admin/sites").send(place(label)).expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

/** Un site avec son point GPS : celui qu'il faut pour expédier. */
async function createWithGps(label: string): Promise<string> {
  const response = await staff()
    .post("/admin/sites")
    .send({ ...place(label), gps: { lat: 45.45, lng: 6.98 } })
    .expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

async function site(id: string): Promise<SiteView> {
  return jsonBody<SiteView>(await staff().get(`/admin/sites/${id}`).expect(200));
}

async function publicLabels(): Promise<readonly string[]> {
  const response = await ctx.http().get("/pickup-addresses").expect(200);
  return jsonBody<readonly PickupAddressView[]>(response).map((point) => point.label);
}

describe("admin/sites — rôles", () => {
  it("un site neuf remet, sur place, n'expédie pas, sans couleur ni mise en place", async () => {
    const id = await create("Fournil");
    expect(await site(id)).toMatchObject({
      ...ROLES,
      ...NO_COLORS,
      archivedAt: null,
    });
    // Plus de site par défaut (2026-10-15) : le premier créé n'en porte aucun rang.
    expect(await site(id)).not.toHaveProperty("isDefault");
  });

  it("enregistre un site servi par transfert, et le journalise", async () => {
    await create("Fournil");
    const village = await createWithGps("Val Village");

    await staff()
      .put(`/admin/sites/${village}/roles`)
      .send({ ...ROLES, supply: "transfer", transferMode: "dedicated", counterSetupMinutes: 20 })
      .expect(204);

    expect(await site(village)).toMatchObject({
      supply: "transfer",
      transferMode: "dedicated",
      counterSetupMinutes: 20,
    });
    const fact = await ctx.prisma.activityEvent.findFirst({
      where: { type: "pickup_address.roles_set", subjectId: village },
    });
    expect(fact).not.toBeNull();
  });

  it("refuse (400) un site servi par transfert qui ne remet pas", async () => {
    const village = await create("Val Village");
    const response = await staff()
      .put(`/admin/sites/${village}/roles`)
      .send({ ...ROLES, supply: "transfer", pickup: false });
    expect(response.status).toBe(400);
  });

  it("un fournil qui ne remet pas quitte la liste publique, pas l'écran des sites", async () => {
    await create("Val Village");
    const bakery = await createWithGps("Fournil");

    await staff()
      .put(`/admin/sites/${bakery}/roles`)
      .send({ ...ROLES, pickup: false, deliveryDeparture: true })
      .expect(204);

    expect(await publicLabels()).toEqual(["Val Village"]);
    const all = jsonBody<readonly SiteView[]>(await staff().get("/admin/sites").expect(200));
    expect(all.map((s) => s.label)).toEqual(["Val Village", "Fournil"]);
  });
});

describe("admin/sites — un site qui expédie a un point GPS (Hugo, 2026-10-13)", () => {
  it("refuse (409) de cocher « Livraison » sans point GPS, et n'écrit rien", async () => {
    const bakery = await create("Fournil");
    const response = await staff()
      .put(`/admin/sites/${bakery}/roles`)
      .send({ ...ROLES, deliveryDeparture: true });
    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).toContain("point GPS");
    expect((await site(bakery)).deliveryDeparture).toBe(false);
  });

  it("refuse (409) de servir par transfert un site sans point GPS, en disant où le saisir", async () => {
    const village = await create("Val Village");
    const response = await staff()
      .put(`/admin/sites/${village}/roles`)
      .send({ ...ROLES, supply: "transfer" });
    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).toContain("Approvisionné par transfert");
    expect((await site(village)).supply).toBe("on_site");
  });

  it("pose le point AVEC « Livraison », en une seule écriture", async () => {
    const bakery = await create("Fournil");
    await staff()
      .put(`/admin/sites/${bakery}/roles`)
      .send({ ...ROLES, deliveryDeparture: true, gps: { lat: 45.45, lng: 6.98 } })
      .expect(204);
    const stored = await site(bakery);
    expect(stored.deliveryDeparture).toBe(true);
    expect(stored.gps).toEqual({ lat: 45.45, lng: 6.98 });
  });

  it("refuse (409) d'effacer le point d'un site qui expédie", async () => {
    const bakery = await createWithGps("Fournil");
    await staff()
      .put(`/admin/sites/${bakery}/roles`)
      .send({ ...ROLES, deliveryDeparture: true })
      .expect(204);
    const response = await staff()
      .put(`/admin/sites/${bakery}/roles`)
      .send({ ...ROLES, deliveryDeparture: true, gps: null });
    expect(response.status).toBe(409);
    expect((await site(bakery)).gps).toEqual({ lat: 45.45, lng: 6.98 });
  });
});

describe("admin/sites — couleurs libres", () => {
  it("enregistre une couleur, rendue en minuscules", async () => {
    const id = await create("Val Village");
    await staff()
      .put(`/admin/sites/${id}/couleurs`)
      .send({ ...NO_COLORS, pickupColorB2c: "#9CA3AF" })
      .expect(204);
    expect((await site(id)).pickupColorB2c).toBe("#9ca3af");
  });

  it("accepte un vert : les couleurs sont entièrement libres (Hugo, 2026-10-13)", async () => {
    const id = await create("Val Village");
    await staff()
      .put(`/admin/sites/${id}/couleurs`)
      .send({ ...NO_COLORS, pickupColorB2b: "#16a34a", deliveryColorB2c: "#dc2626" })
      .expect(204);
    const stored = await site(id);
    expect(stored.pickupColorB2b).toBe("#16a34a");
    expect(stored.deliveryColorB2c).toBe("#dc2626");
  });

  it("revient à « pas de couleur » : une couleur posée s'efface (Hugo, 2026-10-13)", async () => {
    const id = await create("Val Village");
    await staff()
      .put(`/admin/sites/${id}/couleurs`)
      .send({ ...NO_COLORS, deliveryColorB2b: "#2563eb" })
      .expect(204);
    await staff().put(`/admin/sites/${id}/couleurs`).send(NO_COLORS).expect(204);
    expect((await site(id)).deliveryColorB2b).toBeNull();
  });

  it("règle la teinte du réassort, et un payload sans elle la laisse en place (Hugo, 2026-10-22)", async () => {
    const id = await create("Val Village");
    await staff()
      .put(`/admin/sites/${id}/couleurs`)
      .send({ ...NO_COLORS, resupplyColor: "#26A69A" })
      .expect(204);
    expect((await site(id)).resupplyColor).toBe("#26a69a");

    const { resupplyColor: _absent, ...before } = NO_COLORS;
    await staff()
      .put(`/admin/sites/${id}/couleurs`)
      .send({ ...before, pickupColorB2b: "#16a34a" })
      .expect(204);
    expect((await site(id)).resupplyColor).toBe("#26a69a");

    await staff().put(`/admin/sites/${id}/couleurs`).send(NO_COLORS).expect(204);
    expect((await site(id)).resupplyColor).toBeNull();
  });

  it("refuse une teinte de réassort hors `#rrggbb` (400), et la base aussi (CHECK)", async () => {
    const id = await create("Val Village");
    await staff()
      .put(`/admin/sites/${id}/couleurs`)
      .send({ ...NO_COLORS, resupplyColor: "teal" })
      .expect(400);
    await expect(
      ctx.prisma.site.update({ where: { id }, data: { resupplyColor: "teal" } }),
    ).rejects.toThrow();
  });

  it("la base refuse une forme hors `#rrggbb` même sans l'agrégat (CHECK)", async () => {
    const id = await create("Val Village");
    await expect(
      ctx.prisma.site.update({ where: { id }, data: { pickupColorB2b: "bleu" } }),
    ).rejects.toThrow();
  });
});

describe("admin/sites — archiver", () => {
  it("archive : sorti de la liste publique, encore lisible par id, en fin de liste", async () => {
    await create("Fournil");
    const village = await create("Val Village");

    await staff().post(`/admin/sites/${village}/archive`).expect(204);

    expect(await publicLabels()).toEqual(["Fournil"]);
    expect((await site(village)).archivedAt).not.toBeNull();
    const all = jsonBody<readonly SiteView[]>(await staff().get("/admin/sites").expect(200));
    expect(all.map((s) => s.label)).toEqual(["Fournil", "Val Village"]);
  });

  it("refuse (409) d'archiver le site qui expédie", async () => {
    await create("Val Village");
    const bakery = await createWithGps("Fournil");
    await staff()
      .put(`/admin/sites/${bakery}/roles`)
      .send({ ...ROLES, deliveryDeparture: true })
      .expect(204);

    const response = await staff().post(`/admin/sites/${bakery}/archive`);
    expect(response.status).toBe(409);
  });
});

describe("admin/sites — le droit", () => {
  /**
   * La surface est sous `lfc_site_settings` : `b2b_settings`, qui ouvrait les
   * points de retrait, ne l'ouvre pas.
   */
  it("sans `lfc_site_settings` : 403, même avec les réglages plateforme", async () => {
    const grants: readonly RoleGrant[] = [{ resource: "b2b_settings", action: "write" }];
    await staff()
      .post("/admin/staff-roles")
      .send({ key: "reglages", label: "reglages", grants })
      .expect(201);
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "Réglages",
        email: "reglages@lfc.test",
        role: null,
        roleKey: "reglages",
        status: "active",
        auth0Id: "staff-reglages",
      },
    });

    await ctx.asSub("staff-reglages").get("/admin/sites").expect(403);
    // L'ancienne surface reste servie au front d'aujourd'hui, sous son droit.
    await ctx
      .asSub("staff-reglages")
      .post("/admin/pickup-addresses")
      .send(place("Val Village"))
      .expect(201);
  });
});

/** Un membre du staff dont le rôle n'accorde QUE ces droits. */
async function staffWith(key: string, grants: readonly RoleGrant[]): Promise<string> {
  await staff().post("/admin/staff-roles").send({ key, label: key, grants }).expect(201);
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
  return sub;
}

describe("admin/sites/palette — la palette de la logistique (plan du tri et des couleurs, L1a)", () => {
  it("se lit sous le colisage, la livraison ou les commandes, SANS `lfc_site_settings` — id, nom, couleurs", async () => {
    const id = await create("Val Village");
    await staff()
      .put(`/admin/sites/${id}/couleurs`)
      .send({ ...NO_COLORS, pickupColorB2c: "#9E9E9E" })
      .expect(204);

    for (const [key, resource] of [
      ["coliseur", "production_packing"],
      ["composeur", "delivery_rounds"],
      ["chargeur", "delivery_loading"],
      ["livreur", "delivery_driving"],
      // La liste des Commandes peint sa colonne « Mode » (2026-10-14). Pas la
      // clé `commercial` : c'est un rôle de la graine, que le reset remet, et
      // sa création répondrait 409.
      ["preneur-de-commandes", "b2b_orders"],
    ] as const) {
      const sub = await staffWith(key, [{ resource, action: "read" }]);
      const response = await ctx.asSub(sub).get("/admin/sites/palette").expect(200);
      const entry = jsonBody<SitePaletteView>(response).sites.find((s) => s.id === id);
      expect(entry).toEqual({
        id,
        label: "Val Village",
        supply: "on_site",
        isDeparture: false,
        ...NO_COLORS,
        pickupColorB2c: "#9e9e9e",
      });
      // La palette n'ouvre pas l'écran des sites.
      await ctx.asSub(sub).get("/admin/sites").expect(403);
    }
  });

  it("refuse (403) un membre sans aucun des cinq droits", async () => {
    const sub = await staffWith("compta", [{ resource: "b2b_settings", action: "write" }]);

    await ctx.asSub(sub).get("/admin/sites/palette").expect(403);
  });
});
