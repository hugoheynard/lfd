import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * **Un écran vide, par où passe la bascule d'espace** — jamais affiché, jamais
 * dans l'historique.
 *
 * Revenir sur la même adresse ne reconstruit pas l'écran : Angular garde le
 * composant monté, et ce qu'il avait lu dans l'ancien espace reste à l'écran.
 * `ClientWorkspaceSwitch` fait donc un aller-retour par ici, sans toucher à la
 * barre d'adresse, pour que l'écran de destination se monte à neuf — et que
 * ses gardes rejouent avec le nouvel espace.
 *
 * Il vit SOUS le shell client : un détour hors du shell le démonterait aussi, et
 * la barre clignoterait à chaque bascule.
 */
@Component({
  selector: 'app-workspace-reload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class WorkspaceReload {}
