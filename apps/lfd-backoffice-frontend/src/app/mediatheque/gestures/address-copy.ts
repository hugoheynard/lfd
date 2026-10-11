import { Injectable, inject } from '@angular/core';

import { NotifyService } from '../../notify.service';

/**
 * **Copier l'adresse d'une image** — le presse-papiers, et ce qu'on en dit.
 * Un refus du navigateur (permission, contexte non sûr) se dit, il ne se tait
 * pas.
 */
@Injectable({ providedIn: 'root' })
export class AddressCopy {
  private readonly notify = inject(NotifyService);

  async copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.notify.success('Adresse copiée.');
    } catch (caught) {
      this.notify.error(caught, "L'adresse n'a pas pu être copiée.");
    }
  }
}
