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
import {
  FoldCalloutComponent,
  FoldComboboxComponent,
  FoldIconComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { BundlesService } from '../bundles.service';

/**
 * Chercher un article à ajouter à un groupe : le serveur cherche
 * (`/admin/bundle-choices?q=`, 30 au plus) parmi ce qui PEUT entrer dans une
 * formule — servi au public, pas réservé aux opérations. Un seul champ :
 * on tape, les propositions s'ouvrent dessous, le choix ajoute l'article et
 * vide le champ. La recherche part au serveur, une fois la frappe posée.
 */
@Component({
  selector: 'app-bundle-choice-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldComboboxComponent, FoldIconComponent],
  templateUrl: './bundle-choice-search.html',
  styleUrl: './bundle-choice-search.scss',
})
export class BundleChoiceSearch {
  private readonly api = inject(BundlesService);

  /** Les articles déjà dans le groupe : on ne les propose pas. */
  readonly taken = input<readonly string[]>([]);
  readonly picked = output<BundleChoiceCandidateView>();

  private readonly results = signal<readonly BundleChoiceCandidateView[]>([]);
  protected readonly searched = signal(false);
  protected readonly failed = signal(false);
  protected readonly loading = signal(false);
  private latest = 0;

  private readonly offered = computed(() =>
    this.results().filter((candidate) => !this.taken().includes(candidate.sku)),
  );

  protected readonly options = computed<readonly FoldSelectOption<BundleChoiceCandidateView>[]>(
    () => this.offered().map((candidate) => ({ value: candidate, label: candidate.name })),
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
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
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
    } finally {
      if (ticket === this.latest) {
        this.loading.set(false);
      }
    }
  }

  protected pick(candidate: BundleChoiceCandidateView): void {
    this.picked.emit(candidate);
  }
}
