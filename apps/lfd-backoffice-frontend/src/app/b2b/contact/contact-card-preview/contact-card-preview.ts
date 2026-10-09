import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FoldButtonComponent, FoldCardComponent } from 'fold-ng';

/** Ce que la carte de la boutique affiche, déjà résolu (langue, repli). */
export interface ContactCardPreviewText {
  readonly kicker: string;
  readonly title: string;
  readonly body: string;
  /** Un bouton par numéro : « Appeler · Boutique · +33 … », ou celui de repli. */
  readonly calls: readonly string[];
  readonly write: string;
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
