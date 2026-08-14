import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldIconComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { NotifyService } from '../notify.service';
import {
  PendingAccessRowComponent,
  type PendingRow,
} from './pending-access-row/pending-access-row';
import { displayName, validUntil, waitingFor, type PendingAccess } from './pending-access.model';
import { PendingAccessService } from './pending-access.service';

/** Le compte d'un périmètre, ou `null` quand il est vide (pas de pastille). */
function count(people: readonly PendingAccess[], kind: PendingAccess['kind']): number | null {
  const found = people.filter((person) => person.kind === kind).length;
  return found === 0 ? null : found;
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
    FoldPageLayoutComponent,
    FoldButtonComponent,
    FoldIconComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldNavLayoutComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
    PendingAccessRowComponent,
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

  /**
   * La barre, avec son compte par périmètre. `null` plutôt que `0` : un badge
   * qui affiche zéro dit « regarde ici » pour ne rien montrer — l'absence de
   * pastille EST le zéro, et laisse la pastille vouloir dire quelque chose.
   */
  protected readonly tabs = computed<FoldTabItem[]>(() => [
    { key: 'client', label: 'Clients', badge: count(this.people(), 'client') },
    { key: 'staff', label: 'Équipe', badge: count(this.people(), 'staff') },
  ]);

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

  /**
   * `fold-tabs` rend une clé de type `string` — l'onglet, lui, n'a que deux
   * valeurs. On referme ici plutôt que d'élargir le signal : élargir ferait
   * accepter un troisième périmètre qui n'existe pas et donnerait une liste
   * vide sans que rien ne le signale.
   */
  protected selectTab(key: string): void {
    this.tab.set(key === 'staff' ? 'staff' : 'client');
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
      const link = await this.service.issueLink(person);
      await this.toClipboard(link.url, validUntil(link.expiresAt));
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

  private async toClipboard(url: string, until: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.notify.success(`Lien copié — valable jusqu'au ${until}.`);
    } catch {
      this.notify.success(`Lien à copier (valable jusqu'au ${until}) : ${url}`);
    }
  }
}
