import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AdminOrderView } from '@lfd/contracts';
import {
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldLinkComponent,
} from 'fold-ng';

/** Le bloc « Passée par », déjà mis en mots. */
export interface PlacedByLines {
  /** « Prénom Nom » du client, ou son e-mail s'il n'a pas de nom. */
  readonly person: string;
  readonly email: string;
  readonly phone: string | null;
  /** « Enseigne (Raison sociale) », la raison sociale seule, ou `null` sans société. */
  readonly company: string | null;
  /** « Saisie par X pour le compte de Y », ou `null` si le client l'a passée lui-même. */
  readonly onBehalf: string | null;
}

/**
 * Met en mots qui a passé la commande. Un membre de l'équipe que l'annuaire ne
 * nomme plus reste « l'équipe » : on ne fabrique pas un nom.
 */
export function placedByLines(
  order: Pick<AdminOrderView, 'placedBy' | 'placedByStaffId'>,
): PlacedByLines {
  const { customer, company, staffName } = order.placedBy;
  const name = `${customer.firstName} ${customer.lastName}`.trim();
  const person = name === '' ? customer.email : name;
  const companyLabel =
    company === null
      ? null
      : company.enseigne === null || company.enseigne === company.raisonSociale
        ? company.raisonSociale
        : `${company.enseigne} (${company.raisonSociale})`;
  return {
    person,
    email: customer.email,
    phone: customer.phone,
    company: companyLabel,
    onBehalf:
      order.placedByStaffId === null
        ? null
        : `Saisie par ${staffName ?? 'l’équipe'} pour le compte de ${companyLabel ?? person}`,
  };
}

/**
 * **Qui a passé la commande** — la personne à rappeler, sa société, et le
 * membre de l'équipe qui l'a saisie le cas échéant. Lu de la vue staff
 * (`AdminOrderView.placedBy`), que les routes client ne servent pas.
 */
@Component({
  selector: 'app-order-placed-by',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldLinkComponent,
  ],
  templateUrl: './order-placed-by.html',
})
export class OrderPlacedByComponent {
  readonly order = input.required<AdminOrderView>();

  protected readonly lines = computed(() => placedByLines(this.order()));
}
