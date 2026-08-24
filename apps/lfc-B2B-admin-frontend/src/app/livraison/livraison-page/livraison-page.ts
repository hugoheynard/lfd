import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldButtonComponent, FoldEmptyStateComponent, FoldPageLayoutComponent } from 'fold-ng';

/**
 * **Livraison** — la place réservée, et rien d'autre pour l'instant.
 *
 * Un écran vide plutôt qu'une entrée absente : c'est le quatrième module du
 * back-office (commercial, PIM, production, livraison), et le seul qui n'existe
 * pas encore. L'annoncer évite qu'on range ses premiers écrans ailleurs — dans
 * Production « en attendant », d'où plus personne ne les sortirait.
 *
 * L'état vide DIT où va le travail aujourd'hui, et y mène : sans ce lien, un
 * écran « à venir » ressemble à une panne plutôt qu'à un chantier.
 */
@Component({
  selector: 'app-livraison-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldButtonComponent, FoldEmptyStateComponent, FoldPageLayoutComponent],
  templateUrl: './livraison-page.html',
})
export class DeliveryPage {}
