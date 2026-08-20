import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Schéma « upsert Shopify » — le push idempotent : on ne recrée jamais, on
 * met à jour par id, le handle (donc l'URL, donc le SEO) reste stable. Couleurs
 * par tokens (thème-aware).
 */
@Component({
  selector: 'app-upsert-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './upsert-diagram.html',
  styleUrl: './upsert-diagram.scss',
})
export class UpsertDiagram {}
