import type { PaymentLinkStatus } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  type CardSubject,
  LinkableSubject,
  type SubjectQuote,
} from "../../../../payment/channels/subjects/index.js";
import { PAY_LINK_ORIGINS } from "../../../../platform/config/pay-link-origins.js";
import {
  FreeChargeOriginMissingError,
  PaymentLinkNotFoundError,
} from "../../domain/errors/payment-link-errors.js";
import { PaymentLinkCompanyReader } from "../../domain/ports/payment-link-company.reader.js";
import { PaymentLinkRepository } from "../../domain/ports/payment-link.repository.js";
import { FREE_CHARGE_LINK_ORIGIN, FREE_CHARGE_SUBJECT_TYPE } from "./free-charge-subject.js";

/** Pourquoi une demande de paiement libre ne se paie plus, par état. `open` se paie. */
const UNPAYABLE: Readonly<Record<Exclude<PaymentLinkStatus, "open">, "settled" | "cancelled">> = {
  paid: "settled",
  cancelled: "cancelled",
  expired: "cancelled",
};

/**
 * **« Combien, et pour qui ? » pour une demande de paiement libre** (plan du lien vers
 * un sujet, §5.2) — l'implémentation `free_charge` de `LinkableSubject`,
 * reliée par `appBootstrap/pay-link-feed.module.ts`.
 *
 * Payable tant qu'elle est ouverte : son montant, son libellé en référence,
 * le nom de la société en payeur, le libellé de l'origine en bénéficiaire,
 * aucune échéance.
 */
@Injectable()
export class FreeChargeLinkable extends LinkableSubject {
  readonly subjectType = FREE_CHARGE_SUBJECT_TYPE;

  constructor(
    private readonly links: PaymentLinkRepository,
    private readonly companies: PaymentLinkCompanyReader,
  ) {
    super();
  }

  /**
   * @throws {PaymentLinkNotFoundError} aucune demande de paiement libre sous cet identifiant.
   * @throws {FreeChargeOriginMissingError} l'origine n'est pas au registre.
   */
  async quote(subject: CardSubject): Promise<SubjectQuote> {
    const link = await this.links.load(subject.id);
    if (link === null) {
      throw new PaymentLinkNotFoundError(subject.id);
    }
    if (link.status !== "open") {
      return { payable: false, reason: UNPAYABLE[link.status] };
    }
    return {
      payable: true,
      amountCents: link.terms.amountCents,
      payeeName: payeeName(),
      payerName: (await this.companies.nameOf(link.companyId)) ?? link.companyId,
      reference: link.terms.label,
      dueOn: null,
    };
  }
}

/**
 * Le libellé de l'origine des demandes de paiement libres, lu au registre.
 * @throws {FreeChargeOriginMissingError} l'origine n'y est pas déclarée.
 */
function payeeName(): string {
  const origin = PAY_LINK_ORIGINS.find((entry) => entry.name === FREE_CHARGE_LINK_ORIGIN);
  if (origin === undefined) {
    throw new FreeChargeOriginMissingError(FREE_CHARGE_LINK_ORIGIN);
  }
  return origin.label;
}
