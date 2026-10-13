import {
  DEFAULT_CUSTOMER_CANCELLATION_SETTINGS,
  type CustomerCancellationSettingsView,
} from "@lfd/contracts";

import { CustomerCancellationSettingsReader } from "../../../../order-opening/domain/ports/customer-cancellation-settings.reader.js";
import { CancellationLinkSigner } from "../../../domain/ports/cancellation-link-signer.js";
import { CancellingMemberReader } from "../../../domain/ports/cancelling-member.reader.js";
import {
  CustomerCancellationSubjectReader,
  type CustomerCancellationSubject,
} from "../../../domain/ports/customer-cancellation-subject.reader.js";

/**
 * Doubles de l'annulation par le client (lot C6), écrits à la main en
 * héritant des ports — jamais `jest.fn()`.
 */

/** Une commande personnelle d'un client connecté, au jour donné, sans créneau. */
export function customerSubject(
  overrides: Partial<CustomerCancellationSubject> = {},
): CustomerCancellationSubject {
  return {
    orderId: "ord_1",
    companyId: null,
    placedByUserId: "usr_1",
    serviceDay: "2030-01-15",
    windowStart: null,
    placedAt: new Date(0),
    buyer: { hasAccount: true, active: true },
    ...overrides,
  };
}

export class FixedCustomerSubjects extends CustomerCancellationSubjectReader {
  readonly reads: string[] = [];

  constructor(private readonly subject: CustomerCancellationSubject | null) {
    super();
  }

  find(orderId: string): Promise<CustomerCancellationSubject | null> {
    this.reads.push(orderId);
    return Promise.resolve(this.subject?.orderId === orderId ? this.subject : null);
  }
}

/** Le mur pro : les paires `userId:companyId` admises. */
export class FixedMembers extends CancellingMemberReader {
  constructor(private readonly admitted: readonly string[] = []) {
    super();
  }

  mayCancelFor(userId: string, companyId: string): Promise<boolean> {
    return Promise.resolve(this.admitted.includes(`${userId}:${companyId}`));
  }
}

/** Un signataire lisible : le jeton d'une commande est `sig-<id>`. */
export class ReadableSigner extends CancellationLinkSigner {
  sign(orderId: string): string {
    return `sig-${orderId}`;
  }

  matches(orderId: string, token: string): boolean {
    return token === this.sign(orderId);
  }
}

/** Le réglage, posé par le test ; fermé par défaut, comme en production. */
export class FixedCancellationSettings extends CustomerCancellationSettingsReader {
  reads = 0;

  constructor(private readonly settings: Partial<CustomerCancellationSettingsView> = {}) {
    super();
  }

  current(): Promise<CustomerCancellationSettingsView> {
    this.reads += 1;
    return Promise.resolve({ ...DEFAULT_CUSTOMER_CANCELLATION_SETTINGS, ...this.settings });
  }
}
