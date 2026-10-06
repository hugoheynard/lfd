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
  photoCardFieldIssuesOf,
  type PhotoCardDraft,
  type PhotoCardLimits,
} from '../photo-card-draft.model';
import type { PhotoCardFormLabels } from '../photo-cards.labels';
import type { PhotoReductionPolicy } from '../photo-reduction';
import { shrinkPhoto } from '../photo-reduction-canvas';

/** Pourquoi la photo choisie n'a pas été retenue. */
type PhotoRefusal = '' | 'too-heavy' | 'unreadable';

/**
 * Le **formulaire d'une carte photo** : titre, texte, photo. Il ne fait que le
 * brouillon — ni envoi, ni suppression : c'est l'éditeur qui écrit.
 *
 * La photo est allégée **au choix**, pas à l'envoi : l'aperçu montre ce qui
 * partira, et une photo refusée l'est tout de suite, devant celui qui la
 * choisit, plutôt qu'après l'attente d'un téléversement.
 *
 * Bornes, politique de réduction et libellés sont ceux de l'usage : rien n'a
 * de défaut ici.
 */
@Component({
  selector: 'lfd-photo-card-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldInputComponent,
    FoldTextareaComponent,
    FoldFieldsetComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './photo-card-form.html',
  styleUrl: './photo-card-form.scss',
})
export class PhotoCardForm {
  readonly value = model.required<PhotoCardDraft>();
  readonly labels = input.required<PhotoCardFormLabels>();
  readonly limits = input.required<PhotoCardLimits>();
  readonly photoPolicy = input.required<PhotoReductionPolicy>();
  /** L'image de la photo déjà enregistrée, quand le brouillon la garde. */
  readonly currentPhotoUrl = input<string | null>(null);
  /**
   * L'image de la photo enregistrée n'a pas pu être lue : le formulaire le dit
   * au lieu de proposer « Remplacer » à côté d'un cadre vide.
   */
  readonly currentPhotoUnavailable = input(false);

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

  private readonly issues = computed(() => photoCardFieldIssuesOf(this.value(), this.limits()));

  /** Le titre a-t-il été quitté une fois ? Un titre vide ne se reproche qu'à partir de là. */
  protected readonly titleTouched = signal(false);

  /**
   * Un titre trop long se dit tout de suite, pendant la frappe ; un titre
   * vide, seulement une fois le champ quitté — l'ouverture d'un formulaire
   * neuf ne commence pas par un reproche.
   */
  protected readonly titleErrorShown = computed(
    () => this.issues().title === 'title-too-long' || this.titleTouched(),
  );

  protected readonly titleErrors = computed(() => {
    const issue = this.issues().title;
    if (issue === 'title-required') {
      return [fieldError(this.labels().titleRequired)];
    }
    return issue === 'title-too-long' ? [fieldError(this.labels().titleTooLong)] : NO_ERRORS;
  });

  protected readonly bodyErrors = computed(() =>
    this.issues().body === 'body-too-long' ? [fieldError(this.labels().bodyTooLong)] : NO_ERRORS,
  );

  /** La photo enregistrée est gardée, mais son image n'est pas (encore) là. */
  protected readonly keptWithoutPreview = computed(
    () => this.value().photo.kind === 'kept' && this.currentPhotoUrl() === null,
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
      const reduced = await shrinkPhoto(file, this.photoPolicy());
      if (reduced.kind !== 'ready') {
        this.refusal.set(reduced.kind);
        return;
      }
      this.forgetPicked();
      this.pickedUrl.set(URL.createObjectURL(reduced.photo));
      const { photo, thumbnail } = reduced;
      this.value.update((draft) => ({
        ...draft,
        photo:
          thumbnail === undefined
            ? { kind: 'picked', photo }
            : { kind: 'picked', photo, thumbnail },
      }));
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

/** La forme qu'attend `[errors]` de `fold-input` / `fold-textarea`, réduite à ce qu'on lui donne. */
interface FieldError {
  readonly kind: string;
  readonly message: string;
}

const NO_ERRORS: readonly FieldError[] = [];

/** Une erreur de saisie, dite sous son champ. */
function fieldError(message: string): FieldError {
  return { kind: 'client', message };
}
