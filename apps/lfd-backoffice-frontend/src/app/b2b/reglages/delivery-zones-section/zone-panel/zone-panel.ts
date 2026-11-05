import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  UNSET_DELIVERY_AUDIENCE_TERMS,
  type AdminDeliveryZoneView,
  type CartAdjustment,
  type CustomerAudience,
  type DeliveryPricingTerms,
  type DeliveryZonePayload,
  type DeliveryZoneView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldDangerZoneComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSelectComponent,
} from 'fold-ng';

import {
  fromCartAdjustment,
  PriceAlterationField,
  toCartAdjustment,
  type PriceAlteration,
} from '@lfd/b2b-ui/pricing';

import { NotifyService } from '../../../../notify.service';
import { DeliveryZonesService } from '../../delivery-zones.service';
import { AUDIENCE_LABELS } from '../delivery-audiences';

/**
 * Charge d'ouverture : la zone à éditer, ou `null` pour en créer une. En
 * création, `postalCode` préremplit la première ligne — le code d'une adresse
 * de livraison qu'aucune zone ne couvre (2026-10-20).
 */
export interface ZonePanelData {
  /** Avec ses remplacements quand le staff peut les lire (`GET /admin/delivery-zones`). */
  readonly zone: DeliveryZoneView | AdminDeliveryZoneView | null;
  readonly postalCode?: string;
  /** Les clientèles ouvertes à la livraison (0b) : seules elles ont un remplacement à l'écran. */
  readonly audiences?: readonly CustomerAudience[];
}

type Overrides = Readonly<Record<CustomerAudience, CartAdjustment | null>>;

const NO_TERMS: DeliveryPricingTerms = {
  b2b: UNSET_DELIVERY_AUDIENCE_TERMS,
  b2c: UNSET_DELIVERY_AUDIENCE_TERMS,
};

/** Les remplacements d'une zone lue par la route admin ; `null` par la route publique. */
function termsOf(zone: DeliveryZoneView | AdminDeliveryZoneView): DeliveryPricingTerms | null {
  return 'audienceTerms' in zone ? zone.audienceTerms : null;
}

/**
 * Les remplacements à écrire : ceux des clientèles OUVERTES tels qu'à l'écran,
 * le reste (clientèle masquée, franco — lot 1) tel qu'il était. Masquer une
 * clientèle n'efface pas ses valeurs.
 */
function termsToWrite(
  base: DeliveryPricingTerms,
  shown: readonly CustomerAudience[],
  overrides: Overrides,
): DeliveryPricingTerms {
  const at = (audience: CustomerAudience) => ({
    fee: shown.includes(audience) ? overrides[audience] : base[audience].fee,
    freeDeliveryThresholdCents: base[audience].freeDeliveryThresholdCents,
  });
  return { b2b: at('b2b'), b2c: at('b2c') };
}

/** Type d'une entrée : un code postal exact (5 chiffres) ou un préfixe de secteur. */
type RowType = 'postcode' | 'prefix';

/** Une ligne éditable — `id` stable (SSR-safe, compteur) pour le `track`. */
interface PrefixRow {
  readonly id: number;
  readonly type: RowType;
  readonly value: string;
}

const POSTCODE_RE = /^\d{5}$/u;
const PREFIX_RE = /^\d{2,4}$/u;

/** Une ligne est valide selon son type (code postal = 5 chiffres, préfixe = 2-4). */
function isRowValid(row: PrefixRow): boolean {
  const value = row.value.trim();
  return row.type === 'postcode' ? POSTCODE_RE.test(value) : PREFIX_RE.test(value);
}

/**
 * Panneau **Zone de livraison** — crée ou édite un secteur couvert + son frais de
 * livraison (% ou €, toujours présent). Le secteur est une **liste de lignes**,
 * chacune un **code postal** exact (`73150`) ou un **préfixe** de secteur (`731`).
 * En cas de chevauchement, le plus spécifique gagne (résolu serveur + client).
 * Le type est dérivé de la longueur à l'ouverture (5 chiffres = code postal).
 */
@Component({
  selector: 'app-zone-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDangerZoneComponent,
    FoldButtonIconComponent,
    FoldInputComponent,
    FoldSelectComponent,
    PriceAlterationField,
  ],
  templateUrl: './zone-panel.html',
  styleUrl: './zone-panel.scss',
})
export class ZonePanel {
  private readonly zones = inject(DeliveryZonesService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<ZonePanelData | undefined>(undefined);

  private seq = 1;
  /** Les lignes du secteur — une ligne vide par défaut (création). */
  protected readonly rows = signal<PrefixRow[]>([{ id: 0, type: 'postcode', value: '' }]);
  protected readonly label = signal('');
  protected readonly fee = signal<CartAdjustment | null>(null);
  /** Le remplacement du réglage global, par clientèle ; `null` = la zone reprend le global. */
  protected readonly overrides = signal<Overrides>({ b2b: null, b2c: null });
  protected readonly audienceLabels = AUDIENCE_LABELS;
  protected readonly audiences = computed(() => this.data()?.audiences ?? []);
  /**
   * Les remplacements tels qu'en base ; `null` quand la zone vient de la
   * route publique (sans eux) : l'écriture n'y touche alors pas.
   */
  private readonly baseTerms = computed<DeliveryPricingTerms | null>(() => {
    const zone = this.data()?.zone ?? null;
    if (zone === null) {
      return NO_TERMS;
    }
    return termsOf(zone);
  });
  protected readonly canOverride = computed(
    () => this.baseTerms() !== null && this.audiences().length > 0,
  );
  protected readonly saving = signal(false);
  /** Le dernier refus du serveur, en clair : il reste DANS le panneau. */
  protected readonly refusal = signal<string | null>(null);

  /**
   * Le frais vu comme une altération de prix. Le sens est **structurel** — un
   * frais de zone majore, toujours — donc il ne se stocke pas : on le remet à
   * la lecture et on le laisse tomber à l'écriture.
   */
  protected readonly feeAlteration = computed(() => fromCartAdjustment(this.fee(), 'increase'));

  protected setFee(alteration: PriceAlteration | null): void {
    this.fee.set(toCartAdjustment(alteration));
  }

  protected overrideAlteration(audience: CustomerAudience): PriceAlteration | null {
    return fromCartAdjustment(this.overrides()[audience], 'increase');
  }

  protected setOverride(audience: CustomerAudience, alteration: PriceAlteration | null): void {
    this.overrides.update((all) => ({ ...all, [audience]: toCartAdjustment(alteration) }));
  }

  /** « Remplacer pour cette zone » : part du frais de la zone, qu'on corrige ensuite. */
  protected startOverride(audience: CustomerAudience): void {
    this.overrides.update((all) => ({
      ...all,
      [audience]: this.fee() ?? { mode: 'amount', cents: 0 },
    }));
  }

  /** « Revenir au global » : la zone reprend le réglage global de la clientèle. */
  protected backToGlobal(audience: CustomerAudience): void {
    this.overrides.update((all) => ({ ...all, [audience]: null }));
  }

  /** Les préfixes valides (dédupliqués) — payload + gate de soumission. */
  protected readonly prefixes = computed(() => [
    ...new Set(
      this.rows()
        .filter(isRowValid)
        .map((row) => row.value.trim()),
    ),
  ]);

  protected readonly isCreate = computed(() => (this.data()?.zone ?? null) === null);
  protected readonly heading = computed(() =>
    this.isCreate() ? 'Nouvelle zone de livraison' : 'Modifier la zone de livraison',
  );
  protected readonly canSubmit = computed(() => this.prefixes().length > 0 && this.fee() !== null);

  constructor() {
    // Édition : reconstruit les lignes depuis les préfixes (type dérivé de la
    // longueur, 5 chiffres = code postal exact).
    effect(() => {
      const zone = this.data()?.zone ?? null;
      const terms = this.baseTerms() ?? NO_TERMS;
      this.overrides.set({ b2b: terms.b2b.fee, b2c: terms.b2c.fee });
      if (zone === null) {
        this.prefill(this.data()?.postalCode ?? '');
        return;
      }
      this.rows.set(
        zone.postalPrefixes.map((prefix) => ({
          id: this.seq++,
          type: prefix.length === 5 ? ('postcode' as const) : ('prefix' as const),
          value: prefix,
        })),
      );
      this.label.set(zone.label);
      this.fee.set(zone.fee);
    });
  }

  /** Création préremplie : une ligne, typée par la longueur comme à l'édition. */
  private prefill(postalCode: string): void {
    if (postalCode === '') {
      return;
    }
    this.rows.set([
      { id: this.seq++, type: postalCode.length === 5 ? 'postcode' : 'prefix', value: postalCode },
    ]);
  }

  protected addRow(): void {
    this.rows.update((rows) => [...rows, { id: this.seq++, type: 'postcode', value: '' }]);
  }

  protected removeRow(id: number): void {
    this.rows.update((rows) => rows.filter((row) => row.id !== id));
  }

  protected setType(id: number, type: RowType): void {
    this.rows.update((rows) => rows.map((row) => (row.id === id ? { ...row, type } : row)));
  }

  protected setValue(id: number, value: string): void {
    this.rows.update((rows) => rows.map((row) => (row.id === id ? { ...row, value } : row)));
  }

  protected async submit(): Promise<void> {
    const fee = this.fee();
    const zone = this.data()?.zone ?? null;
    if (!this.canSubmit() || fee === null || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const base = this.baseTerms();
    const payload: DeliveryZonePayload = {
      postalPrefixes: this.prefixes(),
      label: this.label().trim(),
      fee,
      ...(base === null
        ? {}
        : { audienceTerms: termsToWrite(base, this.audiences(), this.overrides()) }),
    };
    try {
      if (zone === null) {
        await this.zones.create(payload);
        this.notify.success('Zone de livraison ajoutée.');
      } else {
        await this.zones.update(zone.id, payload);
        this.notify.success('Zone de livraison mise à jour.');
      }
      this.ref.close(true);
    } catch (error) {
      this.refusal.set(
        httpErrorMessage(error, "La zone de livraison n'a pas pu être enregistrée."),
      );
    } finally {
      this.saving.set(false);
    }
  }

  /** Ce qu'il faut taper pour supprimer : le libellé de la zone, ou ses codes. */
  protected readonly confirmPhrase = computed(() => {
    const zone = this.data()?.zone ?? null;
    if (zone === null) {
      return '';
    }
    return zone.label.trim() || zone.postalPrefixes.join(', ');
  });

  /**
   * 🔴 **La suppression était une entrée du menu de la liste**, confirmée d'un
   * clic, jusqu'au 2026-09-15 (Hugo). Elle vit désormais ici, dans une zone
   * dangereuse qui fait taper le libellé. Aucune zone n'est obligatoire : sans
   * zone, la livraison n'ajoute aucun frais — la dernière se supprime aussi.
   */
  protected async remove(): Promise<void> {
    const zone = this.data()?.zone ?? null;
    if (zone === null || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.zones.remove(zone.id);
      this.notify.success('Zone de livraison supprimée.');
      this.ref.close(true);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "La zone de livraison n'a pas pu être supprimée."));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
