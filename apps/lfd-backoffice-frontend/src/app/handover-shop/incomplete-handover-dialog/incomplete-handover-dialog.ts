import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type {
  CounterIncompleteHandoverRefusal,
  CounterIncompleteHandoverView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { CounterIncompleteHandoverService } from '../../comptoir/counter-incomplete-handover.service';
import { SaleQuantityPipe } from '../../shared/sale-quantity/sale-quantity.pipe';

/** La commande, et l'aperçu lu juste avant d'ouvrir. */
export interface IncompleteHandoverDialogData {
  readonly orderId: string;
  readonly reference: string;
  readonly view: CounterIncompleteHandoverView;
}

/**
 * La phrase de chaque refus, pour un vendeur qui n'a pas le code sous les
 * yeux (lot C2, 2026-11-03). `handover_refused` lit la phrase du serveur ;
 * celle-ci n'est que son repli.
 */
export const INCOMPLETE_HANDOVER_REFUSAL_TEXT: Readonly<
  Record<CounterIncompleteHandoverRefusal, string>
> = {
  not_a_pickup: 'C’est une livraison : un départ incomplet se décide au colisage, pas au comptoir.',
  other_day: 'Cette commande n’est pas du jour : le comptoir ne remet que celles d’aujourd’hui.',
  handover_refused: 'Le retrait refuse cette remise.',
  already_decided: 'Le manque de cette commande est déjà tranché : relisez la file.',
  not_confirmed: 'La commande n’est pas confirmée : elle ne peut pas partir incomplète.',
  card: 'Réglée par carte : un départ incomplet demande un remboursement partiel, pas encore possible.',
  voucher:
    'Réglée en partie par un bon de fidélité : un départ incomplet demande de le recalculer, pas encore possible.',
  too_old:
    'Commande passée avant que ses conditions soient figées : son solde ne se recalcule pas, le départ incomplet n’est pas possible ici.',
  not_drawn: 'La commande n’est pas encore arrivée au colisage.',
  withdrawn: 'La commande a été retirée du colisage : il n’y a pas de bac à remettre.',
  sealed: 'Le bac est déjà fermé au colisage : relisez la file.',
  counted: 'Les bacs sont déjà comptés pour le départ : le comptoir ne peut plus le changer.',
  already_authorized: 'Le départ incomplet est déjà autorisé au colisage : relisez la file.',
  nothing_short: 'Tout est au bac : remettez la commande.',
  nothing_departs: 'Rien n’est au bac : annulez la commande plutôt que de la remettre.',
};

/**
 * **« Procédure commande incomplète »** — ce qui part, ce qui ne part pas, et
 * le seul geste partiel offert : « Remettre ce qui est au bac — le reste est
 * abandonné ». Un refus de l'aperçu cache ce geste et dit pourquoi ; un refus
 * du geste reste dans le dialogue ; un succès ferme sur `true`.
 *
 * 🔴 « Remettre la commande entière » malgré un manque n'est PAS offert (Q1,
 * Hugo, 2026-11-03) : il facturerait le commandé sur la seule parole du
 * vendeur. Si le sac contient plus, c'est le colisage qu'on corrige.
 */
@Component({
  selector: 'app-incomplete-handover-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SaleQuantityPipe,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './incomplete-handover-dialog.html',
  styleUrl: './incomplete-handover-dialog.scss',
})
export class IncompleteHandoverDialog implements FoldPanelContent<IncompleteHandoverDialogData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<IncompleteHandoverDialogData>();

  private readonly api = inject(CounterIncompleteHandoverService);
  private readonly panel = inject(FoldPanelRef<boolean>);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly lines = computed(() => this.data().view.lines);

  /** La phrase du refus de l'aperçu, ou `null` quand le geste est offert. */
  protected readonly refusal = computed<string | null>(() => {
    const view = this.data().view;
    if (view.refusal === null) {
      return null;
    }
    if (view.refusal === 'handover_refused' && view.handoverRefusalReason !== null) {
      return view.handoverRefusalReason;
    }
    return INCOMPLETE_HANDOVER_REFUSAL_TEXT[view.refusal];
  });

  protected async submit(): Promise<void> {
    if (this.saving() || this.refusal() !== null) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.handOver(this.data().orderId);
      this.panel.close(true);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, "Ce départ incomplet n'a pas pu être enregistré."));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.panel.close();
  }
}
