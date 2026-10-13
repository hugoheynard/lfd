import { Injectable } from "@nestjs/common";

import { OrderInscriptionReader } from "../../../../production/channels/commerce/index.js";
import type { VoucherRestitution } from "../../domain/ports/loyalty-voucher-redemption.js";
import { CancellationSubjectReader } from "../../domain/ports/cancellation-subject.reader.js";
import {
  cancellationOf,
  type CancellationBlock,
} from "../../domain/services/order-cancellation.js";
import { CancellationRule } from "./cancellation-rule.js";

/** La restitution refusée — les cas 5 et 6 du lot C3b. */
export type BlockedRestitution = Extract<VoucherRestitution, { readonly kind: "blocked" }>;

/**
 * **Le refus d'annuler à cause du bon** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C3b.5, C3b.7), mis en
 * bloc de la règle d'annulation. Partagé par le geste et l'aperçu du détail,
 * qui disent donc la même phrase.
 *
 * Pour le cas 5, la phrase dépend de l'AUTRE commande : si elle s'annule, on
 * propose de l'annuler d'abord ; sinon on ne promet rien. Elle se lit par la
 * même règle (`cancellationOf`) et l'inscription au fournil, SANS verrou :
 * c'est une phrase, pas une décision.
 */
@Injectable()
export class VoucherRestitutionRefusal {
  constructor(
    private readonly subjects: CancellationSubjectReader,
    private readonly inscriptions: OrderInscriptionReader,
    private readonly rule: CancellationRule,
  ) {}

  async blockOf(blocked: BlockedRestitution): Promise<CancellationBlock> {
    if (blocked.cause === "remainder_cancelled") {
      return {
        kind: "voucher_remainder_cancelled",
        remainderValueCents: blocked.remainderValueCents,
      };
    }
    return {
      kind: "voucher_remainder_engaged",
      remainderValueCents: blocked.remainderValueCents,
      order: blocked.order,
      otherCancellable: await this.isCancellable(blocked.order.id),
    };
  }

  private async isCancellable(orderId: string): Promise<boolean> {
    const [subject, inscribedDay] = await Promise.all([
      this.subjects.find(orderId),
      this.inscriptions.inscribedDayOf(orderId),
    ]);
    return (
      subject !== null && cancellationOf(await this.rule.stateOf(subject, inscribedDay)).cancellable
    );
  }
}
