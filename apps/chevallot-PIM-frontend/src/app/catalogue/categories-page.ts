import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { CatalogueApi, type Category } from './catalogue-api';

/**
 * Paramétrage des familles.
 *
 * Signals partout, zéro `FormsModule` : les champs sont des `signal` pilotés par
 * `(input)`. Un formulaire à deux champs n'a pas besoin d'une machinerie de formulaire.
 */
@Component({
  selector: 'app-categories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-head">
      <h1>Familles</h1>
      <p>Le classement structurel du catalogue. Un produit appartient à une seule famille.</p>
    </header>

    <form class="row-form" (submit)="create($event)">
      <input
        type="text"
        placeholder="Nom de la famille — ex. Viennoiseries"
        [value]="draftName()"
        (input)="draftName.set(inputValue($event))"
        required
      />
      <select [value]="draftParent()" (change)="draftParent.set(inputValue($event))">
        <option value="">— Racine —</option>
        @for (category of activeCategories(); track category.id) {
          <option [value]="category.id">{{ category.name.fr }}</option>
        }
      </select>
      <button type="submit" [disabled]="busy()">Ajouter</button>
    </form>

    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    @if (categories().length === 0) {
      <p class="empty">Aucune famille pour l’instant. Commencez par « Viennoiseries ».</p>
    } @else {
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Parent</th>
            <th>Identifiant d’URL</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (category of categories(); track category.id) {
            <tr [class.archived]="category.isArchived">
              <td>
                <input
                  type="text"
                  [value]="category.name.fr"
                  (change)="rename(category, inputValue($event))"
                />
              </td>
              <td>{{ parentName(category) }}</td>
              <td><code>{{ category.slug.fr }}</code></td>
              <td>
                @if (!category.isArchived) {
                  <button type="button" class="ghost" (click)="archive(category)">Archiver</button>
                } @else {
                  <span class="tag">archivée</span>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styleUrl: './catalogue.scss',
})
export class CategoriesPage {
  private readonly api = inject(CatalogueApi);

  protected readonly categories = signal<Category[]>([]);
  protected readonly draftName = signal('');
  protected readonly draftParent = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    void this.reload();
  }

  protected activeCategories(): Category[] {
    return this.categories().filter((category) => !category.isArchived);
  }

  protected parentName(category: Category): string {
    if (category.parentId === null) {
      return '—';
    }
    const parent = this.categories().find((item) => item.id === category.parentId);
    return parent?.name.fr ?? '—';
  }

  protected inputValue(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement || target instanceof HTMLSelectElement
      ? target.value
      : '';
  }

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    const nameFr = this.draftName().trim();
    if (nameFr === '') {
      return;
    }

    const parentId = this.draftParent();
    await this.run(async () => {
      await this.api.createCategory(parentId === '' ? { nameFr } : { nameFr, parentId });
      this.draftName.set('');
    });
  }

  protected async rename(category: Category, nameFr: string): Promise<void> {
    if (nameFr.trim() === '' || nameFr === category.name.fr) {
      return;
    }
    await this.run(() => this.api.renameCategory(category.id, nameFr));
  }

  protected async archive(category: Category): Promise<void> {
    await this.run(() => this.api.archiveCategory(category.id));
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      await this.reload();
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private async reload(): Promise<void> {
    try {
      this.categories.set(await this.api.listCategories());
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    }
  }
}
