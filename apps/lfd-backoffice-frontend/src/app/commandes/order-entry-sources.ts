import { inject, Injectable } from '@angular/core';
import type { DeliveryAvailabilityView } from '@lfd/contracts';

import { DeliveryAvailabilityService } from '../b2b/reglages/delivery-availability.service';
import { AdminCompaniesService } from '../comptes-clients/admin-companies.service';
import { CounterCustomersService } from '../comptoir/counter-customers.service';
import {
  customerFromAdminCompany,
  customerFromCounter,
  type OrderEntryCustomer,
} from './nouvelle-commande/order-entry-customer';

/**
 * **D'où la saisie d'une commande lit son client**, selon qui la fait.
 *
 * Le Commercial lit la fiche ; le Comptoir, qui n'y a pas droit, lit ses
 * propres routes. Une source par origine plutôt qu'un `if` par lecture dans la
 * page : un appel à `/admin/companies` oublié dans une branche serait un 403
 * au comptoir, et il ne se verrait qu'à l'écran.
 */
export abstract class OrderEntrySource {
  /** Le client, ou `undefined` s'il est inconnu. Un refus serveur remonte en erreur. */
  abstract customer(companyId: string): Promise<OrderEntryCustomer | undefined>;
  /** L'ouverture de la livraison par clientèle. */
  abstract deliveryAvailability(): Promise<DeliveryAvailabilityView>;
  /**
   * La saisie peut-elle ajouter une adresse au carnet du compte ? Il faut
   * `b2b_companies:write` : là où on ne l'a pas, la case ne s'affiche pas —
   * un échec silencieux laisserait croire l'adresse gardée.
   */
  abstract readonly keepsAddresses: boolean;
}

/** La source du Commercial — la fiche et ses membres, inchangés. */
@Injectable({ providedIn: 'root' })
export class CommercialOrderEntrySource extends OrderEntrySource {
  private readonly companies = inject(AdminCompaniesService);
  private readonly availability = inject(DeliveryAvailabilityService);
  readonly keepsAddresses = true;

  async customer(companyId: string): Promise<OrderEntryCustomer | undefined> {
    const [company, members] = await Promise.all([
      this.companies.getById(companyId),
      this.companies.listMembers(companyId),
    ]);
    return company === undefined ? undefined : customerFromAdminCompany(company, members);
  }

  deliveryAvailability(): Promise<DeliveryAvailabilityView> {
    return this.availability.read();
  }
}

/** La source du Comptoir — ses deux lectures, et la route publique de la livraison. */
@Injectable({ providedIn: 'root' })
export class CounterOrderEntrySource extends OrderEntrySource {
  private readonly counter = inject(CounterCustomersService);
  private readonly availability = inject(DeliveryAvailabilityService);
  readonly keepsAddresses = false;

  async customer(companyId: string): Promise<OrderEntryCustomer> {
    return customerFromCounter(await this.counter.get(companyId));
  }

  deliveryAvailability(): Promise<DeliveryAvailabilityView> {
    return this.availability.readPublic();
  }
}
