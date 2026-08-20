import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma « système » — le chemin de la donnée : seed en repo → PIM → collections
 * → Shopify. Purement présentationnel ; couleurs par tokens (thème-aware).
 */
@Component({
  selector: 'app-system-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './system-diagram.html',
  styleUrl: './system-diagram.scss',
})
export class SystemDiagram {}
