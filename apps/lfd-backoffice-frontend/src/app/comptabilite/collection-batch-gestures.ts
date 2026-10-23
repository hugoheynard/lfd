import { inject, Injectable, signal } from '@angular/core';
import type { CollectionBatchView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';

import { NotifyService } from '../notify.service';
import { saveBlob } from '../shared/download/save-blob';
import { CollectionBatchesService } from './collection-batches.service';
import type { PendingBatchGesture } from './prelevement-du-mois/pending-batch/pending-batch';

/** Un téléchargement d'un lot : son fichier XML ou son CSV de contrôle. */
export interface BatchDownload {
  readonly batch: CollectionBatchView;
  readonly kind: 'xml' | 'csv';
}

/**
 * **Les gestes d'un lot** — préparer, déposer, annuler, télécharger —, sortis
 * de « Prélèvement du mois » pour être partagés avec « Procédure de
 * prélèvement » (plan `plan-page-procedure-de-prelevement.md`, S5) : deux
 * hôtes, une logique. Un déplacement, pas une copie.
 *
 * Fourni PAR PAGE (`providers`), pas à la racine : le geste en cours et son
 * refus appartiennent à l'écran qui l'a lancé. Chaque geste relit ensuite par
 * `reload`, que l'hôte donne — c'est lui qui sait ce qu'il affiche.
 */
@Injectable()
export class CollectionBatchGestures {
  private readonly api = inject(CollectionBatchesService);
  private readonly notify = inject(NotifyService);

  /** La clé du geste en cours (`prepare`, l'id d'un lot…), ou `null`. */
  readonly pending = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  /**
   * « Préparer le lot … » ; `lotName` nomme le lot dans la confirmation,
   * `nothing` dit où sont les bons écartés quand rien n'est préparé.
   */
  async prepare(
    entityId: string,
    lotName: string,
    nothing: string,
    reload: () => Promise<void>,
  ): Promise<void> {
    await this.run(
      'prepare',
      async () => {
        const { batchIds } = await this.api.constitute(entityId);
        this.notify.success(batchIds.length === 0 ? nothing : `Lot ${lotName} préparé.`);
      },
      reload,
    );
  }

  /** Un geste de la carte du lot à déposer (`app-pending-batch`). */
  async onGesture(
    batch: CollectionBatchView,
    gesture: PendingBatchGesture,
    reload: () => Promise<void>,
  ): Promise<void> {
    if (gesture === 'xml' || gesture === 'csv') {
      // Le fichier XML téléchargé ouvre « J'ai déposé » : l'hôte relit pour le voir.
      if ((await this.download({ batch, kind: gesture })) && gesture === 'xml') {
        await reload();
      }
    } else if (gesture === 'deposit') {
      await this.run(
        batch.id,
        async () => {
          await this.api.deposit(batch.id);
          this.notify.success('Lot marqué déposé.');
        },
        reload,
      );
    } else {
      await this.run(
        batch.id,
        async () => {
          await this.api.cancel(batch.id);
          this.notify.success('Lot annulé : ses bons repassent à prélever.');
        },
        reload,
      );
    }
  }

  /** Rend `true` si le fichier est parti, `false` si le refus s'affiche. */
  async download({ batch, kind }: BatchDownload): Promise<boolean> {
    this.actionError.set(null);
    try {
      const file = kind === 'xml' ? await this.api.file(batch.id) : await this.api.audit(batch.id);
      saveBlob(file.blob, file.fileName ?? `lot-${batch.id}.${kind}`);
      return true;
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, 'Téléchargement impossible.'));
      return false;
    }
  }

  /** Un geste : son refus s'affiche avec les mots du serveur, puis l'hôte relit. */
  async run(key: string, gesture: () => Promise<void>, reload: () => Promise<void>): Promise<void> {
    this.pending.set(key);
    this.actionError.set(null);
    try {
      await gesture();
      await reload();
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, 'Le geste a été refusé.'));
    } finally {
      this.pending.set(null);
    }
  }
}
