import { Buffer } from "node:buffer";

import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../../mail/channels/requests/__tests__/recording-mail.js";
import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { CustomerDocumentStore } from "../../../../platform/storage/customer-document-store.js";
import type { StoredDocument } from "../../../../platform/storage/document-store.js";
import { CompanyNameReader } from "../../../account/domain/ports/company-name.reader.js";
import { InHouseRecap } from "../../domain/entities/in-house-recap.js";
import { InHouseRecapReader } from "../../domain/ports/in-house-recap.reader.js";
import {
  type RecapRecipient,
  RecapRecipientReader,
} from "../../domain/ports/recap-recipient.reader.js";
import { ReplacedRecapReader } from "../../domain/ports/replaced-recap.reader.js";
import type { RecapSourceNote } from "../../domain/services/recap-aggregation.js";
import { RecapMonth } from "../../domain/value-objects/recap-month.js";
import { ResendInHouseRecapHandler } from "../commands/resend-in-house-recap.handler.js";
import { InHouseRecapDocumentKeeper } from "../services/in-house-recap-document-keeper.js";
import { InHouseRecapMailer } from "../services/in-house-recap-mailer.js";
import { MailedInHouseRecapDocument } from "../services/mailed-in-house-recap.document.js";
import { InMemoryInHouseRecaps } from "./in-house-recap-doubles.js";

/** Des instants seulement comparés entre eux : aucun n'est lu contre l'horloge. */
export const OCTOBER = RecapMonth.fromKey("2026-10");
const IN_OCTOBER = new Date("2026-10-12T09:00:00.000Z");
const ISSUED_AT = new Date("2026-11-01T00:30:00.000Z");
export const PAYER = "resto";

/** Le stockage des pièces client ; il refuse d'être appelé dans une transaction. */
export class GuardedKeptStore extends CustomerDocumentStore {
  readonly objects = new Map<string, StoredDocument>();

  constructor(private readonly uow: OpenableUnitOfWork) {
    super();
  }

  save(key: string, document: StoredDocument): Promise<string> {
    if (this.uow.open) {
      return Promise.reject(new TypeError(`stockage appelé dans une transaction (${key})`));
    }
    this.objects.set(key, document);
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    return this.readIfPresent(key).then((bytes) => bytes ?? Buffer.alloc(0));
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    const found = this.objects.get(key);
    return Promise.resolve(found === undefined ? null : Buffer.from(found.bytes));
  }
}

/** Le lecteur de l'écran, sur les récapitulatifs en mémoire. */
export class MemoryRecapReader extends InHouseRecapReader {
  constructor(private readonly recaps: InMemoryInHouseRecaps) {
    super();
  }

  load(recapId: string): Promise<InHouseRecap | null> {
    return this.recaps.load(recapId);
  }
}

export class FixedNames extends CompanyNameReader {
  readonly names = new Map<string, string>([[PAYER, "Restaurant du Port"]]);

  nameOf(companyId: string): Promise<string | null> {
    return Promise.resolve(this.names.get(companyId) ?? null);
  }
}

/** Le remplacement, lu sur les récapitulatifs en mémoire. */
export class MemoryReplaced extends ReplacedRecapReader {
  constructor(private readonly recaps: InMemoryInHouseRecaps) {
    super();
  }

  numberReplacedBy(recapId: string): Promise<string | null> {
    const replaced = [...this.recaps.byId.values()].find(
      (recap) => recap.toState().replacedById === recapId,
    );
    return Promise.resolve(replaced?.number ?? null);
  }
}

export class FixedRecipient extends RecapRecipientReader {
  recipient: RecapRecipient | null = { id: "contact:c_1", email: "compta@resto.test" };

  recipientOf(): Promise<RecapRecipient | null> {
    return Promise.resolve(this.recipient);
  }
}

function note(id: string, quantity: number): RecapSourceNote {
  return {
    deliveryNoteId: id,
    number: `BL-${id}`,
    handedOverAt: IN_OCTOBER,
    contentVersion: 1,
    lines: [{ sku: "CROI", productName: "Croissant", saleUnit: "piece", quantity }],
  };
}

/** Un récapitulatif d'octobre, émis et rangé en mémoire. */
export function issuedRecap(id = "recap-1", number = "RBL-202610-0001"): InHouseRecap {
  return InHouseRecap.issue({
    id,
    payerId: PAYER,
    month: OCTOBER,
    number,
    issuedAt: ISSUED_AT,
    notes: [note("a", 3)],
  });
}

/** Le monde du document : les ports doublés à la main, les services réels. */
export function documentWorld() {
  const uow = new OpenableUnitOfWork();
  const recaps = new InMemoryInHouseRecaps();
  const store = new GuardedKeptStore(uow);
  const names = new FixedNames();
  const recipients = new FixedRecipient();
  const mail = new RecordingMail(uow);
  const keeper = new InHouseRecapDocumentKeeper(
    recaps,
    names,
    new MemoryReplaced(recaps),
    store,
    uow,
  );
  const mailer = new InHouseRecapMailer(recipients, uow, mail);
  const reader = new MemoryRecapReader(recaps);
  return {
    uow,
    recaps,
    reader,
    store,
    names,
    recipients,
    mail,
    keeper,
    mailer,
    document: new MailedInHouseRecapDocument(keeper, mailer),
    resend: new ResendInHouseRecapHandler(reader, keeper, mailer, inMemoryIntents()),
  };
}
