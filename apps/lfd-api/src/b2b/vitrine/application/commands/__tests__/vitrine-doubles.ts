import { Buffer } from "node:buffer";

import type {
  ContentLocale,
  ShopCatalogueView,
  VitrineDeliveryView,
  VitrineSubscriberView,
} from "@lfd/contracts";

import { AesGcmFieldCipher } from "../../../../../platform/crypto/aes-gcm-field-cipher.js";
import {
  WebhookPoster,
  type WebhookPost,
  type WebhookPostOutcome,
} from "../../../../../platform/outbound/webhook-poster.js";
import { FixedSecretGenerator } from "../../../../../platform/secret/fixed-secret-generator.js";
import { VitrineDeliveryReader } from "../../../domain/ports/vitrine-delivery.reader.js";
import { VitrineDeliveryRepository } from "../../../domain/ports/vitrine-delivery.repository.js";
import { VitrineFingerprintStore } from "../../../domain/ports/vitrine-fingerprint.store.js";
import { VitrineShowcaseSource } from "../../../domain/ports/vitrine-showcase.source.js";
import {
  type VitrineReadKeyHolder,
  VitrineSubscriberReader,
} from "../../../domain/ports/vitrine-subscriber.reader.js";
import { VitrineSubscriberRepository } from "../../../domain/ports/vitrine-subscriber.repository.js";
import type { VitrineElementPrint } from "../../../domain/services/vitrine-fingerprints.js";
import { hashVitrineReadKey } from "../../../domain/services/vitrine-read-key.js";
import type { VitrineContents } from "../../../domain/vitrine-contents.js";
import type { VitrineDelivery } from "../../../domain/vitrine-delivery.js";
import { VitrineSubscriber } from "../../../domain/vitrine-subscriber.js";
import { VitrineCredentialsMint } from "../../services/vitrine-credentials.js";
import { catalogue } from "../../../domain/__tests__/vitrine-fixtures.js";

/** Le chiffreur réel, sous une clé de test : pur, sans réseau. */
export function testCipher(): AesGcmFieldCipher {
  return new AesGcmFieldCipher(Buffer.alloc(32, 7));
}

export function testMint(cipher = testCipher()): VitrineCredentialsMint {
  return new VitrineCredentialsMint(new FixedSecretGenerator("S"), cipher);
}

/** Les abonnés en mémoire — l'écriture ET la lecture par la clé, comme la table. */
export class MemorySubscribers extends VitrineSubscriberRepository {
  readonly rows = new Map<string, VitrineSubscriber>();
  saves = 0;

  constructor(...subscribers: VitrineSubscriber[]) {
    super();
    subscribers.forEach((subscriber) => this.rows.set(subscriber.id, subscriber));
  }

  load(id: string): Promise<VitrineSubscriber | null> {
    const found = this.rows.get(id);
    return Promise.resolve(
      found === undefined ? null : VitrineSubscriber.rehydrate(found.toPersistence()),
    );
  }

  save(subscriber: VitrineSubscriber): Promise<void> {
    this.saves += 1;
    this.rows.set(subscriber.id, VitrineSubscriber.rehydrate(subscriber.toPersistence()));
    return Promise.resolve();
  }

  listDeliverable(): Promise<readonly VitrineSubscriber[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((subscriber) => subscriber.isDeliverable)
        .map((subscriber) => VitrineSubscriber.rehydrate(subscriber.toPersistence())),
    );
  }
}

export class KeyedSubscribers extends VitrineSubscriberReader {
  constructor(private readonly byKey: ReadonlyMap<string, VitrineReadKeyHolder>) {
    super();
  }

  static of(readKey: string, contents: VitrineContents, active = true): KeyedSubscribers {
    return new KeyedSubscribers(new Map([[hashVitrineReadKey(readKey), { contents, active }]]));
  }

  list(): Promise<readonly VitrineSubscriberView[]> {
    return Promise.resolve([]);
  }

  holderOfReadKey(readKeyHash: string): Promise<VitrineReadKeyHolder | null> {
    return Promise.resolve(this.byKey.get(readKeyHash) ?? null);
  }
}

export class MemoryDeliveries extends VitrineDeliveryRepository {
  readonly rows = new Map<string, VitrineDelivery>();

  load(id: string): Promise<VitrineDelivery | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  save(delivery: VitrineDelivery): Promise<void> {
    this.rows.set(delivery.id, delivery);
    return Promise.resolve();
  }

  pendingChangeOf(subscriberId: string): Promise<VitrineDelivery | null> {
    const found = [...this.rows.values()].find(
      (delivery) =>
        delivery.subscriberId === subscriberId && delivery.kind === "change" && delivery.isPending,
    );
    return Promise.resolve(found ?? null);
  }

  listDue(now: Date, limit: number): Promise<readonly VitrineDelivery[]> {
    const due = [...this.rows.values()].filter((delivery) => {
      const next = delivery.toPersistence().nextAttemptAt;
      return delivery.isPending && next !== null && next <= now;
    });
    return Promise.resolve(due.slice(0, limit));
  }

  all(): readonly VitrineDelivery[] {
    return [...this.rows.values()];
  }
}

export class NoDeliveryJournal extends VitrineDeliveryReader {
  listForSubscriber(): Promise<readonly VitrineDeliveryView[]> {
    return Promise.resolve([]);
  }
}

export class MemoryPrints extends VitrineFingerprintStore {
  readonly rows = new Map<string, Map<string, VitrineElementPrint>>();

  load(subscriberId: string): Promise<readonly VitrineElementPrint[]> {
    return Promise.resolve([...(this.rows.get(subscriberId)?.values() ?? [])]);
  }

  record(
    subscriberId: string,
    upserts: readonly VitrineElementPrint[],
    removals: readonly Pick<VitrineElementPrint, "kind" | "key">[],
    _at: Date,
  ): Promise<void> {
    const rows = this.rows.get(subscriberId) ?? new Map<string, VitrineElementPrint>();
    upserts.forEach((print) => rows.set(`${print.kind}:${print.key}`, print));
    removals.forEach((removal) => rows.delete(`${removal.kind}:${removal.key}`));
    this.rows.set(subscriberId, rows);
    return Promise.resolve();
  }

  forget(subscriberId: string): Promise<void> {
    this.rows.delete(subscriberId);
    return Promise.resolve();
  }
}

/** La boutique jouée : une vue (la même dans chaque langue) qu'on remplace à la main. */
export class StaticShowcase extends VitrineShowcaseSource {
  view: ShopCatalogueView = catalogue();
  textsByKey: Readonly<Record<string, string>> = { "product.bestSeller": "Incontournable" };
  catalogueReads = 0;

  catalogue(_language: ContentLocale): Promise<ShopCatalogueView> {
    this.catalogueReads += 1;
    return Promise.resolve(this.view);
  }

  texts(_language: ContentLocale): Promise<Readonly<Record<string, string>>> {
    return Promise.resolve(this.textsByKey);
  }
}

/** L'agence jouée : répond ce qu'on lui dit, et garde ce qu'elle a reçu. */
export class ScriptedPoster extends WebhookPoster {
  readonly received: WebhookPost[] = [];
  outcome: WebhookPostOutcome = { kind: "accepted", status: 204 };

  post(request: WebhookPost): Promise<WebhookPostOutcome> {
    this.received.push(request);
    return Promise.resolve(this.outcome);
  }
}
