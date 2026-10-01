import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { DeliveryIncidentFamily, MyDeliveryStopView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldDisclosureComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInlineConfirmComponent,
  FoldLinkComponent,
} from 'fold-ng';

import { parisTimeOf } from '../delivery-loading';
import { closeWithoutHandoverLabel } from '../delivery-incidents';
import { IncidentReportForm } from '../incident-report-form/incident-report-form';
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
 *
 * **À la porte** (`plan-a-la-porte.md`, lot A) : « Je suis arrivé » sur
 * l'arrêt suivant, « Déclarer un problème », et « Clore sans remise » quand le
 * commerce dit la commande déjà retirée ou annulée — rien d'autre (la remise
 * et le dépôt sont le lot B). La page décide si les gestes existent (droit,
 * tournée partie et non rentrée) ; l'arrêt n'écrit que le signalement, qui a
 * son formulaire.
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
    FoldInlineConfirmComponent,
    FoldLinkComponent,
    IncidentReportForm,
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
  /** Les gestes à la porte sont offerts : droit tenu, tournée partie et non rentrée. */
  readonly gestures = input(false);
  /** L'arrêt suivant — le seul où l'on déclare son arrivée. */
  readonly next = input(false);
  /** Une écriture de la page est en vol. */
  readonly busy = input(false);

  readonly arrive = output();
  readonly closeWithoutHandover = output();
  /** Un signalement vient d'être enregistré : la page relit la tournée. */
  readonly reported = output();

  protected readonly doorstep: readonly DeliveryIncidentFamily[] = ['doorstep'];
  protected readonly reporting = signal(false);

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
  protected readonly arrivedLabel = computed(() => {
    const arrivedAt = this.stop().arrivedAt;
    return arrivedAt === null ? null : `Arrivé à ${parisTimeOf(arrivedAt)}`;
  });
  /** « Déjà retirée au comptoir », « Annulée » — ou `null` : le geste n'existe pas. */
  protected readonly closeLabel = computed(() => closeWithoutHandoverLabel(this.stop().orderState));

  protected onReported(): void {
    this.reporting.set(false);
    this.reported.emit();
  }

  protected readonly contactNameOf = contactNameOf;
  protected readonly telHrefOf = telHrefOf;
}
