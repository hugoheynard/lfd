import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import type { CollectionForm, ParentCompanyView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldListboxComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import { BankAccountSection } from '../bank-account-section/bank-account-section';

/** Une forme de prélèvement, son libellé et sa conséquence en une phrase. */
export interface CollectionFormChoice {
  readonly value: CollectionForm;
  readonly label: string;
  readonly consequence: string;
}

/**
 * Les trois formes du §2.1 ter, dans l'ordre du contrat. La première est la
 * facturation **groupée** ; les deux autres la font **séparée** — une ligne
 * par site au prélèvement (`COLLECTION_FORMS`, vérifié le 2026-10-05).
 */
export function collectionFormChoices(parent: string): readonly CollectionFormChoice[] {
  return [
    {
      value: 'principal_mandate',
      label: 'Mandat du principal (facturation groupée)',
      consequence: `Prélevé avec ${parent}, sur son mandat et son RIB : une seule ligne pour la société.`,
    },
    {
      value: 'own_mandate_principal_iban',
      label: 'Mandat propre au site, sur le RIB du principal (facturation séparée)',
      consequence: `Le site signe son propre mandat sur le compte de ${parent} : une ligne par site sur son relevé bancaire.`,
    },
    {
      value: 'own_iban',
      label: 'RIB propre au site (facturation séparée)',
      consequence: `Le site saisit son RIB et signe son mandat : prélevé sur un autre compte, toujours au nom de ${parent}.`,
    },
  ];
}

/** La forme fait-elle prélever le site sur SON mandat ? */
export function needsSiteMandate(form: CollectionForm | null): boolean {
  return form === 'own_mandate_principal_iban' || form === 'own_iban';
}

/**
 * **Facturation d'un site** (`plan-sous-comptes.md` §2.1, §2.1 ter) : la forme
 * de prélèvement, qui dit aussi si la facturation est groupée ou séparée. Le
 * débiteur nommé reste toujours la société du principal.
 *
 * La valeur part de la forme EN VIGUEUR que la fiche relit
 * (`hierarchy.collectionForm`) ; `null` = aucune forme posée, et le serveur
 * prélève alors sur le mandat du principal.
 */
@Component({
  selector: 'app-collection-form-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BankAccountSection,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
  ],
  templateUrl: './collection-form-card.html',
  styleUrl: './collection-form-card.scss',
})
export class CollectionFormCard {
  private readonly service = inject(AdminCompanyHierarchyService);

  readonly companyId = input.required<string>();
  readonly parent = input.required<ParentCompanyView>();
  /** La forme en vigueur, relue par la fiche (`hierarchy.collectionForm?.form`). */
  readonly current = input<CollectionForm | null>(null);

  protected readonly form = linkedSignal<CollectionForm | null>(() => this.current());
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly choices = computed(() => collectionFormChoices(this.parent().enseigne));
  protected readonly options = computed<FoldSelectOption<CollectionForm>[]>(() =>
    this.choices().map(({ value, label }) => ({ value, label })),
  );
  protected readonly ownMandate = computed(() => needsSiteMandate(this.form()));

  protected async choose(form: CollectionForm): Promise<void> {
    if (this.saving() || form === this.form()) {
      return;
    }
    const previous = this.form();
    this.form.set(form);
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.service.setCollectionForm(this.companyId(), form);
    } catch (error) {
      this.form.set(previous);
      this.refusal.set(httpErrorMessage(error, 'La forme de prélèvement n’a pas changé.'));
    } finally {
      this.saving.set(false);
    }
  }
}
