import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { DeclareLegalEntityPayload, LegalEntityView } from '@lfd/contracts';
import {
  FoldBackLinkComponent,
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDangerZoneComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInlineConfirmComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
  FoldToastService,
  type FoldBadgeVariant,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { DeclarePanel } from '../declare-panel/declare-panel';
import { LegalEntitiesService } from '../../legal-entities.service';
import { MandateSettingsCard } from './mandate-settings-card/mandate-settings-card';
import { CreditorAccountCard } from './creditor-account-card/creditor-account-card';
import { BillingModesCard } from './billing-modes-card/billing-modes-card';
import { CollectionSettingsCard } from './collection-settings-card/collection-settings-card';
import { InvoicePrefixCard } from './invoice-prefix-card/invoice-prefix-card';
import { InvoiceTermsCard } from './invoice-terms-card/invoice-terms-card';
import { AccountBankExportCard } from './account-bank-export-card/account-bank-export-card';
import { MandateBankExportCard } from './mandate-bank-export-card/mandate-bank-export-card';
import { legalEntityStateLabel, legalEntityStateVariant } from '../../legal-entity-state';
import { SampleMandateActions } from './sample-mandate-actions/sample-mandate-actions';

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
 * Le compte, et son IBAN qui ne revient jamais du serveur, vivent dans
 * `CreditorAccountCard`.
 *
 * ## Le mandat d'exemple suit `canCollect`, jamais l'envie
 *
 * Ses deux gestes vivent dans `SampleMandateActions`, qui le justifie.
 *
 * ## L'archivage est la zone de danger de cette fiche
 *
 * Il est le seul geste de l'écran qui RETIRE quelque chose, d'où le cadre
 * `fold-danger-zone` : sa destructivité se lit avant le clic, pas dans la boîte
 * de confirmation. La remise en service, elle, ne peut qu'ajouter un émetteur —
 * elle garde une carte ordinaire.
 *
 * 🔴 **Inactif quand l'entité est la dernière en service** (`isLastActive`) : le
 * serveur refuse en 409, et l'écran nomme la sortie — déclarer la remplaçante,
 * qui s'ouvre depuis le même endroit. Un bouton dont la seule issue est une
 * erreur est une affordance qui ment, exactement comme le champ ICS refermé.
 */
@Component({
  selector: 'app-legal-entity-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDangerZoneComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldInlineConfirmComponent,
    FoldInputComponent,
    CreditorAccountCard,
    SampleMandateActions,
    MandateSettingsCard,
    BillingModesCard,
    CollectionSettingsCard,
    InvoicePrefixCard,
    InvoiceTermsCard,
    AccountBankExportCard,
    MandateBankExportCard,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './legal-entity-detail-page.html',
  styleUrl: './legal-entity-detail-page.scss',
})
export class LegalEntityDetailPage {
  private readonly api = inject(LegalEntitiesService);
  private readonly toasts = inject(FoldToastService);
  private readonly panels = inject(FoldPanelHostService);

  /** L'identifiant de la route (`withComponentInputBinding`). */
  readonly id = input.required<string>();

  protected readonly entity = signal<LegalEntityView | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** L'échec de la LECTURE, distinct d'un échec d'écriture : rien à l'écran. */
  protected readonly loadFailed = signal(false);

  protected readonly icsDraft = signal('');

  /**
   * L'état affiché à côté du titre — la MÊME formulation que la colonne « État »
   * de la liste, parce qu'elle vient du même endroit.
   */
  protected readonly stateLabel = computed(() => {
    const entity = this.entity();
    return entity === null ? '' : legalEntityStateLabel(entity);
  });

  protected readonly stateVariant = computed<FoldBadgeVariant>(() => {
    const entity = this.entity();
    return entity === null ? 'neutral' : legalEntityStateVariant(entity);
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
      const loaded = await this.api.one(id);
      this.entity.set(loaded);
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

  /**
   * Déclarer une entité **sans quitter la fiche** — la sortie de l'impasse.
   *
   * Le geste vit aussi sur la liste ; il est repris ici parce que c'est ici
   * qu'on découvre qu'il manque une remplaçante. Renvoyer vers la liste
   * demanderait de retrouver le bouton, puis de revenir : trois écrans pour un
   * blocage énoncé en une phrase.
   *
   * La relecture qui suit (`run`) est ce qui fait tomber `isLastActive` et
   * rouvre l'archivage — le serveur seul sait combien d'entités sont en
   * service.
   */
  protected async declare(): Promise<void> {
    const payload = await this.panels.open<DeclareLegalEntityPayload | null>(DeclarePanel, {
      width: 'md',
    }).closed;
    if (payload === undefined || payload === null) {
      return;
    }
    await this.run(() => this.api.declare(payload), 'Entité déclarée.');
  }

  protected async setArchived(entity: LegalEntityView, archived: boolean): Promise<void> {
    await this.run(
      () => this.api.setArchived(entity.id, archived),
      archived ? 'Entité archivée.' : 'Entité remise en service.',
    );
  }

  /**
   * Exécute ce qu'une carte fille demande, puis relit — comme les gestes de la
   * page elle-même.
   *
   * La carte des mandats n'appelle pas `run` directement : elle **décrit** son
   * geste et le remonte. C'est la page qui détient l'état de chargement, le
   * message d'erreur et la relecture ; les dupliquer dans chaque carte ferait
   * deux façons de dire « enregistré », et deux entités relues différemment.
   */
  protected runSaved(request: {
    readonly action: () => Promise<unknown>;
    readonly said: string;
  }): void {
    void this.run(request.action, request.said);
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
      const reloaded = await this.api.one(this.id());
      this.entity.set(reloaded);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Enregistrement impossible.'));
    } finally {
      this.busy.set(false);
    }
  }
}
