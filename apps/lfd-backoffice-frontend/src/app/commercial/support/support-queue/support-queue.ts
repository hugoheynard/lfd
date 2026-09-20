import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FoldButtonComponent, FoldEmptyStateComponent, FoldIconComponent } from 'fold-ng';
import { purposeShort } from '@lfd/b2b-ui/appointment';
import type { SupportRequestView } from '@lfd/contracts';

import { availabilityLabel, isLate, waitingLabel } from '../support-format';

/** Une demande, prête à l'affichage — le calcul est fait une fois, pas au rendu. */
interface QueueRow {
  readonly request: SupportRequestView;
  readonly purpose: string;
  readonly availability: string;
  readonly waiting: string;
  readonly late: boolean;
}

/**
 * La file **« à rappeler »** — les demandes de contact ouvertes, et le bouton
 * qui les clôt.
 *
 * Purement présentationnel : la page possède les données et le rechargement.
 * `handled` remonte l'identifiant ; c'est l'appelant qui décide quoi en faire.
 *
 * Deux partis pris de lecture : les demandes **en retard** (plus de 24 h) sortent
 * du lot, parce qu'une promesse de rappel non tenue est la seule urgence de cette
 * file ; et le **motif** est mis en tête, parce que c'est lui qui dit s'il faut
 * préparer quelque chose avant de décrocher.
 */
@Component({
  selector: 'app-support-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldEmptyStateComponent, FoldIconComponent],
  templateUrl: './support-queue.html',
  styleUrl: './support-queue.scss',
})
export class SupportQueue {
  readonly requests = input.required<readonly SupportRequestView[]>();
  /** Une demande vient d'être traitée. */
  readonly handled = output<string>();

  /** Les identifiants en cours d'envoi — le bouton se désarme le temps de l'aller-retour. */
  protected readonly pending = signal<readonly string[]>([]);

  protected readonly rows = computed<readonly QueueRow[]>(() => {
    const now = new Date();
    return this.requests().map((request) => ({
      request,
      purpose: purposeShort(request.purpose),
      availability: availabilityLabel(request),
      waiting: waitingLabel(request.createdAt, now),
      late: isLate(request, now),
    }));
  });

  protected isPending(id: string): boolean {
    return this.pending().includes(id);
  }

  protected markHandled(id: string): void {
    this.pending.update((ids) => [...ids, id]);
    this.handled.emit(id);
  }
}
