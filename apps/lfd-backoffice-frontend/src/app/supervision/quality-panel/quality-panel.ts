import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import type { QualityCheckView, QualityVerdictCode } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { requiredError } from '@angular/forms/signals';
import type { FoldTimelineNode } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldFileDropzoneComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSpinnerComponent,
  FoldTextareaComponent,
  FoldTimelineComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { ulid } from '../../shared/ulid';
import { afterFailure, type ColumnState, LOADING, ready } from '../column-state';
import {
  type QualityBadge,
  type QualityRequest,
  VERDICT_LABELS,
  VERDICT_VARIANTS,
} from '../quality-badges';
import {
  blockingImpact,
  blockReason,
  bylineOf,
  canRender,
  currentBadge,
  type DraftPhoto,
  historyOf,
  NOTE_TAGS,
  noteRequired,
  photoRefusal,
  roomFor,
  saveLabel,
  uploadIdsOf,
  VERDICT_CONSEQUENCES,
  VERDICT_GLYPHS,
  withTag,
} from '../quality-draft';
import { QualityPhoto } from '../quality-photo/quality-photo';
import { QualityService } from '../quality.service';

/** Ce que la page passe au panneau : la journée, la cible et ses mots. */
export interface QualityPanelData extends QualityRequest {
  readonly serviceDay: string;
  /** La pastille de la cible À L'ÉCRAN, reprise sans recalcul (cf. `currentBadge`). */
  readonly current?: QualityBadge | null;
  /** Les clients dont une commande attend cette ligne — ce qu'un blocage retient. */
  readonly awaitedBy?: readonly string[];
}

const VERDICTS: readonly QualityVerdictCode[] = ['ok', 'warning', 'blocking'];

/**
 * **Le panneau de contrôle** (`plan-controle-qualite.md`, §5, D8) — le seul
 * geste de la Supervision : elle n'agit pas sur la commande, elle la juge.
 *
 * Trois choix, la note (obligatoire dès la réserve), des photos facultatives
 * déposées dès qu'elles sont choisies, et l'historique des verdicts de la
 * cible. Ouvert seulement à qui a `b2b_supervision:write` : l'historique, notes
 * et photos comprises, se lit donc ici sans autre garde.
 *
 * 🔴 L'`id` du contrôle est tiré UNE fois, à l'ouverture : un double clic, ou
 * un nouvel essai après une coupure réseau, rejoue le même `id`, et le serveur
 * rend le contrôle déjà écrit au lieu d'en créer un second.
 */
@Component({
  selector: 'app-quality-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldFileDropzoneComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldSpinnerComponent,
    FoldTextareaComponent,
    FoldTimelineComponent,
    QualityPhoto,
  ],
  templateUrl: './quality-panel.html',
  styleUrl: './quality-panel.scss',
})
export class QualityPanel implements OnInit {
  private readonly service = inject(QualityService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<QualityPanelData | undefined>(undefined);

  /** La clé d'idempotence — une par ouverture, jamais retirée. */
  private readonly id = ulid();
  private nextKey = 0;

  protected readonly verdicts = VERDICTS;
  protected readonly verdictLabels = VERDICT_LABELS;
  protected readonly verdictVariants = VERDICT_VARIANTS;
  protected readonly consequences = VERDICT_CONSEQUENCES;
  protected readonly tags = NOTE_TAGS;
  protected readonly glyphs = VERDICT_GLYPHS;

  /** Rien d'avance : un OK présélectionné s'enregistre d'un clic distrait. */
  protected readonly verdict = signal<QualityVerdictCode | null>(null);
  protected readonly note = signal('');
  protected readonly photos = signal<readonly DraftPhoto[]>([]);
  protected readonly saving = signal(false);
  /** Le refus du serveur, dit DANS le panneau, qui reste ouvert. */
  protected readonly refusal = signal<string | null>(null);
  /** Des photos choisies au-delà de six, laissées de côté. */
  protected readonly overflow = signal(false);

  protected readonly history = signal<ColumnState<readonly QualityCheckView[]>>(LOADING);

  protected readonly historyChecks = computed<readonly QualityCheckView[]>(() => {
    const state = this.history();
    return state.status === 'ready' ? state.data : [];
  });

  protected readonly noteRequired = computed(() => noteRequired(this.verdict()));
  protected readonly reason = computed(() => blockReason(this.verdict(), this.note()));
  protected readonly saveLabel = computed(() => saveLabel(this.verdict()));
  /** Le champ vide d'une note obligatoire se dit en alerte, sans attendre le clic. */
  protected readonly noteErrors = computed(() =>
    this.noteRequired() && this.note().trim() === ''
      ? [requiredError({ message: 'Dites ce qui ne va pas.' })]
      : [],
  );

  protected readonly eyebrow = computed(
    () => `Contrôler · ${this.data()?.target.kind === 'order' ? 'commande' : 'ligne du four'}`,
  );
  /** La pastille de la cible, « Actuel · … » ; `undefined` : rien à montrer. */
  protected readonly current = computed(() => currentBadge(this.data()?.current));
  protected readonly impact = computed(() => {
    const data = this.data();
    return data === undefined ? '' : blockingImpact(data.target, data.title, data.awaitedBy ?? []);
  });
  protected readonly nodes = computed<readonly FoldTimelineNode[]>(() =>
    this.historyChecks().map((check) => ({
      key: check.id,
      id: null,
      clickable: false,
      label: VERDICT_LABELS[check.verdict],
    })),
  );
  protected readonly room = computed(() => roomFor(this.photos()));
  protected readonly uploading = computed(() =>
    this.photos().some((photo) => photo.status === 'uploading'),
  );
  protected readonly canSave = computed(
    () => !this.saving() && canRender(this.verdict(), this.note(), this.photos()),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.photos().forEach((photo) => URL.revokeObjectURL(photo.preview));
    });
  }

  /** Les entrées sont posées par l'hôte avant l'initialisation : `data` est lisible ici. */
  ngOnInit(): void {
    void this.loadHistory();
  }

  protected addTag(tag: string): void {
    this.note.update((note) => withTag(note, tag));
  }

  protected checkOf(key: string): QualityCheckView | undefined {
    return this.historyChecks().find((check) => check.id === key);
  }

  protected async loadHistory(): Promise<void> {
    const data = this.data();
    if (data === undefined) {
      return;
    }
    if (this.history().status === 'error') {
      this.history.set(LOADING);
    }
    try {
      const view = await this.service.checks(data.serviceDay);
      this.history.set(ready(historyOf(view.checks, data.target)));
    } catch {
      this.history.update(afterFailure);
    }
  }

  /** Chaque photo part dès qu'elle est choisie ; au-delà de six, elle est laissée de côté. */
  protected pick(files: readonly File[]): void {
    const kept = files.slice(0, this.room());
    this.overflow.set(kept.length < files.length);
    for (const file of kept) {
      const key = this.nextKey++;
      const preview = URL.createObjectURL(file);
      const refused = photoRefusal(file);
      if (refused !== null) {
        this.photos.update((all) => [...all, { key, preview, status: 'failed', reason: refused }]);
        continue;
      }
      this.photos.update((all) => [...all, { key, preview, status: 'uploading' }]);
      void this.deposit(key, preview, file);
    }
  }

  /** Une photo prise sur le moment : même chemin que la zone de dépôt. */
  protected pickFromCamera(input: HTMLInputElement): void {
    this.pick(Array.from(input.files ?? []));
    // Vidé, sinon reprendre la même photo ne déclencherait pas `change`.
    input.value = '';
  }

  /** Retirée avant enregistrement : le dépôt reste orphelin, et le balayage l'efface (D8). */
  protected remove(key: number): void {
    const photo = this.photos().find((candidate) => candidate.key === key);
    if (photo !== undefined) {
      URL.revokeObjectURL(photo.preview);
    }
    this.photos.update((all) => all.filter((candidate) => candidate.key !== key));
    this.overflow.set(false);
  }

  protected async save(): Promise<void> {
    const data = this.data();
    const verdict = this.verdict();
    if (data === undefined || verdict === null || !this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      const note = this.note().trim();
      await this.service.render({
        id: this.id,
        serviceDay: data.serviceDay,
        target: data.target,
        verdict,
        note: note === '' ? null : note,
        uploadIds: uploadIdsOf(this.photos()),
      });
      this.notify.success(`Contrôle enregistré : ${VERDICT_LABELS[verdict]}.`);
      this.ref.close(true);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "Le contrôle n'a pas pu être enregistré."));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected byline(check: QualityCheckView): string {
    const latest = this.historyChecks()[0]?.id === check.id;
    return bylineOf(check, latest ? (this.data()?.current?.detail ?? null) : null);
  }

  private async deposit(key: number, preview: string, file: File): Promise<void> {
    let next: DraftPhoto;
    try {
      next = { key, preview, status: 'ready', uploadId: await this.service.deposit(file) };
    } catch (error) {
      next = {
        key,
        preview,
        status: 'failed',
        reason: httpErrorMessage(error, "La photo n'a pas pu être déposée."),
      };
    }
    // Retirée pendant le dépôt : elle ne revient pas.
    this.photos.update((all) => all.map((photo) => (photo.key === key ? next : photo)));
  }
}
