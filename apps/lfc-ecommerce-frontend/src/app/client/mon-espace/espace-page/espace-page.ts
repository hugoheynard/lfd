import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldIconComponent } from 'fold-ng';

import { instantToLocal } from '@lfd/contracts';

import { ClientAudience } from '../../client-audience.service';
import { ClientChrome } from '../../client-chrome.service';
import { ClientCompany } from '../../client-company.service';
import { ClientIdentity } from '../../client-identity.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { formatCents } from '../../format-money';
import { ClientOrderHistory } from '../../mes-commandes/client-order-history.service';
import { kbisStateLabel } from '../../mon-compte/kbis/kbis-section';
import { ServicePoints } from '../../shop/pickup-points.store';
import { ClientFeatureAccess } from '../../feature-access/client-feature-access.service';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { NewOrderAction } from '../../nav/new-order-action/new-order-action';
import { MOCK_EVENT } from '../../mock-event';
import { ContactCard } from '../contact-card/contact-card';
import { EventBanner } from '../event-banner/event-banner';
import { ClientEspace } from '../espace.service';
import { ReadyWell } from '../ready-well/ready-well';
import { discountRows, monthOutstandingCents } from '../pro-summary';

/**
 * `/mon-espace` — l'accueil du client reconnu.
 *
 * Il répond à UNE question : qu'est-ce qui m'attend aujourd'hui ? D'où ce qui
 * n'y est pas. « Mes commandes » et « Mon compte » sont deux entrées de menu,
 * pas des actions ; « comme samedi dernier » vit dans l'écran de commande, là
 * où il sert au moment de commander ; remise, encours et KBIS sont de la
 * consultation. Le téléphone n'en garde donc que l'action, et le bureau y
 * rajoute la consultation parce qu'il a la colonne pour.
 *
 * ⚠️ L'OPÉRATION DATÉE (Pâques, Noël) devrait passer en tête de cet écran. Elle
 * n'y est pas parce que son modèle n'existe pas encore — c'est le cas 3 du
 * dossier, prévu en dernier. La réf le prévoit : sans opération en cours, le
 * bloc n'existe pas et « Nouvelle commande » reprend la tête. C'est exactement
 * l'état de cet écran aujourd'hui.
 */
@Component({
  selector: 'app-espace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClientBannerBlock,
    ClientBannerOutlet,
    ContactCard,
    EventBanner,
    FoldIconComponent,
    NewOrderAction,
    ReadyWell,
    RouterLink,
  ],
  templateUrl: './espace-page.html',
  styleUrl: './espace-page.scss',
})
export class EspacePage {
  protected readonly access = inject(ClientFeatureAccess);
  protected readonly t = inject(ClientCopyService).t;

  /**
   * L'opération datée en cours, ou `null`.
   *
   * ⚠️ SIMULATION — le vrai modèle est le cas 3. Une constante et pas un signal
   * : rien ne la fait changer tant qu'elle ne vient pas du serveur, et un
   * signal ferait croire le contraire.
   */
  protected readonly event = MOCK_EVENT;
  protected readonly espace = inject(ClientEspace);
  private readonly identity = inject(ClientIdentity);
  private readonly chrome = inject(ClientChrome);
  private readonly points = inject(ServicePoints);
  private readonly audience = inject(ClientAudience);
  private readonly client = inject(ClientCompany);
  private readonly history = inject(ClientOrderHistory);

  /** La remise de chaque point pour la clientèle de l'espace, telle que le back-office la pose. */
  protected readonly discounts = computed(() =>
    discountRows(this.points.pickups(), this.t().espace.proDiscount, this.audience.shown()),
  );

  /**
   * L'encours du mois, ou `null` quand la société ne règle pas sur terme : payée
   * à la commande, elle n'a rien en compte, et « 0,00 € » le ferait croire.
   *
   * Le mois se lit à l'horloge du navigateur, à Paris : c'est une consultation,
   * et seul le passage de minuit d'un fin de mois pourrait la décaler.
   */
  protected readonly outstanding = computed(() => {
    if (!this.client.hasDeferredTerm()) {
      return null;
    }
    const today = instantToLocal(new Date()).day;
    return formatCents(monthOutstandingCents(this.history.orders(), today));
  });

  /** L'état du KBIS avec les mots de « Mon compte », ou `null` sans société. */
  protected readonly kbisState = computed(() => {
    const company = this.client.company();
    return company === null ? null : kbisStateLabel(company.kbis, this.t().account);
  });

  protected readonly hasPro = computed(
    () => this.discounts().length > 0 || this.outstanding() !== null || this.kbisState() !== null,
  );

  /** Le salut nomme, ou ne nomme pas — jamais du prénom de quelqu'un d'autre. */
  protected readonly hello = computed(() => {
    const name = this.identity.firstName();
    const copy = this.t().nav;
    return name === null ? copy.helloAnonymous : copy.hello.replace('{name}', name);
  });

  /** Le salut et le décompte sur deux lignes — le bandeau rend le retour tel quel. */
  protected readonly bannerTitle = computed(() => `${this.hello()}\n${this.espace.todayLine()}`);

  constructor() {
    void this.points.hydrate();
    // Le sur-titre de la barre nomme la page, et il le fait avec le MÊME mot que
    // la destination du menu : renommer l'une renomme l'autre, et la barre ne
    // peut pas se mettre à annoncer un écran qui ne s'appelle plus comme ça.
    effect(() => this.chrome.kicker.set(this.t().nav.destinations.espace));
    this.chrome.back.set(null);
    this.chrome.menu.set(true);
    // Pas de cloche ici. La réf en dessine une avec trois non-lues, mais le
    // modèle d'événement est le cas 4 et il n'existe pas : un bouton qui ne
    // ferait rien, ou qui ne saurait dire que « bientôt », occuperait 48 px de
    // la barre d'un téléphone au détriment du nom de la maison. Elle revient
    // avec ce qu'elle annoncera.
    this.chrome.bell.set(null);
    this.chrome.bellCount.set(0);
    this.chrome.barOnDesktop.set(true);
  }
}
