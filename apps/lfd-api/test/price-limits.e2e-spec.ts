/**
 * E2E des **limites de prix par clientèle** — pro et public, par les ROUTES
 * (`documentation/comptabilite/plan-limites-de-prix.md` §7).
 *
 * 🔴 Par l'application, pas en SQL : la contrainte d'exclusion ne voit aucun
 * chevauchement entre une limite pro et une publique. C'est l'application qui
 * clôt la précédente à la pose et qui retrouve la limite à confirmer ou à
 * archiver — donc c'est elle qui pourrait fermer la pro par un geste public, et
 * seule une route traversée de bout en bout le prouve.
 *
 * Le jeton porteur EST le `sub` : chaque rôle est une vraie fiche en base.
 */
import { millicentsFromCents } from "@lfd/money";
import type { PriceLimitsView, PricingBoardView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** VIE-001 vaut 200 c dans le catalogue qui facture. */
const SKU = "VIE-001";
const FAMILY = "viennoiserie";
const CANONICAL_MILLICENTS = millicentsFromCents(200);
const GLOBAL = { type: "global", id: null } as const;

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

const admin = () => ctx.asSub(E2E_STAFF_SUB);

/** Sème une personne de ce rôle, déjà entrée, et rend son agent HTTP. */
async function asRole(
  role: "commercial" | "comptabilite",
): Promise<ReturnType<E2eContext["asSub"]>> {
  const sub = `staff-${role}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: role,
      email: `${role}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

function putFloor(value: number, clientele?: "pro" | "public") {
  return admin()
    .put("/admin/pricing/floors")
    .send({
      scope: GLOBAL,
      mode: "percent",
      value,
      ...(clientele === undefined ? {} : { clientele }),
    });
}

async function limits(clientele: "pro" | "public"): Promise<PriceLimitsView> {
  return jsonBody<PriceLimitsView>(
    await admin().get(`/admin/pricing/floors?clientele=${clientele}`).expect(200),
  );
}

const board = async (agent = admin()): Promise<PricingBoardView> =>
  jsonBody<PricingBoardView>(await agent.get("/admin/pricing").expect(200));

describe("poser une limite publique", () => {
  it("🔴 laisse la limite pro en vigueur sur la même portée", async () => {
    await putFloor(6_000).expect(204);

    await putFloor(4_000, "public").expect(204);

    const pro = await limits("pro");
    expect(pro.clientele).toBe("pro");
    expect(pro.floors.map((floor) => floor.value)).toEqual([6_000]);
    expect((await limits("public")).floors.map((floor) => floor.value)).toEqual([4_000]);
    // Aucune ligne close : la publique n'a rien borné.
    expect(await ctx.prisma.priceFloor.count({ where: { validTo: { not: null } } })).toBe(0);
    expect((await board()).globalFloor?.value).toBe(6_000);
  });

  it("re-poser la publique borne la publique, jamais la pro", async () => {
    await putFloor(6_000).expect(204);
    await putFloor(4_000, "public").expect(204);

    await putFloor(3_000, "public").expect(204);

    expect((await limits("pro")).floors.map((floor) => floor.value)).toEqual([6_000]);
    expect((await limits("public")).floors.map((floor) => floor.value)).toEqual([3_000]);
    expect(
      await ctx.prisma.priceFloor.count({ where: { clientele: "pro", validTo: { not: null } } }),
    ).toBe(0);
  });
});

describe("confirmer et archiver avec `?clientele=`", () => {
  beforeEach(async () => {
    await putFloor(6_000).expect(204);
    await putFloor(4_000, "public").expect(204);
  });

  it("confirmer en public ne touche pas la pro", async () => {
    const [proBefore] = (await limits("pro")).floors;
    const [publicBefore] = (await limits("public")).floors;

    await admin().post("/admin/pricing/floors/global/confirm?clientele=public").expect(204);

    expect((await limits("pro")).floors.map((floor) => floor.id)).toEqual([proBefore?.id]);
    const [publicAfter] = (await limits("public")).floors;
    expect(publicAfter?.id).not.toBe(publicBefore?.id);
  });

  it("archiver en public ne touche pas la pro — par le POST motivé comme par le DELETE", async () => {
    await admin()
      .post("/admin/pricing/floors/global/archive?clientele=public")
      .send({ reason: "Pas de promotion publique cette saison" })
      .expect(204);

    expect((await limits("public")).floors).toEqual([]);
    expect((await limits("pro")).floors.map((floor) => floor.value)).toEqual([6_000]);
    // Une seconde fois : il n'y a plus de publique, la pro ne sert pas de repli.
    const again = await admin().delete("/admin/pricing/floors/global?clientele=public");
    expect(again.status).toBe(404);
    expect((await limits("pro")).floors).toHaveLength(1);
  });

  it("sans paramètre, c'est la pro qu'on vise", async () => {
    await admin().delete("/admin/pricing/floors/global").expect(204);

    expect((await limits("pro")).floors).toEqual([]);
    expect((await limits("public")).floors.map((floor) => floor.value)).toEqual([4_000]);
  });

  it("refuse une clientèle inconnue, en 400", async () => {
    const response = await admin().post("/admin/pricing/floors/global/confirm?clientele=b2c");

    expect(response.status).toBe(400);
  });
});

describe("le journal sépare les deux histoires", () => {
  it("l'historique d'une portée pro ne montre aucun fait public", async () => {
    await putFloor(6_000).expect(204);
    await putFloor(4_000, "public").expect(204);
    await admin().post("/admin/pricing/floors/global/confirm?clientele=public").expect(204);

    const pro = jsonBody<{ act: string; summary: string }[]>(
      await admin().get("/admin/pricing/journal/floor/global%3A").expect(200),
    );
    const publicHistory = jsonBody<{ act: string; summary: string }[]>(
      await admin().get("/admin/pricing/journal/floor/public%3Aglobal%3A").expect(200),
    );

    expect(pro.map((entry) => entry.act)).toEqual(["posed"]);
    expect(pro[0]?.summary).toContain("Limite pro");
    expect(publicHistory.map((entry) => entry.act)).toEqual(["confirmed", "posed"]);
    expect(publicHistory.every((entry) => entry.summary.includes("Limite publique"))).toBe(true);
  });
});

describe("la résolution ne lit que le pro", () => {
  it("🔴 une limite publique élevée ne relève aucun prix pro", async () => {
    await admin()
      .put("/admin/pricing/floors")
      .send({
        scope: { type: "product", id: SKU },
        mode: "amount",
        value: millicentsFromCents(500),
        clientele: "public",
      })
      .expect(204);

    const family = (await board()).categories.find((category) => category.id === FAMILY);
    const item = family?.items.find((candidate) => candidate.sku === SKU);

    expect(item?.finalMillicents).toBe(CANONICAL_MILLICENTS);
    expect(item?.ownFloor).toBeNull();
    expect(item?.effectiveFloor).toBeNull();
  });

  it("la même limite, posée pro, relève le prix — le cas précédent ne passe pas par accident", async () => {
    await admin()
      .put("/admin/pricing/floors")
      .send({
        scope: { type: "product", id: SKU },
        mode: "amount",
        value: millicentsFromCents(500),
      })
      .expect(204);

    const family = (await board()).categories.find((category) => category.id === FAMILY);
    const item = family?.items.find((candidate) => candidate.sku === SKU);

    expect(item?.finalMillicents).toBe(millicentsFromCents(500));
  });
});

describe("le droit `price_limits`", () => {
  it("🔴 refuse la pose au commercial, qui a pourtant `b2b_pricing:write`", async () => {
    const commercial = await asRole("commercial");

    const response = await commercial
      .put("/admin/pricing/floors")
      .send({ scope: GLOBAL, mode: "percent", value: 6_000 });

    expect(response.status).toBe(403);
    expect(await ctx.prisma.priceFloor.count()).toBe(0);
  });

  it("refuse au commercial confirmer et archiver", async () => {
    await putFloor(6_000).expect(204);
    const commercial = await asRole("commercial");

    expect((await commercial.post("/admin/pricing/floors/global/confirm")).status).toBe(403);
    expect((await commercial.delete("/admin/pricing/floors/global")).status).toBe(403);
  });

  it("laisse la comptabilité poser une limite", async () => {
    const accounting = await asRole("comptabilite");

    await accounting
      .put("/admin/pricing/floors")
      .send({ scope: GLOBAL, mode: "percent", value: 6_000, clientele: "public" })
      .expect(204);

    expect((await limits("public")).floors).toHaveLength(1);
  });

  it("🔴 refuse au commercial la liste des limites, et lui montre quand même la limite pro au tableau", async () => {
    await putFloor(6_000).expect(204);
    const commercial = await asRole("commercial");

    expect((await commercial.get("/admin/pricing/floors")).status).toBe(403);
    expect((await board(commercial)).globalFloor?.value).toBe(6_000);
  });
});
