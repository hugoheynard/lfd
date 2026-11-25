import {
  DeliveryNoteVersionKeeper,
  type KeptDeliveryNote,
} from "../../domain/ports/delivery-note-version.keeper.js";
import {
  type DeliveryNoteVersionRecord,
  DeliveryNoteVersionWriter,
} from "../../domain/ports/delivery-note-version.writer.js";
import {
  type DeliveryNoteVersionSummary,
  DeliveryNoteVersionRenderedReader,
  DeliveryNoteVersionsReader,
} from "../../domain/ports/delivery-note-versions.reader.js";
import type { DeliveryNoteVersionCause } from "../../domain/services/delivery-note-version.js";
import type { RenderedClientNote } from "../../domain/services/rendered-client-note.js";

/** Les versions rangées, par bon — vide par défaut. */
export class FixedVersions extends DeliveryNoteVersionsReader {
  constructor(
    private readonly byNote: ReadonlyMap<string, readonly DeliveryNoteVersionSummary[]> = new Map(),
  ) {
    super();
  }

  versionsOf(
    noteIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly DeliveryNoteVersionSummary[]>> {
    return Promise.resolve(
      new Map([...this.byNote].filter(([noteId]) => noteIds.includes(noteId))),
    );
  }
}

/** Une entrée figée par `(bon, version)`. */
export class FixedRendered extends DeliveryNoteVersionRenderedReader {
  readonly asked: string[] = [];

  constructor(private readonly kept: ReadonlyMap<string, RenderedClientNote> = new Map()) {
    super();
  }

  renderedOf(noteId: string, contentVersion: number): Promise<RenderedClientNote | null> {
    const key = `${noteId}:${String(contentVersion)}`;
    this.asked.push(key);
    return Promise.resolve(this.kept.get(key) ?? null);
  }
}

/** Garde ce qu'on lui donne à ranger. */
export class RecordingVersionWriter extends DeliveryNoteVersionWriter {
  readonly recorded: DeliveryNoteVersionRecord[] = [];

  record(version: DeliveryNoteVersionRecord): Promise<void> {
    this.recorded.push(version);
    return Promise.resolve();
  }
}

/** Garde chaque appel du dépôt : quel bon, quelle version, quelle cause. */
export class RecordingKeeper extends DeliveryNoteVersionKeeper {
  readonly kept: {
    readonly note: KeptDeliveryNote;
    readonly contentVersion: number;
    readonly cause: DeliveryNoteVersionCause;
  }[] = [];

  keep(
    note: KeptDeliveryNote,
    contentVersion: number,
    cause: DeliveryNoteVersionCause,
  ): Promise<void> {
    this.kept.push({ note, contentVersion, cause });
    return Promise.resolve();
  }
}
