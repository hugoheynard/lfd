import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

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
 * 🔴 **Un composant, et une BOUCLE, alors que le contrat ne porte qu'un
 * nombre.** Les produits y seront glissés-déposés, et ce nombre deviendra la
 * longueur d'une liste de containers nommés : le jour venu, `slots` cesse d'être
 * dérivé du compte pour devenir la liste elle-même, chaque entrée gagne un nom
 * et une zone de dépôt, et la page au-dessus ne change pas d'une ligne. Peindre
 * un simple chiffre dans le gabarit du poste aurait demandé de refaire le bloc
 * entier — et de le sortir d'un coin où on l'aurait peint.
 */
@Component({
  selector: 'app-packing-containers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './packing-containers.html',
  styleUrl: './packing-containers.scss',
})
export class PackingContainers {
  readonly count = input.required<number>();

  /** Une commande déclarée prête ne change plus de compte : rien ne revient dessus. */
  readonly editable = input(true);

  /** `+1` ou `-1`. Le parent borne, envoie et retombe sur le serveur s'il refuse. */
  readonly step = output<number>();

  /** Une entrée par container — c'est elle qui deviendra un container nommé. */
  protected readonly slots = computed<readonly number[]>(() =>
    Array.from({ length: this.count() }, (_, index) => index + 1),
  );
}
