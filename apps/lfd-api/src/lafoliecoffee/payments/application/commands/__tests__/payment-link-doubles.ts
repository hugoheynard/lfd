import type { StaffNotice } from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { StaffNotifier } from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import {
  InvalidWebhookSignatureError,
  PaymentGatewayUnavailableError,
} from "../../../domain/errors/payment-errors.js";
import { PaymentLink, type CheckoutSession } from "../../../domain/entities/payment-link.js";
import {
  AccountingSettingsReader,
  type AccountingSettings,
} from "../../../domain/ports/accounting-settings.store.js";
import {
  CheckoutGateway,
  type CheckoutSessionRequest,
  type PaymentLinkWebhookEvent,
} from "../../../domain/ports/checkout-gateway.js";
import { PaymentLinkCompanyReader } from "../../../domain/ports/payment-link-company.reader.js";
import { PaymentLinkRepository } from "../../../domain/ports/payment-link.repository.js";

/**
 * Les doublés des handlers de liens libres, écrits à la main contre les ports
 * abstraits. Partagés par les suites de `commands/` — un seul endroit à tenir
 * quand un port bouge.
 */

/** Le dépôt, en mémoire, par la ligne rangée : `load` relit comme Postgres. */
export class InMemoryPaymentLinks extends PaymentLinkRepository {
  readonly rows = new Map<string, ReturnType<PaymentLink["toPersistence"]>>();
  saves = 0;

  load(id: string): Promise<PaymentLink | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row === undefined ? null : PaymentLink.reconstitute(row));
  }

  loadBySession(sessionId: string): Promise<PaymentLink | null> {
    const row = [...this.rows.values()].find((r) => r.stripeSessionId === sessionId);
    return Promise.resolve(row === undefined ? null : PaymentLink.reconstitute(row));
  }

  /** Le verrou n'a pas de sens en mémoire : les tests d'application sont séquentiels. */
  loadLocked(id: string): Promise<PaymentLink | null> {
    return this.load(id);
  }

  loadBySessionLocked(sessionId: string): Promise<PaymentLink | null> {
    return this.loadBySession(sessionId);
  }

  save(link: PaymentLink): Promise<void> {
    this.saves += 1;
    this.rows.set(link.id, link.toPersistence());
    return Promise.resolve();
  }
}

export class FixedSettings extends AccountingSettingsReader {
  constructor(private readonly capCents: number | null) {
    super();
  }

  read(): Promise<AccountingSettings> {
    return Promise.resolve({ paymentLinkMaxCents: this.capCents });
  }
}

export class KnownCompanies extends PaymentLinkCompanyReader {
  constructor(private readonly names: Readonly<Record<string, string>>) {
    super();
  }

  nameOf(companyId: string): Promise<string | null> {
    return Promise.resolve(this.names[companyId] ?? null);
  }
}

/** La page hébergée, sans réseau : garde ce qu'on lui a demandé. */
export class RecordingCheckout extends CheckoutGateway {
  readonly opened: CheckoutSessionRequest[] = [];
  readonly expired: string[] = [];
  refuseExpiry = false;

  createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSession> {
    this.opened.push(request);
    const sessionId = `cs_test_${String(this.opened.length)}`;
    return Promise.resolve({ sessionId, url: `https://checkout.stripe.test/${sessionId}` });
  }

  expireCheckoutSession(sessionId: string): Promise<void> {
    if (this.refuseExpiry) {
      return Promise.reject(new PaymentGatewayUnavailableError("session déjà payée"));
    }
    this.expired.push(sessionId);
    return Promise.resolve();
  }

  /** L'événement que le prochain webhook des liens rendra ; la signature `bad` est refusée. */
  linkEvent: PaymentLinkWebhookEvent = { kind: "ignored" };

  parseLinkWebhook(_rawBody: Buffer, signature: string): PaymentLinkWebhookEvent {
    if (signature === "bad") {
      throw new InvalidWebhookSignatureError();
    }
    return this.linkEvent;
  }
}

export class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}
