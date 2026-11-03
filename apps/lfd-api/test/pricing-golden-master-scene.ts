/**
 * **La scène du golden master du chiffrage** (plan
 * `documentation/pricing/centime-et-tva/plan-un-seul-assemblage.md`, §3 G1,
 * lot L0) : l'horloge figée, le point de retrait, les zones, les clientèles.
 *
 * 🔴 **L'horloge est figée sur un MERCREDI à 10 h de Paris** — le plus récent
 * mercredi à aujourd'hui compris. Pas une date du calendrier (elle vieillirait,
 * CLAUDE.md §5), mais pas non plus « maintenant » : un jour de semaine qui
 * glisse ferait changer les ouvertures et les promotions à heures, et
 * l'instantané rougirait un jour sur sept sans qu'une ligne de code ait bougé.
 * Toutes les fixtures datées sont relatives à cet instant ({@link anchoredDay}).
 */
import { addDays, instantToLocal, localToInstant } from "@lfd/contracts";
import { htMillicentsOf } from "@lfd/pim-contracts";

import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const DAY_MS = 86_400_000;
const WEDNESDAY = 3;
const ANCHOR_TIME = "10:00";

/** Le plus récent mercredi (Paris) à aujourd'hui compris, à 10 h. */
function anchorInstant(): Date {
  const today = instantToLocal(new Date()).day;
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const back = (weekday - WEDNESDAY + 7) % 7;
  const instant = localToInstant(addDays(today, -back), ANCHOR_TIME);
  if (instant === null) {
    throw new Error(`Golden master : ancre introuvable (${today}).`);
  }
  return instant;
}

/** L'horloge de la suite — à poser en surcharge de `Clock`. */
export const GOLDEN_CLOCK = new FixedClock(anchorInstant());

/** Le jour (Paris) à `days` jours de l'ancre — un mercredi pour `days = 7`. */
export function anchoredDay(days: number): string {
  return addDays(instantToLocal(GOLDEN_CLOCK.now()).day, days);
}

/** L'instant ISO à `days` jours avant l'ancre. */
export function anchoredDaysAgo(days: number): string {
  return new Date(GOLDEN_CLOCK.now().getTime() - days * DAY_MS).toISOString();
}

export const BUYER_SUB = "auth0|golden-pro";
export const NO_CREDIT_SUB = "auth0|golden-pro-sans-credit";
export const PENDING_SUB = "auth0|golden-pro-en-attente";
export const INDIVIDUAL_SUB = "auth0|golden-particulier";
/** L'article passé à 10 % : la ventilation doit voir deux taux de marchandise. */
export const TEN_PERCENT_SKU = "SAL-001-1";

export const COURIER_ADDRESS = {
  label: "Restaurant",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
} as const;

export const PERCENT_ADDRESS = {
  label: "",
  ligne1: "3 place Grenette",
  ligne2: "",
  codePostal: "38000",
  ville: "Grenoble",
  pays: "France",
} as const;

/** Un pro de la scène : sa société, son acheteur, son adresse du carnet. */
export interface ScenePro {
  readonly companyId: string;
  readonly buyerUserId: string;
  readonly addressId: string;
  /** L'adresse du carnet dans la zone au pourcentage. */
  readonly percentAddressId: string;
}

export interface GoldenScene {
  readonly siteId: string;
  readonly pro: ScenePro;
  readonly proWithoutCredit: ScenePro;
  readonly proPending: ScenePro;
  readonly individualUserId: string;
}

/** Toute la scène, semée une fois, sur une base remise à zéro. */
export async function seedGoldenScene(ctx: E2eContext): Promise<GoldenScene> {
  await ctx.prisma.$executeRawUnsafe("SELECT public.bascule_des_promotions()");
  const siteId = await seedSite(ctx);
  await seedZonesAndRates(ctx);
  const scene: GoldenScene = {
    siteId,
    pro: await seedPro(ctx, BUYER_SUB, CompanyStatus.active, true),
    proWithoutCredit: await seedPro(ctx, NO_CREDIT_SUB, CompanyStatus.active, false),
    proPending: await seedPro(ctx, PENDING_SUB, CompanyStatus.pending, false),
    individualUserId: (await createUser(ctx.prisma, { auth0Sub: INDIVIDUAL_SUB })).id,
  };
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put("/admin/loyalty/settings")
    .send({
      pointsPerStep: 1_000,
      stepValueCents: 500,
      openToPublic: true,
      openToPro: false,
      voucherValidityDays: 365,
      welcomeBonusPoints: null,
    })
    .expect(204);
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put("/admin/order-late-fee")
    .send({ fee: { mode: "amount", cents: 500 }, vatRatePercent: 20 })
    .expect(204);
  ctx.app.get(PricingMaterialsCache).invalidate();
  return scene;
}

async function seedSite(ctx: E2eContext): Promise<string> {
  const site = await ctx.prisma.site.create({
    data: {
      label: "Le Labo",
      ligne1: "1 place du Centre",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
      opening: {
        publicOpening: { start: "07:00", end: "19:00" },
        proPickup: { start: "07:00", end: "19:00" },
      },
    },
    select: { id: true },
  });
  return site.id;
}

/**
 * Deux zones (forfait, pourcentage), un barème de volume au croissant, et un
 * article à 10 % — étiquette publique comprise, pour que les deux audiences
 * le facturent au même taux.
 */
async function seedZonesAndRates(ctx: E2eContext): Promise<void> {
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2_000 },
  });
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["38000"], label: "Grenoble", feeMode: "percent", feeValue: 1_000 },
  });
  await ctx.prisma.volumeLadder.create({
    data: {
      id: "ladder_golden",
      scopeType: "product",
      scopeId: "VIE-001-1",
      audienceType: "all",
      audienceId: null,
      unit: "percent",
      tiers: [{ minQuantity: 10, value: 1_500 }],
      label: "Barème dix pièces",
      validFrom: new Date(anchoredDaysAgo(30)),
      createdBy: "e2e",
    },
  });
  const item = await ctx.prisma.catalogItem.findUniqueOrThrow({
    where: { sku: TEN_PERCENT_SKU },
    select: { publicTtcCents: true },
  });
  const htMillicents =
    item.publicTtcCents === null ? null : htMillicentsOf(item.publicTtcCents, 10);
  if (htMillicents === null) {
    throw new Error(`Golden master : ${TEN_PERCENT_SKU} sans étiquette publique.`);
  }
  await ctx.prisma.catalogItem.update({
    where: { sku: TEN_PERCENT_SKU },
    data: {
      vatRatePercent: 10,
      publicByContext: { takeaway: { vatRatePercent: 10, htMillicents } },
    },
  });
}

async function seedPro(
  ctx: E2eContext,
  sub: string,
  status: CompanyStatus,
  credited: boolean,
): Promise<ScenePro> {
  const company = await createCompany(ctx.prisma, { status });
  if (credited) {
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { grantedTerms: [DeferredTerm.monthly] },
    });
  }
  const buyer = await createUser(ctx.prisma, { auth0Sub: sub, email: `${sub.slice(6)}@golden.fr` });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  const address = await bookAddress(ctx, company.id, COURIER_ADDRESS, true);
  const percentAddress = await bookAddress(ctx, company.id, PERCENT_ADDRESS, false);
  return {
    companyId: company.id,
    buyerUserId: buyer.id,
    addressId: address,
    percentAddressId: percentAddress,
  };
}

/**
 * Une adresse du carnet, livrée avant 10:00 — inscrite comme par le
 * commercial : un pro ne demande qu'une échéance inscrite sur son adresse.
 */
async function bookAddress(
  ctx: E2eContext,
  companyId: string,
  postal: typeof COURIER_ADDRESS | typeof PERCENT_ADDRESS,
  isDefault: boolean,
): Promise<string> {
  const address = await ctx.prisma.address.create({
    data: {
      ...postal,
      companyId,
      kind: "delivery",
      isDefault,
      deliverySpecs: {
        note: "",
        slotList: { mode: "everyday", slots: [] },
        deliveryContact: null,
        gps: null,
        signatureRequired: null,
        windowMode: "deadline",
        deadlines: { mode: "everyday", times: ["10:00"] },
      },
    },
    select: { id: true },
  });
  return address.id;
}
