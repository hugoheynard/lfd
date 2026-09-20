import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * **La coopérative d'acheteurs** — le palier se mesure sur la zone.
 *
 * Dessiné parce que la mise en commun est un modèle mental NEUF : le lecteur
 * arrive avec « mon volume, mon prix », et il faut lui montrer que le volume qui
 * compte n'est pas le sien. Trois clients qui convergent vers un total, et un
 * palier que ce total ouvre pour tous.
 *
 * La tournée est dessinée sous les trois : c'est elle qui rend le partage
 * légitime plutôt que commercial — un camion, un chauffeur, une matinée.
 */
@Component({
  selector: 'app-coop-schema',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './coop-schema.html',
  styleUrl: './coop-schema.scss',
})
export class CoopSchema {}
