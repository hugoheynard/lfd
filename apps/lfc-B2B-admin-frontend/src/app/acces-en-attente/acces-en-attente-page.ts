import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FoldButtonComponent,
  FoldIconComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { NotifyService } from '../notify.service';
import { displayName, waitingFor, type PendingAccess } from './pending-access.model';
import { PendingAccessService } from './pending-access.service';

/** Une ligne prête à rendre — nom et attente calculés une fois. */
interface PendingRow {
  readonly person: PendingAccess;
  readonly name: string;
  readonly waiting: string;
}

/**
 * **Accès à remettre** — le canal de secours, quand l'e-mail n'arrive pas.
 *
 * Il n'arrive pas toujours : boîte pleine, spam, adresse abandonnée, message
 * supprimé par mégarde. Cet écran existe donc **en permanence**, pas seulement
 * tant que le mailer n'est pas branché.
 *
 * La file se vide d'elle-même : une personne y figure tant qu'elle n'a pas posé
 * son mot de passe, et disparaît dès qu'elle l'a fait. Rien à cocher.
 */
@Component({
  selector: 'app-acces-en-attente-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldPageLayoutComponent,
    FoldCardComponent,
    FoldButtonComponent,
    FoldIconComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
  ],
  templateUrl: './acces-en-attente-page.html',
  styleUrl: './acces-en-attente-page.scss',
})
export class AccesEnAttentePage {
  private readonly service = inject(PendingAccessService);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly people = signal<readonly PendingAccess[]>([]);
  /** L'attente en cours de fabrication — deux clics ne font pas deux liens. */
  protected readonly issuing = signal<string | null>(null);

  /** Figé au chargement : un âge qui se recalcule à chaque rendu est instable. */
  private readonly loadedAt = signal(new Date());

  /**
   * L'onglet ouvert. Deux périmètres qui ne se mélangent pas dans la tête du
   * commercial : les clients qu'il sert, l'équipe qui l'entoure. Les compter
   * séparément, c'est aussi voir tout de suite lequel des deux traîne.
   */
  protected readonly tab = signal<'client' | 'staff'>('client');

  protected readonly clientCount = computed(
    () => this.people().filter((person) => person.kind === 'client').length,
  );
  protected readonly staffCount = computed(
    () => this.people().filter((person) => person.kind === 'staff').length,
  );

  protected readonly rows = computed<readonly PendingRow[]>(() =>
    this.people()
      .filter((person) => person.kind === this.tab())
      .map((person) => ({
        person,
        name: displayName(person),
        waiting: waitingFor(person.invitedAt, this.loadedAt()),
      })),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.people.set(await this.service.list());
      this.loadedAt.set(new Date());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Fabrique le lien et le met dans le presse-papier — c'est le geste réel :
   * personne ne recopie une URL de ticket à la main.
   *
   * Si le presse-papier est refusé (navigateur, contexte non sécurisé), on ne
   * fait pas semblant : le lien s'affiche, à charge de le sélectionner.
   */
  protected async copyLink(person: PendingAccess): Promise<void> {
    if (this.issuing() !== null) {
      return;
    }
    this.issuing.set(person.userId);
    try {
      const url = await this.service.issueLink(person);
      await this.toClipboard(url);
    } catch (error) {
      this.notify.error(error);
      // La personne a pu créer son accès entre l'affichage et le clic : la
      // file n'est plus à jour, on la relit plutôt que de laisser une ligne
      // morte sous les yeux.
      void this.load();
    } finally {
      this.issuing.set(null);
    }
  }

  private async toClipboard(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.notify.success('Lien copié — il expire, remettez-le sans tarder.');
    } catch {
      this.notify.success(`Lien à copier : ${url}`);
    }
  }
}
