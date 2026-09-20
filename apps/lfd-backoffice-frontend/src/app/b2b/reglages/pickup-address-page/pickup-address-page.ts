import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  ALL_DISCOUNT_AUDIENCES,
  type CartAdjustment,
  type PickupAddressPayload,
  type PickupAddressView,
  type PickupDiscountAudiences,
} from '@lfd/contracts';
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
  FoldFieldsetComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
} from 'fold-ng';
import { HoursForm, hoursIssueOf, type HoursEntry } from '@lfd/b2b-ui/hours';
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
import {
  fromCartAdjustment,
  PriceAlterationField,
  toCartAdjustment,
  type PriceAlteration,
} from '@lfd/b2b-ui/pricing';

import { NotifyService } from '../../../notify.service';
import { PickupAddressesService } from '../pickup-addresses.service';
import { EMPTY_OPENING, openingEntries, toPickupOpening } from '../pickup-opening.model';
import { PublicSlotsCard } from './public-slots-card/public-slots-card';

/** La liste dont cette page est le détail — et le retour de tous ses gestes. */
const LIST_PATH = '/b2b/reglages/points-de-retrait';

/**
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
 * datées (`documentation/order/plan-creneaux-de-retrait.md`). Six sujets, bientôt
 * huit, qu'on ne lit pas de haut en bas : on va directement à celui qu'on vient
 * régler. C'est le critère qui sépare une page d'un panneau dans ce
 * back-office, où six pages de détail suivent déjà ce motif. Décidé avec Hugo
 * le 2026-09-16 ; le `CLAUDE.md` de cette app porte la règle.
 *
 * Le même composant sert la création et l'édition : sans `id`, il n'y a rien à
 * charger et rien à supprimer.
 */
@Component({
  selector: 'app-pickup-address-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddressForm,
    HoursForm,
    PriceAlterationField,
    PublicSlotsCard,
    FoldBackLinkComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldDangerZoneComponent,
    FoldEmptyStateComponent,
    FoldFieldsetComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './pickup-address-page.html',
  styleUrl: './pickup-address-page.scss',
})
export class PickupAddressPage {
  private readonly pickups = inject(PickupAddressesService);
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
  /** Remise du point (retirer ici coûte moins cher), ou `null`. */
  protected readonly discount = signal<CartAdjustment | null>(null);
  /**
   * À qui va la réduction. Conservées telles quelles quand la réduction est
   * retirée : sans réduction, le serveur ne les lit pas, et les remettre à zéro
   * ferait perdre un choix qu'on retrouverait en rouvrant la réduction.
   */
  protected readonly audiences = signal<PickupDiscountAudiences>(ALL_DISCOUNT_AUDIENCES);
  /** Heures d'ouverture du point — deux fenêtres nommées, jamais fusionnées. */
  protected readonly opening = signal<readonly HoursEntry[]>(openingEntries(EMPTY_OPENING));

  /**
   * Le refus du serveur, en clair. Il reste SUR LA PAGE, au-dessus des cartes :
   * un toast disparaîtrait pendant qu'on cherche quoi corriger.
   */
  protected readonly refusal = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly loading = signal(true);
  /** L'`id` de la route ne désigne aucun point : l'écran le dit, et n'invente rien. */
  protected readonly notFound = signal(false);
  /**
   * On garde toujours au moins un point : le dernier ne se supprime pas. Su
   * parce que la page charge la LISTE — la lecture n'a pas de route unitaire,
   * et ce détour rend ce compte gratuit.
   */
  protected readonly removable = signal(false);

  protected readonly isCreate = computed(() => this.id() === undefined);

  protected readonly openingIssue = computed(() => hoursIssueOf(this.opening()));

  /** Aucune plage renseignée : le point accepte alors n'importe quelle heure. */
  protected readonly noOpening = computed(() =>
    this.opening().every((entry) => entry.range.start === '' && entry.range.end === ''),
  );

  /**
   * La remise vue comme une altération de prix. Le sens est **structurel** —
   * retirer soi-même coûte moins cher, jamais plus — donc il ne se stocke pas.
   */
  protected readonly discountAlteration = computed(() =>
    fromCartAdjustment(this.discount(), 'decrease'),
  );

  /** L'adresse postale, dans la langue neutre du fragment de saisie. */
  protected readonly postal = computed(() => toPostal(this.draft()));

  /** Le titre EST le nom du point — sa ville à défaut, comme dans la liste. */
  protected readonly heading = computed(() => {
    if (this.isCreate()) {
      return 'Nouveau point de retrait';
    }
    const draft = this.draft();
    return draft.label || draft.ville || 'Point de retrait';
  });

  /** Les cases de clientèle ne se lisent que s'il y a une réduction à attribuer. */
  protected readonly audiencesDisabled = computed(() => this.discount() === null);

  /**
   * Une réduction qui ne vise personne. Le serveur la refuse (400) ; l'écran le
   * dit AVANT l'envoi, avec la même phrase, plutôt que d'attendre le refus.
   */
  protected readonly audienceIssue = computed(() => {
    const audiences = this.audiences();
    return this.discount() !== null && !audiences.b2b && !audiences.b2c
      ? 'Cochez au moins une clientèle, ou retirez la réduction.'
      : '';
  });

  /** Une adresse postable, des heures cohérentes, une réduction qui vise quelqu'un. */
  protected readonly canSubmit = computed(
    () =>
      postalIssue(this.draft()) === '' && this.openingIssue() === '' && this.audienceIssue() === '',
  );

  /**
   * Le libellé d'action de la zone dangereuse, ou `undefined` pour le dernier
   * point : la zone reste alors un cadre qui explique sans rien offrir.
   */
  protected readonly deleteAction = computed(() =>
    this.removable() ? 'Supprimer définitivement' : undefined,
  );

  /** Ce qu'il faut taper pour supprimer : le nom du point, ou sa ville sans nom. */
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

  /**
   * Charge le point depuis la **liste** : l'API n'expose aucune lecture
   * unitaire (`GET /pickup-addresses` seulement, vérifié le 2026-09-16), et en
   * ajouter une pour cet écran serait une surface de plus à murer pour un gain
   * nul — la liste est courte, publique, et déjà servie au checkout.
   */
  protected async load(id: string): Promise<void> {
    this.loading.set(true);
    this.notFound.set(false);
    this.refusal.set(null);
    try {
      const points = await this.pickups.list();
      const point = points.find((candidate) => candidate.id === id) ?? null;
      if (point === null) {
        this.notFound.set(true);
        return;
      }
      this.fill(point);
      this.removable.set(points.length > 1);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le point de retrait est illisible.'));
      this.notFound.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Recopie le point dans les brouillons de l'écran. */
  private fill(point: PickupAddressView): void {
    this.draft.set(postalDraftFrom(point));
    this.isDefault.set(point.isDefault);
    this.discount.set(point.discount);
    this.audiences.set(point.discountAudiences);
    this.opening.set(openingEntries(point.opening));
  }

  protected setDiscount(alteration: PriceAlteration | null): void {
    this.discount.set(toCartAdjustment(alteration));
  }

  protected setAudience(audience: keyof PickupDiscountAudiences, checked: boolean): void {
    this.audiences.update((current) => ({ ...current, [audience]: checked }));
  }

  protected setPostal(postal: PostalAddress): void {
    this.draft.update((draft) => withPostal(draft, postal));
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit() || this.saving()) {
      return;
    }
    const id = this.id();
    this.saving.set(true);
    this.refusal.set(null);
    const payload: PickupAddressPayload = {
      ...toBillingPayload(this.draft()),
      isDefault: this.isDefault(),
      discount: this.discount(),
      discountAudiences: this.audiences(),
      opening: toPickupOpening(this.opening()),
    };
    try {
      if (id === undefined) {
        await this.pickups.create(payload);
        this.notify.success('Point de retrait ajouté.');
      } else {
        await this.pickups.update(id, payload);
        this.notify.success('Point de retrait mis à jour.');
      }
      await this.backToList();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "Le point de retrait n'a pas pu être enregistré."));
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * 🔴 **La suppression était une entrée du menu de la liste**, confirmée d'un
   * seul clic, jusqu'au 2026-09-15 (Hugo). Elle vit dans une zone dangereuse
   * qui fait taper le nom du point. Un refus reste sur la page.
   */
  protected async remove(): Promise<void> {
    const id = this.id();
    if (id === undefined || this.deleteAction() === undefined || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.pickups.remove(id);
      this.notify.success('Point de retrait supprimé.');
      await this.backToList();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "Le point de retrait n'a pas pu être supprimé."));
    } finally {
      this.saving.set(false);
    }
  }

  protected backToList(): Promise<boolean> {
    return this.router.navigate([LIST_PATH]);
  }
}
