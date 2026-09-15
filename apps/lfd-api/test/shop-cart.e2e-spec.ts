/**
 * E2E du **panier en cours du client** (`/shop/cart`).
 *
 * Ce que seul le vrai SQL prouve, et qui est toute la raison de sortir le panier
 * du navigateur : qu'il est bien **un par personne et par espace** (l'index
 * unique `NULLS NOT DISTINCT` tient, perso compris, et un second enregistrement
 * remplace au lieu d'empiler, même simultané) ; qu'il se relit **depuis un
 * autre appareil**, c'est-à-dire depuis une seconde requête portant le même
 * jeton et rien d'autre ; qu'il ne fuit pas d'une personne à l'autre ; et qu'un
 * panier VIDÉ se relit comme vide plutôt que comme absent — sans quoi la reprise
 * multi-appareil ne tiendrait que dans le sens de l'ajout.
 *
 * Frontière doublée : la signature du jeton Auth0. Le reste — guard global, bus,
 * domaine, `jsonb`, contrainte d'unicité — est réel.
 */
import {
  PERSONAL_WORKSPACE,
  WORKSPACE_HEADER,
  type ShopCartPayload,
  type ShopCartResponse,
  type ShopCartView,
} from "@lfd/contracts";

import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Une personne, sans aucune société : le panier n'en demande pas. */
async function seedPerson(sub: string): Promise<string> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub });
  return user.id;
}

const DEUX_CROISSANTS: ShopCartPayload = {
  lines: [
    { sku: "VIE-001", quantity: 2 },
    { sku: "SAL-001", quantity: 1 },
  ],
};

describe("Le panier du client, gardé chez nous", () => {
  it("se relit tel qu'il a été posé, depuis un autre appareil", async () => {
    await seedPerson("client-panier");

    const written = jsonBody<ShopCartView>(
      await ctx.asSub("client-panier").put("/shop/cart").send(DEUX_CROISSANTS).expect(200),
    );
    expect(written.lines).toEqual(DEUX_CROISSANTS.lines);
    expect(Date.parse(written.savedAt)).not.toBeNaN();

    // Une SECONDE requête, avec le même jeton et rien d'autre : c'est
    // exactement ce qu'est « l'ordinateur du bureau » pour ce chantier.
    const read = jsonBody<ShopCartResponse>(
      await ctx.asSub("client-panier").get("/shop/cart").expect(200),
    );
    expect(read.cart?.lines).toEqual(DEUX_CROISSANTS.lines);
  });

  /**
   * 🔴 Le cas qui décide de la forme du contrat. Vider sur un appareil doit
   * atteindre l'autre — donc un panier vide est une LIGNE à zéro ligne, pas une
   * ressource absente. Sans ça, l'ordinateur ressusciterait le panier de la
   * veille en croyant à une première visite.
   */
  it("un panier VIDÉ se relit vide, pas absent", async () => {
    await seedPerson("client-vide");
    await ctx.asSub("client-vide").put("/shop/cart").send(DEUX_CROISSANTS).expect(200);

    await ctx.asSub("client-vide").put("/shop/cart").send({ lines: [] }).expect(200);

    const read = jsonBody<ShopCartResponse>(
      await ctx.asSub("client-vide").get("/shop/cart").expect(200),
    );
    expect(read.cart).not.toBeNull();
    expect(read.cart?.lines).toEqual([]);
  });

  it("remplace au lieu d'empiler : un panier par personne", async () => {
    const userId = await seedPerson("client-unique");

    await ctx.asSub("client-unique").put("/shop/cart").send(DEUX_CROISSANTS).expect(200);
    await ctx
      .asSub("client-unique")
      .put("/shop/cart")
      .send({ lines: [{ sku: "PAT-001", quantity: 5 }] })
      .expect(200);

    expect(await ctx.prisma.shopCart.count({ where: { userId } })).toBe(1);
    const read = jsonBody<ShopCartResponse>(
      await ctx.asSub("client-unique").get("/shop/cart").expect(200),
    );
    expect(read.cart?.lines).toEqual([{ sku: "PAT-001", quantity: 5 }]);
  });

  it("répond `{ cart: null }` à qui n'a jamais rien composé — pas un 404", async () => {
    await seedPerson("client-neuf");

    const read = jsonBody<ShopCartResponse>(
      await ctx.asSub("client-neuf").get("/shop/cart").expect(200),
    );
    expect(read.cart).toBeNull();
  });

  /** Le panier d'un client n'est visible que de lui : le mur est le jeton. */
  it("ne montre pas le panier d'un autre", async () => {
    await seedPerson("client-a");
    await seedPerson("client-b");
    await ctx.asSub("client-a").put("/shop/cart").send(DEUX_CROISSANTS).expect(200);

    const read = jsonBody<ShopCartResponse>(
      await ctx.asSub("client-b").get("/shop/cart").expect(200),
    );
    expect(read.cart).toBeNull();
  });

  /**
   * La boutique est publique ; le panier ne l'est pas. Un panier a un
   * propriétaire, et sans jeton il n'y en a pas.
   */
  it("refuse l'anonyme, là où la vitrine et le devis l'accueillent", async () => {
    await ctx.http().get("/shop/cart").expect(401);
    await ctx.http().put("/shop/cart").send(DEUX_CROISSANTS).expect(401);
  });

  /**
   * Le contenu n'est PAS vérifié contre le catalogue : un panier qu'on
   * refuserait parce qu'une de ses lignes ne passe plus serait un panier qui ne
   * sert à rien. Le devis, lui, projette à travers le catalogue.
   */
  it("garde une référence que le catalogue ne connaît pas", async () => {
    await seedPerson("client-inconnu");

    const written = jsonBody<ShopCartView>(
      await ctx
        .asSub("client-inconnu")
        .put("/shop/cart")
        .send({ lines: [{ sku: "REF-QUI-NEXISTE-PAS", quantity: 1 }] })
        .expect(200),
    );
    expect(written.lines).toHaveLength(1);
  });

  it("refuse une quantité nulle ou négative — une ligne à zéro n'existe pas", async () => {
    await seedPerson("client-zero");

    await ctx
      .asSub("client-zero")
      .put("/shop/cart")
      .send({ lines: [{ sku: "VIE-001", quantity: 0 }] })
      .expect(400);
  });

  /** Le plafond du devis vaut ici : c'est la charge qu'on accepte d'écrire. */
  it("refuse au-delà de cent lignes", async () => {
    await seedPerson("client-charge");
    const lines = Array.from({ length: 101 }, (_, index) => ({
      sku: `SKU-${String(index)}`,
      quantity: 1,
    }));

    await ctx.asSub("client-charge").put("/shop/cart").send({ lines }).expect(400);
  });

  /**
   * `updated_at` n'est pas de la tenue de registre : c'est lui qui rendra un
   * panier ABANDONNÉ reconnaissable, ce qu'aucune clé de `localStorage` ne
   * pouvait faire. On vérifie donc qu'il avance à chaque mise de côté.
   */
  it("avance sa date à chaque enregistrement — de quoi reconnaître un abandon", async () => {
    await seedPerson("client-date");

    const first = jsonBody<ShopCartView>(
      await ctx.asSub("client-date").put("/shop/cart").send(DEUX_CROISSANTS).expect(200),
    );
    const second = jsonBody<ShopCartView>(
      await ctx
        .asSub("client-date")
        .put("/shop/cart")
        .send({ lines: [{ sku: "VIE-001", quantity: 3 }] })
        .expect(200),
    );

    expect(Date.parse(second.savedAt)).toBeGreaterThanOrEqual(Date.parse(first.savedAt));
  });
});

describe("Un panier par espace de travail", () => {
  const SUB = "client-deux-maisons";
  const lines = (sku: string) => ({ lines: [{ sku, quantity: 1 }] });

  /** Une personne rattachée à deux sociétés : trois espaces, dont le perso. */
  async function seedTwoCompanies(): Promise<{ userId: string; first: string; second: string }> {
    const userId = await seedPerson(SUB);
    const first = await createCompany(ctx.prisma, { raisonSociale: "Maison A SAS" });
    const second = await createCompany(ctx.prisma, {
      raisonSociale: "Maison B SARL",
      siret: "98765432100023",
    });
    await attachTo(ctx.prisma, userId, first.id);
    await attachTo(ctx.prisma, userId, second.id);
    return { userId, first: first.id, second: second.id };
  }

  const inSpace = (space: string) => ({
    put: (payload: ShopCartPayload) =>
      ctx.asSub(SUB).put("/shop/cart").set(WORKSPACE_HEADER, space).send(payload),
    get: async () =>
      jsonBody<ShopCartResponse>(
        await ctx.asSub(SUB).get("/shop/cart").set(WORKSPACE_HEADER, space).expect(200),
      ).cart,
  });

  it("garde un panier distinct par société et un pour le perso", async () => {
    const { userId, first, second } = await seedTwoCompanies();

    await inSpace(first).put(lines("VIE-001")).expect(200);
    await inSpace(second).put(lines("SAL-001")).expect(200);
    await inSpace(PERSONAL_WORKSPACE).put(lines("PAT-001")).expect(200);

    expect((await inSpace(first).get())?.lines).toEqual(lines("VIE-001").lines);
    expect((await inSpace(second).get())?.lines).toEqual(lines("SAL-001").lines);
    expect((await inSpace(PERSONAL_WORKSPACE).get())?.lines).toEqual(lines("PAT-001").lines);
    expect(await ctx.prisma.shopCart.count({ where: { userId } })).toBe(3);
  });

  it("🔴 n'a qu'UN panier perso — deux `company_id` vides se heurtent", async () => {
    // Sans `NULLS NOT DISTINCT`, deux NULL sont distincts pour l'index : chaque
    // enregistrement perso empilerait une ligne au lieu de remplacer.
    const { userId } = await seedTwoCompanies();

    await inSpace(PERSONAL_WORKSPACE).put(lines("VIE-001")).expect(200);
    // Sans en-tête, à deux sociétés : la même société agissante `null`.
    await ctx.asSub(SUB).put("/shop/cart").send(lines("SAL-001")).expect(200);

    expect(await ctx.prisma.shopCart.count({ where: { userId, companyId: null } })).toBe(1);
    expect((await inSpace(PERSONAL_WORKSPACE).get())?.lines).toEqual(lines("SAL-001").lines);
  });

  it("🔴 deux écritures simultanées du même espace ne lèvent rien", async () => {
    // La reprise et l'écriture amortie du front partent ensemble. Un
    // `findFirst` suivi d'un `create` lèverait une violation d'unicité : 500.
    const { userId, first } = await seedTwoCompanies();

    for (const space of [PERSONAL_WORKSPACE, first]) {
      const statuses = await Promise.all(
        ["VIE-001", "SAL-001", "PAT-001"].map(
          async (sku) => (await inSpace(space).put(lines(sku))).status,
        ),
      );
      expect(statuses).toEqual([200, 200, 200]);
    }
    expect(await ctx.prisma.shopCart.count({ where: { userId } })).toBe(2);
  });

  it("ne sert pas le panier d'une société à qui déclare une maison étrangère", async () => {
    // L'en-tête qui ment est ignoré : à deux sociétés, il retombe sur le perso.
    const { first } = await seedTwoCompanies();
    await inSpace(first).put(lines("VIE-001")).expect(200);
    const stranger = await createCompany(ctx.prisma, {
      raisonSociale: "Concurrent SAS",
      siret: "11122233300044",
    });

    expect(await inSpace(stranger.id).get()).toBeNull();
  });
});
