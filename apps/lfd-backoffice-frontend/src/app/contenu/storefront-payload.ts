import type {
  StorefrontObjectView,
  StorefrontPayloadInput,
  StorefrontTemplateView,
  StorefrontView,
} from '@lfd/contracts';
import {
  carouselOf,
  contentsOf,
  DEFAULT_ROWS,
  mediaFitOf,
  mediaSideOf,
  type ShelfKey,
} from '@lfd/storefront-layout';

import { type EditorBlock, itemsOf, toneOf } from './storefront-block';
import type { StorefrontTemplate } from './storefront-templates';

/**
 * Le préfixe d'un identifiant posé par l'éditeur, pour un objet ou un gabarit
 * que le serveur ne connaît pas encore. Il ne part JAMAIS : un objet sans `id`
 * est un objet neuf, que le serveur identifie (contrat, `storefrontObjectPayloadSchema`).
 */
export const LOCAL_ID_PREFIX = 'local-';

export function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_ID_PREFIX);
}

/** La vitrine telle que l'éditeur la tient entre deux enregistrements. */
export interface EditorState {
  /** Celle qu'on a chargée : le verrou du `PUT` (D6). `0` : jamais enregistrée. */
  readonly revision: number;
  /** Les rangées de chaque rayon qui a une page. Un rayon absent en a {@link DEFAULT_ROWS}. */
  readonly rows: Readonly<Record<ShelfKey, number>>;
  readonly blocks: readonly EditorBlock[];
  readonly templates: readonly StorefrontTemplate[];
}

export const EMPTY_STATE: EditorState = { revision: 0, rows: {}, blocks: [], templates: [] };

export function rowsIn(state: Pick<EditorState, 'rows'>, shelf: ShelfKey): number {
  return state.rows[shelf] ?? DEFAULT_ROWS;
}

function blockOf(object: StorefrontObjectView): EditorBlock {
  return {
    id: object.id,
    format: object.shape,
    column: object.column,
    row: object.row,
    shelves: [...object.shelves],
    applyOnMobile: object.applyOnMobile,
    mediaFit: object.mediaFit,
    mediaSide: object.mediaSide,
    contents: object.multiple ? 'multiple' : 'single',
    carousel: { ...object.carousel },
    tone: object.tone,
    items: [...object.contents],
  };
}

function templateOf(template: StorefrontTemplateView): StorefrontTemplate {
  return {
    id: template.id,
    name: template.name,
    ...(template.description === null || template.description === ''
      ? {}
      : { description: template.description }),
    format: template.shape,
    mediaFit: template.mediaFit,
    mediaSide: template.mediaSide,
    tone: template.tone,
    applyOnMobile: template.applyOnMobile,
    contents: template.multiple ? 'multiple' : 'single',
    carousel: { ...template.carousel },
  };
}

export function stateOf(view: StorefrontView): EditorState {
  return {
    revision: view.revision,
    rows: Object.fromEntries(view.pages.map((page) => [page.shelfKey, page.rows])),
    blocks: view.objects.map(blockOf),
    templates: view.templates.map(templateOf),
  };
}

/** Les réglages communs à un objet et à un gabarit, défauts résolus. */
function settingsOf(source: EditorBlock | StorefrontTemplate) {
  // Les lecteurs du paquet prennent un objet posé ; seuls les réglages comptent ici.
  const block: EditorBlock = {
    ...source,
    column: 1,
    row: 1,
    shelves: [],
  };
  return {
    shape: source.format,
    applyOnMobile: source.applyOnMobile ?? true,
    mediaFit: mediaFitOf(block),
    mediaSide: mediaSideOf(block),
    multiple: contentsOf(block) === 'multiple',
    carousel: { ...carouselOf(block) },
    tone: toneOf(block),
  };
}

function idOf(id: string): { readonly id?: string } {
  return isLocalId(id) ? {} : { id };
}

/**
 * Les rayons qui ont une page : ceux qu'on a chargés ou réglés, et tous ceux
 * où paraît un objet — le serveur refuse un objet sur un rayon sans page
 * (`composition-rules.ts`, `assertPlacements`, lu le 2026-09-24).
 */
function pageKeys(state: EditorState): readonly ShelfKey[] {
  return [...new Set([...Object.keys(state.rows), ...state.blocks.flatMap((b) => b.shelves)])];
}

/** La vitrine ENTIÈRE, telle que le `PUT` l'attend. */
export function payloadOf(state: EditorState): StorefrontPayloadInput {
  return {
    revision: state.revision,
    pages: pageKeys(state).map((shelfKey) => ({ shelfKey, rows: rowsIn(state, shelfKey) })),
    objects: state.blocks.map((block) => ({
      ...idOf(block.id),
      ...settingsOf(block),
      column: block.column,
      row: block.row,
      shelves: [...block.shelves],
      contents: [...itemsOf(block)],
    })),
    templates: state.templates.map((template) => ({
      ...idOf(template.id),
      name: template.name,
      description: template.description ?? null,
      ...settingsOf(template),
    })),
  };
}

/**
 * Vide un rayon disparu : sa page part, il quitte chaque objet, et un objet
 * qui ne paraissait que là part avec lui — le serveur l'archivera.
 */
export function dropShelf(state: EditorState, shelf: ShelfKey): EditorState {
  const rows = Object.fromEntries(Object.entries(state.rows).filter(([key]) => key !== shelf));
  const blocks = state.blocks
    .map((block) => ({ ...block, shelves: block.shelves.filter((key) => key !== shelf) }))
    .filter((block) => block.shelves.length > 0);
  return { ...state, rows, blocks };
}
