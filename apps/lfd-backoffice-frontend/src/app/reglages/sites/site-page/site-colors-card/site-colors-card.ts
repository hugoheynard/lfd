import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import type { SiteColorsPayload, SiteView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldFieldsetComponent,
  FoldInputComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import { normalizeSiteColor, SITE_COLOR_MESSAGES, siteColorIssue } from '../../site-color';
import { SitesService } from '../../sites.service';

type ColorKey = keyof SiteColorsPayload;

/** Une couleur à l'écran : son champ, son libellé, le rôle qui la rend utile. */
interface ColorSlot {
  readonly key: ColorKey;
  readonly label: string;
  readonly role: 'handsOver' | 'dispatches';
}

const SLOTS: readonly ColorSlot[] = [
  { key: 'pickupColorB2b', label: 'Retrait B2B', role: 'handsOver' },
  { key: 'pickupColorB2c', label: 'Retrait B2C', role: 'handsOver' },
  { key: 'deliveryColorB2b', label: 'Livraison B2B', role: 'dispatches' },
  { key: 'deliveryColorB2c', label: 'Livraison B2C', role: 'dispatches' },
];

export function colorsOf(site: SiteView): SiteColorsPayload {
  return {
    pickupColorB2b: site.pickupColorB2b,
    pickupColorB2c: site.pickupColorB2c,
    deliveryColorB2b: site.deliveryColorB2b,
    deliveryColorB2c: site.deliveryColorB2c,
  };
}

/**
 * **Les couleurs d'un site** — libres (Hugo, 2026-10-13), sauf le vert, le
 * rouge et le rose des surligneurs OK / KO (plan des sites, §3.5).
 *
 * La teinte est jugée À LA SAISIE par la copie front de la règle
 * (`../../site-color.ts`), avec la même phrase que le serveur : on n'attend
 * pas l'aller-retour pour dire qu'un vert est refusé. Le serveur juge quand
 * même — c'est lui l'autorité.
 *
 * Une couleur posée se change, elle ne s'efface pas (l'agrégat le refuse) :
 * il n'y a donc pas de bouton pour la vider. Les couleurs de retrait ne se
 * montrent qu'à un site qui remet, celles de livraison qu'à un site qui
 * expédie — elles restent enregistrées telles quelles sinon.
 */
@Component({
  selector: 'app-site-colors-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldFieldsetComponent,
    FoldInputComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './site-colors-card.html',
  styleUrl: './site-colors-card.scss',
})
export class SiteColorsCard {
  private readonly sites = inject(SitesService);
  private readonly notify = inject(NotifyService);

  readonly site = input.required<SiteView>();
  readonly readOnly = input(false);
  readonly saved = output();

  /** Ce que l'utilisateur a TAPÉ, pas encore normalisé — `null` = non saisie. */
  protected readonly draft = linkedSignal(() => colorsOf(this.site()));
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** Les couleurs que les rôles ENREGISTRÉS du site rendent utiles. */
  protected readonly slots = computed(() => {
    const site = this.site();
    return SLOTS.filter((slot) => site[slot.role]);
  });

  /** La phrase de refus de chaque couleur saisie, ou rien. */
  protected readonly issues = computed(() => {
    const draft = this.draft();
    const issues: Partial<Record<ColorKey, string>> = {};
    for (const slot of SLOTS) {
      const value = draft[slot.key];
      const issue = value === null ? null : siteColorIssue(value);
      if (issue !== null) {
        issues[slot.key] = SITE_COLOR_MESSAGES[issue];
      }
    }
    return issues;
  });

  protected readonly dirty = computed(() => {
    const draft = this.draft();
    const current = colorsOf(this.site());
    return SLOTS.some((slot) => normalized(draft[slot.key]) !== normalized(current[slot.key]));
  });

  protected readonly canSave = computed(
    () =>
      !this.readOnly() && this.dirty() && Object.keys(this.issues()).length === 0 && !this.saving(),
  );

  /** La couleur à peindre dans la pastille : seulement une couleur acceptable. */
  protected swatch(key: ColorKey): string | null {
    const value = this.draft()[key];
    return value !== null && siteColorIssue(value) === null ? normalizeSiteColor(value) : null;
  }

  /**
   * La valeur du sélecteur natif. Il n'accepte que `#rrggbb` en minuscules ;
   * une saisie incomplète ne l'atteint pas.
   */
  protected pickerValue(key: ColorKey): string {
    const value = this.draft()[key];
    return value !== null && siteColorIssue(value) !== 'format' ? normalizeSiteColor(value) : '';
  }

  /**
   * Vider le champ d'une couleur jamais posée la rend à « non saisie ». Vider
   * une couleur posée reste une saisie invalide : le serveur refuserait
   * l'effacement.
   */
  protected setColor(key: ColorKey, value: string): void {
    const untouched = value.trim() === '' && colorsOf(this.site())[key] === null;
    this.draft.update((current) => ({ ...current, [key]: untouched ? null : value }));
    this.refusal.set(null);
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    const draft = this.draft();
    const payload: SiteColorsPayload = {
      pickupColorB2b: normalized(draft.pickupColorB2b),
      pickupColorB2c: normalized(draft.pickupColorB2c),
      deliveryColorB2b: normalized(draft.deliveryColorB2b),
      deliveryColorB2c: normalized(draft.deliveryColorB2c),
    };
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.sites.setColors(this.site().id, payload);
      this.notify.success('Couleurs du site enregistrées.');
      this.saved.emit();
    } catch (error) {
      this.refusal.set(
        httpErrorMessage(error, "Les couleurs du site n'ont pas pu être enregistrées."),
      );
    } finally {
      this.saving.set(false);
    }
  }
}

function normalized(value: string | null): string | null {
  return value === null ? null : normalizeSiteColor(value);
}
