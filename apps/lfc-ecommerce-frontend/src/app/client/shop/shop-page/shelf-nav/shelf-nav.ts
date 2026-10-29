import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  input,
  output,
  viewChildren,
} from '@angular/core';

import { ClientCopyService, fill } from '../../../copy/client-copy.service';
import { ShopCatalogue } from '../../shop-catalogue.store';
import { ClientLocale } from '../../../client-locale.service';
import { operationShelfId, operationText } from '../../operations';
import { ALL_SHELVES, FEATURED_SHELF } from '../../shelves';
import {
  climbTargetOf,
  countOf,
  focusOf,
  hasChildren,
  type LevelState,
  levelIdsOf,
  levelState,
  pathOf,
  ROOT_LEVEL,
  shelfTreeOf,
} from '../../shelf-tree';

/** Une pastille d'un niveau. */
interface ChipView {
  readonly id: string;
  readonly label: string;
  /** Les articles du sous-arbre — `null` pour ce qui n'est pas une famille. */
  readonly count: number | null;
  readonly on: boolean;
  /** Elle a des enfants : la choisir fait plonger. */
  readonly drill: boolean;
  readonly ariaLabel: string | null;
  /** Le délai d'entrée, en ms — nul hors du niveau affiché (SPEC §5.4). */
  readonly delay: number;
}

/** Un niveau du rail, monté en permanence (SPEC §2). */
interface LevelView {
  readonly id: string;
  readonly state: LevelState;
  readonly nested: boolean;
  readonly label: string;
  readonly ariaLabel: string;
  readonly count: number;
  readonly climbTo: string;
  readonly climbLabel: string;
  readonly crumbs: readonly { readonly id: string; readonly label: string }[];
  readonly chips: readonly ChipView[];
}

/** Le délai d'entrée de la première pastille, puis l'écart entre deux (SPEC §5.3). */
const CHIP_DELAY_MS = 140;
const CHIP_STEP_MS = 38;
/** Le rattrapage après la fin des transitions et le chargement des polices (SPEC §4). */
const SETTLE_MS = 460;

/**
 * **Le rail des rayons** — « Tout », les opérations datées servies, puis les
 * familles.
 *
 * Il construit sa liste lui-même : elle ne dépend que du catalogue HYDRATÉ et du
 * dictionnaire de langue, jamais de l'écran qui l'affiche. La faire descendre en
 * entrée aurait obligé chaque page à recopier la même concaténation, et deux
 * copies finissent par ne plus s'accorder sur l'ordre.
 *
 * Les rayons arrivent déjà **peuplés et ordonnés** par le serveur : la vitrine
 * ne trie pas et ne filtre pas — un rayon vide n'y est simplement jamais.
 *
 * 🔴 **Il ne sait rien de la recherche**, et c'est délibéré. Chercher traverse
 * les rayons, donc aucune pastille n'est active pendant une recherche — mais
 * c'est un fait de la PAGE, qui arbitre entre les deux questions. Elle le dit en
 * passant `active` à `null` ; le rail se contente d'allumer ce qu'on lui
 * désigne. Lui apprendre le terme cherché lui aurait donné une seconde raison de
 * changer.
 *
 * **Familles imbriquées : « Plonger »** (handoff du 2026-10-29). Dès qu'un rayon
 * servi a une parente, le rail devient UNE rangée par niveau, tous montés et
 * empilés ; seul le niveau affiché est visible. Son état `cur` / `left` /
 * `right` (`levelState`) donne seul la direction du mouvement, tout en CSS.
 * Un catalogue plat garde le rail d'avant, à l'identique.
 */
@Component({
  selector: 'app-shelf-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shelf-nav.html',
  styleUrl: './shelf-nav.scss',
})
export class ShelfNav {
  /** Le rayon allumé, ou `null` — une recherche n'en désigne aucun. */
  readonly active = input<string | null>(ALL_SHELVES);

  /** Un rayon choisi. La page en tire ce qu'elle veut : filtrer, et oublier le terme. */
  readonly picked = output<string>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly catalogue = inject(ShopCatalogue);
  private readonly locale = inject(ClientLocale);

  private readonly rails = viewChildren<ElementRef<HTMLElement>>('rail');
  private readonly stage = viewChildren<ElementRef<HTMLElement>>('stage');

  /**
   * Le niveau quitté par un geste DU RAIL, en attente du rendu qui déplacera le
   * focus (SPEC §8). `null` : rien à déplacer — un changement venu de la page
   * (adresse, recherche) ne vole pas le focus.
   */
  private pendingFrom: string | null = null;
  /** Le premier placement de l'indicateur est sans transition. */
  private placed = false;

  /**
   * Une opération servie est un rayon **juste après « Tout »**, dans l'ordre du
   * serveur (D8) : c'est le moment de l'année, pas une famille de plus.
   *
   * La mise en avant passe devant elles (Hugo, 2026-10-19), sous le texte même
   * de la pastille des tuiles (`product.bestSeller`) — et seulement si la vue
   * lue en porte une.
   */
  protected readonly shelves = computed(() => [
    { id: ALL_SHELVES, label: this.t().shop.allShelves },
    ...(this.catalogue.items().some((item) => item.isFeatured)
      ? [{ id: FEATURED_SHELF, label: this.t().product.bestSeller }]
      : []),
    ...this.catalogue.operations().map((operation) => ({
      id: operationShelfId(operation.key),
      label: operationText(operation.name, this.locale.current()),
    })),
    ...this.catalogue
      .shelves()
      .map((shelf) => ({ id: shelf.id, label: shelf.name, parentId: shelf.parentId ?? null })),
  ]);

  /** L'arbre des rayons : les pastilles qui ne sont pas des familles y sont des racines. */
  private readonly tree = computed(() => shelfTreeOf(this.shelves()));

  /** Vrai dès qu'une famille a une parente : le rail plonge. */
  protected readonly nested = computed(() => this.tree().nested);

  /** Le niveau affiché. */
  private readonly focus = computed(() => focusOf(this.tree(), this.active()));

  private readonly families = computed(
    () => new Set(this.catalogue.shelves().map((shelf) => shelf.id)),
  );

  protected readonly levels = computed<readonly LevelView[]>(() => {
    const tree = this.tree();
    const focus = this.focus();
    return levelIdsOf(tree).map((id) => this.levelOf(id, levelState(tree, id, focus)));
  });

  constructor() {
    afterRenderEffect(() => {
      this.levels();
      this.placeIndicators(!this.placed);
      this.placed = true;
      this.moveFocus();
    });
    this.settleAfterRender();
  }

  /** Choisir une pastille, depuis le rail. */
  protected pick(id: string): void {
    if (id !== this.active()) {
      this.pendingFrom = this.focus();
    }
    this.picked.emit(id);
  }

  /** Échap dans un niveau imbriqué : remonter d'un cran (SPEC §8). */
  protected climb(): void {
    const level = this.levels().find((entry) => entry.state === 'cur');
    if (level?.nested === true) {
      this.pick(level.climbTo);
    }
  }

  private levelOf(id: string, state: LevelState): LevelView {
    const tree = this.tree();
    const c = this.t().shop;
    const cur = state === 'cur';
    const node = tree.nodes.get(id);
    const entries = node === undefined ? tree.roots : [id, ...node.children];
    const chips = entries.map((chipId, index) =>
      this.chipOf(chipId, chipId === id ? c.allShelves : null, cur ? index : null),
    );
    const parent =
      node?.parentId === null || node === undefined ? null : tree.nodes.get(node.parentId);
    const label = node?.label ?? '';
    return {
      id,
      state,
      nested: node !== undefined,
      label,
      ariaLabel: node === undefined ? c.shelvesGroup : fill(c.shelfLevel, { shelf: label }),
      count: countOf(tree, id, this.catalogue.items()),
      climbTo: climbTargetOf(tree, id, ALL_SHELVES),
      climbLabel:
        parent === undefined || parent === null
          ? c.shelfClimbToRoot
          : fill(c.shelfClimbTo, { shelf: parent.label }),
      crumbs: [
        { id: ALL_SHELVES, label: c.shelvesRoot },
        ...pathOf(tree, id)
          .slice(0, -1)
          .map((ancestor) => ({ id: ancestor, label: tree.nodes.get(ancestor)?.label ?? '' })),
      ],
      chips,
    };
  }

  /** `self` : le libellé « Tout » de la pastille qui est la famille elle-même. */
  private chipOf(id: string, self: string | null, index: number | null): ChipView {
    const tree = this.tree();
    const node = tree.nodes.get(id);
    const drill = self === null && hasChildren(tree, id);
    const label = self ?? node?.label ?? '';
    return {
      id,
      label,
      count: this.families().has(id) ? countOf(tree, id, this.catalogue.items()) : null,
      on: this.active() === id,
      drill,
      ariaLabel: drill
        ? fill(this.t().shop.shelfWithChildren, {
            shelf: label,
            n: String(node?.children.length ?? 0),
          })
        : null,
      delay: index === null ? 0 : CHIP_DELAY_MS + index * CHIP_STEP_MS,
    };
  }

  /**
   * L'indicateur de chaque rail vise la pastille allumée (SPEC §4). `offsetLeft`
   * ignore le `transform` d'entrée : il vise d'emblée la place finale.
   */
  private placeIndicators(instant: boolean): void {
    for (const { nativeElement: rail } of this.rails()) {
      const indicator = rail.querySelector<HTMLElement>('.indicator');
      if (indicator === null) {
        continue;
      }
      const chip = rail.querySelector<HTMLElement>('.chip.on');
      if (instant) {
        indicator.style.transition = 'none';
      }
      if (chip === null) {
        indicator.style.setProperty('--shown', '0');
      } else {
        indicator.style.width = `${chip.offsetWidth}px`;
        indicator.style.transform = `translateX(${chip.offsetLeft}px)`;
        indicator.style.setProperty('--shown', '1');
        centre(rail, chip);
      }
      if (instant) {
        void indicator.offsetWidth;
        indicator.style.transition = '';
      }
    }
  }

  /** Après une plongée, la pastille de tête ; après une remontée, la pastille d'où l'on vient. */
  private moveFocus(): void {
    const from = this.pendingFrom;
    this.pendingFrom = null;
    const to = this.focus();
    const stage = this.stage()[0]?.nativeElement;
    if (from === null || from === to || stage === undefined) {
      return;
    }
    const level = byData(stage, '.level', 'level', to);
    const tree = this.tree();
    const climbed = to === ROOT_LEVEL || pathOf(tree, from).includes(to);
    // En remontant, la pastille du niveau atteint qui menait au niveau quitté —
    // le fil d'Ariane peut sauter plusieurs crans.
    const target = climbed
      ? [...pathOf(tree, from)]
          .reverse()
          .map((id) => (level === null ? null : byData(level, '.chip', 'shelf', id)))
          .find((chip) => chip !== null)
      : level?.querySelector<HTMLElement>('.pill');
    (target ?? level?.querySelector<HTMLElement>('.chip.on'))?.focus();
  }

  /**
   * Le rattrapage : une image plus tard, puis à la fin des transitions et des
   * polices ; et sans transition à chaque redimensionnement d'un rail.
   */
  private settleAfterRender(): void {
    const destroyRef = inject(DestroyRef);
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: ResizeObserver | undefined;
    afterRenderEffect(() => {
      this.levels();
      if (typeof requestAnimationFrame === 'undefined') {
        return;
      }
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      frame = requestAnimationFrame(() => this.placeIndicators(false));
      timer = setTimeout(() => this.placeIndicators(false), SETTLE_MS);
      if (observer === undefined && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => this.placeIndicators(true));
      }
      observer?.disconnect();
      for (const rail of this.rails()) {
        observer?.observe(rail.nativeElement);
      }
    });
    destroyRef.onDestroy(() => {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(frame);
      }
      clearTimeout(timer);
      observer?.disconnect();
    });
  }
}

/** L'élément dont `data-<key>` vaut `value` — sans sélecteur construit d'un identifiant servi. */
function byData(
  scope: HTMLElement,
  selector: string,
  key: string,
  value: string,
): HTMLElement | null {
  return (
    Array.from(scope.querySelectorAll<HTMLElement>(selector)).find(
      (element) => element.dataset[key] === value,
    ) ?? null
  );
}

/** Centre la pastille dans un rail qui défile — directement, sans défilement doux (SPEC §4). */
function centre(rail: HTMLElement, chip: HTMLElement): void {
  if (rail.scrollWidth <= rail.clientWidth + 1) {
    return;
  }
  const max = rail.scrollWidth - rail.clientWidth;
  const target = Math.round(chip.offsetLeft + chip.offsetWidth / 2 - rail.clientWidth / 2);
  rail.scrollLeft = Math.max(0, Math.min(max, target));
}
