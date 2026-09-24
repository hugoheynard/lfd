/**
 * La COMPOSITION d'une page de rayon — où va chaque chose, sans rien rendre
 * (`documentation/order/plan-vitrine-enregistrement.md`, D10 ; règles :
 * `documentation/order/boutique-rayon-layout.md`, « Une page par rayon »).
 *
 * Elle reçoit la page servie et le rayon, et rend des **cases résolues** :
 * leur place au bureau, leur place dans la pile, et ce qu'elles portent — les
 * contenus d'un objet, ou un article du rayon. La boutique pose ces cases par
 * variables CSS ; elle ne décide plus de rien.
 *
 * Les règles, dans l'ordre où elles s'appliquent :
 *
 * 1. un objet qui n'a rien d'affichable (`render.ts`) ne se pose pas, et ses
 *    cases redeviennent libres — 🔴 « aucune case n'est jamais vide » ;
 * 2. un objet qui déborde des rangées de la page ou en chevauche un autre
 *    (déjà posé, en ordre de lecture) ne se pose pas non plus. Le serveur le
 *    refuse à l'écriture ; ce garde ne sert qu'à ne jamais superposer deux
 *    objets si une page servie le contredisait ;
 * 3. les cases libres reçoivent le reste du rayon, dans l'ordre du catalogue
 *    et en ordre de lecture, SANS doublon : un article posé par un objet n'y
 *    reparaît pas ;
 * 4. ce qui reste du rayon s'écoule sous la dernière rangée, cinq par rangée.
 *
 * Types STRUCTURELS, comme `render.ts` : le paquet n'importe pas le contrat
 * (sans zod, D8). La vue publique `PublicStorefrontPageView` les satisfait.
 */

import { type CarouselNav } from "./carousel.js";
import {
  type Cell,
  formatSpec,
  freeCells,
  GRID_COLUMNS,
  overlaps,
  type PlacedBlock,
  readingOrder,
  type StorefrontShape,
} from "./grid.js";
import { mobileFormat } from "./mobile.js";
import { isContentRenderable, type RenderableContent } from "./render.js";

/** Le défilement tel que la page le sert : sans le nombre simulé de l'éditeur. */
export interface ComposedCarousel {
  readonly nav: CarouselNav;
  readonly autoplay: boolean;
  readonly intervalSeconds: number;
  readonly firstSeconds: number;
}

/** Ce que la composition lit d'un objet servi. */
export interface ComposableObject {
  readonly id: string;
  readonly shape: StorefrontShape;
  readonly column: number;
  readonly row: number;
  readonly applyOnMobile: boolean;
  /** `null` pour un seul contenu. */
  readonly carousel: ComposedCarousel | null;
  readonly contents: readonly RenderableContent[];
}

/** Ce que la composition lit d'une page servie. */
export interface ComposablePage<O extends ComposableObject = ComposableObject> {
  /** 0 : le rayon n'a pas de page, tout s'écoule en cartes. */
  readonly rows: number;
  readonly objects: readonly O[];
}

/** La place d'une case au bureau (5 colonnes), positions 1-indexées. */
export interface DeskPlacement {
  readonly col: number;
  readonly row: number;
  readonly cols: number;
  readonly rows: number;
  /**
   * Aucune autre case ne partage ses rangées. Une rangée `auto` prend la
   * hauteur de ce qu'elle porte : sans voisine, une bande ou un bloc
   * s'écraserait à la hauteur de son texte. Le rendu lui donne un plancher.
   */
  readonly alone: boolean;
}

/** La place d'une case dans la pile (2 colonnes, rangement dense). */
export interface MobilePlacement {
  /** Rang dans l'ordre de lecture, 0-indexé : la valeur de `order`. */
  readonly order: number;
  readonly cols: number;
  readonly rows: number;
}

/** Une case portée par un objet : ses contenus AFFICHABLES, dans l'ordre. */
export interface ObjectSlot<O extends ComposableObject> {
  readonly kind: "object";
  readonly object: O;
  /** Jamais vide. Un contenu non affichable sort du défilement. */
  readonly contents: readonly O["contents"][number][];
  /**
   * `null` dès qu'il ne reste qu'un contenu affichable — ou que l'objet est
   * réglé sur un seul : il ne montre alors que le premier.
   */
  readonly carousel: ComposedCarousel | null;
}

/** Une case remplie par le reste du rayon. */
export interface FillSlot {
  readonly kind: "fill";
  readonly sku: string;
}

export interface ComposedCell<O extends ComposableObject = ComposableObject> {
  /** Stable d'un rendu à l'autre : `object:<id>` ou `sku:<sku>`. */
  readonly key: string;
  readonly desk: DeskPlacement;
  readonly mobile: MobilePlacement;
  readonly slot: ObjectSlot<O> | FillSlot;
}

interface Accepted<O extends ComposableObject> {
  readonly object: O;
  readonly block: PlacedBlock;
  readonly contents: readonly O["contents"][number][];
  readonly carousel: ComposedCarousel | null;
}

/** Le rayon fictif des sondes de collision : la page est déjà celle d'UN rayon. */
const PAGE_SHELF = "page";

function asBlock(object: ComposableObject): PlacedBlock {
  return {
    id: object.id,
    format: object.shape,
    column: object.column,
    row: object.row,
    applyOnMobile: object.applyOnMobile,
    shelves: [PAGE_SHELF],
  };
}

function fitsPage(block: PlacedBlock, rows: number): boolean {
  const spec = formatSpec(block.format);
  return (
    block.column >= 1 &&
    block.row >= 1 &&
    block.column + spec.columns - 1 <= GRID_COLUMNS &&
    block.row + spec.rows - 1 <= rows
  );
}

/** Les objets qui se posent : affichables, dans la page, sans chevauchement. */
function acceptObjects<O extends ComposableObject>(
  page: ComposablePage<O>,
  rows: number,
  servedSkus: ReadonlySet<string>,
): readonly Accepted<O>[] {
  const byId = new Map(page.objects.map((object) => [object.id, object]));
  const accepted: Accepted<O>[] = [];
  for (const block of readingOrder(page.objects.map(asBlock))) {
    const object = byId.get(block.id);
    if (object === undefined) {
      continue;
    }
    const renderable = object.contents.filter((content) =>
      isContentRenderable(content, servedSkus),
    );
    // Un objet réglé sur UN contenu n'en montre qu'un, même s'il en garde
    // d'autres ; et un défilement réduit à un seul contenu n'en est plus un.
    const contents = object.carousel === null ? renderable.slice(0, 1) : renderable;
    const carousel = contents.length > 1 ? object.carousel : null;
    const blocked = accepted.some((placed) => overlaps(placed.block, block));
    if (contents.length > 0 && fitsPage(block, rows) && !blocked) {
      accepted.push({ object, block, contents, carousel });
    }
  }
  return accepted;
}

/**
 * Les SKU que les objets posés MONTRENT : ils ne reparaissent pas dans les
 * cases libres. Un contenu gardé mais inactif (objet réglé sur un seul) ne
 * réserve pas son article — personne ne le verrait.
 */
function posedSkus(accepted: readonly Accepted<ComposableObject>[]): ReadonlySet<string> {
  const skus = new Set<string>();
  for (const { contents } of accepted) {
    for (const content of contents) {
      if (content.kind === "product") {
        skus.add(content.sku);
      }
    }
  }
  return skus;
}

interface Draft<O extends ComposableObject> {
  readonly key: string;
  readonly at: Cell;
  readonly desk: Omit<DeskPlacement, "alone">;
  readonly mobile: Omit<MobilePlacement, "order">;
  readonly slot: ObjectSlot<O> | FillSlot;
}

function objectDraft<O extends ComposableObject>(placed: Accepted<O>): Draft<O> {
  const spec = formatSpec(placed.block.format);
  const mobile = mobileFormat(placed.block);
  return {
    key: `object:${placed.object.id}`,
    at: placed.block,
    desk: { col: placed.block.column, row: placed.block.row, cols: spec.columns, rows: spec.rows },
    mobile: { cols: mobile.columns, rows: mobile.rows },
    slot: {
      kind: "object",
      object: placed.object,
      contents: placed.contents,
      carousel: placed.carousel,
    },
  };
}

function fillDraft<O extends ComposableObject>(sku: string, at: Cell): Draft<O> {
  return {
    key: `sku:${sku}`,
    at,
    desk: { col: at.column, row: at.row, cols: 1, rows: 1 },
    mobile: { cols: 1, rows: 1 },
    slot: { kind: "fill", sku },
  };
}

/** Les rangées de bureau qu'une case couvre. */
function rowsOf(desk: Omit<DeskPlacement, "alone">): readonly number[] {
  return Array.from({ length: desk.rows }, (_, index) => desk.row + index);
}

/** Une case est seule si aucune autre ne touche l'une de ses rangées. */
function withAlone<O extends ComposableObject>(
  drafts: readonly Draft<O>[],
): readonly (Draft<O> & { readonly alone: boolean })[] {
  const count = new Map<number, number>();
  for (const draft of drafts) {
    for (const row of rowsOf(draft.desk)) {
      count.set(row, (count.get(row) ?? 0) + 1);
    }
  }
  return drafts.map((draft) => ({
    ...draft,
    alone: rowsOf(draft.desk).every((row) => count.get(row) === 1),
  }));
}

/**
 * Compose la page d'un rayon.
 *
 * @param page la page servie (`GET /shop/storefront/:shelfKey`) ;
 * @param shelfSkus les SKU du rayon, dans l'ordre du catalogue — de quoi
 *   remplir les cases libres et s'écouler dessous ;
 * @param servedSkus TOUS les SKU que le catalogue sert : un objet peut mettre
 *   en avant un article d'un autre rayon, et un article retiré ne se rend pas.
 *
 * Les cases sortent en ordre de lecture du bureau (rangée, puis colonne) —
 * l'ordre du DOM, qui est aussi l'ordre de la pile.
 *
 * ⚠️ Si le rayon compte moins d'articles que la page n'a de cases libres, les
 * dernières restent sans case : il n'y a plus rien à y mettre.
 */
export function composeShelf<O extends ComposableObject>(
  page: ComposablePage<O>,
  shelfSkus: readonly string[],
  servedSkus: ReadonlySet<string>,
): readonly ComposedCell<O>[] {
  const rows = Math.max(0, Math.floor(page.rows));
  const accepted = acceptObjects(page, rows, servedSkus);
  const posed = posedSkus(accepted);
  const pool = [...new Set(shelfSkus)].filter((sku) => !posed.has(sku));

  const free = freeCells(
    accepted.map((placed) => placed.block),
    rows,
  );
  const below = pool.slice(free.length);

  const drafts: Draft<O>[] = [
    ...accepted.map(objectDraft),
    ...free.flatMap((cell, index) => {
      const sku = pool[index];
      return sku === undefined ? [] : [fillDraft<O>(sku, cell)];
    }),
    ...below.map((sku, index) =>
      fillDraft<O>(sku, {
        column: 1 + (index % GRID_COLUMNS),
        row: rows + 1 + Math.floor(index / GRID_COLUMNS),
      }),
    ),
  ];
  drafts.sort((a, b) => a.at.row - b.at.row || a.at.column - b.at.column);

  return withAlone(drafts).map((draft, order) => ({
    key: draft.key,
    desk: { ...draft.desk, alone: draft.alone },
    mobile: { ...draft.mobile, order },
    slot: draft.slot,
  }));
}

/** La page porte-t-elle au moins un objet posé ? Sinon, c'est le rayon d'aujourd'hui. */
export function hasComposedObject<O extends ComposableObject>(
  cells: readonly ComposedCell<O>[],
): boolean {
  return cells.some((cell) => cell.slot.kind === "object");
}
