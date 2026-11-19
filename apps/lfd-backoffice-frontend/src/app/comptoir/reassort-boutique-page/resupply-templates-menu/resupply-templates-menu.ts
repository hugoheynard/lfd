import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import type {
  ResupplyArticleView,
  ResupplyTarget,
  ResupplyTemplateApplyMode,
  ResupplyTemplateContentPayload,
  ResupplyTemplateLine,
  ResupplyTemplateLineView,
  ResupplyTemplateView,
  SiteResupplyDraftView,
} from '@lfd/contracts';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldIconComponent,
  FoldPanelHostService,
} from 'fold-ng';

import {
  ApplyModeDialog,
  type ApplyModeDialogData,
} from '../../resupply-templates/apply-mode-dialog/apply-mode-dialog';
import {
  compositionOf,
  templateLines,
} from '../../resupply-templates/resupply-template-composition';
import {
  skippedNotice,
  splitTemplateLines,
} from '../../resupply-templates/resupply-template-apply';
import { type DriftLine, templateDrift } from '../../resupply-templates/resupply-template-drift';
import { ResupplyTemplatesStore } from '../../resupply-templates/resupply-templates.store';
import {
  TemplateNameDialog,
  type TemplateNameDialogData,
} from '../../resupply-templates/template-name-dialog/template-name-dialog';
import { TARGET_LABELS } from '../resupply-stock-rows';
import { SiteResuppliesStore } from '../site-resupplies.store';

/** Le refus d'un ajustement sur une version périmée. */
const CHANGED_MEANWHILE = 'resupply.template.changed_meanwhile';

/**
 * Le modèle appliqué, gardé EN MÉMOIRE de l'écran (rien en base, M8) : de
 * quoi dire l'écart et le mettre à jour sous la version lue.
 */
interface AppliedTemplate {
  readonly templateId: string;
  readonly name: string;
  readonly version: number;
  readonly target: ResupplyTarget;
  /** La visée de la demande à laquelle il a été appliqué. */
  readonly appliedTo: ResupplyTarget;
  /** Les lignes qui se sont posées : la base de l'écart. */
  readonly base: readonly DriftLine[];
  /** Les lignes inapplicables, gardées telles quelles à la mise à jour (M6). */
  readonly stale: readonly ResupplyTemplateLineView[];
}

/**
 * **Les modèles au comptoir** (plan `commander.md § 6`, § 4 et
 * § 6) : le menu « Modèles » du point de la bande, qui applique un modèle à
 * la demande en cours de la visée affichée — « Remplacer · Ajouter » si elle
 * a déjà des lignes —, puis l'avis des articles écartés.
 *
 * Avec `resupply_templates:write` : « Enregistrer comme modèle » (les lignes
 * de la demande, la visée affichée) et, après une application, « Mettre à
 * jour » avec le résumé de l'écart. Une version périmée (409) relit le modèle
 * et recalcule l'écart : rien n'est écrasé.
 */
@Component({
  selector: 'app-resupply-templates-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldIconComponent,
  ],
  providers: [ResupplyTemplatesStore],
  templateUrl: './resupply-templates-menu.html',
  styleUrl: './resupply-templates-menu.scss',
})
export class ResupplyTemplatesMenu {
  private readonly library = inject(ResupplyTemplatesStore);
  private readonly resupplies = inject(SiteResuppliesStore);
  private readonly panels = inject(FoldPanelHostService);

  readonly siteId = input.required<string>();
  readonly target = input.required<ResupplyTarget>();
  /** La demande en cours de la visée affichée ; `null` tant qu'elle n'existe pas. */
  readonly draft = input.required<SiteResupplyDraftView | null>();
  readonly articles = input.required<readonly ResupplyArticleView[]>();
  /** Appliquer : le droit du comptoir (`handover_counter:write`). */
  readonly canApply = input.required<boolean>();
  /** Enregistrer et mettre à jour : `resupply_templates:write`. */
  readonly canWriteTemplates = input.required<boolean>();

  protected readonly templates = this.library.templates;
  protected readonly loadError = this.library.loadError;
  protected readonly busy = signal(false);
  protected readonly skipped = signal<string | null>(null);
  protected readonly failure = signal<string | null>(null);
  protected readonly done = signal<string | null>(null);

  /** Le modèle appliqué ; oublié quand le point change. */
  protected readonly applied = linkedSignal<string, AppliedTemplate | null>({
    source: () => this.siteId(),
    computation: () => null,
  });

  protected readonly draftLines = computed<readonly DriftLine[]>(() =>
    (this.draft()?.lines ?? []).map((line) => ({
      sku: line.sku,
      quantity: line.quantity,
      saleUnit: line.saleUnit,
    })),
  );

  /** L'écart avec le modèle appliqué, à la visée où il l'a été ; `null` : rien à dire. */
  protected readonly drift = computed(() => {
    const applied = this.applied();
    if (applied === null || applied.appliedTo !== this.target()) {
      return null;
    }
    return templateDrift(applied.base, this.draftLines(), (sku) => this.labelOf(sku));
  });

  constructor() {
    effect(() => {
      const siteId = this.siteId();
      untracked(() => {
        this.clearNotices();
        void this.library.open(siteId);
      });
    });
  }

  /** « Appliquer » : directement sur une demande vide, après la question sinon. */
  protected async apply(template: ResupplyTemplateView): Promise<void> {
    const target = this.target();
    const lineCount = this.draftLines().length;
    let mode: ResupplyTemplateApplyMode = 'replace';
    if (lineCount > 0) {
      const chosen = await this.panels.open<ApplyModeDialogData, ResupplyTemplateApplyMode>(
        ApplyModeDialog,
        { data: { templateName: template.name, lineCount } },
      ).closed;
      if (chosen === undefined) {
        return;
      }
      mode = chosen;
    }
    this.clearNotices();
    this.busy.set(true);
    try {
      const result = await this.resupplies.applyTemplate(target, template.id, mode);
      if (result === null) {
        return;
      }
      this.applied.set(this.memoryOf(template, target));
      this.skipped.set(skippedNotice(result.skipped, this.articles(), template));
    } finally {
      this.busy.set(false);
    }
  }

  /** « Enregistrer comme modèle » : le nom demandé, la visée et les lignes affichées. */
  protected async saveAsTemplate(): Promise<void> {
    const target = this.target();
    const lines = this.currentLines([]);
    if (lines.length === 0) {
      return;
    }
    this.clearNotices();
    const name = await this.panels.open<TemplateNameDialogData, string>(TemplateNameDialog, {
      data: {
        summary: `${TARGET_LABELS[target]} · ${String(lines.length)} article(s)`,
        initialName: this.draft()?.name ?? '',
        save: (chosen) => this.create({ name: chosen, target, lines }, target),
      },
    }).closed;
    if (name !== undefined) {
      this.done.set(`Modèle « ${name} » enregistré.`);
    }
  }

  /** « Mettre à jour » : la demande devient le modèle, sous la version lue. */
  protected async update(): Promise<void> {
    const applied = this.applied();
    if (applied === null) {
      return;
    }
    const lines = this.currentLines(applied.stale);
    if (lines.length === 0) {
      this.failure.set(
        "La demande est vide : un modèle garde au moins un article. Pour l'abandonner, archivez-le depuis l'écran des modèles.",
      );
      return;
    }
    this.clearNotices();
    this.busy.set(true);
    try {
      await this.library.adjust(
        applied.templateId,
        { name: applied.name, target: applied.target, lines },
        applied.version,
      );
      this.rebase(applied);
      this.done.set(`« ${applied.name} » mis à jour.`);
    } catch (error) {
      await this.refused(error, applied);
    } finally {
      this.busy.set(false);
    }
  }

  private async create(
    content: ResupplyTemplateContentPayload,
    target: ResupplyTarget,
  ): Promise<string | null> {
    try {
      const saved = await this.library.create(content);
      const template = this.library.find(saved.id);
      if (template !== undefined) {
        this.applied.set(this.memoryOf(template, target));
      }
      return null;
    } catch (error) {
      return httpErrorMessage(error, "Le modèle n'a pas pu être enregistré.");
    }
  }

  /** Un refus de mise à jour ; une version périmée relit le modèle, jamais ne l'écrase. */
  private async refused(error: unknown, applied: AppliedTemplate): Promise<void> {
    if (httpErrorCode(error) !== CHANGED_MEANWHILE) {
      this.failure.set(httpErrorMessage(error, "Le modèle n'a pas pu être mis à jour."));
      return;
    }
    try {
      await this.library.reload();
    } catch {
      this.failure.set(
        `« ${applied.name} » a été modifié depuis un autre poste, et sa version à jour n'a pas pu être relue : rechargez la page.`,
      );
      return;
    }
    if (this.library.find(applied.templateId) === undefined) {
      this.applied.set(null);
      this.failure.set(`« ${applied.name} » a été archivé depuis un autre poste.`);
      return;
    }
    this.rebase(applied);
    this.failure.set(
      `« ${applied.name} » a été modifié depuis un autre poste : l'écart est recalculé sur sa version à jour. Vérifiez-le, puis mettez à jour.`,
    );
  }

  /** La mémoire repart du modèle tel que la bibliothèque le relit. */
  private rebase(applied: AppliedTemplate): void {
    const fresh = this.library.find(applied.templateId);
    this.applied.set(fresh === undefined ? null : this.memoryOf(fresh, applied.appliedTo));
  }

  private memoryOf(template: ResupplyTemplateView, appliedTo: ResupplyTarget): AppliedTemplate {
    return {
      templateId: template.id,
      name: template.name,
      version: template.version,
      target: template.target,
      appliedTo,
      base: splitTemplateLines(template, this.articles()).applicable,
      stale: compositionOf(template).stale,
    };
  }

  /** Les lignes de la demande, à l'unité du catalogue, puis les inapplicables gardées. */
  private currentLines(stale: readonly ResupplyTemplateLineView[]): ResupplyTemplateLine[] {
    const quantities = new Map(this.draftLines().map((line) => [line.sku, line.quantity] as const));
    return templateLines(this.articles(), quantities, stale);
  }

  private labelOf(sku: string): string {
    return (
      this.articles().find((article) => article.sku === sku)?.name ??
      this.draft()?.lines.find((line) => line.sku === sku)?.label ??
      sku
    );
  }

  private clearNotices(): void {
    this.skipped.set(null);
    this.failure.set(null);
    this.done.set(null);
  }
}
