import type { AppConfig } from "../../platform/config/app-config.js";
import { refuseUnlessLocalDevelopment } from "../local-development.lock.js";
import { HOTEL_GROUP, HOTELS } from "./sub-account-hotels.seed.js";
import { ensureAdminMembership } from "./sub-account-people.seed.js";
import { INVOICE_SEED_NOTE, playWeek, type PlayedWeek } from "./invoice-cycles.seed.js";
import { handOverPastOrders } from "./invoice-handovers.seed.js";
import { accountingStaffId, lowerFloors, readyLegalEntity } from "./invoice-entity.seed.js";
import { readyPayers, type SeedPayer } from "./invoice-payers.seed.js";
import { recordReturns } from "./invoice-returns.seed.js";
import { InvoiceSeedPrerequisiteError } from "./invoice-seed-errors.js";
import { planInvoiceCalendar, type WeekFate } from "./invoice-weeks.seed.js";
import type { SeedContext } from "./order-placing.seed.js";

/**
 * **Des factures sur les sites du groupe des Cimes** — pour voir la page
 * « Mes factures » vivante (`plan-page-mes-factures.md`, §7.1 et §7.2).
 *
 * Tout passe par les gestes réels : règlement au compte, RIB, mandat signé,
 * mode hebdomadaire, commandes datées, émission à la clôture, lots constitués
 * puis déposés, retours, re-présentation, « réglée autrement ». Seules les
 * deux mises en service sont abaissées en base (`invoice-entity.seed.ts`).
 *
 * 🔴 **Une seule fois par poste.** Une facture est immuable et ne se supprime
 * pas : il n'y a pas de remise à zéro. Relancé après coup, le semis le dit et
 * ne touche à rien. Relancé après un échec AVANT la première facture, il
 * efface ses propres commandes (marquées par leur note) et recommence.
 *
 * ⚠️ `seed:sub-accounts` efface les commandes des hôtels pour les reposer :
 * lancé APRÈS ce semis, il laisse des factures dont les bons n'existent plus.
 */

export interface InvoiceSeedContext extends SeedContext {
  readonly config: Pick<AppConfig, "isProduction" | "databaseUrl">;
  /** L'utilisateur de développement à rattacher en administrateur des deux hôtels. */
  readonly devUserId: string;
}

export type InvoiceSeedReport =
  | {
      readonly kind: "already_seeded";
      readonly invoices: number;
      /** Les commandes passées des Cimes retirées par cette relance — le rattrapage. */
      readonly handedOver: number;
    }
  | {
      readonly kind: "seeded";
      readonly weeks: readonly { readonly closesAt: string; readonly fate: WeekFate }[];
      readonly returns: number;
      readonly skippedReturns: readonly string[];
    };

/** Les IBAN factices des trois payeurs — dans l'ordre groupe, Tignes, Val Thorens. */
const PAYER_IBANS = [
  "FR2500000000000000000011200",
  "FR2300000000000000000022100",
  "FR2100000000000000000033000",
] as const;

export async function seedInvoices(context: InvoiceSeedContext): Promise<InvoiceSeedReport> {
  refuseUnlessLocalDevelopment(context.config);
  const { groupId, hotels } = await cimes(context);
  const payerIds = [groupId, ...hotels.values()];
  const existing = await context.prisma.invoice.count({
    where: { payerCompanyId: { in: payerIds } },
  });
  if (existing > 0) {
    await attachDevUser(context, hotels);
    // Le rattrapage : un poste semé avant que les semis ne retirent leurs
    // commandes passées les voit « en cours ». Ni facture ni lot n'est touché.
    const handedOver = await handOverPastOrders(context, payerIds);
    return { kind: "already_seeded", invoices: existing, handedOver };
  }
  const seeded = { companyId: { in: payerIds }, note: INVOICE_SEED_NOTE };
  // Les bons de livraison tiennent leur commande en `Restrict` (plan E1).
  await context.prisma.deliveryNoteLine.deleteMany({ where: { note: { order: seeded } } });
  await context.prisma.deliveryNote.deleteMany({ where: { order: seeded } });
  await context.prisma.order.deleteMany({ where: seeded });
  const calendar = planInvoiceCalendar(context.now);
  const legalEntityId = await readyLegalEntity(context, calendar.modeSetAt);
  const staffId = await accountingStaffId(context);
  await lowerFloors(context, calendar.weeklyFrom);
  const payers: SeedPayer[] = [
    {
      companyId: groupId,
      name: HOTEL_GROUP.raisonSociale,
      legalForm: HOTEL_GROUP.formeJuridique,
      iban: PAYER_IBANS[0],
    },
    ...HOTELS.map((hotel, index) => ({
      companyId: hotels.get(hotel.enseigne) ?? "",
      name: hotel.raisonSociale,
      legalForm: hotel.formeJuridique,
      iban: PAYER_IBANS[index + 1] ?? PAYER_IBANS[0],
    })),
  ];
  await readyPayers(context, payers, { at: calendar.modeSetAt, legalEntityId, staffId });
  const actors = { legalEntityId, staffId, groupId, hotels };
  const played: PlayedWeek[] = [];
  for (const week of calendar.weeks) {
    played.push(await playWeek(context, actors, week));
  }
  const returns = await recordReturns(context, actors, played);
  await attachDevUser(context, hotels);
  return {
    kind: "seeded",
    weeks: calendar.weeks.map((week) => ({
      closesAt: week.closesAt.toISOString(),
      fate: week.fate,
    })),
    returns: returns.recorded,
    skippedReturns: returns.skipped,
  };
}

/** Le groupe et ses hôtels, semés par `seed:sub-accounts`. */
async function cimes(
  context: SeedContext,
): Promise<{ groupId: string; hotels: ReadonlyMap<string, string> }> {
  const names = [HOTEL_GROUP, ...HOTELS].map((client) => client.raisonSociale);
  const rows = await context.prisma.company.findMany({
    where: { raisonSociale: { in: names } },
    select: { id: true, raisonSociale: true },
  });
  const idOf = (raisonSociale: string): string | undefined =>
    rows.find((row) => row.raisonSociale === raisonSociale)?.id;
  const groupId = idOf(HOTEL_GROUP.raisonSociale);
  const hotels = new Map<string, string>();
  for (const hotel of HOTELS) {
    const id = idOf(hotel.raisonSociale);
    if (id !== undefined) {
      hotels.set(hotel.enseigne, id);
    }
  }
  if (groupId === undefined || hotels.size !== HOTELS.length) {
    throw new InvoiceSeedPrerequisiteError(
      "Le groupe des Cimes et ses deux hôtels ne sont pas tous semés",
      "lancer `pnpm --filter lfd-api seed:sub-accounts`",
    );
  }
  return { groupId, hotels };
}

/** L'utilisateur de développement, administrateur des deux sites — même chemin que les gouvernantes. */
async function attachDevUser(
  context: InvoiceSeedContext,
  hotels: ReadonlyMap<string, string>,
): Promise<void> {
  const user = await context.prisma.user.findUnique({
    where: { id: context.devUserId },
    select: { id: true },
  });
  if (user === null) {
    throw new InvoiceSeedPrerequisiteError(
      `L'utilisateur de développement « ${context.devUserId} » n'existe pas`,
      "se connecter une fois à la boutique avec lui",
    );
  }
  for (const companyId of hotels.values()) {
    await ensureAdminMembership(context, user.id, companyId);
  }
}
