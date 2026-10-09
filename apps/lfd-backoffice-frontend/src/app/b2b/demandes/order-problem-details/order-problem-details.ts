import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrderProblemDetailsView } from '@lfd/contracts';
import { FoldCalloutComponent, FoldFieldComponent, FoldFieldListComponent } from 'fold-ng';

import { CustomerRequestsService } from '../customer-requests.service';

/** Une photo prête à montrer : son identifiant et l'URL locale de son `Blob`. */
interface PhotoThumb {
  readonly id: string;
  readonly url: string;
}

/**
 * **Les détails d'un problème de commande** — la commande liée, cliquable vers
 * sa fiche du back-office, et les photos du client (`demandes-clients.md`,
 * §3.2, §7).
 *
 * Les photos ne sont jamais publiques : chacune est lue par la route admin
 * gardée, en `Blob`, puis montrée par une URL locale libérée à la sortie. Une
 * vignette s'ouvre en grand dans un nouvel onglet — le geste de la preuve de
 * livraison (`commandes/handover-proof-card/`).
 */
@Component({
  selector: 'app-order-problem-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldFieldComponent, FoldFieldListComponent, RouterLink],
  templateUrl: './order-problem-details.html',
  styleUrl: './order-problem-details.scss',
})
export class OrderProblemDetails {
  readonly requestId = input.required<string>();
  readonly details = input.required<OrderProblemDetailsView>();

  private readonly api = inject(CustomerRequestsService);

  protected readonly photos = signal<readonly PhotoThumb[]>([]);
  protected readonly photosFailed = signal(false);

  constructor() {
    effect(() => {
      const requestId = this.requestId();
      const details = this.details();
      untracked(() => void this.loadPhotos(requestId, details));
    });
    inject(DestroyRef).onDestroy(() => this.release());
  }

  private async loadPhotos(requestId: string, details: OrderProblemDetailsView): Promise<void> {
    this.release();
    this.photosFailed.set(false);
    const ordered = [...details.photos].sort((a, b) => a.position - b.position);
    try {
      const blobs = await Promise.all(
        ordered.map(async (p) => ({ id: p.id, blob: await this.api.photo(requestId, p.id) })),
      );
      this.photos.set(blobs.map(({ id, blob }) => ({ id, url: URL.createObjectURL(blob) })));
    } catch {
      this.photosFailed.set(true);
    }
  }

  private release(): void {
    for (const photo of this.photos()) URL.revokeObjectURL(photo.url);
    this.photos.set([]);
  }
}
