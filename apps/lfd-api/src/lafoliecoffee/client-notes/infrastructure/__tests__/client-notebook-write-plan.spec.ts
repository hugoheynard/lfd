import type { ClientNoteState } from "../../domain/entities/client-notebook.js";
import { planNotebookWrites, type StoredNoteRow } from "../client-notebook-write-plan.js";

/**
 * **L'écriture ciblée du carnet** (plan D11) : n'écrire que la note touchée et la
 * position de celles qui ont bougé. À cinquante notes, réécrire chaque contenu à
 * chaque geste est ce que le plan refuse.
 */

const MAYA = { staffUserId: "staff-maya", name: "Maya" };

function note(id: string, title: string, photoKey: string | null = null): ClientNoteState {
  return { id, title, body: "", photoKey, author: MAYA };
}

function row(
  id: string,
  position: number,
  title: string,
  photoKey: string | null = null,
): StoredNoteRow {
  return { id, position, title, body: "", photoKey };
}

describe("planNotebookWrites", () => {
  it("n'écrit rien quand rien n'a changé", () => {
    expect(planNotebookWrites([row("n1", 0, "Un")], [note("n1", "Un")])).toEqual({
      removedIds: [],
      created: [],
      updated: [],
    });
  });

  it("une note en tête : une création, et un décalage de POSITION seul pour les autres", () => {
    const plan = planNotebookWrites(
      [row("n1", 0, "Un"), row("n2", 1, "Deux")],
      [note("n3", "Trois", "k3"), note("n1", "Un"), note("n2", "Deux")],
    );
    expect(plan).toEqual({
      removedIds: [],
      created: [
        {
          id: "n3",
          position: 0,
          title: "Trois",
          body: "",
          photoKey: "k3",
          createdByStaffId: "staff-maya",
          createdByName: "Maya",
        },
      ],
      updated: [
        { id: "n1", columns: { position: 1 } },
        { id: "n2", columns: { position: 2 } },
      ],
    });
  });

  it("une note refaite : son contenu seul, sans l'auteur", () => {
    const plan = planNotebookWrites(
      [row("n1", 0, "Un", "k1"), row("n2", 1, "Deux")],
      [note("n1", "Un bis", "k1bis"), note("n2", "Deux")],
    );
    expect(plan.updated).toEqual([
      { id: "n1", columns: { position: 0, title: "Un bis", body: "", photoKey: "k1bis" } },
    ]);
    expect(plan.created).toEqual([]);
  });

  it("une note retirée : sa suppression, et la remontée des suivantes", () => {
    const plan = planNotebookWrites(
      [row("n1", 0, "Un"), row("n2", 1, "Deux"), row("n3", 2, "Trois")],
      [note("n1", "Un"), note("n3", "Trois")],
    );
    expect(plan).toEqual({
      removedIds: ["n2"],
      created: [],
      updated: [{ id: "n3", columns: { position: 1 } }],
    });
  });

  it("un réordonnancement : des positions, jamais de contenu", () => {
    const plan = planNotebookWrites(
      [row("n1", 0, "Un"), row("n2", 1, "Deux")],
      [note("n2", "Deux"), note("n1", "Un")],
    );
    expect(plan.updated).toEqual([
      { id: "n2", columns: { position: 0 } },
      { id: "n1", columns: { position: 1 } },
    ]);
  });
});
