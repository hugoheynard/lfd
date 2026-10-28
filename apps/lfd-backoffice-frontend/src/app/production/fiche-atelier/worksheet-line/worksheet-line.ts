import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldMeterComponent,
  type FoldMeterSegment,
} from 'fold-ng';

import type { WorkshopBatch, WorkshopLine, WorkshopShortcutView } from '@lfd/contracts';

import { lineBadge } from '../../../supervision/quality-badges';
import { BatchChips } from '../batch-chips/batch-chips';
import {
  beforeLabel,
  clockLabel,
  currentStep,
  isLate,
  lateMinutes,
  stepRemaining,
  steps,
} from '../workshop-deadlines';
import { WorkshopKeypadOpener } from '../workshop-keypad-opener';

/** Paliers par rangée de la barre, au plus. */
const STEPS_PER_ROW = 2;

/**
 * Part minimale d'un palier dans sa rangée : en dessous, son segment (largeur
 * proportionnelle, plancher de 96 px dans fold-meter) coupe son libellé.
 */
const MIN_ROW_SHARE = 1 / 3;

/**
 * **Une ligne de la fiche, vue par produit** (plan
 * `documentation/fournil/plan-fournee-v3.md` §4.2–4.7).
 *
 * À gauche, le **reste du palier en cours** en gros, son heure et le total ; au
 * milieu, le nom, le contenant et les pastilles (retard, ce qui presse,
 * contrôle) ; puis la barre à paliers ; à droite, « + 1 plaque » — le geste
 * principal — et « Saisir », qui ouvre le pavé.
 *
 * 🔴 **Un seul gabarit pour les deux supports** : c'est la feuille de style du
 * parent qui range (jetons `--fa-*`), jamais une branche du template.
 *
 * **La ligne ne décide rien.** Elle remonte une quantité ou une fournée à
 * annuler ; le parent envoie, et la barre avance à la relecture.
 */
@Component({
  selector: 'app-worksheet-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BatchChips, FoldBadgeComponent, FoldButtonComponent, FoldMeterComponent],
  templateUrl: './worksheet-line.html',
  styleUrl: './worksheet-line.scss',
  host: {
    '[class.is-done]': 'line().done',
    '[class.is-late]': 'late()',
    '[class.is-waiting]': 'waiting() !== null',
  },
})
export class WorksheetLine {
  readonly line = input.required<WorkshopLine>();

  /** Les raccourcis du produit (S2) : discrets ici, en touches dans le pavé. */
  readonly shortcuts = input<readonly WorkshopShortcutView[]>([]);

  /** Un geste de cette ligne est en vol : tout est désarmé le temps de l'envoi. */
  readonly busy = input(false);

  /** « Maintenant », en minutes depuis minuit — l'horloge de la fiche. */
  readonly now = input.required<number>();

  readonly recorded = output<number>();
  readonly cancelled = output<WorkshopBatch>();

  private readonly keypad = inject(WorkshopKeypadOpener);

  private readonly steps = computed(() => steps(this.line()));
  private readonly current = computed(() => currentStep(this.line(), this.line().produced));

  protected readonly late = computed(
    () => !this.line().done && isLate(this.current(), this.line().produced, this.now()),
  );

  protected readonly lateLabel = computed(
    () => `En retard · ${String(lateMinutes(this.current(), this.now()))} min`,
  );

  /** Le chiffre en gros : le manque du palier en cours. */
  protected readonly stepLeft = computed(() => stepRemaining(this.line(), this.line().produced));

  /** « / 120 », seulement quand la ligne porte plusieurs paliers. */
  protected readonly stepOf = computed(() => {
    const current = this.current();
    return current !== null && this.steps().length > 1 ? `/ ${String(current.q)}` : null;
  });

  protected readonly stepBefore = computed(() => beforeLabel(this.current()?.before ?? null));

  protected readonly container = computed(() => {
    const container = this.line().container;
    return container === null
      ? 'pas de contenant réglé'
      : `${container.singular} de ${String(container.unitsPerContainer)}`;
  });

  protected readonly quickLabel = computed(() => {
    const container = this.line().container;
    return container === null ? null : `+ 1 ${container.singular}`;
  });

  /**
   * Les raccourcis montrés sur la ligne, sans celui qui vaut un contenant :
   * « + 1 plaque » le dit déjà (Hugo, 2026-10-28 — un doublon). Le pavé
   * dédoublonne de son côté.
   */
  /** Les pièces sorties au-delà du besoin. */
  protected readonly bonus = computed(() =>
    Math.max(0, this.line().produced - this.line().quantity),
  );

  protected readonly lineShortcuts = computed(() => {
    const units = this.line().container?.unitsPerContainer ?? null;
    return this.shortcuts().filter((shortcut) => shortcut.pieces !== units);
  });

  protected readonly waiting = computed(() => {
    const waiting = this.line().waitingOrders ?? null;
    if (waiting === null || this.line().done) {
      return null;
    }
    const plural = waiting.count > 1;
    const said = `${String(waiting.count)} commande${plural ? 's' : ''} attend${plural ? 'ent' : ''}`;
    return waiting.earliestHandover === null
      ? said
      : `${said} · remise ${clockLabel(waiting.earliestHandover)}`;
  });

  protected readonly quality = computed(() => {
    const status = this.line().quality ?? null;
    return status === null ? null : lineBadge(status);
  });

  protected readonly meterLabel = computed(() => `${this.line().productName} — pièces sorties`);

  /** La barre à paliers : un segment par palier, large de sa quantité (SPEC §3). */
  protected readonly segments = computed<readonly FoldMeterSegment[]>(() => {
    const produced = this.line().produced;
    const current = this.current();
    return this.steps().map((step) => {
      const met = produced >= step.to;
      const isCurrent = step === current;
      const tone = met ? 'success' : isCurrent ? (this.late() ? 'alert' : 'accent') : 'muted';
      return {
        value: Math.max(0, Math.min(step.q, produced - step.from)),
        max: step.q,
        tone,
        current: isCurrent,
        label: `${met ? '✓ ' : ''}${String(step.q)} ${beforeLabel(step.before)}`,
      };
    });
  });

  /**
   * Les paliers, deux par rangée au plus (Hugo, 2026-10-28 : un libellé ne doit
   * jamais être coupé). Un palier trop petit à côté de son voisin passe seul
   * sur sa rangée, pour que son segment garde la place de son libellé.
   */
  protected readonly segmentRows = computed(() => rowsOf(this.segments()));

  protected addContainer(): void {
    const container = this.line().container;
    if (container !== null) {
      this.recorded.emit(container.unitsPerContainer);
    }
  }

  /** Ouvre le pavé, prérempli du manque du palier (ou de `preset`, un raccourci). */
  protected async openKeypad(preset?: number): Promise<void> {
    const quantity = await this.keypad.openFor(
      this.line(),
      preset ?? this.stepLeft(),
      this.shortcuts(),
    );
    if (quantity !== null && !this.busy()) {
      this.recorded.emit(quantity);
    }
  }
}

/** Range les segments en rangées : deux au plus, aucun sous sa part minimale. */
export function rowsOf(segments: readonly FoldMeterSegment[]): (readonly FoldMeterSegment[])[] {
  const rows: FoldMeterSegment[][] = [];
  for (const segment of segments) {
    const row = rows.at(-1);
    if (row !== undefined && row.length < STEPS_PER_ROW && fits([...row, segment])) {
      row.push(segment);
    } else {
      rows.push([segment]);
    }
  }
  return rows;
}

function fits(row: readonly FoldMeterSegment[]): boolean {
  const total = row.reduce((sum, segment) => sum + segment.max, 0);
  return row.every((segment) => segment.max / total >= MIN_ROW_SHARE);
}
