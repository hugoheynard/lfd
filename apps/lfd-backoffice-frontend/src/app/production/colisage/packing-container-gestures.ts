import { inject, Injectable, signal } from '@angular/core';

import type { OpenPackingContainer } from '@lfd/contracts';

import { PackingContainersService } from '../packing-containers.service';
import { serverMessageOf } from '../server-message';
import { proposalLeavesWork, proposalSteps } from './container-board';
import { PackingDayReader } from './packing-day.reader';

/**
 * **CE QU'ON FAIT dans la colonne Contenants** (K2b) — créer, répartir,
 * retirer, annuler, proposer — avec l'envoi en vol et le dernier refus.
 *
 * Fourni par {@link PackingContainerBoard} ; il injecte le
 * {@link PackingDayReader} de l'écran, et chaque geste — accepté OU refusé —
 * finit par sa relecture : ce qui s'affiche est ce que le serveur sert.
 *
 * 🔴 Les refus du serveur se disent TELS QUELS (bac chargé, tournée partie,
 * type archivé…) : il les écrit pour le personnel.
 */
@Injectable()
export class PackingContainerGestures {
  private readonly api = inject(PackingContainersService);
  private readonly day = inject(PackingDayReader);

  private readonly inFlight = signal(false);
  readonly busy = this.inFlight.asReadonly();

  private readonly refused = signal<string | null>(null);
  readonly refusal = this.refused.asReadonly();

  /** Ce que « Proposer » a laissé à faire à la main, le temps de le dire. */
  private readonly proposalNote = signal<string | null>(null);
  readonly note = this.proposalNote.asReadonly();

  /** Oublie le refus et la note — on a ouvert une autre commande. */
  forget(): void {
    this.refused.set(null);
    this.proposalNote.set(null);
  }

  open(orderId: string, request: OpenPackingContainer): Promise<boolean> {
    return this.write(async (date) => {
      await this.api.open(date, orderId, request);
    });
  }

  allocate(orderId: string, containerId: string, sku: string, quantity: number): Promise<boolean> {
    return this.write((date) => this.api.allocate(date, orderId, containerId, sku, quantity));
  }

  withdraw(orderId: string, containerId: string, sku: string, quantity: number): Promise<boolean> {
    return this.write((date) => this.api.withdraw(date, orderId, containerId, sku, quantity));
  }

  void(orderId: string, containerId: string): Promise<boolean> {
    return this.write((date) => this.api.void(date, orderId, containerId));
  }

  /**
   * **« Proposer »** — sur un clic, jamais d'office (§2.4). Lit la proposition,
   * crée ses bacs l'un après l'autre et y répartit ce qu'elle place sans
   * ambiguïté. S'arrête au premier refus : ce qui est déjà créé reste, et
   * s'annule à la main.
   */
  propose(orderId: string, innerBags: number): Promise<boolean> {
    return this.write(async (date) => {
      const proposal = await this.api.proposal(date, orderId);
      const steps = proposalSteps(proposal, innerBags);
      if (steps.length === 0) {
        this.proposalNote.set('La proposition ne retient aucun bac — créez-les à la main.');
        return;
      }
      for (const step of steps) {
        const containerId = await this.api.open(date, orderId, step.request);
        for (const item of step.content) {
          await this.api.allocate(date, orderId, containerId, item.sku, item.quantity);
        }
      }
      if (proposalLeavesWork(proposal)) {
        this.proposalNote.set(
          'Bacs proposés créés. Ce qui reste dans « Produits » est à glisser à la main.',
        );
      }
    });
  }

  /** Un geste, puis la relecture — qu'il ait été accepté ou refusé. */
  private async write(gesture: (date: string) => Promise<void>): Promise<boolean> {
    if (this.inFlight()) {
      return false;
    }
    this.inFlight.set(true);
    this.refused.set(null);
    this.proposalNote.set(null);
    let accepted = true;
    try {
      await gesture(this.day.date());
    } catch (error) {
      accepted = false;
      this.refused.set(serverMessageOf(error));
    }
    await this.day.rereadAfterWrite();
    this.inFlight.set(false);
    return accepted;
  }
}
