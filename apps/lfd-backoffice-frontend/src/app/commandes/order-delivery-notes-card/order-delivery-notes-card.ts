import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { DeliveryNoteStatusView, StaffNote } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { DeliveryNotesService } from '../delivery-notes.service';

/** Le mot de chaque état, tel que l'équipe le dit. */
const STATUS_LABELS: Readonly<Record<DeliveryNoteStatusView, string>> = {
  planned: 'Prévu',
  prepared: 'Préparé',
  handed_over: 'Remis',
  voided: 'Annulé',
};

/** Combien de temps garder l'adresse d'un PDF ouvert avant de la libérer. */
const BLOB_LIFETIME_MS = 60_000;

/** L'instant du dernier pas du BL, ou son jour de réception quand il est remis. */
function stepDate(note: StaffNote): string {
  const instant = note.voidedAt ?? note.handedOverAt ?? note.preparedAt ?? note.plannedAt;
  const options = { day: 'numeric', month: 'short', year: 'numeric' } as const;
  if (note.receivedOn !== null) {
    const [year, month, date] = note.receivedOn.split('-').map(Number);
    return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1)).toLocaleDateString('fr-FR', {
      ...options,
      timeZone: 'UTC',
    });
  }
  return new Date(instant).toLocaleDateString('fr-FR', { ...options, timeZone: 'Europe/Paris' });
}

/**
 * **« Bons de livraison »** sur la fiche d'une commande (plan E5a, § 3) :
 * chaque BL, son état et sa date, et deux gestes — imprimer le BL de
 * transport (sans montant, il voyage avec la marchandise) et télécharger le
 * BL chiffré (celui du client).
 *
 * Rien n'est rendu sans BL : une commande pas encore arrêtée au plan n'en a
 * pas. Un BL d'avant les totaux (`money: null`) n'offre pas le chiffré : le
 * serveur le refuserait.
 */
@Component({
  selector: 'app-order-delivery-notes-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './order-delivery-notes-card.html',
  styleUrl: './order-delivery-notes-card.scss',
})
export class OrderDeliveryNotesCard {
  readonly orderId = input.required<string>();

  private readonly service = inject(DeliveryNotesService);
  private readonly notify = inject(NotifyService);

  protected readonly notes = signal<readonly StaffNote[]>([]);
  protected readonly loadError = signal(false);

  protected readonly statusLabel = (note: StaffNote): string => STATUS_LABELS[note.status];
  protected readonly stepDate = stepDate;

  constructor() {
    effect(() => {
      const id = this.orderId();
      untracked(() => {
        void this.load(id);
      });
    });
  }

  protected retry(): void {
    void this.load(this.orderId());
  }

  protected print(note: StaffNote): void {
    void this.openCarrier(note);
  }

  protected download(note: StaffNote): void {
    void this.downloadClient(note);
  }

  private async load(orderId: string): Promise<void> {
    this.loadError.set(false);
    try {
      this.notes.set(await this.service.ofOrder(orderId));
    } catch {
      this.loadError.set(true);
    }
  }

  /** Ouvre le BL de transport dans un onglet, d'où on l'imprime. */
  private async openCarrier(note: StaffNote): Promise<void> {
    try {
      const url = URL.createObjectURL(await this.service.carrierPdf(this.orderId(), note.number));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, BLOB_LIFETIME_MS);
    } catch (error) {
      this.notify.error(error, `Le bon de livraison ${note.number} n'a pas pu être ouvert.`);
    }
  }

  private async downloadClient(note: StaffNote): Promise<void> {
    try {
      const url = URL.createObjectURL(await this.service.clientPdf(this.orderId(), note.number));
      const link = document.createElement('a');
      link.href = url;
      link.download = `bon-de-livraison-${note.number}.pdf`;
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, BLOB_LIFETIME_MS);
    } catch (error) {
      this.notify.error(
        error,
        `Le bon de livraison chiffré ${note.number} n'a pas pu être téléchargé.`,
      );
    }
  }
}
