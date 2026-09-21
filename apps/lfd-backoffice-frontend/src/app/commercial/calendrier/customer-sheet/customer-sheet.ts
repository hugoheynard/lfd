import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldInlineConfirmComponent,
} from 'fold-ng';
import { RouterLink } from '@angular/router';
import type { CompanyStatusAction, CustomerOrderLine, CustomerSheetView } from '@lfd/contracts';
import { formatCents, orderStatusLabel, orderStatusVariant } from '@lfd/b2b-ui/order';

import { NotifyService } from '../../../notify.service';
import { CustomerSheetService } from './customer-sheet.service';
import { companyStatusLabel, companyStatusTone, membershipAge } from './customer-format';

/** Les libellés d'état, tels que le commercial les lit. */
/**
 * **Fiche client, version commerciale** — ce qu'on a sous les yeux en décrochant.
 *
 * Deux cartes, dans l'ordre où on s'en sert : **qui** est en face (établissement,
 * catégorie, ancienneté, contact), et **quoi** il a commandé. Les actions qui
 * engagent — suspendre, résilier — sont en bas, derrière une confirmation en
 * ligne : ce ne sont pas des gestes qu'on fait en passant.
 *
 * 🔴 Elle en portait **trois** : « combien il pèse » — quatre chiffres — est
 * parti dans `app-compte-chiffres` le 2026-09-08. Sur la fiche d'un compte, ces
 * chiffres sont remontés dans l'en-tête, où ils valent pour les huit onglets ;
 * les laisser aussi ici les aurait affichés deux fois sur le même écran. La page
 * rendez-vous, qui n'a pas d'en-tête de compte, appelle le composant elle-même.
 *
 * Il ne **charge rien** : la page lui descend la fiche déjà lue, parce que le
 * rail d'historique s'en sert aussi — deux composants qui appelleraient la même
 * route feraient deux requêtes pour un seul écran. Il **agit**, en revanche, et
 * prévient (`changed`) pour que la page relise ce que le serveur détient.
 */
@Component({
  selector: 'app-customer-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldInlineConfirmComponent,
    RouterLink,
  ],
  templateUrl: './customer-sheet.html',
  styleUrl: './customer-sheet.scss',
})
export class CustomerSheet {
  private readonly service = inject(CustomerSheetService);
  private readonly notify = inject(NotifyService);

  readonly sheet = input.required<CustomerSheetView>();
  /** L'état du compte a changé : la page relit. */
  readonly changed = output<void>();

  protected readonly busy = signal(false);

  /** Posé une fois : une fiche ne doit pas changer d'ancienneté pendant qu'on la lit. */
  private readonly now = new Date();

  protected readonly statusLabel = computed(() => companyStatusLabel(this.sheet().status));
  protected readonly statusTone = computed(() => companyStatusTone(this.sheet().status));

  /** L'établissement : l'enseigne si elle existe, la raison sociale sinon. */
  protected readonly displayName = computed(() => {
    const sheet = this.sheet();
    return sheet.enseigne === '' ? sheet.raisonSociale : sheet.enseigne;
  });

  protected readonly age = computed(() => membershipAge(this.sheet().createdAt, this.now));

  /** Un compte actif se suspend ; un suspendu se réactive ; un résilié ne bouge plus. */
  protected readonly canSuspend = computed(() => this.sheet().status === 'active');
  protected readonly canReactivate = computed(() => this.sheet().status === 'suspended');
  protected readonly canTerminate = computed(
    () => this.sheet().status === 'active' || this.sheet().status === 'suspended',
  );

  /**
   * Le total d'une commande, **au centime**.
   *
   * `formatCents` et non le `euros()` de cette fiche, qui arrondit à l'euro : cet
   * arrondi sert les CUMULS de l'en-tête (« 12 480 € » se retient), et il ment
   * sur une ligne de commande, qui est un montant facturé. Le client qui appelle
   * lit ses centimes sur sa facture.
   */
  protected money(cents: number): string {
    return formatCents(cents);
  }

  /** Le mot français, partagé avec l'écran du client — cf. `@lfd/b2b-ui/order`. */
  protected orderLabel(status: CustomerOrderLine['status']): string {
    return orderStatusLabel(status);
  }

  protected orderTone(status: CustomerOrderLine['status']): ReturnType<typeof orderStatusVariant> {
    return orderStatusVariant(status);
  }

  /** Suspend, réactive ou résilie — et relit la fiche pour afficher l'état réel. */
  protected async changeStatus(action: CompanyStatusAction, reason: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.service.changeStatus(this.sheet().companyId, { action, reason });
      this.changed.emit();
      this.notify.success(DONE_LABEL[action]);
    } catch (error) {
      this.notify.error(error, "L'état du compte n'a pas pu être changé.");
    } finally {
      this.busy.set(false);
    }
  }
}

/** Ce qu'on confirme au commercial, une fois le geste passé. */
const DONE_LABEL: Record<CompanyStatusAction, string> = {
  suspend: 'Compte suspendu.',
  reactivate: 'Compte réactivé.',
  terminate: 'Compte résilié.',
};
