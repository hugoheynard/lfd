import {
  DEFAULT_ORDER_OPENING,
  type OrderOpeningView,
  type PublicOrderOpeningView,
} from "@lfd/contracts";

import type { OrderOpeningExemption } from "../../../../order-opening/domain/order-opening-exemption.js";
import { ActiveOrderOpeningExemptions } from "../../../../order-opening/domain/ports/active-order-opening-exemptions.reader.js";
import { OrderOpeningReader } from "../../../../order-opening/domain/ports/order-opening.reader.js";
import {
  CompanyStatusReader,
  type OrderCompanyStatus,
} from "../../../domain/ports/company-status.reader.js";
import {
  OrderRecipientReader,
  type OrderRecipient,
} from "../../../domain/ports/order-recipient.reader.js";
import { CustomerAudiences } from "../../services/customer-audiences.service.js";
import { OrderIntake } from "../../services/order-intake.service.js";

/** Le réglage d'ouverture tel qu'un geste l'aurait posé ; par défaut, ouverte aux deux. */
export class FixedOrderOpening extends OrderOpeningReader {
  constructor(private readonly opening: PublicOrderOpeningView = DEFAULT_ORDER_OPENING) {
    super();
  }

  current(): Promise<OrderOpeningView> {
    return Promise.resolve({ ...DEFAULT_ORDER_OPENING, ...this.opening });
  }
}

/** Le statut de toute société demandée — la clientèle s'en déduit (`audienceOf`). */
class FixedCompanyStatus extends CompanyStatusReader {
  constructor(private readonly status: OrderCompanyStatus | null) {
    super();
  }

  companyStatusOf(): Promise<OrderCompanyStatus | null> {
    return Promise.resolve(this.status);
  }
}

/** Les exemptions actives, telles qu'un geste les aurait accordées ; aucune par défaut. */
export class FixedExemptions extends ActiveOrderOpeningExemptions {
  constructor(private readonly exemptions: readonly OrderOpeningExemption[] = []) {
    super();
  }

  active(): Promise<readonly OrderOpeningExemption[]> {
    return Promise.resolve(this.exemptions);
  }
}

/** L'adresse de chaque personne connectée, par identifiant. */
export class FixedRecipients extends OrderRecipientReader {
  constructor(private readonly emails: Readonly<Record<string, string>> = {}) {
    super();
  }

  findById(userId: string): Promise<OrderRecipient | null> {
    const email = this.emails[userId];
    return Promise.resolve(email === undefined ? null : { email, firstName: "Client" });
  }
}

/**
 * La porte de la passation, sur le VRAI service : un réglage, un statut de
 * société, et — pour une boutique fermée — les exemptions et les adresses.
 * Ouverte aux deux par défaut — l'état de toute base.
 */
export function intakeAt(
  opening: PublicOrderOpeningView = DEFAULT_ORDER_OPENING,
  companyStatus: OrderCompanyStatus | null = "active",
  exemptions: readonly OrderOpeningExemption[] = [],
  emails: Readonly<Record<string, string>> = {},
): OrderIntake {
  return new OrderIntake(
    new FixedOrderOpening(opening),
    new CustomerAudiences(new FixedCompanyStatus(companyStatus)),
    new FixedExemptions(exemptions),
    new FixedRecipients(emails),
  );
}
