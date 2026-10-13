import { ChangeDetectionStrategy, Component } from '@angular/core';

import { AvailabilityCard } from '../../../reglages/commercial/availability-card/availability-card';

/**
 * La prise de rendez-vous : la grille de disponibilité, sa politique, ses exceptions.
 *
 * Vue de l'espace Commercial, sous sa section « Réglages » (Hugo,
 * 2026-10-13) : l'en-tête — titre, icône, description — est celui de la
 * coquille `CommercialPage`, lu dans `COMMERCIAL_VIEWS`. La page ne pose donc
 * pas de `fold-page-layout` à elle : elle vit déjà dans celui de la coquille.
 */
@Component({
  selector: 'app-disponibilite-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvailabilityCard],
  templateUrl: './disponibilite-page.html',
})
export class DisponibilitePage {}
