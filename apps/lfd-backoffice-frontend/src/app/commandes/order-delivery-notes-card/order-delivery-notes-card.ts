import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { AdminDeliveryNoteView, DeliveryNoteStatusView, StaffNote } from '@lfd/contracts';
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

/** Ce que dit un BL dont la première version n'a pas été figée. */
export const ORIGIN_NOT_KEPT = 'version d’origine non conservée (bon antérieur au 2026-11-25)';

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
 *
 * **La trace des versions** (plan du reliquat, § 5 ter, B4b.2) : un BL réécrit
 * (départ décidé, replanification) montre d'abord son **BL d'origine** — le
 * premier exemplaire figé, en téléchargement seul, ce n'est pas une
 * impression — puis le **BL définitif**, la ligne courante. Un bon né avant
 * qu'on fige ses exemplaires le dit, au lieu de présenter son état
 * d'aujourd'hui comme l'origine.
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

  protected readonly notes = signal<readonly AdminDeliveryNoteView[]>([]);
  protected readonly loadError = signal(false);

  /** « Remis · 12 nov. 2026 », et l'origine perdue d'un bon ancien. */
  protected meta(note: AdminDeliveryNoteView): string {
    const step = `${STATUS_LABELS[note.status]} · ${stepDate(note)}`;
    return note.originKept ? step : `${step} · ${ORIGIN_NOT_KEPT}`;
  }

  /**
   * Le premier exemplaire figé, quand le bon a changé depuis ; `null` sinon —
   * un bon à une seule version n'a qu'une ligne.
   */
  protected origin(note: AdminDeliveryNoteView): AdminDeliveryNoteView['versions'][number] | null {
    const first = note.versions[0];
    const last = note.versions.at(-1);
    if (!note.originKept || first === undefined || last === undefined) {
      return null;
    }
    return first.version !== last.version ? first : null;
  }

  /** « Figé le 12 nov. 2026, 07:14 ». */
  protected originMeta(recordedAt: string): string {
    const when = new Date(recordedAt).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
    return `Figé le ${when}`;
  }

  protected downloadOrigin(note: AdminDeliveryNoteView, edition: number): void {
    void this.downloadEdition(note, edition);
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

  /** Télécharge un exemplaire figé : aucune impression n'est tracée, la liste ne se relit pas. */
  private async downloadEdition(note: StaffNote, edition: number): Promise<void> {
    try {
      const blob = await this.service.editionPdf(this.orderId(), note.number, edition);
      this.printer.download(blob, `bon-de-livraison-${note.number}-origine.pdf`);
    } catch (error) {
      this.notify.error(error, `Le BL d’origine ${note.number} n'a pas pu être téléchargé.`);
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
