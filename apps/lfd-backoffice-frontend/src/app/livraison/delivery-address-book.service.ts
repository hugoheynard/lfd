import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { DeliveryAddressBookView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

const ADDRESS_BOOK = `${B2B_API_BASE}/admin/delivery/address-book`;

/**
 * **Le carnet des adresses de livraison** — onglet « Adresses » de Tour
 * manager. Transport pur, en lecture, sous `delivery_rounds:read`.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryAddressBookService {
  private readonly http = inject(HttpClient);

  list(): Promise<DeliveryAddressBookView> {
    return firstValueFrom(this.http.get<DeliveryAddressBookView>(ADDRESS_BOOK));
  }
}
