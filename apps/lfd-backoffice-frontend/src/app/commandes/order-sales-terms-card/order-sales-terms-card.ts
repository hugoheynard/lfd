import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { OrderSalesTermsView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLinkComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { legalFileUrl } from '../../contenu/platform-content.service';
import { AdminOrdersService } from '../orders.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Le jour de dépôt d'un PDF, à Paris : « 12/10/2026 ». */
const DAY = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

const AUDIENCE_LABELS: Readonly<Record<OrderSalesTermsView['document'], string>> = {
  salesTerms: 'particuliers',
  salesTermsPro: 'professionnelles',
};

/**
 * **Les CGV de la commande** (plan `legal/plan-cgv-par-audience.md`, C4, C4′) :
 * « CGV acceptées : professionnelles, révision 4, PDF du 12/10/2026 », avec le
 * lien vers CE PDF-là, même remplacé depuis.
 *
 * « Applicables » et non « acceptées » quand l'équipe a saisi la commande :
 * le client n'a rien coché, le staff a passé la commande en son nom.
 *
 * Un échec de lecture reste DANS la carte, comme l'historique.
 */
@Component({
  selector: 'app-order-sales-terms-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLinkComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './order-sales-terms-card.html',
})
export class OrderSalesTermsCard {
  readonly orderId = input.required<string>();

  private readonly service = inject(AdminOrdersService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly terms = signal<OrderSalesTermsView | null>(null);

  /** La phrase de la carte, ou `null` pour une commande d'avant l'enregistrement. */
  protected readonly sentence = computed(() => {
    const terms = this.terms();
    if (terms === null) {
      return null;
    }
    const verb = terms.placedByStaff ? 'applicables' : 'acceptées';
    const revision =
      terms.revision === null
        ? 'texte pas encore rédigé à la passation'
        : `révision ${terms.revision}`;
    const file =
      terms.file === null
        ? 'aucun PDF de référence'
        : `PDF du ${DAY.format(new Date(terms.file.uploadedAt))}`;
    return `CGV ${verb} : ${AUDIENCE_LABELS[terms.document]}, ${revision}, ${file}`;
  });

  protected readonly fileUrl = computed(() => {
    const terms = this.terms();
    if (terms === null || terms.file === null) {
      return null;
    }
    return legalFileUrl(terms.document, terms.file.id);
  });

  constructor() {
    effect(() => {
      const id = this.orderId();
      untracked(() => void this.load(id));
    });
  }

  protected retry(): void {
    void this.load(this.orderId());
  }

  private async load(orderId: string): Promise<void> {
    this.state.set('loading');
    try {
      const response = await this.service.salesTerms(orderId);
      this.terms.set(response.salesTerms);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
