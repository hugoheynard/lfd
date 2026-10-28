import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { CatalogReemissionView } from '@lfd/pim-contracts';
import { httpErrorMessage } from '@lfd/endpoints';

import { ReemissionHttpApi } from './reemission-http-api';

/**
 * L'intervalle de relecture d'un travail en cours. Court : « tout » dure
 * environ une minute, une fiche une fraction de seconde.
 */
export const REEMISSION_POLL_MS = 1500;

/**
 * **Suit une réémission jusqu'à son issue** — l'état d'un écran, fourni par
 * le composant qui l'affiche (jamais à la racine : deux écrans ouverts
 * suivent chacun le leur).
 *
 * Après le lancement, il relit le travail toutes les {@link REEMISSION_POLL_MS}
 * jusqu'à `done` ou `failed`, puis s'arrête. Quitter l'écran arrête la
 * relecture ; le travail, lui, continue au serveur.
 */
@Injectable()
export class ReemissionTracker {
  private readonly api = inject(ReemissionHttpApi);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly job = signal<CatalogReemissionView | null>(null);
  readonly starting = signal(false);
  /** Le refus du lancement, ou la relecture interrompue. */
  readonly error = signal<string | null>(null);
  readonly running = computed(() => this.job()?.status === 'running');

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /**
   * Montre la dernière réémission, et la suit si elle tourne encore — lancée
   * depuis un autre poste, ou par un agent.
   */
  async showLatest(): Promise<void> {
    try {
      const job = await this.api.latest();
      this.job.set(job);
      if (job?.status === 'running') {
        this.schedule(job.id);
      }
    } catch (caught) {
      this.error.set(httpErrorMessage(caught));
    }
  }

  /** Lance une réémission (`null` = tout), puis la suit. */
  async launch(productId: string | null): Promise<void> {
    this.stop();
    this.starting.set(true);
    this.error.set(null);
    try {
      const id = await this.api.start(productId);
      await this.read(id);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught));
    } finally {
      this.starting.set(false);
    }
  }

  private async read(id: string): Promise<void> {
    const job = await this.api.byId(id);
    this.job.set(job);
    if (job.status === 'running') {
      this.schedule(id);
    }
  }

  private schedule(id: string): void {
    this.stop();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.read(id).catch((caught: unknown) => {
        this.error.set(`Le suivi s'est interrompu : ${httpErrorMessage(caught)}`);
      });
    }, REEMISSION_POLL_MS);
  }

  private stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
