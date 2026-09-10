import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DeclareLegalEntityPayload, LegalEntityView } from '@lfd/contracts';
import { PRE_NOTIFICATION_MAX_DAYS, PRE_NOTIFICATION_MIN_DAYS } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInlineConfirmComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
  FoldToastService,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { LegalEntitiesService } from '../legal-entities.service';
import { DeclarePanel } from './declare-panel/declare-panel';

/**
 * **Comptabilité › Entités juridiques** — qui encaisse, et sous quelle identité.
 *
 * ## Ce que l'écran doit dire avant tout le reste
 *
 * Une entité neuve **ne peut pas encaisser**, et c'est un état normal qui dure
 * des semaines : l'ICS arrive de la Banque de France longtemps après la
 * déclaration. Une fiche qui ressemblerait à une fiche complète pendant ce
 * temps-là ferait croire le prélèvement prêt — et le manque se découvrirait au
 * premier lot, c'est-à-dire un mois trop tard.
 *
 * D'où le parti pris : le statut est en tête, il est **rédigé par le serveur**
 * (`missingToCollect`), et l'écran ne le recalcule pas. Le recalculer ici ferait
 * une seconde définition de « complète », et celle que l'utilisateur lit serait
 * la moins surveillée des deux.
 *
 * ## Trois réglages, trois traitements différents
 *
 * - **L'ICS ne se saisit qu'une fois.** Posé, il devient une ligne de lecture
 *   avec sa raison écrite. Laisser un champ ouvert qui rendrait 409 est une
 *   affordance qui ment — c'est la même règle que le crayon des révisions.
 * - **Le compte se change librement** : on change de banque, et aucun mandat
 *   signé ne porte l'IBAN créancier.
 * - **Le délai de pré-notification est une clause négociée**, pas une constante
 *   de déploiement : deux entités peuvent ne pas avoir le même.
 *
 * 🔴 L'IBAN ne revient jamais du serveur. Le champ est donc toujours vide à
 * l'ouverture, même quand un compte est enregistré — ce que la ligne
 * « •••• 2606 » explique juste au-dessus.
 */
@Component({
  selector: 'app-entites-juridiques-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldInlineConfirmComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './entites-juridiques-page.html',
  styleUrl: './entites-juridiques-page.scss',
})
export class EntitesJuridiquesPage {
  private readonly api = inject(LegalEntitiesService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly toasts = inject(FoldToastService);

  protected readonly entities = signal<readonly LegalEntityView[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly minDays = PRE_NOTIFICATION_MIN_DAYS;
  protected readonly maxDays = PRE_NOTIFICATION_MAX_DAYS;

  /** Les brouillons de saisie, par entité — l'écran en porte plusieurs à la fois. */
  protected readonly icsDraft = signal<Record<string, string>>({});
  protected readonly ibanDraft = signal<Record<string, string>>({});
  protected readonly daysDraft = signal<Record<string, number | null>>({});

  /**
   * Aucune entité ne peut encaisser — l'avertissement de tête.
   *
   * Montré tant que RIEN n'est prêt, et non par entité : c'est l'état du système
   * qui compte ici. Une seule entité capable suffit à prélever, et répéter
   * l'alerte sur les autres ferait du bruit sur une fiche en cours de montage.
   */
  protected readonly noneCanCollect = computed(
    () => this.entities().length > 0 && this.entities().every((entity) => !entity.canCollect),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.entities.set(await this.api.list());
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Entités juridiques illisibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected icsOf(id: string): string {
    return this.icsDraft()[id] ?? '';
  }

  protected setIcs(id: string, value: string): void {
    this.icsDraft.update((drafts) => ({ ...drafts, [id]: value }));
  }

  protected ibanOf(id: string): string {
    return this.ibanDraft()[id] ?? '';
  }

  protected setIban(id: string, value: string): void {
    this.ibanDraft.update((drafts) => ({ ...drafts, [id]: value }));
  }

  protected daysOf(entity: LegalEntityView): number | null {
    return this.daysDraft()[entity.id] ?? entity.preNotificationDays;
  }

  protected setDays(id: string, value: number | null): void {
    this.daysDraft.update((drafts) => ({ ...drafts, [id]: value }));
  }

  /** Le capital, en euros — il est porté en centimes, comme tout l'argent du dépôt. */
  protected euros(cents: number): string {
    return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  }

  protected async declare(): Promise<void> {
    const payload = await this.panels.open<DeclareLegalEntityPayload | null>(DeclarePanel, {
      width: 'md',
    }).closed;
    if (payload === undefined || payload === null) {
      return;
    }
    await this.run(() => this.api.declare(payload), 'Entité déclarée.');
  }

  protected async assignIcs(entity: LegalEntityView): Promise<void> {
    const ics = this.icsOf(entity.id).trim();
    if (ics === '') {
      return;
    }
    await this.run(
      () => this.api.assignCreditorIdentifier(entity.id, { ics }),
      'Identifiant créancier enregistré.',
    );
  }

  protected async setAccount(entity: LegalEntityView): Promise<void> {
    const iban = this.ibanOf(entity.id).trim();
    if (iban === '') {
      return;
    }
    await this.run(() => this.api.setCreditorAccount(entity.id, { iban }), 'Compte enregistré.');
    // Le champ se vide même en cas d'échec : un IBAN reste à l'écran tant qu'on
    // ne l'efface pas, et un écran de back-office reste ouvert des heures.
    this.setIban(entity.id, '');
  }

  protected async savePreNotification(entity: LegalEntityView): Promise<void> {
    const days = this.daysOf(entity);
    if (days === null) {
      return;
    }
    await this.run(
      () => this.api.setPreNotification(entity.id, { days }),
      'Délai de pré-notification enregistré.',
    );
  }

  protected async setArchived(entity: LegalEntityView, archived: boolean): Promise<void> {
    await this.run(
      () => this.api.setArchived(entity.id, archived),
      archived ? 'Entité archivée.' : 'Entité remise en service.',
    );
  }

  /**
   * Une écriture, puis une **relecture** — jamais une mise à jour locale.
   *
   * Le serveur seul sait ce que l'entité est devenue : `canCollect` et
   * `missingToCollect` sont calculés par l'agrégat, et les deviner ici les
   * ferait diverger au premier ajout de condition. Le prix est un aller-retour
   * sur une liste de deux lignes.
   */
  private async run(action: () => Promise<unknown>, said: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      this.toasts.show(said, 'success');
      this.entities.set(await this.api.list());
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Enregistrement impossible.'));
    } finally {
      this.busy.set(false);
    }
  }
}
