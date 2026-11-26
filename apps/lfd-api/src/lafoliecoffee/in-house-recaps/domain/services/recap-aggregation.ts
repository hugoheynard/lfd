import { InvalidRecapQuantityError } from "../errors/in-house-recap-errors.js";

/** Une ligne de BL, telle que le récapitulatif la lit. */
export interface RecapSourceLine {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: string;
  readonly quantity: number;
}

/** Un BL remis, tel que le récapitulatif le couvre. */
export interface RecapSourceNote {
  readonly deliveryNoteId: string;
  readonly number: string;
  readonly handedOverAt: Date;
  readonly contentVersion: number;
  readonly lines: readonly RecapSourceLine[];
}

/** Une ligne du récapitulatif : un produit dans une unité de vente, et sa quantité totale. */
export interface RecapLine {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: string;
  readonly quantity: number;
}

interface Accumulated {
  readonly sku: string;
  readonly saleUnit: string;
  quantity: number;
  /** Le BL qui a donné le nom, pour le départage. */
  namedBy: RecapSourceNote;
  productName: string;
}

/**
 * **L'agrégation du récapitulatif** (`plan-restaurants-maison.md`, D7) : la
 * quantité totale remise par (`sku`, `sale_unit`) — deux unités de vente d'un
 * même produit ne s'additionnent pas. Le nom affiché est celui du BL remis le
 * plus tard, départagé par le numéro le plus grand : un produit renommé dans
 * le mois s'affiche sous son dernier nom, et deux passages donnent le même.
 *
 * Une ligne dont le total est nul ne dit rien et sort ; une quantité négative
 * ou non entière est refusée. Lignes triées par nom, puis sku, puis unité.
 *
 * @throws {InvalidRecapQuantityError} une ligne de BL à quantité négative ou non entière.
 */
export function aggregateRecapLines(notes: readonly RecapSourceNote[]): readonly RecapLine[] {
  const byKey = new Map<string, Accumulated>();
  for (const note of notes) {
    for (const line of note.lines) {
      accumulate(byKey, note, line);
    }
  }
  return [...byKey.values()]
    .filter((entry) => entry.quantity > 0)
    .map(({ sku, productName, saleUnit, quantity }) => ({ sku, productName, saleUnit, quantity }))
    .sort(byDisplayOrder);
}

function accumulate(
  byKey: Map<string, Accumulated>,
  note: RecapSourceNote,
  line: RecapSourceLine,
): void {
  if (!Number.isInteger(line.quantity) || line.quantity < 0) {
    throw new InvalidRecapQuantityError(note.number, line.sku);
  }
  const key = `${line.sku}\u0000${line.saleUnit}`;
  const known = byKey.get(key);
  if (known === undefined) {
    byKey.set(key, {
      sku: line.sku,
      saleUnit: line.saleUnit,
      quantity: line.quantity,
      namedBy: note,
      productName: line.productName,
    });
    return;
  }
  known.quantity += line.quantity;
  if (namesLater(note, known.namedBy)) {
    known.namedBy = note;
    known.productName = line.productName;
  }
}

/** Ce BL donne-t-il le nom plutôt que l'autre ? Le plus tard remis, puis le plus grand numéro. */
function namesLater(candidate: RecapSourceNote, current: RecapSourceNote): boolean {
  const delta = candidate.handedOverAt.getTime() - current.handedOverAt.getTime();
  if (delta !== 0) {
    return delta > 0;
  }
  return candidate.number.localeCompare(current.number, "fr", { numeric: true }) > 0;
}

function byDisplayOrder(left: RecapLine, right: RecapLine): number {
  return (
    left.productName.localeCompare(right.productName, "fr") ||
    left.sku.localeCompare(right.sku) ||
    left.saleUnit.localeCompare(right.saleUnit)
  );
}
