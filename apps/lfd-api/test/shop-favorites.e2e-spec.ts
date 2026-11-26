/**
 * E2E des **favoris de la boutique** (`documentation/commandes/boutique/les-favoris.md`, B1).
 *
 * Ce que seul le vrai Postgres prouve :
 * - le mur : deux sociétés et un particulier ne voient chacun que leurs favoris,
 *   et un retrait dans un espace ne touche pas l'autre ;
 * - l'idempotence par la clé primaire : deux PUT font un seul favori ;
 * - un DELETE d'un absent rend 204.
 */
import type { MyFavoritesView } from "@lfd/contracts";

import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const PRO_A = "auth0|favoris-pro-a";
const PRO_B = "auth0|favoris-pro-b";
const PERSON = "auth0|favoris-particulier";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  for (const sub of [PRO_A, PRO_B]) {
    const user = await createUser(ctx.prisma, { auth0Sub: sub });
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  }
  await createUser(ctx.prisma, { auth0Sub: PERSON });
});

async function favoritesOf(sub: string): Promise<readonly string[]> {
  return jsonBody<MyFavoritesView>(await ctx.asSub(sub).get("/me/favorites").expect(200)).skus;
}

const put = (sub: string, sku: string) => ctx.asSub(sub).put(`/me/favorites/${sku}`);
const remove = (sub: string, sku: string) => ctx.asSub(sub).delete(`/me/favorites/${sku}`);

describe("me/favorites", () => {
  it("ne montre à chaque espace que ses favoris", async () => {
    await put(PRO_A, "SKU-A").expect(204);
    await put(PRO_B, "SKU-B").expect(204);
    await put(PERSON, "SKU-P").expect(204);

    expect(await favoritesOf(PRO_A)).toEqual(["SKU-A"]);
    expect(await favoritesOf(PRO_B)).toEqual(["SKU-B"]);
    expect(await favoritesOf(PERSON)).toEqual(["SKU-P"]);
  });

  it("deux PUT du même SKU font un seul favori", async () => {
    await put(PRO_A, "SKU-A").expect(204);
    await put(PRO_A, "SKU-A").expect(204);

    expect(await favoritesOf(PRO_A)).toEqual(["SKU-A"]);
    expect(await ctx.prisma.shopFavorite.count()).toBe(1);
  });

  it("un retrait ne touche que l'espace qui le demande", async () => {
    await put(PRO_A, "SKU-X").expect(204);
    await put(PRO_B, "SKU-X").expect(204);

    await remove(PRO_B, "SKU-X").expect(204);

    expect(await favoritesOf(PRO_A)).toEqual(["SKU-X"]);
    expect(await favoritesOf(PRO_B)).toEqual([]);
  });

  it("retirer un favori absent rend 204", async () => {
    await remove(PERSON, "SKU-ABSENT").expect(204);

    expect(await favoritesOf(PERSON)).toEqual([]);
  });

  it("refuse un SKU trop long (400)", async () => {
    await put(PERSON, "S".repeat(65)).expect(400);
  });
});
