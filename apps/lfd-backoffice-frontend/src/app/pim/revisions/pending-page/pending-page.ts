import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CatalogPendingDiffView, CatalogRevisionItemDiffView } from '@lfd/pim-contracts';
import {
  FoldBackLinkComponent,
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldOptionComponent,
  FoldListboxComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSearchComponent,
  FoldSurfaceDirective,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { fieldLabel } from '../revision-diff/field-label';
import { RevisionDiff } from '../revision-diff/revision-diff';
import { RevisionsStore } from '../revisions.store';

/** Le format d'une date : le jour ET l'heure — on publie plusieurs fois par jour. */
const WHEN = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** Les trois natures de changement, plus « tout ». Ce sont les blocs du diff. */
const ALL = 'all';
const ADDED = 'added';
const REMOVED = 'removed';
const CHANGED = 'changed';

/** Aucun auteur choisi — la valeur du choix ouvert de la liste. */
const ANY_AUTHOR = '';

/**
 * **Ce qui a bougé depuis la dernière publication** — sa propre page.
 *
 * Elle vivait en tête de l'écran Révisions, sous un bouton. Ça allait pour trois
 * lignes et pas pour cinquante : un diff long y écrasait la préparation et la
 * comparaison, et rien ne permettait de s'y retrouver. Une page à part lui donne
 * une adresse — donc un lien qu'on colle dans une conversation — et la place de
 * porter ses propres filtres.
 *
 * ## Ce que les filtres filtrent, et ce qu'ils ne touchent pas
 *
 * Ils ne changent RIEN au calcul : le serveur rend le diff entier, la page en
 * cache une partie. C'est ce qui permet d'afficher les comptes **totaux** dans
 * les segments — « 12 modifiés » reste 12 quand on filtre par auteur — au lieu
 * de nombres qui bougeraient sous les doigts.
 *
 * ⚠️ L'en-tête (le rapport professionnel) et les causes globales restent
 * TOUJOURS affichés, quel que soit le filtre. Ils expliquent les lignes qu'on
 * regarde ; les masquer parce qu'ils ne correspondent pas à une recherche
 * enlèverait précisément ce qui rend le reste compréhensible.
 */
@Component({
  selector: 'app-pending-diff-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldListboxComponent,
    FoldOptionComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSearchComponent,
    FoldSurfaceDirective,
    FoldViewToggleComponent,
    RevisionDiff,
  ],
  templateUrl: './pending-page.html',
  styleUrl: './pending-page.scss',
})
export class PendingDiffPage {
  protected readonly store = inject(RevisionsStore);

  protected readonly query = signal('');
  protected readonly nature = signal<string>(ALL);
  protected readonly author = signal<string>(ANY_AUTHOR);

  constructor() {
    void this.store.loadPending();
  }

  protected readonly pending = this.store.pending;

  /** Rien n'est jamais parti : il n'y a pas de référence, donc rien à comparer. */
  protected readonly noReference = computed(() => this.pending()?.from === null);

  protected readonly counts = computed(() => {
    const view = this.pending();
    return {
      added: view?.added.length ?? 0,
      removed: view?.removed.length ?? 0,
      changed: view?.changed.length ?? 0,
    };
  });

  protected readonly moved = computed(() => {
    const { added, removed, changed } = this.counts();
    return added + removed + changed > 0;
  });

  /**
   * Les segments portent les comptes **totaux**, pas ceux du filtre courant.
   *
   * Un segment dont le chiffre changerait quand on tape dans la recherche ne
   * dirait plus combien il y a — il dirait combien il en reste, ce qui est la
   * réponse à une autre question.
   */
  protected readonly natures = computed<readonly FoldViewToggleOption[]>(() => {
    const { added, removed, changed } = this.counts();
    return [
      { value: ALL, label: `Tout (${String(added + removed + changed)})` },
      { value: CHANGED, label: `Modifiés (${String(changed)})` },
      { value: ADDED, label: `Entrés (${String(added)})` },
      { value: REMOVED, label: `Retirés (${String(removed)})` },
    ];
  });

  /**
   * Les auteurs présents dans ce diff, triés.
   *
   * Déduits du diff plutôt que de l'annuaire : la question est « qui a touché à
   * ÇA », pas « qui existe ». Une liste d'annuaire proposerait quarante noms
   * dont trente-neuf ne filtreraient rien.
   */
  protected readonly authors = computed<readonly string[]>(() => {
    const names = new Set<string>();
    for (const item of this.pending()?.changed ?? []) {
      for (const field of item.fields) {
        if (field.attributed && field.by !== null) {
          names.add(field.by);
        }
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'fr'));
  });

  /**
   * Le diff tel qu'on le regarde — filtré, jamais recalculé.
   *
   * L'en-tête et les causes traversent intacts : ils expliquent ce qu'on
   * regarde. Les trois listes, elles, se réduisent.
   */
  protected readonly shown = computed(() => {
    const view = this.pending();
    if (view === null) {
      return null;
    }
    const nature = this.nature();
    const needle = normalize(this.query());
    const by = this.author();
    return {
      header: view.header,
      causes: view.causes,
      added:
        nature === ALL || nature === ADDED ? view.added.filter((sku) => matches(sku, needle)) : [],
      removed:
        nature === ALL || nature === REMOVED
          ? view.removed.filter((sku) => matches(sku, needle))
          : [],
      changed: nature === ALL || nature === CHANGED ? this.changedShown(view, needle, by) : [],
    };
  });

  /** Le filtre a-t-il tout mangé, alors qu'il y avait quelque chose ? */
  protected readonly filteredOut = computed(() => {
    const shown = this.shown();
    return (
      this.moved() &&
      shown !== null &&
      shown.added.length === 0 &&
      shown.removed.length === 0 &&
      shown.changed.length === 0
    );
  });

  protected readonly hasFilter = computed(
    () => this.query() !== '' || this.nature() !== ALL || this.author() !== ANY_AUTHOR,
  );

  protected clearFilters(): void {
    this.query.set('');
    this.nature.set(ALL);
    this.author.set(ANY_AUTHOR);
  }

  protected when(iso: string): string {
    return WHEN.format(new Date(iso));
  }

  /**
   * Un article modifié entre-t-il dans le filtre ?
   *
   * La recherche vise le SKU **ou** un nom de champ — « prix » doit trouver les
   * lignes de prix, et `CRO-001` l'article. Le filtre d'auteur, lui, réduit
   * l'article à ses SEULES lignes de cet auteur : garder les autres ferait
   * afficher, sous « ce qu'a changé Hugo », des lignes que quelqu'un d'autre a
   * écrites.
   */
  private changedShown(
    view: CatalogPendingDiffView,
    needle: string,
    by: string,
  ): readonly CatalogRevisionItemDiffView[] {
    const kept: CatalogRevisionItemDiffView[] = [];
    for (const item of view.changed) {
      const fields =
        by === ANY_AUTHOR
          ? item.fields
          : item.fields.filter((field) => field.attributed && field.by === by);
      if (fields.length === 0) {
        continue;
      }
      if (needle === '' || matches(item.sku, needle)) {
        kept.push({ ...item, fields });
        continue;
      }
      const named = fields.filter(
        (field) => matches(fieldLabel(field.field), needle) || matches(field.field, needle),
      );
      if (named.length > 0) {
        kept.push({ ...item, fields: named });
      }
    }
    return kept;
  }
}

/** Sans accent ni casse : on tape « prix » et « Prix public TTC » sort. */
function normalize(value: string): string {
  return value
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '');
}

function matches(value: string, needle: string): boolean {
  return needle === '' || normalize(value).includes(needle);
}
