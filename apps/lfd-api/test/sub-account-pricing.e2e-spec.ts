/**
 * E2E du **tarif des sous-comptes** (plan `documentation/b2b/comptes-client/plan-sous-comptes.md`,
 * lot S3, §2.2 et Q6) — sur le vrai Postgres.
 *
 * Ce que seul l'e2e prouve : que la période de suivi `pricing` écrite par le
 * geste staff est celle que le chargeur lit À LA DATE, en lecture comme en
 * relecture, et que le volume d'un engagement du principal additionne en SQL
 * les commandes des sous-comptes qui le suivaient à la date de chaque commande.
 *
 * Seule frontière doublée : la signature du jeton — le jeton EST le `sub`.
 */
import { millicentsFromCents } from "@lfd/money";
import type { CreatedIdResponse, PricingJournalPageView } from "@lfd/contracts";

import type { PricedLot } from "../src/b2b/pricing/application/priced-lot.js";
import { Pricer } from "../src/b2b/pricing/application/pricer.js";
import { CustomerVolumeReader } from "../src/b2b/pricing/domain/ports/customer-volume.reader.js";
import { ProductCatalogReader } from "../src/b2b/catalog/domain/ports/product-catalog.reader.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;
let pricer: Pricer;
let catalog: ProductCatalogReader;
let volumes: CustomerVolumeReader;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
  pricer = ctx.app.get(Pricer);
  catalog = ctx.app.get(ProductCatalogReader);
  volumes = ctx.app.get(CustomerVolumeReader);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

const SKU = "VIE-001";
const DAY_MS = 24 * 60 * 60 * 1000;

const DELIVERY = {
  label: "Établissement",
  ligne1: "1 route du Lac",
  ligne2: "",
  codePostal: "74400",
  ville: "Chamonix",
  pays: "France",
  isDefault: true,
  specs: {
    signatureRequired: false,
    note: "",
    slots: { mode: "everyday", slot: null },
    deliveryContact: null,
    gps: null,
  },
};

async function principal(): Promise<string> {
  return (await createCompany(ctx.prisma, { enseigne: "Club Med Groupe", status: "active" })).id;
}

/** Un sous-compte créé par le geste staff, sans aucun suivi. */
async function subAccount(parentId: string, enseigne: string): Promise<string> {
  const response = await staff()
    .post(`/admin/companies/${parentId}/sub-accounts`)
    .send({ enseigne, deliveryAddress: DELIVERY, follows: [] })
    .expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

/** Le geste du commercial : suivre le tarif du principal (Q9). */
async function followPricing(companyId: string): Promise<void> {
  await staff().post(`/admin/companies/${companyId}/pricing-follow`).expect(204);
}

async function stopPricing(companyId: string): Promise<void> {
  await staff().post(`/admin/companies/${companyId}/pricing-follow/stop`).expect(204);
}

/** Le début de la période de suivi `pricing` en cours, tel que la base l'a posé. */
async function followedSince(companyId: string): Promise<Date> {
  const period = await ctx.prisma.companyFollow.findFirstOrThrow({
    where: { companyId, aspect: "pricing", validTo: null },
  });
  return period.validFrom;
}

function poseMercuriale(companyId: string, cents: number) {
  return staff()
    .post(`/admin/pricing/companies/${companyId}/mercuriale`)
    .send({
      label: "Mercuriale négociée",
      validFrom: daysAgo(30),
      validTo: daysAgo(-365),
      lines: [{ sku: SKU, unitPriceMillicents: millicentsFromCents(cents) }],
    })
    .expect(201);
}

async function lotOf(companyId: string, quantity: number, at?: Date): Promise<PricedLot> {
  const found = await catalog.resolve(SKU, "pro");
  if (found === null) {
    throw new Error(`Le catalogue e2e ne connaît pas « ${SKU} ».`);
  }
  return pricer.load({ articles: [{ article: found.article, quantity }], companyId, at });
}

async function priceOf(companyId: string, at?: Date): Promise<number> {
  return (await lotOf(companyId, 1, at)).price(SKU, 1).finalMillicents;
}

async function canonical(): Promise<number> {
  return (await lotOf("co_sans_tarif", 1)).price(SKU, 1).canonicalMillicents;
}

/** Ce que la CAISSE facture, par HTTP, à un membre du sous-compte. */
async function quotedByCheckout(companyId: string, sub: string): Promise<number | undefined> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub });
  await attachTo(ctx.prisma, user.id, companyId);
  const body = jsonBody<{ lines: readonly { unitPriceMillicents: number }[] }>(
    await ctx
      .asSub(sub)
      .post("/orders/quote")
      .send({ companyId, lines: [{ sku: SKU, quantity: 1 }] })
      .expect(200),
  );
  return body.lines[0]?.unitPriceMillicents;
}

describe("le tarif d'un sous-compte", () => {
  it("🔴 aligné, il paie la mercuriale du principal — à la caisse aussi", async () => {
    const group = await principal();
    const site = await subAccount(group, "Club Med Chamonix");
    await poseMercuriale(group, 150);
    await poseMercuriale(site, 170);

    await followPricing(site);

    expect(await priceOf(site)).toBe(millicentsFromCents(150));
    expect(await quotedByCheckout(site, "auth0|club_chamonix")).toBe(millicentsFromCents(150));
  });

  it("désaligné, il retombe sur sa propre mercuriale (R4)", async () => {
    const group = await principal();
    const site = await subAccount(group, "Club Med Tignes");
    await poseMercuriale(group, 150);
    await poseMercuriale(site, 170);
    await followPricing(site);

    await stopPricing(site);

    expect(await priceOf(site)).toBe(millicentsFromCents(170));
  });

  it("désaligné sans mercuriale propre, il retombe au tarif public — rien n'a été copié", async () => {
    const group = await principal();
    const site = await subAccount(group, "Club Med Val");
    await poseMercuriale(group, 150);
    await followPricing(site);

    await stopPricing(site);

    expect(await priceOf(site)).toBe(await canonical());
    expect(await ctx.prisma.companyMercuriale.count({ where: { companyId: site } })).toBe(0);
  });

  it("🔴 relit une commande passée AVANT l'alignement au tarif d'alors", async () => {
    const group = await principal();
    const site = await subAccount(group, "Club Med Peisey");
    await poseMercuriale(group, 150);
    await poseMercuriale(site, 170);
    await followPricing(site);
    const before = new Date((await followedSince(site)).getTime() - 1);

    expect(await priceOf(site, before)).toBe(millicentsFromCents(170));
    expect(await priceOf(site)).toBe(millicentsFromCents(150));
  });

  it("garde le geste propre au sous-compte : une règle `company` du principal ne le vise pas", async () => {
    const group = await principal();
    const site = await subAccount(group, "Club Med Arcs");
    await ctx.prisma.priceRule.create({
      data: {
        id: "geste_groupe",
        stage: "geste",
        nature: "alter",
        scopeType: "global",
        audienceType: "company",
        audienceId: group,
        direction: "decrease",
        mode: "percent",
        value: 5_000,
        validFrom: new Date(Date.parse(daysAgo(30))),
        label: "Geste au groupe",
        stacksOverMercuriale: true,
        createdBy: "e2e",
      },
    });
    await followPricing(site);

    expect(await priceOf(site)).toBe(await canonical());
  });
});

/**
 * **Q6** : le Club Med a négocié pour trois établissements, et leurs commandes
 * font avancer ensemble le palier de l'engagement du principal. R5 : un
 * établissement sorti garde ses commandes passées, pas les suivantes.
 */
describe("le volume du Club Med", () => {
  let orderSeq = 0;

  /** Une commande du sous-compte, datée de l'instant où elle est écrite. */
  async function ordered(companyId: string, quantity: number): Promise<void> {
    orderSeq += 1;
    const user = await createUser(ctx.prisma, { auth0Sub: `auth0|club_${orderSeq}` });
    const cents = quantity * 100;
    await ctx.prisma.order.create({
      data: {
        orderNumber: `CMD-CLUB-${orderSeq}`,
        companyId,
        placedByUserId: user.id,
        status: "placed",
        subtotalCents: cents,
        totalCents: cents,
        createdAt: new Date(Date.now()),
        lines: {
          create: [
            {
              sku: SKU,
              productNameSnapshot: "Croissant",
              unitPriceMillicents: millicentsFromCents(100),
              quantity,
              lineTotalCents: cents,
            },
          ],
        },
      },
    });
  }

  function windowAroundNow() {
    return { from: new Date(Date.now() - DAY_MS), to: new Date(Date.now() + DAY_MS) };
  }

  async function signCommitment(companyId: string): Promise<void> {
    await staff()
      .post("/admin/pricing/commitments")
      .send({
        companyId,
        scope: { type: "product", id: SKU },
        promisedQuantity: 1,
        validFrom: daysAgo(30),
        validTo: daysAgo(-365),
      })
      .expect(201);
  }

  /** Un barème public qui s'ouvre à 30 pièces de cumul : −10 %. */
  function ladderFromThirty() {
    return ctx.prisma.volumeLadder.create({
      data: {
        id: "ladder_club",
        scopeType: "product",
        scopeId: SKU,
        audienceType: "all",
        audienceId: null,
        unit: "percent",
        tiers: [{ minQuantity: 30, value: 1_000 }],
        label: "Barème trente pièces",
        validFrom: new Date(Date.parse(daysAgo(30))),
        createdBy: "e2e",
      },
    });
  }

  it("🔴 trois sous-comptes font avancer ensemble le palier du principal", async () => {
    const group = await principal();
    const sites = [
      await subAccount(group, "Club Med Chamonix"),
      await subAccount(group, "Club Med Tignes"),
      await subAccount(group, "Club Med Val"),
    ];
    await signCommitment(group);
    await ladderFromThirty();
    for (const site of sites) {
      await followPricing(site);
    }
    const [first] = sites;
    if (first === undefined) {
      throw new Error("Trois sous-comptes attendus.");
    }
    const alone = await priceOf(first);

    for (const site of sites) {
      await ordered(site, 10);
    }

    const measured = await volumes.committedVolumesFor(group, [SKU], windowAroundNow());
    expect(measured.get(SKU)).toBe(30);
    expect(alone).toBe(await canonical());
    expect(await priceOf(first)).toBe(Math.round((await canonical()) * 0.9));
  });

  it("🔴 un sous-compte qui a cessé de suivre ne compte plus pour ses commandes suivantes", async () => {
    const group = await principal();
    const site = await subAccount(group, "Club Med Peisey");
    await followPricing(site);
    await ordered(site, 7);

    await stopPricing(site);
    await ordered(site, 11);

    const measured = await volumes.committedVolumesFor(group, [SKU], windowAroundNow());
    expect(measured.get(SKU)).toBe(7);
  });

  it("🔴 l'effort de vente du principal reste le sien : seul son palier agrège (R9)", async () => {
    const group = await principal();
    const site = await subAccount(group, "Club Med Serre");
    await followPricing(site);
    await ordered(site, 12);

    const window = windowAroundNow();
    expect((await volumes.committedVolumesFor(group, [SKU], window)).get(SKU)).toBe(12);
    expect((await volumes.volumesFor(group, [SKU], window)).get(SKU)).toBeUndefined();
    expect((await volumes.volumesFor(site, [SKU], window)).get(SKU)).toBe(12);
  });

  it("ne compte pas un sous-compte qui n'a jamais suivi le tarif", async () => {
    const group = await principal();
    const site = await subAccount(group, "Club Med Arcs");
    await ordered(site, 9);

    const measured = await volumes.committedVolumesFor(group, [SKU], windowAroundNow());
    expect(measured.get(SKU)).toBeUndefined();
  });
});

/**
 * **Le journal du tarif** (T21) : suivre puis cesser de suivre inscrit deux
 * actes datés sur le compte tarifaire de CHACUNE des deux sociétés, et leur
 * copie au journal général tient lieu de `company.parent_followed`.
 */
describe("le journal du tarif", () => {
  async function journalOf(companyId: string): Promise<PricingJournalPageView> {
    return jsonBody<PricingJournalPageView>(
      await staff().get(`/admin/pricing/journal/company/${companyId}/pages`).expect(200),
    );
  }

  it("🔴 suivre puis cesser : deux entrées datées sur chaque compte, et la copie générale", async () => {
    const group = await principal();
    const site = await subAccount(group, "Club Med Chamonix");

    await followPricing(site);
    await stopPricing(site);

    const onSite = await journalOf(site);
    expect(onSite.entries.map((entry) => entry.act)).toEqual(["ended", "started"]);
    expect(onSite.entries[1]?.summary).toMatch(
      /^Suit la mercuriale de Club Med Groupe depuis le /u,
    );
    expect(onSite.entries[0]?.summary).toMatch(/^Ne suit plus la mercuriale de Club Med Groupe/u);

    const onGroup = await journalOf(group);
    expect(onGroup.entries.map((entry) => entry.act)).toEqual(["left", "joined"]);
    expect(onGroup.entries[1]?.summary).toMatch(/^Club Med Chamonix suit votre mercuriale/u);

    const general = await ctx.prisma.activityEvent.findMany({
      where: { subjectType: "company", subjectId: { in: [site, group] } },
      select: { type: true },
    });
    const types = general.map((row) => row.type);
    expect(types.filter((type) => type.startsWith("pricing_follow")).sort()).toEqual([
      "pricing_follow.ended",
      "pricing_follow.started",
      "pricing_follower.joined",
      "pricing_follower.left",
    ]);
    expect(types).not.toContain("company.parent_followed");
    expect(types).not.toContain("company.parent_unfollowed");
  });

  it("détacher un sous-compte qui suivait le tarif ferme aussi au journal du tarif", async () => {
    const group = await principal();
    const site = await subAccount(group, "Club Med Tignes");
    await followPricing(site);

    await staff().post(`/admin/companies/${site}/parent/detach`).expect(204);

    expect((await journalOf(group)).entries.map((entry) => entry.act)).toEqual(["left", "joined"]);
  });
});
