import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import type { DeliveryProcedureStepView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import { AdminDeliveryProcedureGateway } from '../../comptes-clients/admin-delivery-procedure.gateway';

type PreviewState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly steps: readonly DeliveryProcedureStepView[] };

/**
 * **La procédure de livraison d'une adresse, en lecture** — l'œil du carnet
 * d'adresses de Tour manager (Hugo, 2026-11-25). Les étapes dans l'ordre,
 * leur titre, leur texte et leur photo.
 *
 * Rien n'est lu tant que le popover n'est pas ouvert : la table ne fait pas un
 * appel par adresse. Les photos passent par la route staff authentifiée et
 * s'affichent en URL d'objet, comme dans l'éditeur partagé.
 */
@Component({
  selector: 'app-address-procedure-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
  ],
  templateUrl: './address-procedure-preview.html',
  styleUrl: './address-procedure-preview.scss',
})
export class AddressProcedurePreview {
  readonly companyId = input.required<string>();
  readonly addressId = input.required<string>();

  private readonly http = inject(HttpClient);
  protected readonly state = signal<PreviewState>({ status: 'idle' });
  protected readonly steps = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.steps : [];
  });
  protected readonly photos = signal<ReadonlyMap<string, string>>(new Map());

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.photos().forEach((url) => URL.revokeObjectURL(url));
    });
  }

  protected onOpenChange(open: boolean): void {
    const status = this.state().status;
    if (open && (status === 'idle' || status === 'error')) {
      void this.load();
    }
  }

  protected retry(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.state.set({ status: 'loading' });
    const gateway = new AdminDeliveryProcedureGateway(this.http, this.companyId());
    try {
      const view = await gateway.load(this.addressId());
      this.state.set({ status: 'ready', steps: view.steps });
      await Promise.all(view.steps.map((step) => this.loadPhoto(gateway, step)));
    } catch {
      this.state.set({ status: 'error' });
    }
  }

  /** Une photo illisible laisse l'étape sans image ; le texte reste lisible. */
  private async loadPhoto(
    gateway: AdminDeliveryProcedureGateway,
    step: DeliveryProcedureStepView,
  ): Promise<void> {
    if (step.photoRevision === null || this.photos().has(step.id)) {
      return;
    }
    try {
      const blob = await gateway.photo(this.addressId(), step.id, step.photoRevision);
      const url = URL.createObjectURL(blob);
      this.photos.update((photos) => new Map(photos).set(step.id, url));
    } catch {
      // Sans photo : l'étape se lit quand même.
    }
  }
}
