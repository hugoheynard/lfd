import {
  type OpenedPayLink,
  type PayLinkRequest,
  PayLinks,
  type SubjectPayLinkUrl,
} from "../../../../../payment/channels/requests/index.js";
import type { CardSubject } from "../../../../../payment/channels/subjects/index.js";
import type { DurableFact } from "../../../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../../../platform/outbox/durable-publisher.js";
import type { StaffNotice } from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { StaffNotifier } from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { PaymentLink } from "../../../domain/entities/payment-link.js";
import {
  AccountingSettingsReader,
  type AccountingSettings,
} from "../../../domain/ports/accounting-settings.store.js";
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

  /** Le verrou n'a pas de sens en mémoire : les tests d'application sont séquentiels. */
  loadLocked(id: string): Promise<PaymentLink | null> {
    return this.load(id);
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

/** Un lien d'avant la porte (canal `checkout`), ligne historique relue telle quelle. */
export function checkoutLink(
  id: string,
  companyId: string,
  sessionId: string,
  at: Date,
): PaymentLink {
  return PaymentLink.reconstitute({
    id,
    companyId,
    amountCents: 9_000,
    label: "Ancien lien",
    nature: null,
    status: "open",
    stripeSessionId: sessionId,
    url: `https://checkout.stripe.test/${sessionId}`,
    createdAt: at,
    createdByStaffId: "staff_1",
    paidAt: null,
    cancelledAt: null,
    cancelledByStaffId: null,
  });
}

export class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

/**
 * La porte des liens, sans base : chaque sujet ouvert reçoit une adresse
 * `https://app.lfc.test/payer/tok_<n>`, révocable. `brokenUrls` simule une
 * adresse qui ne se compose pas (racine absente) : `urlsOf` l'omet.
 */
export class RecordingPayLinks extends PayLinks {
  readonly opened: { readonly subject: CardSubject; readonly request: PayLinkRequest }[] = [];
  readonly revoked: { readonly subject: CardSubject; readonly reason: string }[] = [];
  readonly brokenUrls = new Set<string>();
  urlsOfCalls = 0;
  private readonly live = new Map<string, string>();

  open(subject: CardSubject, request: PayLinkRequest): Promise<OpenedPayLink> {
    this.opened.push({ subject, request });
    const key = keyOf(subject);
    const url =
      this.live.get(key) ?? `https://app.lfc.test/payer/tok_${String(this.opened.length)}`;
    this.live.set(key, url);
    return Promise.resolve({ linkId: `paylink_${subject.id}`, url });
  }

  revoke(subject: CardSubject, reason: string): Promise<boolean> {
    this.revoked.push({ subject, reason });
    return Promise.resolve(this.live.delete(keyOf(subject)));
  }

  urlOf(subject: CardSubject): Promise<string | null> {
    return Promise.resolve(this.live.get(keyOf(subject)) ?? null);
  }

  urlsOf(subjects: readonly CardSubject[]): Promise<readonly SubjectPayLinkUrl[]> {
    this.urlsOfCalls += 1;
    return Promise.resolve(
      subjects.flatMap((subject) => {
        const url = this.live.get(keyOf(subject));
        return url === undefined || this.brokenUrls.has(subject.id) ? [] : [{ subject, url }];
      }),
    );
  }
}

function keyOf(subject: CardSubject): string {
  return `${subject.type}:${subject.id}`;
}

/** La boîte d'envoi, en mémoire : les faits durables écrits, dans l'ordre. */
export class RecordingDurable extends DurablePublisher {
  readonly facts: DurableFact[] = [];

  publish(fact: DurableFact): Promise<void> {
    this.facts.push(fact);
    return Promise.resolve();
  }
}
