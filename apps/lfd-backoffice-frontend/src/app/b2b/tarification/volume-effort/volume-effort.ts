import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ElasticityComparison, ItemElasticityView } from '@lfd/contracts';

import { attainmentLabel, gaugeWidth, isOnTrack, ratioLabel } from '../pricing-format';

/**
 * **Ce que l'altération oblige à vendre, et où on en est.**
 *
 * Deux comparaisons, jamais fondues en une : **depuis la règle** juge la
 * décision, **les trente derniers jours** disent où on en est aujourd'hui. Elles
 * ne répondent pas à la même question, et une moyenne des deux ne répondrait à
 * aucune.
 *
 * Un objectif manqué reste **neutre** : peindre en rouge tout ce qui est sous
 * 100 % ferait paniquer sur une remise trop récente pour avoir produit quoi que
 * ce soit — d'où `conclusive`, qui dit « trop tôt » plutôt qu'un pourcentage.
 */
@Component({
  selector: 'app-volume-effort',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './volume-effort.html',
  styleUrl: './volume-effort.scss',
})
export class VolumeEffort {
  /** `null` quand le prix n'a pas bougé : il n'y a alors rien à compenser. */
  readonly elasticity = input.required<ItemElasticityView | null>();

  protected readonly ratioLabel = ratioLabel;
  protected readonly attainmentLabel = attainmentLabel;
  protected readonly isOnTrack = isOnTrack;

  /**
   * **La largeur de la jauge**, ou `null` quand il n'y a pas de jauge.
   *
   * Le cas `null` est le plus important des trois : sans référence, une barre
   * vide se lirait « 0 % de l'objectif », ce qui est faux. `pricing-format` a
   * déjà tranché que la bonne réponse est de ne rien afficher — la jauge suit,
   * plutôt que d'inventer un zéro qui n'existe pas.
   */
  protected readonly gaugeWidth = gaugeWidth;

  /** Le volume observé et celui visé, côte à côte — le détail sous le chiffre. */
  protected volumes(comparison: ElasticityComparison): string {
    return `${String(comparison.observedVolume)} vendus / ${String(comparison.targetVolume)} visés`;
  }
}
