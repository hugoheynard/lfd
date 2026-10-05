import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { CompanyFollowAspect, CreateSubAccountPayload, WindowMode } from '@lfd/contracts';
import {
  CompanyIdentityFields,
  DeliveryAddressForm,
  EMPTY_COMPANY_IDENTITY_DRAFT,
  EMPTY_DELIVERY_DRAFT,
  deliveryIssueOf,
  formatSiret,
  toDeliveryPayload,
  type CompanyIdentityDraft,
  type DeliveryDraft,
} from '@lfd/b2b-ui/company';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldFieldsetComponent,
  FoldInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldViewToggleComponent,
  type FoldPanelDefaults,
  type FoldViewToggleOption,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { AdminCompanyHierarchyService } from '../../../comptes-clients/admin-company-hierarchy.service';
import { NotifyService } from '../../../notify.service';

/** Charge d'ouverture : le principal sous lequel le sous-compte naît. */
export interface SubAccountPanelData {
  readonly parentId: string;
  /** Le nom d'usage du principal. */
  readonly parentName: string;
  /** Son identité légale — montrée en lecture pour un site, qui est facturé à ce nom. */
  readonly parentRaisonSociale: string;
  readonly parentSiret: string;
  readonly parentVatNumber: string;
  /** Proposé à une entité distincte : un établissement a le SIREN de son siège. */
  readonly parentSiren: string;
  /** Le réglage général « créneau ou échéance », dont l'adresse hérite (CA-D2). */
  readonly globalWindowMode: WindowMode;
}

/**
 * Ce qu'est le sous-compte, choisi AVANT tout champ (Hugo, 2026-10-05 : « un
 * chalet, il a la même raison sociale et tout ? ») :
 *
 * - `site` — un lieu de la même société (le chalet). Même entité légale : il
 *   suit la facturation (`billing`), et n'a aucune identité légale propre ;
 * - `entity` — une société distincte (l'établissement Club Med), qui règle
 *   en son nom. `billing` n'est pas proposé.
 */
export type SubAccountKind = 'site' | 'entity';

/** Un SIRET : quatorze chiffres, espaces tolérés à la saisie. */
const SIRET_DIGITS = 14;

const KIND_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'site', label: 'Un site de cette société' },
  { value: 'entity', label: 'Une entité distincte' },
];

/**
 * **Créer un sous-compte** (`plan-sous-comptes.md` §4, §2.1 bis). Il naît en
 * attente, comme toute création staff, et s'active par le chemin existant.
 *
 * Le choix « site / entité distincte » vient en tête parce qu'il décide de
 * tout le reste : un site n'a ni SIRET ni raison sociale à saisir, il est
 * facturé au nom du principal — l'écran le montre en lecture plutôt que de
 * laisser croire qu'il faudrait les recopier.
 *
 * Le tarif du principal n'est proposé qu'à qui a `b2b_pricing:write`, et
 * jamais coché d'office (Q9). Un refus du serveur reste dans le panneau, tel
 * quel.
 */
@Component({
  selector: 'app-sub-account-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldFieldsetComponent,
    FoldInputComponent,
    FoldViewToggleComponent,
    CompanyIdentityFields,
    DeliveryAddressForm,
  ],
  templateUrl: './sub-account-panel.html',
  styleUrl: './sub-account-panel.scss',
})
export class SubAccountPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'lg' };

  private readonly service = inject(AdminCompanyHierarchyService);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<string>);

  readonly data = input.required<SubAccountPanelData>();

  protected readonly kindOptions = KIND_OPTIONS;
  /** `null` tant que rien n'est choisi : aucun champ ne s'affiche avant. */
  protected readonly kind = signal<SubAccountKind | null>(null);

  /** Le nom d'un site — c'est son enseigne. */
  protected readonly siteName = signal('');
  /** `null` tant que rien n'est tapé : le SIREN du principal y est alors proposé. */
  private readonly typedIdentity = signal<CompanyIdentityDraft | null>(null);
  protected readonly identity = computed<CompanyIdentityDraft>(
    () =>
      this.typedIdentity() ?? { ...EMPTY_COMPANY_IDENTITY_DRAFT, siren: this.data().parentSiren },
  );
  protected readonly delivery = signal<DeliveryDraft>({ ...EMPTY_DELIVERY_DRAFT, isDefault: true });
  protected readonly sharesContacts = signal(false);
  protected readonly appliesPricing = signal(false);
  protected readonly submitting = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly canDecidePricing = computed(() => this.permissions.can('b2b_pricing:write'));

  /** « Facturé au nom de … — SIRET …, TVA … », ce qu'on ne saisit pas pour un site. */
  protected readonly billedAs = computed(() => {
    const data = this.data();
    const name =
      data.parentRaisonSociale.trim() === '' ? data.parentName : data.parentRaisonSociale;
    const ids = [
      data.parentSiret === '' ? '' : `SIRET ${formatSiret(data.parentSiret)}`,
      data.parentVatNumber === '' ? '' : `TVA ${data.parentVatNumber}`,
    ].filter((part) => part !== '');
    return ids.length === 0
      ? `Facturé au nom de ${name}`
      : `Facturé au nom de ${name} — ${ids.join(', ')}`;
  });

  /** Ce qui manque pour créer, en une phrase ; vide quand rien ne manque. */
  protected readonly issue = computed(() => {
    const kind = this.kind();
    if (kind === null) {
      return 'Choisissez d’abord : un site de cette société, ou une entité distincte.';
    }
    if (kind === 'site') {
      if (this.siteName().trim() === '') {
        return 'Saisissez le nom du site.';
      }
    } else {
      const identity = this.identity();
      if (identity.enseigne.trim() === '') {
        return 'Saisissez l’enseigne de l’entité.';
      }
      if (identity.raisonSociale.trim() === '') {
        return 'Une entité distincte est facturée en son nom : saisissez sa raison sociale.';
      }
      if (identity.siret.replace(/\s/gu, '').length !== SIRET_DIGITS) {
        return 'Une entité distincte est facturée en son nom : saisissez son SIRET (14 chiffres).';
      }
    }
    return deliveryIssueOf(this.delivery());
  });

  protected chooseKind(value: string): void {
    if (value === 'site' || value === 'entity') {
      this.kind.set(value);
    }
  }

  protected setIdentity(identity: CompanyIdentityDraft): void {
    this.typedIdentity.set(identity);
  }

  protected async submit(): Promise<void> {
    if (this.issue() !== '' || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.refusal.set(null);
    try {
      const id = await this.service.createSubAccount(this.data().parentId, this.payload());
      this.notify.success(`Sous-compte créé sous ${this.data().parentName}.`);
      this.ref.close(id);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le sous-compte n’a pas été créé.'));
    } finally {
      this.submitting.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }

  private payload(): CreateSubAccountPayload {
    const site = this.kind() === 'site';
    const identity = this.identity();
    return {
      // Un site n'a AUCUNE identité légale propre : c'est celle du principal (§2.1 bis).
      raisonSociale: site ? '' : identity.raisonSociale.trim(),
      enseigne: site ? this.siteName().trim() : identity.enseigne.trim(),
      formeJuridique: site ? '' : identity.formeJuridique.trim(),
      siret: site ? '' : identity.siret.replace(/\s/gu, ''),
      siren: site ? '' : identity.siren.replace(/\s/gu, ''),
      vatNumber: site ? '' : identity.vatNumber.trim(),
      deliveryAddress: toDeliveryPayload(this.delivery()),
      follows: this.follows(site),
    };
  }

  private follows(site: boolean): CompanyFollowAspect[] {
    const follows: CompanyFollowAspect[] = site ? ['billing'] : [];
    if (this.sharesContacts()) {
      follows.push('contacts');
    }
    // Ne part que si la case a pu être montrée (Q9).
    if (this.appliesPricing() && this.canDecidePricing()) {
      follows.push('pricing');
    }
    return follows;
  }
}
