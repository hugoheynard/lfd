import { Buffer } from "node:buffer";

import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import {
  BusinessError,
  ResourceNotFoundError,
} from "../../../../../platform/shared/errors/app-error.js";
import { DocumentStorageUnavailableError } from "../../../../../platform/shared/errors/storage-errors.js";
import {
  DocumentStore,
  type StoredDocument,
} from "../../../../../platform/storage/document-store.js";
import {
  type PhotoCard,
  PhotoCardList,
  type PhotoCardText,
} from "../../domain/entities/photo-card-list.js";
import {
  addPhotoCard,
  removePhotoCard,
  reorderPhotoCards,
  revisePhotoCard,
} from "../photo-card-editing.js";
import type { InTransaction, OrphanPhotoReason, PhotoCardUsage } from "../photo-card-usage.js";

/** Une trace qui n'écrit rien : la mécanique se teste sans journal. */
const NOTHING_TO_TRACE: InTransaction = () => Promise.resolve();

/**
 * **La séquence d'écriture des cartes à photo**, sur un usage de test : un
 * tableau de cartes ajoutées EN TÊTE — l'autre côté que la procédure, dont les
 * suites de `account` éprouvent déjà le sien.
 *
 * Tout écrit dans un même journal de gestes : l'ordre « vérifier → ranger →
 * verrou → charger → sauver → tracer → supprimer l'ancienne » est le sujet, et
 * il ne se lit qu'en un seul endroit.
 */

class CardNotFoundError extends ResourceNotFoundError {
  constructor(cardId: string) {
    super("test.card_not_found", `carte ${cardId} introuvable`);
  }
}

class OrderStaleError extends BusinessError {
  constructor() {
    super("test.order_stale", "ordre périmé");
  }
}

class TargetRefusedError extends ResourceNotFoundError {
  constructor() {
    super("test.target_refused", "cible refusée");
  }
}

/** L'agrégat de test : un id, et la liste du socle en tête. */
class Board {
  constructor(
    readonly id: string,
    readonly cards: PhotoCardList<PhotoCardText>,
  ) {}
}

const BOARD_RULES = {
  max: 3,
  insertAt: "start" as const,
  refusals: {
    full: () => new OrderStaleError(),
    cardNotFound: (cardId: string) => new CardNotFoundError(cardId),
    orderStale: () => new OrderStaleError(),
  },
};

interface BoardRow {
  readonly id: string;
  readonly cards: readonly PhotoCard<PhotoCardText>[];
}

/** Stockage en mémoire, fidèle au port : `delete` d'une clé absente réussit. */
class InMemoryStore extends DocumentStore {
  readonly objects = new Map<string, StoredDocument>();
  failDelete = false;

  constructor(private readonly log: string[]) {
    super();
  }

  save(key: string, document: StoredDocument): Promise<string> {
    this.log.push(`store:save:${key}`);
    this.objects.set(key, document);
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    return found === undefined
      ? Promise.reject(new DocumentStorageUnavailableError(`« ${key} » est absent.`))
      : Promise.resolve(found.bytes);
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(key)?.bytes ?? null);
  }

  delete(key: string): Promise<void> {
    if (this.failDelete) {
      return Promise.reject(new DocumentStorageUnavailableError("bucket en panne (double)."));
    }
    this.log.push(`store:delete:${key}`);
    this.objects.delete(key);
    return Promise.resolve();
  }
}

/** Une unité de travail qui note son ouverture et sa fermeture. */
class LoggedUnitOfWork extends UnitOfWork {
  constructor(private readonly log: string[]) {
    super();
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.log.push("uow:open");
    try {
      return await work();
    } finally {
      this.log.push("uow:close");
    }
  }
}

const TARGET = "t1";
const PHOTO: StoredDocument = { bytes: Buffer.from("png"), contentType: "image/png" };

function scene() {
  const log: string[] = [];
  const orphans: { reason: OrphanPhotoReason; key: string }[] = [];
  const rows = new Map<string, BoardRow>();
  const control = { refuseTarget: false, failSave: false };
  const store = new InMemoryStore(log);
  const ports = { store, ids: new FixedIdGenerator(), uow: new LoggedUnitOfWork(log) };

  const usage: PhotoCardUsage<string, Board, PhotoCardText> = {
    identity: {
      ensure: (target) => {
        log.push(`ensure:${target}`);
        return control.refuseTarget ? Promise.reject(new TargetRefusedError()) : Promise.resolve();
      },
      lock: (target) => {
        log.push(`lock:${target}`);
        return Promise.resolve();
      },
      photoKey: (target, cardId, revision) => `boards/${target}/${cardId}-${revision}`,
    },
    aggregates: {
      load: (target) => {
        log.push(`load:${target}`);
        const row = rows.get(target);
        return Promise.resolve(
          row === undefined ? null : new Board(row.id, PhotoCardList.of(BOARD_RULES, row.cards)),
        );
      },
      open: (_, id) => new Board(id, PhotoCardList.empty(BOARD_RULES)),
      save: (board) => {
        if (control.failSave) {
          return Promise.reject(new DocumentStorageUnavailableError("base en panne (double)."));
        }
        log.push("save");
        rows.set(TARGET, { id: board.id, cards: board.cards.snapshot() });
        return Promise.resolve();
      },
    },
    gestures: {
      add: (board, cardId, content, photoKey) => board.cards.add(cardId, content, photoKey),
      revise: (board, cardId, content) => board.cards.revise(cardId, content),
      attachPhoto: (board, cardId, photoKey) => board.cards.attachPhoto(cardId, photoKey),
      detachPhoto: (board, cardId) => board.cards.detachPhoto(cardId),
      remove: (board, cardId) => board.cards.remove(cardId),
      reorder: (board, cardIds) => board.cards.reorder(cardIds),
    },
    missing: {
      cardNotFound: (cardId) => new CardNotFoundError(cardId),
      orderStale: () => new OrderStaleError(),
    },
    orphans: { remained: (reason, key) => orphans.push({ reason, key }) },
  };

  const trace = () => {
    log.push("trace");
    return Promise.resolve();
  };
  const keyOf = (cardId: string) =>
    rows.get(TARGET)?.cards.find((card) => card.id === cardId)?.photoKey;
  const idsOf = () => rows.get(TARGET)?.cards.map((card) => card.id);
  const add = (photo: StoredDocument | null = PHOTO, title = "Note") =>
    addPhotoCard(ports, usage, TARGET, { content: { title, body: "" }, photo }, trace);

  return { log, orphans, rows, control, store, ports, usage, trace, keyOf, idsOf, add };
}

describe("ajouter une carte", () => {
  it("vérifie, range la photo, PUIS écrit sous verrou et trace dans la transaction", async () => {
    const current = scene();
    const cardId = await current.add();

    const key = current.keyOf(cardId) ?? "";
    expect(key).toMatch(new RegExp(`^boards/${TARGET}/${cardId}-`));
    expect(current.log).toEqual([
      `ensure:${TARGET}`,
      `store:save:${key}`,
      "uow:open",
      `lock:${TARGET}`,
      `load:${TARGET}`,
      "save",
      "trace",
      "uow:close",
    ]);
  });

  it("ouvre l'agrégat à la première carte, puis range du côté de l'usage", async () => {
    const current = scene();
    const first = await current.add(null, "Un");
    const second = await current.add(null, "Deux");
    expect(current.idsOf()).toEqual([second, first]);
    expect(current.store.objects.size).toBe(0);
  });

  it("ne range rien quand la cible est refusée", async () => {
    const current = scene();
    current.control.refuseTarget = true;
    await expect(current.add()).rejects.toBeInstanceOf(TargetRefusedError);
    expect(current.log).toEqual([`ensure:${TARGET}`]);
  });

  it("retire la photo neuve quand l'écriture échoue", async () => {
    const current = scene();
    current.control.failSave = true;
    await expect(current.add()).rejects.toBeInstanceOf(DocumentStorageUnavailableError);
    expect(current.store.objects.size).toBe(0);
  });

  it("retire la photo neuve quand l'agrégat refuse (borne atteinte)", async () => {
    const current = scene();
    for (let index = 0; index < BOARD_RULES.max; index += 1) {
      await current.add(null, `Note ${index}`);
    }
    await expect(current.add()).rejects.toBeInstanceOf(OrderStaleError);
    expect(current.store.objects.size).toBe(0);
  });
});

describe("refaire une carte", () => {
  async function withPhoto() {
    const current = scene();
    const cardId = await current.add();
    const oldKey = current.keyOf(cardId) ?? "";
    current.log.length = 0;
    return { current, cardId, oldKey };
  }

  it("remplace : range la neuve, écrit, PUIS supprime l'ancienne après la transaction", async () => {
    const { current, cardId, oldKey } = await withPhoto();
    const change = { kind: "replace" as const, photo: PHOTO };
    await revisePhotoCard(
      current.ports,
      current.usage,
      TARGET,
      cardId,
      { content: { title: "Refaite", body: "" }, change },
      current.trace,
    );
    const newKey = current.keyOf(cardId) ?? "";
    expect(newKey).not.toBe(oldKey);
    expect(current.log).toEqual([
      `ensure:${TARGET}`,
      `store:save:${newKey}`,
      "uow:open",
      `lock:${TARGET}`,
      `load:${TARGET}`,
      "save",
      "trace",
      "uow:close",
      `store:delete:${oldKey}`,
    ]);
  });

  it("retire la photo, puis la supprime du stockage", async () => {
    const { current, cardId, oldKey } = await withPhoto();
    await revisePhotoCard(
      current.ports,
      current.usage,
      TARGET,
      cardId,
      { content: { title: "Sans photo", body: "" }, change: { kind: "remove" } },
      NOTHING_TO_TRACE,
    );
    expect(current.keyOf(cardId)).toBeNull();
    expect(current.log.at(-1)).toBe(`store:delete:${oldKey}`);
  });

  it("garde la photo quand seul le texte change", async () => {
    const { current, cardId, oldKey } = await withPhoto();
    await revisePhotoCard(
      current.ports,
      current.usage,
      TARGET,
      cardId,
      { content: { title: "Texte seul", body: "" }, change: { kind: "keep" } },
      NOTHING_TO_TRACE,
    );
    expect(current.keyOf(cardId)).toBe(oldKey);
    expect(current.log.filter((entry) => entry.startsWith("store:"))).toEqual([]);
  });

  it("réussit quand l'ancienne photo reste au stockage, et le journalise", async () => {
    const { current, cardId, oldKey } = await withPhoto();
    current.store.failDelete = true;
    await revisePhotoCard(
      current.ports,
      current.usage,
      TARGET,
      cardId,
      { content: { title: "Refaite", body: "" }, change: { kind: "replace", photo: PHOTO } },
      NOTHING_TO_TRACE,
    );
    expect(current.orphans).toEqual([{ reason: "replaced_or_removed", key: oldKey }]);
  });

  it("refuse une carte d'une cible sans agrégat, avec la fabrique de l'usage", async () => {
    const current = scene();
    await expect(
      revisePhotoCard(
        current.ports,
        current.usage,
        TARGET,
        "ghost",
        { content: { title: "x", body: "" }, change: { kind: "replace", photo: PHOTO } },
        NOTHING_TO_TRACE,
      ),
    ).rejects.toBeInstanceOf(CardNotFoundError);
    expect(current.store.objects.size).toBe(0);
  });
});

describe("retirer une carte", () => {
  it("écrit, PUIS supprime sa photo ; journalise si elle reste", async () => {
    const current = scene();
    const cardId = await current.add();
    const key = current.keyOf(cardId) ?? "";
    current.store.failDelete = true;

    await removePhotoCard(current.ports, current.usage, TARGET, cardId, NOTHING_TO_TRACE);

    expect(current.idsOf()).toEqual([]);
    expect(current.orphans).toEqual([{ reason: "card_removed", key }]);
  });

  it("refuse sur une cible sans agrégat (introuvable)", async () => {
    const current = scene();
    await expect(
      removePhotoCard(current.ports, current.usage, TARGET, "ghost", NOTHING_TO_TRACE),
    ).rejects.toBeInstanceOf(CardNotFoundError);
  });
});

describe("réordonner", () => {
  it("écrit l'ordre donné sous verrou", async () => {
    const current = scene();
    const first = await current.add(null, "Un");
    const second = await current.add(null, "Deux");
    current.log.length = 0;
    await reorderPhotoCards(current.ports, current.usage, TARGET, [first, second], current.trace);
    expect(current.idsOf()).toEqual([first, second]);
    expect(current.log).toEqual([
      `ensure:${TARGET}`,
      "uow:open",
      `lock:${TARGET}`,
      `load:${TARGET}`,
      "save",
      "trace",
      "uow:close",
    ]);
  });

  it("refuse l'ordre d'une cible sans agrégat comme un ordre périmé, sans rien écrire", async () => {
    const current = scene();
    await expect(
      reorderPhotoCards(current.ports, current.usage, TARGET, ["ghost"], NOTHING_TO_TRACE),
    ).rejects.toBeInstanceOf(OrderStaleError);
    expect(current.log).not.toContain("save");
  });
});
