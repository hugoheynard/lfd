import type { LocalizedText } from "@lfd/pim-contracts";

import { localizedText } from "../../../catalogue/shared/domain/value-objects/localized-text.js";
import { OperationArchivedError } from "../errors/operation-errors.js";
import { operationAudience, type OperationAudience } from "../value-objects/operation-audience.js";
import { operationImage, type OperationImage } from "../value-objects/operation-image.js";
import { OperationKey } from "../value-objects/operation-key.js";
import {
  OperationSchedule,
  type OperationScheduleInput,
} from "../value-objects/operation-schedule.js";
import { OperationSelection } from "../value-objects/operation-selection.js";

/** Ce que l'annonce affiche : le nom, l'accroche, l'image. */
export interface OperationPresentation {
  readonly name: LocalizedText;
  readonly lede: LocalizedText | null;
  readonly image: OperationImage | null;
}

/** Ce qu'il faut pour préparer une opération. La sélection commence vide. */
export interface PrepareOperation extends OperationPresentation {
  readonly key: string;
  readonly schedule: OperationScheduleInput;
  readonly audience: string;
}

/** L'état complet, tel que le dépôt l'écrit et le relit. */
export interface OperationSnapshot extends OperationPresentation {
  readonly key: string;
  readonly schedule: OperationSchedule;
  readonly audience: OperationAudience;
  readonly skus: readonly string[];
  readonly archivedAt: Date | null;
}

/** L'état tel que la base le rend, jours et clientèle encore bruts. */
export interface OperationRecord extends OperationPresentation {
  readonly key: string;
  readonly schedule: OperationScheduleInput;
  readonly audience: string;
  readonly skus: readonly string[];
  readonly archivedAt: Date | null;
}

/**
 * **Une opération datée** — Noël, Pâques, la galette.
 *
 * L'agrégat garde trois choses : la clé ne change jamais, les cinq dates
 * s'ordonnent (D2), et une opération archivée ne se modifie plus. Le reste —
 * une clé déjà prise, un SKU que le catalogue ne porte pas — dépend du monde,
 * et c'est aux cas d'usage de le demander aux ports.
 *
 * Pas de `restore` : le plan n'en prévoit pas, et une opération archivée qui
 * revient serait une clé réemployée par un autre chemin.
 */
export class Operation {
  private constructor(
    readonly key: string,
    private presentation: OperationPresentation,
    private currentSchedule: OperationSchedule,
    private currentAudience: OperationAudience,
    private selection: OperationSelection,
    private archivedOn: Date | null,
  ) {}

  /**
   * Prépare une opération : elle naît **en préparation** si son annonce est à
   * venir, sans article — on la compose ensuite.
   */
  static prepare(input: PrepareOperation): Operation {
    return new Operation(
      OperationKey.of(input.key).value,
      presentationOf(input),
      OperationSchedule.of(input.schedule),
      operationAudience(input.audience),
      OperationSelection.empty(),
      null,
    );
  }

  /** Rehydrate depuis la base. Les invariants se revérifient — une ligne écrite à la main aussi. */
  static reconstitute(record: OperationRecord): Operation {
    return new Operation(
      OperationKey.of(record.key).value,
      presentationOf(record),
      OperationSchedule.of(record.schedule),
      operationAudience(record.audience),
      OperationSelection.of(record.skus),
      record.archivedAt,
    );
  }

  /** Réécrit le nom, l'accroche et l'image. @throws {OperationArchivedError} */
  edit(presentation: OperationPresentation): void {
    this.ensureActive();
    this.presentation = presentationOf(presentation);
  }

  /** Réécrit les cinq dates ensemble. @throws {OperationArchivedError} */
  reschedule(schedule: OperationScheduleInput): void {
    this.ensureActive();
    this.currentSchedule = OperationSchedule.of(schedule);
  }

  /** @throws {OperationArchivedError} */
  changeAudience(audience: string): void {
    this.ensureActive();
    this.currentAudience = operationAudience(audience);
  }

  /** Pose la sélection ENTIÈRE, dans l'ordre d'affichage. @throws {OperationArchivedError} */
  select(skus: readonly string[]): void {
    this.ensureActive();
    this.selection = OperationSelection.of(skus);
  }

  /**
   * Archive : l'opération sort de la préparation, et sa clé reste prise pour
   * toujours (D9).
   *
   * @throws {OperationArchivedError} elle l'est déjà — un second archivage
   * écraserait la date du premier, qui est celle qu'on cherchera.
   */
  archive(at: Date): void {
    this.ensureActive();
    this.archivedOn = at;
  }

  get isArchived(): boolean {
    return this.archivedOn !== null;
  }

  snapshot(): OperationSnapshot {
    return {
      key: this.key,
      ...this.presentation,
      schedule: this.currentSchedule,
      audience: this.currentAudience,
      skus: this.selection.skus,
      archivedAt: this.archivedOn,
    };
  }

  private ensureActive(): void {
    if (this.archivedOn !== null) {
      throw new OperationArchivedError(this.key);
    }
  }
}

function presentationOf(raw: OperationPresentation): OperationPresentation {
  return {
    name: localizedText("nom de l'opération", raw.name),
    lede: raw.lede === null ? null : localizedText("accroche de l'opération", raw.lede),
    image: operationImage(raw.image),
  };
}
