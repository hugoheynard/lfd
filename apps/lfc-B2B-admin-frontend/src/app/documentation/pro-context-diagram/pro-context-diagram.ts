import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma « pourquoi la vente pro a sa colonne » — la seule duplication assumée
 * du registre des contextes.
 *
 * Fiscalement, elle n'en méritait pas : une viennoiserie vendue à un revendeur
 * relève du même taux réduit que la même vendue à emporter. La colonne existe
 * quand même, et le schéma existe pour que la raison ne se perde pas — la
 * prochaine personne qui verra deux colonnes au même taux voudra les fondre.
 *
 * Ce qui les sépare n'est pas le taux, c'est la RESPONSABILITÉ portée par la
 * donnée : facture et mentions obligatoires, prix négocié, informations
 * réglementaires transmises à un tiers qui les réaffiche, et traçabilité en
 * cas de rappel. Fondues dans une seule colonne, ces obligations s'appliquent
 * à la ligne la plus faible — et on ne sait plus dire ce qui a été vendu à un
 * professionnel.
 *
 * Purement présentationnel ; couleurs par tokens (thème-aware).
 */
@Component({
  selector: 'app-pro-context-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-context-diagram.html',
  styleUrl: './pro-context-diagram.scss',
})
export class ProContextDiagram {}
