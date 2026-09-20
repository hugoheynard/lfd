import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { ContactBandCopy } from '../../copy/screens/accueil-public.copy';
import { CONTACT_MAIL_HREF, CONTACT_PHONE_HREF } from '../contact-details';

/**
 * **« On répond »** — la bande de contact de l'accueil (maquette du 2026-09-20,
 * `captures/11-contact.png`).
 *
 * Bleu clair sur la feuille crème, et c'est le seul objet de la page qui le
 * soit : elle n'est ni une porte, ni une offre. La distinguer par la COULEUR
 * plutôt que par une place dans la colonne lui évite de se lire comme une
 * quatrième carte à choisir.
 *
 * ⚠️ **Ce n'est pas `mon-espace/contact-card`, et les deux restent.** La carte
 * de l'espace est une colonne de 274 px que son bouton pousse à la hauteur du
 * puits voisin ; celle-ci est une bande large à deux colonnes, dont le texte et
 * les boutons se répartissent la largeur. Même contenu, deux géométries qui
 * n'ont aucune règle commune — les fondre demanderait un composant qui sait
 * déjà lequel des deux il est.
 *
 * Elle ne décide rien : tout ce qu'elle dit lui est passé, y compris le
 * sur-titre. C'est l'écran qui sait à qui il parle.
 */
@Component({
  selector: 'app-contact-band',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './contact-band.html',
  styleUrl: './contact-band.scss',
})
export class ContactBand {
  readonly copy = input.required<ContactBandCopy>();

  protected readonly phoneHref = CONTACT_PHONE_HREF;
  protected readonly mailHref = CONTACT_MAIL_HREF;
}
