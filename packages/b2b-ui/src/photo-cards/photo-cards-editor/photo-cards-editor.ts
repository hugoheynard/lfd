import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDangerZoneComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  type FoldIconName,
  FoldLoadingStateComponent,
} from 'fold-ng';

import {
  canAddCard,
  EMPTY_PHOTO_CARD_DRAFT,
  isPhotoCardDraftChanged,
  movedCardIds,
  newPhotoOf,
  photoCardChangeOf,
  photoCardDraftFrom,
  photoCardIssueOf,
  toPhotoCardFields,
  type PhotoCardDraft,
  type PhotoCardLimits,
} from '../photo-card-draft.model';
import { PhotoCardFormSlot, type PhotoCardFormContext } from '../photo-card-form-slot';
import {
  PhotoCardsConflictError,
  PhotoCardsGateway,
  PhotoCardsWriteError,
  type PhotoCardView,
} from '../photo-cards.gateway';
import type { PhotoCardsEditorLabels } from '../photo-cards.labels';

/** Ce que montre l'éditeur : la liste, ou le formulaire d'une carte. */
type EditorMode<C> =
  | { readonly kind: 'list' }
  | { readonly kind: 'add' }
  | { readonly kind: 'revise'; readonly card: C };

/** Un retour d'écriture qui laisse le contenu à l'écran. */
interface EditorNotice {
  readonly variant: 'warning' | 'alert';
  readonly message: string;
}

/** Où paraît le geste d'ajout : du côté où la carte neuve arrivera. */
export type PhotoCardAddSide = 'start' | 'end';

/**
 * L'**éditeur d'une liste ordonnée de cartes photo** : les cartes dans l'ordre,
 * leur photo, et les gestes qui les font évoluer — ajouter, monter, descendre,
 * refaire, supprimer après confirmation. Liste et formulaire partagent la même
 * place : on ne quitte jamais la carte qu'on édite.
 *
 * Il écrit lui-même, par le port {@link PhotoCardsGateway} que l'usage lui
 * passe déjà lié à son propriétaire : une liste est une suite de petits gestes,
 * et renvoyer chacun vers un conteneur ferait écrire à chaque usage la même
 * chorégraphie — lire, écrire, relire.
 *
 * **Chaque écriture est suivie d'une relecture.** Le réordonnancement n'est
 * pas appliqué d'avance à l'écran : si le serveur le refuse parce que la liste
 * a changé entre-temps, l'écran ne doit pas avoir montré un ordre qui n'a
 * jamais existé. Changer de passerelle recharge.
 *
 * Le formulaire est projeté ({@link PhotoCardFormSlot}) : c'est celui de l'usage.
 */
@Component({
  selector: 'lfd-photo-cards-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDangerZoneComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './photo-cards-editor.html',
  styleUrl: './photo-cards-editor.scss',
})
export class PhotoCardsEditor<C extends PhotoCardView = PhotoCardView> {
  readonly gateway = input.required<PhotoCardsGateway<C>>();
  readonly labels = input.required<PhotoCardsEditorLabels<C>>();
  readonly limits = input.required<PhotoCardLimits>();
  /** L'icône de l'état vide. */
  readonly emptyIcon = input.required<FoldIconName>();
  readonly addSide = input<PhotoCardAddSide>('end');
  /** Sans, lecture seule : ni ajout, ni déplacement, ni correction. */
  readonly canEdit = input(false);

  /** Le nombre de cartes, à chaque fois qu'il change après la première lecture. */
  readonly countChange = output<number>();

  protected readonly formSlot = contentChild.required(PhotoCardFormSlot);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly cards = signal<readonly C[]>([]);
  protected readonly mode = signal<EditorMode<C>>({ kind: 'list' });
  protected readonly draft = signal<PhotoCardDraft>(EMPTY_PHOTO_CARD_DRAFT);
  protected readonly busy = signal(false);
  protected readonly notice = signal<EditorNotice | null>(null);

  /** Les vignettes, par `cardId@revision` → URL d'objet. */
  private readonly thumbs = signal<ReadonlyMap<string, string>>(new Map());
  private initialDraft: PhotoCardDraft = EMPTY_PHOTO_CARD_DRAFT;
  private knownCount: number | null = null;
  private destroyed = false;

  protected readonly canAdd = computed(
    () => this.canEdit() && canAddCard(this.cards().length, this.limits()),
  );
  protected readonly atLimit = computed(
    () => this.canEdit() && !canAddCard(this.cards().length, this.limits()),
  );

  /** La carte refaite, ou `null` en liste comme en ajout. */
  protected readonly revising = computed(() => {
    const mode = this.mode();
    return mode.kind === 'revise' ? mode.card : null;
  });

  protected readonly formHeading = computed(() => {
    const card = this.revising();
    return card === null ? this.labels().newHeading : this.labels().reviseHeading(card);
  });

  protected readonly canSubmit = computed(
    () =>
      photoCardIssueOf(this.draft(), this.limits()) === '' &&
      (this.mode().kind === 'add' || isPhotoCardDraftChanged(this.draft(), this.initialDraft)),
  );

  /** L'image de la photo enregistrée de la carte refaite. */
  protected readonly currentPhotoUrl = computed(() => {
    const card = this.revising();
    return card === null ? null : this.thumbOf(card);
  });

  protected readonly formContext: PhotoCardFormContext = {
    $implicit: { draft: this.draft, currentPhotoUrl: this.currentPhotoUrl },
  };

  constructor() {
    effect(() => {
      this.gateway();
      untracked(() => {
        this.state.set('loading');
        this.knownCount = null;
        void this.load();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.thumbs().forEach((url) => URL.revokeObjectURL(url));
    });
  }

  protected thumbOf(card: C): string | null {
    return card.photoRevision === null
      ? null
      : (this.thumbs().get(thumbKey(card.id, card.photoRevision)) ?? null);
  }

  protected retry(): void {
    this.state.set('loading');
    void this.load();
  }

  protected openAdd(): void {
    this.openForm({ kind: 'add' }, EMPTY_PHOTO_CARD_DRAFT);
  }

  protected openRevise(card: C): void {
    this.openForm({ kind: 'revise', card }, photoCardDraftFrom(card));
  }

  protected cancel(): void {
    this.notice.set(null);
    this.mode.set({ kind: 'list' });
  }

  protected move(card: C, offset: -1 | 1): void {
    const cardIds = movedCardIds(this.cards(), card.id, offset);
    if (cardIds !== null) {
      const gateway = this.gateway();
      void this.write(() => gateway.reorder(cardIds));
    }
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    const draft = this.draft();
    const card = this.revising();
    const gateway = this.gateway();
    void this.write(() =>
      card === null
        ? gateway.add(toPhotoCardFields(draft), newPhotoOf(draft))
        : gateway.revise(
            card.id,
            toPhotoCardFields(draft),
            photoCardChangeOf(draft, this.initialDraft),
          ),
    );
  }

  protected remove(card: C): void {
    const gateway = this.gateway();
    void this.write(() => gateway.remove(card.id));
  }

  private openForm(mode: EditorMode<C>, draft: PhotoCardDraft): void {
    this.notice.set(null);
    this.initialDraft = draft;
    this.draft.set(draft);
    this.mode.set(mode);
  }

  /**
   * Écrit, puis relit. Un conflit ramène à la liste rechargée en le disant ;
   * un autre refus laisse le formulaire ouvert, saisie comprise.
   */
  private async write(work: () => Promise<unknown>): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.notice.set(null);
    try {
      await work();
      this.mode.set({ kind: 'list' });
      await this.load();
    } catch (error) {
      if (error instanceof PhotoCardsConflictError) {
        this.mode.set({ kind: 'list' });
        this.notice.set({ variant: 'warning', message: this.labels().conflict });
        await this.load();
      } else {
        const message =
          error instanceof PhotoCardsWriteError ? error.message : this.labels().writeFailed;
        this.notice.set({ variant: 'alert', message });
      }
    } finally {
      this.busy.set(false);
    }
  }

  private async load(): Promise<void> {
    const gateway = this.gateway();
    try {
      const cards = await gateway.load();
      if (this.destroyed || gateway !== this.gateway()) {
        return;
      }
      this.apply(cards);
      this.state.set('ready');
    } catch {
      if (this.state() === 'ready') {
        // La liste d'avant reste à l'écran : c'est un échec partiel, pas une page perdue.
        this.notice.set({ variant: 'alert', message: this.labels().loadError });
      } else {
        this.state.set('error');
      }
    }
  }

  private apply(cards: readonly C[]): void {
    this.cards.set(cards);
    if (this.knownCount !== null && this.knownCount !== cards.length) {
      this.countChange.emit(cards.length);
    }
    this.knownCount = cards.length;
    this.syncThumbs(cards);
  }

  /**
   * Garde les vignettes encore montrées, révoque les autres, va chercher les
   * nouvelles. La clé porte la révision : une photo remplacée est une autre image.
   */
  private syncThumbs(cards: readonly C[]): void {
    const wanted = new Map<string, C>();
    for (const card of cards) {
      if (card.photoRevision !== null) {
        wanted.set(thumbKey(card.id, card.photoRevision), card);
      }
    }
    const kept = new Map<string, string>();
    this.thumbs().forEach((url, key) => {
      if (wanted.has(key)) {
        kept.set(key, url);
      } else {
        URL.revokeObjectURL(url);
      }
    });
    this.thumbs.set(kept);
    wanted.forEach((card, key) => {
      if (!kept.has(key)) {
        void this.fetchThumb(key, card);
      }
    });
  }

  private async fetchThumb(key: string, card: C): Promise<void> {
    if (card.photoRevision === null) {
      return;
    }
    let blob: Blob;
    try {
      blob = await this.gateway().photo(card.id, card.photoRevision);
    } catch {
      // Sans vignette, la carte se lit encore : titre et texte portent l'essentiel.
      return;
    }
    if (this.destroyed || this.thumbs().has(key)) {
      return;
    }
    const url = URL.createObjectURL(blob);
    this.thumbs.update((thumbs) => new Map(thumbs).set(key, url));
  }
}

function thumbKey(cardId: string, revision: string): string {
  return `${cardId}@${revision}`;
}
