import { FollowParentCommand } from "../../b2b/account/application/commands/follow-parent.command.js";
import { StopFollowingParentCommand } from "../../b2b/account/application/commands/stop-following-parent.command.js";
import { ConstituteCollectionBatchesCommand } from "../../b2b/accounting/application/commands/constitute-collection-batches.command.js";
import { DepositCollectionBatchCommand } from "../../b2b/accounting/application/commands/deposit-collection-batch.command.js";
import { RecordCollectionBatchDownloadCommand } from "../../b2b/accounting/application/commands/record-collection-batch-download.command.js";
import { IssueMonthlyInvoicesCommand } from "../../b2b/accounting/application/commands/issue-monthly-invoices.command.js";
import { invoicingMomentOf } from "../../b2b/accounting/domain/services/invoicing-closures.js";
import { handOverAtCounter } from "./invoice-handovers.seed.js";
import { DEPOSIT_DELAY_MS, orderInstantOf, type InvoiceWeek } from "./invoice-weeks.seed.js";
import {
  asStaff,
  isoDay,
  place,
  type SeedContext,
  type SeedLine,
  shiftDays,
  targetOf,
} from "./order-placing.seed.js";

/**
 * **Une semaine du scénario, telle que la comptabilité la vit** : les hôtels
 * commandent le jeudi, la facture de la semaine sort la veille de la clôture
 * à 23 h 55, le lot se constitue deux heures après la clôture, et se dépose
 * une heure plus tard. Chaque geste par sa commande, au `Clock` de son
 * instant (`asStaff`, `place`).
 *
 * La semaine « groupe » : les deux hôtels suivent la facturation du groupe du
 * lundi jusqu'au dépôt du lot — leurs bons de la semaine sont facturés AU
 * PRINCIPAL, et chaque site voit cette pièce dans « Mes factures » (Q-C,
 * plan §7.2).
 */

export interface CycleActors {
  readonly legalEntityId: string;
  readonly staffId: string;
  readonly groupId: string;
  /** Les hôtels par enseigne. */
  readonly hotels: ReadonlyMap<string, string>;
}

/** Ce qu'une semaine a laissé : ses lots, pour les retours de la seconde passe. */
export interface PlayedWeek {
  readonly week: InvoiceWeek;
  readonly batchIds: readonly string[];
}

/** La marque des commandes du semis : c'est par elle qu'une relance les retrouve. */
export const INVOICE_SEED_NOTE = "Semis « Mes factures »";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const CONSTITUTION_DELAY_MS = 2 * HOUR_MS;
/** Le créneau pro du Labo — cf. `sub-account-orders.seed.ts`. */
const PICKUP_WINDOW = { start: "05:30", end: "06:30" } as const;
/** Un petit-déjeuner d'hôtel : deux taux de TVA par facture. */
const HOTEL_BREAKFAST: readonly SeedLine[] = [
  { sku: "VIE-001", quantity: 60 },
  { sku: "VIE-002", quantity: 20 },
  { sku: "PAI-001", quantity: 12 },
  { sku: "CHO-007", quantity: 1 },
];

export async function playWeek(
  context: SeedContext,
  actors: CycleActors,
  week: InvoiceWeek,
): Promise<PlayedWeek> {
  const group = week.fate === "group";
  if (group) {
    const from = new Date(week.opensAt.getTime() + HOUR_MS);
    await followGroupBilling(context, actors, from, FollowParentCommand);
  }
  for (const [name, companyId] of actors.hotels) {
    await placeWeekOrder(context, companyId, name, week.closesAt);
  }
  await issueWeek(context, actors.legalEntityId, week.closesAt);
  const batchIds = week.fate === "issued" ? [] : await collectWeek(context, actors, week);
  if (group) {
    // APRÈS le dépôt : le principal n'est jamais débité pour un site qui ne
    // le suit plus au jour du lot (`payer_detached`, sous-comptes §2.1 quater).
    const until = new Date(week.closesAt.getTime() + DEPOSIT_DELAY_MS + HOUR_MS);
    await followGroupBilling(context, actors, until, StopFollowingParentCommand);
  }
  return { week, batchIds };
}

/** Le lot de la semaine, constitué puis — sauf la semaine « constituée » — déposé. */
async function collectWeek(
  context: SeedContext,
  actors: CycleActors,
  week: InvoiceWeek,
): Promise<readonly string[]> {
  const batchIds = await constituteWeek(context, actors, week.closesAt);
  if (week.fate === "constituted") {
    return batchIds;
  }
  const at = new Date(week.closesAt.getTime() + DEPOSIT_DELAY_MS);
  for (const batchId of batchIds) {
    // « J'ai déposé » exige le fichier téléchargé (2026-10-23) : le semis fait le geste.
    await asStaff(at, () =>
      context.commands.execute(new RecordCollectionBatchDownloadCommand(batchId, actors.staffId)),
    );
    await asStaff(at, () =>
      context.commands.execute(new DepositCollectionBatchCommand(batchId, actors.staffId)),
    );
  }
  return batchIds;
}

async function followGroupBilling(
  context: SeedContext,
  actors: CycleActors,
  at: Date,
  Gesture: typeof FollowParentCommand | typeof StopFollowingParentCommand,
): Promise<void> {
  for (const companyId of actors.hotels.values()) {
    await asStaff(at, () => context.commands.execute(new Gesture(companyId, "billing")));
  }
  await context.settle();
}

async function placeWeekOrder(
  context: SeedContext,
  companyId: string,
  name: string,
  closesAt: Date,
): Promise<void> {
  const at = orderInstantOf(closesAt);
  const target = await targetOf(context, companyId, name);
  const forDay = isoDay(shiftDays(at, 1));
  const placed = await place(context, target, {
    at,
    forDay,
    method: "pickup",
    point: null,
    window: PICKUP_WINDOW,
    lines: HOTEL_BREAKFAST,
    paid: false,
    note: INVOICE_SEED_NOTE,
  });
  // Retirée le vendredi, avant la facture du dimanche : une commande facturée
  // a vécu sa vie jusqu'au bout (`invoice-handovers.seed.ts`).
  await handOverAtCounter(context, placed.reference, forDay);
}

/** La facture de la semaine, deux minutes après qu'elle est devenue émettable. */
async function issueWeek(context: SeedContext, legalEntityId: string, closesAt: Date) {
  const at = new Date(invoicingMomentOf(closesAt).getTime() + 2 * MINUTE_MS);
  await asStaff(at, () =>
    context.commands.execute(
      new IssueMonthlyInvoicesCommand(legalEntityId, closesAt.toISOString()),
    ),
  );
  await context.settle();
}

async function constituteWeek(
  context: SeedContext,
  actors: CycleActors,
  closesAt: Date,
): Promise<readonly string[]> {
  const at = new Date(closesAt.getTime() + CONSTITUTION_DELAY_MS);
  const batchIds = await asStaff(at, () =>
    context.commands.execute<ConstituteCollectionBatchesCommand, readonly string[]>(
      new ConstituteCollectionBatchesCommand(actors.legalEntityId, {
        kind: "staff",
        staffId: actors.staffId,
      }),
    ),
  );
  // Les avis de prélèvement partent par la boîte d'envoi : le dépôt les exige
  // tous `sent`.
  await context.settle();
  return batchIds;
}
