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
import type { MonthlyInvoiceReport } from "../../../domain/services/monthly-invoice-report.js";
import { RunInvoiceAutopilotHandler } from "../run-invoice-autopilot.handler.js";
import { FixedIssuers } from "./monthly-invoice-doubles.js";

/**
 * Le passage automatique de la facture du mois (E4). L'horloge est fixe et
 * posée par rapport au mois : le 30 septembre 2026 à 23h55, heure de Paris (E4b).
 */

const AT_MOMENT = new Date("2026-09-30T21:55:00.000Z");
const ENTITY = SELLER_FACTS.legalEntityId;

class MemoryRuns extends InvoiceAutopilotRuns {
  readonly rows = new Map<string, { outcome: string; message: string | null }>();
  attempted(legalEntityId: string, month: string): Promise<boolean> {
    return Promise.resolve(this.rows.has(`${legalEntityId}:${month}`));
  }
  claim(legalEntityId: string, month: string): Promise<boolean> {
    const key = `${legalEntityId}:${month}`;
    if (this.rows.has(key)) {
      return Promise.resolve(false);
    }
    this.rows.set(key, { outcome: "pending", message: null });
    return Promise.resolve(true);
  }
  settle(
    legalEntityId: string,
    month: string,
    outcome: SettledInvoiceAutopilotOutcome,
    message: string | null,
  ): Promise<void> {
    this.rows.set(`${legalEntityId}:${month}`, { outcome, message });
    return Promise.resolve();
  }
}

class ScriptedInvoicer extends AutomaticMonthlyInvoicer {
  readonly calls: string[] = [];
  constructor(private readonly answer: () => MonthlyInvoiceReport) {
    super();
  }
  issue(legalEntityId: string, month: string): Promise<MonthlyInvoiceReport> {
    this.calls.push(`${legalEntityId}:${month}`);
    return Promise.resolve().then(this.answer);
  }
}

const ISSUED: MonthlyInvoiceReport = {
  month: "2026-09",
  issued: [{ payerCompanyId: "c_port", number: "FA-2026-000001", issuedOn: "2026-09-30" }],
  blocked: [{ payerCompanyId: "c_quai", message: "SIREN manquant" }],
  alreadyInvoiced: 0,
  unbillableOrders: 0,
};

function harness(answer: () => MonthlyInvoiceReport, at = AT_MOMENT) {
  const runs = new MemoryRuns();
  const invoicer = new ScriptedInvoicer(answer);
  const events = new RecordingPublisher();
  const handler = new RunInvoiceAutopilotHandler(
    new FixedIssuers([SELLER_FACTS]),
    runs,
    invoicer,
    events,
    new FixedClock(at),
    new DirectUnitOfWork(),
  );
  return { runs, invoicer, events, handler };
}

describe("RunInvoiceAutopilot — une tentative par (entité, mois)", () => {
  it("le dernier jour à 23h55 : émet le mois, range l'issue et les signalés", async () => {
    const h = harness(() => ISSUED);

    const report = await h.handler.execute();

    expect(report.runs).toEqual([{ legalEntityId: ENTITY, month: "2026-09", outcome: "issued" }]);
    expect(h.runs.rows.get(`${ENTITY}:2026-09`)).toEqual({
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

    expect(h.invoicer.calls).toEqual([`${ENTITY}:2026-08`]);
  });

  /**
   * Régression E4b : le passage horaire `15 *` tombait à 23h15 le dernier
   * jour, et à 22h15 il émettait ; depuis 23h55 il ne doit plus rien émettre
   * du mois avant cette heure-là.
   */
  it("le passage horaire de 23h15 le dernier jour n'émet pas le mois courant", async () => {
    const h = harness(() => ISSUED, new Date("2026-09-30T21:15:00.000Z"));

    await h.handler.execute();

    expect(h.invoicer.calls).toEqual([`${ENTITY}:2026-08`]);
  });

  it("le cron de 23h55 l'hiver (22h55 UTC) émet février ; son jumeau de 21h55 UTC (22h55 à Paris) regarde encore janvier", async () => {
    const winter = harness(() => ISSUED, new Date("2027-02-28T22:55:00.000Z"));
    await winter.handler.execute();
    expect(winter.invoicer.calls).toEqual([`${ENTITY}:2027-02`]);

    const early = harness(() => ISSUED, new Date("2027-02-28T21:55:00.000Z"));
    await early.handler.execute();
    expect(early.invoicer.calls).toEqual([`${ENTITY}:2027-01`]);
  });

  it("pas encore en service : `not_yet_open` ; autre refus : `failed` avec son message", async () => {
    const closed = harness(() => {
      throw new InvoicingNotYetOpenError("2026-09", new Date("2026-10-31T23:00:00.000Z"));
    });
    expect((await closed.handler.execute()).runs[0]?.outcome).toBe("not_yet_open");

    const broken = harness(() => {
      throw new Error("base indisponible");
    });
    await broken.handler.execute();
    expect(broken.runs.rows.get(`${ENTITY}:2026-09`)).toEqual({
      outcome: "failed",
      message: "base indisponible",
    });
  });

  it("rien à facturer : rangé `nothing_to_invoice`, pas une erreur", async () => {
    const h = harness(() => ({ ...ISSUED, issued: [], blocked: [] }));

    await h.handler.execute();

    expect(h.runs.rows.get(`${ENTITY}:2026-09`)?.outcome).toBe("nothing_to_invoice");
  });
});
