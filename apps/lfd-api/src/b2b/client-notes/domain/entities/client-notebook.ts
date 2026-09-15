import {
  ClientNoteAuthorMissingError,
  ClientNotebookFullError,
  ClientNotebookOrderStaleError,
  ClientNoteNotFoundError,
} from "../errors/client-notebook-errors.js";
import {
  PhotoCardList,
  type PhotoCardListRules,
} from "../../../shared/photo-cards/domain/entities/photo-card-list.js";
import { ClientNoteContent } from "../value-objects/client-note-content.js";

/**
 * **Cinquante notes au plus** par client (Hugo, 2026-09-15). `@lfd/contracts` en
 * garde une copie (`CLIENT_NOTEBOOK_MAX_NOTES`) ; l'autorité est ici.
 */
export const CLIENT_NOTEBOOK_MAX_NOTES = 50;

/** Qui a déposé une note, figé au dépôt. */
export interface ClientNoteAuthor {
  /** Le `sub` du staff — il reste résolvable après un changement de nom. */
  readonly sub: string;
  /** Le nom ce jour-là ; vide quand l'annuaire ne connaît pas le `sub`. */
  readonly name: string;
}

/** L'identité d'un carnet : le sien, et la société qu'il sert. */
export interface ClientNotebookIdentity {
  readonly id: string;
  readonly companyId: string;
}

/** Une note telle que l'adaptateur l'écrit et la relit. */
export interface ClientNoteState {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly photoKey: string | null;
  readonly author: ClientNoteAuthor;
}

/** L'état complet du carnet. Les notes sont **dans l'ordre** : leur rang EST leur position. */
export interface ClientNotebookState extends ClientNotebookIdentity {
  readonly notes: readonly ClientNoteState[];
}

/** La règle du carnet : cinquante notes, la nouvelle **en tête**, et les mots du carnet. */
const NOTE_LIST_RULES: PhotoCardListRules = {
  max: CLIENT_NOTEBOOK_MAX_NOTES,
  insertAt: "start",
  refusals: {
    full: (max) => new ClientNotebookFullError(max),
    cardNotFound: (noteId) => new ClientNoteNotFoundError(noteId),
    orderStale: () => new ClientNotebookOrderStaleError(),
  },
};

/**
 * **Le carnet de notes du commercial sur un client** — les photos de ses notes
 * papier, titrées, décrites, classées à la main.
 *
 * Un agrégat et non un CRUD parce que trois règles peuvent refuser une
 * écriture : le nombre de notes, une note inconnue, et un ordre qui doit être
 * une permutation EXACTE des notes présentes. Ce sont celles de
 * {@link PhotoCardList}, que le carnet porte en champ privé — la procédure de
 * livraison a la même (plan `documentation/b2b/plan-notes-photo-du-commercial.md`,
 * D8). Ce qui est au carnet : l'ajout **en tête** (la dernière note est celle
 * qu'on cherche) et l'**auteur**, figé au dépôt et qu'aucun geste ne réécrit.
 *
 * Le carnet ne connaît pas le stockage objet : il porte la clé de la photo
 * lisible, la vignette se dérive d'elle. Chaque geste qui rend une photo
 * orpheline rend son ancienne clé ; la séquence applicative la supprime, avec sa
 * vignette, après la transaction.
 */
export class ClientNotebook {
  private constructor(
    private readonly identity: ClientNotebookIdentity,
    private readonly notes: PhotoCardList<ClientNoteContent>,
    private readonly authors: Map<string, ClientNoteAuthor>,
  ) {}

  /** Ouvre le carnet d'une société qui n'en a pas. Il reçoit aussitôt sa première note. */
  static openFor(identity: ClientNotebookIdentity): ClientNotebook {
    return new ClientNotebook({ ...identity }, PhotoCardList.empty(NOTE_LIST_RULES), new Map());
  }

  /**
   * Rehydrate depuis la base. Le contenu repasse par son value object : une
   * ligne écrite hors du domaine ne rentre pas en mémoire sans être revalidée.
   */
  static reconstitute(state: ClientNotebookState): ClientNotebook {
    const notes = state.notes.map((note) => ({
      id: note.id,
      content: ClientNoteContent.create({ title: note.title, body: note.body }),
      photoKey: note.photoKey,
    }));
    return new ClientNotebook(
      { id: state.id, companyId: state.companyId },
      PhotoCardList.of(NOTE_LIST_RULES, notes),
      new Map(state.notes.map((note) => [note.id, { ...note.author }])),
    );
  }

  get id(): string {
    return this.identity.id;
  }

  get noteCount(): number {
    return this.notes.size;
  }

  /**
   * Ajoute une note **en tête** du carnet, avec son auteur.
   *
   * @throws {ClientNotebookFullError} le carnet a déjà son maximum.
   */
  addNote(
    noteId: string,
    content: ClientNoteContent,
    photoKey: string | null,
    author: ClientNoteAuthor,
  ): void {
    this.notes.add(noteId, content, photoKey);
    this.authors.set(noteId, { ...author });
  }

  /**
   * Nouveau titre, nouvelle description. L'auteur ne change pas : c'est celui
   * du dépôt, et le journal dit qui a refait la note.
   *
   * @throws {ClientNoteNotFoundError} la note n'est pas dans le carnet.
   */
  reviseNote(noteId: string, content: ClientNoteContent): void {
    this.notes.revise(noteId, content);
  }

  /**
   * Pose une photo et rend la clé qu'elle remplace (`null` sans photo).
   *
   * @throws {ClientNoteNotFoundError} la note n'est pas dans le carnet.
   */
  attachPhoto(noteId: string, photoKey: string): string | null {
    return this.notes.attachPhoto(noteId, photoKey);
  }

  /**
   * Retire la photo et rend sa clé (`null` sans photo).
   *
   * @throws {ClientNoteNotFoundError} la note n'est pas dans le carnet.
   */
  detachPhoto(noteId: string): string | null {
    return this.notes.detachPhoto(noteId);
  }

  /**
   * **Supprime définitivement** la note et rend la clé de sa photo, pour
   * qu'elle parte du stockage avec sa vignette.
   *
   * ⚠️ Exception écrite à « pas de DELETE physique sur un agrégat métier »
   * (`CLAUDE.md` §3) : le CARNET ne se supprime jamais, une note si, parce que
   * Hugo l'a demandé (« suppression définitive », 2026-09-15, plan D4). Une note
   * gardée « archivée » resterait lisible, et le journal ne garde aucun contenu
   * précisément pour que la suppression le soit vraiment (D6).
   *
   * @throws {ClientNoteNotFoundError} la note n'est pas dans le carnet.
   */
  removeNote(noteId: string): string | null {
    const photoKey = this.notes.remove(noteId);
    this.authors.delete(noteId);
    return photoKey;
  }

  /**
   * Range les notes dans l'ordre donné — chacune, une fois.
   *
   * @throws {ClientNotebookOrderStaleError} la liste n'est pas une permutation
   *   exacte des notes présentes.
   */
  reorder(noteIds: readonly string[]): void {
    this.notes.reorder(noteIds);
  }

  /** L'état à écrire, notes dans l'ordre. */
  toPersistence(): ClientNotebookState {
    return {
      ...this.identity,
      notes: this.notes.snapshot().map((note) => ({
        id: note.id,
        title: note.content.title,
        body: note.content.body,
        photoKey: note.photoKey,
        author: this.authorOf(note.id),
      })),
    };
  }

  /**
   * L'auteur d'une note présente. Ajout et relecture le posent toujours : son
   * absence est une faute de code, et on la lève plutôt que d'écrire un auteur
   * inventé en base.
   *
   * @throws {ClientNoteAuthorMissingError} la note n'a pas d'auteur en mémoire.
   */
  private authorOf(noteId: string): ClientNoteAuthor {
    const author = this.authors.get(noteId);
    if (author === undefined) {
      throw new ClientNoteAuthorMissingError();
    }
    return { ...author };
  }
}
