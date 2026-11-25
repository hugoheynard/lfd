import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DeliveryAddressBookRow } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldCheckboxComponent,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldLinkComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
  FoldSearchComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';

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
import { DeliveryAddressBookService } from '../delivery-address-book.service';

/** Les colonnes de la table, dans l’ordre ; le réglage en masque. */
const ALL_COLUMNS: readonly FoldTableColumn<DeliveryAddressBookRow>[] = [
  { key: 'customer', label: 'Client' },
  { key: 'address', label: 'Adresse' },
  { key: 'contact', label: 'Contact' },
  { key: 'note', label: 'Note livreurs' },
  { key: 'parking', label: 'Stationnement' },
  {
    key: 'deposit',
    label: 'Dépôt',
    value: (row) => (row.depositAllowed ? 'Oui' : 'Non'),
  },
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
  { key: 'procedure', label: 'Procédure', value: (row) => (row.hasProcedure ? 'Oui' : 'Non') },
];

/** Le stockage de ce navigateur, ou `null` quand il est refusé. */
function storageOf(document: Document): Storage | null {
  try {
    return document.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}

type AddressBookState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly rows: readonly DeliveryAddressBookRow[] };

/**
 * **Adresses** — l'onglet de Tour manager qui montre toutes les adresses de
 * livraison des clients en une table : points GPS, consignes, contact
 * (Hugo, 2026-11-24). Lecture seule ; on y cherche par client, ville,
 * libellé ou note, et on isole celles qui n'ont aucun point GPS.
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
    FoldLinkComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
    FoldSearchComponent,
  ],
  templateUrl: './address-book-page.html',
  styleUrl: './address-book-page.scss',
})
export class AddressBookPage {
  private readonly addressBook = inject(DeliveryAddressBookService);
  private readonly storage = storageOf(inject(DOCUMENT));

  protected readonly state = signal<AddressBookState>({ status: 'loading' });
  protected readonly query = signal('');
  protected readonly withoutGpsOnly = signal(false);
  protected readonly hidden = signal<readonly string[]>(readHiddenColumns(this.storage));
  protected readonly optionalColumns = ADDRESS_BOOK_OPTIONAL_COLUMNS;

  private readonly all = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.rows : [];
  });
  protected readonly rows = computed(() =>
    filterAddressBook(this.all(), { query: this.query(), withoutGpsOnly: this.withoutGpsOnly() }),
  );
  protected readonly countLabel = computed(() => {
    const shown = this.rows().length;
    const total = this.all().length;
    const noun = total > 1 ? 'adresses' : 'adresse';
    return shown === total
      ? `${String(total)} ${noun}`
      : `${String(shown)} sur ${String(total)} ${noun}`;
  });
  protected readonly empty = computed<FoldTableEmpty>(() =>
    this.all().length === 0
      ? {
          title: 'Aucune adresse de livraison',
          subtitle: 'Aucun client n’a encore d’adresse au carnet.',
        }
      : { title: 'Aucune adresse ne correspond', subtitle: 'Modifiez la recherche ou le filtre.' },
  );

  /** Les colonnes affichées : toutes, moins celles que le réglage masque. */
  protected readonly columns = computed(() =>
    ALL_COLUMNS.filter((column) => !this.hidden().includes(column.key)),
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

  protected readonly rowKey = (row: DeliveryAddressBookRow): string => row.addressId;

  protected readonly gpsLabelOf = gpsLabelOf;
  protected readonly osmUrlOf = osmUrlOf;

  constructor() {
    void this.load();
  }

  protected retry(): void {
    void this.load();
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
