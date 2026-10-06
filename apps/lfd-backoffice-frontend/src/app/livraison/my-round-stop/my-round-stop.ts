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
import { DepositForm } from '../deposit-form/deposit-form';
import { HandoverForm } from '../handover-form/handover-form';
import { IncidentReportForm } from '../incident-report-form/incident-report-form';
import {
  declaredBinsLabelOf,
  expectedBinsLabelOf,
  packingBadgeOf,
  sheetSummaryOf,
} from '../my-round-packing';
import { MyRoundStepPhoto } from '../my-round-step-photo/my-round-step-photo';
import { contactNameOf, telHrefOf, windowLabel } from '../run-sheet';
import { decisionBadgeOf } from '../stop-decisions';

/**
 * **Un arrêt de « Ma tournée »** — ce qu'il faut savoir à la porte
 * (`plan-ma-tournee.md`, MT-D5) : qui, où, quand, qui appeler, ce qu'on
 * apporte, et comment entrer.
 *
 * **La fiche en évidence** (`parcours-du-livreur.md`, PL4) : le contenu de la
 * feuille d'atelier — produits, quantités, froid — dépliable et ouvert
 * d'emblée, avec l'avancement du colisage (« En préparation », « Prête », les
 * bacs déclarés et, s'il est connu, le nombre ATTENDU, toujours dit
 * « environ » : c'est une proposition).
 *
 * Aucun montant n'existe dans la vue servie (liste blanche du contrat) : il
 * n'y a rien à cacher ici.
 *
 * Les photos de procédure se lisent par la route de « ma tournée », murée à
 * ses arrêts : celle de la fiche client lui est fermée.
 *
 * **À la porte** (`a-la-porte.md`, lot A) : « Je suis arrivé » sur
 * l'arrêt suivant, « Déclarer un problème », et « Clore sans remise » quand le
 * commerce dit la commande déjà retirée ou annulée. **« Remis au client »**
 * (lot B, B1) : sur un arrêt ouvert dont la commande reste à remettre — la
 * photo, le nom, la signature si l'arrêt l'exige. **« Déposé avec preuve »**
 * (B2) : au même endroit, seulement si `canDeposit` (dépôt autorisé figé au
 * départ, et aucune signature exigée — la règle est celle du serveur, lue
 * telle quelle ; B3 l'étendra à l'autorisation d'un commercial). La page
 * décide si les gestes existent (droit, tournée partie et non rentrée) ;
 * l'arrêt n'écrit que le signalement et la remise, qui ont leur formulaire.
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
    DepositForm,
    HandoverForm,
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
  /** La version de la tournée lue par la page — la remise la présente. */
  readonly version = input(0);

  readonly arrive = output();
  readonly closeWithoutHandover = output();
  /** Un signalement vient d'être enregistré : la page relit la tournée. */
  readonly reported = output();
  /** La remise ou le dépôt vient d'être enregistré : la page relit. */
  readonly handedOver = output();

  protected readonly doorstep: readonly DeliveryIncidentFamily[] = ['doorstep'];
  protected readonly reporting = signal(false);
  protected readonly handingOver = signal(false);
  protected readonly depositing = signal(false);
  /** « Remis au client » : l'arrêt est ouvert, et la commande reste à remettre. */
  protected readonly canHandOver = computed(
    () => this.stop().closedAt === null && this.stop().orderState === 'open',
  );

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
  protected readonly bins = computed(() => declaredBinsLabelOf(this.stop()));
  /** La proposition de colisage, dite comme une estimation ; `null` : elle ne sait pas. */
  protected readonly expectedBins = computed(() => expectedBinsLabelOf(this.stop()));
  protected readonly packing = computed(() => packingBadgeOf(this.stop().packing));
  protected readonly sheetSummary = computed(() => sheetSummaryOf(this.stop().sheet));
  protected readonly arrivedLabel = computed(() => {
    const arrivedAt = this.stop().arrivedAt;
    return arrivedAt === null ? null : `Arrivé à ${parisTimeOf(arrivedAt)}`;
  });
  /** La décision du commercial (B3) — « Autorisé : déposer », « Rapporté » —, ou `null`. */
  protected readonly decision = computed(() => decisionBadgeOf(this.stop().decision));
  /** « Déjà retirée au comptoir », « Annulée » — ou `null` : le geste n'existe pas. */
  protected readonly closeLabel = computed(() => closeWithoutHandoverLabel(this.stop().orderState));

  /** Remis ou déposé : la page relit la tournée. */
  protected onHandedOver(): void {
    this.handingOver.set(false);
    this.depositing.set(false);
    this.handedOver.emit();
  }

  protected onReported(): void {
    this.reporting.set(false);
    this.reported.emit();
  }

  protected readonly contactNameOf = contactNameOf;
  protected readonly telHrefOf = telHrefOf;
}
