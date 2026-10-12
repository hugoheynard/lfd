import type { PayerModeSegments } from "../ports/payer-billing-modes.reader.js";
import type { BillingCycle } from "./billing-cycle.js";
import { lastClosureAtOrBefore } from "./entity-closures.js";
import {
  closureAfter,
  invoicingMomentOf,
  MAX_CLOSURES_PER_PASS,
  previousClosureOf,
  type RhythmTimeline,
} from "./invoicing-closures.js";
import { PayerTimeline, type ModeTimelines } from "./payer-timeline.js";

/**
 * **Le calendrier de la facture d'une entité** (plan
 * `plan-rythme-de-facturation.md`, §16.3, lot M2) : les clôtures où au moins
 * un payeur clôt. C'est l'union de la timeline de chaque payeur qui a choisi
 * un mode et de celle du mensuel — la suite de tout payeur qui n'a rien
 * choisi.
 *
 * Il coïncide avec `ClosureCalendar` (union des MODES suivis) tant que les
 * modes ne changent pas ; il en diffère dans le passé, et c'est voulu : un
 * payeur devenu hebdomadaire au 1er octobre ne fait pas tenter les lundis de
 * septembre (§16.6-6, « pas de tentative un lundi pour une entité sans client
 * hebdomadaire ») — un rattrapage relit l'histoire, pas les modes d'aujourd'hui.
 *
 * Pur et immuable.
 */
export class InvoicingCalendar {
  private constructor(
    private readonly byDefault: RhythmTimeline,
    private readonly payers: ReadonlyMap<string, PayerTimeline>,
  ) {}

  static of(modes: ModeTimelines, payers: readonly PayerModeSegments[]): InvoicingCalendar {
    return new InvoicingCalendar(
      modes.monthly,
      new Map(
        payers.map((payer) => [payer.payerCompanyId, PayerTimeline.of(payer.segments, modes)]),
      ),
    );
  }

  /** La suite d'un payeur : la sienne s'il a choisi un mode, le mensuel sinon. */
  timelineOf(payerCompanyId: string): RhythmTimeline {
    return this.payers.get(payerCompanyId) ?? this.byDefault;
  }

  /** Ce payeur clôt-il à `instant` ? — c'est ce qui le fait facturer à cette clôture. */
  closesFor(payerCompanyId: string, instant: Date): boolean {
    return closesAt(instant, this.timelineOf(payerCompanyId));
  }

  /** La période d'un payeur close à `closesAt` : `[sa clôture précédente réelle, closesAt[`. */
  payerPeriodOf(payerCompanyId: string, closesAt: Date): BillingCycle {
    return { startsAt: previousClosureOf(closesAt, this.timelineOf(payerCompanyId)), closesAt };
  }

  /** Cet instant est-il la clôture d'au moins un payeur (ou du mensuel) ? */
  isClosure(instant: Date): boolean {
    return this.timelines().some((timeline) => closesAt(instant, timeline));
  }

  /**
   * La période que l'entité affiche pour une clôture : la PLUS LONGUE de
   * celles qui s'y closent — celle du mensuel au 1er, quand un hebdomadaire
   * clôt le même jour. Chaque facture porte, elle, la période de son payeur
   * (`payerPeriodOf`).
   */
  periodOf(closesAtInstant: Date): BillingCycle {
    const starts = this.timelines()
      .filter((timeline) => closesAt(closesAtInstant, timeline))
      .map((timeline) => previousClosureOf(closesAtInstant, timeline).getTime());
    return { startsAt: new Date(Math.min(...starts)), closesAt: closesAtInstant };
  }

  /** La prochaine clôture du calendrier, strictement après `instant`. */
  closureAfter(instant: Date): Date {
    return new Date(
      Math.min(...this.timelines().map((timeline) => closureAfter(instant, timeline).getTime())),
    );
  }

  /** La dernière clôture du calendrier atteinte à `now` (≤ `now`). */
  lastClosureAtOrBefore(now: Date): Date {
    return new Date(
      Math.max(
        ...this.timelines().map((timeline) => lastClosureAtOrBefore(now, timeline).getTime()),
      ),
    );
  }

  /**
   * **La clôture dont on émet les factures à `now`** : la dernière dont la
   * veille à 23h55 est passée (`closureToInvoice` de R3, sur le calendrier).
   */
  closureToInvoice(now: Date): Date {
    const upcoming = this.closureAfter(now);
    return invoicingMomentOf(upcoming).getTime() <= now.getTime()
      ? upcoming
      : this.lastClosureAtOrBefore(new Date(upcoming.getTime() - 1));
  }

  /**
   * Les clôtures à tenter à `now`, la plus ancienne d'abord (`closuresToAttempt`
   * de R3, sur le calendrier) : celles qui suivent `after` jusqu'à la clôture à
   * facturer incluse ; sans `after`, ou s'il ne la précède pas, la seule
   * clôture à facturer. Au plus {@link MAX_CLOSURES_PER_PASS}.
   */
  closuresToAttempt(now: Date, after: Date | null): readonly Date[] {
    const current = this.closureToInvoice(now);
    if (after === null || after.getTime() >= current.getTime()) {
      return [current];
    }
    const closures: Date[] = [];
    let cursor = this.closureAfter(after);
    while (cursor.getTime() <= current.getTime() && closures.length < MAX_CLOSURES_PER_PASS) {
      closures.push(cursor);
      cursor = this.closureAfter(cursor);
    }
    return closures;
  }

  private timelines(): readonly RhythmTimeline[] {
    return [this.byDefault, ...this.payers.values()];
  }
}

function closesAt(instant: Date, timeline: RhythmTimeline): boolean {
  return closureAfter(new Date(instant.getTime() - 1), timeline).getTime() === instant.getTime();
}
