import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { ClientCompany } from '../../client-company.service';
import { ClientCopyService } from '../../copy/client-copy.service';

/**
 * L'extrait du greffe.
 *
 * ## 🔴 Il montrait le KBIS d'une autre société
 *
 * « kbis-marchand-fils.pdf, vérifié le 14/02/2024 par Léa », écrit en dur. Il
 * vient de `GET /me` (`CompanyView.kbis`).
 *
 * ## Ce qui a disparu avec la maquette
 *
 * - **QUI a certifié.** Le modèle le garde bel et bien — et la carte avait
 *   raison de vouloir le montrer, une vérification anonyme n'engageant
 *   personne. Mais `KbisView` ne porte que `certified`, un booléen : le nom du
 *   valideur ne traverse pas le fil. Il reviendra quand le contrat le portera.
 * - **La DATE de vérification**, pour la même raison, et **la taille** du
 *   fichier, que le fil ne porte pas non plus.
 *
 * Restent le nom du fichier, sa date de dépôt, et le fait qu'il soit certifié ou
 * non — ce qui est la question qu'on se pose en ouvrant cette carte.
 *
 * ## La jauge de fraîcheur est partie
 *
 * Elle affichait un remplissage FIXE, sans lire aucune date. Un extrait de trois
 * mois et un extrait de trois ans dessinaient la même barre. La règle, elle,
 * reste écrite : c'est elle qui compte.
 */
@Component({
  selector: 'app-kbis-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './kbis-card.html',
  styleUrl: './kbis-card.scss',
})
export class KbisCard {
  protected readonly t = inject(ClientCopyService).t;
  private readonly client = inject(ClientCompany);

  /** L'extrait déposé, ou `null` — la société n'en a pas encore fourni. */
  protected readonly kbis = computed(() => this.client.company()?.kbis ?? null);

  /** Certifié par le staff, ou en attente. Deux états, et pas un de plus. */
  protected readonly state = computed(() => {
    const copy = this.t().account;
    return this.kbis()?.certified === true ? copy.kbisCertified : copy.kbisPending;
  });

  /** « Déposé le 12/02/2026 ». La taille ne traverse pas le fil. */
  protected readonly filed = computed(() => {
    const kbis = this.kbis();
    return kbis === null ? '' : this.t().account.kbisFiled.replace('{date}', day(kbis.uploadedAt));
  });
}

/** Une date ISO telle qu'on la lit ici : `JJ/MM/AAAA`. */
function day(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('fr-FR');
}
