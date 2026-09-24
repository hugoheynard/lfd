import {
  checkPlacement,
  MAX_ROWS,
  place,
  type PlacedBlock,
  type PlacementResult,
  type PlacementVerdict,
  refusalMessage,
  type ShelfKey,
} from '@lfd/storefront-layout';

/**
 * La pose quand chaque rayon a SON nombre de rangées (Hugo, 2026-09-24).
 *
 * Le paquet juge un candidat contre UN nombre de rangées. Un objet partagé
 * paraît sur plusieurs rayons, à la même place, et chacun a sa hauteur : il
 * doit donc tenir sur chacun, jugé avec les rangées de ce rayon-là. C'est la
 * boucle que le serveur fait à l'écriture (`b2b/storefront/domain/composition-rules.ts`,
 * `assertPlacements`, lu le 2026-09-24) ; l'éditeur la fait à la pose, pour
 * refuser avant d'envoyer.
 */

/** Les rangées d'un rayon. */
export type RowsOf = (shelf: ShelfKey) => number;

/** Un refus, et le rayon où il tombe — un débordement ne nomme pas son rayon de lui-même. */
export type AcrossVerdict =
  | { readonly ok: true }
  | (Extract<PlacementVerdict, { ok: false }> & { readonly on: ShelfKey | null });

export function checkAcross(
  blocks: readonly PlacedBlock[],
  rowsOf: RowsOf,
  candidate: PlacedBlock,
): AcrossVerdict {
  if (candidate.shelves.length === 0) {
    return { ok: false, reason: 'noShelf', on: null };
  }
  for (const shelf of candidate.shelves) {
    const verdict = checkPlacement(blocks, rowsOf(shelf), { ...candidate, shelves: [shelf] });
    if (!verdict.ok) {
      return { ...verdict, on: shelf };
    }
  }
  return { ok: true };
}

/** Ce que rend une pose : les objets, ou le refus et son rayon. */
export type AcrossResult<B extends PlacedBlock> =
  Extract<PlacementResult<B>, { ok: true }> | Extract<AcrossVerdict, { ok: false }>;

/** Pose (ou repose, même `id`) le candidat s'il tient sur CHACUN de ses rayons. */
export function placeAcross<B extends PlacedBlock>(
  blocks: readonly B[],
  rowsOf: RowsOf,
  candidate: B,
): AcrossResult<B> {
  const verdict = checkAcross(blocks, rowsOf, candidate);
  if (!verdict.ok) {
    return verdict;
  }
  // Tenu rayon par rayon : il tient aussi sous la borne haute, qui ne sert plus
  // ici qu'à remplacer ou ajouter l'objet.
  const placed = place(blocks, MAX_ROWS, candidate);
  return placed.ok ? placed : { ...placed, on: null };
}

/** Décale un objet d'un pas (la voie clavier). Un `id` inconnu ne change rien. */
export function moveAcross<B extends PlacedBlock>(
  blocks: readonly B[],
  rowsOf: RowsOf,
  id: string,
  deltaColumn: number,
  deltaRow: number,
): AcrossResult<B> {
  const block = blocks.find((candidate) => candidate.id === id);
  if (block === undefined) {
    return { ok: true, blocks };
  }
  return placeAcross(blocks, rowsOf, {
    ...block,
    column: block.column + deltaColumn,
    row: block.row + deltaRow,
  });
}

/** Change les rayons d'un objet, à position inchangée ; doublons ignorés. */
export function setShelvesAcross<B extends PlacedBlock>(
  blocks: readonly B[],
  rowsOf: RowsOf,
  id: string,
  shelves: readonly ShelfKey[],
): AcrossResult<B> {
  const block = blocks.find((candidate) => candidate.id === id);
  if (block === undefined) {
    return { ok: true, blocks };
  }
  return placeAcross(blocks, rowsOf, { ...block, shelves: [...new Set(shelves)] });
}

/** Le texte d'un refus ; un débordement de rangées nomme le rayon trop court. */
export function acrossMessage(
  refusal: Extract<AcrossVerdict, { ok: false }>,
  rowsOf: RowsOf,
  shelfLabel: (shelf: ShelfKey) => string,
): string {
  const rows = refusal.on === null ? MAX_ROWS : rowsOf(refusal.on);
  const text = refusalMessage(refusal, rows, shelfLabel);
  return refusal.reason === 'rows' && refusal.on !== null
    ? `Sur le rayon « ${shelfLabel(refusal.on)} » : ${text}`
    : text;
}
