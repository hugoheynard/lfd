import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { SELLER_FACTS } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import { InvoicingNotYetOpenError } from "../../../domain/errors/monthly-invoice-errors.js";
import { AutomaticMonthlyInvoicer } from "../../../domain/ports/automatic-monthly-invoicer.js";
import {
  InvoiceAutopilotRuns,
  type SettledInvoiceAutopilotOutcome,
} from "../../../domain/ports/invoice-autopilot-runs.js";
import { MAX_CLOSURES_PER_PASS } from "../../../domain/services/invoicing-closures.js";
import type { MonthlyInvoiceReport } from "../../../domain/services/monthly-invoice-report.js";
import { RunInvoiceAutopilotHandler } from "../run-invoice-autopilot.handler.js";
import type { PayerModeSegments } from "../../../domain/ports/payer-billing-modes.reader.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import {
  FixedFloor,
  FixedIssuers,
  FixedModeDates,
  FixedPayerModes,
} from "./monthly-invoice-doubles.js";

/**
 * Le passage automatique de la facture par période (E4, par clôture depuis
 * R3). L'horloge est fixe et posée par rapport aux clôtures : le 30 septembre
 * 2026 à 23h55, heure de Paris (E4b), sauf mention.
 */

const AT_MOMENT = new Date("2026-09-30T21:55:00.000Z");
const ENTITY = SELLER_FACTS.legalEntityId;
/** Les 1er à 00h00, heure de Paris. */
const SEP_1 = "2026-08-31T22:00:00.000Z";
const OCT_1 = "2026-09-30T22:00:00.000Z";
const NOV_1 = "2026-10-31T23:00:00.000Z";
const DEC_1 = "2026-11-30T23:00:00.000Z";
/** Un payeur hebdomadaire au lundi depuis le 1er août 2026 (une clôture du mensuel). */
const WEEKLY: PayerModeSegments = {
  payerCompanyId: "c_port",
  segments: [{ effectiveFrom: paris("2026-08-01"), mode: "weekly" }],
};

class MemoryRuns extends InvoiceAutopilotRuns {
  readonly rows = new Map<string, { outcome: string; message: string | null }>();
  attempted(legalEntityId: string, periodClosesAt: Date): Promise<boolean> {
    return Promise.resolve(this.rows.has(`${legalEntityId}:${periodClosesAt.toISOString()}`));
  }
  lastAttempted(legalEntityId: string): Promise<Date | null> {
    const closures = [...this.rows.keys()]
      .filter((key) => key.startsWith(`${legalEntityId}:`))
      .map((key) => key.slice(legalEntityId.length + 1))
      .sort();
    const last = closures.at(-1);
    return Promise.resolve(last === undefined ? null : new Date(last));
  }
  claim(legalEntityId: string, periodClosesAt: Date): Promise<boolean> {
    const key = `${legalEntityId}:${periodClosesAt.toISOString()}`;
    if (this.rows.has(key)) {
      return Promise.resolve(false);
    }
    this.rows.set(key, { outcome: "pending", message: null });
    return Promise.resolve(true);
  }
  settle(
    legalEntityId: string,
    periodClosesAt: Date,
    outcome: SettledInvoiceAutopilotOutcome,
    message: string | null,
  ): Promise<void> {
    this.rows.set(`${legalEntityId}:${periodClosesAt.toISOString()}`, { outcome, message });
    return Promise.resolve();
  }
}

class ScriptedInvoicer extends AutomaticMonthlyInvoicer {
  readonly calls: string[] = [];
  constructor(private readonly answer: () => MonthlyInvoiceReport) {
    super();
  }
  issue(legalEntityId: string, periodClosesAt: Date): Promise<MonthlyInvoiceReport> {
    this.calls.push(`${legalEntityId}:${periodClosesAt.toISOString()}`);
    return Promise.resolve().then(this.answer);
  }
}

const ISSUED: MonthlyInvoiceReport = {
  periodClosesAt: OCT_1,
  periodStartsAt: SEP_1,
  periodLabel: "du 1er au 30 septembre 2026",
  issued: [{ payerCompanyId: "c_port", number: "FA-LFD-2026-000001", issuedOn: "2026-09-30" }],
  blocked: [{ payerCompanyId: "c_quai", message: "SIREN manquant" }],
  alreadyInvoiced: 0,
  unbillableOrders: 0,
};

interface Calendar {
  /** Les payeurs qui ont choisi un mode ; aucun : tous mensuels au 1er. */
  readonly payers?: readonly PayerModeSegments[];
  /** Le plancher ; absent : aucun rattrapage depuis lui. */
  readonly floor?: Date | null;
}

function harness(answer: () => MonthlyInvoiceReport, at = AT_MOMENT, calendar: Calendar = {}) {
  const runs = new MemoryRuns();
  const invoicer = new ScriptedInvoicer(answer);
  const events = new RecordingPublisher();
  const handler = new RunInvoiceAutopilotHandler(
    new FixedIssuers([SELLER_FACTS]),
    new FixedModeDates(),
    new FixedPayerModes(calendar.payers),
    new FixedFloor(calendar.floor ?? null),
    runs,
    invoicer,
    events,
    new FixedClock(at),
    new DirectUnitOfWork(),
  );
  return { runs, invoicer, events, handler };
}

describe("RunInvoiceAutopilot — une tentative par (entité, clôture)", () => {
  it("le dernier jour à 23h55 : émet le mois, range l'issue et les signalés", async () => {
    const h = harness(() => ISSUED);

    const report = await h.handler.execute();

    expect(report.runs).toEqual([
      { legalEntityId: ENTITY, periodClosesAt: OCT_1, outcome: "issued" },
    ]);
    expect(h.runs.rows.get(`${ENTITY}:${OCT_1}`)).toEqual({
      outcome: "issued",
      message: "1 payeur(s) signalé(s)",
    });
  });

  it("journalise `invoice.autopilot_ran` : l'entité, le mois, l'issue et les deux nombres", async () => {
    const h = harness(() => ISSUED);

    await h.handler.execute();

    expect(h.events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "invoice.autopilot_ran",
        subjectType: "legal_entity",
        subjectId: ENTITY,
        occurredAt: AT_MOMENT,
        payload: {
          subjectLabel: SELLER_FACTS.name,
          month: "2026-09",
          periodClosesAt: "2026-09-30T22:00:00.000Z",
          periodLabel: "du 1er au 30 septembre 2026",
          outcome: "issued",
          issuedCount: 1,
          signalledCount: 1,
          message: "1 payeur(s) signalé(s)",
        },
      },
    ]);
  });

  it("un échec est journalisé aussi, à zéro facture — et un mois déjà tenté ne l'est plus", async () => {
    const h = harness(() => {
      throw new Error("base indisponible");
    });

    await h.handler.execute();
    await h.handler.execute();

    const facts = h.events.traced.map((event) => event.journalFact());
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({
      outcome: "failed",
      issuedCount: 0,
      signalledCount: 0,
      message: "base indisponible",
    });
  });

  it("un second passage du même mois se tait — le bouton reste le geste de reprise", async () => {
    const h = harness(() => ISSUED);
    await h.handler.execute();

    expect((await h.handler.execute()).runs).toEqual([]);
    expect(h.invoicer.calls).toHaveLength(1);
  });

  it("avant 23h55, c'est le mois précédent qu'il regarde", async () => {
    const h = harness(() => ISSUED, new Date("2026-09-30T19:00:00.000Z"));

    await h.handler.execute();

    expect(h.invoicer.calls).toEqual([`${ENTITY}:${SEP_1}`]);
  });

  /**
   * Régression E4b : le passage horaire `15 *` tombait à 23h15 le dernier
   * jour, et à 22h15 il émettait ; depuis 23h55 il ne doit plus rien émettre
   * du mois avant cette heure-là.
   */
  it("le passage horaire de 23h15 le dernier jour n'émet pas le mois courant", async () => {
    const h = harness(() => ISSUED, new Date("2026-09-30T21:15:00.000Z"));

    await h.handler.execute();

    expect(h.invoicer.calls).toEqual([`${ENTITY}:${SEP_1}`]);
  });

  it("le cron de 23h55 l'hiver (22h55 UTC) émet février ; son jumeau de 21h55 UTC (22h55 à Paris) regarde encore janvier", async () => {
    const winter = harness(() => ISSUED, new Date("2027-02-28T22:55:00.000Z"));
    await winter.handler.execute();
    expect(winter.invoicer.calls).toEqual([`${ENTITY}:2027-02-28T23:00:00.000Z`]);

    const early = harness(() => ISSUED, new Date("2027-02-28T21:55:00.000Z"));
    await early.handler.execute();
    expect(early.invoicer.calls).toEqual([`${ENTITY}:2027-01-31T23:00:00.000Z`]);
  });

  it("pas encore en service : `not_yet_open` ; autre refus : `failed` avec son message", async () => {
    const closed = harness(() => {
      throw new InvoicingNotYetOpenError("du 1er au 30 septembre 2026", new Date(NOV_1));
    });
    expect((await closed.handler.execute()).runs[0]?.outcome).toBe("not_yet_open");

    const broken = harness(() => {
      throw new Error("base indisponible");
    });
    await broken.handler.execute();
    expect(broken.runs.rows.get(`${ENTITY}:${OCT_1}`)).toEqual({
      outcome: "failed",
      message: "base indisponible",
    });
  });

  it("rien à facturer : rangé `nothing_to_invoice`, pas une erreur", async () => {
    const h = harness(() => ({ ...ISSUED, issued: [], blocked: [] }));

    await h.handler.execute();

    expect(h.runs.rows.get(`${ENTITY}:${OCT_1}`)?.outcome).toBe("nothing_to_invoice");
  });

  it("rattrape TOUTES les clôtures manquées depuis le plancher, de la plus ancienne à la plus récente", async () => {
    // Le 1er décembre 2026 à 9h à Paris : octobre, novembre et décembre n'ont jamais été tentés.
    const h = harness(() => ISSUED, new Date("2026-12-01T08:00:00.000Z"), {
      floor: new Date(SEP_1),
    });

    const report = await h.handler.execute();

    expect(h.invoicer.calls).toEqual([
      `${ENTITY}:${OCT_1}`,
      `${ENTITY}:${NOV_1}`,
      `${ENTITY}:${DEC_1}`,
    ]);
    expect(report.runs.map((run) => run.periodClosesAt)).toEqual([OCT_1, NOV_1, DEC_1]);
    // Le journal lit encore le mois où la période s'achève.
    expect(h.events.traced.map((event) => event.journalFact().payload["month"])).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
  });

  it("le rattrapage repart de la dernière clôture tentée, jamais d'avant", async () => {
    const h = harness(() => ISSUED, new Date("2026-12-01T08:00:00.000Z"), {
      floor: new Date(SEP_1),
    });
    h.runs.rows.set(`${ENTITY}:${NOV_1}`, { outcome: "issued", message: null });

    await h.handler.execute();

    expect(h.invoicer.calls).toEqual([`${ENTITY}:${DEC_1}`]);
  });

  it("hebdomadaire au lundi : le dimanche à 23h55, la semaine se facture", async () => {
    const weekly = { payers: [WEEKLY] };
    // Le dimanche 27 septembre 2026 à 23h55 à Paris ; la clôture est le lundi 28 à 00h00.
    const h = harness(() => ISSUED, new Date("2026-09-27T21:55:00.000Z"), weekly);

    await h.handler.execute();

    expect(h.invoicer.calls).toEqual([`${ENTITY}:2026-09-27T22:00:00.000Z`]);
  });

  it("hebdomadaire : le lundi matin, les semaines manquées depuis le plancher sont rattrapées", async () => {
    const h = harness(() => ISSUED, new Date("2026-09-28T08:00:00.000Z"), {
      payers: [WEEKLY],
      // Le lundi 14 septembre à 00h00 à Paris.
      floor: new Date("2026-09-13T22:00:00.000Z"),
    });

    await h.handler.execute();

    expect(h.invoicer.calls).toEqual([
      `${ENTITY}:2026-09-20T22:00:00.000Z`,
      `${ENTITY}:2026-09-27T22:00:00.000Z`,
    ]);
  });

  it("hebdomadaire, passage à l'heure d'hiver : le cron de 22h55 UTC émet, son jumeau de 21h55 UTC se tait", async () => {
    const weekly = { payers: [WEEKLY] };
    // Le dimanche 25 octobre 2026, jour du passage : 23h55 à Paris = 22h55 UTC.
    const late = harness(() => ISSUED, new Date("2026-10-25T22:55:00.000Z"), weekly);
    await late.handler.execute();
    expect(late.invoicer.calls).toEqual([`${ENTITY}:2026-10-25T23:00:00.000Z`]);

    const early = harness(() => ISSUED, new Date("2026-10-25T21:55:00.000Z"), weekly);
    await early.handler.execute();
    expect(early.invoicer.calls).toEqual([`${ENTITY}:2026-10-18T22:00:00.000Z`]);
  });

  it("rythmes mêlés : les lundis de l'hebdomadaire et le 1er du mensuel, dans l'ordre", async () => {
    // Le samedi 3 octobre 2026, 10h à Paris ; dernière tentée : le lundi 21 septembre.
    const h = harness(() => ISSUED, new Date("2026-10-03T08:00:00.000Z"), { payers: [WEEKLY] });
    h.runs.rows.set(`${ENTITY}:2026-09-20T22:00:00.000Z`, { outcome: "issued", message: null });

    await h.handler.execute();

    expect(h.invoicer.calls).toEqual([`${ENTITY}:2026-09-27T22:00:00.000Z`, `${ENTITY}:${OCT_1}`]);
  });

  it("sans payeur hebdomadaire, aucun lundi n'est tenté", async () => {
    const h = harness(() => ISSUED, new Date("2026-10-03T08:00:00.000Z"), {
      floor: new Date(SEP_1),
    });

    await h.handler.execute();

    expect(h.invoicer.calls).toEqual([`${ENTITY}:${OCT_1}`]);
  });

  it("un payeur devenu hebdomadaire au 1er octobre ne fait pas tenter les lundis de septembre", async () => {
    const h = harness(() => ISSUED, new Date("2026-10-12T08:00:00.000Z"), {
      payers: [
        {
          payerCompanyId: "c_port",
          segments: [{ effectiveFrom: new Date(OCT_1), mode: "weekly" }],
        },
      ],
      floor: new Date(SEP_1),
    });

    await h.handler.execute();

    // Le 1er octobre (mensuel), puis les lundis 5 et 12 octobre (hebdomadaire).
    expect(h.invoicer.calls).toEqual([
      `${ENTITY}:${OCT_1}`,
      `${ENTITY}:2026-10-04T22:00:00.000Z`,
      `${ENTITY}:2026-10-11T22:00:00.000Z`,
    ]);
  });

  it("un plancher très ancien ne lance pas plus de MAX_CLOSURES_PER_PASS tentatives d'un coup", async () => {
    const h = harness(() => ISSUED, new Date("2026-09-28T08:00:00.000Z"), {
      // Hebdomadaire depuis le 1er décembre 2025, bien avant le plancher.
      payers: [
        {
          payerCompanyId: "c_port",
          segments: [{ effectiveFrom: paris("2025-12-01"), mode: "weekly" }],
        },
      ],
      // Le lundi 5 janvier 2026 à 00h00 à Paris.
      floor: new Date("2026-01-04T23:00:00.000Z"),
    });

    await h.handler.execute();

    expect(h.invoicer.calls).toHaveLength(MAX_CLOSURES_PER_PASS);
    expect(h.invoicer.calls[0]).toBe(`${ENTITY}:2026-01-11T23:00:00.000Z`);
  });
});
