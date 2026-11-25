import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DeliveryAddressBookRow, DeliveryDayAddressOrder } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldCheckboxComponent,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLinkComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
  FoldSearchComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { AddressProcedurePreview } from '../address-procedure-preview/address-procedure-preview';
import {
  doorstepRuleLabelOf,
  filterAddressBook,
  gpsLabelOf,
  osmUrlOf,
  stopMinutesLabelOf,
} from '../address-book';
import {
  ADDRESS_BOOK_OPTIONAL_COLUMNS,
  readHiddenColumns,
  writeHiddenColumns,
} from '../address-book-columns';
import {
  type AddressBookLine,
  dayAddressLinesOf,
  deliveryTimesOf,
  registerLineOf,
} from '../address-book-day';
import { DeliveryAddressBookService } from '../delivery-address-book.service';
import { parisDayOf, shiftDay } from '../run-sheet';

/** Les colonnes de la table, dans l’ordre ; le réglage en masque. */
const ALL_COLUMNS: readonly FoldTableColumn<AddressBookLine>[] = [
  { key: 'time', label: 'Heure' },
  { key: 'customer', label: 'Client' },
  { key: 'orders', label: 'Commandes' },
  { key: 'address', label: 'Adresse' },
  { key: 'contact', label: 'Contact' },
  { key: 'note', label: 'Note livreurs' },
  { key: 'delivery', label: 'Livraison' },
  { key: 'parking', label: 'Stationnement' },
  {
    key: 'deposit',
    label: 'Dépôt',
    value: (row) => (row.depositAllowed ? 'Oui' : 'Non'),
  },
  { key: 'signature', label: 'Signature BL' },
  {
    key: 'rule',
    label: 'Règle à la porte',
    value: (row) => doorstepRuleLabelOf(row.doorstepRule),
  },
  {
    key: 'stop',
    label: 'Temps sur place',
    numeric: true,
    value: (row) => stopMinutesLabelOf(row.stopMinutes),
  },
  { key: 'procedure', label: 'Procédure détaillée' },
];

/** Le stockage de ce navigateur, ou `null` quand il est refusé. */
function storageOf(document: Document): Storage | null {
  try {
    return document.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Les colonnes d'un jour de livraison, absentes du registre. */
const DAY_ONLY_COLUMNS: readonly string[] = ['time', 'orders'];

/** Le registre général, ou un jour de livraison relatif à aujourd'hui. */
const VIEW_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'register', label: 'Registre général' },
  { value: '0', label: 'Aujourd’hui' },
  { value: '1', label: 'Demain' },
];

type DayState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly day: string;
      readonly orders: readonly DeliveryDayAddressOrder[];
    };

type AddressBookState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly rows: readonly DeliveryAddressBookRow[] };

/**
 * **Adresses** — l'onglet de Tour manager qui montre toutes les adresses de
 * livraison des clients en une table : points GPS, consignes, contact
 * (Hugo, 2026-11-24). Lecture seule ; on y cherche par client, ville,
 * libellé ou note, et on isole celles qui n'ont aucun point GPS.
 *
 * Deux vues (Hugo, 2026-11-25) : le **registre général**, toutes les adresses ;
 * et **aujourd'hui** ou **demain**, les adresses où l'on livre ce jour-là, lues
 * dans les commandes du jour et classées par heure de livraison convenue.
 */
@Component({
  selector: 'app-address-book-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDataTableCellDirective,
    FoldCheckboxComponent,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLinkComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
    FoldSearchComponent,
    FoldViewToggleComponent,
    AddressProcedurePreview,
  ],
  templateUrl: './address-book-page.html',
  styleUrl: './address-book-page.scss',
})
export class AddressBookPage {
  private readonly addressBook = inject(DeliveryAddressBookService);
  private readonly storage = storageOf(inject(DOCUMENT));
  private readonly permissions = inject(PermissionsStore);

  /** L'œil de la procédure suit le droit de lire les procédures. */
  protected readonly canReadProcedure = computed(() =>
    this.permissions.can('delivery_procedures:read'),
  );

  protected readonly state = signal<AddressBookState>({ status: 'loading' });
  protected readonly dayState = signal<DayState>({ status: 'loading' });
  protected readonly viewOptions = VIEW_OPTIONS;
  /** `register`, ou l'écart à aujourd'hui (`0`, `1`). */
  protected readonly view = signal('register');
  protected readonly onDay = computed(() => this.view() !== 'register');
  private readonly today = parisDayOf(new Date());
  protected readonly query = signal('');
  protected readonly withoutGpsOnly = signal(false);
  protected readonly hidden = signal<readonly string[]>(readHiddenColumns(this.storage));
  protected readonly optionalColumns = ADDRESS_BOOK_OPTIONAL_COLUMNS;

  private readonly all = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.rows : [];
  });
  /** Les lignes de la vue : le registre, ou les adresses du jour classées par heure. */
  private readonly lines = computed<readonly AddressBookLine[]>(() => {
    if (!this.onDay()) {
      return this.all().map(registerLineOf);
    }
    const day = this.dayState();
    return day.status === 'ready' ? dayAddressLinesOf(this.all(), day.orders) : [];
  });
  protected readonly rows = computed(() =>
    filterAddressBook(this.lines(), {
      query: this.query(),
      withoutGpsOnly: this.withoutGpsOnly(),
    }),
  );
  protected readonly countLabel = computed(() => {
    const shown = this.rows().length;
    const total = this.lines().length;
    const noun = total > 1 ? 'adresses' : 'adresse';
    const count =
      shown === total
        ? `${String(total)} ${noun}`
        : `${String(shown)} sur ${String(total)} ${noun}`;
    const day = this.dayState();
    if (!this.onDay() || day.status !== 'ready') {
      return count;
    }
    const deliveries = day.orders.length;
    return `${count} · ${String(deliveries)} ${deliveries > 1 ? 'livraisons' : 'livraison'}`;
  });
  protected readonly empty = computed<FoldTableEmpty>(() => {
    if (this.onDay() && this.lines().length === 0) {
      return { title: 'Aucune livraison ce jour-là', subtitle: 'Aucune commande à livrer.' };
    }
    return this.lines().length === 0
      ? {
          title: 'Aucune adresse de livraison',
          subtitle: 'Aucun client n’a encore d’adresse au carnet.',
        }
      : { title: 'Aucune adresse ne correspond', subtitle: 'Modifiez la recherche ou le filtre.' };
  });

  /**
   * Les colonnes affichées : toutes, moins celles que le réglage masque ;
   * l'heure et les commandes n'existent qu'un jour donné.
   */
  protected readonly columns = computed(() =>
    ALL_COLUMNS.filter(
      (column) =>
        !this.hidden().includes(column.key) &&
        (this.onDay() || !DAY_ONLY_COLUMNS.includes(column.key)),
    ),
  );

  protected isShown(key: string): boolean {
    return !this.hidden().includes(key);
  }

  protected toggleColumn(key: string, shown: boolean): void {
    const next = shown
      ? this.hidden().filter((hiddenKey) => hiddenKey !== key)
      : [...this.hidden(), key];
    this.hidden.set(next);
    writeHiddenColumns(this.storage, next);
  }

  protected readonly rowKey = (row: AddressBookLine): string => row.key;
  protected readonly deliveryTimesOf = deliveryTimesOf;

  protected readonly gpsLabelOf = gpsLabelOf;
  protected readonly osmUrlOf = osmUrlOf;

  constructor() {
    void this.load();
  }

  protected retry(): void {
    void this.load();
  }

  /** Le registre, ou un jour : le jour se relit à chaque choix. */
  protected pickView(value: string): void {
    this.view.set(value);
    const shift = Number(value);
    if (value !== 'register' && Number.isInteger(shift)) {
      void this.loadDay(shiftDay(this.today, shift));
    }
  }

  protected retryDay(): void {
    this.pickView(this.view());
  }

  private async loadDay(day: string): Promise<void> {
    this.dayState.set({ status: 'loading' });
    try {
      const view = await this.addressBook.day(day);
      // Un choix plus récent l'emporte : la réponse d'un autre jour est jetée.
      if (this.view() !== 'register' && shiftDay(this.today, Number(this.view())) === view.day) {
        this.dayState.set({ status: 'ready', day: view.day, orders: view.orders });
      }
    } catch {
      this.dayState.set({ status: 'error' });
    }
  }

  private async load(): Promise<void> {
    this.state.set({ status: 'loading' });
    try {
      const view = await this.addressBook.list();
      this.state.set({ status: 'ready', rows: view.addresses });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
