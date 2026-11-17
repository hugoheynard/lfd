import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldNumberInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import type { WorkshopLine } from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

import { GestureIntents } from '../../../shared/gesture-intents';
import { serverMessageOf } from '../../server-message';
import { hourLabel } from '../../worksheet-day';
import { WorksheetService } from '../../worksheet.service';

/** Ce que le panneau rouge reçoit : la journée LUE et la ligne. */
export interface ProblemPanelData {
  readonly date: string;
  readonly line: WorkshopLine;
}

/**
 * **Le panneau rouge** (plan `documentation/fournil/plan-niveaux-de-suivi.md`,
 * § 3.4, § 3.10) — « Combien est réellement sorti ? », une raison si on veut.
 * Partagé par les lignes « toujours vert » et « simple ».
 *
 * Le champ part VIDE : l'écran n'invente pas de quantité, c'est l'équipe qui
 * compte. Le serveur pose le plafond, corrige ou complète les fournées et
 * sonne la cloche ; le panneau ne calcule rien.
 *
 * Il envoie lui-même, sous la clé d'une {@link GestureIntents} tenue par
 * contenu (quantité et raison) : un double appui rejoue la même intention, une
 * quantité corrigée après un refus en est une nouvelle. Un refus reste dans le
 * panneau ; un succès le ferme sur `true`, et la fiche relit.
 */
@Component({
  selector: 'app-workshop-problem-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './workshop-problem-panel.html',
  styleUrl: './workshop-problem-panel.scss',
})
export class WorkshopProblemPanel implements FoldPanelContent<ProblemPanelData> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<ProblemPanelData>();

  private readonly panel = inject(FoldPanelRef<boolean>);
  private readonly api = inject(WorksheetService);
  private readonly intents = new GestureIntents();

  protected readonly produced = signal<number | null>(null);
  protected readonly reason = signal('');
  protected readonly sending = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly byWeight = computed(() => this.data().line.saleUnit === 'weight');

  protected readonly quantityLabel = computed(() =>
    this.byWeight() ? 'Grammes réellement sortis' : 'Pièces réellement sorties',
  );

  /** « Au compte : 120 · déclaré sorti : 120 » — ce que la fiche sait, pas une proposition. */
  protected readonly hint = computed(() => {
    const line = this.data().line;
    return `Au compte : ${this.figure(line.quantity)} · déclaré sorti : ${this.figure(line.produced)}`;
  });

  /** Le rouge encore ouvert sur la ligne : un nouveau le remplace. */
  protected readonly open = computed(() => {
    const problem = this.data().line.problem ?? null;
    if (problem === null) {
      return null;
    }
    const at = hourLabel(problem.reportedAt);
    return `Déjà signalé${at === null ? '' : ` à ${at}`} : ${this.figure(problem.produced)} sur ${this.figure(problem.expected)}. Un nouveau signalement le remplace.`;
  });

  protected readonly valid = computed(() => {
    const produced = this.produced();
    return produced !== null && Number.isInteger(produced) && produced >= 0;
  });

  protected close(): void {
    this.panel.close();
  }

  protected async submit(): Promise<void> {
    const produced = this.produced();
    if (produced === null || !this.valid() || this.sending()) {
      return;
    }
    const { date, line } = this.data();
    const reason = this.reason().trim();
    const subject = `${date}|${line.sku}|${String(produced)}|${reason}`;
    this.sending.set(true);
    this.refusal.set(null);
    try {
      await this.api.reportProblem(
        date,
        line.sku,
        reason === '' ? { produced } : { produced, reason },
        this.intents.keyFor(subject),
      );
    } catch (error) {
      this.refusal.set(serverMessageOf(error));
      this.sending.set(false);
      return;
    }
    this.intents.done(subject);
    this.panel.close(true);
  }

  private figure(quantity: number): string {
    return saleQuantityLabel(quantity, this.data().line.saleUnit);
  }
}
