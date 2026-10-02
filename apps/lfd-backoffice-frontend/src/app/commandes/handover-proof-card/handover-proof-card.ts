import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { OrderHandoverProofView } from '@lfd/contracts';
import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { AdminOrdersService } from '../orders.service';

type CardState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'none' }
  | { readonly status: 'ready'; readonly proof: OrderHandoverProofView };

/** Les URL locales des images chargées ; `null` : pas de pièce, ou illisible. */
interface ProofImages {
  readonly photo: string | null;
  readonly signature: string | null;
  readonly failed: boolean;
}

const NO_IMAGES: ProofImages = { photo: null, signature: null, failed: false };

/**
 * **« Preuve de livraison »** sur la fiche d'une commande — pour répondre à
 * une contestation (`plan-a-la-porte.md`, § 10, lot « voir les preuves »).
 *
 * Rien n'est rendu quand la commande n'a pas été remise à la porte : la
 * carte n'existe que si elle a quelque chose à dire. Les images sont lues en
 * blob (la route porte le jeton) puis rendues à la destruction.
 */
@Component({
  selector: 'app-handover-proof-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './handover-proof-card.html',
  styleUrl: './handover-proof-card.scss',
})
export class HandoverProofCard {
  readonly orderId = input.required<string>();

  private readonly api = inject(AdminOrdersService);

  protected readonly state = signal<CardState>({ status: 'loading' });
  protected readonly images = signal<ProofImages>(NO_IMAGES);
  protected readonly proof = computed<OrderHandoverProofView | null>(() => {
    const state = this.state();
    return state.status === 'ready' ? state.proof : null;
  });

  constructor() {
    // Seul l'identifiant relance la lecture : `load` lit et réécrit les
    // images, et un effet qui les suivrait se relancerait sans fin.
    effect(() => {
      const orderId = this.orderId();
      untracked(() => {
        void this.load(orderId);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.release();
    });
  }

  private async load(orderId: string): Promise<void> {
    this.release();
    this.state.set({ status: 'loading' });
    try {
      const { proof } = await this.api.handoverProof(orderId);
      this.state.set(proof === null ? { status: 'none' } : { status: 'ready', proof });
      if (proof?.pieces !== null && proof?.pieces !== undefined) {
        await this.loadImages(orderId, proof.pieces.hasSignature);
      }
    } catch {
      this.state.set({ status: 'error' });
    }
  }

  private async loadImages(orderId: string, withSignature: boolean): Promise<void> {
    try {
      const [photo, signature] = await Promise.all([
        this.api.handoverProofImage(orderId, 'photo'),
        withSignature ? this.api.handoverProofImage(orderId, 'signature') : Promise.resolve(null),
      ]);
      this.images.set({
        photo: URL.createObjectURL(photo),
        signature: signature === null ? null : URL.createObjectURL(signature),
        failed: false,
      });
    } catch {
      this.images.set({ ...NO_IMAGES, failed: true });
    }
  }

  private release(): void {
    const { photo, signature } = this.images();
    for (const url of [photo, signature]) {
      if (url !== null) {
        URL.revokeObjectURL(url);
      }
    }
    this.images.set(NO_IMAGES);
  }
}
