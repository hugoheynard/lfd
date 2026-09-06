import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import type { CartAdjustment } from '@lfd/contracts';
import { FoldIconComponent } from 'fold-ng';

import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ClientChrome } from '../../client-chrome.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { ClientAddresses } from '../../client-addresses.service';
import { ClientCompany } from '../../client-company.service';
import { formatCents, formatRate } from '../../format-money';
import { MOCK_ACCOUNT } from '../../mock-account';
import { ServicePoints } from '../../shop/pickup-points.store';
import { AccountCard } from '../account-card/account-card';
import { DataCard } from '../data-card/data-card';
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
    FoldIconComponent,
    KbisCard,
    UsersCard,
  ],
  templateUrl: './compte-page.html',
  styleUrl: './compte-page.scss',
})
export class ComptePage {
  protected readonly t = inject(ClientCopyService).t;
  private readonly chrome = inject(ClientChrome);

  protected readonly account = MOCK_ACCOUNT;

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

  protected readonly deliveryCount = computed(() =>
    this.t().account.deliveryCount.replace('{n}', String(this.deliveries().length)),
  );

  /** Le sommaire — numéroté, chaque entrée pointant l'ancre de sa carte. */
  protected readonly summary = computed(() => {
    const labels = this.t().account.sections;
    return SECTIONS.map((key, index) => ({
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
