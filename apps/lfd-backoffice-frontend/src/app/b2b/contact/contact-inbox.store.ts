import { inject, Injectable, signal } from '@angular/core';

import { ContactService } from './contact.service';

/**
 * **Le nombre de messages à traiter** — le compteur de l'onglet « Messagerie ».
 *
 * Un store et non un calcul de la page : l'onglet qui marque un message traité
 * et l'en-tête qui affiche le compte sont deux composants, et le second doit
 * suivre le premier sans qu'ils se connaissent.
 */
@Injectable({ providedIn: 'root' })
export class ContactInbox {
  private readonly api = inject(ContactService);

  /** `null` tant que le compte n'a pas été lu, ou si la lecture a échoué : pas de pastille. */
  readonly pendingCount = signal<number | null>(null);

  /** Relit le compte. Un échec efface la pastille plutôt que d'en garder une fausse. */
  async refresh(): Promise<void> {
    try {
      this.pendingCount.set((await this.api.messages('pending')).length);
    } catch {
      this.pendingCount.set(null);
    }
  }

  /** La liste à traiter vient d'être lue ailleurs : son compte suffit. */
  set(count: number): void {
    this.pendingCount.set(count);
  }
}
