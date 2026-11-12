import type { PayerModeSegments } from "../ports/payer-billing-modes.reader.js";
import type { BillingCycle } from "./billing-cycle.js";
import type { ClosureSequence } from "./calendar-cycles.js";
import { lastClosureAtOrBefore } from "./entity-closures.js";
import {
  closureAfter,
  invoicingMomentOf,
  MAX_CLOSURES_PER_PASS,
  previousClosureOf,
  type RhythmTimeline,
} from "./invoicing-closures.js";
import { PayerTimeline, type ModeTimelines } from "./payer-timeline.js";
import {
  BILLING_MODES,
  DEFAULT_BILLING_MODE,
  type BillingMode,
} from "../value-objects/billing-mode.js";

/**
 * **Le calendrier de la facture d'une entité** (plan
 * `plan-rythme-de-facturation.md`, §16.3, lot M2) : les clôtures où au moins
 * un payeur clôt. C'est l'union de la timeline de chaque payeur qui a choisi
 * un mode et de celle du mensuel — la suite de tout payeur qui n'a rien
 * choisi.
 *
 * Il coïncidait avec le `ClosureCalendar` de M1 (union des MODES suivis,
 * retiré en M3) tant que les modes ne changent pas ; il en diffère dans le
 * passé, et c'est voulu : un
 * payeur devenu hebdomadaire au 1er octobre ne fait pas tenter les lundis de
 * septembre (§16.6-6, « pas de tentative un lundi pour une entité sans client
 * hebdomadaire ») — un rattrapage relit l'histoire, pas les modes d'aujourd'hui.
 *
 * Depuis M3, il fait foi aussi pour le LOT, son automatisme et la fiche
 * (`ClosureSequence`) : une seule suite de clôtures pour la facture et pour
 * ce qui l'encaisse.
 *
 * Pur et immuable.
 */
export class InvoicingCalendar implements ClosureSequence {
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

  /**
   * Le calendrier d'une entité où personne n'a choisi de mode : la suite de
   * son mensuel, seule — ce que rend `of(modes, [])`.
   */
  static following(monthly: RhythmTimeline): InvoicingCalendar {
    return new InvoicingCalendar(monthly, new Map());
  }

  /** La suite d'un payeur : la sienne s'il a choisi un mode, le mensuel sinon. */
  timelineOf(payerCompanyId: string): RhythmTimeline {
    return this.payers.get(payerCompanyId) ?? this.byDefault;
  }

  /**
   * Ce payeur clôt-il à `instant` ? — c'est ce qui le fait facturer à cette
   * clôture. Une clôture que son segment ne connaissait pas quand elle est
   * passée (un mode immédiat, daté d'avant son écriture) n'en est pas une.
   */
  closesFor(payerCompanyId: string, instant: Date): boolean {
    const payer = this.payers.get(payerCompanyId);
    return payer === undefined ? closesAt(instant, this.byDefault) : knownClosesAt(instant, payer);
  }

  /** La période d'un payeur close à `closesAt` : `[sa clôture précédente réelle, closesAt[`. */
  payerPeriodOf(payerCompanyId: string, closesAt: Date): BillingCycle {
    return { startsAt: previousClosureOf(closesAt, this.timelineOf(payerCompanyId)), closesAt };
  }

  /**
   * Le début de la période du payeur que le lot clos à `closesAt` encaisse :
   * celle que ferme sa dernière clôture ≤ `closesAt` (M3, `priorOrderCount`).
   * Un bon d'avant est « repris » ; jamais la période du lot, qui peut être
   * la semaine d'un autre payeur.
   */
  payerPeriodStartAt(payerCompanyId: string, closesAtInstant: Date): Date {
    const timeline = this.timelineOf(payerCompanyId);
    return previousClosureOf(lastClosureAtOrBefore(closesAtInstant, timeline), timeline);
  }

  /**
   * Le début de la période du payeur qui CONTIENT `instant` : sa dernière
   * clôture ≤ `instant`. Un bon soldé ce jour-là y lit son moyen (K9).
   */
  payerPeriodStartContaining(payerCompanyId: string, instant: Date): Date {
    return lastClosureAtOrBefore(instant, this.timelineOf(payerCompanyId));
  }

  /** Cet instant est-il la clôture connue d'au moins un payeur (ou du mensuel) ? */
  isClosure(instant: Date): boolean {
    return this.sources().some((source) => knownClosesAt(instant, source));
  }

  /**
   * La période que l'entité affiche pour une clôture : la PLUS LONGUE de
   * celles qui s'y closent — celle du mensuel au 1er, quand un hebdomadaire
   * clôt le même jour. Chaque facture porte, elle, la période de son payeur
   * (`payerPeriodOf`).
   */
  periodOf(closesAtInstant: Date): BillingCycle {
    const starts = this.sources()
      .filter((source) => knownClosesAt(closesAtInstant, source))
      .map((timeline) => previousClosureOf(closesAtInstant, timeline).getTime());
    return { startsAt: new Date(Math.min(...starts)), closesAt: closesAtInstant };
  }

  /**
   * Les modes sous lesquels des payeurs closent à `instant`, dans l'ordre de
   * `BILLING_MODES` (M4c). Le mode d'un payeur est celui de la période que
   * l'instant ferme (en vigueur juste avant lui) : un payeur devenu
   * hebdomadaire au 1er clôt ce 1er en mensuel. Le mensuel y est dès que sa
   * date tombe ici — c'est la suite de quiconque n'a rien choisi, et le
   * calendrier ne sait pas s'il en reste (`isClosure` raisonne de même).
   */
  modesClosingAt(instant: Date): readonly BillingMode[] {
    const before = new Date(instant.getTime() - 1);
    const modes = new Set<BillingMode>();
    if (closesAt(instant, this.byDefault)) {
      modes.add(DEFAULT_BILLING_MODE);
    }
    for (const payer of this.payers.values()) {
      if (knownClosesAt(instant, payer)) {
        modes.add(payer.modeAt(before).mode);
      }
    }
    return BILLING_MODES.filter((mode) => modes.has(mode));
  }

  /**
   * Le mode sous lequel ce payeur a clos la période fermée à `closesAt` —
   * celui en vigueur juste avant (un payeur devenu hebdomadaire au 1er a
   * clos ce 1er en mensuel). Sans choix, le mensuel.
   */
  payerModeClosingAt(payerCompanyId: string, closesAtInstant: Date): BillingMode {
    const timeline = this.payers.get(payerCompanyId);
    return timeline === undefined
      ? DEFAULT_BILLING_MODE
      : timeline.modeAt(new Date(closesAtInstant.getTime() - 1)).mode;
  }

  /**
   * La période du calendrier que ferme `closesAtInstant` : de la clôture
   * précédente du calendrier (de n'importe quel payeur) à elle — le cycle de
   * son lot (§16.10), « du 1er au 4 octobre » quand un hebdomadaire clôt le 5.
   */
  cycleClosedAt(closesAtInstant: Date): BillingCycle {
    return { startsAt: this.closureBefore(closesAtInstant), closesAt: closesAtInstant };
  }

  /** La prochaine clôture du calendrier, strictement après `instant`. */
  closureAfter(instant: Date): Date {
    return new Date(
      Math.min(...this.sources().map((source) => knownClosureAfter(instant, source).getTime())),
    );
  }

  /** La dernière clôture du calendrier strictement avant `instant`. */
  closureBefore(instant: Date): Date {
    return this.lastClosureAtOrBefore(new Date(instant.getTime() - 1));
  }

  /** La dernière clôture du calendrier atteinte à `now` (≤ `now`). */
  lastClosureAtOrBefore(now: Date): Date {
    return new Date(
      Math.max(...this.sources().map((source) => knownClosureAtOrBefore(now, source).getTime())),
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

  /**
   * Les suites que l'entité unit : le mensuel, puis chaque payeur. Les
   * méthodes de l'entité n'y lisent que les clôtures CONNUES (§3.1 du plan
   * `plan-changement-de-mode-immediat.md`) : un lundi passé ne devient
   * jamais, après coup, une clôture à tenter ou manquée.
   */
  private sources(): readonly ClosureSource[] {
    return [this.byDefault, ...this.payers.values()];
  }
}

/** Une suite de l'entité : le mensuel (toujours connu) ou un payeur. */
type ClosureSource = RhythmTimeline | PayerTimeline;

function isKnown(instant: Date, source: ClosureSource): boolean {
  return !(source instanceof PayerTimeline) || source.isKnownClosure(instant);
}

function closesAt(instant: Date, timeline: RhythmTimeline): boolean {
  return closureAfter(new Date(instant.getTime() - 1), timeline).getTime() === instant.getTime();
}

function knownClosesAt(instant: Date, source: ClosureSource): boolean {
  return closesAt(instant, source) && isKnown(instant, source);
}

/**
 * La prochaine clôture connue strictement après `instant`. Finie : une
 * clôture postérieure à l'écriture de tous les segments est connue.
 */
function knownClosureAfter(instant: Date, source: ClosureSource): Date {
  let cursor = closureAfter(instant, source);
  while (!isKnown(cursor, source)) {
    cursor = closureAfter(cursor, source);
  }
  return cursor;
}

/**
 * La dernière clôture connue ≤ `now`. Finie : avant son premier segment, un
 * payeur suit le mensuel par défaut, toujours connu.
 */
function knownClosureAtOrBefore(now: Date, source: ClosureSource): Date {
  let cursor = lastClosureAtOrBefore(now, source);
  while (!isKnown(cursor, source)) {
    cursor = previousClosureOf(cursor, source);
  }
  return cursor;
}
