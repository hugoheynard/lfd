import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { OrderWithdrawalOutcome } from "../../../../../production/channels/commerce/index.js";
import { OrderNotCancellableError } from "../../../domain/errors/order-cancellation-errors.js";
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
import { RecordingDurable } from "./durable-doubles.js";
import { InMemoryRefundRequests, RecordingDispatch, RefundStore } from "./refund-doubles.js";
import { RecordingRedemption, RETURNED } from "./voucher-doubles.js";

/**
 * L'annulation d'une commande annule son BL prévu, dans sa transaction (plan
 * plan E1 (`documentation/commandes/bon-de-livraison.md`), § 6, bloquant 2).
 */

/** Recopié dans l'écriture, jamais comparé à l'horloge. */
const NOW = new Date(0);

function scene(desk: OrderWithdrawalOutcome = "withdrawn") {
  const trace: string[] = [];
  const subject = cancellationSubject();
  const subjects = new FixedSubjects(subject);
  const engagements = new ScriptedEngagements({ kind: "free" }, trace);
  const rule = new CancellationRule(engagements);
  const notes = new RecordingNoteVoiding(trace);
  const handler = new CancelOrderHandler(
    new OrderCancellation(
      subjects,
      new InMemoryCancellations(subject, trace),
      new ScriptedCancelGateway({ kind: "cancelled" }, trace),
      new ScriptedDesk(desk, trace),
      new RecordingRedemption(false, RETURNED),
      new VoucherRestitutionRefusal(subjects, new FixedInscriptions(), rule),
      rule,
      engagements,
      new CancellationRefundRequester(
        new InMemoryRefundRequests(new RefundStore()),
        new RecordingDispatch(),
      ),
      new RecordingDurable(),
      notes,
      new DirectUnitOfWork(),
      new FixedClock(NOW),
    ),
  );
  return { handler, trace, notes };
}

const cancel = () => new CancelOrderCommand("ord_1", "fiche-marie", "Le client a rappelé");

describe("CancelOrderHandler — le bon de livraison prévu (plan E1)", () => {
  it("annule le BL prévu APRÈS l'écriture de l'annulation, à l'instant de l'annulation", async () => {
    const { handler, trace, notes } = scene();

    await handler.execute(cancel());

    expect(trace.slice(trace.indexOf("cancel:ord_1"))).toEqual(["cancel:ord_1", "void-note:ord_1"]);
    expect(notes.voided).toEqual([{ orderId: "ord_1", at: NOW }]);
  });

  it("une annulation refusée (inscrite au fournil) ne touche pas au BL", async () => {
    const { handler, notes } = scene("inscribed");

    await expect(handler.execute(cancel())).rejects.toBeInstanceOf(OrderNotCancellableError);
    expect(notes.voided).toEqual([]);
  });
});
