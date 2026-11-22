import {
  type AttachedCardPayment,
  type CardPaymentCancellation,
  type CardPaymentPreparation,
  CardPayments,
  type CardPaymentSource,
  type CardProviderSettlement,
  type PreparedCardPayment,
  type RetrievedCardPayment,
} from "../../../channels/requests/card-payments.js";
import {
  type CardSubject,
  LinkableSubject,
  type SubjectPaymentRole,
  type SubjectQuote,
} from "../../../channels/subjects/index.js";
import type { CardIntentState } from "../../../card/domain/ports/card-provider-types.js";
import { PayLink } from "../../domain/entities/pay-link.js";
import type { FirstCardPayment } from "../../domain/ports/first-card-payment.reader.js";
import { FirstCardPaymentReader } from "../../domain/ports/first-card-payment.reader.js";
import { type PayLinkOriginEntry, PayLinkOrigins } from "../../domain/ports/pay-link-origins.js";
import { PayLinkTokenVault } from "../../domain/ports/pay-link-token-vault.js";
import { PayLinkRepository } from "../../domain/ports/pay-link.repository.js";
import { TokenGenerator } from "../../domain/ports/token-generator.js";

/**
 * Doubles des liens, écrits à la main en héritant des ports — jamais
 * `jest.fn()`. Les mêmes unicités que la base : un lien vivant par sujet, un
 * jeton par lien.
 */
export class InMemoryPayLinks extends PayLinkRepository {
  readonly rows = new Map<string, PayLink>();

  addIfAbsent(link: PayLink): Promise<boolean> {
    const row = link.toPersistence();
    const taken = [...this.rows.values()].some((other) => {
      const o = other.toPersistence();
      return (
        o.id === row.id ||
        o.tokenHash === row.tokenHash ||
        (o.revokedAt === null && o.subjectType === row.subjectType && o.subjectId === row.subjectId)
      );
    });
    if (!taken) {
      this.rows.set(row.id, PayLink.rehydrate(row));
    }
    return Promise.resolve(!taken);
  }

  liveOf(subjectType: string, subjectId: string): Promise<PayLink | null> {
    const live = [...this.rows.values()].find(
      (link) => link.isLive && link.subjectType === subjectType && link.subjectId === subjectId,
    );
    return Promise.resolve(live === undefined ? null : PayLink.rehydrate(live.toPersistence()));
  }

  liveOfAll(subjects: readonly CardSubject[]): Promise<readonly PayLink[]> {
    const live = [...this.rows.values()].filter(
      (link) =>
        link.isLive && subjects.some((s) => s.type === link.subjectType && s.id === link.subjectId),
    );
    return Promise.resolve(live.map((link) => PayLink.rehydrate(link.toPersistence())));
  }

  byId(id: string): Promise<PayLink | null> {
    const found = this.rows.get(id);
    return Promise.resolve(found === undefined ? null : PayLink.rehydrate(found.toPersistence()));
  }

  byTokenHash(tokenHash: string): Promise<PayLink | null> {
    const found = [...this.rows.values()].find(
      (link) => link.toPersistence().tokenHash === tokenHash,
    );
    return Promise.resolve(found === undefined ? null : PayLink.rehydrate(found.toPersistence()));
  }

  save(link: PayLink): Promise<void> {
    this.rows.set(link.id, PayLink.rehydrate(link.toPersistence()));
    return Promise.resolve();
  }
}

/** Des jetons tirés dans l'ordre : `tok_1`, `tok_2`… */
export class SequentialTokens extends TokenGenerator {
  private count = 0;

  next(): string {
    this.count += 1;
    return `tok_${String(this.count)}`;
  }
}

/** Un coffre lisible : l'empreinte et le scellé se reconnaissent à leur préfixe. */
export class TransparentVault extends PayLinkTokenVault {
  fingerprint(token: string): string {
    return `hash:${token}`;
  }

  seal(token: string): string {
    return `sealed:${token}`;
  }

  open(sealed: string): string {
    return sealed.replace(/^sealed:/u, "");
  }
}

/** Un registre d'origines fixé. */
export class FixedOrigins extends PayLinkOrigins {
  constructor(private readonly entries: readonly PayLinkOriginEntry[]) {
    super();
  }

  find(name: string): PayLinkOriginEntry | null {
    return this.entries.find((entry) => entry.name === name) ?? null;
  }
}

export const LFC_ORIGIN: PayLinkOriginEntry = {
  name: "lafoliecoffee",
  label: "La Folie Coffee",
  publicRoot: "https://app.lfc.test/",
};

/** Un sujet payable par lien, dont le devis se règle. */
export class ScriptedLinkable extends LinkableSubject {
  quote_: SubjectQuote = {
    payable: true,
    amountCents: 12_500,
    payeeName: "La Folie Douce",
    payerName: "Café des Arts",
    reference: "F-0042",
    dueOn: null,
  };
  readonly asked: CardSubject[] = [];

  constructor(readonly subjectType = "free_charge") {
    super();
  }

  quote(subject: CardSubject): Promise<SubjectQuote> {
    this.asked.push(subject);
    return Promise.resolve(this.quote_);
  }
}

/**
 * Le premier paiement de chaque sujet, réglable ; `afterReads` le fait
 * apparaître à la N-ième lecture — la course perdue sous le verrou.
 */
export class ScriptedFirsts extends FirstCardPaymentReader {
  readonly bySubject = new Map<string, FirstCardPayment>();
  readonly reads: string[] = [];
  appearOnRead: { readonly at: number; readonly first: FirstCardPayment } | null = null;

  firstOf(subjectType: string, subjectId: string): Promise<FirstCardPayment | null> {
    const key = `${subjectType}:${subjectId}`;
    this.reads.push(key);
    if (this.appearOnRead !== null && this.reads.length >= this.appearOnRead.at) {
      this.bySubject.set(key, this.appearOnRead.first);
    }
    return Promise.resolve(this.bySubject.get(key) ?? null);
  }
}

/** Le canal des cartes, réduit à ce que la page appelle ; chaque geste noté. */
export class ScriptedCards extends CardPayments {
  readonly calls: string[] = [];
  readonly attached: {
    subject: CardSubject;
    role: SubjectPaymentRole;
    source?: CardPaymentSource;
  }[] = [];
  retrievedState: CardIntentState = "awaiting_payment";
  attachFailure: Error | null = null;
  /** Joué pendant `prepare` : ce qui croise l'appel au prestataire (une annulation). */
  duringPrepare: (() => Promise<void>) | null = null;

  async prepare(
    subjectType: string,
    amountCents: number,
    tag: string,
  ): Promise<CardPaymentPreparation> {
    this.calls.push(`prepare:${subjectType}:${String(amountCents)}:${tag}`);
    await this.duringPrepare?.();
    return {
      prepared: { account: "lfc-stripe", providerRef: "pi_new", amountCents },
      collection: { kind: "embedded", provider: "stripe", publishableKey: "pk", token: "pi_new_s" },
    };
  }

  attach(
    subject: CardSubject,
    prepared: PreparedCardPayment,
    role: SubjectPaymentRole,
    source?: CardPaymentSource,
  ): Promise<AttachedCardPayment> {
    this.calls.push(`attach:${prepared.providerRef}:${role}`);
    if (this.attachFailure !== null) {
      return Promise.reject(this.attachFailure);
    }
    this.attached.push({ subject, role, ...(source === undefined ? {} : { source }) });
    return Promise.resolve({ paymentId: "pay_new", providerRef: prepared.providerRef });
  }

  release(prepared: PreparedCardPayment): Promise<void> {
    this.calls.push(`release:${prepared.providerRef}`);
    return Promise.resolve();
  }

  retrieve(paymentId: string): Promise<RetrievedCardPayment> {
    this.calls.push(`retrieve:${paymentId}`);
    return Promise.resolve({
      paymentId,
      providerRef: "pi_old",
      collection: { kind: "embedded", provider: "stripe", publishableKey: "pk", token: "pi_old_s" },
      state: this.retrievedState,
    });
  }

  cancel(): Promise<CardPaymentCancellation> {
    return Promise.reject(new Error("non utilisé"));
  }

  settleFromProvider(): Promise<CardProviderSettlement> {
    return Promise.reject(new Error("non utilisé"));
  }

  adopt(): Promise<string> {
    return Promise.reject(new Error("non utilisé"));
  }
}
