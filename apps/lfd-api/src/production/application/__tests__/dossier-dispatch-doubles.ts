import type { CatalogFamilyView } from "@lfd/contracts";
import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { AppConfig } from "../../../platform/config/app-config.js";
import type { B2bMailer } from "../../../platform/mailer/mailer.tokens.js";
import type { B2bMails } from "../../../platform/mailer/mail-templates.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../staff/notifications/domain/ports/staff-notifier.js";
import { WorkshopShelvesReader } from "../../channels/commerce/workshop-shelves.reader.js";
import type { ProductionDay } from "../../domain/entities/production-day.js";
import {
  DossierDispatchLog,
  type DossierDispatchOutcome,
  type DossierDispatchSlot,
} from "../../domain/ports/dossier-dispatch.log.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";

/** La journée doublée : une seule, relue telle quelle. */
export class OneDay extends ProductionDayRepository {
  constructor(readonly current: ProductionDay) {
    super();
  }

  load(): Promise<ProductionDay> {
    return Promise.resolve(this.current);
  }

  save(): Promise<void> {
    return Promise.reject(new TypeError("l'envoi du dossier n'écrit pas la journée"));
  }
}

/** La trace doublée : l'unicité de la clé, comme la clé primaire. */
export class DispatchTable extends DossierDispatchLog {
  readonly rows = new Map<string, { name: string; outcome: DossierDispatchOutcome | null }>();

  claim(slot: DossierDispatchSlot, recipientName: string): Promise<boolean> {
    const key = keyOf(slot);
    if (this.rows.has(key)) {
      return Promise.resolve(false);
    }
    this.rows.set(key, { name: recipientName, outcome: null });
    return Promise.resolve(true);
  }

  settle(slot: DossierDispatchSlot, outcome: DossierDispatchOutcome): Promise<void> {
    const row = this.rows.get(keyOf(slot));
    if (row === undefined) {
      return Promise.reject(new RangeError("envoi non pris"));
    }
    row.outcome = outcome;
    return Promise.resolve();
  }
}

function keyOf(slot: DossierDispatchSlot): string {
  return `${slot.serviceDay}|${slot.occasionAt.toISOString()}|${slot.recipientId}`;
}

/** Le mailer doublé : il garde ce qu'on lui confie, et refuse les adresses désignées. */
export class RecordingMailer implements B2bMailer {
  readonly enabled = true;
  readonly sent: SendMailArgs<B2bMails>[] = [];
  readonly refused = new Set<string>();

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    if (this.refused.has(args.to)) {
      return Promise.reject(new RangeError("adresse refusée par le fournisseur"));
    }
    this.sent.push(args);
    return Promise.resolve({ providerId: `re_${String(this.sent.length)}` });
  }
}

/** La cloche doublée : l'unicité de la clé d'idempotence, comme la vraie table. */
export class Bell extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    for (const notice of notices) {
      if (!this.notices.some((kept) => kept.idempotencyKey === notice.idempotencyKey)) {
        this.notices.push(notice);
      }
    }
    return Promise.resolve();
  }
}

/** Les rayons : tout en Viennoiseries. */
export class Shelves extends WorkshopShelvesReader {
  shelvesOf(): Promise<ReadonlyMap<string, CatalogFamilyView>> {
    return Promise.resolve(
      new Map([["VIE-001", { id: "fam-vien", name: "Viennoiseries", position: 0 }]]),
    );
  }
}

/** Sans origine du back-office : aucun QR, le papier reste juste. */
export class NoAdminOrigin extends AppConfig {
  override adminBaseUrl(): string | null {
    return null;
  }
}
