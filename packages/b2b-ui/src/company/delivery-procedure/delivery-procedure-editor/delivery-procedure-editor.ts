import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { DeliveryProcedureStepView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDangerZoneComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import {
  DeliveryProcedureConflictError,
  DeliveryProcedureGateway,
  DeliveryProcedureWriteError,
} from '../delivery-procedure.gateway';
import {
  DELIVERY_PROCEDURE_EDITOR_LABELS_FR,
  type DeliveryProcedureEditorLabels,
} from '../delivery-procedure.labels';
import {
  canAddStep,
  EMPTY_DELIVERY_STEP_DRAFT,
  isStepDraftChanged,
  movedStepIds,
  newStepPhotoOf,
  photoChangeOf,
  stepDraftFrom,
  stepIssueOf,
  toStepFields,
  type DeliveryStepDraft,
} from '../delivery-step-draft.model';
import { DeliveryStepForm } from '../delivery-step-form/delivery-step-form';

/** Ce que montre l'éditeur : la liste, ou le formulaire d'une étape. */
type EditorMode =
  | { readonly kind: 'list' }
  | { readonly kind: 'add' }
  | { readonly kind: 'revise'; readonly step: DeliveryProcedureStepView };

/** Un retour d'écriture qui laisse le contenu à l'écran. */
interface EditorNotice {
  readonly variant: 'warning' | 'alert';
  readonly message: string;
}

/**
 * L'**éditeur de la procédure de livraison** d'une adresse : les étapes dans
 * l'ordre, leur photo, et les gestes qui les font évoluer.
 *
 * Il écrit lui-même, par le port {@link DeliveryProcedureGateway} que l'app
 * fournit : une procédure est une suite de petits gestes (monter, refaire,
 * supprimer), et renvoyer chacun vers un conteneur ferait écrire deux fois la
 * même chorégraphie — lire, écrire, relire — côté client et côté staff.
 *
 * **Chaque écriture est suivie d'une relecture.** Le réordonnancement n'est
 * pas appliqué d'avance à l'écran : si le serveur le refuse parce que la
 * procédure a changé entre-temps, l'écran ne doit pas avoir montré un ordre
 * qui n'a jamais existé.
 */
@Component({
  selector: 'lfd-delivery-procedure-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDangerZoneComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    DeliveryStepForm,
  ],
  templateUrl: './delivery-procedure-editor.html',
  styleUrl: './delivery-procedure-editor.scss',
})
export class DeliveryProcedureEditor {
  private readonly gateway = inject(DeliveryProcedureGateway);

  readonly addressId = input.required<string>();
  /** Sans, lecture seule : ni ajout, ni déplacement, ni correction. */
  readonly canEdit = input(false);
  readonly labels = input<DeliveryProcedureEditorLabels>(DELIVERY_PROCEDURE_EDITOR_LABELS_FR);

  /**
   * Le nombre d'étapes, à chaque fois qu'il change après la première lecture —
   * de quoi rafraîchir le « N étapes » affiché sous l'adresse.
   */
  readonly stepCountChange = output<number>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly steps = signal<readonly DeliveryProcedureStepView[]>([]);
  protected readonly mode = signal<EditorMode>({ kind: 'list' });
  protected readonly draft = signal<DeliveryStepDraft>(EMPTY_DELIVERY_STEP_DRAFT);
  protected readonly busy = signal(false);
  protected readonly notice = signal<EditorNotice | null>(null);

  /** Les vignettes, par `stepId@revision` → URL d'objet. */
  private readonly thumbs = signal<ReadonlyMap<string, string>>(new Map());
  private initialDraft: DeliveryStepDraft = EMPTY_DELIVERY_STEP_DRAFT;
  private knownCount: number | null = null;
  private destroyed = false;

  protected readonly canAdd = computed(() => this.canEdit() && canAddStep(this.steps().length));
  protected readonly atLimit = computed(() => this.canEdit() && !canAddStep(this.steps().length));

  /** L'étape refaite, ou `null` en liste comme en ajout. */
  protected readonly revising = computed(() => {
    const mode = this.mode();
    return mode.kind === 'revise' ? mode.step : null;
  });

  protected readonly formHeading = computed(() => {
    const step = this.revising();
    return step === null ? this.labels().newStepHeading : this.labels().reviseHeading(step.number);
  });

  protected readonly canSubmit = computed(
    () =>
      stepIssueOf(this.draft()) === '' &&
      (this.mode().kind === 'add' || isStepDraftChanged(this.draft(), this.initialDraft)),
  );

  /** L'image de la photo enregistrée de l'étape refaite. */
  protected readonly currentPhotoUrl = computed(() => {
    const step = this.revising();
    return step === null ? null : this.thumbOf(step);
  });

  constructor() {
    effect(() => {
      this.addressId();
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

  protected thumbOf(step: DeliveryProcedureStepView): string | null {
    return step.photoRevision === null
      ? null
      : (this.thumbs().get(thumbKey(step.id, step.photoRevision)) ?? null);
  }

  protected retry(): void {
    this.state.set('loading');
    void this.load();
  }

  protected openAdd(): void {
    this.openForm({ kind: 'add' }, EMPTY_DELIVERY_STEP_DRAFT);
  }

  protected openRevise(step: DeliveryProcedureStepView): void {
    this.openForm({ kind: 'revise', step }, stepDraftFrom(step));
  }

  protected cancel(): void {
    this.notice.set(null);
    this.mode.set({ kind: 'list' });
  }

  protected move(step: DeliveryProcedureStepView, offset: -1 | 1): void {
    const stepIds = movedStepIds(this.steps(), step.id, offset);
    if (stepIds !== null) {
      void this.write(() => this.gateway.reorder(this.addressId(), stepIds));
    }
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    const draft = this.draft();
    const step = this.revising();
    const addressId = this.addressId();
    void this.write(() =>
      step === null
        ? this.gateway.addStep(addressId, toStepFields(draft), newStepPhotoOf(draft))
        : this.gateway.reviseStep(
            addressId,
            step.id,
            toStepFields(draft),
            photoChangeOf(draft, this.initialDraft),
          ),
    );
  }

  protected remove(step: DeliveryProcedureStepView): void {
    void this.write(() => this.gateway.removeStep(this.addressId(), step.id));
  }

  private openForm(mode: EditorMode, draft: DeliveryStepDraft): void {
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
      if (error instanceof DeliveryProcedureConflictError) {
        this.mode.set({ kind: 'list' });
        this.notice.set({ variant: 'warning', message: this.labels().conflict });
        await this.load();
      } else {
        const message =
          error instanceof DeliveryProcedureWriteError ? error.message : this.labels().writeFailed;
        this.notice.set({ variant: 'alert', message });
      }
    } finally {
      this.busy.set(false);
    }
  }

  private async load(): Promise<void> {
    const addressId = this.addressId();
    try {
      const view = await this.gateway.load(addressId);
      if (this.destroyed || addressId !== this.addressId()) {
        return;
      }
      this.apply(view.steps);
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

  private apply(steps: readonly DeliveryProcedureStepView[]): void {
    this.steps.set(steps);
    if (this.knownCount !== null && this.knownCount !== steps.length) {
      this.stepCountChange.emit(steps.length);
    }
    this.knownCount = steps.length;
    this.syncThumbs(steps);
  }

  /**
   * Garde les vignettes encore montrées, révoque les autres, va chercher les
   * nouvelles. La clé porte la révision : une photo remplacée est une autre image.
   */
  private syncThumbs(steps: readonly DeliveryProcedureStepView[]): void {
    const wanted = new Map<string, DeliveryProcedureStepView>();
    for (const step of steps) {
      if (step.photoRevision !== null) {
        wanted.set(thumbKey(step.id, step.photoRevision), step);
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
    wanted.forEach((step, key) => {
      if (!kept.has(key)) {
        void this.fetchThumb(key, step);
      }
    });
  }

  private async fetchThumb(key: string, step: DeliveryProcedureStepView): Promise<void> {
    if (step.photoRevision === null) {
      return;
    }
    let blob: Blob;
    try {
      blob = await this.gateway.photo(this.addressId(), step.id, step.photoRevision);
    } catch {
      // Sans vignette, l'étape se lit encore : titre et texte portent la consigne.
      return;
    }
    if (this.destroyed || this.thumbs().has(key)) {
      return;
    }
    const url = URL.createObjectURL(blob);
    this.thumbs.update((thumbs) => new Map(thumbs).set(key, url));
  }
}

function thumbKey(stepId: string, revision: string): string {
  return `${stepId}@${revision}`;
}
