import { PoseCompanyMercurialeCommand } from "../../b2b/pricing/application/commands/pose-company-mercuriale.command.js";
import { SetVolumeLadderCommand } from "../../b2b/pricing/application/commands/set-volume-ladder.command.js";
import { SignVolumeCommitmentCommand } from "../../b2b/pricing/application/commands/sign-volume-commitment.command.js";
import type { ClientContext } from "./client.seed.js";
import { asStaff, SEED_STAFF_SUB } from "./order-placing.seed.js";

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
  await asStaff(context.now, async () => {
    await poseMercuriale(context, targets.groupId, "Mercuriale Groupe des Cimes", from, to, [
      ...GROUP_MERCURIALE,
    ]);
    await signCommitment(context, targets.groupId, from, to);
    for (const hotelId of targets.hotelIds) {
      await setHotelLadder(context, hotelId, from, to);
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
): Promise<void> {
  const live = await prisma.volumeCommitment.count({ where: { companyId, archivedAt: null } });
  if (live > 0) {
    return;
  }
  await commands.execute(
    new SignVolumeCommitmentCommand(
      {
        companyId,
        scope: { type: "product", id: COMMITTED_SKU },
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
        scope: { type: "product", id: COMMITTED_SKU },
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

/** Le premier jour du mois précédent, à minuit local. */
export function startOfPreviousMonth(now: Date): Date {
  const start = new Date(now);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  start.setMonth(start.getMonth() - 1);
  return start;
}

function monthsAfter(from: Date, months: number): Date {
  const end = new Date(from);
  end.setMonth(end.getMonth() + months);
  return end;
}
