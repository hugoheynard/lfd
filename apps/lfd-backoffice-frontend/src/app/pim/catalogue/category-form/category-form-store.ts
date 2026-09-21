import { Injectable, computed, inject, signal } from '@angular/core';

import type { CategoryMediaView, LocalizedText, SalesChannels } from '@lfd/pim-contracts';

import { localizedField } from '../../../shared/lang-switch/localized-field';
import { NotifyService } from '../../../notify.service';
import { NO_CHANNELS, sellsContext } from '../../data/channels';
import { SalesContextStore } from '../../sales-contexts/sales-context-store';
import { CategoryHttpApi, type CategoryDetail, type CategoryVatDraft } from '../category-http-api';
import { CategoryStore } from '../category-store';
import type { SectionEditing } from '../section-state/section-editing';
import { sectionTracking } from '../section-state/section-tracking';
import { editorialDraft } from './editorial-draft';
import { mediaDraft } from './media-draft';

/** Les sections ENREGISTRABLES de la page, dans l'ordre de lecture. */
export type CategorySection = 'identite' | 'canaux' | 'communication' | 'visuels';

const SECTIONS: readonly CategorySection[] = ['identite', 'canaux', 'communication', 'visuels'];

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
  private readonly api = inject(CategoryHttpApi);
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
  private readonly saved = signal<CategoryDetail | null>(null);
  readonly isArchived = computed(() => this.saved()?.isArchived ?? false);
  readonly activeProducts = computed(() => this.saved()?.activeProductCount ?? 0);

  /** Posée explicitement : une relecture ne doit pas écraser une saisie. */
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

  /** Les quatre textes, et la langue qu'on rédige. */
  readonly editorial = editorialDraft();

  /** Les visuels, dans leur ordre d'affichage — qui EST l'ordre enregistré. */
  readonly media = mediaDraft(this.api);

  /** Les parents proposables — ni la famille elle-même, ni une archivée. */
  readonly parents = computed(() =>
    this.categories.items().filter((item) => !item.isArchived && item.id !== this.id()),
  );

  /** Les contextes réglables : ceux dont le canal est vendu. Un taux posé sur
   *  une vente qui n'a pas lieu rendrait ce taux indéboulonnable. */
  readonly settableContexts = computed(() =>
    this.contexts.items().filter((context) => sellsContext(this.channels(), context.key)),
  );

  /** Le suivi « modifié / enregistré », extrait : il ne compare que des
   *  empreintes, et n'a rien de métier. */
  private readonly tracking = sectionTracking<CategorySection>((section) => this.snapshot(section));

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
      // Le DÉTAIL, pas la liste : elle ne porte ni textes ni visuels. Et la
      // liste reste chargée en parallèle — elle sert les parents proposables.
      const [detail] = await Promise.all([
        this.api.detail(id),
        this.categories.items().length === 0 ? this.categories.reload() : Promise.resolve(),
      ]);
      this.adopt(detail);
    } catch {
      // Un 404 du référentiel et une panne réseau se ressemblent ici ; l'écran
      // dit « introuvable » plutôt que d'ouvrir un formulaire vide qui
      // enregistrerait sur un identifiant fantôme.
      this.notFound.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Pose l'état enregistré ET les brouillons qui en dérivent, d'un coup. */
  private adopt(category: CategoryDetail | null): void {
    this.saved.set(category);
    this.savedName.set(category?.name ?? { fr: '' });
    this.parentId.set(category?.parentId ?? '');
    this.channels.set(category?.channelPreset ?? NO_CHANNELS);
    this.vat.set({ ...(category?.vatByContext ?? {}) });
    this.editorial.adopt(category?.editorial ?? null);
    this.media.adopt(category?.media ?? []);
    this.tracking.rebase(SECTIONS);
  }

  // ── Ce qui a changé ───────────────────────────────────────────────────────

  /** L'empreinte d'une section. {@link revert} la lit dans le MÊME ordre : les
   *  deux se modifient ensemble ou pas du tout. */
  private snapshot(section: CategorySection): string {
    switch (section) {
      case 'identite':
        return JSON.stringify([this.name.text(), this.parentId()]);
      case 'canaux':
        return JSON.stringify([sortedChannels(this.channels()), this.vat()]);
      case 'communication':
        return JSON.stringify(this.editorial.texts());
      case 'visuels':
        // L'ORDRE compte, et il est celui du tableau : réordonner EST une
        // modification. Ni dimensions ni poids — ils décrivent le fichier, pas
        // la décision, et bougeraient sans que personne n'ait rien édité.
        return JSON.stringify(
          this.media.items().map((item) => ({ url: item.url, name: item.name, alt: item.alt })),
        );
    }
  }

  isDirty(section: string): boolean {
    return isSection(section) && this.tracking.isDirty(section);
  }

  readonly hasPendingChanges = computed(() =>
    SECTIONS.some((section) => this.tracking.isDirty(section)),
  );

  /** Retour à la dernière valeur enregistrée — le pendant de {@link snapshot}. */
  revert(section: string): void {
    if (!isSection(section)) {
      return;
    }
    const raw = this.tracking.saved(section);
    if (raw === undefined) {
      return;
    }
    const value: unknown = JSON.parse(raw);
    if (section === 'communication') {
      this.editorial.adopt(value as ReturnType<typeof this.editorial.texts>);
      return;
    }
    if (section === 'visuels') {
      this.media.adopt(value as readonly CategoryMediaView[]);
      return;
    }
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
    return isSection(section) ? this.tracking.statusText(section) : '';
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
      if (section === 'communication') {
        await this.api.setEditorial(id, this.editorial.payload());
        return;
      }
      if (section === 'visuels') {
        await this.api.setMedia(id, this.media.items());
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
    this.tracking.mark(section, 'saving');
    try {
      await action();
      const id = this.id();
      // La LISTE est relue aussi : le nom d'une famille y figure, et l'écran
      // d'où l'on vient doit le voir changer sans recharger la page.
      const [fresh] = await Promise.all([
        id === null ? Promise.resolve(null) : this.api.detail(id),
        this.categories.reload(),
      ]);
      this.adopt(fresh ?? this.saved());
      this.tracking.mark(section, 'saved');
    } catch (caught) {
      this.tracking.mark(section, 'error');
      this.notify.refused(caught, "Le référentiel a refusé l'enregistrement.");
    } finally {
      this.busy.set(false);
    }
  }

  private emptyToNull(): string | null {
    return this.parentId() === '' ? null : this.parentId();
  }

  /** Les taux à enregistrer — **seulement ceux qu'on montre**. Envoyer celui
   *  d'un champ qu'on vient de masquer ferait tout échouer. */
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
  return SECTIONS.some((section) => section === value);
}
