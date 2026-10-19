import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { BundleChoiceCandidateView } from '@lfd/contracts';
import { FoldCalloutComponent, FoldListboxComponent, FoldSearchComponent } from 'fold-ng';

import { BundlesService } from '../bundles.service';

/**
 * Chercher un article à ajouter à un groupe : le serveur cherche
 * (`/admin/bundle-choices?q=`, 30 au plus) parmi ce qui PEUT entrer dans une
 * formule — servi au public, pas réservé aux opérations. Même geste que le
 * sélecteur des suggestions (une recherche, puis la liste), mais la recherche
 * part au serveur, une fois la frappe posée.
 */
@Component({
  selector: 'app-bundle-choice-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldListboxComponent, FoldSearchComponent],
  templateUrl: './bundle-choice-search.html',
  styleUrl: './bundle-choice-search.scss',
})
export class BundleChoiceSearch {
  private readonly api = inject(BundlesService);

  /** Les articles déjà dans le groupe : on ne les propose pas. */
  readonly taken = input<readonly string[]>([]);
  readonly picked = output<BundleChoiceCandidateView>();

  protected readonly query = signal('');
  private readonly results = signal<readonly BundleChoiceCandidateView[]>([]);
  protected readonly searched = signal(false);
  protected readonly failed = signal(false);
  private latest = 0;

  private readonly offered = computed(() =>
    this.results().filter((candidate) => !this.taken().includes(candidate.sku)),
  );

  protected readonly options = computed(() =>
    this.offered().map((candidate) => ({
      value: candidate.sku,
      label: `${candidate.name} · ${candidate.shelf}`,
    })),
  );

  protected readonly hint = computed(() => {
    if (!this.searched()) {
      return 'Tapez un nom ou une référence.';
    }
    const count = this.offered().length;
    return count === 0
      ? 'Aucun article ne correspond.'
      : `${String(count)} article${count > 1 ? 's' : ''} à ajouter.`;
  });

  /** Une recherche par frappe posée ; une réponse périmée ne remplace pas la dernière. */
  protected async search(term: string): Promise<void> {
    const ticket = ++this.latest;
    this.failed.set(false);
    if (term === '') {
      this.results.set([]);
      this.searched.set(false);
      return;
    }
    try {
      const found = await this.api.searchChoices(term);
      if (ticket === this.latest) {
        this.results.set(found);
        this.searched.set(true);
      }
    } catch {
      if (ticket === this.latest) {
        this.results.set([]);
        this.failed.set(true);
      }
    }
  }

  protected pick(sku: string): void {
    const candidate = this.results().find((result) => result.sku === sku);
    if (candidate !== undefined) {
      this.picked.emit(candidate);
    }
  }
}
