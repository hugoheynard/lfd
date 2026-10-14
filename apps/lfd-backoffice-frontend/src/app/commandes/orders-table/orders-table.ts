import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';
import { ORDER_ORIGIN_LABELS, type AdminOrderRow, type SitePaletteEntryView } from '@lfd/contracts';
import {
  formatCents,
  formatOrderDate,
  orderStatusLabel,
  orderStatusVariant,
  paymentStatusLabel,
  paymentStatusVariant,
} from '@lfd/b2b-ui/order';

import {
  logisticsCategoryOf,
  type LogisticsCategory,
} from '../../shared/logistics-colors/logistics-category';
import { LogisticsSwatch } from '../../shared/logistics-colors/logistics-swatch/logistics-swatch';
import { clienteleLabel, methodLabel } from '../order-list-filters';

/** « 14:32 », à l'heure de Paris. */
const PARIS_TIME = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/**
 * **Le tableau des commandes staff**, partagé par la liste de toutes les
 * commandes (`/commandes`) et l'onglet Commandes d'un compte.
 *
 * Partagé parce que Hugo a demandé « le même esprit » (2026-10-12) : mêmes
 * colonnes, mêmes formats, mêmes badges — un commercial qui passe d'un écran à
 * l'autre ne doit pas réapprendre où lire un règlement. Ce qui diffère entre
 * les deux tient en deux entrées :
 *
 * - `wide` ajoute **qui** a commandé (et sa clientèle), **pour quand** et
 *   **par quel mode** (« Livraison », « Retrait Adroit », à la couleur
 *   logistique — `palette`) : dans
 *   un compte, le client est connu et la colonne serait la même partout ;
 * - `siteOf` ajoute la colonne « Site » d'un principal qui a des sous-comptes.
 *
 * Il ne charge rien et ne navigue nulle part : la page sait d'où viennent les
 * lignes et où mène un clic.
 */
@Component({
  selector: 'app-orders-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    LogisticsSwatch,
  ],
  templateUrl: './orders-table.html',
  styleUrl: './orders-table.scss',
})
export class OrdersTable {
  readonly rows = input.required<readonly AdminOrderRow[]>();
  readonly caption = input.required<string>();
  readonly empty = input.required<FoldTableEmpty>();
  /** Le client et le jour de retrait ou de livraison, pour la liste de toutes les commandes. */
  readonly wide = input(false);
  /** Présent : une colonne « Site », et le libellé qu'elle porte pour chaque ligne. */
  readonly siteOf = input<((row: AdminOrderRow) => string) | null>(null);
  /** La palette des sites, d'où la couleur de la colonne « Mode » ; vide : teinte neutre. */
  readonly palette = input<readonly SitePaletteEntryView[]>([]);
  /** Le chargement en place, quand la page garde le tableau à l'écran pendant qu'elle relit. */
  readonly loading = input(false);

  readonly opened = output<AdminOrderRow>();

  /**
   * Dans l'ordre où on les lit : ce qui identifie, qui, quand, où ça en est,
   * combien. Le montant à droite, seule colonne qu'on compare de haut en bas.
   */
  protected readonly columns = computed<readonly FoldTableColumn[]>(() => [
    // Les dates d'abord, puis qui, puis la référence (Hugo, 2026-10-12) :
    // on parcourt la table par le temps, la référence ne sert qu'à citer.
    { key: 'placedAt', label: 'Passée le', width: '9rem' },
    ...(this.wide()
      ? [
          { key: 'fulfillmentDay', label: 'Pour le', width: '9rem' },
          { key: 'mode', label: 'Mode', width: '12rem' },
        ]
      : []),
    ...(this.wide() ? [{ key: 'customer', label: 'Client' }] : []),
    ...(this.siteOf() !== null ? [{ key: 'site', label: 'Site' }] : []),
    { key: 'orderNumber', label: 'Commande' },
    { key: 'status', label: 'Avancement', width: '10rem' },
    { key: 'paymentStatus', label: 'Règlement', width: '10rem' },
    { key: 'totalCents', label: 'Total TTC', width: '8rem', align: 'right' },
  ]);

  protected readonly rowKey = (row: AdminOrderRow): string => row.id;

  /**
   * Une commande **hors plan** (lot O3, `plan-reglages-commandes.md` §8.3) est
   * en alerte : reçue par l'équipe sur un plan arrêté, le fournil ne l'a pas
   * comptée tant que la journée n'est pas reprise.
   */
  protected readonly rowTone = (row: AdminOrderRow): 'alert' | null =>
    row.offPlan ? 'alert' : null;

  protected date(row: AdminOrderRow): string {
    return formatOrderDate(row.placedAt);
  }

  /** L'heure de passation, à l'heure de Paris — quel que soit le fuseau du poste. */
  protected placedTime(row: AdminOrderRow): string {
    return PARIS_TIME.format(new Date(row.placedAt));
  }

  /**
   * L'heure du service : la fenêtre figée sur la commande (« 09:00 – 11:00 »,
   * « avant 11:00 »), `null` s'il n'y en a pas. Montrée quelle que soit sa
   * provenance : un `default` est l'heure d'ouverture du point recopiée à la
   * passation — c'est bien quand on sert, pas une promesse faite au client.
   */
  protected serviceTime(row: AdminOrderRow): string | null {
    const window = row.fulfillmentWindow;
    if (window === null) {
      return null;
    }
    return window.start === null ? `avant ${window.end}` : `${window.start} – ${window.end}`;
  }

  protected site(row: AdminOrderRow): string {
    return this.siteOf()?.(row) ?? '';
  }

  protected clientele(row: AdminOrderRow): string | null {
    return clienteleLabel(row.clientele);
  }

  /**
   * Le mode, à la couleur de sa catégorie logistique (Hugo, 2026-10-14) :
   * « Livraison », ou « Retrait <site> ». Le libellé reste celui du MODE, sans
   * la clientèle, que la colonne Client dit déjà ; la couleur, elle, vient de
   * `logisticsCategoryOf`, qui seule sait la règle. Un retrait sans site connu
   * dit le nom du point figé (« Retrait Boutique »), sinon « Retrait » — en
   * teinte neutre dans les deux cas.
   */
  protected mode(row: AdminOrderRow): LogisticsCategory {
    const palette = this.palette();
    const category = logisticsCategoryOf(row, palette);
    const method = methodLabel(row.fulfillmentMethod);
    if (row.fulfillmentMethod === 'delivery') {
      return { ...category, label: method };
    }
    // Le site d'abord ; à défaut, le nom du point FIGÉ (retraits sans `siteId`
    // dans le snapshot), toujours en teinte neutre puisque sans site.
    const place = palette.find((s) => s.id === row.siteId)?.label ?? row.pickupLabel;
    return { ...category, label: place === null ? method : `${method} ${place}` };
  }

  protected day(row: AdminOrderRow): string | null {
    return row.fulfillmentDay === null ? null : formatOrderDate(row.fulfillmentDay);
  }

  protected total(row: AdminOrderRow): string {
    return formatCents(row.totalCents);
  }

  protected status(row: AdminOrderRow): string {
    return orderStatusLabel(row.status);
  }

  protected statusTone(row: AdminOrderRow): ReturnType<typeof orderStatusVariant> {
    return orderStatusVariant(row.status);
  }

  protected payment(row: AdminOrderRow): string {
    return paymentStatusLabel(row.paymentStatus);
  }

  protected paymentTone(row: AdminOrderRow): ReturnType<typeof paymentStatusVariant> {
    return paymentStatusVariant(row.paymentStatus);
  }

  /** La provenance, sauf quand c'est le cas normal — cf. `OrderRow`. */
  protected origin(row: AdminOrderRow): string | null {
    return row.origin === 'self_service' ? null : ORDER_ORIGIN_LABELS[row.origin];
  }
}
