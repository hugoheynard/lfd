import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { PriceScopePayload } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldTextareaComponent,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { TarificationService } from '../tarification.service';

/** Ce qu'on archive : une règle par son identifiant, une limite par sa portée. */
export type ArchiveSubject =
  | { readonly kind: 'rule'; readonly id: string }
  | { readonly kind: 'floor'; readonly scope: PriceScopePayload };

/** Charge d'ouverture : quoi, comment l'appeler, et ce qu'elle disait. */
export interface ArchivePanelData {
  readonly subject: ArchiveSubject;
  /** Ce que l'écran appelle cette décision — « Promo de rentrée ». */
  readonly target: string;
  /** La décision en une phrase, pour qu'on sache ce qu'on est en train de ranger. */
  readonly summary: string;
}

/**
 * **Archiver une décision tarifaire, en disant pourquoi.**
 *
 * Un panneau plutôt qu'une confirmation en ligne, et c'est le motif qui le
 * justifie : « êtes-vous sûr ? » ne demande rien, alors que la seule question
 * utile six mois plus tard est **pourquoi**. Le nom, la phrase de la décision et
 * le champ tiennent ensemble — on voit ce qu'on range pendant qu'on l'explique.
 *
 * Le motif reste **facultatif**. L'exiger produirait des « ok » et des « . » :
 * des champs remplis qui n'apprennent rien tout en donnant l'illusion d'une
 * traçabilité. Écrit, il l'est parce que quelqu'un avait à dire.
 *
 * Et l'écran ne cache pas que le geste ne se défait pas : une règle archivée est
 * scellée, on n'en repose une qu'en tant que **nouvelle** décision, avec son
 * auteur et sa date.
 */
@Component({
  selector: 'app-archive-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, FoldTextareaComponent],
  templateUrl: './archive-panel.html',
  styleUrl: './archive-panel.scss',
})
export class ArchivePanel {
  private readonly tarification = inject(TarificationService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<ArchivePanelData | undefined>(undefined);

  protected readonly reason = signal('');
  protected readonly saving = signal(false);

  protected readonly target = computed(() => this.data()?.target ?? '');
  protected readonly summary = computed(() => this.data()?.summary ?? '');

  protected async submit(): Promise<void> {
    const data = this.data();
    if (data === undefined || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.archive(data);
      this.notify.success('Décision archivée. Le journal en garde la trace.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error, "La décision n'a pas pu être archivée.");
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }

  /** Un champ vide vaut « pas de motif », et non une chaîne vide en base. */
  private async archive(data: ArchivePanelData): Promise<void> {
    const written = this.reason().trim();
    const reason = written === '' ? null : written;
    if (data.subject.kind === 'rule') {
      await this.tarification.archiveRule(data.subject.id, reason);
      return;
    }
    await this.tarification.archiveFloor(data.subject.scope, reason);
  }
}
