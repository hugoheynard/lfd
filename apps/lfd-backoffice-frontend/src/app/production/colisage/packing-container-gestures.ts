import { inject, Injectable, signal } from '@angular/core';

import type { DeliveryBinFreeHalvesView, OpenPackingContainer } from '@lfd/contracts';

import { PackingContainersService } from '../packing-containers.service';
import { serverCodeOf, serverMessageOf } from '../server-message';
import { PackingDayReader } from './packing-day.reader';

/** Le dernier refus du serveur : son message, tel quel, et son code. */
export interface ContainerRefusal {
  readonly message: string;
  readonly code: string | null;
}

/**
 * **CE QU'ON FAIT dans la colonne Contenants** (K2b) — créer, répartir,
 * déplacer, retirer, annuler, proposer, partager une moitié — avec l'envoi en vol et le
 * dernier refus.
 *
 * Fourni par {@link PackingContainerBoard} ; il injecte le
 * {@link PackingDayReader} de l'écran, et chaque geste — accepté OU refusé —
 * finit par sa relecture : ce qui s'affiche est ce que le serveur sert.
 *
 * 🔴 Les refus du serveur se disent TELS QUELS (bac chargé, tournée partie,
 * type archivé, proposition vide…) : il les écrit pour le personnel.
 */
@Injectable()
export class PackingContainerGestures {
  private readonly api = inject(PackingContainersService);
  private readonly day = inject(PackingDayReader);

  private readonly inFlight = signal(false);
  readonly busy = this.inFlight.asReadonly();

  private readonly refused = signal<ContainerRefusal | null>(null);
  readonly refusal = this.refused.asReadonly();

  /** Oublie le refus — on a ouvert une autre commande. */
  forget(): void {
    this.refused.set(null);
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

  /** Déplace des pièces d'un contenant à l'autre, en un seul geste côté serveur. */
  transfer(
    orderId: string,
    fromContainerId: string,
    sku: string,
    toContainerId: string,
    quantity: number,
  ): Promise<boolean> {
    return this.write((date) =>
      this.api.transfer(date, orderId, fromContainerId, sku, toContainerId, quantity),
    );
  }

  void(orderId: string, containerId: string): Promise<boolean> {
    return this.write((date) => this.api.void(date, orderId, containerId));
  }

  /**
   * **« Proposer »** — sur un clic, jamais d'office (§2.4). Le serveur
   * l'applique d'un coup (§7) : tout est écrit, ou rien.
   */
  propose(orderId: string): Promise<boolean> {
    return this.write((date) => this.api.applyProposal(date, orderId));
  }

  /** Les moitiés libres des arrêts voisins — une lecture, sans relecture du poste. */
  shareableHalves(orderId: string): Promise<DeliveryBinFreeHalvesView> {
    return this.api.shareableHalves(this.day.date(), orderId);
  }

  /** Un geste, puis la relecture — qu'il ait été accepté ou refusé. */
  private async write(gesture: (date: string) => Promise<void>): Promise<boolean> {
    if (this.inFlight()) {
      return false;
    }
    this.inFlight.set(true);
    this.refused.set(null);
    let accepted = true;
    try {
      await gesture(this.day.date());
    } catch (error) {
      accepted = false;
      this.refused.set({ message: serverMessageOf(error), code: serverCodeOf(error) });
    }
    await this.day.rereadAfterWrite();
    this.inFlight.set(false);
    return accepted;
  }
}
