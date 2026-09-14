import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import type { CartAdjustment } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { AccountService } from '../../../account/account.service';
import { AuthFacade } from '../../../auth/auth.facade';

/** Les états de l'écran — exclusifs, et c'est tout leur intérêt. */
type AccountView = 'loading' | 'signed-out' | 'failed' | 'incomplete' | 'dossier';

import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ClientChrome } from '../../client-chrome.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { ClientFeatureAccess } from '../../feature-access/client-feature-access.service';
import { ClientAddresses } from '../../client-addresses.service';
import { ClientCompany } from '../../client-company.service';
import { ClientLocale, LOCALES } from '../../client-locale.service';
import { formatCents, formatRate } from '../../format-money';
import { ServicePoints } from '../../shop/pickup-points.store';
import { ProOnboarding } from '../../pro-onboarding.service';
import { ShopPromise } from '../../shop-promise/shop-promise';
import { AccountCard } from '../account-card/account-card';
import { DataCard } from '../data-card/data-card';
import { DossierCard } from '../dossier-card/dossier-card';
import { KbisCard } from '../kbis-card/kbis-card';
import { UsersCard } from '../users-card/users-card';

/** Les sept sujets, numérotés dans l'ordre de lecture. */
const SECTIONS = [
  'identity',
  'users',
  'kbis',
  'addresses',
  'payment',
  'preferences',
  'data',
] as const;

/**
 * Les sujets qui n'ont de sens que si la boutique permet de COMMANDER (plan
 * `plan-inscription-pro-seule.md` §4) : un régime de règlement et une habitude
 * de service ne se lisent qu'à l'aune d'une commande.
 */
const ORDER_ONLY_SECTIONS: ReadonlySet<(typeof SECTIONS)[number]> = new Set([
  'payment',
  'preferences',
]);

/**
 * `/mon-compte` — le dossier client, écrit pour celui qui le possède.
 *
 * **Sept cartes, pas sept écrans.** Le back-office a une fiche à onglets parce
 * qu'un commercial y passe la journée ; un client y passe deux fois par an. Une
 * seule page qui descend, chaque carte autonome, aucun sous-écran à retrouver —
 * et le sommaire de bureau fait DÉFILER, il ne change pas d'écran. C'est écrit
 * sous la liste, et c'est vrai : chaque entrée pointe l'ancre de sa carte.
 *
 * Ce qui passe par nous le DIT. L'enseigne se change en autonomie ; raison
 * sociale, forme juridique, SIRET et TVA sont en lecture, avec la phrase qui
 * explique pourquoi — ce sont les mentions qui figurent sur les factures. Aucune
 * illusion de champ modifiable, et aucun champ grisé non plus : un champ mort se
 * lit comme une panne, une phrase se lit comme une règle.
 */
@Component({
  selector: 'app-compte-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AccountCard,
    ClientBannerBlock,
    ClientBannerOutlet,
    DataCard,
    DossierCard,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    KbisCard,
    ShopPromise,
    UsersCard,
  ],
  templateUrl: './compte-page.html',
  styleUrl: './compte-page.scss',
})
export class ComptePage {
  protected readonly t = inject(ClientCopyService).t;
  private readonly chrome = inject(ClientChrome);
  protected readonly access = inject(ClientFeatureAccess);
  protected readonly onboarding = inject(ProOnboarding);

  /**
   * Le niveau qui décide de la promesse « ouvre bientôt » — `null` tant que la
   * lecture est en vol, pour qu'elle ne clignote pas quand la boutique est
   * ouverte. Un échec vaut `closed`, donc la phrase s'affiche : le sens prudent.
   */
  protected readonly promiseLevel = computed(() =>
    this.access.state() === 'loading' ? null : this.access.shop(),
  );

  private readonly auth = inject(AuthFacade);
  protected readonly account = inject(AccountService);

  /**
   * **Ce que l'écran peut montrer**, un seul à la fois.
   *
   * 🔴 Il empilait tout (relevé le 2026-09-14) : une lecture de `/me` en échec
   * s'affichait « Compte non reconnu », et une personne pas encore entrée voyait
   * la carte « Compléter mon dossier » au-dessus de sept cartes de compte vides.
   * Le compte complet ne se montre donc qu'à qui a une société ; sans société,
   * seule la carte de dossier ; sans entrée, seulement de quoi entrer.
   */
  protected readonly view = computed<AccountView>(() => {
    if (this.auth.isLoading()) {
      return 'loading';
    }
    if (!this.auth.isAuthenticated()) {
      return 'signed-out';
    }
    const status = this.account.status();
    if (status === 'error') {
      return 'failed';
    }
    if (status !== 'ready') {
      return 'loading';
    }
    return this.client.company() === null ? 'incomplete' : 'dossier';
  });

  /** La pastille du bandeau : l'état du dossier, ou rien tant qu'on ne le sait pas. */
  protected readonly stateLabel = computed(() => {
    const dossier = this.client.dossier();
    return dossier === null ? null : this.t().account.states[dossier];
  });

  /** Le vert ne se dit que d'un compte actif. */
  protected readonly stateTone = computed(() => {
    const dossier = this.client.dossier();
    if (dossier === 'active') {
      return 'ok';
    }
    return dossier === 'suspended' || dossier === 'terminated' ? 'blocked' : 'wait';
  });

  protected retry(): void {
    this.account.load();
  }

  protected signIn(): void {
    this.auth.login('/mon-compte');
  }

  /**
   * 🔴 **L'identité vient de notre base** (`GET /me`), plus d'une maquette. Cet
   * écran affichait « Brasserie Marchand », son SIRET et son n° de TVA à
   * quelqu'un qui n'est pas elle — sur l'écran censé lui dire qui il est chez
   * nous.
   */
  protected readonly client = inject(ClientCompany);
  protected readonly company = this.client.company;

  private readonly addresses = inject(ClientAddresses);
  private readonly service = inject(ServicePoints);
  private readonly locale = inject(ClientLocale);

  /**
   * 🔴 **Les adresses viennent de notre base**, plus d'une maquette
   * (`GET /companies/:id/addresses`). Ce sont les mêmes que celles du carnet du
   * checkout, et c'est le point : deux listes d'adresses pour un même client
   * finiraient par ne pas dire la même chose.
   *
   * La zone et son tarif sont **calculés** sur le code postal, par le même
   * préfixe que le serveur — la maquette les écrivait à côté (« zone 1 · 20 € »)
   * sans qu'aucun barème ne les soutienne.
   */
  protected readonly deliveries = computed(() =>
    this.addresses.deliveries().map((address) => {
      const zone = this.service.zoneFor(address.codePostal);
      return {
        id: address.id,
        label: address.label,
        primary: address.isDefault,
        line: `${address.ligne1}, ${address.codePostal} ${address.ville}`,
        // Pas de zone = pas de livraison à cette adresse. Un tiret le dit ;
        // inventer « zone 1 » promettrait une tournée qui ne passe pas.
        zone: zone?.label ?? this.t().account.addressNoZone,
        fee: zone === null ? '—' : feeOf(zone.fee),
      };
    }),
  );

  /** L'adresse de facturation déclarée, ou la mention d'absence. */
  protected readonly billing = computed(() => {
    const billing = this.addresses.billing();
    return billing === null
      ? this.t().account.addressNone
      : `${billing.ligne1}, ${billing.codePostal} ${billing.ville}`;
  });

  /**
   * **Comment cette maison est servie d'habitude** — le point de départ de ses
   * commandes, jamais une contrainte.
   *
   * 🔴 La maquette écrivait « Le Labo · 7 h – 8 h », un point ET un créneau, en
   * dur. La préférence porte un MODE et une adresse, jamais une heure : un
   * créneau se choisit à chaque commande, et l'annoncer comme une habitude
   * laissait croire qu'il était réservé.
   */
  protected readonly habit = computed(() => {
    const preference = this.client.company()?.fulfillmentPreference ?? null;
    const copy = this.t().account;
    if (preference === null || preference.method === null) {
      return copy.prefNone;
    }
    if (preference.method === 'pickup') {
      const point = this.service.pickups().find((p) => p.id === preference.pickupAddressId);
      return point === undefined ? copy.prefPickupAny : `${copy.prefPickupAt} ${point.label}`;
    }
    const address = this.addresses.deliveries().find((a) => a.id === preference.deliveryAddressId);
    return address === undefined ? copy.prefDeliveryAny : `${copy.prefDeliveryTo} ${address.label}`;
  });

  /**
   * La langue de l'interface — celle qu'on est **en train de lire**.
   *
   * Elle était écrite « Français » en dur, ce qui restait juste jusqu'à ce que
   * quelqu'un bascule en anglais : l'écran affirmait alors le contraire de ce
   * qu'il montrait.
   */
  protected readonly language = computed(() => {
    const code = this.locale.current();
    return LOCALES.find((entry) => entry.code === code)?.name ?? code;
  });

  protected readonly deliveryCount = computed(() =>
    this.t().account.deliveryCount.replace('{n}', String(this.deliveries().length)),
  );

  /**
   * Le sommaire — numéroté, chaque entrée pointant l'ancre de sa carte.
   *
   * La numérotation suit ce qui est MONTRÉ : une carte retirée ne laisse pas de
   * trou, sans quoi le sommaire promettrait une carte qu'on ne trouve pas.
   */
  protected readonly summary = computed(() => {
    const labels = this.t().account.sections;
    const orderable = this.access.atLeast('order');
    const shown = SECTIONS.filter((key) => orderable || !ORDER_ONLY_SECTIONS.has(key));
    return shown.map((key, index) => ({
      key,
      label: labels[key],
      number: String(index + 1).padStart(2, '0'),
      anchor: `compte-${key}`,
    }));
  });

  constructor() {
    effect(() => this.chrome.kicker.set(this.t().nav.destinations.account));
    this.chrome.back.set(null);
    this.chrome.menu.set(true);
    this.chrome.bell.set(null);
    this.chrome.barOnDesktop.set(true);
  }
}

/** Un frais de zone tel qu'il se lit : « 8,00 € » ou « 3 % ». */
function feeOf(fee: CartAdjustment): string {
  return fee.mode === 'amount' ? formatCents(fee.cents) : formatRate(fee.bp / 100);
}
