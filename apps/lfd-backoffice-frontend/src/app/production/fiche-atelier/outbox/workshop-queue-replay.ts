import { computed, DestroyRef, inject, Injectable } from '@angular/core';

import { GestureFeedback } from '../../../shared/gesture-feedback/gesture-feedback';
import { refreshWhileVisible } from '../../../shared/periodic-refresh';
import { serverMessageOf } from '../../server-message';
import { markKey } from '../../worksheet-day';
import { WorksheetService } from '../../worksheet.service';
import { WorkshopDayReader } from '../state/workshop-day.reader';
import { WorkshopGestures } from '../state/workshop-gestures';
import { isOffline } from '../rules/workshop-send-errors';
import { type QueuedGesture, WorkshopOutbox } from './workshop-outbox';

/**
 * **Le renvoi de la file d'envoi** de la fiche d'atelier : les gestes
 * (fournées, « Fait ») gardés sur l'appareil repartent, sous leurs clés, dès que le réseau
 * revient — à l'ouverture de la fiche, au retour du réseau (`online`), et à
 * chaque relecture tant que l'onglet est visible.
 *
 * Un geste que le serveur REFUSE sort de la file, et le refus est dit :
 * la rejouer ne la ferait pas passer. Un silence arrête le tour : le réseau
 * n'est pas revenu.
 */
@Injectable()
export class WorkshopQueueReplay {
  private readonly api = inject(WorksheetService);
  private readonly day = inject(WorkshopDayReader);
  private readonly outbox = inject(WorkshopOutbox);
  private readonly gestures = inject(WorkshopGestures);
  private readonly feedback = inject(GestureFeedback);
  /** Un tour à la fois. */
  private flushing = false;

  /** « 2 fournées et 1 « Fait » » — ce que le bandeau compte ; `null` file vide. */
  readonly queuedLabel = computed(() => {
    const entries = this.outbox.entries();
    const batches = entries.filter((entry) => entry.kind === 'batch').length;
    const dones = entries.length - batches;
    const parts = [
      batches > 0 ? `${String(batches)} fournée${batches > 1 ? 's' : ''}` : null,
      dones > 0 ? `${String(dones)} « Fait »` : null,
    ].filter((part) => part !== null);
    return parts.length === 0 ? null : parts.join(' et ');
  });

  /**
   * Arme les relances. ⚠️ Dans un contexte d'injection (le constructeur de
   * l'écran) : elles s'arrêtent avec lui.
   */
  start(): void {
    refreshWhileVisible(() => this.flush());
    if (typeof window !== 'undefined') {
      const onOnline = (): void => void this.flush();
      window.addEventListener('online', onOnline);
      inject(DestroyRef).onDestroy(() => window.removeEventListener('online', onOnline));
    }
    void this.flush();
  }

  /** Renvoie la file, une fournée après l'autre ; relit la fiche si une est partie. */
  async flush(): Promise<void> {
    if (this.flushing || this.outbox.entries().length === 0) {
      return;
    }
    this.flushing = true;
    let sentAny = false;
    try {
      for (const entry of this.outbox.entries()) {
        const key = markKey(entry.date, entry.sku);
        if (this.day.busy().has(key)) {
          continue;
        }
        const outcome = await this.send(key, entry);
        if (outcome === 'offline') {
          break;
        }
        sentAny ||= outcome === 'sent';
      }
    } finally {
      this.flushing = false;
    }
    if (sentAny) {
      this.feedback.accepted('Gestes gardés envoyés');
      await this.day.rereadAfterWrite();
    }
  }

  private async send(key: string, entry: QueuedGesture): Promise<'sent' | 'offline' | 'refused'> {
    this.day.setBusy(key, true);
    if (entry.kind === 'batch') {
      this.outbox.setSending(key, entry.quantity);
    }
    try {
      await this.write(entry);
      this.outbox.remove(entry.id);
      return 'sent';
    } catch (error) {
      if (isOffline(error)) {
        return 'offline';
      }
      this.outbox.remove(entry.id);
      const what = entry.kind === 'batch' ? 'La fournée gardée' : 'Le « Fait » gardé';
      this.gestures.sayRefused(
        `${what} n’a pas été accepté${entry.kind === 'batch' ? 'e' : ''} — ${entry.productName} : ${serverMessageOf(error)}`,
      );
      return 'refused';
    } finally {
      this.outbox.setSending(key, null);
      this.day.setBusy(key, false);
    }
  }

  /** Le même appel que le geste d'origine, sous la même clé. */
  private async write(entry: QueuedGesture): Promise<void> {
    if (entry.kind === 'batch') {
      await this.api.recordBatch(entry.date, entry.sku, entry.id, {
        quantity: entry.quantity,
        initials: entry.initials,
      });
      return;
    }
    await this.api.markDone(entry.date, entry.sku, entry.id);
  }
}
