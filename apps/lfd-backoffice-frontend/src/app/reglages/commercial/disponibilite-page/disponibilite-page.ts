import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FoldPageLayoutComponent } from 'fold-ng';

import { AvailabilityCard } from '../availability-card/availability-card';

/**
 * La prise de rendez-vous : la grille de disponibilité, sa politique, ses exceptions.
 *
 * Réglages › Commercial depuis le 2026-10-13 (Hugo) — venue de la section
 * « Réglages » de l'espace Commercial. La coquille des Réglages ne dessine
 * rien : la page porte donc son `fold-page-layout`, et son titre, son icône et
 * sa description ne s'affichent qu'une fois.
 */
@Component({
  selector: 'app-disponibilite-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvailabilityCard, FoldPageLayoutComponent],
  templateUrl: './disponibilite-page.html',
})
export class DisponibilitePage {}
