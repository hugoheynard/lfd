import { Injectable, computed, inject, signal } from '@angular/core';

import type { LocalizedText, SalesChannels } from '@lfd/pim-contracts';

import { localizedField } from '../../../shared/lang-switch/localized-field';
import { NotifyService } from '../../../notify.service';
import { NO_CHANNELS, sellsContext } from '../../data/channels';
import { SalesContextStore } from '../../sales-contexts/sales-context-store';
import type { Category } from '../catalogue-api';
import type { CategoryVatDraft } from '../category-http-api';
import { CategoryStore } from '../category-store';
import type { SectionEditing } from '../section-state/section-editing';

/** Les sections ENREGISTRABLES de la page, dans l'ordre de lecture. */
export type CategorySection = 'identite' | 'canaux';

/** L'état momentané d'un enregistrement — vide quand il ne s'est rien passé. */
type SaveState = 'saving' | 'saved' | 'error';

/**
 * L'état d'édition d'UNE famille, le temps d'une page.
 *
 * Fourni par la page et non à la racine : deux formulaires n'ont aucune raison
 * de partager un brouillon. Il implémente {@link SectionEditing}, ce qui suffit
 * à l'indicateur de section — il n'a pas à connaître ce store en entier.
 *
 * Le modèle est celui de la fiche produit : rien n'est « en lecture » puis « en
 * modification », chaque section se corrige au passage et s'enregistre seule.
 * D'où le besoin d'une RÉFÉRENCE par section (`baseline`) : sans elle, « modifié »
 * ne veut rien dire, et « annuler » n'a nulle part où revenir.
 */
@Injectable()
export class CategoryFormStore implements SectionEditing {
  private readonly categories = inject(CategoryStore);
  private readonly contexts = inject(SalesContextStore);
  private readonly notify = inject(NotifyService);

  /** `null` tant que la famille n'existe pas — le mode création. */
  readonly id = signal<string | null>(null);
  readonly loading = signal(false);
  readonly notFound = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly isEdit = computed(() => this.id() !== null);

  /** La famille ENREGISTRÉE — elle ne bouge qu'au chargement ou à un
   *  enregistrement réussi, et c'est elle qui dit ce qui a changé. */
  private readonly saved = signal<Category | null>(null);
  readonly isArchived = computed(() => this.saved()?.isArchived ?? false);
  readonly activeProducts = computed(() => this.saved()?.activeProductCount ?? 0);

  /** La source du champ traduisible — posée explicitement, jamais dérivée de la
   *  liste : une relecture de liste ne doit pas écraser une saisie en cours. */
  private readonly savedName = signal<LocalizedText>({ fr: '' });
  readonly name = localizedField({
    source: () => this.savedName(),
    label: 'Nom',
    subject: 'Le nom manque',
  });

  /** `''` = la racine. */
  readonly parentId = signal('');
  readonly channels = signal<SalesChannels>(NO_CHANNELS);
  readonly vat = signal<CategoryVatDraft>({});

  /** Les parents proposables — ni la famille elle-même, ni une archivée. */
  readonly parents = computed(() =>
    this.categories.items().filter((item) => !item.isArchived && item.id !== this.id()),
  );

  /**
   * Les contextes réglables : ceux dont le canal est vendu. Un taux ne se règle
   * que pour une vente qui a lieu — sinon la famille pointerait un taux dont
   * personne ne se sert, et ce taux deviendrait indéboulonnable.
   */
  readonly settableContexts = computed(() =>
    this.contexts.items().filter((context) => sellsContext(this.channels(), context.key)),
  );

  private readonly baseline = signal<Partial<Record<CategorySection, string>>>({});
  private readonly statusMap = signal<Partial<Record<CategorySection, SaveState>>>({});

  /** Le titre de la page — le nom de la famille, jamais le geste. */
  readonly pageTitle = computed(() =>
    this.isEdit() ? (this.savedName().fr ?? 'Famille') : 'Nouvelle famille',
  );

  /** Un nom en français suffit à créer ; le reste se complète ensuite. */
  readonly isValid = computed(() => this.name.filled());

  // ── Chargement ────────────────────────────────────────────────────────────

  /** `null` ouvre la page en création. */
  async load(id: string | null): Promise<void> {
    this.id.set(id);
    this.notFound.set(false);
    this.error.set(null);
    if (id === null) {
      this.adopt(null);
      return;
    }
    this.loading.set(true);
    try {
      if (this.categories.items().length === 0) {
        await this.categories.reload();
      }
      const found = this.categories.items().find((item) => item.id === id);
      if (found === undefined) {
        this.notFound.set(true);
        return;
      }
      this.adopt(found);
    } finally {
      this.loading.set(false);
    }
  }

  /** Pose l'état enregistré ET les brouillons qui en dérivent, d'un coup. */
  private adopt(category: Category | null): void {
    this.saved.set(category);
    this.savedName.set(category?.name ?? { fr: '' });
    this.parentId.set(category?.parentId ?? '');
    this.channels.set(category?.channelPreset ?? NO_CHANNELS);
    this.vat.set({ ...(category?.vatByContext ?? {}) });
    this.baseline.set({ identite: this.snapshot('identite'), canaux: this.snapshot('canaux') });
  }

  // ── Ce qui a changé ───────────────────────────────────────────────────────

  /**
   * L'empreinte d'une section. Un tableau POSITIONNEL, et {@link revert} le lit
   * dans le même ordre : ajouter un champ d'un côté sans l'autre casserait
   * l'annulation en silence. Les deux se lisent ensemble ou pas du tout.
   */
  private snapshot(section: CategorySection): string {
    if (section === 'identite') {
      return JSON.stringify([this.name.text(), this.parentId()]);
    }
    return JSON.stringify([sortedChannels(this.channels()), this.vat()]);
  }

  isDirty(section: string): boolean {
    if (!isSection(section)) {
      return false;
    }
    const base = this.baseline()[section];
    return base !== undefined && base !== this.snapshot(section);
  }

  readonly hasPendingChanges = computed(() => this.isDirty('identite') || this.isDirty('canaux'));

  revert(section: string): void {
    if (!isSection(section)) {
      return;
    }
    const raw = this.baseline()[section];
    if (raw === undefined) {
      return;
    }
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) {
      return;
    }
    if (section === 'identite') {
      this.name.text.set(value[0] as LocalizedText);
      this.parentId.set(String(value[1] ?? ''));
      return;
    }
    this.channels.set(value[0] as SalesChannels);
    this.vat.set(value[1] as CategoryVatDraft);
  }

  statusText(section: string): string {
    if (!isSection(section)) {
      return '';
    }
    switch (this.statusMap()[section]) {
      case 'saving':
        return 'Enregistrement…';
      case 'saved':
        return 'Enregistré ✓';
      case 'error':
        return 'Échec';
      default:
        return '';
    }
  }

  // ── Écritures ─────────────────────────────────────────────────────────────

  /**
   * Enregistre UNE section. Le référentiel découpe par verbe (un pour le nom,
   * un pour le parent, un pour les canaux, un pour les taux) ; l'ordre de ces
   * écritures est une affaire de persistance, pas d'écran.
   */
  async saveOne(section: CategorySection): Promise<void> {
    const id = this.id();
    if (id === null || !this.isDirty(section)) {
      return;
    }
    await this.write(section, async () => {
      if (section === 'identite') {
        await this.categories.renameAndMove(id, this.name.text(), this.emptyToNull());
        return;
      }
      // Les canaux AVANT les taux : fermer un canal efface son taux côté
      // référentiel, donc l'inverse écraserait ce qu'on vient de régler.
      await this.categories.setChannels(id, this.channels());
      await this.categories.setVat(id, this.vatToSave());
    });
  }

  /** Crée la famille et rend son identifiant — l'appelant navigue vers elle. */
  async create(): Promise<string | null> {
    this.busy.set(true);
    try {
      const created = await this.categories.openNew(this.name.text(), this.emptyToNull());
      return created;
    } catch (caught) {
      this.notify.refused(caught, 'Le référentiel a refusé la création.');
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  async archive(): Promise<boolean> {
    const id = this.id();
    if (id === null) {
      return false;
    }
    this.busy.set(true);
    try {
      await this.categories.archive(id);
      return true;
    } catch (caught) {
      this.notify.refused(caught, "Le référentiel a refusé l'archivage.");
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /** Le corps commun : l'état momentané, la relecture, le refus rendu lisible. */
  private async write(section: CategorySection, action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.mark(section, 'saving');
    try {
      await action();
      await this.categories.reload();
      const fresh = this.categories.items().find((item) => item.id === this.id());
      this.adopt(fresh ?? this.saved());
      this.mark(section, 'saved');
    } catch (caught) {
      this.mark(section, 'error');
      this.notify.refused(caught, "Le référentiel a refusé l'enregistrement.");
    } finally {
      this.busy.set(false);
    }
  }

  private mark(section: CategorySection, state: SaveState): void {
    this.statusMap.update((current) => ({ ...current, [section]: state }));
  }

  private emptyToNull(): string | null {
    return this.parentId() === '' ? null : this.parentId();
  }

  /**
   * Les taux à enregistrer — **seulement ceux qu'on montre**. L'agrégat refuse
   * un taux posé sur un canal fermé ; envoyer le taux d'un champ qu'on vient de
   * masquer ferait échouer l'enregistrement entier.
   */
  private vatToSave(): CategoryVatDraft {
    const draft = this.vat();
    return Object.fromEntries(
      this.settableContexts()
        .map((context) => [context.key, draft[context.key] ?? ''] as const)
        .filter(([, rateId]) => rateId !== ''),
    );
  }
}

/** L'ordre d'une matrice est un accident d'écriture, pas une donnée. */
function sortedChannels(channels: SalesChannels): SalesChannels {
  return [...channels].sort((a, b) =>
    `${a.pointOfSaleId}|${a.context}`.localeCompare(`${b.pointOfSaleId}|${b.context}`),
  );
}

/** Le jeton d'édition parle `string` ; on rétrécit au bord, sans conversion. */
function isSection(value: string): value is CategorySection {
  return value === 'identite' || value === 'canaux';
}
