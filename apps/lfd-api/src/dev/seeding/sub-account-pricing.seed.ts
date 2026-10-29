import { PoseCompanyMercurialeCommand } from "../../b2b/pricing/application/commands/pose-company-mercuriale.command.js";
import { SetVolumeLadderCommand } from "../../b2b/pricing/application/commands/set-volume-ladder.command.js";
import { SignVolumeCommitmentCommand } from "../../b2b/pricing/application/commands/sign-volume-commitment.command.js";
import type { ClientContext } from "./client.seed.js";
import { asStaff, isoDay, monthDay, parisAt, SEED_STAFF_SUB } from "./order-placing.seed.js";
import { saleSkusOf, withSaleSkus } from "./sale-references.seed.js";

/**
 * **Les décisions tarifaires des deux cas** — par les commandes de la
 * tarification, signées par l'agent du semis.
 *
 * - le groupe hôtelier : une mercuriale négociée et un engagement de volume,
 *   que ses deux hôtels suivent (`pricing`) ;
 * - un barème par hôtel sur l'article engagé : c'est lui qui donne un PALIER à
 *   franchir, et le cumul de l'engagement (celui du groupe, Q6) qui le fait
 *   avancer ;
 *
 * Chaque décision ne se pose que si sa société n'en a pas déjà une vivante :
 * relancer ne double rien.
 */

/** L'article de l'engagement et des barèmes : le croissant. */
export const COMMITTED_SKU = "VIE-001";

/** La mercuriale du groupe, en millicentimes HT. */
const GROUP_MERCURIALE: readonly { readonly sku: string; readonly unitPriceMillicents: number }[] =
  [
    { sku: "VIE-002", unitPriceMillicents: 95_000 },
    { sku: "PAI-001", unitPriceMillicents: 110_000 },
    { sku: "CHO-007", unitPriceMillicents: 1_150_000 },
  ];

/** Combien de croissants le groupe promet sur la saison. */
const PROMISED_CROISSANTS = 200;

/** Le barème de chaque hôtel : 400 puis 800 croissants de cumul (points de base). */
const HOTEL_TIERS = [
  { minQuantity: 400, value: 500 },
  { minQuantity: 800, value: 1_000 },
];

/** Un an : la durée des décisions semées. */
const SEASON_MONTHS = 12;

export interface PricingTargets {
  readonly groupId: string;
  readonly hotelIds: readonly string[];
}

export async function seedSubAccountPricing(
  context: ClientContext,
  from: Date,
  targets: PricingTargets,
): Promise<void> {
  const to = monthsAfter(from, SEASON_MONTHS);
  // Une décision vise une référence de VENTE : celle de la déclinaison depuis
  // la bascule (L3) — la référence produit serait refusée, hors vente.
  const mercuriale = await withSaleSkus(context.prisma, GROUP_MERCURIALE);
  const committed = (await saleSkusOf(context.prisma, [COMMITTED_SKU])).get(COMMITTED_SKU);
  await asStaff(context.now, async () => {
    await poseMercuriale(context, targets.groupId, "Mercuriale Groupe des Cimes", from, to, [
      ...mercuriale,
    ]);
    await signCommitment(context, targets.groupId, from, to, committed ?? COMMITTED_SKU);
    for (const hotelId of targets.hotelIds) {
      await setHotelLadder(context, hotelId, from, to, committed ?? COMMITTED_SKU);
    }
  });
}

async function poseMercuriale(
  { prisma, commands }: ClientContext,
  companyId: string,
  label: string,
  from: Date,
  to: Date,
  lines: { sku: string; unitPriceMillicents: number }[],
): Promise<void> {
  const live = await prisma.companyMercuriale.count({ where: { companyId, archivedAt: null } });
  if (live > 0) {
    return;
  }
  await commands.execute(
    new PoseCompanyMercurialeCommand(
      companyId,
      { label, validFrom: from.toISOString(), validTo: to.toISOString(), lines },
      SEED_STAFF_SUB,
    ),
  );
}

async function signCommitment(
  { prisma, commands }: ClientContext,
  companyId: string,
  from: Date,
  to: Date,
  sku: string,
): Promise<void> {
  const live = await prisma.volumeCommitment.count({ where: { companyId, archivedAt: null } });
  if (live > 0) {
    return;
  }
  await commands.execute(
    new SignVolumeCommitmentCommand(
      {
        companyId,
        scope: { type: "product", id: sku },
        promisedQuantity: PROMISED_CROISSANTS,
        validFrom: from.toISOString(),
        validTo: to.toISOString(),
      },
      SEED_STAFF_SUB,
    ),
  );
}

async function setHotelLadder(
  { prisma, commands }: ClientContext,
  companyId: string,
  from: Date,
  to: Date,
  sku: string,
): Promise<void> {
  const live = await prisma.volumeLadder.count({
    where: { audienceType: "company", audienceId: companyId, archivedAt: null },
  });
  if (live > 0) {
    return;
  }
  await commands.execute(
    new SetVolumeLadderCommand(
      {
        scope: { type: "product", id: sku },
        audience: { type: "company", id: companyId },
        unit: "percent",
        tiers: HOTEL_TIERS,
        label: "Barème croissants — engagement du groupe",
        validFrom: from,
        validTo: to,
      },
      SEED_STAFF_SUB,
    ),
  );
}

/** Le premier jour du mois précédent, à minuit à Paris. */
export function startOfPreviousMonth(now: Date): Date {
  return parisAt(monthDay(isoDay(now), -1, 1), 0);
}

/** Le même jour du mois, `months` mois plus tard, à minuit à Paris. */
function monthsAfter(from: Date, months: number): Date {
  const day = isoDay(from);
  return parisAt(monthDay(day, months, Number(day.slice(-2))), 0);
}
