import { Injectable } from "@nestjs/common";

import type { VoucherRestitution } from "../../../orders/domain/ports/loyalty-voucher-redemption.js";
import { VoucherOrderReader } from "../../../orders/domain/ports/voucher-order.reader.js";
import { VoucherRestitutionPreview } from "../../../orders/domain/ports/voucher-restitution-preview.js";
import { LoyaltyVoucherNotFoundError } from "../../domain/errors/loyalty-errors.js";
import { LoyaltyVoucherRepository } from "../../domain/ports/loyalty-voucher.repository.js";
import { voucherRestitutionOf } from "../../domain/services/voucher-restitution.js";
import { restitutionOf } from "./voucher-restitution-outcome.js";

/**
 * **L'aperçu de la restitution** pour le détail staff (doc
 * `documentation/commandes/annulation/fusion-du-bon.md`, C3b.5, C3b.7) : la règle pure, sans
 * verrou ni écriture. Implémente le port de lecture que la commande déclare,
 * relié dans `appBootstrap/loyalty-voucher.module.ts`.
 *
 * La commande affichée est vivante et porte le bon : elle seule peut le porter
 * (index unique partiel). « Engagé ailleurs » est donc faux par construction.
 */
@Injectable()
export class LoyaltyVoucherRestitutionPreviewing extends VoucherRestitutionPreview {
  constructor(
    private readonly vouchers: LoyaltyVoucherRepository,
    private readonly orders: VoucherOrderReader,
  ) {
    super();
  }

  async previewOf(voucherId: string, now: Date): Promise<VoucherRestitution> {
    const parent = await this.vouchers.load(voucherId);
    if (parent === null) {
      throw new LoyaltyVoucherNotFoundError(voucherId);
    }
    const remainder = await this.vouchers.loadLiveRemainderOf(parent.id);
    const issue = voucherRestitutionOf({ parent, remainder, now, engagedElsewhere: false });
    return restitutionOf(issue, parent, this.orders);
  }
}
