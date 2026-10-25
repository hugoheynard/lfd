import type { CustomerCancellationStage } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { OrderWithdrawalOutcome } from "../../../../../production/channels/commerce/index.js";
import type { CancellationSubject } from "../../../domain/ports/cancellation-subject.reader.js";
import { CancellationAllowanceGate } from "../../services/cancellation-allowance-gate.js";
import { CancellationRefundRequester } from "../../services/cancellation-refund-requester.js";
import { CancellationRule } from "../../services/cancellation-rule.js";
import { OrderCancellation } from "../../services/order-cancellation.service.js";
import { VoucherRestitutionRefusal } from "../../services/voucher-restitution-refusal.js";
import { CancelOrderCommand } from "../cancel-order.command.js";
import { CancelOrderHandler } from "../cancel-order.handler.js";
import {
  cancellationSubject,
  FixedInscriptions,
  FixedSubjects,
  InMemoryCancellations,
  RecordingNoteVoiding,
  ScriptedCancelGateway,
  ScriptedDesk,
  ScriptedEngagements,
} from "./cancellation-doubles.js";
import { FixedCancellationSettings } from "./customer-cancellation-doubles.js";
import { RecordingDurable } from "./durable-doubles.js";
import { InMemoryRefundRequests, RecordingDispatch, RefundStore } from "./refund-doubles.js";
import { RecordingRedemption, RETURNED } from "./voucher-doubles.js";

/**
 * L'autorisation du plan A1 (lot A1.1), calculée une fois par le noyau.
 * Tant que les guichets du lot A1.2 n'existent pas, l'étape `ready` ne change
 * AUCUNE issue : c'est ce que ces tests tiennent.
 */

/** Recopié dans l'écriture, jamais comparé à l'horloge. */
const NOW = new Date(0);

function scene(input: {
  readonly stage: CustomerCancellationStage;
  readonly desk?: OrderWithdrawalOutcome;
  readonly subject?: Partial<CancellationSubject>;
}) {
  const trace: string[] = [];
  const subject = cancellationSubject(input.subject ?? {});
  const subjects = new FixedSubjects(subject);
  const engagements = new ScriptedEngagements({ kind: "free" }, trace);
  const rule = new CancellationRule(engagements);
  const settings = new FixedCancellationSettings({ b2cCancellableUntil: input.stage });
  const rows = new InMemoryCancellations(subject, trace);
  const handler = new CancelOrderHandler(
    new OrderCancellation(
      subjects,
      rows,
      new ScriptedCancelGateway({ kind: "cancelled" }, trace),
      new ScriptedDesk(input.desk ?? "withdrawn", trace),
      new RecordingRedemption(false, RETURNED),
      new VoucherRestitutionRefusal(subjects, new FixedInscriptions(), rule),
      rule,
      new CancellationAllowanceGate(settings),
      engagements,
      new CancellationRefundRequester(
        new InMemoryRefundRequests(new RefundStore()),
        new RecordingDispatch(),
      ),
      new RecordingDurable(),
      new RecordingNoteVoiding(trace),
      new DirectUnitOfWork(),
      new FixedClock(NOW),
    ),
  );
  return { handler, trace, settings, rows };
}

const cancel = () => new CancelOrderCommand("ord_1", "fiche-marie", "Le client a rappelé");

describe("OrderCancellation — l'autorisation du plan A1 (lot A1.1)", () => {
  it("étape ready, commande inscrite : toujours refusée jusqu'à A1.2", async () => {
    const { handler, trace } = scene({ stage: "ready", desk: "inscribed" });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.inscribed",
    });
    expect(trace).not.toContain("cancel:ord_1");
  });

  it("étape ready, commande déjà confirmée au plan : toujours refusée jusqu'à A1.2", async () => {
    const { handler, trace } = scene({ stage: "ready", subject: { status: "confirmed" } });

    await expect(handler.execute(cancel())).rejects.toMatchObject({
      code: "orders.cancel.inscribed",
    });
    expect(trace).toEqual([]);
  });

  it("étape ready, commande non inscrite : annulée comme avant", async () => {
    const { handler, rows } = scene({ stage: "ready" });

    await handler.execute(cancel());

    expect(rows.records).toHaveLength(1);
  });

  it("lit le réglage UNE fois pour une commande personnelle, relecture sous verrou comprise", async () => {
    const { handler, settings } = scene({ stage: "ready" });

    await handler.execute(cancel());

    expect(settings.reads).toBe(1);
  });

  it("ne lit pas le réglage pour une commande de société : un pro n'est pas concerné", async () => {
    const { handler, settings } = scene({ stage: "ready", subject: { companyId: "co_1" } });

    await handler.execute(cancel());

    expect(settings.reads).toBe(0);
  });
});
