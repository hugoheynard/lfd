import { inject, Injectable, signal } from '@angular/core';

import { CustomerRequestsService } from './customer-requests.service';

/**
 * **Le nombre de demandes à traiter, tous types** — le compteur de l'entrée
 * « Demandes clients » du menu (`demandes-clients.md`, §6.8).
 *
 * Un store et non un calcul de la page : la boîte qui marque une demande
 * traitée et le menu qui affiche le compte ne se connaissent pas.
 */
@Injectable({ providedIn: 'root' })
export class CustomerRequestsInbox {
  private readonly api = inject(CustomerRequestsService);

  /** `null` tant que le compte n'a pas été lu, ou si la lecture a échoué : pas de pastille. */
  readonly pendingCount = signal<number | null>(null);

  /** Relit le compte. Un échec efface la pastille plutôt que d'en garder une fausse. */
  async refresh(): Promise<void> {
    try {
      this.pendingCount.set((await this.api.list('pending')).length);
    } catch {
      this.pendingCount.set(null);
    }
  }

  /** La liste à traiter, TOUS types, vient d'être lue ailleurs : son compte suffit. */
  set(count: number): void {
    this.pendingCount.set(count);
  }
}
