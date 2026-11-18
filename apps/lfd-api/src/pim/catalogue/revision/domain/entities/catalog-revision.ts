import { RevisionAlreadyNamedError } from "../errors/revision-errors.js";

/** L'état d'une ancre, tel que l'agrégat le porte et tel que le dépôt le relit. */
export interface CatalogRevisionState {
  readonly id: string;
  /** La référence lisible — `R-7WT4NA`. C'est par elle qu'on cite une ancre. */
  readonly reference: string;
  readonly label: string | null;
  /** Le POURQUOI, en clair — `null` = personne n'en a écrit. */
  readonly note: string | null;
  readonly hash: string;
  readonly takenAt: Date;
  readonly takenBy: string;
  /** Combien d'articles elle fige — compté en base, pas déduit d'une lecture. */
  readonly articles: number;
}

/** Ce qu'il faut pour poser une ancre neuve. */
export type CatalogRevisionTaking = Omit<CatalogRevisionState, "articles">;

/**
 * **Une ancre du catalogue** — le gardien de la règle « on nomme, on ne
 * renomme pas ».
 *
 * La photographie (les contenus par article) est immuable et reste portée par
 * `Revision` : elle ne s'écrit qu'à la pose. L'agrégat ne garde que ce qui peut
 * encore bouger — le nom et sa note —, et la seule règle qui puisse refuser une
 * écriture : une ancre déjà nommée dit avec quelle intention un catalogue est
 * parti chez des clients, et la réécrire raconterait le passé autrement.
 */
export class CatalogRevision {
  private constructor(
    private readonly state: CatalogRevisionState,
    private currentLabel: string | null,
    private currentNote: string | null,
  ) {}

  /** Pose une ancre neuve : aucun article compté tant que la photo n'est pas écrite. */
  static take(taking: CatalogRevisionTaking): CatalogRevision {
    return new CatalogRevision({ ...taking, articles: 0 }, taking.label, taking.note);
  }

  /** Relit une ancre posée — les mappers du dépôt, et eux seuls. */
  static rehydrate(state: CatalogRevisionState): CatalogRevision {
    return new CatalogRevision(state, state.label, state.note);
  }

  get id(): string {
    return this.state.id;
  }

  get reference(): string {
    return this.state.reference;
  }

  get hash(): string {
    return this.state.hash;
  }

  get label(): string | null {
    return this.currentLabel;
  }

  get note(): string | null {
    return this.currentNote;
  }

  /** Le nom donné est-il celui d'une ancre déjà nommée ? */
  get isNamed(): boolean {
    return this.currentLabel !== null;
  }

  /**
   * Nomme une ancre muette. La note n'est écrite que si on en apporte une :
   * nommer sans rien dire de plus ne doit pas effacer ce qu'une autre main y
   * avait mis.
   *
   * @throws {RevisionAlreadyNamedError} elle porte déjà un nom.
   */
  name(label: string, note: string | null): void {
    if (this.currentLabel !== null) {
      throw new RevisionAlreadyNamedError(this.state.reference, this.currentLabel);
    }
    this.currentLabel = label;
    if (note !== null) {
      this.currentNote = note;
    }
  }

  /** L'état courant, pour l'adaptateur de persistance et pour les lectures. */
  toState(): CatalogRevisionState {
    return { ...this.state, label: this.currentLabel, note: this.currentNote };
  }
}
