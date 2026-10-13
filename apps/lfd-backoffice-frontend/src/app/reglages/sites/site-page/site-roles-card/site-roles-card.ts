import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import type { SiteRolesPayload, SiteSupply, SiteTransferMode, SiteView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { SitesService } from '../../sites.service';

/** Les rôles tels que l'écran les édite : exactement la charge du `PUT`. */
export function rolesOf(site: SiteView): SiteRolesPayload {
  return {
    handsOver: site.handsOver,
    supply: site.supply,
    dispatches: site.dispatches,
    transferMode: site.transferMode,
    counterSetupMinutes: site.counterSetupMinutes,
  };
}

/**
 * Les incohérences que le serveur refusera, dites AVANT l'envoi et avec ses
 * mots (`site-errors.ts`, relu le 2026-10-13). L'agrégat reste l'autorité :
 * ceci ne fait que l'annoncer.
 */
export function rolesIssues(roles: SiteRolesPayload): readonly string[] {
  const issues: string[] = [];
  if (roles.supply === 'transfer' && !roles.handsOver) {
    issues.push(
      'Un site approvisionné par transfert doit remettre des commandes : cochez « Remet des commandes », ou approvisionnez-le sur place.',
    );
  }
  if (roles.dispatches && roles.supply === 'transfer') {
    issues.push(
      "Un site d'où partent les livraisons doit être approvisionné sur place : changez l'approvisionnement, ou décochez « Expédie ».",
    );
  }
  if (!Number.isInteger(roles.counterSetupMinutes) || roles.counterSetupMinutes < 0) {
    issues.push('La mise en place se compte en minutes entières, 0 ou plus.');
  }
  return issues;
}

const SUPPLY_OPTIONS: readonly { readonly value: SiteSupply; readonly label: string }[] = [
  { value: 'on_site', label: 'Sur place — fabriqué et colisé ici' },
  { value: 'transfer', label: 'Par transfert depuis le fournil' },
];

const TRANSFER_MODE_OPTIONS: readonly {
  readonly value: SiteTransferMode;
  readonly label: string;
}[] = [
  { value: 'integrated', label: 'Intégré à une tournée pro du jour' },
  { value: 'dedicated', label: 'Dédié — une tournée à lui' },
];

/**
 * **Les rôles d'un site** — remet, approvisionnement, expédie, mise en place
 * (plan des sites, §3.1). Une carte à part, avec son propre enregistrement :
 * l'API les prend en bloc (`PUT …/roles`), parce que leur cohérence se juge
 * sur l'ensemble, et un refus ici ne doit pas faire échouer l'adresse.
 */
@Component({
  selector: 'app-site-roles-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldListboxComponent,
    FoldNumberInputComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './site-roles-card.html',
  styleUrl: './site-roles-card.scss',
})
export class SiteRolesCard {
  private readonly sites = inject(SitesService);
  private readonly notify = inject(NotifyService);

  readonly site = input.required<SiteView>();
  /** Lecture seule : un site archivé ne se modifie plus. */
  readonly readOnly = input(false);
  /** Les rôles sont enregistrés : la page relit le site. */
  readonly saved = output();

  protected readonly supplyOptions = SUPPLY_OPTIONS;
  protected readonly transferModeOptions = TRANSFER_MODE_OPTIONS;

  /** Le brouillon, remis à l'état du serveur à chaque relecture du site. */
  protected readonly draft = linkedSignal(() => rolesOf(this.site()));
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly issues = computed(() => rolesIssues(this.draft()));
  protected readonly dirty = computed(() => {
    const draft = this.draft();
    const current = rolesOf(this.site());
    return (Object.keys(current) as (keyof SiteRolesPayload)[]).some(
      (key) => draft[key] !== current[key],
    );
  });
  protected readonly canSave = computed(
    () => !this.readOnly() && this.dirty() && this.issues().length === 0 && !this.saving(),
  );

  protected set<K extends keyof SiteRolesPayload>(key: K, value: SiteRolesPayload[K]): void {
    this.draft.update((current) => ({ ...current, [key]: value }));
    this.refusal.set(null);
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.sites.setRoles(this.site().id, this.draft());
      this.notify.success('Rôles du site enregistrés.');
      this.saved.emit();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "Les rôles du site n'ont pas pu être enregistrés."));
    } finally {
      this.saving.set(false);
    }
  }
}
