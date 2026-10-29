import {
  AmendmentOutsideMercurialeError,
  DuplicateEndedSkuError,
  DuplicateMercurialeSkuError,
  EmptyAmendmentError,
  EmptyMercurialeError,
  MissingAmendmentReasonError,
  NoNegotiatedLineToEndError,
  NonDecreasingMercurialeTiersError,
  RetroactiveAmendmentError,
  ReversedValidityWindowError,
  SkuAlreadyNegotiatedError,
} from "../pricing-errors.js";
import { normalizeGrid, type GridRefusals, type PricingGridLine } from "../pricing-grid.js";

/**
 * **L'avenant daté d'une mercuriale** (`plan-tarif-date-sur-une-reference.md`).
 *
 * Un bloc immuable, rattaché à SON document : il ouvre des lignes de prix sur
 * une fenêtre datée, et peut arrêter, à sa date d'effet, des lignes qui
 * couraient — de la grille ou d'un avenant antérieur (Hugo, 2026-10-29, Q1).
 * Changer un prix = arrêter l'ancienne ligne et en ouvrir une nouvelle dans le
 * même avenant.
 *
 * Rien n'est réécrit : ni la grille, ni l'avenant d'origine. La composition se
 * fait à la lecture, par {@link segmentsOf}, ce qui laisse une relecture datée
 * rendre exactement ce qui s'appliquait à l'époque.
 */

const REFUSALS: GridRefusals = {
  empty: () => new EmptyMercurialeError(),
  duplicateSku: (sku) => new DuplicateMercurialeSkuError(sku),
  nonDecreasing: (sku, minQuantity) => new NonDecreasingMercurialeTiersError(sku, minQuantity),
};

/** D'où vient l'avenant, quand ce n'est pas une saisie libre (le report du L7c). */
export interface AmendmentOrigin {
  readonly kind: "detached";
  readonly fromSku: string;
  readonly fromMercurialeId: string;
}

/** Ce qu'un appelant apporte pour amender : l'intention, pas l'état. */
export interface MercurialeAmendmentDraft {
  /** Les lignes OUVERTES, avec les invariants de la grille. Peut être vide. */
  readonly lines: readonly PricingGridLine[];
  /** Les articles dont la ligne en cours s'ARRÊTE à `validFrom`. Peut être vide. */
  readonly endedSkus: readonly string[];
  /** Borne basse incluse — aussi la date d'effet des arrêts. */
  readonly validFrom: Date;
  /** Borne haute exclue des lignes ouvertes. `null` = jusqu'à la fin du document. */
  readonly validTo: Date | null;
  readonly reason: string;
  readonly origin: AmendmentOrigin | null;
}

export interface MercurialeAmendment extends MercurialeAmendmentDraft {
  readonly id: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  /** Seule la clôture du document range un avenant (il ne se clôt pas seul). */
  readonly archivedAt: Date | null;
  readonly archivedBy: string | null;
  readonly archiveReason: string | null;
}

/** Ce qu'il faut du document pour composer : sa fenêtre, sa grille, ses avenants. */
export interface AmendedGrid {
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly lines: readonly PricingGridLine[];
  /** Dans l'ordre d'écriture — l'ordre décide de ce qu'un arrêt touche. */
  readonly amendments: readonly MercurialeAmendment[];
}

/** Une ligne de prix effective sur `[from, to)`. `amendment` = `null` pour la grille. */
export interface LineSegment {
  readonly line: PricingGridLine;
  readonly from: Date;
  readonly to: Date | null;
  readonly amendment: MercurialeAmendment | null;
}

interface Source extends LineSegment {
  /** −1 = la grille, sinon la position de l'avenant dans l'ordre d'écriture. */
  readonly rank: number;
}

/** La plus tôt des deux bornes hautes, `null` valant « jamais ». */
function earliest(left: Date | null, right: Date | null): Date | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return left.getTime() <= right.getTime() ? left : right;
}

/**
 * Les avenants qui comptent : non rangés, ou — en relecture datée (`at`) —
 * rangés APRÈS cet instant, avec la convention de `unarchivedAt`.
 */
function liveAmendments(grid: AmendedGrid, at: Date | null): readonly MercurialeAmendment[] {
  return grid.amendments.filter(
    (amendment) =>
      amendment.archivedAt === null ||
      (at !== null && amendment.archivedAt.getTime() > at.getTime()),
  );
}

/**
 * La première date à laquelle un avenant arrête cette source.
 *
 * Un avenant n'arrête que ce qui existait quand il a été écrit : la grille et
 * les avenants antérieurs, ouverts au plus tard à sa date d'effet. Une ligne
 * ouverte par un avenant postérieur n'est jamais touchée — c'est ce qui permet
 * de rouvrir un article après l'avoir arrêté.
 */
function endingOf(
  amendments: readonly MercurialeAmendment[],
  sku: string,
  source: Source,
): Date | null {
  return amendments.reduce<Date | null>(
    (first, amendment, rank) =>
      rank > source.rank &&
      amendment.endedSkus.includes(sku) &&
      amendment.validFrom.getTime() >= source.from.getTime()
        ? earliest(first, amendment.validFrom)
        : first,
    null,
  );
}

/**
 * **Les lignes effectives d'un article**, chacune sur sa fenêtre réelle :
 * coupée par le document, puis par le premier arrêt qui la vise. Une ligne
 * arrêtée à l'instant où elle s'ouvre ne paraît pas.
 *
 * @param at `null` = l'état courant (avenants non rangés) ; une date = la
 *   relecture à cet instant.
 */
export function segmentsOf(grid: AmendedGrid, sku: string, at: Date | null): LineSegment[] {
  const amendments = liveAmendments(grid, at);
  const sources: Source[] = [];
  const gridLine = grid.lines.find((line) => line.sku === sku);
  if (gridLine !== undefined) {
    sources.push({
      line: gridLine,
      from: grid.validFrom,
      to: grid.validTo,
      amendment: null,
      rank: -1,
    });
  }
  amendments.forEach((amendment, rank) => {
    const line = amendment.lines.find((candidate) => candidate.sku === sku);
    if (line !== undefined) {
      const to = earliest(amendment.validTo, grid.validTo);
      sources.push({ line, from: amendment.validFrom, to, amendment, rank });
    }
  });
  return sources.flatMap((source) => {
    const to = earliest(source.to, endingOf(amendments, sku, source));
    if (to !== null && to.getTime() <= source.from.getTime()) {
      return [];
    }
    return [{ line: source.line, from: source.from, to, amendment: source.amendment }];
  });
}

function covers(segment: { readonly from: Date; readonly to: Date | null }, at: Date): boolean {
  return (
    segment.from.getTime() <= at.getTime() &&
    (segment.to === null || at.getTime() < segment.to.getTime())
  );
}

/**
 * **La ligne qui fait le prix de cet article à cet instant.**
 *
 * Au plus une couvre l'instant : le refus de doublon le garantit. Quand aucune
 * ne le couvre, la ligne de la GRILLE est rendue si elle existe — avec sa
 * fenêtre, éventuellement coupée par un arrêt —, pour que la résolution dise
 * « expirée » ou « pas encore » comme elle le disait avant les avenants, au
 * lieu de se taire.
 */
export function segmentAt(grid: AmendedGrid, sku: string, at: Date): LineSegment | null {
  const segments = segmentsOf(grid, sku, at);
  return (
    segments.find((segment) => covers(segment, at)) ??
    segments.find((segment) => segment.amendment === null) ??
    null
  );
}

/** Les lignes effectives de TOUS les articles, dans l'état courant — pour le dossier staff. */
export function allSegments(grid: AmendedGrid): readonly LineSegment[] {
  const skus = new Set(grid.lines.map((line) => line.sku));
  for (const amendment of liveAmendments(grid, null)) {
    amendment.lines.forEach((line) => skus.add(line.sku));
  }
  return [...skus].flatMap((sku) => segmentsOf(grid, sku, null));
}

/**
 * **Toutes les lignes qui font un prix à cet instant**, grille et avenants,
 * arrêts compris — une par article au plus.
 */
export function linesAt(grid: AmendedGrid, at: Date): readonly PricingGridLine[] {
  const skus = new Set(grid.lines.map((line) => line.sku));
  for (const amendment of liveAmendments(grid, at)) {
    amendment.lines.forEach((line) => skus.add(line.sku));
  }
  return [...skus].flatMap((sku) => {
    const segment = segmentsOf(grid, sku, at).find((candidate) => covers(candidate, at));
    return segment === undefined ? [] : [segment.line];
  });
}

/**
 * **Vérifier un avenant** contre le document qui le reçoit, et rendre sa forme
 * normalisée (paliers triés). Le document est supposé non clos : l'agrégat le
 * vérifie avant.
 *
 * @throws {MissingAmendmentReasonError} motif vide ou blanc.
 * @throws {EmptyAmendmentError} ni ligne ouverte, ni ligne arrêtée.
 * @throws {ReversedValidityWindowError} fenêtre inversée ou vide.
 * @throws {AmendmentOutsideMercurialeError} fenêtre hors du document.
 * @throws {RetroactiveAmendmentError} `validFrom` antérieur à `now`.
 * @throws {DuplicateEndedSkuError} la même ligne arrêtée deux fois.
 * @throws {NoNegotiatedLineToEndError} un arrêt qui ne vise aucune ligne en cours.
 * @throws {SkuAlreadyNegotiatedError} un article déjà négocié sur la période.
 */
export function checkedAmendment(
  grid: AmendedGrid,
  draft: MercurialeAmendmentDraft,
  now: Date,
): MercurialeAmendmentDraft {
  if (draft.reason.trim().length === 0) {
    throw new MissingAmendmentReasonError();
  }
  if (draft.lines.length === 0 && draft.endedSkus.length === 0) {
    throw new EmptyAmendmentError();
  }
  assertWindow(grid, draft, now);
  const lines = draft.lines.length === 0 ? [] : normalizeGrid(draft.lines, REFUSALS);
  assertEndsRunningLines(grid, draft);
  return { ...draft, reason: draft.reason.trim(), lines };
}

function assertWindow(grid: AmendedGrid, draft: MercurialeAmendmentDraft, now: Date): void {
  const { validFrom, validTo } = draft;
  if (validTo !== null && validTo.getTime() <= validFrom.getTime()) {
    throw new ReversedValidityWindowError(validFrom, validTo);
  }
  const beforeDocument = validFrom.getTime() < grid.validFrom.getTime();
  const afterDocument =
    grid.validTo !== null &&
    (validFrom.getTime() >= grid.validTo.getTime() ||
      (validTo !== null && validTo.getTime() > grid.validTo.getTime()));
  if (beforeDocument || afterDocument) {
    throw new AmendmentOutsideMercurialeError(grid.validFrom, grid.validTo);
  }
  if (validFrom.getTime() < now.getTime()) {
    throw new RetroactiveAmendmentError(validFrom);
  }
}

function assertEndsRunningLines(grid: AmendedGrid, draft: MercurialeAmendmentDraft): void {
  const seen = new Set<string>();
  for (const sku of draft.endedSkus) {
    if (seen.has(sku)) {
      throw new DuplicateEndedSkuError(sku);
    }
    seen.add(sku);
    if (!segmentsOf(grid, sku, null).some((segment) => covers(segment, draft.validFrom))) {
      throw new NoNegotiatedLineToEndError(sku, draft.validFrom);
    }
  }
}

/**
 * **Le refus de doublon**, une fois l'avenant ajouté : chacune de ses lignes
 * ouvertes ne doit chevaucher aucune autre ligne effective du même article —
 * la grille (si elle n'est pas arrêtée avant) ou un autre avenant.
 *
 * @throws {SkuAlreadyNegotiatedError}
 */
export function assertNoDoubleNegotiation(grid: AmendedGrid, added: MercurialeAmendment): void {
  for (const line of added.lines) {
    const segments = segmentsOf(grid, line.sku, null);
    const mine = segments.find((segment) => segment.amendment?.id === added.id);
    if (mine === undefined) {
      continue;
    }
    const rival = segments.find(
      (segment) => segment.amendment?.id !== added.id && overlaps(segment, mine),
    );
    if (rival !== undefined) {
      throw new SkuAlreadyNegotiatedError(line.sku, rival.amendment?.validFrom ?? null);
    }
  }
}

function overlaps(left: LineSegment, right: LineSegment): boolean {
  const leftEndsAfterRightStarts = left.to === null || left.to.getTime() > right.from.getTime();
  const rightEndsAfterLeftStarts = right.to === null || right.to.getTime() > left.from.getTime();
  return leftEndsAfterRightStarts && rightEndsAfterLeftStarts;
}
