import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AdminOrderView } from '@lfd/contracts';
import { FoldIconComponent, FoldLinkComponent } from 'fold-ng';

/** Le bloc « Passée par », déjà mis en mots. */
export interface PlacedByLines {
  /** « Prénom Nom » du client, ou son e-mail s'il n'a pas de nom. */
  readonly person: string;
  readonly email: string;
  readonly phone: string | null;
  /** « Enseigne (Raison sociale) », la raison sociale seule, ou `null` sans société. */
  readonly company: string | null;
  /**
   * « saisie par X », ou `null` si le client l'a passée lui-même. Le « pour le
   * compte de » ne se répète plus : la même ligne nomme déjà le client.
   */
  readonly enteredBy: string | null;
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
    enteredBy: order.placedByStaffId === null ? null : `saisie par ${staffName ?? 'l’équipe'}`,
  };
}

/**
 * **Qui a passé la commande** — la personne à rappeler, sa société, et le
 * membre de l'équipe qui l'a saisie le cas échéant. Une ligne discrète sous
 * l'en-tête, plus une carte pleine largeur (Hugo, 2026-10-12 : « le passé par
 * prend trop de place »). Lu de la vue staff
 * (`AdminOrderView.placedBy`), que les routes client ne servent pas.
 */
@Component({
  selector: 'app-order-placed-by',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent, FoldLinkComponent],
  templateUrl: './order-placed-by.html',
  styleUrl: './order-placed-by.scss',
})
export class OrderPlacedByComponent {
  readonly order = input.required<AdminOrderView>();

  protected readonly lines = computed(() => placedByLines(this.order()));
}
