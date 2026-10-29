import type { PricingGridLine } from "../pricing-grid.js";
import type { AmendedGrid, LineSegment, MercurialeAmendment } from "./mercuriale-amendment.js";

/*
 * La COMPOSITION d'une mercuriale et de ses avenants à une date : quelle
 * ligne fait le prix d'un article, sur quelle fenêtre réelle. Pure — rien
 * n'est réécrit, tout se compose à la lecture.
 */

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

/** L'instant tombe-t-il dans `[from, to)` ? */
export function covers(
  segment: { readonly from: Date; readonly to: Date | null },
  at: Date,
): boolean {
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

/** Deux lignes effectives se recouvrent-elles ? */
export function overlaps(left: LineSegment, right: LineSegment): boolean {
  const leftEndsAfterRightStarts = left.to === null || left.to.getTime() > right.from.getTime();
  const rightEndsAfterLeftStarts = right.to === null || right.to.getTime() > left.from.getTime();
  return leftEndsAfterRightStarts && rightEndsAfterLeftStarts;
}

/**
 * **La ligne d'un article à reporter** : celle qui court à `now`, sinon la
 * prochaine à s'ouvrir — `null` quand il n'y en a plus. Une ligne terminée ne
 * se reporte pas : elle ne fait plus de prix.
 */
export function carriedSegment(grid: AmendedGrid, sku: string, now: Date): LineSegment | null {
  const segments = segmentsOf(grid, sku, null);
  const running = segments.find((segment) => covers(segment, now));
  if (running !== undefined) {
    return running;
  }
  const upcoming = segments
    .filter((segment) => segment.from.getTime() > now.getTime())
    .sort((left, right) => left.from.getTime() - right.from.getTime());
  return upcoming[0] ?? null;
}
