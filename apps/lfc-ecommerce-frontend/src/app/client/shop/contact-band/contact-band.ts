import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import type { ContactBandCopy } from '../../copy/screens/accueil-public.copy';
import { CallDialog } from '../call-dialog/call-dialog';
import { ContactDialog } from '../contact-dialog/contact-dialog';
import { telHref } from '../contact-settings.store';

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
 * sur-titre et le numéro. C'est l'écran qui sait à qui il parle, et qui
 * superpose le réglage du back-office au dictionnaire.
 *
 * « Écrire » ouvre le dialogue « Nous écrire » (plan
 * `documentation/order/plan-nous-ecrire.md`, §4) : l'objet choisi décide où
 * part le message, ce qu'un `mailto:` ne savait pas faire.
 */
@Component({
  selector: 'app-contact-band',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './contact-band.html',
  styleUrl: './contact-band.scss',
})
export class ContactBand {
  readonly copy = input.required<ContactBandCopy>();

  private readonly panels = inject(FoldPanelHostService);

  protected readonly telHref = telHref;

  protected call(): void {
    CallDialog.open(this.panels, { phones: this.copy().phones });
  }

  protected write(): void {
    ContactDialog.open(this.panels);
  }
}
