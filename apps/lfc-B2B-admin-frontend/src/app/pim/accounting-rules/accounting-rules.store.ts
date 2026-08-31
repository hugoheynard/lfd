import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import type { AccountingRulesView } from '@lfd/pim-contracts';

import { AccountingRulesHttpApi } from './accounting-rules-http-api';

/** Rien réglé : la forme que rend le serveur, et l'état de départ de l'écran. */
const NEVER_SET: AccountingRulesView = { ratioBp: null, updatedAt: null };

/**
 * Source réactive unique des **règles comptables**.
 *
 * `ratioBp` à `null` veut dire **jamais réglé**, et l'écran doit pouvoir le
 * dire. On ne le remplace donc pas par 100 % au passage : ce serait affirmer
 * « le pro paie le prix public », et rendre ce réglage-là indistinguable d'un
 * blanc.
 */
@Injectable({ providedIn: 'root' })
export class AccountingRulesStore {
  private readonly api = inject(AccountingRulesHttpApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<AccountingRulesView>(NEVER_SET);
  readonly rules = this.state.asReadonly();

  /**
   * Pourquoi la lecture a échoué — `null` = elle n'a pas échoué.
   *
   * Il faut le distinguer de « jamais réglé » : les deux affichent un blanc,
   * mais l'un invite à saisir et l'autre à réessayer. Confondre les deux ferait
   * proposer un formulaire qui écraserait un réglage qu'on n'a pas su lire.
   */
  private readonly loadFailure = signal<unknown>(null);
  readonly loadError = this.loadFailure.asReadonly();

  private readonly loading = signal(false);
  readonly isLoading = this.loading.asReadonly();

  constructor() {
    if (this.isBrowser) {
      // Personne n'attend ce chargement au démarrage : un rejet non géré ne
      // rendrait service à personne. La raison est retenue dans `loadError`.
      void this.reload().catch(() => undefined);
    }
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.state.set(await this.api.read());
      this.loadFailure.set(null);
    } catch (caught) {
      this.loadFailure.set(caught);
      throw caught;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Pose le rapport et adopte la vue que le serveur renvoie — pas celle qu'on
   * vient d'envoyer. C'est lui qui date le fait.
   */
  async setProPriceRatio(ratioBp: number): Promise<void> {
    this.state.set(await this.api.setProPriceRatio(ratioBp));
    this.loadFailure.set(null);
  }
}
