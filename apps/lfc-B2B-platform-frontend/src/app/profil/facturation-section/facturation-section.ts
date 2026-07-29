import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { FoldCardComponent, FoldPageSectionComponent, FoldSelectComponent } from 'fold-ng';

import { PAYMENT_TERMS } from '../../data/profil.model';
import { ProfilService } from '../../data/profil.service';

/**
 * Section **Facturation** — les conditions de règlement du client. Un seul
 * champ (l'échéance) : édité *en place* via un `fold-select`, sans mode
 * lecture/édition séparé — un panel ou un toggle serait disproportionné.
 */
@Component({
  selector: 'app-facturation-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageSectionComponent, FoldCardComponent, FoldSelectComponent],
  templateUrl: './facturation-section.html',
  styleUrl: './facturation-section.scss',
})
export class FacturationSection {
  protected readonly profil = inject(ProfilService);

  protected readonly profile = this.profil.profile;
  protected readonly paymentTerms = PAYMENT_TERMS;

  /** Le `<select>` n'émet qu'une valeur listée ; on la retrouve dans le
   *  catalogue plutôt que de forcer un cast de type. */
  protected onPaymentTermChange(value: string): void {
    const term = PAYMENT_TERMS.find((t) => t.value === value);
    if (term) {
      this.profil.updatePaymentTerm(term.value);
    }
  }
}
