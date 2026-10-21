import { RecordCollectionReturnCommand } from "../../b2b/accounting/application/commands/record-collection-return.command.js";
import { RepresentCollectionReturnCommand } from "../../b2b/accounting/application/commands/represent-collection-return.command.js";
import { SettleCollectionReturnCommand } from "../../b2b/accounting/application/commands/settle-collection-return.command.js";
import type { CycleActors, PlayedWeek } from "./invoice-cycles.seed.js";
import { InvoiceSeedStepError } from "./invoice-seed-errors.js";
import type { WeekFate } from "./invoice-weeks.seed.js";
import { asStaff, type SeedContext } from "./order-placing.seed.js";

/**
 * **Les retours bancaires, saisis aujourd'hui** — la seconde passe du semis.
 *
 * Tous après la dernière constitution, et c'est voulu : une re-présentation
 * saisie avant un lot suivant y entrerait (elle cesserait d'être « Nouveau
 * prélèvement prévu »), et un rejet en attente pourrait écarter les bons des
 * semaines d'après. Un relevé de rejets importé avec retard est exactement ce
 * que la comptabilité vit.
 *
 * Un retour porte sur la LIGNE du payeur dans le lot — toutes ses factures de
 * la semaine. Il est daté du lendemain de l'échéance demandée ; une échéance
 * pas encore passée n'a pas de retour possible, la semaine reste « Prélevée »
 * et le compte rendu le dit.
 */

/** AM04 — provision insuffisante : le motif de rejet le plus courant. */
const REJECT_REASON = "AM04";
const SETTLE_NOTE = "Virement reçu après le rejet (semis)";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReturnsReport {
  readonly recorded: number;
  /** Les semaines dont l'échéance n'est pas passée : aucun retour possible. */
  readonly skipped: readonly string[];
}

export async function recordReturns(
  context: SeedContext,
  actors: CycleActors,
  played: readonly PlayedWeek[],
): Promise<ReturnsReport> {
  const hotelIds = [...actors.hotels.values()];
  let recorded = 0;
  const skipped: string[] = [];
  for (const { week, batchIds } of played) {
    const fate = returnFateOf(week.fate);
    if (fate === null) {
      continue;
    }
    const lines = await context.prisma.collectionBatchLine.findMany({
      where: { batchId: { in: [...batchIds] }, debtorCompanyId: { in: hotelIds } },
      select: { batchId: true, rank: true, endToEndId: true, batch: true },
    });
    for (const line of lines) {
      const returnedOn = dayAfter(line.batch.requestedCollectionDay);
      if (returnedOn === null || returnedOn > isoUtcDay(context.now)) {
        skipped.push(week.closesAt.toISOString());
        continue;
      }
      await asStaff(context.now, async () => {
        await context.commands.execute(
          new RecordCollectionReturnCommand(
            line.batchId,
            line.rank,
            "reject",
            REJECT_REASON,
            null,
            returnedOn,
            null,
            actors.staffId,
          ),
        );
        await resolve(context, actors.staffId, line.endToEndId, fate);
      });
      recorded += 1;
    }
  }
  await context.settle();
  return { recorded, skipped };
}

async function resolve(
  context: SeedContext,
  staffId: string,
  endToEndId: string,
  fate: ReturnFate,
): Promise<void> {
  if (fate === "rejected") {
    return;
  }
  const row = await context.prisma.collectionReturn.findUnique({
    where: { endToEndId },
    select: { id: true },
  });
  if (row === null) {
    throw new InvoiceSeedStepError(`le retour de la ligne ${endToEndId} n'a pas été enregistré`);
  }
  await context.commands.execute(
    fate === "settled"
      ? new SettleCollectionReturnCommand(row.id, SETTLE_NOTE, staffId)
      : new RepresentCollectionReturnCommand(row.id, staffId),
  );
}

type ReturnFate = Extract<WeekFate, "settled" | "represented" | "rejected">;

function returnFateOf(fate: WeekFate): ReturnFate | null {
  return fate === "settled" || fate === "represented" || fate === "rejected" ? fate : null;
}

/** Le lendemain d'un jour `@db.Date` (minuit UTC), en `AAAA-MM-JJ`. */
function dayAfter(day: Date | null): string | null {
  return day === null ? null : isoUtcDay(new Date(day.getTime() + DAY_MS));
}

function isoUtcDay(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}
