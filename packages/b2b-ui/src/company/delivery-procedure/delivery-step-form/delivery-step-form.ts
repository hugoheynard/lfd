import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldFieldsetComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import {
  DELIVERY_STEP_FORM_LABELS_FR,
  type DeliveryStepFormLabels,
} from '../delivery-procedure.labels';
import { stepIssueOf, type DeliveryStepDraft } from '../delivery-step-draft.model';
import { shrinkStepPhoto } from '../step-photo-canvas';

/** Pourquoi la photo choisie n'a pas été retenue. */
type PhotoRefusal = '' | 'too-heavy' | 'unreadable';

/**
 * Le **formulaire d'une étape** : titre, texte, photo. Il ne fait que le
 * brouillon — ni envoi, ni suppression : c'est l'éditeur qui écrit.
 *
 * La photo est allégée **au choix**, pas à l'envoi : l'aperçu montre ce qui
 * partira, et une photo refusée l'est tout de suite, devant celui qui la
 * choisit, plutôt qu'après l'attente d'un téléversement.
 */
@Component({
  selector: 'lfd-delivery-step-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldInputComponent,
    FoldTextareaComponent,
    FoldFieldsetComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './delivery-step-form.html',
  styleUrl: './delivery-step-form.scss',
})
export class DeliveryStepForm {
  readonly value = model.required<DeliveryStepDraft>();
  readonly labels = input<DeliveryStepFormLabels>(DELIVERY_STEP_FORM_LABELS_FR);
  /** L'image de la photo déjà enregistrée, quand le brouillon la garde. */
  readonly currentPhotoUrl = input<string | null>(null);

  protected readonly reducing = signal(false);
  protected readonly refusal = signal<PhotoRefusal>('');
  /** L'URL d'aperçu de la photo nouvellement choisie — révoquée dès qu'elle ne sert plus. */
  private readonly pickedUrl = signal<string | null>(null);

  protected readonly previewUrl = computed(() => {
    const photo = this.value().photo;
    if (photo.kind === 'picked') {
      return this.pickedUrl();
    }
    return photo.kind === 'kept' ? this.currentPhotoUrl() : null;
  });

  protected readonly hasPhoto = computed(() => this.value().photo.kind !== 'none');

  protected readonly titleHint = computed(() =>
    this.value().title.trim().length > 0 && stepIssueOf(this.value()) === 'title-too-long'
      ? this.labels().titleTooLong
      : this.labels().titleHint,
  );

  protected readonly bodyHint = computed(() =>
    stepIssueOf(this.value()) === 'body-too-long'
      ? this.labels().bodyTooLong
      : this.labels().bodyHint,
  );

  protected readonly refusalMessage = computed(() => {
    const refusal = this.refusal();
    if (refusal === 'too-heavy') {
      return this.labels().photoTooHeavy;
    }
    return refusal === 'unreadable' ? this.labels().photoUnreadable : '';
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.forgetPicked());
  }

  protected setTitle(title: string): void {
    this.value.update((draft) => ({ ...draft, title }));
  }

  protected setBody(body: string): void {
    this.value.update((draft) => ({ ...draft, body }));
  }

  /** Allège la photo choisie, puis la retient — ou dit pourquoi elle ne l'est pas. */
  protected async onPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    // Vidé tout de suite : rechoisir le même fichier doit redéclencher `change`.
    input.value = '';
    if (file === null) {
      return;
    }
    this.refusal.set('');
    this.reducing.set(true);
    try {
      const reduced = await shrinkStepPhoto(file);
      if (reduced.kind !== 'ready') {
        this.refusal.set(reduced.kind);
        return;
      }
      this.forgetPicked();
      this.pickedUrl.set(URL.createObjectURL(reduced.photo));
      this.value.update((draft) => ({ ...draft, photo: { kind: 'picked', photo: reduced.photo } }));
    } finally {
      this.reducing.set(false);
    }
  }

  protected removePhoto(): void {
    this.forgetPicked();
    this.refusal.set('');
    this.value.update((draft) => ({ ...draft, photo: { kind: 'none' } }));
  }

  private forgetPicked(): void {
    const url = this.pickedUrl();
    if (url !== null) {
      URL.revokeObjectURL(url);
      this.pickedUrl.set(null);
    }
  }
}
