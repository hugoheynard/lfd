import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import {
  FoldButtonComponent,
  FoldPageLayoutComponent,
  FoldViewNavComponent,
  type FoldViewNavItem,
} from 'fold-ng';

import { PinnedAccountsStore, MAX_PINNED } from '../commercial/cockpit/pinned-store';
import { NotifyService } from '../notify.service';
import { AdminCompaniesService } from '../comptes-clients/admin-companies.service';

/**
 * La **coquille d'un compte client** : un en-tête qui porte le nom de la société
 * et les actions qui valent partout (retour, épingle), un rail de vues, et la
 * vue courante.
 *
 * Cinq vues, parce qu'un compte se regarde de cinq façons qui n'ont pas les
 * mêmes lecteurs :
 *
 * - **Tableau de bord** — ce que le commercial regarde avant d'appeler : les
 *   chiffres, les dernières commandes, l'historique d'interaction. C'est la
 *   fiche qu'on avait construite dans la page rendez-vous ;
 * - **Informations** — l'état civil du compte : pièces d'activation, identité,
 *   contacts, adresses. Ce qu'on ouvre pour *corriger* quelque chose ;
 * - **Commandes** — ce qu'il a acheté, et à quel rythme ;
 * - **Alertes** — ce que la plateforme surveille chez lui, et ce que ce compte
 *   fait de chaque règle (la suivre, l'éteindre, ou porter la sienne) ;
 * - **Données** — ce que le système sait de lui, journal compris.
 *
 * Le nom de la société est chargé **ici**, une fois : chaque vue le réclamerait
 * sinon, et l'en-tête clignoterait à chaque changement d'onglet.
 */
@Component({
  selector: 'app-fiche-client-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, FoldButtonComponent, FoldPageLayoutComponent, FoldViewNavComponent],
  templateUrl: './fiche-client-shell.html',
  styleUrl: './fiche-client-shell.scss',
})
export class FicheClientShell {
  /** L'identifiant de la société, lié depuis le segment de route. */
  readonly id = input.required<string>();

  private readonly companies = inject(AdminCompaniesService);
  private readonly pins = inject(PinnedAccountsStore);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  protected readonly raisonSociale = signal<string>('');

  protected readonly tabs: FoldViewNavItem[] = [
    { key: 'dashboard', label: 'Tableau de bord', link: 'dashboard', icon: 'grid' },
    { key: 'informations', label: 'Informations', link: 'informations', icon: 'company' },
    { key: 'commandes', label: 'Commandes', link: 'commandes', icon: 'list' },
    { key: 'alertes', label: 'Alertes', link: 'alertes', icon: 'bell' },
    { key: 'data', label: 'Données', link: 'data', icon: 'stats' },
  ];

  protected readonly title = computed<string>(() => {
    const name = this.raisonSociale();
    return name === '' ? 'Compte client' : name;
  });

  constructor() {
    // Un `input` de route n'est **pas encore lié** dans le constructeur : le lire
    // ici lève NG0950, que le `catch` de `loadName` avalait — l'en-tête restait
    // sur « Compte client » sans que rien ne le signale. L'effet attend la
    // liaison, et rejoue si on passe d'un compte à un autre.
    effect(() => {
      void this.loadName(this.id());
    });
  }

  protected isPinned(): boolean {
    return this.pins.isPinned(this.id());
  }

  /**
   * Épingle ou retire. Un refus (limite atteinte) se **dit** — un clic sans effet
   * ni explication est le meilleur moyen de faire croire à une panne.
   */
  protected togglePin(): void {
    const wasPinned = this.isPinned();
    if (!this.pins.toggle(this.id())) {
      this.notify.error(`Maximum ${MAX_PINNED} comptes épinglés — retirez-en un d'abord.`);
      return;
    }
    this.notify.success(
      wasPinned ? 'Compte retiré du suivi.' : 'Compte épinglé au tableau de bord.',
    );
  }

  protected async back(): Promise<void> {
    await this.router.navigate(['/comptes-clients']);
  }

  /** Le nom seul : l'en-tête n'a besoin de rien d'autre, les vues chargent le reste. */
  private async loadName(id: string): Promise<void> {
    try {
      const company = await this.companies.getById(id);
      this.raisonSociale.set(company?.raisonSociale ?? '');
    } catch {
      this.raisonSociale.set('');
    }
  }
}
