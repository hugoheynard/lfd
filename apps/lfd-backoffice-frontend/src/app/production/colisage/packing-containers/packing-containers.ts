import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

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
 * 🔴 **Lecture seule depuis K3c** (`plan-domaine-colisage.md` §17.3) : le
 * compte « + / − » n'est plus servi. Il ne reste que pour montrer le compte
 * d'une commande `counted`, colisée avec l'ancien poste ; une commande `listed`
 * tient ses contenants dans `PackingContainerBoard`.
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

  /**
   * Une tuile par container servi — **sans numéro**. Un rang affiché aurait été
   * un chiffre fabriqué par l'écran (`index + 1`) ; le seul nombre montré est
   * celui du serveur, dans la bande.
   */
  protected readonly slots = computed(() => Array.from({ length: this.count() }));
}
