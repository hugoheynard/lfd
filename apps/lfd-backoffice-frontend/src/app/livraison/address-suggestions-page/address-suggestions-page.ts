import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { AddressPointSuggestionView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldIconComponent,
  FoldLinkComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import {
  coordinatesOf,
  kindLabelOf,
  mapHrefOf,
  suggestionKeyOf,
  suggestionSentenceOf,
} from '../address-suggestions';
import { AddressSuggestionsService } from '../address-suggestions.service';

type SuggestionsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly suggestions: readonly AddressPointSuggestionView[] };

/** Un refus du serveur, sur la carte qui l'a reçu. */
interface Refusal {
  readonly key: string;
  readonly message: string;
}

/**
 * **« Carnet à corriger »** (`documentation/livraisons/livreur/gps-y-aller-et-position.md`,
 * §6) — les portes et les stationnements que plusieurs livraisons
 * concordantes situent loin du point du carnet. Rien n'est corrigé tout
 * seul : **Appliquer** écrit le carnet (le livreur le voit à la tournée
 * suivante), **Ignorer** ne la repropose pas tant que les livraisons
 * concluent au même endroit.
 *
 * Aucune position de livreur n'y figure : un point suggéré est le centre de
 * plusieurs gestes, sans nom ni heure. La route est sous
 * `delivery_rounds:write`, lecture comprise.
 */
@Component({
  selector: 'app-address-suggestions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldIconComponent,
    FoldLinkComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './address-suggestions-page.html',
  styleUrl: './address-suggestions-page.scss',
})
export class AddressSuggestionsPage {
  private readonly service = inject(AddressSuggestionsService);

  protected readonly state = signal<SuggestionsState>({ status: 'loading' });
  protected readonly suggestions = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.suggestions : [];
  });
  /** La suggestion dont une décision est en vol — un geste à la fois. */
  protected readonly busy = signal<string | null>(null);
  protected readonly refusal = signal<Refusal | null>(null);

  protected readonly keyOf = suggestionKeyOf;
  protected readonly sentenceOf = suggestionSentenceOf;
  protected readonly kindOf = kindLabelOf;
  protected readonly mapOf = mapHrefOf;
  protected readonly coordinatesOf = coordinatesOf;

  constructor() {
    void this.load();
  }

  protected refusalOf(suggestion: AddressPointSuggestionView): string | null {
    const refusal = this.refusal();
    return refusal?.key === suggestionKeyOf(suggestion) ? refusal.message : null;
  }

  protected retry(): void {
    void this.load();
  }

  protected apply(suggestion: AddressPointSuggestionView): void {
    void this.decide(suggestion, () =>
      this.service.apply(suggestion.addressId, {
        kind: suggestion.kind,
        point: suggestion.suggested,
      }),
    );
  }

  protected ignore(suggestion: AddressPointSuggestionView): void {
    void this.decide(suggestion, () =>
      this.service.ignore(suggestion.addressId, {
        kind: suggestion.kind,
        point: suggestion.suggested,
      }),
    );
  }

  /** Décide, puis relit la liste ; un refus reste sur la carte, la liste aussi. */
  private async decide(
    suggestion: AddressPointSuggestionView,
    send: () => Promise<void>,
  ): Promise<void> {
    const key = suggestionKeyOf(suggestion);
    this.busy.set(key);
    this.refusal.set(null);
    try {
      await send();
      await this.load(false);
    } catch (error) {
      this.refusal.set({
        key,
        message: httpErrorMessage(error, 'La décision n’a pas pu être enregistrée.'),
      });
    } finally {
      this.busy.set(null);
    }
  }

  private async load(showLoading = true): Promise<void> {
    if (showLoading) {
      this.state.set({ status: 'loading' });
    }
    try {
      const { suggestions } = await this.service.list();
      this.state.set({ status: 'ready', suggestions });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
