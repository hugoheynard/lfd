import { CLIENT_NOTEBOOK_MAX_NOTES as CONTRACT_MAX_NOTES } from "@lfd/contracts";

import {
  ClientNotebookFullError,
  ClientNotebookOrderStaleError,
  ClientNoteNotFoundError,
  InvalidClientNoteError,
} from "../../errors/client-notebook-errors.js";
import { ClientNoteContent } from "../../value-objects/client-note-content.js";
import {
  CLIENT_NOTEBOOK_MAX_NOTES,
  ClientNotebook,
  type ClientNoteAuthor,
} from "../client-notebook.js";

/**
 * **Le carnet de notes d'un client.** Ce qui est au carnet et pas au socle :
 * l'ajout EN TÊTE, la borne de cinquante, l'auteur figé que rien ne réécrit, et
 * les refus dans les mots du carnet.
 */

const MAYA: ClientNoteAuthor = { staffUserId: "staff-maya", name: "Maya Commerciale" };
const HUGO: ClientNoteAuthor = { staffUserId: "staff-hugo", name: "Hugo Admin" };

function content(title: string, body = ""): ClientNoteContent {
  return ClientNoteContent.create({ title, body });
}

function opened(): ClientNotebook {
  return ClientNotebook.openFor({ id: "nb1", companyId: "c1" });
}

function titles(notebook: ClientNotebook): string[] {
  return notebook.toPersistence().notes.map((note) => note.title);
}

describe("ClientNotebook — l'ajout", () => {
  it("range la nouvelle note EN TÊTE : la dernière déposée est la première lue", () => {
    const notebook = opened();
    notebook.addNote("n1", content("Visite de septembre"), null, MAYA);
    notebook.addNote("n2", content("Rappel des tarifs"), "k2", HUGO);

    expect(titles(notebook)).toEqual(["Rappel des tarifs", "Visite de septembre"]);
    expect(notebook.toPersistence()).toEqual({
      id: "nb1",
      companyId: "c1",
      notes: [
        { id: "n2", title: "Rappel des tarifs", body: "", photoKey: "k2", author: HUGO },
        { id: "n1", title: "Visite de septembre", body: "", photoKey: null, author: MAYA },
      ],
    });
  });

  it("refuse la cinquante-et-unième note, en disant quoi faire (409)", () => {
    const notebook = opened();
    for (let index = 0; index < CLIENT_NOTEBOOK_MAX_NOTES; index += 1) {
      notebook.addNote(`n${index}`, content(`Note ${index}`), null, MAYA);
    }

    const refuse = (): void => notebook.addNote("de-trop", content("De trop"), null, MAYA);
    expect(refuse).toThrow(ClientNotebookFullError);
    expect(refuse).toThrow(
      "Le carnet de ce client compte déjà 50 notes, le maximum. " +
        "Supprimez une note devenue inutile avant d'en ajouter une.",
    );
    expect(notebook.noteCount).toBe(CLIENT_NOTEBOOK_MAX_NOTES);
  });

  it("garde la borne que l'écran énonce", () => {
    expect(CLIENT_NOTEBOOK_MAX_NOTES).toBe(CONTRACT_MAX_NOTES);
  });
});

describe("ClientNotebook — la révision et la photo", () => {
  it("refait le titre sans toucher l'auteur du dépôt", () => {
    const notebook = opened();
    notebook.addNote("n1", content("Visite"), null, MAYA);
    notebook.reviseNote("n1", content("Visite du 3", "Commande de brioches"));

    expect(notebook.toPersistence().notes[0]).toEqual({
      id: "n1",
      title: "Visite du 3",
      body: "Commande de brioches",
      photoKey: null,
      author: MAYA,
    });
  });

  it("rend la clé remplacée, puis la clé retirée", () => {
    const notebook = opened();
    notebook.addNote("n1", content("Visite"), "k1", MAYA);

    expect(notebook.attachPhoto("n1", "k2")).toBe("k1");
    expect(notebook.detachPhoto("n1")).toBe("k2");
    expect(notebook.detachPhoto("n1")).toBeNull();
  });

  it("dit qu'une note inconnue n'existe plus dans le carnet (404)", () => {
    const notebook = opened();
    expect(() => notebook.reviseNote("fantome", content("x"))).toThrow(ClientNoteNotFoundError);
    expect(() => notebook.attachPhoto("fantome", "k")).toThrow(
      "Cette note n'existe plus dans le carnet de ce client. Rechargez le carnet.",
    );
    expect(() => notebook.removeNote("fantome")).toThrow(ClientNoteNotFoundError);
  });
});

describe("ClientNotebook — la suppression et l'ordre", () => {
  it("supprime définitivement : la note, son auteur, et rend la clé de sa photo", () => {
    const notebook = opened();
    notebook.addNote("n1", content("Visite"), "k1", MAYA);
    notebook.addNote("n2", content("Tarifs"), null, HUGO);

    expect(notebook.removeNote("n1")).toBe("k1");
    expect(notebook.toPersistence().notes).toEqual([
      { id: "n2", title: "Tarifs", body: "", photoKey: null, author: HUGO },
    ]);
  });

  it("range dans l'ordre donné quand c'est une permutation exacte", () => {
    const notebook = opened();
    notebook.addNote("n1", content("Un"), null, MAYA);
    notebook.addNote("n2", content("Deux"), null, MAYA);
    notebook.addNote("n3", content("Trois"), null, MAYA);

    notebook.reorder(["n1", "n3", "n2"]);
    expect(titles(notebook)).toEqual(["Un", "Trois", "Deux"]);
  });

  it.each([
    ["une note manque", ["n1"]],
    ["une note est répétée", ["n1", "n1"]],
    ["une note est inconnue", ["n1", "fantome"]],
    ["une note est en trop", ["n1", "n2", "n3"]],
  ])("refuse un ordre périmé quand %s, sans rien ranger (409)", (_case, order) => {
    const notebook = opened();
    notebook.addNote("n1", content("Un"), null, MAYA);
    notebook.addNote("n2", content("Deux"), null, MAYA);

    expect(() => notebook.reorder(order)).toThrow(ClientNotebookOrderStaleError);
    expect(() => notebook.reorder(order)).toThrow(
      "Le carnet a changé depuis son affichage (une note a été ajoutée ou supprimée). " +
        "Rechargez-le, puis réordonnez à nouveau.",
    );
    expect(titles(notebook)).toEqual(["Deux", "Un"]);
  });
});

describe("ClientNotebook — la relecture", () => {
  it("rehydrate dans l'ordre, auteurs compris", () => {
    const notebook = ClientNotebook.reconstitute({
      id: "nb1",
      companyId: "c1",
      notes: [
        { id: "n2", title: "Tarifs", body: "", photoKey: null, author: HUGO },
        { id: "n1", title: "Visite", body: "", photoKey: "k1", author: MAYA },
      ],
    });
    notebook.addNote("n3", content("Rappel"), null, MAYA);

    expect(
      notebook.toPersistence().notes.map((note) => [note.id, note.author.staffUserId]),
    ).toEqual([
      ["n3", "staff-maya"],
      ["n2", "staff-hugo"],
      ["n1", "staff-maya"],
    ]);
  });

  it("revalide le contenu : une ligne écrite hors du domaine ne rentre pas en mémoire", () => {
    expect(() =>
      ClientNotebook.reconstitute({
        id: "nb1",
        companyId: "c1",
        notes: [{ id: "n1", title: "   ", body: "", photoKey: null, author: MAYA }],
      }),
    ).toThrow(InvalidClientNoteError);
  });
});
