import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { FoldButtonComponent, FoldIconComponent } from 'fold-ng';

/**
 * Pied de page de la boutique : contact support (technique + compta), inscription
 * newsletter et mentions légales. Les données légales sont des **placeholders**
 * (SIRET/RCS/TVA en zéros) — à remplacer par les vraies avant mise en ligne.
 */
@Component({
  selector: 'app-site-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldIconComponent],
  templateUrl: './site-footer.html',
  styleUrl: './site-footer.scss',
})
export class SiteFooter {
  protected readonly subscribed = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Inscription newsletter — POC : validation locale, aucun envoi réseau. */
  protected subscribe(value: string): void {
    const email = value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      this.error.set('Adresse e-mail invalide.');
      return;
    }
    this.error.set(null);
    this.subscribed.set(true);
  }
}
