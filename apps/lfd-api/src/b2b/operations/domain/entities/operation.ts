import { OperationArchivedError } from "../errors/operation-errors.js";
import { operationAudience, type OperationAudience } from "../value-objects/operation-audience.js";
import { operationImage, type OperationImage } from "../value-objects/operation-image.js";
import { OperationKey } from "../value-objects/operation-key.js";
import {
  OperationSchedule,
  type OperationScheduleInput,
} from "../value-objects/operation-schedule.js";
import { OperationSelection } from "../value-objects/operation-selection.js";
import {
  operationText,
  type OperationText,
  type OperationTextInput,
} from "../value-objects/operation-text.js";

/** Ce que l'annonce affiche, tel qu'on le donne : le nom, l'accroche, l'image. */
export interface OperationPresentationInput {
  readonly name: OperationTextInput;
  readonly lede: OperationTextInput | null;
  readonly image: OperationImage | null;
}

/** Ce que l'annonce affiche, une fois jugé. */
export interface OperationPresentation {
  readonly name: OperationText;
  readonly lede: OperationText | null;
  readonly image: OperationImage | null;
}

/**
 * **Qui écrit, et quand** — chaque geste du commerce le porte. `by` est un
 * `StaffUser.id`, `null` hors requête.
 */
export interface WriteStamp {
  readonly by: string | null;
  readonly at: Date;
}

/** Ce qu'il faut pour préparer une opération. La sélection commence vide. */
export interface PrepareOperation extends OperationPresentationInput {
  readonly key: string;
  readonly schedule: OperationScheduleInput;
  readonly audience: string;
}

/** L'état tel que la base le rend, jours et clientèle encore bruts. */
export interface OperationRecord extends OperationPresentationInput {
  readonly key: string;
  readonly schedule: OperationScheduleInput;
  readonly audience: string;
  readonly skus: readonly string[];
  readonly hidden: boolean;
  readonly archivedAt: Date | null;
  /** `null` : jamais écrite au commerce — une ligne reçue du référentiel seulement. */
  readonly lastWrite: WriteStamp | null;
}

/** L'état complet, tel que le dépôt l'écrit. */
export interface OperationSnapshot extends OperationPresentation {
  readonly key: string;
  readonly schedule: OperationSchedule;
  readonly audience: OperationAudience;
  readonly skus: readonly string[];
  readonly hidden: boolean;
  readonly archivedAt: Date | null;
  readonly lastWrite: WriteStamp | null;
}

/** L'état qui change d'un geste à l'autre — tout sauf la clé. */
interface OperationState {
  presentation: OperationPresentation;
  schedule: OperationSchedule;
  audience: OperationAudience;
  selection: OperationSelection;
  hidden: boolean;
  archivedAt: Date | null;
  lastWrite: WriteStamp | null;
}

/**
 * **Une opération datée, tenue au commerce** — Noël, Pâques, la galette
 * (`documentation/operations-datees/plan-l-operation-passe-au-commerce.md`, O1).
 *
 * Reprend les invariants de l'agrégat du référentiel (`pim/operations`) : la
 * clé ne change jamais, les cinq dates s'ordonnent (D2), la clientèle est
 * l'une des trois, la sélection est sans doublon et bornée, et une opération
 * archivée ne se modifie plus. Le reste — une clé déjà prise, un SKU que le
 * commerce ne connaît pas — dépend du monde, et c'est aux cas d'usage de le
 * demander aux ports.
 *
 * Ce que le référentiel n'avait pas, et que la surcharge de la réception
 * portait (plan, « Ce que devient chaque champ de la surcharge ») : **masquer**,
 * réversible, distinct de l'archivage — qui est un retrait daté, définitif.
 *
 * Chaque geste porte son {@link WriteStamp} : qui a écrit l'opération en
 * dernier se lit sur elle, et le journal dit le reste.
 *
 * Pas de `restore` : une opération archivée qui revient serait une clé
 * réemployée par un autre chemin.
 */
export class Operation {
  private constructor(
    readonly key: string,
    private state: OperationState,
  ) {}

  /** Prépare une opération : sans article — on la compose ensuite —, visible, non archivée. */
  static prepare(input: PrepareOperation, stamp: WriteStamp): Operation {
    return new Operation(OperationKey.of(input.key).value, {
      presentation: presentationOf(input),
      schedule: OperationSchedule.of(input.schedule),
      audience: operationAudience(input.audience),
      selection: OperationSelection.empty(),
      hidden: false,
      archivedAt: null,
      lastWrite: stamp,
    });
  }

  /** Rehydrate depuis la base. Les invariants se revérifient — une ligne écrite à la main aussi. */
  static reconstitute(record: OperationRecord): Operation {
    return new Operation(OperationKey.of(record.key).value, {
      presentation: presentationOf(record),
      schedule: OperationSchedule.of(record.schedule),
      audience: operationAudience(record.audience),
      selection: OperationSelection.of(record.skus),
      hidden: record.hidden,
      archivedAt: record.archivedAt,
      lastWrite: record.lastWrite,
    });
  }

  /** Réécrit le nom, l'accroche et l'image. @throws {OperationArchivedError} */
  edit(presentation: OperationPresentationInput, stamp: WriteStamp): void {
    this.write(stamp, { presentation: presentationOf(presentation) });
  }

  /** Réécrit les cinq dates ensemble. @throws {OperationArchivedError} */
  reschedule(schedule: OperationScheduleInput, stamp: WriteStamp): void {
    this.write(stamp, { schedule: OperationSchedule.of(schedule) });
  }

  /** @throws {OperationArchivedError} */
  changeAudience(audience: string, stamp: WriteStamp): void {
    this.write(stamp, { audience: operationAudience(audience) });
  }

  /**
   * Masque ou affiche. Réversible, et distinct de l'archivage.
   *
   * @returns `false` si elle l'était déjà — rien n'a changé, rien à écrire.
   * @throws {OperationArchivedError}
   */
  setHidden(hidden: boolean, stamp: WriteStamp): boolean {
    this.ensureActive();
    if (this.state.hidden === hidden) {
      return false;
    }
    this.write(stamp, { hidden });
    return true;
  }

  /** Pose la sélection ENTIÈRE, dans l'ordre du rayon. @throws {OperationArchivedError} */
  select(skus: readonly string[], stamp: WriteStamp): void {
    this.write(stamp, { selection: OperationSelection.of(skus) });
  }

  /**
   * Archive : l'opération est retirée pour toujours, et sa clé reste prise
   * (D9). L'instant du geste devient la date du retrait.
   *
   * @throws {OperationArchivedError} elle l'est déjà — un second archivage
   * écraserait la date du premier, qui est celle qu'on cherchera.
   */
  archive(stamp: WriteStamp): void {
    this.write(stamp, { archivedAt: stamp.at });
  }

  get isArchived(): boolean {
    return this.state.archivedAt !== null;
  }

  snapshot(): OperationSnapshot {
    const { presentation, selection, ...rest } = this.state;
    return { key: this.key, ...presentation, ...rest, skus: selection.skus };
  }

  /** Le seul chemin d'une écriture : refusée si archivée, signée sinon. */
  private write(stamp: WriteStamp, change: Partial<OperationState>): void {
    this.ensureActive();
    this.state = { ...this.state, ...change, lastWrite: stamp };
  }

  private ensureActive(): void {
    if (this.state.archivedAt !== null) {
      throw new OperationArchivedError(this.key);
    }
  }
}

function presentationOf(raw: OperationPresentationInput): OperationPresentation {
  return {
    name: operationText("nom de l'opération", raw.name),
    lede: raw.lede === null ? null : operationText("accroche de l'opération", raw.lede),
    image: operationImage(raw.image),
  };
}
