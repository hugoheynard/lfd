import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { ResupplyReceptionLineView, ResupplyReceptionView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldNumberInputComponent,
  FoldStatusBadgeComponent,
} from 'fold-ng';

import {
  BAKEHOUSE_ORIGIN_MARK,
  parisClock,
  RESUPPLY_TARGET_LABELS,
} from '../../../shared/resupply-labels';
import { resupplySteps, type ResupplyStep } from '../../../shared/resupply-steps';
import { ResupplyReceiptsService } from '../resupply-receipts.service';

/**
 * **Réceptionner les réassorts du jour** (lot R2,
 * `reassort-boutiques/plan-reapprovisionnement.md` §12, Hugo 2026-10-21 :
 * « personne ne fera du ligne par ligne en plein service »).
 *
 * Chaque réassort envoyé pour la journée — « au plus tôt » du jour, « pour
 * demain » de la veille — montre ses lignes ATTENDUES (la quantité demandée)
 * en lecture et UN bouton « Réceptionner », qui les reçoit toutes d'un geste.
 * Ensuite : « Réceptionné par X à HH:MM », et la correction d'un écart, ligne
 * par ligne. Avant « Réceptionner », rien ne se corrige : rien n'est reçu.
 *
 * Depuis le lot R1d (2026-10-21), un réassort que le fournil a envoyé de
 * lui-même est marqué « Envoyé par le fournil » ; il se réceptionne d'un
 * geste comme les autres.
 *
 * Un réassort nommé (R1g) se lit sous son nom, la visée à côté : la page
 * est celle d'un seul point, qu'on ne répète pas.
 *
 * Depuis le lot R3e (2026-10-22), un réassort attendu dit s'il est
 * « Arrivé » (le transfert reçu au point, ou « Monté » au fournil) ou encore
 * « Attendu ». Réceptionner ne l'attend pas : le comptoir fait foi.
 *
 * Depuis le lot R4d (2026-10-22), un réassort attendu montre son chemin :
 * Envoyé → Lancé → Parti → Arrivé, chaque étape atteinte avec son heure et
 * son auteur quand on les a. Aucune n'ouvre ni ne ferme « Réceptionner ».
 *
 * La carte fait ses gestes et prévient la page (`changed`), qui relit tout
 * (le stock du jour et les alertes que la réception a levées).
 */
@Component({
  selector: 'app-resupply-receptions-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldNumberInputComponent,
    FoldStatusBadgeComponent,
  ],
  templateUrl: './resupply-receptions-card.html',
  styleUrl: './resupply-receptions-card.scss',
})
export class ResupplyReceptionsCard {
  private readonly service = inject(ResupplyReceiptsService);

  readonly siteId = input.required<string>();
  readonly receptions = input.required<readonly ResupplyReceptionView[]>();
  readonly canWrite = input.required<boolean>();
  /** Un geste a réussi : la page relit. */
  readonly changed = output();

  protected readonly targetLabels = RESUPPLY_TARGET_LABELS;
  protected readonly bakehouseMark = BAKEHOUSE_ORIGIN_MARK;
  protected readonly pending = signal(false);
  protected readonly failure = signal<string | null>(null);
  /** Les reçus en cours de correction, par « réassort/SKU ». */
  private readonly drafts = signal<ReadonlyMap<string, number | null>>(new Map());
  protected readonly empty = computed(() => this.receptions().length === 0);

  constructor() {
    // Une relecture remet les corrections en cours à ce que le serveur dit.
    effect(() => {
      this.receptions();
      untracked(() => this.drafts.set(new Map()));
    });
  }

  protected stepsOf(reception: ResupplyReceptionView): readonly ResupplyStep[] {
    return resupplySteps(reception);
  }

  protected receivedLine(reception: ResupplyReceptionView): string {
    const at = reception.receivedAt === null ? '' : ` à ${parisClock(reception.receivedAt)}`;
    return `Réceptionné${reception.receivedBy === null ? '' : ` par ${reception.receivedBy}`}${at}`;
  }

  protected arrivedLine(reception: ResupplyReceptionView): string {
    const at = reception.arrivedAt === null ? '' : ` à ${parisClock(reception.arrivedAt)}`;
    return `Arrivé${reception.arrivedBy === null ? '' : `, signalé par ${reception.arrivedBy}`}${at}`;
  }

  protected draftOf(
    reception: ResupplyReceptionView,
    line: ResupplyReceptionLineView,
  ): number | null {
    const draft = this.drafts().get(keyOf(reception, line));
    return draft === undefined ? line.receivedQuantity : draft;
  }

  protected setDraft(
    reception: ResupplyReceptionView,
    line: ResupplyReceptionLineView,
    quantity: number | null,
  ): void {
    this.drafts.update((drafts) => new Map(drafts).set(keyOf(reception, line), quantity));
  }

  protected changedLine(
    reception: ResupplyReceptionView,
    line: ResupplyReceptionLineView,
  ): boolean {
    const draft = this.draftOf(reception, line);
    return draft !== null && draft !== line.receivedQuantity;
  }

  protected async receive(reception: ResupplyReceptionView): Promise<void> {
    await this.act(() => this.service.receiveResupply(this.siteId(), reception.resupplyId));
  }

  protected async correct(
    reception: ResupplyReceptionView,
    line: ResupplyReceptionLineView,
  ): Promise<void> {
    const quantity = this.draftOf(reception, line);
    if (quantity === null) {
      return;
    }
    await this.act(() =>
      this.service.correctReceived(this.siteId(), reception.resupplyId, line.sku, quantity),
    );
  }

  /** Un geste, puis la relecture par la page. Un refus reste affiché, avec sa raison. */
  private async act(gesture: () => Promise<void>): Promise<void> {
    if (this.pending()) {
      return;
    }
    this.pending.set(true);
    this.failure.set(null);
    try {
      await gesture();
      this.changed.emit();
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "La réception n'a pas pu être enregistrée."));
    } finally {
      this.pending.set(false);
    }
  }
}

function keyOf(reception: ResupplyReceptionView, line: ResupplyReceptionLineView): string {
  return `${reception.resupplyId}/${line.sku}`;
}
