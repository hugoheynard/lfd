import { inject, Injectable, signal } from '@angular/core';

import { AdminCompaniesService } from './comptes-clients/admin-companies.service';
import { PendingAccessService } from './admin/acces-en-attente/pending-access.service';

/**
 * Les **compteurs du menu** : ce qui attend derrière chaque entrée.
 *
 * Un chiffre dans la nav change la nature de l'écran — on n'y va plus « voir »,
 * on y va parce qu'il y a quelque chose. C'est aussi ce qui évite d'ouvrir
 * l'écran pour découvrir qu'il est vide, et de finir par ne plus l'ouvrir.
 *
 * Chargés **une fois** au démarrage, et rafraîchis à la demande par les écrans
 * qui font baisser le compte. Pas de sondage périodique : à cinq personnes dans
 * le back-office, une requête toutes les trente secondes coûterait plus qu'elle
 * n'apprendrait.
 *
 * Un échec laisse le compteur à zéro plutôt que d'afficher une erreur : le menu
 * n'est pas l'endroit où l'on diagnostique une panne, et un badge fantôme
 * enverrait sur un écran vide.
 */
@Injectable({ providedIn: 'root' })
export class NavCountsService {
  private readonly companies = inject(AdminCompaniesService);
  private readonly pending = inject(PendingAccessService);

  /** Comptes clients dont le dossier appelle un geste. */
  readonly companyWarnings = signal(0);
  /** Accès ouverts dont le lien n'a jamais été suivi. */
  readonly accessPending = signal(0);

  async refresh(): Promise<void> {
    await Promise.all([this.refreshCompanies(), this.refreshAccess()]);
  }

  async refreshCompanies(): Promise<void> {
    try {
      const all = await this.companies.list();
      // Le nombre d'AVERTISSEMENTS, pas de sociétés : une société qui cumule
      // deux manques réclame deux gestes, et c'est ce que la galerie montrera.
      this.companyWarnings.set(all.reduce((total, one) => total + one.warnings.length, 0));
    } catch {
      this.companyWarnings.set(0);
    }
  }

  async refreshAccess(): Promise<void> {
    try {
      this.accessPending.set((await this.pending.list()).length);
    } catch {
      this.accessPending.set(0);
    }
  }
}
