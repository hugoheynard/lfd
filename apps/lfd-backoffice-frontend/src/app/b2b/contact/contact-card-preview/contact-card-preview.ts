import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FoldButtonComponent, FoldCardComponent } from 'fold-ng';

/** Ce que la carte de la boutique affiche, déjà résolu (langue, repli). */
export interface ContactCardPreviewText {
  /** Vide : pas de surtitre — il n'a pas de repli. */
  readonly kicker: string;
  readonly title: string;
  readonly body: string;
  /** Un bouton par numéro : « Appeler · Boutique · +33 … » ; aucun, aucun bouton (2026-10-26). */
  readonly calls: readonly string[];
  /** Le mot du bouton « Écrire » ; vide quand la carte coupe le formulaire. */
  readonly write: string;
  /** Le message d'une carte sans numéro ni formulaire ; vide sinon. */
  readonly noContact: string;
}

/**
 * **L'aperçu de la carte de contact** — la forme de la bande « On répond » de
 * la boutique (`client/shop/contact-band/`), reproduite en primitives fold sans
 * rien importer d'elle. Inerte : ses boutons montrent, ils ne font rien.
 */
@Component({
  selector: 'app-contact-card-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCardComponent],
  templateUrl: './contact-card-preview.html',
  styleUrl: './contact-card-preview.scss',
})
export class ContactCardPreview {
  readonly text = input.required<ContactCardPreviewText>();
}
