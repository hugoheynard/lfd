import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AdminOrderView } from '@lfd/contracts';
import { FoldCardComponent, FoldIconComponent, FoldLinkComponent } from 'fold-ng';
import { SectionTitle } from '@lfd/b2b-ui/order';

import type { OrderEntryStep } from '@lfd/b2b-ui/order';
import { entryOriginLabelOf } from '../order-entry-origin';

/** Le contact de la commande, déjà mis en mots. */
export interface PlacedByLines {
  /** « Prénom Nom » du client, ou son e-mail s'il n'a pas de nom. */
  readonly person: string;
  readonly email: string;
  readonly phone: string | null;
}

/** Met en mots le contact. Sans nom, la personne se dit par son e-mail. */
export function placedByLines(order: Pick<AdminOrderView, 'placedBy'>): PlacedByLines {
  const { customer } = order.placedBy;
  const name = `${customer.firstName} ${customer.lastName}`.trim();
  const person = name === '' ? customer.email : name;
  return {
    person,
    email: customer.email,
    phone: customer.phone,
  };
}

/**
 * **Qui a pris la commande** — la première étape de l'avancement côté staff.
 * « saisie par X », précédé de l'origine quand on la connaît (« Prise au
 * comptoir — saisie par X ») ; « Passée par le client » quand personne de
 * l'équipe ne l'a saisie. Un membre que l'annuaire ne nomme plus reste
 * « l'équipe » : on ne fabrique pas un nom.
 */
export function entryStepOf(
  order: Pick<AdminOrderView, 'placedBy' | 'placedByStaffId' | 'entryOrigin'>,
): OrderEntryStep {
  if (order.placedByStaffId === null) {
    return { label: 'Prise par le client', detail: null };
  }
  return {
    label: entryOriginLabelOf(order.entryOrigin) ?? 'Prise par l’équipe',
    detail: `saisie par ${order.placedBy.staffName ?? 'l’équipe'}`,
  };
}

/**
 * **Le contact de la commande** — la personne à rappeler, et de quoi la
 * joindre d'un geste. Une carte du rail de « Détail » ; qui l'a prise est la
 * première étape de l'avancement (`entryStepOf`). La société n'y est pas : la bande de tête la
 * nomme déjà. Lu de la vue staff (`AdminOrderView.placedBy`), que les routes
 * client ne servent pas.
 */
@Component({
  selector: 'app-order-placed-by',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionTitle, FoldCardComponent, FoldIconComponent, FoldLinkComponent],
  templateUrl: './order-placed-by.html',
  styleUrl: './order-placed-by.scss',
})
export class OrderPlacedByComponent {
  readonly order = input.required<AdminOrderView>();

  protected readonly lines = computed(() => placedByLines(this.order()));
}
