import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  companyDisplayName,
  PAYMENT_LINK_LABEL_MAX,
  type CreatedPaymentLink,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { formatCents } from '@lfd/b2b-ui/order';
import { httpErrorMessage } from '@lfd/endpoints';

import type { AdminCompany } from '../../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';
import { centsOf } from '../../cents-field';
import { copyLink } from '../../copy-link';
import { NotifyService } from '../../../notify.service';
import { PaymentLinksService } from '../../payment-links.service';

/** Charge d'ouverture : le plafond en vigueur, pour le dire avant qu'on le heurte. */
export interface NewLinkPanelData {
  readonly maxCents: number | null;
}

/**
 * **Nouveau lien libre** — une société, un montant en euros, un libellé repris
 * sur la page Stripe. Une fois créé, le panneau montre l'URL à copier sans
 * relire la liste ; il se ferme sur `true` pour que l'appelant la relise.
 *
 * Le montant est converti en centimes ENTIERS ici (`centsOf`) : une saisie plus
 * fine que le centime est refusée, jamais arrondie. Le plafond, lui, est une
 * règle du serveur — l'écran l'annonce, le refus est le sien.
 */
@Component({
  selector: 'app-new-link-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './new-link-panel.html',
  styleUrl: './new-link-panel.scss',
})
export class NewLinkPanel {
  private readonly api = inject(PaymentLinksService);
  private readonly companiesApi = inject(AdminCompaniesService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<NewLinkPanelData | undefined>(undefined);

  protected readonly companies = signal<readonly AdminCompany[]>([]);
  protected readonly loadingCompanies = signal(true);
  protected readonly companiesError = signal<string | null>(null);

  protected readonly companyId = signal<string | null>(null);
  protected readonly amount = signal('');
  protected readonly label = signal('');

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly created = signal<CreatedPaymentLink | null>(null);

  protected readonly labelMax = PAYMENT_LINK_LABEL_MAX;

  protected readonly companyOptions = computed(() =>
    this.companies()
      .map((company) => ({ value: company.id, label: companyDisplayName(company) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
  );

  protected readonly amountCents = computed(() => centsOf(this.amount()));
  protected readonly amountInvalid = computed(
    () => this.amount().trim() !== '' && this.amountCents() === null,
  );

  protected readonly amountHint = computed(() => {
    if (this.amountInvalid()) {
      return 'Un montant positif, au centime près (ex. 125,50).';
    }
    const max = this.data()?.maxCents ?? null;
    return max === null ? 'Aucun plafond en vigueur.' : `Plafond en vigueur : ${formatCents(max)}.`;
  });

  private readonly trimmedLabel = computed(() => this.label().trim());
  protected readonly labelTooLong = computed(
    () => this.trimmedLabel().length > PAYMENT_LINK_LABEL_MAX,
  );

  protected readonly canSubmit = computed(
    () =>
      this.companyId() !== null &&
      this.amountCents() !== null &&
      this.trimmedLabel() !== '' &&
      !this.labelTooLong() &&
      !this.saving(),
  );

  constructor() {
    void this.loadCompanies();
  }

  protected async loadCompanies(): Promise<void> {
    this.loadingCompanies.set(true);
    this.companiesError.set(null);
    try {
      this.companies.set(await this.companiesApi.list());
    } catch (caught) {
      this.companiesError.set(httpErrorMessage(caught, 'Les sociétés sont illisibles.'));
    } finally {
      this.loadingCompanies.set(false);
    }
  }

  protected async submit(): Promise<void> {
    const companyId = this.companyId();
    const amountCents = this.amountCents();
    if (companyId === null || amountCents === null || !this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      this.created.set(
        await this.api.createLink({ companyId, amountCents, label: this.trimmedLabel() }),
      );
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, "Le lien n'a pas pu être créé."));
    } finally {
      this.saving.set(false);
    }
  }

  protected async copy(url: string): Promise<void> {
    await copyLink(url, this.notify);
  }

  /** Fermer après création dit à l'appelant de relire ; avant, rien n'a changé. */
  protected close(): void {
    if (this.created() === null) {
      this.ref.close();
    } else {
      this.ref.close(true);
    }
  }
}
