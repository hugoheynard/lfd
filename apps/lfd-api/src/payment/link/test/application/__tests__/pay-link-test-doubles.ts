import type {
  AmountRefundRequest,
  CardRefundTarget,
  RemainderRefundRequest,
  RequestedCardRefund,
} from "../../../../channels/requests/card-refunds.js";
import { CardRefunds } from "../../../../channels/requests/card-refunds.js";
import {
  type OpenedPayLink,
  type PayLinkRequest,
  PayLinks,
  type SubjectPayLinkUrl,
} from "../../../../channels/requests/pay-links.js";
import type { SubjectRefundPosition } from "../../../../channels/requests/card-settlement.reader.js";
import type { CardSubject } from "../../../../channels/subjects/index.js";
import {
  type StaffNotice,
  StaffNotifier,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { PayLinkTest, type PayLinkTestSnapshot } from "../../domain/pay-link-test.js";
import { PayLinkTestReader } from "../../domain/ports/pay-link-test.reader.js";
import { PayLinkTestRepository } from "../../domain/ports/pay-link-test.repository.js";

/** Le fuseau du plafond, comme l'adaptateur le lit en SQL. */
const PARIS_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" });

/**
 * Les essais, en mémoire, par la ligne rangée : `load` relit comme Postgres.
 * `trace` note le verrou et les écritures, dans l'ordre.
 */
export class InMemoryPayLinkTests extends PayLinkTestRepository {
  readonly rows = new Map<string, PayLinkTestSnapshot>();
  readonly trace: string[] = [];

  add(test: PayLinkTest): Promise<void> {
    this.trace.push(`add:${test.id}`);
    this.rows.set(test.id, test.toPersistence());
    return Promise.resolve();
  }

  /** Le verrou n'a pas de sens en mémoire : les tests d'application sont séquentiels. */
  loadLocked(id: string): Promise<PayLinkTest | null> {
    return this.load(id);
  }

  load(id: string): Promise<PayLinkTest | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row === undefined ? null : PayLinkTest.rehydrate(row));
  }

  save(test: PayLinkTest): Promise<void> {
    this.trace.push(`save:${test.id}:${test.state}`);
    this.rows.set(test.id, test.toPersistence());
    return Promise.resolve();
  }

  lockSending(): Promise<void> {
    this.trace.push("lock");
    return Promise.resolve();
  }

  countSentOnParisDayOf(instant: Date): Promise<number> {
    const day = PARIS_DAY.format(instant);
    return Promise.resolve(
      [...this.rows.values()].filter((row) => PARIS_DAY.format(row.createdAt) === day).length,
    );
  }
}

/** La liste, lue dans le même dépôt en mémoire. */
export class InMemoryPayLinkTestReader extends PayLinkTestReader {
  constructor(private readonly tests: InMemoryPayLinkTests) {
    super();
  }

  recent(limit: number): Promise<readonly PayLinkTest[]> {
    return Promise.resolve(
      [...this.tests.rows.values()]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map((row) => PayLinkTest.rehydrate(row)),
    );
  }
}

/** Une demande de reste, telle que le double l'a reçue. */
export interface RemainderCall {
  readonly target: CardRefundTarget;
  readonly request: RemainderRefundRequest;
}

/** Le remboursement par carte, doublé : il range les demandes de reste. */
export class RecordingCardRefunds extends CardRefunds {
  readonly remainders: RemainderCall[] = [];

  requestRemainder(
    target: CardRefundTarget,
    request: RemainderRefundRequest,
  ): Promise<readonly RequestedCardRefund[]> {
    this.remainders.push({ target, request });
    return Promise.resolve([]);
  }

  requestAmount(_request: AmountRefundRequest): Promise<RequestedCardRefund> {
    return Promise.reject(new TypeError("requestAmount : hors du périmètre de ce double"));
  }

  retry(_requestId: string): Promise<void> {
    return Promise.reject(new TypeError("retry : hors du périmètre de ce double"));
  }
}

/** La cloche, en mémoire. */
export class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

/** Une position : `charged` encaissé, `refunded` rendu. */
export function positionOf(
  subject: CardSubject,
  charged: number,
  refunded: number,
): SubjectRefundPosition {
  return {
    subject,
    chargedCents: charged,
    refundedCents: refunded,
    refundedByNature: { return: refunded, adjustment: 0, unattributed: 0 },
    inFlightByForm: { remainder: 0, amount: 0, unattributed: 0 },
  };
}

/**
 * La porte des liens, sans base : chaque sujet ouvert reçoit une adresse
 * `https://app.lfc.test/payer/tok_<n>`.
 */
export class RecordingPayLinks extends PayLinks {
  readonly opened: { readonly subject: CardSubject; readonly request: PayLinkRequest }[] = [];
  private readonly live = new Map<string, string>();

  open(subject: CardSubject, request: PayLinkRequest): Promise<OpenedPayLink> {
    this.opened.push({ subject, request });
    const key = `${subject.type}:${subject.id}`;
    const url =
      this.live.get(key) ?? `https://app.lfc.test/payer/tok_${String(this.opened.length)}`;
    this.live.set(key, url);
    return Promise.resolve({ linkId: `paylink_${subject.id}`, url });
  }

  revoke(subject: CardSubject): Promise<boolean> {
    return Promise.resolve(this.live.delete(`${subject.type}:${subject.id}`));
  }

  urlOf(subject: CardSubject): Promise<string | null> {
    return Promise.resolve(this.live.get(`${subject.type}:${subject.id}`) ?? null);
  }

  urlsOf(subjects: readonly CardSubject[]): Promise<readonly SubjectPayLinkUrl[]> {
    return Promise.resolve(
      subjects.flatMap((subject) => {
        const url = this.live.get(`${subject.type}:${subject.id}`);
        return url === undefined ? [] : [{ subject, url }];
      }),
    );
  }
}
