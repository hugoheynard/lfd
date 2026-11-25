import type { EventDetailView, EventSummaryView } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { InMemoryGestureIntentLedger } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { OncePerIntent } from "../../../../../platform/intent/once-per-intent.js";
import type { StoredDocument } from "../../../../../platform/storage/document-store.js";
import { ProductionDocumentStore } from "../../../../../platform/storage/production-document-store.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { Event } from "../../../domain/entities/event.js";
import { EventReader, type EventWindow } from "../../../domain/ports/event.reader.js";
import { EventRepository } from "../../../domain/ports/event.repository.js";
import { AT } from "../../../domain/entities/__tests__/event-fixtures.js";

/** Le dépôt en mémoire : il garde l'agrégat tel qu'il a été rendu. */
export class InMemoryEventRepository extends EventRepository {
  readonly saved = new Map<string, Event>();
  saves = 0;

  load(eventId: string): Promise<Event | null> {
    return Promise.resolve(this.saved.get(eventId) ?? null);
  }

  save(event: Event): Promise<void> {
    this.saves += 1;
    this.saved.set(event.id, event);
    return Promise.resolve();
  }
}

/** Un dépôt dont l'écriture échoue — la base tombe après le rangement. */
export class FailingEventRepository extends InMemoryEventRepository {
  override save(): Promise<void> {
    return Promise.reject(new Error("base indisponible"));
  }
}

/** Le stockage en mémoire, qui note chaque geste. */
export class InMemoryProductionStore extends ProductionDocumentStore {
  readonly objects = new Map<string, StoredDocument>();
  readonly deleted: string[] = [];

  save(key: string, document: StoredDocument): Promise<string> {
    this.objects.set(key, document);
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    return found === undefined
      ? Promise.reject(new Error(`absent : ${key}`))
      : Promise.resolve(found.bytes);
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(key)?.bytes ?? null);
  }

  delete(key: string): Promise<void> {
    this.deleted.push(key);
    this.objects.delete(key);
    return Promise.resolve();
  }
}

/** Le lecteur qui rend ce qu'on lui a donné, et note ce qu'on lui a demandé. */
export class RecordingEventReader extends EventReader {
  readonly asked: { window: EventWindow; today: string }[] = [];

  constructor(
    private readonly rows: readonly EventSummaryView[] = [],
    private readonly details: ReadonlyMap<string, EventDetailView> = new Map(),
  ) {
    super();
  }

  list(window: EventWindow, today: string): Promise<readonly EventSummaryView[]> {
    this.asked.push({ window, today });
    return Promise.resolve(this.rows);
  }

  detail(eventId: string): Promise<EventDetailView | null> {
    return Promise.resolve(this.details.get(eventId) ?? null);
  }
}

/** Les ports ambiants d'un handler d'écriture, prêts à l'emploi. */
export function ambient() {
  const clock = new FixedClock(AT);
  return {
    clock,
    ids: new FixedIdGenerator("evt"),
    uow: new DirectUnitOfWork(),
    intents: new OncePerIntent(new InMemoryGestureIntentLedger(), clock),
  };
}
