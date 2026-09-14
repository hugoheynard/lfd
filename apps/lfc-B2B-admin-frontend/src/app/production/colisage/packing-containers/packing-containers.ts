import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { PackingContainerStep } from '@lfd/contracts';

/**
 * **Les containers d'une commande** — les contenants qu'on charge dans le
 * véhicule.
 *
 * 🔴 **Aucun rapport avec `production_container`**, qui est le matériel du FOUR
 * (combien de baguettes tiennent sur une tourneuse, réglé par SKU une fois pour
 * toutes). Ni la même clé, ni le même rythme, ni la même personne — et le front
 * ne réutilise aucun de ses noms pour que la confusion n'ait pas d'endroit où
 * naître.
 *
 * 🔴 **Il ne compte rien.** « + » et « − » émettent un SENS (`add`, `remove`) ;
 * le parent l'envoie, le serveur calcule le nouveau compte, et l'écran relit.
 * `count` est donc toujours le chiffre servi — jamais un compte tenu ici.
 *
 * **Une BOUCLE, alors que le contrat ne porte qu'un nombre.** Les produits y
 * seront glissés-déposés, et ce nombre deviendra la longueur d'une liste de
 * containers nommés : le jour venu, `slots` devient la liste elle-même, chaque
 * tuile gagne un nom et une zone de dépôt, et la page au-dessus ne change pas
 * d'une ligne.
 */
@Component({
  selector: 'app-packing-containers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './packing-containers.html',
  styleUrl: './packing-containers.scss',
})
export class PackingContainers {
  /** Le compte SERVI. */
  readonly count = input.required<number>();

  /** Une commande déclarée prête ne change plus de compte : rien ne revient dessus. */
  readonly editable = input(true);

  /** Un envoi en vol : les deux boutons se désarment, et seulement pendant ce temps. */
  readonly busy = input(false);

  /** Le sens demandé. Le parent envoie, puis relit ce que le serveur a compté. */
  readonly step = output<PackingContainerStep>();

  /**
   * Une tuile par container servi — **sans numéro**. Un rang affiché aurait été
   * un chiffre fabriqué par l'écran (`index + 1`) ; le seul nombre montré est
   * celui du serveur, dans la bande.
   */
  protected readonly slots = computed(() => Array.from({ length: this.count() }));
}
