import type { ClientNoteState } from "../domain/entities/client-notebook.js";

/** Une note telle qu'elle est en base au moment d'écrire. */
export interface StoredNoteRow {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  readonly body: string;
  readonly photoKey: string | null;
}

/** Une note à créer, colonnes comprises. */
export interface NoteToCreate {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  readonly body: string;
  readonly photoKey: string | null;
  readonly createdByStaffId: string;
  readonly createdByName: string;
}

/**
 * Ce qu'on réécrit d'une note existante : sa position toujours, son contenu
 * seulement s'il a changé. L'auteur n'y est jamais — il est figé au dépôt.
 */
export interface NoteToUpdate {
  readonly id: string;
  readonly columns: {
    readonly position: number;
    readonly title?: string;
    readonly body?: string;
    readonly photoKey?: string | null;
  };
}

/** Les écritures qu'un enregistrement du carnet exige, et rien de plus. */
export interface NotebookWritePlan {
  readonly removedIds: readonly string[];
  readonly created: readonly NoteToCreate[];
  readonly updated: readonly NoteToUpdate[];
}

/**
 * **Ce qui a changé entre la base et l'agrégat** (plan
 * `documentation/b2b/plan-notes-photo-du-commercial.md`, D11).
 *
 * Pur, pour se tester sans base. L'agrégat ne note pas ce qu'il a modifié : il
 * rend son état, et c'est la comparaison avec les lignes relues — sous le verrou
 * du carnet, donc sans course — qui dit quoi écrire. Une note ajoutée en tête
 * décale toutes les positions : c'est un `UPDATE` de position par ligne, sans
 * réécrire les contenus.
 */
export function planNotebookWrites(
  stored: readonly StoredNoteRow[],
  notes: readonly ClientNoteState[],
): NotebookWritePlan {
  const byId = new Map(stored.map((row) => [row.id, row]));
  const present = new Set(notes.map((note) => note.id));
  const created: NoteToCreate[] = [];
  const updated: NoteToUpdate[] = [];
  for (const [position, note] of notes.entries()) {
    const row = byId.get(note.id);
    if (row === undefined) {
      created.push(creationOf(note, position));
      continue;
    }
    const update = updateOf(row, note, position);
    if (update !== null) {
      updated.push(update);
    }
  }
  return {
    removedIds: stored.filter((row) => !present.has(row.id)).map((row) => row.id),
    created,
    updated,
  };
}

function creationOf(note: ClientNoteState, position: number): NoteToCreate {
  return {
    id: note.id,
    position,
    title: note.title,
    body: note.body,
    photoKey: note.photoKey,
    createdByStaffId: note.author.staffUserId,
    createdByName: note.author.name,
  };
}

/** La réécriture d'une note existante, ou `null` si rien n'a bougé. */
function updateOf(
  row: StoredNoteRow,
  note: ClientNoteState,
  position: number,
): NoteToUpdate | null {
  const contentChanged =
    row.title !== note.title || row.body !== note.body || row.photoKey !== note.photoKey;
  if (contentChanged) {
    const columns = { position, title: note.title, body: note.body, photoKey: note.photoKey };
    return { id: note.id, columns };
  }
  return row.position === position ? null : { id: note.id, columns: { position } };
}
