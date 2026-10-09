import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CustomerRequestView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
} from 'fold-ng';

import { factWhen } from '../../../shared/journal/units';
import { CONTACT_AUDIENCE_LABELS } from '../../contact/contact-audience';
import { REQUEST_DETAILS_COMPONENTS } from '../request-details';
import { REQUEST_KIND_LABELS } from '../request-kinds';
import { REQUEST_PRIORITY_LABELS, REQUEST_PRIORITY_VARIANTS } from '../request-priority';

/**
 * **Une demande client** — l'enveloppe commune (motif, type, priorité, auteur,
 * message, traitement) et, dessous, les détails propres à son type, rendus par
 * le composant que `REQUEST_DETAILS_COMPONENTS` désigne.
 *
 * La carte n'écrit rien : « Marquer traité » remonte à la boîte, qui écrit et
 * relit.
 */
@Component({
  selector: 'app-customer-request-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    NgComponentOutlet,
    RouterLink,
  ],
  templateUrl: './customer-request-card.html',
  styleUrl: './customer-request-card.scss',
})
export class CustomerRequestCard {
  readonly request = input.required<CustomerRequestView>();
  /** Le bouton « Marquer traité » est proposé (à traiter, et droit d'écrire). */
  readonly canHandle = input(false);
  /** Une écriture est en vol quelque part dans la boîte : on n'en lance pas une seconde. */
  readonly busy = input(false);
  /** C'est cette demande-ci qui s'écrit. */
  readonly handling = input(false);
  readonly handle = output();

  protected readonly kindLabel = computed(() => REQUEST_KIND_LABELS[this.request().kind]);
  protected readonly priorityLabel = computed(
    () => REQUEST_PRIORITY_LABELS[this.request().priority],
  );
  protected readonly priorityVariant = computed(
    () => REQUEST_PRIORITY_VARIANTS[this.request().priority],
  );

  protected readonly subtitle = computed(() => {
    const request = this.request();
    return `${CONTACT_AUDIENCE_LABELS[request.audience]} · reçue le ${factWhen(request.receivedAt)}`;
  });

  protected readonly handled = computed(() => {
    const { handledAt, handledBy } = this.request();
    if (handledAt === null) return null;
    return `Traitée le ${factWhen(handledAt)}${handledBy === null ? '' : ` par ${handledBy}`}.`;
  });

  /** Le composant des détails de ce type, et ses entrées ; `null` si le type n'en a pas. */
  protected readonly details = computed(() => {
    const request = this.request();
    const component = REQUEST_DETAILS_COMPONENTS[request.kind];
    return component === undefined
      ? null
      : { component, inputs: { requestId: request.id, details: request.details } };
  });
}
