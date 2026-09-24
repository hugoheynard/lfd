import { computed, Injectable, signal } from '@angular/core';
import { contentIssuesOf, returnedIdsOf, shelfOptionsOf } from './storefront-diagnostics';
import type { StorefrontContent } from '@lfd/contracts';
import {
  type CarouselSettings,
  checkRowLimit,
  type ContentsMode,
  describeFormat,
  firstFreeCell,
  freeCells,
  type MediaFit,
  type MediaSide,
  onShelf,
  removeBlock,
  setApplyOnMobile,
  setCarousel,
  setContents,
  setMedia,
  type ShelfKey,
  type StorefrontShape,
  type StorefrontTone,
} from '@lfd/storefront-layout';

import { type EditorBlock, itemsOf, setItems, setTone } from './storefront-block';
import {
  ALL_SHELVES,
  shelfLabelIn,
  type StorefrontCatalog,
  vanishedShelves,
} from './storefront-catalog';
import {
  dropShelf,
  EMPTY_STATE,
  type EditorState,
  LOCAL_ID_PREFIX,
  payloadOf,
  rowsIn,
} from './storefront-payload';
import {
  acrossMessage,
  type AcrossResult,
  moveAcross,
  placeAcross,
  setShelvesAcross,
} from './storefront-placement';
import type { StorefrontObjectHost } from './storefront-object-host';
import { reshape } from './storefront-reshape';
import {
  createTemplate,
  deleteTemplate,
  placeTemplate,
  type StorefrontTemplate,
  type TemplateLabel,
  type TemplateResult,
  updateTemplateLabel,
} from './storefront-templates';

/**
 * La composition de la vitrine, et les intentions qui la modifient.
 *
 * Elle est tenue HORS du composant pour que la page et le dialogue d'objet
 * (qui la reçoit comme `host`) parlent au même état sans que l'un connaisse
 * l'autre, et pour qu'une intention se teste sans DOM. Fourni par la page
 * (`providers`), jamais en racine : une vitrine éditée vit et meurt avec l'écran.
 *
 * Chaque rayon a SON nombre de rangées (Hugo, 2026-09-24) : un objet partagé
 * doit tenir sur chacun de ses rayons, jugé avec les rangées de chacun
 * (`storefront-placement.ts`). Les rayons sont ceux du catalogue
 * d'administration — « Tout », puis les familles servies.
 */
@Injectable()
export class StorefrontEditorStore implements StorefrontObjectHost {
  /** Le catalogue de l'éditeur (`/admin/storefront/catalog`) ; `null` s'il n'a pas pu être lu. */
  readonly catalog = signal<StorefrontCatalog | null>(null);
  readonly revision = signal(0);
  /** Les rangées de chaque rayon qui a une page. */
  readonly rowsByShelf = signal<Readonly<Record<ShelfKey, number>>>({});
  /** Tous les objets, de tous les rayons. */
  readonly blocks = signal<readonly EditorBlock[]>([]);
  readonly templates = signal<readonly StorefrontTemplate[]>([]);
  /**
   * La vitrine telle que chargée ou enregistrée, en payload : le point de comparaison.
   * Notifie à CHAQUE `apply`, même à l'identique : la page y remet sa sortie retenue.
   */
  readonly baseline = signal(JSON.stringify(payloadOf(EMPTY_STATE)), { equal: () => false });
  readonly shelf = signal<ShelfKey>(ALL_SHELVES);
  readonly selectedId = signal<string | null>(null);
  /** Le dernier refus, dit en toutes lettres. */
  readonly notice = signal<string | null>(null);
  private nextId = 1;

  readonly editorState = computed<EditorState>(() => ({
    revision: this.revision(),
    rows: this.rowsByShelf(),
    blocks: this.blocks(),
    templates: this.templates(),
  }));

  /** Des modifications que le serveur n'a pas. */
  readonly dirty = computed(
    () => JSON.stringify(payloadOf(this.editorState())) !== this.baseline(),
  );

  /**
   * Les rayons proposés. Sans catalogue, « Tout » et les rayons que la vitrine
   * vise déjà, nommés par leur clé : on peut encore composer, pas nommer.
   */
  readonly shelves = computed(() => shelfOptionsOf(this.catalog(), this.usedShelves()));

  /** Les rayons que la vitrine vise : une page, ou un objet qui y paraît. */
  private readonly usedShelves = computed<readonly ShelfKey[]>(() => [
    ...new Set([...Object.keys(this.rowsByShelf()), ...this.blocks().flatMap((b) => b.shelves)]),
  ]);

  /**
   * Les rayons DISPARUS : visés par la vitrine, mais plus une famille servie
   * (D4). La boutique ne les sert plus ; on les liste pour les vider. Sans
   * catalogue, on n'en sait rien — et l'on n'en affirme aucun.
   */
  readonly vanished = computed<readonly ShelfKey[]>(() =>
    this.catalog() === null ? [] : vanishedShelves(this.usedShelves(), this.shelves()),
  );

  /** Tant qu'il y en a, Enregistrer reste fermé (`contentIssuesOf`). */
  readonly contentIssues = computed(() => contentIssuesOf(this.blocks(), this.shelfLabel));

  /** Les objets qui rendent leurs cases au rayon (`returnedIdsOf`). */
  readonly returnedIds = computed(() => returnedIdsOf(this.blocks(), this.catalog()));

  /** Le nom de l'article d'un contenu produit, s'il est encore en vente. */
  readonly productNames = computed(
    () => new Map((this.catalog()?.products ?? []).map((product) => [product.sku, product.name])),
  );

  readonly shelfLabel = (key: ShelfKey): string => shelfLabelIn(this.shelves(), key);

  /** Les rangées d'un rayon — chacun a les siennes. */
  readonly rowsOf = (shelf: ShelfKey): number => rowsIn({ rows: this.rowsByShelf() }, shelf);

  /** Les rangées du rayon édité. */
  readonly rows = computed(() => this.rowsOf(this.shelf()));

  /** Les objets de la page éditée. */
  readonly pageBlocks = computed(() => onShelf(this.blocks(), this.shelf()));

  /**
   * Les cases libres, en ordre de lecture : le reste du rayon s'y range, dans
   * l'ordre du catalogue. Montrées, jamais éditables.
   */
  readonly freeCells = computed(() => freeCells(this.pageBlocks(), this.rows()));

  readonly selected = computed(() => {
    const id = this.selectedId();
    return this.pageBlocks().find((block) => block.id === id) ?? null;
  });

  /** Remplace la composition par une vitrine lue : c'est le nouveau point de comparaison. */
  apply(state: EditorState): void {
    this.revision.set(state.revision);
    this.rowsByShelf.set(state.rows);
    this.blocks.set(state.blocks);
    this.templates.set(state.templates);
    this.baseline.set(JSON.stringify(payloadOf(state)));
    this.notice.set(null);
    if (!state.blocks.some((block) => block.id === this.selectedId())) {
      this.selectedId.set(null);
    }
  }

  pickShelf(shelf: ShelfKey): void {
    this.shelf.set(shelf);
    this.selectedId.set(null);
    this.notice.set(null);
  }

  /** Réduire le rayon édité sous un de ses objets est refusé, en le nommant. */
  setRows(rows: number): boolean {
    const shelf = this.shelf();
    const verdict = checkRowLimit(this.pageBlocks(), rows);
    if (!verdict.ok) {
      const { blocker } = verdict;
      this.notice.set(
        `Impossible de passer « ${this.shelfLabel(shelf)} » à ${rows} rangée${rows > 1 ? 's' : ''} : ` +
          `« ${describeFormat(blocker.format)} » (colonne ${blocker.column}, rangée ${blocker.row}) dépasserait. ` +
          `Déplacez-le ou retirez-le d’abord — la page reste à ${this.rows()} rangées.`,
      );
      return false;
    }
    this.rowsByShelf.update((current) => ({ ...current, [shelf]: rows }));
    this.notice.set(null);
    return true;
  }

  /** Voie clavier (et clic) de la palette : la première case libre du rayon édité. */
  addFormat(format: StorefrontShape): void {
    const shelves = [this.shelf()];
    const cell = firstFreeCell(this.blocks(), this.rows(), format, shelves);
    if (cell === null) {
      this.notice.set(`Plus aucune place pour « ${describeFormat(format)} » sur ce rayon.`);
      return;
    }
    this.commit(
      placeAcross(this.blocks(), this.rowsOf, { id: this.newId(), format, ...cell, shelves }),
      true,
    );
  }

  /** Un gabarit se pose comme une forme : à la première place libre du rayon édité. */
  addTemplate(template: StorefrontTemplate): void {
    const result = placeTemplate(this.blocks(), this.rowsOf, template, this.newId(), this.shelf());
    if (!result.ok && result.reason === 'full') {
      this.notice.set(`Plus aucune place pour le gabarit « ${template.name} » sur ce rayon.`);
      return;
    }
    this.commit(result, true);
  }

  /** Enregistre l'objet sélectionné comme gabarit ; rend `false` si le nom est refusé. */
  saveSelectedAsTemplate(label: TemplateLabel): boolean {
    const block = this.selected();
    if (block === null) {
      return false;
    }
    return this.applyTemplates(createTemplate(this.templates(), block, this.newId(), label));
  }

  /** Renomme et/ou redécrit un gabarit ; les objets déjà posés n'en savent rien. */
  updateTemplate(id: string, label: TemplateLabel): boolean {
    return this.applyTemplates(updateTemplateLabel(this.templates(), id, label));
  }

  deleteTemplate(id: string): void {
    this.templates.update((templates) => deleteTemplate(templates, id));
  }

  private applyTemplates(result: TemplateResult): boolean {
    if (!result.ok) {
      this.notice.set(`Refusé : ${result.message}`);
      return false;
    }
    this.templates.set(result.templates);
    this.notice.set(null);
    return true;
  }

  moveSelected(deltaColumn: number, deltaRow: number): void {
    const id = this.selectedId();
    if (id !== null) {
      this.commit(moveAcross(this.blocks(), this.rowsOf, id, deltaColumn, deltaRow), false);
    }
  }

  /** Retirer, c'est retirer de TOUS ses rayons : l'objet est un seul objet. */
  remove(id: string): void {
    this.blocks.update((blocks) => removeBlock(blocks, id));
    this.notice.set(null);
    if (this.selectedId() === id) {
      this.selectedId.set(null);
    }
  }

  select(id: string): void {
    this.selectedId.set(id);
  }

  /** Applique une transformation à l'objet sélectionné, s'il y en a un. */
  private updateSelected(
    change: (blocks: readonly EditorBlock[], id: string) => readonly EditorBlock[],
  ): void {
    const id = this.selectedId();
    if (id !== null) {
      this.blocks.update((blocks) => change(blocks, id));
    }
  }

  setSelectedApplyOnMobile(value: boolean): void {
    this.updateSelected((blocks, id) => setApplyOnMobile(blocks, id, value));
  }

  setSelectedMedia(media: { readonly fit?: MediaFit; readonly side?: MediaSide }): void {
    this.updateSelected((blocks, id) => setMedia(blocks, id, media));
  }

  /** Change la forme ; refusé (et dit) si la nouvelle taille ne tient pas sur un de ses rayons. */
  setSelectedFormat(format: StorefrontShape): void {
    const id = this.selectedId();
    if (id !== null) {
      this.commit(reshape(this.blocks(), this.rowsOf, id, format), false);
    }
  }

  setSelectedTone(tone: StorefrontTone): void {
    this.updateSelected((blocks, id) => setTone(blocks, id, tone));
  }

  /** Repasser à « un seul » avec plusieurs contenus est refusé : le serveur le refuserait aussi. */
  setSelectedContents(value: ContentsMode): void {
    const selected = this.selected();
    if (value === 'single' && selected !== null && itemsOf(selected).length > 1) {
      this.notice.set(
        `Refusé : cet objet porte ${itemsOf(selected).length} contenus. Retirez-en jusqu’à un seul d’abord.`,
      );
      return;
    }
    this.updateSelected((blocks, id) => setContents(blocks, id, value));
  }

  setSelectedItems(items: readonly StorefrontContent[]): void {
    this.updateSelected((blocks, id) => setItems(blocks, id, items));
  }

  /** Une valeur hors bornes est refusée et dite ; le réglage précédent reste. */
  setSelectedCarousel(patch: Partial<CarouselSettings>): void {
    const id = this.selectedId();
    if (id === null) {
      return;
    }
    const result = setCarousel(this.blocks(), id, patch);
    if (!result.ok) {
      this.notice.set(`Refusé : ${result.message}`);
      return;
    }
    this.blocks.set(result.blocks);
    this.notice.set(null);
  }

  setSelectedShelves(shelves: readonly ShelfKey[]): void {
    const id = this.selectedId();
    if (id !== null) {
      this.commit(setShelvesAcross(this.blocks(), this.rowsOf, id, shelves), false);
    }
  }

  /** Vide un rayon disparu : sa page part, et les objets qui n'y paraissaient que là avec elle. */
  clearShelf(shelf: ShelfKey): void {
    const next = dropShelf(this.editorState(), shelf);
    this.rowsByShelf.set(next.rows);
    this.blocks.set(next.blocks);
    if (this.shelf() === shelf) {
      this.pickShelf(ALL_SHELVES);
    }
  }

  /** Les rayons d'un objet déplacé, ou le rayon édité pour un objet neuf. */
  shelvesOf(blockId: string | null): readonly ShelfKey[] {
    const block =
      blockId === null ? undefined : this.blocks().find((candidate) => candidate.id === blockId);
    return block?.shelves ?? [this.shelf()];
  }

  /** Retient un placement accepté (et sélectionne l'objet neuf), ou dit le refus. */
  commit(
    result: AcrossResult<EditorBlock> | { readonly ok: false; readonly reason: 'full' },
    selectNew: boolean,
  ): void {
    if (!result.ok) {
      if (result.reason !== 'full') {
        this.notice.set(`Refusé : ${acrossMessage(result, this.rowsOf, this.shelfLabel)}`);
      }
      return;
    }
    this.blocks.set(result.blocks);
    this.notice.set(null);
    const last = result.blocks.at(-1);
    if (selectNew && last !== undefined) {
      this.select(last.id);
    }
  }

  /** Un identifiant local : le serveur donne le vrai à l'enregistrement. */
  newId(): string {
    return `${LOCAL_ID_PREFIX}${this.nextId++}`;
  }
}
