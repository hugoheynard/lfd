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
import { NgTemplateOutlet } from '@angular/common';
import type { SiteColorsPayload, SiteRolesPayload, SiteView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { type GpsDraft, gpsDraftFrom, gpsIssue, toGps } from '../../../../b2b/reglages/pickup-gps';
import { DeliveryAvailabilityService } from '../../../../b2b/reglages/delivery-availability.service';
import { NotifyService } from '../../../../notify.service';
import { SitesService } from '../../sites.service';
import { type ColorChange, SiteColorFields } from '../site-color-fields/site-color-fields';
import {
  closedColors,
  colorIssues,
  colorsDirty,
  colorsOf,
  colorsPayload,
  DELIVERY_SLOTS,
  type DeliveryOpen,
  PICKUP_SLOTS,
  withColor,
} from '../site-color-fields/site-colors-draft';
import { roleLabels } from '../../site-role-labels';
import {
  gpsChanged,
  gpsNotice,
  gpsPlace,
  rolesIssues,
  rolesOf,
  SUPPLY_OPTIONS,
  TRANSFER_MODE_OPTIONS,
} from './site-roles';

export { gpsNotice, gpsPlace, rolesIssues, rolesOf } from './site-roles';

/**
 * **Les rôles d'un site, les couleurs qu'ils portent et le point GPS** (plan des sites,
 * §3.1 et §3.4). Chaque couleur se montre SOUS la capacité qu'elle colore,
 * seulement quand elle est cochée (Hugo, 2026-10-13) ; décochée, elle est
 * masquée sans être effacée. Le point GPS se saisit sous « Livraison », et
 * voyage avec les rôles : « cocher Livraison et poser le point » est jugé en
 * une seule écriture.
 *
 * **Un seul bouton, deux routes**, dans l'ordre : `PUT …/roles`, puis
 * `PUT …/couleurs`. Les rôles d'abord, parce qu'ils décident quelles couleurs
 * ont un sens. Si la seconde échoue, la carte le DIT : les rôles sont
 * enregistrés, les couleurs restent en brouillon avec leur refus, et la page
 * n'est pas relue pour ne pas les écraser. Deux
 * boutons auraient laissé croire à une saisie unique enregistrée à moitié.
 */
@Component({
  selector: 'app-site-roles-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    NgTemplateOutlet,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldListboxComponent,
    FoldNumberInputComponent,
    FoldPageSectionComponent,
    SiteColorFields,
  ],
  templateUrl: './site-roles-card.html',
  styleUrl: './site-roles-card.scss',
})
export class SiteRolesCard {
  private readonly sites = inject(SitesService);
  private readonly notify = inject(NotifyService);
  private readonly availability = inject(DeliveryAvailabilityService);

  readonly site = input.required<SiteView>();
  /** Lecture seule : un site archivé ne se modifie plus. */
  readonly readOnly = input(false);
  /** Les rôles ou les couleurs sont enregistrés : la page relit le site. */
  readonly saved = output();

  protected readonly supplyOptions = SUPPLY_OPTIONS;
  protected readonly transferModeOptions = TRANSFER_MODE_OPTIONS;
  protected readonly pickupSlots = PICKUP_SLOTS;
  protected readonly deliverySlots = DELIVERY_SLOTS;

  /** Les brouillons, remis à l'état du serveur à chaque relecture du site. */
  protected readonly draft = linkedSignal(() => rolesOf(this.site()));
  protected readonly colors = linkedSignal(() => colorsOf(this.site()));
  /** Le point GPS, saisi ici et nulle part ailleurs (Hugo, 2026-10-13). */
  protected readonly gps = linkedSignal<GpsDraft>(() => gpsDraftFrom(this.site().gps));
  protected readonly gpsIssue = computed(() => gpsIssue(this.gps()));
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /**
   * À quelles clientèles on livre, lu par la route PUBLIQUE : elle ne demande
   * aucun droit, là où la route admin demande `delivery_availability:read`.
   * Tant qu'elle n'a pas répondu, ou si elle échoue, rien n'est grisé : l'aide
   * se tait plutôt que de bloquer une saisie que le serveur accepte.
   */
  private readonly open = signal<DeliveryOpen | null>(null);
  protected readonly closed = computed(() => closedColors(this.open()));

  protected readonly issues = computed(() => rolesIssues(this.draft(), this.site().isDeparture));
  protected readonly colorIssues = computed(() => colorIssues(this.colors()));
  protected readonly gpsNotice = computed(() =>
    gpsNotice(this.draft(), this.site(), toGps(this.gps())),
  );
  /** Sous quel rôle se saisit le point — un seul endroit à la fois. */
  protected readonly gpsPlace = computed(() => gpsPlace(this.draft()));
  /**
   * Les badges de l'en-tête : les mots de la liste des sites, sur l'état
   * ENREGISTRÉ — comme la liste, et comme « Archivé ». Le
   * brouillon se lit déjà dans les cases cochées juste dessous.
   */
  protected readonly badges = computed(() => roleLabels(this.site()));
  private readonly gpsDirty = computed(() => gpsChanged(this.site().gps, toGps(this.gps())));

  private readonly rolesDirty = computed(() => {
    const draft = this.draft();
    const current = rolesOf(this.site());
    // Les clientèles sont un objet : comparées case à case, pas par référence.
    const changed = (Object.keys(current) as (keyof SiteRolesPayload)[]).some((key) =>
      key === 'pickupAudiences'
        ? draft.pickupAudiences?.b2b !== current.pickupAudiences?.b2b ||
          draft.pickupAudiences?.b2c !== current.pickupAudiences?.b2c
        : draft[key] !== current[key],
    );
    return changed || this.gpsDirty();
  });
  private readonly colorsChanged = computed(() =>
    colorsDirty(this.colors(), colorsOf(this.site())),
  );

  protected readonly canSave = computed(
    () =>
      !this.readOnly() &&
      (this.rolesDirty() || this.colorsChanged()) &&
      this.issues().length === 0 &&
      Object.keys(this.colorIssues()).length === 0 &&
      this.gpsNotice()?.blocking !== true &&
      this.gpsIssue() === '' &&
      !this.saving(),
  );

  constructor() {
    this.availability.readPublic().then(
      (view) => this.open.set({ b2b: view.openToB2b, b2c: view.openToB2c }),
      () => this.open.set(null),
    );
  }

  protected set<K extends keyof SiteRolesPayload>(key: K, value: SiteRolesPayload[K]): void {
    this.draft.update((current) => ({ ...current, [key]: value }));
    this.refusal.set(null);
  }

  /** Une case de clientèle du retrait (Hugo, 2026-10-15). */
  protected setPickupAudience(audience: 'b2b' | 'b2c', checked: boolean): void {
    this.draft.update((current) => ({
      ...current,
      pickupAudiences: {
        ...(current.pickupAudiences ?? { b2b: true, b2c: true }),
        [audience]: checked,
      },
    }));
    this.refusal.set(null);
  }

  protected setColor(change: ColorChange): void {
    this.colors.update((draft) => withColor(draft, change.key, change.value));
    this.refusal.set(null);
  }

  protected setGps(axis: keyof GpsDraft, value: number | null): void {
    this.gps.update((current) => ({ ...current, [axis]: value }));
    this.refusal.set(null);
  }

  /** Les rôles à envoyer ; le point seulement s'il a changé (absent = inchangé). */
  private rolesPayload(): SiteRolesPayload {
    return this.gpsDirty() ? { ...this.draft(), gps: toGps(this.gps()) } : this.draft();
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const colors: SiteColorsPayload = colorsPayload(this.colors());
    const rolesSaved = await this.write(
      this.rolesDirty(),
      () => this.sites.setRoles(this.site().id, this.rolesPayload()),
      "Les rôles du site n'ont pas pu être enregistrés.",
    );
    if (rolesSaved) {
      const colorsSaved = await this.write(
        this.colorsChanged(),
        () => this.sites.setColors(this.site().id, colors),
        this.rolesDirty()
          ? "Rôles enregistrés, mais les couleurs n'ont pas pu l'être."
          : "Les couleurs du site n'ont pas pu être enregistrées.",
      );
      // Couleurs refusées : pas de relecture, qui écraserait leur brouillon.
      // Les rôles, déjà écrits, repartiront à l'identique au prochain essai.
      if (colorsSaved) {
        this.notify.success('Rôles et couleurs du site enregistrés.');
        this.saved.emit();
      }
    }
    this.saving.set(false);
  }

  /** Une écriture, sautée si rien n'a changé ; un refus se garde dans la carte. */
  private async write(
    needed: boolean,
    send: () => Promise<void>,
    fallback: string,
  ): Promise<boolean> {
    if (!needed) {
      return true;
    }
    try {
      await send();
      return true;
    } catch (error) {
      this.refusal.set(`${fallback} ${httpErrorMessage(error, '')}`.trim());
      return false;
    }
  }
}
