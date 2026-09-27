import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { LoyaltySettingsView, SetLoyaltySettingsPayload } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { centsField, centsOf } from '../../cents-field';
import { formatCents } from '@lfd/b2b-ui/order';

import { formatPoints, formatRatio } from '../../loyalty-format';
import { LoyaltyService } from '../../loyalty.service';

/** Ce que le premier enregistrement propose : un an (plan D5, décidé par Hugo). */
export const DEFAULT_VOUCHER_VALIDITY_DAYS = 365;

/**
 * Un centime HORS TAXE d'assiette rapporte un point. La constante qui fait foi
 * est `POINTS_PER_CENT` du domaine (`order-earning.ts`, non exportée ni publiée
 * dans `@lfd/contracts` — vérifié le 2026-09-27) : celle-ci en est l'écho, pour
 * que l'écran explique la règle sans la réécrire en chiffre nu.
 */
export const POINTS_PER_CENT = 1;

/** Le panier d'exemple du calcul en direct : 100,00 € HT. */
export const EXAMPLE_BASKET_CENTS = 10_000;

const PERCENT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** Le cashback d'un ratio, ou `null` si l'un des deux côtés est illisible. */
export function cashbackPercent(
  pointsPerStep: number | null,
  stepValueCents: number | null,
): number | null {
  if (
    pointsPerStep === null ||
    stepValueCents === null ||
    pointsPerStep <= 0 ||
    stepValueCents <= 0
  ) {
    return null;
  }
  // Un point = POINTS_PER_CENT⁻¹ centime dépensé : la valeur d'un point en
  // centimes, rapportée au centime qui l'a gagné, EST le taux.
  return (stepValueCents / pointsPerStep) * POINTS_PER_CENT * 100;
}

type Settings = NonNullable<LoyaltySettingsView['settings']>;

/** Un entier strictement positif, ou rien. */
function positiveInt(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * **Le réglage du programme de fidélité** : combien de points font un palier,
 * ce que vaut un palier en euros **hors taxe**, quelles clientèles gagnent, et combien de
 * temps vit un bon.
 *
 * Tant que rien n'est enregistré, le programme est **fermé** (plan D5) : aucune
 * colonne n'a de défaut en base, tout se pose d'un coup. La valeur se saisit
 * en euros et part en centimes entiers ; une saisie plus fine que le centime
 * est refusée, pas arrondie.
 *
 * Les pros restent fermés : `openToPro` attend un signal « facture réglée »
 * qui n'existe pas encore (plan D3, lot F). L'écran renvoie la valeur tenue
 * par le serveur, sans la laisser changer.
 */
@Component({
  selector: 'app-loyalty-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
  ],
  templateUrl: './loyalty-settings.html',
  styleUrl: './loyalty-settings.scss',
})
export class LoyaltySettings {
  private readonly api = inject(LoyaltyService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saving = signal(false);

  /** Le réglage tel que le serveur le tient — `null` : programme fermé. */
  protected readonly saved = signal<Settings | null>(null);

  protected readonly pointsPerStep = signal<number | null>(null);
  protected readonly stepValueInput = signal('');
  protected readonly openToPublic = signal(true);
  protected readonly voucherValidityDays = signal<number | null>(DEFAULT_VOUCHER_VALIDITY_DAYS);

  protected readonly canWrite = computed(() => this.permissions.can('b2b_accounting:write'));

  protected readonly pointsInvalid = computed(() => positiveInt(this.pointsPerStep()) === null);
  protected readonly stepValueInvalid = computed(() => centsOf(this.stepValueInput()) === null);
  protected readonly daysInvalid = computed(() => positiveInt(this.voucherValidityDays()) === null);

  /** Le payload complet, ou `null` tant qu'un champ est illisible. */
  protected readonly payload = computed<SetLoyaltySettingsPayload | null>(() => {
    const pointsPerStep = positiveInt(this.pointsPerStep());
    const stepValueCents = centsOf(this.stepValueInput());
    const voucherValidityDays = positiveInt(this.voucherValidityDays());
    if (pointsPerStep === null || stepValueCents === null || voucherValidityDays === null) {
      return null;
    }
    return {
      pointsPerStep,
      stepValueCents,
      openToPublic: this.openToPublic(),
      openToPro: this.saved()?.openToPro ?? false,
      voucherValidityDays,
    };
  });

  protected readonly dirty = computed(() => {
    const payload = this.payload();
    const saved = this.saved();
    if (payload === null) {
      return false;
    }
    return (
      saved === null ||
      payload.pointsPerStep !== saved.pointsPerStep ||
      payload.stepValueCents !== saved.stepValueCents ||
      payload.openToPublic !== saved.openToPublic ||
      payload.voucherValidityDays !== saved.voucherValidityDays
    );
  });

  /**
   * Le ratio d'un programme DÉJÀ réglé change : c'est le seul cas où
   * l'enregistrement demande une confirmation, parce qu'il change ce que
   * valent les points déjà gagnés (plan D5).
   */
  protected readonly ratioChanged = computed(() => {
    const payload = this.payload();
    const saved = this.saved();
    return (
      payload !== null &&
      saved !== null &&
      (payload.pointsPerStep !== saved.pointsPerStep ||
        payload.stepValueCents !== saved.stepValueCents)
    );
  });

  /** La phrase du calcul en direct, ou `null` tant qu'un côté du ratio manque. */
  protected readonly cashback = computed<string | null>(() => {
    const pointsPerStep = positiveInt(this.pointsPerStep());
    const stepValueCents = centsOf(this.stepValueInput());
    const percent = cashbackPercent(pointsPerStep, stepValueCents);
    if (percent === null || pointsPerStep === null || stepValueCents === null) {
      return null;
    }
    const points = EXAMPLE_BASKET_CENTS * POINTS_PER_CENT;
    const voucherCents = Math.round((points * stepValueCents) / pointsPerStep);
    return (
      `Soit ${PERCENT.format(percent)} % de cashback : ${formatCents(EXAMPLE_BASKET_CENTS)} HT ` +
      `d'achats rapportent ${formatPoints(points)} points, soit un bon de ${formatCents(voucherCents)} HT.`
    );
  });

  protected readonly summary = computed(() => {
    const saved = this.saved();
    if (saved === null) {
      return 'Programme fermé — aucun réglage enregistré';
    }
    return formatRatio(saved);
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const view = await this.api.readSettings();
      this.apply(view.settings);
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'Le réglage de la fidélité est illisible.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(): Promise<void> {
    const payload = this.payload();
    if (payload === null || !this.canWrite()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await this.api.saveSettings(payload);
      const first = this.saved() === null;
      this.apply(payload);
      this.notify.success(
        first
          ? `Programme ouvert : ${formatRatio(payload)}.`
          : `Réglage enregistré : ${formatRatio(payload)}.`,
      );
    } catch (caught) {
      this.saveError.set(httpErrorMessage(caught, "Le réglage n'a pas pu être enregistré."));
    } finally {
      this.saving.set(false);
    }
  }

  private apply(settings: Settings | null): void {
    this.saved.set(settings);
    if (settings === null) {
      return;
    }
    this.pointsPerStep.set(settings.pointsPerStep);
    this.stepValueInput.set(centsField(settings.stepValueCents));
    this.openToPublic.set(settings.openToPublic);
    this.voucherValidityDays.set(settings.voucherValidityDays);
  }
}
