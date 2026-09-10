import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { LegalEntityView } from '@lfd/contracts';
import { PRE_NOTIFICATION_MAX_DAYS, PRE_NOTIFICATION_MIN_DAYS } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInfoComponent,
  FoldInlineConfirmComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldToastService,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { saveBlob } from '../../../shared/download/save-blob';
import { LegalEntitiesService } from '../../legal-entities.service';

/**
 * **La fiche d'une entité juridique** — tout ce qui se règle sur un émetteur.
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
 *
 * ## Le mandat d'exemple suit `canCollect`, jamais l'envie
 *
 * Le serveur refuse en **409** de rendre un mandat sans ICS ni compte : il
 * imprimerait des cases vides sur un document qu'on fait signer. Le bouton est
 * donc inactif tant que l'entité ne peut pas encaisser, et dit ce qui manque —
 * un bouton actif dont la seule issue est une erreur est une affordance qui
 * ment, exactement comme le champ ICS rouvert.
 */
@Component({
  selector: 'app-legal-entity-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldInfoComponent,
    FoldInlineConfirmComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './legal-entity-detail-page.html',
  styleUrl: './legal-entity-detail-page.scss',
})
export class LegalEntityDetailPage {
  private readonly api = inject(LegalEntitiesService);
  private readonly toasts = inject(FoldToastService);

  /** L'identifiant de la route (`withComponentInputBinding`). */
  readonly id = input.required<string>();

  protected readonly entity = signal<LegalEntityView | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** L'échec de la LECTURE, distinct d'un échec d'écriture : rien à l'écran. */
  protected readonly loadFailed = signal(false);

  protected readonly minDays = PRE_NOTIFICATION_MIN_DAYS;
  protected readonly maxDays = PRE_NOTIFICATION_MAX_DAYS;

  protected readonly icsDraft = signal('');
  protected readonly ibanDraft = signal('');
  protected readonly daysDraft = signal<number | null>(null);

  /** Le délai en cours d'édition, ou celui que porte l'entité. */
  protected readonly days = computed(
    () => this.daysDraft() ?? this.entity()?.preNotificationDays ?? null,
  );

  /** Ce qui manque pour encaisser, avec les mots du serveur. */
  protected readonly mandateHint = computed(() => {
    const entity = this.entity();
    if (entity === null || entity.canCollect) {
      return '';
    }
    return `Le mandat ne peut pas être rempli : il manque ${entity.missingToCollect.join(', ')}.`;
  });

  constructor() {
    // Par un `effect` et non dans le constructeur : un `input.required` n'est
    // pas encore fourni à la construction, et le routeur peut changer le
    // segment sans reconstruire la page.
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async load(id: string): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.error.set(null);
    try {
      this.entity.set(await this.api.one(id));
    } catch (caught) {
      this.loadFailed.set(true);
      this.error.set(httpErrorMessage(caught, 'Entité illisible.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Le capital, en euros — il est porté en centimes, comme tout l'argent du dépôt. */
  protected euros(cents: number): string {
    return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  }

  protected async assignIcs(entity: LegalEntityView): Promise<void> {
    const ics = this.icsDraft().trim();
    if (ics === '') {
      return;
    }
    await this.run(
      () => this.api.assignCreditorIdentifier(entity.id, { ics }),
      'Identifiant créancier enregistré.',
    );
  }

  protected async setAccount(entity: LegalEntityView): Promise<void> {
    const iban = this.ibanDraft().trim();
    if (iban === '') {
      return;
    }
    await this.run(() => this.api.setCreditorAccount(entity.id, { iban }), 'Compte enregistré.');
    // Le champ se vide même en cas d'échec : un IBAN reste à l'écran tant qu'on
    // ne l'efface pas, et un écran de back-office reste ouvert des heures.
    this.ibanDraft.set('');
  }

  protected async savePreNotification(entity: LegalEntityView): Promise<void> {
    const days = this.days();
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
   * Le mandat d'exemple, et son échec DIT.
   *
   * Un téléchargement qui rate ne laisse aucune trace à l'écran — pas d'onglet,
   * pas de fichier, rien. Sans ce message, l'utilisateur reclique, et conclut
   * que le bouton ne marche pas.
   */
  protected async downloadMandate(entity: LegalEntityView): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      saveBlob(await this.api.sampleMandate(entity.id), 'mandat-sepa-exemple.pdf');
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Mandat d’exemple indisponible.'));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Une écriture, puis une **relecture** — jamais une mise à jour locale.
   *
   * Le serveur seul sait ce que l'entité est devenue : `canCollect` et
   * `missingToCollect` sont calculés par l'agrégat, et les deviner ici les
   * ferait diverger au premier ajout de condition.
   */
  private async run(action: () => Promise<unknown>, said: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      this.toasts.show(said, 'success');
      this.entity.set(await this.api.one(this.id()));
      this.daysDraft.set(null);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Enregistrement impossible.'));
    } finally {
      this.busy.set(false);
    }
  }
}
