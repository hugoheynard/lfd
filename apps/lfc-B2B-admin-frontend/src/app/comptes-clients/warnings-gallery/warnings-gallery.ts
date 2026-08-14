import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldIconComponent } from 'fold-ng';

import type { AdminCompany } from '../admin-company';
import { warningCards, type WarningCard } from './warnings-gallery.model';

/**
 * La **galerie d'avertissements** — ce qui, dans le portefeuille, appelle un
 * geste ce matin. Une rangée de cartes qu'on parcourt en scrollant
 * latéralement, en tête de la liste des comptes.
 *
 * Pourquoi une galerie et pas une colonne de badges : un badge dans un tableau
 * se lit **compte par compte**, il faut déjà savoir lequel regarder. Une
 * galerie se lit **par le manque** — « qu'est-ce qui traîne ? » — et son
 * défilement borne l'attention à ce qui tient dans la rangée. Elle assume de
 * n'être pas exhaustive : on y met ce qui appelle un geste, pas l'état de 250
 * comptes.
 *
 * Présentation pure : l'ordre vient du serveur, la date vient de l'appelant.
 */
@Component({
  selector: 'app-warnings-gallery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldIconComponent],
  templateUrl: './warnings-gallery.html',
  styleUrl: './warnings-gallery.scss',
})
export class WarningsGallery {
  readonly companies = input.required<readonly AdminCompany[]>();
  /**
   * L'instant qui sert à dater les cartes — **injecté**, jamais lu ici.
   * `new Date()` dans un `computed` rendrait le composant non déterministe et
   * son test dépendant du jour où on le lance.
   */
  readonly now = input.required<Date>();

  protected readonly cards = computed<readonly WarningCard[]>(() =>
    warningCards(this.companies(), this.now()),
  );

  /**
   * « 7 à traiter » — le compte de ce qui attend, y compris hors écran.
   *
   * La rangée n'en montre que trois ou quatre selon la largeur : sans ce
   * nombre, on croirait avoir tout vu parce qu'on a vu le bord.
   */
  protected readonly count = computed(() => this.cards().length);
}
