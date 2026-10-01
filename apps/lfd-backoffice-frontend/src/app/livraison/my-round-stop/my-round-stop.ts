import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { MyDeliveryStopView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldDisclosureComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldLinkComponent,
} from 'fold-ng';

import { MyRoundStepPhoto } from '../my-round-step-photo/my-round-step-photo';
import { contactNameOf, telHrefOf, windowLabel } from '../run-sheet';

/** « 3 bacs, dont 1 froid » — ce que le livreur cherche dans le camion. */
export function binsLabelOf(stop: Pick<MyDeliveryStopView, 'bins' | 'coldBins'>): string {
  const bins = stop.bins === 1 ? '1 bac' : `${String(stop.bins)} bacs`;
  return stop.coldBins === 0 ? bins : `${bins}, dont ${String(stop.coldBins)} froid`;
}

/**
 * **Un arrêt de « Ma tournée »** — ce qu'il faut savoir à la porte
 * (`plan-ma-tournee.md`, MT-D5) : qui, où, quand, qui appeler, ce qu'on
 * apporte, et comment entrer.
 *
 * Aucun montant n'existe dans la vue servie (liste blanche du contrat) : il
 * n'y a rien à cacher ici.
 *
 * Les photos de procédure se lisent par la route de « ma tournée », murée à
 * ses arrêts : celle de la fiche client lui est fermée.
 */
@Component({
  selector: 'app-my-round-stop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldDisclosureComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldLinkComponent,
    MyRoundStepPhoto,
  ],
  templateUrl: './my-round-stop.html',
  styleUrl: './my-round-stop.scss',
})
export class MyRoundStop {
  readonly roundId = input.required<string>();
  readonly stop = input.required<MyDeliveryStopView>();
  /** Le lien « Y aller », ou `null` : tournée au dépôt, ou arrêt sans point ni adresse. */
  readonly goTo = input<string | null>(null);

  protected readonly title = computed(
    () => `${String(this.stop().rank)}. ${this.stop().customerLabel}`,
  );
  protected readonly window = computed(() => {
    const window = this.stop().window;
    const label = windowLabel(window);
    return window?.source === 'default' ? `${label} · horaire par défaut` : label;
  });
  protected readonly addressLines = computed(() => {
    const address = this.stop().address;
    return address === null
      ? []
      : [address.ligne1, address.ligne2, `${address.codePostal} ${address.ville}`].filter(
          (line) => line.trim() !== '',
        );
  });
  protected readonly bins = computed(() => binsLabelOf(this.stop()));

  protected readonly contactNameOf = contactNameOf;
  protected readonly telHrefOf = telHrefOf;
}
