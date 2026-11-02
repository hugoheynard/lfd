import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import type { ResupplyTarget, SiteResupplyDraftView } from '@lfd/contracts';
import { FoldButtonComponent, FoldNumberInputComponent, FoldPanelHostService } from 'fold-ng';

import {
  QuantityDialog,
  type QuantityDialogData,
} from '../../../shared/quantity-dialog/quantity-dialog';
import {
  quantityDownStepsFor,
  quantityStepsFor,
} from '../../../shared/quantity-steps/quantity-steps';
import { SaleQuantityPipe } from '../../../shared/sale-quantity/sale-quantity.pipe';
import type { StockRow } from '../resupply-stock-rows';
import { SiteResuppliesStore } from '../site-resupplies.store';

/**
 * **La case de quantité d'une ligne du réassort** : la demande de la visée
 * affichée, saisie au clavier ou par pas rapides (on retire à gauche, on
 * ajoute à droite — Hugo, 2026-10-28). En mobile, la case seule, en lecture :
 * la toucher ouvre le dialogue du chiffre et des raccourcis.
 *
 * Elle ne garde que la saisie en cours ; la demande vit dans
 * `SiteResuppliesStore`, qui relit après chaque geste.
 */
@Component({
  selector: 'app-resupply-quantity-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldNumberInputComponent, SaleQuantityPipe],
  templateUrl: './resupply-quantity-cell.html',
  styleUrl: './resupply-quantity-cell.scss',
})
export class ResupplyQuantityCell {
  private readonly resupplies = inject(SiteResuppliesStore);
  private readonly panels = inject(FoldPanelHostService);

  readonly row = input.required<StockRow>();
  readonly target = input.required<ResupplyTarget>();
  /** La demande en cours de la visée ; `null` tant qu'elle n'a aucune ligne. */
  readonly draft = input.required<SiteResupplyDraftView | null>();
  readonly phone = input(false);

  /** Les pas rapides ; au poids, en grammes (100 g, 500 g, 1 kg — lot L2b-4). */
  protected readonly upSteps = computed(() => quantityStepsFor(this.row().saleUnit));
  protected readonly downSteps = computed(() => quantityDownStepsFor(this.row().saleUnit));

  /**
   * La saisie en cours ; `undefined` quand rien n'est tapé. Elle tombe d'elle-même
   * si la visée change ou si un autre poste a fait changer la version de la demande :
   * on n'écrit jamais un chiffre tapé sur une demande qu'on n'a plus sous les yeux.
   */
  private readonly edit = linkedSignal<string, number | null | undefined>({
    source: () => `${this.target()}:${String(this.draft()?.version ?? 0)}`,
    computation: () => undefined,
  });

  /** La demande de la ligne pour la visée affichée, telle que le serveur la tient. */
  private readonly current = computed(() =>
    this.target() === 'asap' ? this.row().asap : this.row().tomorrow,
  );

  /**
   * Le chiffre parti au serveur et pas encore relu. La case le montre en
   * attendant : un « −1 » cliqué dans la foulée part de lui, pas de l'ancienne
   * demande (audit du 2026-11-03).
   */
  private readonly sending = signal<number | undefined>(undefined);

  /** Ce que la case montre : la saisie, sinon l'envoi en cours, sinon la demande (vide à zéro). */
  readonly quantity = computed<number | null>(() => {
    const edit = this.edit();
    if (edit !== undefined) {
      return edit;
    }
    const shown = this.sending() ?? this.current();
    return shown === 0 ? null : shown;
  });

  setQuantity(quantity: number | null): void {
    this.edit.set(quantity);
  }

  /**
   * La case quittée (ou Entrée) écrit la demande : un article absent
   * s'ajoute, présent se corrige, vidé ou à zéro se retire — décidé par le
   * store à son tour dans la file, sur la demande relue.
   */
  async commit(): Promise<void> {
    const edit = this.edit();
    if (edit === undefined) {
      return;
    }
    this.edit.set(undefined);
    const wanted = edit ?? 0;
    if (wanted === (this.sending() ?? this.current())) {
      return;
    }
    this.sending.set(wanted);
    try {
      await this.resupplies.setLine(this.target(), this.row().sku, wanted);
    } finally {
      if (this.sending() === wanted) {
        this.sending.set(undefined);
      }
    }
  }

  /** Un pas rapide s'ajoute à la demande : deux ajouts se cumulent, sans version. */
  async step(quantity: number): Promise<void> {
    await this.resupplies.addLine(this.target(), this.row().sku, quantity);
  }

  /**
   * Un pas retiré corrige la demande, sans descendre sous zéro ; à zéro,
   * la ligne se retire. Il part de ce que la case montre, saisie comprise.
   */
  async stepDown(quantity: number): Promise<void> {
    const shown = this.quantity() ?? 0;
    if (shown === 0) {
      return;
    }
    this.setQuantity(Math.max(0, shown - quantity));
    await this.commit();
  }

  /** En mobile, la case ouvre le dialogue du chiffre et des raccourcis, puis écrit. */
  protected async openDialog(): Promise<void> {
    if (!this.phone()) {
      return;
    }
    const row = this.row();
    const quantity = await this.panels.open<QuantityDialogData, number>(QuantityDialog, {
      data: { label: row.name, quantity: this.quantity(), saleUnit: row.saleUnit },
    }).closed;
    if (quantity !== undefined) {
      this.setQuantity(quantity);
      await this.commit();
    }
  }
}
