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
import { PRE_NOTIFICATION_MAX_DAYS, PRE_NOTIFICATION_MIN_DAYS } from '@lfd/contracts';
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
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
  FoldToastService,
  type FoldBadgeVariant,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { saveBlob } from '../../../shared/download/save-blob';
import { DeclarePanel } from '../declare-panel/declare-panel';
import { LegalEntitiesService } from '../../legal-entities.service';
import { MandateSettingsCard } from './mandate-settings-card/mandate-settings-card';
import { legalEntityStateLabel, legalEntityStateVariant } from '../../legal-entity-state';
import { MandatePanel, type MandatePanelData } from './mandate-panel/mandate-panel';

/** Le nom du fichier, écrit UNE fois : la fiche le donne au panneau qui l'enregistre. */
const MANDATE_FILE_NAME = 'mandat-sepa-exemple.pdf';

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
 * imprimerait des cases vides sur un document qu'on fait signer. Les deux
 * boutons sont donc inactifs tant que l'entité ne peut pas encaisser, et la
 * fiche dit ce qui manque — un bouton actif dont la seule issue est une erreur
 * est une affordance qui ment, exactement comme le champ ICS rouvert.
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
 *
 * **Deux gestes, pas un.** « Voir » ouvre la fiche **dans un panneau modal de
 * la page**, « Télécharger » l'enregistre. Contrôler une adresse ou un ICS à
 * l'écran est le geste courant, accumuler des PDF dans un dossier de
 * téléchargements en est le contraire — d'où l'ordre, « Voir » en premier et en
 * emphase.
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
    MandateSettingsCard,
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
  private readonly panels = inject(FoldPanelHostService);

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
  protected readonly bicDraft = signal('');
  protected readonly holderDraft = signal('');
  protected readonly line1Draft = signal('');
  protected readonly line2Draft = signal('');
  protected readonly postalCodeDraft = signal('');
  protected readonly cityDraft = signal('');
  protected readonly countryDraft = signal('FR');

  /**
   * Le RIB se recopie en entier, donc le bouton attend TOUT — sauf le
   * complément d'adresse, qui est facultatif sur un vrai RIB.
   */
  protected readonly accountComplete = computed(
    () =>
      this.ibanDraft().trim() !== '' &&
      this.bicDraft().trim() !== '' &&
      this.holderDraft().trim() !== '' &&
      this.line1Draft().trim() !== '' &&
      this.postalCodeDraft().trim() !== '' &&
      this.cityDraft().trim() !== '' &&
      this.countryDraft().trim() !== '',
  );
  protected readonly daysDraft = signal<number | null>(null);

  /** Le délai en cours d'édition, ou celui que porte l'entité. */
  protected readonly days = computed(
    () => this.daysDraft() ?? this.entity()?.preNotificationDays ?? null,
  );

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
      this.fillAccountDrafts(loaded);
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
    if (!this.accountComplete()) {
      return;
    }
    await this.run(
      () =>
        this.api.setCreditorAccount(entity.id, {
          iban: this.ibanDraft().trim(),
          bic: this.bicDraft().trim(),
          holder: this.holderDraft().trim(),
          line1: this.line1Draft().trim(),
          line2: this.line2Draft().trim(),
          postalCode: this.postalCodeDraft().trim(),
          city: this.cityDraft().trim(),
          countryCode: this.countryDraft().trim().toUpperCase(),
        }),
      'Compte enregistré.',
    );
    // 🔴 Seul l'IBAN se vide. Les autres champs se REPRENNENT de la fiche
    // relue : ils reviennent du serveur, et les effacer donnerait l'impression
    // d'avoir perdu ce qu'on vient d'enregistrer. L'IBAN, lui, ne revient
    // d'aucune route — le laisser à l'écran le ferait traîner sur un poste de
    // back-office ouvert des heures.
    this.ibanDraft.set('');
  }

  /** Préremplit la recopie du RIB avec ce que le serveur vient de rendre. */
  private fillAccountDrafts(entity: LegalEntityView): void {
    this.bicDraft.set(entity.creditorBic);
    this.holderDraft.set(entity.creditorAccountHolder);
    this.line1Draft.set(entity.creditorAccountLine1);
    this.line2Draft.set(entity.creditorAccountLine2);
    this.postalCodeDraft.set(entity.creditorAccountPostalCode);
    this.cityDraft.set(entity.creditorAccountCity);
    this.countryDraft.set(
      entity.creditorAccountCountryCode === '' ? 'FR' : entity.creditorAccountCountryCode,
    );
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
   * Le mandat d'exemple, et son échec DIT.
   *
   * Un téléchargement qui rate ne laisse aucune trace à l'écran — pas d'onglet,
   * pas de fichier, rien. Sans ce message, l'utilisateur reclique, et conclut
   * que le bouton ne marche pas.
   */
  protected async downloadMandate(entity: LegalEntityView): Promise<void> {
    await this.withMandate(entity, { inline: false }, (blob) => {
      saveBlob(blob, MANDATE_FILE_NAME);
      return null;
    });
  }

  /**
   * Le même mandat, REGARDÉ — dans un panneau modal, sans quitter la fiche.
   *
   * Pas de `<a href>` sur la route : elle est derrière le jeton staff, et une
   * navigation nue rendrait un 401 en page blanche. Les octets viennent donc
   * par `HttpClient`, et le panneau les affiche à partir d'une URL d'objet
   * qu'il révoque en se fermant.
   *
   * `inline` reste demandé au serveur, mais il ne décide plus du rendu : un
   * `blob:` n'a pas de `Content-Disposition`, c'est le type MIME du blob qui
   * fait afficher le PDF. Le paramètre ne dit donc plus que l'intention de la
   * requête — et il est la seule chose qui distingue encore les deux appels
   * côté serveur.
   */
  protected async viewMandate(entity: LegalEntityView): Promise<void> {
    await this.withMandate(entity, { inline: true }, (blob) => {
      const data: MandatePanelData = {
        blob,
        entityName: entity.name,
        fileName: MANDATE_FILE_NAME,
      };
      // La largeur et la surface opaque sont déclarées par le panneau lui-même
      // (`MandatePanel.foldPanel`) : un A4 est large et opaque partout.
      this.panels.open<MandatePanelData>(MandatePanel, { data });
      return null;
    });
  }

  /** Le va-et-vient commun aux deux gestes : occupé, échec DIT, repos. */
  private async withMandate(
    entity: LegalEntityView,
    options: { readonly inline: boolean },
    hand: (blob: Blob) => string | null,
  ): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.error.set(hand(await this.api.sampleMandate(entity.id, options)));
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

  private async run(action: () => Promise<unknown>, said: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      this.toasts.show(said, 'success');
      const reloaded = await this.api.one(this.id());
      this.entity.set(reloaded);
      this.fillAccountDrafts(reloaded);
      this.daysDraft.set(null);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Enregistrement impossible.'));
    } finally {
      this.busy.set(false);
    }
  }
}
