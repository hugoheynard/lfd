import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { ChorusServicePayload, ChorusServiceView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInputComponent,
} from 'fold-ng';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { frenchDay } from '../../comptes-clients/kbis-age-wording';

/**
 * La carte **Service Chorus** d'une société qui commande : le code service de
 * l'unité et l'engagement en cours de son bon de commande, posés par le staff
 * à réception du bon. L'engagement préremplit les commandes de la société
 * tant que la journée choisie tombe au plus tard sa date de fin.
 *
 * Sur une société qui est son propre payeur, le code service est celui de sa
 * fiche Chorus Pro : la carte ne propose alors que l'engagement. Ce que vaut
 * la fiche (payeur public, numéro et date qui vont ensemble) se juge au
 * serveur, et son refus s'affiche tel quel.
 *
 * Plan : `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`, § 6 octies.
 */
@Component({
  selector: 'app-chorus-service-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldInputComponent,
  ],
  templateUrl: './chorus-service-card.html',
  styleUrl: './chorus-service-card.scss',
})
export class ChorusServiceCard {
  private readonly service = inject(AdminCompaniesService);

  readonly company = input.required<AdminCompanyDetail>();
  /** Le droit d'écrire la fiche (`b2b_companies:write`). */
  readonly canManage = input(false);

  /** La fiche a été posée : la fiche client se relit. */
  readonly changed = output<void>();

  protected readonly fiche = computed<ChorusServiceView | null>(() => this.company().chorusService);

  /** Le payeur d'aujourd'hui : le principal dont elle suit la facturation, sinon elle-même. */
  private readonly payerId = computed(() => {
    const company = this.company();
    const parent = company.hierarchy.parent;
    const followsBilling = company.hierarchy.follows.some((f) => f.aspect === 'billing');
    return followsBilling && parent !== null ? parent.id : company.id;
  });

  /** La société est son propre payeur : son code service est celui de sa fiche Chorus Pro. */
  protected readonly solePayer = computed(() => this.payerId() === this.company().id);

  /** Le payeur a changé depuis la pose : la fiche ne propose plus rien à la commande. */
  protected readonly payerChanged = computed(() => {
    const fiche = this.fiche();
    return fiche !== null && fiche.payerCompanyId !== this.payerId();
  });

  /** « Posée le 23/11/2026 par Camille Rousseau (commercial). » */
  protected readonly recordedLine = computed(() => {
    const fiche = this.fiche();
    if (fiche === null) {
      return '';
    }
    const { name, role } = fiche.recordedBy;
    const by = name === '' ? '' : role === '' ? ` par ${name}` : ` par ${name} (${role})`;
    return `Posée le ${frenchDay(fiche.recordedAt.slice(0, 10))}${by}.`;
  });

  protected readonly editing = signal(false);
  protected readonly serviceCode = signal('');
  protected readonly commitmentNumber = signal('');
  protected readonly commitmentEndsOn = signal('');
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** Un numéro et sa date de fin vont ensemble : l'un sans l'autre ne part pas. */
  protected readonly paired = computed(
    () => (this.commitmentNumber().trim() === '') === (this.commitmentEndsOn() === ''),
  );
  protected readonly canSave = computed(() => !this.saving() && this.paired());

  protected readonly frenchDay = frenchDay;

  /** Ouvre la saisie, préremplie de la fiche posée — ou vierge. */
  edit(): void {
    const fiche = this.fiche();
    this.serviceCode.set(fiche?.serviceCode ?? '');
    this.commitmentNumber.set(fiche?.currentCommitment?.number ?? '');
    this.commitmentEndsOn.set(fiche?.currentCommitment?.endsOn ?? '');
    this.refusal.set(null);
    this.editing.set(true);
  }

  protected cancel(): void {
    this.editing.set(false);
    this.refusal.set(null);
  }

  /** Retirer l'engagement, c'est reposer la fiche sans numéro ni date. */
  protected clearCommitment(): void {
    this.commitmentNumber.set('');
    this.commitmentEndsOn.set('');
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    const number = this.commitmentNumber().trim();
    const payload: ChorusServicePayload = {
      serviceCode: this.solePayer() ? '' : this.serviceCode().trim(),
      commitmentNumber: number,
      commitmentEndsOn: number === '' ? null : this.commitmentEndsOn(),
    };
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.service.setChorusService(this.company().id, payload);
      this.editing.set(false);
      this.changed.emit();
    } catch (error) {
      this.refusal.set(
        httpErrorMessage(error, 'La fiche du service Chorus n’a pas été enregistrée.'),
      );
    } finally {
      this.saving.set(false);
    }
  }
}
