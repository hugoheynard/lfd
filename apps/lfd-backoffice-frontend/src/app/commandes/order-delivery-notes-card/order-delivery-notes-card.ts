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
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { PdfPrinter } from '../../shared/print-pdf/pdf-printer';
import { DeliveryNotesService, REPRINT_SENTENCE } from '../delivery-notes.service';
import { DocumentRow } from '../document-row/document-row';

/** Le mot de chaque état, tel que l'équipe le dit. */
const STATUS_LABELS: Readonly<Record<DeliveryNoteStatusView, string>> = {
  planned: 'Prévu',
  prepared: 'Préparé',
  handed_over: 'Remis',
  voided: 'Annulé',
};

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
 * **Les bons de livraison** d'une commande, en lignes de l'onglet « Documents »
 * (groupe Pièces) : chaque BL, son état et sa date, et deux gestes —
 * « Imprimer » le BL de transport (sans montant, il voyage avec la
 * marchandise ; l'impression est tracée) et « Télécharger » le BL chiffré du
 * client.
 *
 * Rien n'est rendu sans BL : une commande pas encore arrêtée au plan n'en a
 * pas. Un BL d'avant les totaux (`money: null`) n'a pas de chiffré — le
 * serveur le refuserait : « Télécharger » y rend le BL de transport.
 */
@Component({
  selector: 'app-order-delivery-notes-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DocumentRow, FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './order-delivery-notes-card.html',
  styleUrl: './order-delivery-notes-card.scss',
})
export class OrderDeliveryNotesCard {
  readonly orderId = input.required<string>();
  /** Un compteur que le parent avance pour faire relire la liste (après une décision). */
  readonly refresh = input(0);

  private readonly service = inject(DeliveryNotesService);
  private readonly notify = inject(NotifyService);
  private readonly printer = inject(PdfPrinter);

  protected readonly notes = signal<readonly StaffNote[]>([]);
  protected readonly loadError = signal(false);

  /** « Remis · 12 nov. 2026 ». */
  protected meta(note: StaffNote): string {
    return `${STATUS_LABELS[note.status]} · ${stepDate(note)}`;
  }

  protected readonly reprintSentence = REPRINT_SENTENCE;

  constructor() {
    effect(() => {
      const id = this.orderId();
      this.refresh();
      untracked(() => {
        void this.load(id);
      });
    });
  }

  protected retry(): void {
    void this.load(this.orderId());
  }

  protected print(note: StaffNote): void {
    void this.printCarrier(note);
  }

  protected download(note: StaffNote): void {
    void this.downloadNote(note);
  }

  private async load(orderId: string): Promise<void> {
    this.loadError.set(false);
    try {
      this.notes.set(await this.service.ofOrder(orderId));
    } catch {
      this.loadError.set(true);
    }
  }

  /** Imprime le BL de transport. */
  private async printCarrier(note: StaffNote): Promise<void> {
    try {
      this.printer.print(await this.service.carrierPdf(this.orderId(), note.number));
      // L'impression est tracée : la liste relue ne demande plus de réimprimer.
      await this.load(this.orderId());
    } catch (error) {
      this.notify.error(error, `Le bon de livraison ${note.number} n'a pas pu être ouvert.`);
    }
  }

  /** Télécharge le BL chiffré du client, ou le BL de transport quand il n'a pas de totaux. */
  private async downloadNote(note: StaffNote): Promise<void> {
    const ciphered = note.money !== null;
    try {
      const blob = ciphered
        ? await this.service.clientPdf(this.orderId(), note.number)
        : await this.service.carrierPdf(this.orderId(), note.number);
      this.printer.download(blob, `bon-de-livraison-${note.number}.pdf`);
      await this.load(this.orderId());
    } catch (error) {
      this.notify.error(error, `Le bon de livraison ${note.number} n'a pas pu être téléchargé.`);
    }
  }
}
