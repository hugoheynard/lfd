import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ALL_DISCOUNT_AUDIENCES, type PickupAddressPayload, type SiteView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBackLinkComponent,
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldDangerZoneComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
} from 'fold-ng';
import { AddressForm, type PostalAddress } from '@lfd/b2b-ui/address';
import {
  EMPTY_POSTAL_DRAFT,
  postalDraftFrom,
  postalIssue,
  toBillingPayload,
  toPostal,
  withPostal,
  type PostalDraft,
} from '@lfd/b2b-ui/company';

import { NotifyService } from '../../../notify.service';
import { EMPTY_OPENING } from '../../../b2b/reglages/pickup-opening.model';
import { SITES_PATH } from '../sites-path';
import { SitesService } from '../sites.service';
import { PublicSlotsCard } from './public-slots-card/public-slots-card';
import { SiteDiscountCard } from './site-discount-card/site-discount-card';
import { SiteHoursCard } from './site-hours-card/site-hours-card';
import { placePayload } from './site-place-payload';
import { SiteRolesCard } from './site-roles-card/site-roles-card';

const NOT_FOUND = 404;

/**
 * **Un site** (Réglages › Sites, plan
 * `documentation/livraisons/transferts/plan-sites-transfert-interne-tri-et-couleurs.md`,
 * §3.4, lot S1) — l'ancienne page d'un point de retrait, élargie : un site EST
 * le point de retrait, même identifiant. Elle gagne les rôles, les couleurs et
 * l'archivage, chacun dans sa carte et avec son propre enregistrement (l'API
 * les prend en bloc, et un refus de l'un ne doit pas faire échouer l'autre).
 * Tout passe par `admin/sites`, sous `lfc_site_settings`.
 *
 * Ce qui suit est l'histoire de la page du point, toujours vraie.
 *
 * **Un point de retrait**, en page plutôt qu'en panneau.
 *
 * 🔴 **Pourquoi une page, alors que la règle « Saisir » dit un panneau.** La
 * convention du 2026-09-14 (`lfc-ecommerce-frontend/CLAUDE.md`) veut que
 * toute saisie s'ouvre dans un panneau fold, et elle nomme « une adresse ».
 * Elle a été écrite pour la BOUTIQUE (commit `6902e7a8`, `feat(boutique)`), où
 * ce qu'on saisit tient en un formulaire.
 *
 * Un point de retrait n'est plus une adresse : il porte l'adresse, son rang par
 * défaut, ses heures, sa réduction et les clientèles de cette réduction — et il
 * recevra ses créneaux publics, leurs badges, leurs capacités et les fermetures
 * datées (`documentation/commandes/plan-creneaux-de-retrait.md`). Six sujets, bientôt
 * huit, qu'on ne lit pas de haut en bas : on va directement à celui qu'on vient
 * régler. C'est le critère qui sépare une page d'un panneau dans ce
 * back-office, où six pages de détail suivent déjà ce motif. Décidé avec Hugo
 * le 2026-09-16 ; le `CLAUDE.md` de cette app porte la règle.
 *
 * Le même composant sert la création et l'édition : sans `id`, il n'y a rien à
 * charger et rien à supprimer.
 */
@Component({
  selector: 'app-site-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddressForm,
    PublicSlotsCard,
    SiteDiscountCard,
    SiteHoursCard,
    SiteRolesCard,
    FoldBackLinkComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldDangerZoneComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './site-page.html',
  styleUrl: './site-page.scss',
})
export class SitePage {
  private readonly sites = inject(SitesService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  /**
   * L'identifiant de la route (`withComponentInputBinding`), **absent** sur
   * `/nouveau` : c'est ce qui distingue la création de l'édition, sans second
   * composant ni drapeau à passer.
   */
  readonly id = input<string | undefined>(undefined);

  protected readonly draft = signal<PostalDraft>(EMPTY_POSTAL_DRAFT);
  /** Proposé d'office au checkout. Rang du point, pas champ d'adresse. */
  protected readonly isDefault = signal(false);

  /**
   * Le refus du serveur, en clair. Il reste SUR LA PAGE, au-dessus des cartes :
   * un toast disparaîtrait pendant qu'on cherche quoi corriger.
   */
  protected readonly refusal = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly loading = signal(true);
  /** L'`id` de la route ne désigne aucun site : l'écran le dit, et n'invente rien. */
  protected readonly notFound = signal(false);
  /** La lecture a échoué pour une autre raison : on propose de réessayer. */
  protected readonly loadFailed = signal(false);
  /** Le site tel que le serveur l'a rendu — ce que lisent les cartes à elles. */
  protected readonly site = signal<SiteView | null>(null);
  /** Les cartes du retrait : à la création, rien n'est encore décidé, on les montre. */
  protected readonly pickup = computed(() => this.site()?.pickup ?? true);
  /** Un site archivé ne se modifie plus (le serveur le refuse) : tout se fige. */
  protected readonly archived = computed(() => this.site()?.archivedAt != null);

  protected readonly isCreate = computed(() => this.id() === undefined);

  /**
   * La remise vue comme une altération de prix. Le sens est **structurel** —
   * retirer soi-même coûte moins cher, jamais plus — donc il ne se stocke pas.
   */

  /** L'adresse postale, dans la langue neutre du fragment de saisie. */
  protected readonly postal = computed(() => toPostal(this.draft()));

  /** Le titre EST le nom du point — sa ville à défaut, comme dans la liste. */
  protected readonly heading = computed(() => {
    if (this.isCreate()) {
      return 'Nouveau site';
    }
    const draft = this.draft();
    return draft.label || draft.ville || 'Site';
  });

  /** À la création : une adresse postable. Le reste se règle sur sa page. */
  protected readonly canSubmit = computed(() => postalIssue(this.draft()) === '');

  /** L'identité diffère de ce qui est enregistré (adresse ou rang par défaut). */
  protected readonly identityDirty = computed(() => {
    const site = this.site();
    return (
      site !== null &&
      (JSON.stringify(this.draft()) !== JSON.stringify(postalDraftFrom(site)) ||
        this.isDefault() !== site.isDefault)
    );
  });
  protected readonly canSaveIdentity = computed(
    () => this.identityDirty() && postalIssue(this.draft()) === '' && !this.saving(),
  );

  /**
   * Pourquoi ce site ne s'archive pas, ou `null`. Le serveur refuse le défaut
   * et celui d'où partent les livraisons (`site-errors.ts`, relu le
   * 2026-10-13) ; la zone le dit plutôt que d'offrir un geste refusé.
   */
  protected readonly archiveBlocker = computed(() => {
    const site = this.site();
    if (site === null || site.archivedAt !== null) {
      return null;
    }
    if (site.isDefault) {
      return 'C’est le site par défaut : désignez d’abord un autre site par défaut.';
    }
    if (site.deliveryDeparture) {
      return 'Les livraisons partent d’ici : décochez d’abord « Livraison » dans ses rôles.';
    }
    return null;
  });

  /**
   * Le libellé d'action de la zone dangereuse, ou `undefined` quand l'archivage
   * serait refusé : la zone reste alors un cadre qui explique sans rien offrir.
   */
  protected readonly deleteAction = computed(() =>
    this.site() !== null && this.archiveBlocker() === null && !this.archived()
      ? 'Archiver ce site'
      : undefined,
  );

  /** Ce qu'il faut taper pour archiver : le nom du site, ou sa ville sans nom. */
  protected readonly confirmPhrase = computed(() => {
    const draft = this.draft();
    return this.isCreate() ? '' : draft.label || draft.ville;
  });

  constructor() {
    // Par un `effect` et non dans le constructeur : un `input` de route n'est
    // pas encore fourni à la construction, et le routeur peut changer le
    // segment sans reconstruire la page.
    effect(() => {
      const id = this.id();
      if (id === undefined) {
        this.loading.set(false);
        return;
      }
      void this.load(id);
    });
  }

  /** Charge le site par sa lecture unitaire (`GET admin/sites/:id`). */
  protected async load(id: string): Promise<void> {
    this.loading.set(true);
    this.notFound.set(false);
    this.loadFailed.set(false);
    this.refusal.set(null);
    try {
      const site = await this.sites.get(id);
      this.site.set(site);
      this.fill(site);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === NOT_FOUND) {
        this.notFound.set(true);
      } else {
        this.loadFailed.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }

  /** Une carte a enregistré : on relit le site, sans faire clignoter la page. */
  protected async reload(): Promise<void> {
    const id = this.id();
    if (id === undefined) {
      return;
    }
    try {
      // Le site seul : les brouillons de l'identité ne sont pas touchés, une
      // carte qui enregistre n'écrase pas une saisie en cours d'une autre.
      this.site.set(await this.sites.get(id));
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le site n’a pas pu être relu.'));
    }
  }

  /** Recopie le site dans les brouillons de l'écran. */
  private fill(point: SiteView): void {
    this.draft.set(postalDraftFrom(point));
    this.isDefault.set(point.isDefault);
  }

  protected setPostal(postal: PostalAddress): void {
    this.draft.update((draft) => withPostal(draft, postal));
  }

  /**
   * Enregistre l'identité SEULE (adresse + rang par défaut), sur le lieu tel
   * qu'il est enregistré : heures et réduction ont leurs sous-cartes.
   */
  protected async saveIdentity(): Promise<void> {
    const site = this.site();
    if (site === null || !this.canSaveIdentity()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.sites.update(
        site.id,
        placePayload(site, { ...toBillingPayload(this.draft()), isDefault: this.isDefault() }),
      );
      this.notify.success('Adresse du site enregistrée.');
      await this.reload();
      const saved = this.site();
      if (saved !== null) {
        this.fill(saved);
      }
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "L'adresse du site n'a pas pu être enregistrée."));
    } finally {
      this.saving.set(false);
    }
  }

  /** La création : rien n'existe encore, un seul « Ajouter ». */
  protected async submit(): Promise<void> {
    if (!this.isCreate() || !this.canSubmit() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const payload: PickupAddressPayload = {
      ...toBillingPayload(this.draft()),
      isDefault: this.isDefault(),
      // La réduction se règle une fois le site créé, dans sa sous-carte.
      discount: null,
      discountAudiences: ALL_DISCOUNT_AUDIENCES,
      opening: EMPTY_OPENING,
      // Pas de `gps` : absent = inchangé. Il se saisit sous « Livraison ».
    };
    try {
      // Vers la page du site créé, et non la liste : ses rôles et ses
      // couleurs ne se règlent qu'une fois qu'il existe.
      const created = await this.sites.create(payload);
      this.notify.success('Site ajouté.');
      await this.router.navigate([SITES_PATH, created.id]);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "Le site n'a pas pu être enregistré."));
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * 🔴 **Archiver, pas supprimer** (plan des sites, §3.1) : un site archivé
   * n'est plus proposé, mais se résout encore par id — départs, tournées et
   * copies des commandes passées le citent. La zone fait taper son nom, comme
   * la suppression d'un point le faisait depuis le 2026-09-15. Un refus reste
   * sur la page.
   */
  protected async archive(): Promise<void> {
    const id = this.id();
    if (id === undefined || this.deleteAction() === undefined || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.sites.archive(id);
      this.notify.success('Site archivé.');
      await this.backToList();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "Le site n'a pas pu être archivé."));
    } finally {
      this.saving.set(false);
    }
  }

  protected backToList(): Promise<boolean> {
    return this.router.navigate([SITES_PATH]);
  }
}
