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
import type { SiteView } from '@lfd/contracts';
import { AddressForm, type PostalAddress } from '@lfd/b2b-ui/address';
import {
  EMPTY_POSTAL_DRAFT,
  postalDraftFrom,
  postalIssue,
  toBillingPayload,
  toPostal,
  withPostal,
} from '@lfd/b2b-ui/company';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { EMPTY_OPENING } from '../../../../b2b/reglages/pickup-opening.model';
import { NotifyService } from '../../../../notify.service';
import { SitesService } from '../../sites.service';
import { placePayload } from '../site-place-payload';

/** L'adresse : la part du lieu que cette carte écrit. */
type SiteIdentity = ReturnType<typeof toBillingPayload>;

/**
 * **Identité et adresse d'un site** — et sa création (Hugo, 2026-10-13 :
 * chaque carte enregistre ce qu'elle montre). Sans `site`, la carte CRÉE :
 * un seul « Ajouter », puisque rien n'existe encore. Avec un site, elle
 * n'écrit que l'adresse, sur le lieu ENREGISTRÉ (`placePayload`) : heures et
 * réduction ont leurs sous-cartes. Le « site par défaut » a disparu le
 * 2026-10-15 (Hugo) : la présélection du retrait se décide par client.
 */
@Component({
  selector: 'app-site-identity-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddressForm,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './site-identity-card.html',
})
export class SiteIdentityCard {
  private readonly sites = inject(SitesService);
  private readonly notify = inject(NotifyService);

  /** `null` : la carte crée un site. */
  readonly site = input<SiteView | null>(null);
  readonly readOnly = input(false);
  /** L'adresse est enregistrée : la page relit le site. */
  readonly saved = output();
  /** Le site est créé : la page mène à sa page. */
  readonly created = output<string>();

  protected readonly draft = linkedSignal(() => {
    const site = this.site();
    return site === null ? EMPTY_POSTAL_DRAFT : postalDraftFrom(site);
  });
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly isCreate = computed(() => this.site() === null);
  protected readonly postal = computed(() => toPostal(this.draft()));
  protected readonly dirty = computed(() => {
    const site = this.site();
    return site !== null && JSON.stringify(this.draft()) !== JSON.stringify(postalDraftFrom(site));
  });
  protected readonly canSave = computed(
    () =>
      !this.readOnly() &&
      (this.isCreate() || this.dirty()) &&
      postalIssue(this.draft()) === '' &&
      !this.saving(),
  );

  protected setPostal(postal: PostalAddress): void {
    this.draft.update((draft) => withPostal(draft, postal));
    this.refusal.set(null);
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const identity: SiteIdentity = toBillingPayload(this.draft());
    const site = this.site();
    try {
      if (site === null) {
        await this.create(identity);
      } else {
        await this.sites.update(site.id, placePayload(site, identity));
        this.notify.success('Adresse du site enregistrée.');
        this.saved.emit();
      }
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "Le site n'a pas pu être enregistré."));
    } finally {
      this.saving.set(false);
    }
  }

  /** Le reste — heures, réduction, rôles — se règle une fois le site créé. */
  private async create(identity: SiteIdentity): Promise<void> {
    const created = await this.sites.create({
      ...identity,
      discounts: { b2b: null, b2c: null },
      opening: EMPTY_OPENING,
    });
    this.notify.success('Site ajouté.');
    this.created.emit(created.id);
  }
}
