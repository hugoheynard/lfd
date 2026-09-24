import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  activeCarousel,
  type CarouselSettings,
  type Cell,
  checkRowLimit,
  type ContentsMode,
  describeFormat,
  firstFreeCell,
  FORMATS,
  formatSpec,
  freeCells,
  GRID_COLUMNS,
  isRenderable,
  MAX_ROWS,
  mediaFitOf,
  mediaSideOf,
  type MediaFit,
  type MediaSide,
  MIN_ROWS,
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
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import type { HasPendingChanges } from '../../pim/catalogue/product-form/pending-changes.guard';
import type { StorefrontContent } from '@lfd/contracts';
import { type EditorBlock, itemsOf, setItems, setTone, toneOf } from '../storefront-block';
import {
  ALL_SHELVES,
  catalogOf,
  type ShelfOption,
  shelfLabelIn,
  type StorefrontCatalog,
  vanishedShelves,
} from '../storefront-catalog';
import { PointerDrag } from '../storefront-drag';
import {
  dropShelf,
  EMPTY_STATE,
  type EditorState,
  LOCAL_ID_PREFIX,
  payloadOf,
  rowsIn,
  stateOf,
} from '../storefront-payload';
import {
  acrossMessage,
  type AcrossResult,
  checkAcross,
  moveAcross,
  placeAcross,
  setShelvesAcross,
} from '../storefront-placement';
import { cellAtPoint } from '../storefront-pointer';
import { reshape } from '../storefront-reshape';
import {
  blockFromTemplate,
  createTemplate,
  deleteTemplate,
  placeTemplate,
  type StorefrontTemplate,
  type TemplateLabel,
  type TemplateResult,
  updateTemplateLabel,
} from '../storefront-templates';
import { infoIssues } from '../storefront-text';
import { StorefrontService } from '../storefront.service';
import { StorefrontMediaMock } from '../storefront-media-mock/storefront-media-mock';
import { StorefrontMobilePreview } from '../storefront-mobile-preview/storefront-mobile-preview';
import { StorefrontObjectDialog } from '../storefront-object-dialog/storefront-object-dialog';
import type { StorefrontObjectDialogData, StorefrontObjectHost } from '../storefront-object-host';
import { StorefrontTemplateList } from '../storefront-template-list/storefront-template-list';

/** Les flèches du clavier, en pas de grille. */
const ARROW_STEPS: Readonly<Record<string, Cell>> = {
  ArrowLeft: { column: -1, row: 0 },
  ArrowRight: { column: 1, row: 0 },
  ArrowUp: { column: 0, row: -1 },
  ArrowDown: { column: 0, row: 1 },
};

/** Un refus d'enregistrement. `conflict` : quelqu'un a enregistré entre-temps (409). */
interface SaveRefusal {
  readonly message: string;
  readonly conflict: boolean;
}

/**
 * L'éditeur « Vitrine » — composer, rayon par rayon, une grille de 5 colonnes
 * × R rangées en y glissant des FORMES ; sous la dernière rangée, le reste du
 * rayon s'écoule en cartes.
 *
 * Il charge la vitrine ENTIÈRE et la renvoie entière, avec la révision lue
 * (`plan-vitrine-enregistrement.md`, D2 et D6) : enregistrer publie. Un `409`
 * dit que quelqu'un a enregistré entre-temps ; on recharge, on ne force pas.
 *
 * Chaque rayon a SON nombre de rangées (Hugo, 2026-09-24) : un objet partagé
 * doit tenir sur chacun de ses rayons, jugé avec les rangées de chacun
 * (`../storefront-placement.ts`). Les rayons sont ceux du catalogue
 * d'administration — « Tout », puis les familles servies.
 *
 * La règle de placement vit dans `@lfd/storefront-layout` ; ce composant ne
 * fait que traduire le pointeur et le clavier en cases.
 */
@Component({
  selector: 'app-storefront-page',
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    FoldPageLayoutComponent,
    StorefrontMediaMock,
    StorefrontTemplateList,
    StorefrontMobilePreview,
  ],
  templateUrl: './storefront-page.html',
  styleUrl: './storefront-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:pointermove)': 'onPointerMove($event)',
    '(window:pointerup)': 'onPointerUp($event)',
    '(window:pointercancel)': 'cancelDrag()',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
})
export class StorefrontPage implements HasPendingChanges, StorefrontObjectHost {
  private readonly api = inject(StorefrontService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly columns = GRID_COLUMNS;
  protected readonly minRows = MIN_ROWS;
  protected readonly maxRows = MAX_ROWS;
  protected readonly describe = describeFormat;
  protected readonly spec = formatSpec;
  /** Ce que la maquette simule : rien pour un seul contenu, même avec des réglages gardés. */
  protected readonly carouselOf = activeCarousel;
  protected readonly sideOf = mediaSideOf;
  protected readonly fitOf = mediaFitOf;
  protected readonly toneOf = toneOf;
  protected readonly formats = FORMATS;

  // ── Chargement et enregistrement ───────────────────────────────────────

  readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly loadError = signal<string | null>(null);
  /** Le catalogue de l'éditeur (`/admin/storefront/catalog`) ; `null` s'il n'a pas pu être lu. */
  readonly catalog = signal<StorefrontCatalog | null>(null);
  protected readonly catalogFailed = signal(false);
  protected readonly saving = signal(false);
  readonly saveRefusal = signal<SaveRefusal | null>(null);
  /** Une sortie a été retenue : la seconde passe (cf. {@link canLeave}). */
  protected readonly leaveWarned = signal(false);

  /** L'écriture : sans elle, on compose pour voir, et rien ne part. */
  readonly canWrite = computed(() => this.permissions.can('b2b_storefront:write'));

  readonly revision = signal(0);
  /** Les rangées de chaque rayon qui a une page. */
  readonly rowsByShelf = signal<Readonly<Record<ShelfKey, number>>>({});
  /** Tous les objets, de tous les rayons. */
  readonly blocks = signal<readonly EditorBlock[]>([]);
  readonly templates = signal<readonly StorefrontTemplate[]>([]);
  /** La vitrine telle que chargée ou enregistrée, en payload : le point de comparaison. */
  private readonly baseline = signal(JSON.stringify(payloadOf(EMPTY_STATE)));

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

  // ── Rayons ─────────────────────────────────────────────────────────────

  readonly shelf = signal<ShelfKey>(ALL_SHELVES);

  /**
   * Les rayons proposés. Sans catalogue, « Tout » et les rayons que la vitrine
   * vise déjà, nommés par leur clé : on peut encore composer, pas nommer.
   */
  readonly shelves = computed<readonly ShelfOption[]>(() => {
    const catalog = this.catalog();
    if (catalog !== null) {
      return catalog.shelves;
    }
    const keys = new Set([ALL_SHELVES, ...this.usedShelves()]);
    return [...keys].map((key) => ({ key, label: key === ALL_SHELVES ? 'Tout' : key }));
  });

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

  /** Le choix du rayon : les rayons servis, puis les disparus, qu'on peut encore regarder. */
  protected readonly shelfOptions = computed(() => [
    ...this.shelves().map((shelf) => ({ value: shelf.key, label: shelf.label })),
    ...this.vanished().map((key) => ({ value: key, label: `${key} — rayon disparu` })),
  ]);

  /**
   * Les contenus qu'on ne peut pas encore envoyer — un titre manquant, un
   * texte trop long —, nommés par leur objet. Tant qu'il y en a, Enregistrer
   * reste fermé : le serveur refuserait la vitrine entière pour l'un d'eux.
   */
  readonly contentIssues = computed<readonly string[]>(() =>
    this.blocks().flatMap((block) =>
      itemsOf(block).flatMap((item, index) =>
        item.kind === 'info'
          ? infoIssues(item).map(
              (issue) =>
                `« ${describeFormat(block.format)} » (${block.shelves.map(this.shelfLabel).join(', ')}, ` +
                `colonne ${block.column}, rangée ${block.row}), contenu ${index + 1} : ${issue}`,
            )
          : [],
      ),
    ),
  );

  /**
   * Les objets qui n'ont rien à montrer — aucun contenu, un article retiré, une
   * info sans titre ou sans image. La boutique rend leurs cases au rayon
   * (« aucune case n'est jamais vide », `boutique-rayon-layout.md`) ; l'éditeur
   * le dit sur l'objet. Sans catalogue, on ne sait pas quels articles sont
   * retirés : on n'en déclare aucun, et seuls le vide et l'info incomplète
   * comptent.
   */
  readonly returnedIds = computed<ReadonlySet<string>>(() => {
    const catalog = this.catalog();
    const served = catalog === null ? null : new Set(catalog.products.map((p) => p.sku));
    return new Set(
      this.blocks()
        .filter((block) => {
          const contents = itemsOf(block);
          const known =
            served ??
            new Set(contents.flatMap((item) => (item.kind === 'product' ? [item.sku] : [])));
          return !isRenderable({ contents }, known);
        })
        .map((block) => block.id),
    );
  });

  /** Le nom de l'article d'un contenu produit, s'il est encore en vente. */
  private readonly productNames = computed(
    () => new Map((this.catalog()?.products ?? []).map((product) => [product.sku, product.name])),
  );

  readonly shelfLabel = (key: ShelfKey): string => shelfLabelIn(this.shelves(), key);

  /** Les rangées d'un rayon — chacun a les siennes. */
  readonly rowsOf = (shelf: ShelfKey): number => rowsIn({ rows: this.rowsByShelf() }, shelf);

  /** Les rangées du rayon édité. */
  readonly rows = computed(() => this.rowsOf(this.shelf()));

  /** Ce que le champ demande ; la grille ne le suit que si rien ne déborde. Remis au rayon changé. */
  protected readonly requestedRows = linkedSignal<number | null>(() => this.rows());

  // ── Sélection et grille ────────────────────────────────────────────────

  readonly selectedId = signal<string | null>(null);
  /** Le dernier refus, dit en toutes lettres. */
  readonly notice = signal<string | null>(null);
  private readonly dragging = new PointerDrag();
  protected readonly drag = this.dragging.state;
  /** Le renommage, tel que la liste l'appelle : elle se ferme sur `true`. */
  protected readonly renamer = (id: string, label: TemplateLabel): boolean =>
    this.updateTemplate(id, label);
  private nextId = 1;

  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');

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

  /** L'aperçu du glisser : où l'objet tomberait, et s'il y a le droit — sur TOUS ses rayons. */
  protected readonly preview = computed(() => {
    const drag = this.drag();
    if (drag === null || !drag.moved || drag.target === null) {
      return null;
    }
    const candidate: EditorBlock = {
      id: drag.blockId ?? '',
      format: drag.format,
      ...drag.target,
      shelves: this.shelvesOf(drag.blockId),
    };
    return { ...candidate, verdict: checkAcross(this.blocks(), this.rowsOf, candidate) };
  });

  constructor() {
    void this.load();
  }

  /** Charge la vitrine et le catalogue ensemble ; seul l'échec de la vitrine vide l'écran. */
  async load(): Promise<void> {
    this.status.set('loading');
    this.saveRefusal.set(null);
    const [storefront, catalog] = await Promise.allSettled([this.api.load(), this.api.catalog()]);
    if (catalog.status === 'fulfilled') {
      this.catalog.set(catalogOf(catalog.value));
      this.catalogFailed.set(false);
    } else {
      this.catalog.set(null);
      this.catalogFailed.set(true);
    }
    if (storefront.status === 'rejected') {
      this.loadError.set(httpErrorMessage(storefront.reason, 'La vitrine n’a pas pu être lue.'));
      this.status.set('failed');
      return;
    }
    this.apply(stateOf(storefront.value));
    this.status.set('ready');
  }

  /** Enregistre la vitrine ENTIÈRE, puis la relit : les objets neufs y reçoivent leur identifiant. */
  async save(): Promise<void> {
    if (!this.canWrite() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveRefusal.set(null);
    try {
      await this.api.save(payloadOf(this.editorState()));
      this.apply(stateOf(await this.api.load()));
      this.notify.success('Vitrine enregistrée : la boutique la montre dès maintenant.');
    } catch (error: unknown) {
      this.saveRefusal.set({
        message: httpErrorMessage(error, 'La vitrine n’a pas été enregistrée.'),
        conflict: error instanceof HttpErrorResponse && error.status === 409,
      });
    } finally {
      this.saving.set(false);
    }
  }

  private apply(state: EditorState): void {
    this.revision.set(state.revision);
    this.rowsByShelf.set(state.rows);
    this.blocks.set(state.blocks);
    this.templates.set(state.templates);
    this.baseline.set(JSON.stringify(payloadOf(state)));
    this.leaveWarned.set(false);
    this.notice.set(null);
    if (!state.blocks.some((block) => block.id === this.selectedId())) {
      this.selectedId.set(null);
    }
  }

  /**
   * Retient la première sortie quand des modifications attendent — la bannière
   * le dit ; la seconde passe. Sans droit d'écrire, rien ne se perd : on sort.
   */
  canLeave(): boolean {
    if (!this.dirty() || !this.canWrite() || this.leaveWarned()) {
      return true;
    }
    this.leaveWarned.set(true);
    return false;
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty() && this.canWrite()) {
      event.preventDefault();
    }
  }

  // ── Rayon et rangées ───────────────────────────────────────────────────

  pickShelf(shelf: ShelfKey): void {
    this.shelf.set(shelf);
    this.selectedId.set(null);
    this.notice.set(null);
  }

  protected onRowsChange(value: number | null): void {
    this.requestedRows.set(value);
    if (value === null || !Number.isInteger(value) || value < MIN_ROWS || value > MAX_ROWS) {
      return;
    }
    this.setRows(value);
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

  // ── Poser, déplacer, retirer ───────────────────────────────────────────

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

  // ── Gabarits ───────────────────────────────────────────────────────────

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

  protected onBlockKeydown(event: KeyboardEvent, id: string): void {
    const step = ARROW_STEPS[event.key];
    if (step !== undefined) {
      event.preventDefault();
      this.select(id);
      this.moveSelected(step.column, step.row);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.remove(id);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.openEditor(id);
    } else if (event.key === 'Escape') {
      this.selectedId.set(null);
    }
  }

  select(id: string): void {
    this.selectedId.set(id);
  }

  /**
   * Ouvre le dialogue CENTRÉ de l'objet — double-clic, Entrée ou « Modifier ».
   * Un clic seul ne fait que sélectionner : on déplace sans ouvrir.
   *
   * ⚠️ Centré à toutes les largeurs : sous 900 px, la consigne voulait le plein
   * écran, et fold n'en a pas (`FoldPanelConfig` n'offre que des côtés et des
   * largeurs, vérifié dans `fold-ng.d.ts` le 2026-09-24). La feuille du bas
   * reste sous l'en-tête, ce n'en est pas un. Le dialogue s'y met donc en pile,
   * aperçu en haut, dans la largeur que fold lui laisse.
   */
  openEditor(id: string): void {
    this.select(id);
    this.notice.set(null);
    this.panels.open<StorefrontObjectDialogData>(StorefrontObjectDialog, { data: { host: this } });
  }

  // ── Propriétés de la sélection ─────────────────────────────────────────

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

  /** Vide un rayon disparu : sa page part, et les objets qui n'y paraissaient que là avec elle. */
  clearShelf(shelf: ShelfKey): void {
    const next = dropShelf(this.editorState(), shelf);
    this.rowsByShelf.set(next.rows);
    this.blocks.set(next.blocks);
    if (this.shelf() === shelf) {
      this.pickShelf(ALL_SHELVES);
    }
  }

  /** Ce que la maquette d'un objet écrit : le nom de son premier contenu, s'il en a un. */
  protected contentLabel(block: EditorBlock): string | null {
    const [first] = itemsOf(block);
    if (first === undefined) {
      return null;
    }
    if (first.kind === 'product') {
      return this.productNames().get(first.sku) ?? first.sku;
    }
    return first.title.fr.trim() === '' ? 'Info sans titre' : first.title.fr;
  }

  /** Un de ses articles n'est plus en vente : la boutique ne le montrera pas. */
  protected hasUnserved(block: EditorBlock): boolean {
    return (
      this.catalog() !== null &&
      itemsOf(block).some((item) => item.kind === 'product' && !this.productNames().has(item.sku))
    );
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

  protected isShared(block: EditorBlock): boolean {
    return block.shelves.length > 1;
  }

  // ── Glisser (pointeur : souris ET tactile) ─────────────────────────────

  protected startPaletteDrag(event: PointerEvent, format: StorefrontShape): void {
    this.dragging.start(event, { format, template: null, blockId: null }, { column: 0, row: 0 });
  }

  protected startTemplateDrag(event: PointerEvent, template: StorefrontTemplate): void {
    this.dragging.start(
      event,
      { format: template.format, template, blockId: null },
      { column: 0, row: 0 },
    );
  }

  protected startBlockDrag(event: PointerEvent, block: EditorBlock): void {
    const cell = this.cellAt(event);
    const grab =
      cell === null
        ? { column: 0, row: 0 }
        : { column: cell.column - block.column, row: cell.row - block.row };
    this.select(block.id);
    this.dragging.start(event, { format: block.format, template: null, blockId: block.id }, grab);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.drag() !== null) {
      this.dragging.move(event, this.cellAt(event));
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    const finished = this.dragging.finish(this.cellAt(event));
    if (finished === null) {
      return;
    }
    const { drag, origin } = finished;
    if (!drag.moved) {
      // Un appui sans glisser : poser à la première place (palette), ou sélectionner (déjà fait).
      if (drag.template !== null) {
        this.addTemplate(drag.template);
      } else if (drag.blockId === null) {
        this.addFormat(drag.format);
      }
      return;
    }
    if (origin === null) {
      return; // Lâché hors de la grille : rien ne bouge.
    }
    const shelves = this.shelvesOf(drag.blockId);
    const moved = this.blocks().find((block) => block.id === drag.blockId);
    const candidate: EditorBlock =
      moved !== undefined
        ? { ...moved, ...origin }
        : drag.template !== null
          ? blockFromTemplate(drag.template, this.newId(), origin, shelves)
          : { id: this.newId(), format: drag.format, ...origin, shelves };
    this.commit(placeAcross(this.blocks(), this.rowsOf, candidate), drag.blockId === null);
  }

  protected cancelDrag(): void {
    this.dragging.cancel();
  }

  /** Les rayons d'un objet déplacé, ou le rayon édité pour un objet neuf. */
  private shelvesOf(blockId: string | null): readonly ShelfKey[] {
    const block =
      blockId === null ? undefined : this.blocks().find((candidate) => candidate.id === blockId);
    return block?.shelves ?? [this.shelf()];
  }

  private cellAt(event: PointerEvent): Cell | null {
    const element = this.grid()?.nativeElement;
    if (element === undefined) {
      return null;
    }
    return cellAtPoint(element.getBoundingClientRect(), this.rows(), event.clientX, event.clientY);
  }

  private commit(
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

  private newId(): string {
    return `${LOCAL_ID_PREFIX}${this.nextId++}`;
  }
}
