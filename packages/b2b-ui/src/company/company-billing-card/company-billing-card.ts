import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

/**
 * Section **Facturation** d'une société — présentation pure. Affiche la condition
 * de règlement **convenue** et, le cas échéant, une **demande en attente**. Le
 * bouton d'action est neutre : le container décide de ce qu'il fait (le client
 * *demande* une évolution, le staff la *fixe*) via `actionLabel` + `action`.
 * Toute la copie explicative arrive en `input()`.
 */
@Component({
  selector: 'lfd-company-billing-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageSectionComponent, FoldCardComponent, FoldCalloutComponent, FoldButtonComponent],
  templateUrl: './company-billing-card.html',
  styleUrl: './company-billing-card.scss',
})
export class CompanyBillingCard {
  /** Condition de règlement convenue (libellé). */
  readonly termLabel = input.required<string>();
  /** Terme demandé en attente de validation, ou `null`. */
  readonly pendingLabel = input<string | null>(null);
  /** Description de la section (formulée par app). */
  readonly description = input('Les conditions de règlement de la société.');
  /** Note explicative sous le terme ; vide = masquée. */
  readonly note = input('');
  /** Texte ajouté dans le callout de demande en attente ; vide = masqué. */
  readonly pendingNote = input('');
  /** Le gestionnaire peut déclencher l'action de facturation. */
  readonly canManage = input(false);
  /** Libellé du bouton d'action (« Demander une modification » / « Modifier »…). */
  readonly actionLabel = input('Modifier');

  /** L'utilisateur déclenche l'action de facturation. */
  readonly action = output<void>();
}
