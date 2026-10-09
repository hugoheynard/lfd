import {
  DEFAULT_ORDER_OPENING,
  type OrderOpeningView,
  type PublicOrderOpeningView,
} from "@lfd/contracts";

import { OrderOpeningReader } from "../../../../order-opening/domain/ports/order-opening.reader.js";
import {
  CompanyStatusReader,
  type OrderCompanyStatus,
} from "../../../domain/ports/company-status.reader.js";
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

/**
 * La porte de la passation, sur le VRAI service : un réglage et un statut de
 * société, rien d'autre. Ouverte aux deux par défaut — l'état de toute base.
 */
export function intakeAt(
  opening: PublicOrderOpeningView = DEFAULT_ORDER_OPENING,
  companyStatus: OrderCompanyStatus | null = "active",
): OrderIntake {
  return new OrderIntake(
    new FixedOrderOpening(opening),
    new CustomerAudiences(new FixedCompanyStatus(companyStatus)),
  );
}
