import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldIconComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import type { CompanyIdentityView } from '../company-identity.view-model';

/**
 * Carte **Identité légale** d'une société — présentation pure.
 *
 * Affiche l'identité (raison sociale, forme, SIRET, TVA, statut, rôle) et le
 * bloc **KBIS** (fichier déposé ou zone de dépôt). Ne connaît ni service ni
 * modèle d'app : tout entre par `input()` (le view-model neutre + les capacités)
 * et sort par `output()` (les intentions). Le container de chaque app mappe son
 * modèle, calcule les capacités et exécute les actions.
 */
@Component({
  selector: 'lfd-company-identity-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldFieldListComponent,
    FoldFieldComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldIconComponent,
  ],
  templateUrl: './company-identity-card.html',
  styleUrl: './company-identity-card.scss',
})
export class CompanyIdentityCard {
  /** L'identité à afficher (view-model neutre). */
  readonly identity = input.required<CompanyIdentityView>();
  /** Le gestionnaire peut éditer l'identité souple (bouton Modifier + callout TVA). */
  readonly canManage = input(false);
  /** Le gestionnaire peut déposer / remplacer le KBIS. */
  readonly canManageKbis = input(false);
  /**
   * Les actions **Voir / Télécharger** du KBIS sont disponibles — vrai quand un
   * endpoint de récupération du fichier existe pour ce consommateur. Faux masque
   * les boutons tout en gardant la métadonnée (nom, date, badge certifié).
   */
  readonly canAccessKbis = input(true);
  /** Une action KBIS est en cours (dépôt) — désactive les contrôles. */
  readonly busy = input(false);
  /** Message d'erreur d'une action KBIS, ou `null`. */
  readonly error = input<string | null>(null);
  /** Texte de la zone de dépôt quand aucun KBIS n'est présent (formulation par app). */
  readonly kbisEmptyHint = input(
    "L'activation du compte passe par la réception de l'extrait KBIS (format PDF).",
  );

  /** L'utilisateur demande l'édition de l'identité souple. */
  readonly edit = output<void>();
  /** Un fichier KBIS a été choisi (à téléverser par le container). */
  readonly kbisSelected = output<File>();
  /** Demande d'ouverture du KBIS. */
  readonly viewKbis = output<void>();
  /** Demande de téléchargement du KBIS. */
  readonly downloadKbis = output<void>();

  /** Émet le fichier choisi puis réinitialise l'input (re-dépôt du même nom). */
  protected onKbisSelected(event: Event): void {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (file !== undefined) {
      this.kbisSelected.emit(file);
    }
  }
}
