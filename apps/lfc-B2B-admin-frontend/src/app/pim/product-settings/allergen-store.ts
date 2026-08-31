import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import type {
  AllergenCategoryAdminView,
  CreateAllergenCategoryPayload,
  CreateAllergenEntryPayload,
  LocalizedText,
  ReviseAllergenEntryPayload,
} from '@lfd/pim-contracts';

import { ListLoadState } from '../data/list-load-state';
import { AllergenHttpApi } from './allergen-http-api';

/**
 * Source réactive unique du **référentiel allergènes**, vu d'un écran qui
 * l'administre.
 *
 * Toute mutation relit le catalogue derrière elle : le serveur est arbitre de ce
 * qui a réellement changé — un archivage refusé parce que la catégorie accueille
 * encore des allergènes proposés, une position que le rang d'une autre ligne
 * réordonne — et un état local recalculé à la main finirait par diverger de lui.
 *
 * **Le front cache, le serveur refuse.** Rien ici ne protège l'officiel : les
 * gestes qu'on n'offre pas sont ceux que l'agrégat et le trigger refusent de
 * toute façon. On évite d'afficher un bouton qui répondrait 409, on ne remplace
 * pas la règle.
 */
@Injectable({ providedIn: 'root' })
export class AllergenStore {
  private readonly api = inject(AllergenHttpApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<readonly AllergenCategoryAdminView[]>([]);
  /** Les catégories dans l'ordre voulu par le staff — le serveur les trie. */
  readonly categories = this.state.asReadonly();

  private readonly load = new ListLoadState();
  /** Pourquoi la liste est vide. `null` = elle l'est vraiment. */
  readonly loadError = this.load.error;

  private readonly settled = signal(false);
  /**
   * Vrai tant que la **première** lecture n'a pas abouti — et elle seule.
   * Un rechargement après mutation garde le contenu à l'écran : remplacer une
   * liste lue par un chargeur pendant 40 ms fait clignoter la page pour rien.
   */
  readonly firstLoad = computed(() => !this.settled());

  /**
   * Celles où l'on peut encore RANGER un allergène. Une catégorie archivée
   * n'accueille rien : le serveur refuse, et une entrée qui y atterrirait serait
   * proposée à la saisie sans famille visible.
   */
  readonly livingCategories = computed(() =>
    this.state().filter((category) => category.archivedAt === null),
  );

  constructor() {
    if (this.isBrowser) {
      // Le seul appelant qui ABSORBE l'échec : au démarrage personne n'attend ce
      // chargement. La raison, elle, reste dans `loadError`.
      void this.reload().catch(() => undefined);
    } else {
      this.settled.set(true);
    }
  }

  async reload(): Promise<void> {
    try {
      await this.load.run(
        () => this.api.list(),
        (rows) => this.state.set(rows),
      );
    } finally {
      // Y compris sur un échec : la page a désormais quelque chose à dire, et
      // laisser tourner le chargeur sur une erreur connue est un écran figé.
      this.settled.set(true);
    }
  }

  async createCategory(payload: CreateAllergenCategoryPayload): Promise<void> {
    await this.api.createCategory(payload);
    await this.reload();
  }

  async renameCategory(id: string, name: LocalizedText): Promise<void> {
    await this.api.renameCategory(id, { name });
    await this.reload();
  }

  async moveCategory(id: string, position: number): Promise<void> {
    await this.api.moveCategory(id, { position });
    await this.reload();
  }

  async archiveCategory(id: string): Promise<void> {
    await this.api.archiveCategory(id);
    await this.reload();
  }

  async restoreCategory(id: string): Promise<void> {
    await this.api.restoreCategory(id);
    await this.reload();
  }

  async createEntry(payload: CreateAllergenEntryPayload): Promise<void> {
    await this.api.createEntry(payload);
    await this.reload();
  }

  async reviseEntry(id: string, payload: ReviseAllergenEntryPayload): Promise<void> {
    await this.api.reviseEntry(id, payload);
    await this.reload();
  }

  async archiveEntry(id: string): Promise<void> {
    await this.api.archiveEntry(id);
    await this.reload();
  }

  async restoreEntry(id: string): Promise<void> {
    await this.api.restoreEntry(id);
    await this.reload();
  }
}
