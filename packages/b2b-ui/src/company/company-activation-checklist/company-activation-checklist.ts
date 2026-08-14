import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

/**
 * Une étape d'activation à compléter. `kind` distingue une action ouvrant un
 * flux (`action` → bouton) d'un dépôt de fichier inline (`file` → input).
 */
export interface CompanyActivationStep {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  /**
   * Le libellé du geste, ou **vide** quand l'étape n'en offre aucun : le champ
   * qui la satisfait est déjà à l'écran (formulaire d'ouverture). Un bouton qui
   * ne mène nulle part est pire qu'une absence de bouton.
   */
  readonly cta: string;
  readonly kind: 'action' | 'file';
}

/**
 * Encart **d'activation** d'une société — présentation pure. Rend la liste des
 * étapes restantes (chacune avec son action ou son dépôt de fichier) et, quand
 * tout est prêt, une bannière. Le **récit** propre à l'app (intro, lien vers un
 * espace, demande de support) est **projeté** via les slots `[intro]` / `[support]`
 * — la lib ne connaît ni route ni copie spécifique. Le container calcule les
 * étapes et exécute les intentions.
 */
@Component({
  selector: 'lfd-company-activation-checklist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldButtonComponent],
  templateUrl: './company-activation-checklist.html',
  styleUrl: './company-activation-checklist.scss',
})
export class CompanyActivationChecklist {
  /** Étapes restantes à compléter (les faites ne sont pas passées). */
  readonly steps = input.required<readonly CompanyActivationStep[]>();
  /** Toutes les pièces sont là (n'affiche la bannière que si vrai). */
  readonly ready = input(false);
  /** Texte de la bannière « prêt » (formulé par app). */
  readonly readyNote = input('Toutes les pièces sont complètes.');

  /** L'utilisateur déclenche l'action d'une étape (clé de l'étape). */
  readonly stepAction = output<string>();
  /** Un fichier a été choisi pour une étape de dépôt (`kind: 'file'`). */
  readonly fileSelected = output<{ readonly key: string; readonly file: File }>();

  /** Émet le fichier choisi pour l'étape puis réinitialise l'input. */
  protected onFile(event: Event, key: string): void {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (file !== undefined) {
      this.fileSelected.emit({ key, file });
    }
  }
}
