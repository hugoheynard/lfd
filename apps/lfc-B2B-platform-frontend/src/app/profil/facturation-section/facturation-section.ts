import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { FoldCardComponent, FoldPageSectionComponent } from 'fold-ng';

import { type Company, paymentTermLabel } from '../../account/account.model';

/**
 * Section **Facturation** — la condition de règlement de l'entreprise. C'est un
 * réglage **toujours présent** (défaut « à la commande »), **validé par le
 * commercial** : on l'affiche en lecture seule côté client — un changement se
 * négocie avec La Folie Coffee, pas dans l'app.
 */
@Component({
  selector: 'app-facturation-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageSectionComponent, FoldCardComponent],
  templateUrl: './facturation-section.html',
  styleUrl: './facturation-section.scss',
})
export class FacturationSection {
  readonly company = input.required<Company>();

  protected readonly termLabel = computed(() => paymentTermLabel(this.company().paymentTerm));
}
