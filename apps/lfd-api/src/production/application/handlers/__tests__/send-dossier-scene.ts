import type { Buffer } from "node:buffer";

import { instantToLocal } from "@lfd/contracts";
import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { AmbientAfterCommit } from "../../../../platform/database/after-commit.js";
import {
  CommitQueue,
  currentTransaction,
  runInTransaction,
} from "../../../../platform/database/transaction.store.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import type { B2bMails } from "../../../../platform/mailer/mail-templates.js";
import type { DurableSubscriber } from "../../../../platform/outbox/durable-handler.js";
import type { ProductionDocumentStore } from "../../../../platform/storage/production-document-store.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDayClosedEvent } from "../../../channels/commerce/production-day-closed.event.js";
import { ProductionDayRetakenEvent } from "../../../channels/delivery/index.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import {
  DossierRecipientsReader,
  type StoredDossierRecipient,
} from "../../../domain/ports/dossier-recipients.reader.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { Directory, RecipientsRows, staffCard } from "../../__tests__/dossier-recipient-doubles.js";
import {
  Bell,
  DispatchTable,
  NoAdminOrigin,
  OneDay,
  RecordingMailer,
  Shelves,
} from "../../__tests__/dossier-dispatch-doubles.js";
import { InMemoryProductionStore } from "../../__tests__/quality-doubles.js";
import { DossierDispatch } from "../../services/dossier-dispatch.service.js";
import { PlanArrestBell } from "../../services/plan-arrest-bell.js";
import { ProductionPapers } from "../../services/production-paper.service.js";
import { SendDossierOnDayClosed } from "../send-dossier-on-day-closed.handler.js";
import { SendDossierOnDayRetaken } from "../send-dossier-on-day-retaken.handler.js";

/**
 * **La scène des deux abonnés du dossier du jour** (plan
 * `dossier-prod-du-jour.md`, E3), partagée par `send-dossier.handlers.spec.ts`
 * (ce qui part, et à qui) et `send-dossier-after-commit.spec.ts` (quand : après
 * la validation du reçu, audit B1).
 *
 * Le jour est dérivé de maintenant ; les instants de clôture et de retirage ne
 * sont que recopiés, jamais comparés à l'horloge.
 */
export const NOW = new Date();
export const DAY = instantToLocal(NOW).day;
export const CLOSED = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
export const RETAKEN = new Date(NOW.getTime() - 60 * 60 * 1000);

export const PAUL: StoredDossierRecipient = { id: "r-paul", kind: "staff", staffUserId: "s-paul" };
export const JEANNE: StoredDossierRecipient = {
  id: "r-jeanne",
  kind: "external",
  email: "jeanne@imprimerie.fr",
  firstName: "Jeanne",
  lastName: "Roux",
  jobTitle: null,
};

export function order(orderId: string, quantity: number): ProducibleOrder {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: null,
    sheetDetails: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity }],
  };
}

export function closedDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([order("ord_1", 12)], CLOSED, null);
  return day;
}

/** Une journée arrêtée, puis reprise à `RETAKEN` avec une commande de plus. */
export function retakenDay(): ProductionDay {
  const day = closedDay();
  day.retake([order("ord_1", 12), order("ord_2", 4)], RETAKEN, "staff-1", null);
  return day;
}

export function closure(reannouncedAt: Date | null = null) {
  const fact = new ProductionDayClosedEvent(DAY, CLOSED, ["ord_1"], reannouncedAt).durableFact();
  return { eventId: "evt-1", type: fact.type, payload: fact.payload };
}

export function retake(at: Date = RETAKEN) {
  const fact = new ProductionDayRetakenEvent(DAY, at, 1, ["o1"]).durableFact();
  return { eventId: "evt-2", type: fact.type, payload: fact.payload };
}

/** Le client de la transaction de la garde : jamais lu, seulement ambiant. */
export const GUARD_TX = {};

/** Laisse partir ce qui aurait été lancé sans être attendu. */
export const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Note, à chaque envoi, s'il part sous une transaction ambiante. */
export class TransactionWitnessMailer extends RecordingMailer {
  readonly underTransaction: boolean[] = [];

  override send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.underTransaction.push(currentTransaction() !== undefined);
    return super.send(args);
  }
}

/** La journée qu'on ne relit pas : une panne de base, ou une ligne hors contrat. */
export class UnreadableDay extends ProductionDayRepository {
  load(): Promise<ProductionDay> {
    return Promise.reject(new RangeError("journée illisible"));
  }

  save(): Promise<void> {
    return Promise.reject(new TypeError("l'envoi du dossier n'écrit pas la journée"));
  }
}

/** La liste des destinataires qu'on ne relit pas. */
export class UnreadableRecipients extends DossierRecipientsReader {
  list(): Promise<readonly StoredDossierRecipient[]> {
    return Promise.reject(new RangeError("liste des destinataires illisible"));
  }
}

/**
 * Le stockage des papiers dont la lecture lève une erreur que l'adaptateur
 * n'a pas classée « indisponible » : le papier ne se fabrique pas.
 */
export class UnreadableArchive extends InMemoryProductionStore {
  override readIfPresent(): Promise<Buffer | null> {
    return Promise.reject(new RangeError("archive illisible"));
  }
}

/**
 * L'abonné tel que la garde le fait tourner : `handle` dans une transaction,
 * puis la validation — la file d'après validation se vide —, puis le travail
 * de fond qu'elle a lancé. Les cas métier se lisent ainsi sur le vrai chemin.
 */
export function guarded(handler: DurableSubscriber, work: BackgroundWork): DurableSubscriber {
  return {
    handle: async (delivery) => {
      const commits = new CommitQueue();
      await runInTransaction(GUARD_TX, () => handler.handle(delivery), commits);
      commits.flush();
      await work.whenIdle();
    },
  };
}

/** Les ports qu'un test remplace par une panne. */
export interface SceneOptions {
  readonly days?: ProductionDayRepository;
  readonly recipients?: DossierRecipientsReader;
  readonly store?: ProductionDocumentStore;
}

export function setup(
  rows: readonly StoredDossierRecipient[],
  day: ProductionDay = closedDay(),
  options: SceneOptions = {},
) {
  const mailer = new TransactionWitnessMailer();
  const log = new DispatchTable();
  const bell = new Bell();
  const events = new RecordingPublisher();
  const dispatch = new DossierDispatch(
    options.recipients ?? new RecipientsRows(rows),
    new Directory().put(staffCard()),
    new ProductionPapers(
      options.store ?? new InMemoryProductionStore(),
      new NoAdminOrigin(),
      new Shelves(),
    ),
    log,
    mailer,
    new PlanArrestBell(bell),
    events,
    new FixedClock(NOW),
  );
  const days = options.days ?? new OneDay(day);
  const work = new BackgroundWork();
  const afterCommit = new AmbientAfterCommit();
  const handlers = {
    closed: new SendDossierOnDayClosed(days, dispatch, afterCommit, work),
    retaken: new SendDossierOnDayRetaken(days, dispatch, afterCommit, work),
  };
  return {
    mailer,
    log,
    bell,
    events,
    day,
    work,
    handlers,
    closed: guarded(handlers.closed, work),
    retaken: guarded(handlers.retaken, work),
  };
}
