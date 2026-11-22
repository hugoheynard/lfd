import { Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { BankTransferGapFoundEvent } from "../../domain/events/bank-transfer-gap.event.js";
import type {
  BankTransferGap,
  BankTransferGapKind,
} from "../../domain/services/bank-transfer-consistency.js";

const RING_BANK_TRANSFER_GAP = "ring-bank-transfer-gap";

/** Ce que l'écart veut dire, pour qui n'a pas le code sous les yeux. */
const WHAT: Readonly<Record<BankTransferGapKind, (gap: BankTransferGap) => string>> = {
  order_without_allocation: (gap) =>
    `le bon ${gap.orderId ?? "?"} de la facture ${label(gap)} est marqué réglé par ce virement, ` +
    "mais le virement enregistré ne règle pas cette facture",
  order_without_invoice: (gap) =>
    `le bon ${gap.orderId ?? "?"} est marqué réglé par ce virement, mais aucune facture ne le porte`,
  allocation_unknown_invoice: (gap) =>
    `le virement enregistré règle la pièce ${gap.invoiceId ?? "?"}, que la facturation ne connaît pas`,
  allocation_order_not_settled: (gap) =>
    `le virement enregistré règle la facture ${label(gap)}, mais ` +
    (gap.orderId === null
      ? "elle ne porte aucun bon"
      : `son bon ${gap.orderId} n'est pas marqué réglé par ce virement`),
  allocation_unknown_subject: (gap) =>
    `le virement enregistré règle « ${gap.invoiceId ?? "?"} », qui n'est pas une facture`,
};

/**
 * **« Virement reçu incohérent »** (plan `plan-le-virement-recu-dans-payment.md`,
 * §3.6) : le contrôle de nuit a trouvé un écart entre la trace de la
 * facturation et le virement enregistré par le bloc `payment`. Sans
 * destinataire nommé, comme `RingCollectionReturned` : visible de tout le
 * back-office. Une clé par écart : le passage de la nuit suivante, qui relit
 * la même fenêtre, ne sonne pas deux fois.
 */
@EventsHandler(BankTransferGapFoundEvent)
export class RingBankTransferGap implements IEventHandler<BankTransferGapFoundEvent> {
  private readonly logger = new Logger(RingBankTransferGap.name);

  constructor(
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: BankTransferGapFoundEvent): void {
    void this.work.track(this.run(event.gap), RING_BANK_TRANSFER_GAP);
  }

  private async run(gap: BankTransferGap): Promise<void> {
    try {
      await this.notifier.notify([
        {
          kind: "bank_transfer.inconsistent",
          subject: `Virement reçu incohérent — ${gap.transferId}`,
          body:
            `Virement ${gap.transferId} : ${WHAT[gap.kind](gap)}. Rien n'a été corrigé ` +
            "automatiquement : comparer le relevé, la facture et ses bons avant toute saisie.",
          link: "/comptabilite/virements-en-retard",
          idempotencyKey: `notification:bank_transfer.inconsistent:${gap.kind}:${gap.transferId}:${gap.invoiceId ?? "-"}:${gap.orderId ?? "-"}`,
          occurredAt: this.clock.now(),
        },
      ]);
    } catch (error) {
      this.logger.error(`Cloche « virement reçu incohérent » non émise (${gap.transferId})`, error);
    }
  }
}

function label(gap: BankTransferGap): string {
  return gap.invoiceNumber ?? gap.invoiceId ?? "?";
}
