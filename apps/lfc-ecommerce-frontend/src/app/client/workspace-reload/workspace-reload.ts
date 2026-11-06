import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject } from '@angular/core';
import { Router } from '@angular/router';

import { WORKSPACE_RELOAD_ROUTE } from '../client-workspace-switch.service';

/** Où va qui atterrit ici pour de vrai : l'accueil de la boutique. */
const LANDING = '/';

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
 *
 * 🔴 **Atterrir ici pour de vrai n'est jamais une impasse** (Hugo, 2026-11-06 :
 * « je reste bloqué sur /changement-d-espace »). Un onglet resté sur une
 * version d'avant `fba123767` rechargeait la page entière sur ce détour au
 * lieu de la destination, et un rechargement de la page refait de même. Quand
 * la barre d'adresse dit CETTE route — le détour, lui, ne la touche jamais —,
 * l'écran repart vers l'accueil sans laisser d'entrée dans l'historique.
 */
@Component({
  selector: 'app-workspace-reload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class WorkspaceReload {
  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }
    if (inject(DOCUMENT).location.pathname !== WORKSPACE_RELOAD_ROUTE) {
      return;
    }
    void inject(Router).navigateByUrl(LANDING, { replaceUrl: true });
  }
}
