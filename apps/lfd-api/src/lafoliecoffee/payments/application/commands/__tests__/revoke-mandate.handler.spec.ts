import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { randomUUID } from "node:crypto";
import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { PaymentMandate } from "../../../domain/entities/payment-mandate.js";
import { MandateNotFoundError } from "../../../domain/errors/mandate-errors.js";
import { RevokeMandateCommand } from "../revoke-mandate.command.js";
import { RevokeMandateHandler } from "../revoke-mandate.handler.js";
import { activeMandate, doubles, NOW, type Trace } from "./staff-mandate-doubles.js";

/** La société engagée, nommée comme le double la rend (lot B du plan des phrases). */
const COMPANY_CITED = { id: "cmp_1", name: "Café des Halles" };

/** L'unité de travail, tracée dans le même fil que les autres gestes. */
class TracingUnitOfWork extends UnitOfWork {
  constructor(private readonly trace: Trace) {
    super();
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.trace.steps.push("uow:begin");
    const result = await work();
    this.trace.steps.push("uow:end");
    return result;
  }
}

function revokeHandler(
  current: PaymentMandate | null,
  events = new RecordingPublisher(),
): { readonly handler: RevokeMandateHandler; readonly trace: Trace } {
  const { repo, trace } = doubles({ current });
  const handler = new RevokeMandateHandler(
    repo,
    new FixedClock(NOW),
    events,
    new TracingUnitOfWork(trace),
    inMemoryIntents(),
  );
  return { handler, trace };
}

describe("RevokeMandateHandler", () => {
  it("marque révoqué dans l'unité de travail, sans autre geste", async () => {
    // Plus aucun prestataire à prévenir depuis le 2026-09-19 : le mandat est
    // traité avec la banque, et la révocation est une écriture locale.
    const { handler, trace } = revokeHandler(activeMandate());

    await handler.execute(new RevokeMandateCommand("cmp_1", "staff_compta", randomUUID()));

    expect(trace.steps).toEqual(["uow:begin", "save", "uow:end"]);
    expect(trace.saved?.status).toBe("revoked");
  });

  /** Lot 1 du plan du journal (2026-09-19) : le geste qui arrête les prélèvements a sa trace. */
  it("journalise la révocation avec la RUM et l'état d'avant", async () => {
    const events = new RecordingPublisher();
    const { handler } = revokeHandler(activeMandate(), events);

    await handler.execute(new RevokeMandateCommand("cmp_1", "staff_compta", randomUUID()));

    expect(events.factTypes()).toEqual(["payment_mandate.revoked"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "payment_mandate",
      subjectId: "mdt_1",
      payload: {
        subjectLabel: "RUM-123",
        company: COMPANY_CITED,
        reference: "RUM-123",
        previousStatus: "active",
        via: "staff",
      },
    });
  });

  it("refuse quand la société n'a jamais eu de mandat, sans rien journaliser", async () => {
    const events = new RecordingPublisher();
    const { handler } = revokeHandler(null, events);

    await expect(
      handler.execute(new RevokeMandateCommand("cmp_1", "staff_compta", randomUUID())),
    ).rejects.toBeInstanceOf(MandateNotFoundError);
    expect(events.traced).toHaveLength(0);
  });
});

describe("RevokeMandateHandler — une fois par intention", () => {
  /**
   * Régression : « le mandat courant » est l'actif, sinon le brouillon — un
   * second envoi, l'actif révoqué, révoquait le brouillon d'une rotation.
   */
  it("la même clé ne révoque rien de plus et ne rejournalise pas", async () => {
    const events = new RecordingPublisher();
    const { handler } = revokeHandler(activeMandate(), events);
    const command = new RevokeMandateCommand("cmp_1", "staff_compta", "cle-1");

    await handler.execute(command);
    await handler.execute(command);

    expect(events.factTypes()).toEqual(["payment_mandate.revoked"]);
  });
});
