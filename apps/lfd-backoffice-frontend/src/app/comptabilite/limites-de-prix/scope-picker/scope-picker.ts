import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { PriceFloorView, PriceScopePayload } from '@lfd/contracts';
import { FoldListboxComponent, FoldSearchComponent, type FoldSelectOptionGroup } from 'fold-ng';

/** Ce que le panneau d'une limite doit savoir de la portée qu'il vise. */
export interface FloorTarget {
  readonly scope: PriceScopePayload;
  /** Le nom de la cible — « Viennoiseries », « Croissant ». */
  readonly target: string;
  /** La limite posée sur CETTE portée, ou `null`. */
  readonly current: PriceFloorView | null;
  /** Celle qui s'applique aujourd'hui — la sienne, ou celle dont elle hérite. */
  readonly inherited: PriceFloorView | null;
  /** Le prix canonique, pour montrer ce qu'une fraction donnerait. `null` au-delà d'un article. */
  readonly canonicalMillicents: number | null;
}

/** Une portée proposable, rangée et cherchable. */
export interface ScopeChoice extends FloorTarget {
  readonly key: string;
  readonly group: 'catalogue' | 'family' | 'article';
  /** Nom, référence : ce sur quoi la recherche porte. */
  readonly label: string;
}

/** Au-delà, la liste ne s'affiche plus en entier : on cherche. */
const MAX_ARTICLES = 50;

/**
 * **Choisir la portée d'une nouvelle limite** — le catalogue, une famille, ou
 * un article cherché par son nom ou sa référence.
 *
 * La recherche ne filtre que les articles : le catalogue et les familles
 * tiennent en quelques lignes, et les cacher sur une frappe ferait croire
 * qu'ils ont disparu.
 */
@Component({
  selector: 'app-scope-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldListboxComponent, FoldSearchComponent],
  templateUrl: './scope-picker.html',
  styleUrl: './scope-picker.scss',
})
export class ScopePicker {
  readonly choices = input<readonly ScopeChoice[]>([]);
  readonly picked = output<ScopeChoice>();

  protected readonly query = signal('');
  protected readonly chosen = signal<string | null>(null);

  private readonly matchingArticles = computed(() => {
    const needle = normalize(this.query());
    return this.choices().filter(
      (choice) => choice.group === 'article' && normalize(choice.label).includes(needle),
    );
  });

  protected readonly articleCount = computed(() => this.matchingArticles().length);

  protected readonly options = computed(() => {
    const of = (group: ScopeChoice['group']) =>
      this.choices()
        .filter((choice) => choice.group === group)
        .map((choice) => ({ value: choice.key, label: choice.label }));
    const articles = this.matchingArticles()
      .slice(0, MAX_ARTICLES)
      .map((choice) => ({ value: choice.key, label: choice.label }));
    const groups: FoldSelectOptionGroup<string>[] = [
      { label: 'Catalogue', options: of('catalogue') },
      { label: 'Familles', options: of('family') },
      {
        label:
          this.articleCount() > MAX_ARTICLES
            ? `Articles — ${String(MAX_ARTICLES)} premiers, affinez la recherche`
            : 'Articles',
        options: articles,
      },
    ];
    return groups.filter((group) => group.options.length > 0);
  });

  protected pick(key: string): void {
    const choice = this.choices().find((candidate) => candidate.key === key);
    if (choice !== undefined) {
      this.chosen.set(key);
      this.picked.emit(choice);
    }
  }
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
