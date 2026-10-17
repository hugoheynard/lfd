import {
  OperationArchivedError,
  OperationAwaitingMigrationError,
} from "../errors/operation-errors.js";
import { operationAudience, type OperationAudience } from "../value-objects/operation-audience.js";
import {
  operationFocal,
  operationImage,
  type OperationFocal,
} from "../value-objects/operation-image.js";
import { OperationKey } from "../value-objects/operation-key.js";
import { OperationSchedule } from "../value-objects/operation-schedule.js";
import { OperationSelection } from "../value-objects/operation-selection.js";
import type {
  OperationCalendarInput,
  OperationPresentation,
  OperationPresentationInput,
  OperationRecord,
  OperationSnapshot,
  PrepareOperation,
  WriteStamp,
} from "./operation-shapes.js";
import { operationText } from "../value-objects/operation-text.js";

export type {
  OperationCalendarInput,
  OperationPresentation,
  OperationPresentationInput,
  OperationRecord,
  OperationSnapshot,
  PrepareOperation,
  WriteStamp,
} from "./operation-shapes.js";

/** L'état qui change d'un geste à l'autre — tout sauf la clé. */
interface OperationState {
  presentation: OperationPresentation;
  schedule: OperationSchedule;
  showsOrderUntilTime: boolean;
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
      showsOrderUntilTime: true,
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
      showsOrderUntilTime: record.showsOrderUntilTime,
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

  /**
   * Réécrit le calendrier : les cinq dates ensemble, et si la boutique dit
   * l'HEURE de la clôture ou seulement son jour (Hugo, 2026-10-16) — un
   * réglage de la clôture, qui se décide en la posant.
   *
   * @throws {OperationArchivedError}
   */
  reschedule(calendar: OperationCalendarInput, stamp: WriteStamp): void {
    this.write(stamp, {
      schedule: OperationSchedule.of(calendar.schedule),
      showsOrderUntilTime: calendar.showsOrderUntilTime,
    });
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

  /**
   * **La médiathèque remplace `from` par `to`** (« Remplacer », §2 de
   * `documentation/mediatheque/mediatheque.md`) : l'image change d'adresse,
   * et le point focal revient au centre — il décrivait une autre image ; celui
   * de `to` arrive par {@link refocusImage} quand la médiathèque l'annonce.
   *
   * 🔴 **Ce n'est pas une édition de l'opération** (plan, « Après le lot 2 ») :
   * c'est l'image qui a changé d'adresse dans le fonds, et l'opération la
   * SUIT. D'où deux différences avec les gestes du staff :
   *
   * - **permis sur une archivée** : son image reste protégée à la médiathèque
   *   (elle compte comme porteuse), et l'historique ne doit pas pointer vers
   *   une adresse qui n'existe plus ;
   * - **non signé** : l'auteur de la dernière écriture ne change pas —
   *   personne n'a recomposé l'opération, et la décision est tracée à la
   *   médiathèque (`media_asset.replaced`), comme pour le point focal. C'est
   *   aussi ce qui laisse « jamais écrite au commerce » une copie que la
   *   migration n'a pas encore reprise.
   *
   * @returns `false` si l'opération ne montre pas `from` — rien à écrire.
   */
  followImageReplacement(from: string, to: string): boolean {
    const { image } = this.state.presentation;
    if (image === null || image.url !== from) {
      return false;
    }
    const replaced = operationImage({ url: to, focal: null });
    this.state = { ...this.state, presentation: { ...this.state.presentation, image: replaced } };
    return true;
  }

  /**
   * **La médiathèque redécrit le point focal de `url`.** Le point suit ;
   * l'auteur de la dernière écriture ne change pas — personne n'a recomposé
   * l'opération, la décision est tracée à la médiathèque
   * (`media_asset.described`), comme pour la vitrine.
   *
   * @returns `false` si l'opération ne montre pas `url`, ou montre déjà ce point.
   * @throws {OperationArchivedError}
   * @throws {InvalidOperationFocalError} le point sort de l'image.
   */
  refocusImage(url: string, focal: OperationFocal | null): boolean {
    this.ensureActive();
    const { image } = this.state.presentation;
    const next = operationFocal(focal);
    if (image === null || image.url !== url || sameFocal(image.focal, next)) {
      return false;
    }
    this.state = {
      ...this.state,
      presentation: { ...this.state.presentation, image: { ...image, focal: next } },
    };
    return true;
  }

  get isArchived(): boolean {
    return this.state.archivedAt !== null;
  }

  snapshot(): OperationSnapshot {
    const { presentation, selection, ...rest } = this.state;
    return { key: this.key, ...presentation, ...rest, skus: selection.skus };
  }

  /**
   * Le seul chemin d'une écriture du staff : refusée si archivée, ou si la
   * migration n'a pas encore repris cette copie — l'écrire d'abord ferait
   * tomber la restriction de la réception qu'elle doit y verser. Signée sinon.
   */
  private write(stamp: WriteStamp, change: Partial<OperationState>): void {
    this.ensureActive();
    if (this.state.lastWrite === null) {
      throw new OperationAwaitingMigrationError(this.key);
    }
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

function sameFocal(a: OperationFocal | null, b: OperationFocal | null): boolean {
  return a === null || b === null ? a === b : a.x === b.x && a.y === b.y;
}
