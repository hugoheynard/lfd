import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { CreateSubAccountPayload } from '@lfd/contracts';
import { formatSiret } from '@lfd/b2b-ui/company';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
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
}

/**
 * Ce qu'est le sous-compte, choisi AVANT le nom (Hugo, 2026-10-05) :
 *
 * - `site` — un lieu de la même société (le chalet). Même entité légale : il
 *   suit la facturation (`billing`) dès sa création, sans identité propre ;
 * - `entity` — une société distincte (l'établissement Club Med), qui règle
 *   en son nom ; son identité se complète sur sa fiche.
 */
export type SubAccountKind = 'site' | 'entity';

const KIND_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'site', label: 'Un site de cette société' },
  { value: 'entity', label: 'Une entité distincte' },
];

/**
 * **Créer un sous-compte** — la sorte et le nom, rien d'autre (décision de
 * Hugo, 2026-10-05). Il naît en attente, et l'écran ouvre aussitôt sa fiche
 * (Informations) : adresse, identité légale d'une entité, contacts se
 * complètent par les écrans existants, et les cases « Suivre » dans leurs
 * onglets. L'activation, elle, garde toutes ses exigences.
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
    FoldFieldsetComponent,
    FoldInputComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './sub-account-panel.html',
  styleUrl: './sub-account-panel.scss',
})
export class SubAccountPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'md' };

  private readonly service = inject(AdminCompanyHierarchyService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  private readonly ref = inject(FoldPanelRef<string>);

  readonly data = input.required<SubAccountPanelData>();

  protected readonly kindOptions = KIND_OPTIONS;
  /** `null` tant que rien n'est choisi. */
  protected readonly kind = signal<SubAccountKind | null>(null);
  /** L'enseigne : le nom du site, ou celui de l'entité. */
  protected readonly name = signal('');
  protected readonly submitting = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** « Facturé au nom de … — SIRET …, TVA … », ce qu'un site ne saisit pas. */
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
    if (this.kind() === null) {
      return 'Choisissez d’abord : un site de cette société, ou une entité distincte.';
    }
    return this.name().trim() === '' ? 'Saisissez son nom.' : '';
  });

  protected chooseKind(value: string): void {
    if (value === 'site' || value === 'entity') {
      this.kind.set(value);
    }
  }

  protected async submit(): Promise<void> {
    if (this.issue() !== '' || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.refusal.set(null);
    try {
      const id = await this.service.createSubAccount(this.data().parentId, this.payload());
      this.notify.success(`Sous-compte créé sous ${this.data().parentName}. Complétez sa fiche.`);
      this.ref.close(id);
      void this.router.navigate(['/comptes-clients', id, 'informations']);
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
    return {
      raisonSociale: '',
      enseigne: this.name().trim(),
      formeJuridique: '',
      siret: '',
      siren: '',
      vatNumber: '',
      // Un site suit la facturation dès sa naissance : c'est ce que veut dire « site ».
      follows: this.kind() === 'site' ? ['billing'] : [],
    };
  }
}
