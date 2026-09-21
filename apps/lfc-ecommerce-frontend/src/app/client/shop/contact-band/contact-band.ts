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
 * ⚠️ Elle a eu une jumelle, `mon-espace/contact-card` — une colonne de 274 px,
 * là où celle-ci est une bande large à deux colonnes. Les deux ont coexisté
 * parce que leurs géométries n'avaient aucune règle commune ; l'écran qui
 * portait l'autre a disparu le 2026-09-21 et elle avec. Il n'y a donc plus
 * qu'une façon de dire ceci, et c'est celle-là.
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
