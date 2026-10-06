import type { StaffPermission } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffNotifier } from "../../../staff/notifications/domain/ports/staff-notifier.js";
import { DeliveryDayReadinessReader } from "../../domain/ports/delivery-day-readiness.reader.js";
import {
  daysToWatch,
  dueOf,
  isRoundsGap,
  roundsGapWords,
  type LocalNow,
} from "../../domain/services/rounds-gap.js";
import { localNowOf } from "../rounds-gap-support.js";
import {
  RingRoundsGapBellCommand,
  type RoundsGapBellReport,
} from "./ring-rounds-gap-bell.command.js";

/** Ceux qui composent les tournées, comme la cloche du plan arrêté (CA6a). */
const AUDIENCE: StaffPermission = "delivery_rounds:write";
const KIND = "delivery.rounds_gap";

/**
 * La cloche « hors tournée », passée par la machine (le cron de
 * rafraîchissement, comme le tour de l'arrêt du plan du fournil).
 *
 * Elle ne lit que ce que l'écran lit (`DeliveryDayReadinessReader`) et
 * n'écrit que la cloche. Clé d'idempotence `(jour, nombre hors tournée)` : un
 * passage toutes les cinq minutes ne sonne qu'une fois par jour et par compte ;
 * un compte qui change sonne de nouveau.
 *
 * @sans-journal geste machine : aucun fait métier ne change, seule la cloche sonne.
 */
@CommandHandler(RingRoundsGapBellCommand)
export class RingRoundsGapBellHandler implements ICommandHandler<
  RingRoundsGapBellCommand,
  RoundsGapBellReport
> {
  constructor(
    private readonly readiness: DeliveryDayReadinessReader,
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<RoundsGapBellReport> {
    const at = this.clock.now();
    const now = localNowOf(at);
    const alerted: string[] = [];
    for (const day of daysToWatch(now)) {
      if (await this.ringFor(day, now, at)) {
        alerted.push(day);
      }
    }
    return { alerted };
  }

  private async ringFor(day: string, now: LocalNow, at: Date): Promise<boolean> {
    const row = await this.readiness.readinessOf(day);
    const due = dueOf(day, now);
    if (row === null || due === null || !isRoundsGap(row)) {
      return false;
    }
    await this.notifier.notify([
      {
        kind: KIND,
        ...roundsGapWords({ serviceDay: day, due, unplacedCount: row.unplacedCount }),
        link: `/livraison/tournees?jour=${day}`,
        idempotencyKey: `notification:${KIND}:${day}:${String(row.unplacedCount)}`,
        occurredAt: at,
        audience: AUDIENCE,
      },
    ]);
    return true;
  }
}
