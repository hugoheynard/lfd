import { Injectable, computed, inject, signal, type Signal } from '@angular/core';

import {
  LOCALES,
  SOURCE_LOCALE,
  missingLocales,
  writeLocalized,
  type Locale,
  type LocalizedText,
} from '@lfd/pim-contracts';

import { httpErrorMessage } from '@lfd/endpoints';

import { boutiquesWith, formatPercent, sellsMode } from '../../data/channels';
import { EmplacementStore } from '../../emplacements/emplacement-store';
import type {
  AllergenEntry,
  AllergenScope,
  Category,
  ProductKind,
  ProductStatus,
  TvaRate,
} from '../../data/models';
import { CatalogueApi } from '../catalogue-api';
import { ReferenceApi } from '../reference-api';
import {
  ProductHttpApi,
  type EditorialFields,
  type MediaSlot,
  type NutritionValues,
} from '../product-http-api';

// Réexporté : les panneaux le tenaient d'ici, et il vit maintenant au niveau de
// l'API — la couche qui parle au serveur possède la forme qu'elle envoie.
export type { MediaSlot };

// ── Types de vue partagés par la page et les panneaux ──────────────────────

export interface KindOption {
  readonly value: ProductKind;
  readonly label: string;
}

export interface AllergenGroup {
  readonly incoLabel: string;
  readonly entries: readonly AllergenEntry[];
}

export interface ModeInheritance {
  readonly boutiques: readonly string[];
  readonly tva: string;
  /**
   * Le mode est-il vendu ? **Distinct** de la liste de noms ci-dessus : savoir
   * qu'un mode se vend et savoir nommer les boutiques sont deux faits, et le
   * second peut manquer (référentiel pas encore chargé) sans que le premier
   * soit faux. L'écran affichait « non proposé » dès que les noms manquaient,
   * et cachait la TVA derrière eux.
   */
  readonly sold: boolean;
}

export interface CategoryInheritanceView {
  readonly categoryName: string;
  readonly emporter: ModeInheritance;
  readonly surPlace: ModeInheritance;
}

/** Les sections **enregistrables** — la seule source des clés de section. */
export type FormSection = 'identite' | 'tarif' | 'fiche' | 'communication' | 'visuels';

export interface SectionRef {
  readonly key: FormSection;
  readonly label: string;
}

type SectionStatus = 'saving' | 'saved' | 'error';

const KINDS: readonly KindOption[] = [
  { value: 'daily', label: 'Frais du jour' },
  { value: 'made_to_order', label: 'Sur commande' },
  { value: 'resale', label: 'Revente' },
];

const SAVEABLE: readonly SectionRef[] = [
  { key: 'identite', label: 'Identité' },
  { key: 'tarif', label: 'Tarif & logistique' },
  { key: 'fiche', label: 'Allergènes & nutrition' },
  { key: 'communication', label: 'Communication' },
  // Les visuels s'enregistraient... nulle part. Le panneau ajoutait, retirait et
  // réordonnait dans le vide, et le garde « modifications non enregistrées » ne
  // les comptait pas — on pouvait donc les perdre sans le moindre avertissement.
  { key: 'visuels', label: 'Visuels' },
];

const EMPTY_NUTRITION: NutritionValues = {
  energyKcal: null,
  carbsG: null,
  fatG: null,
  proteinG: null,
  glycemicIndex: null,
};

const EMPTY_EDITORIAL: EditorialFields = {
  descriptionShort: null,
  descriptionLong: null,
  story: null,
  pairing: null,
  brand: '',
  seoTitle: null,
  seoDescription: null,
};

/**
 * Les champs éditoriaux qui se TRADUISENT. `brand` n'y est pas : une marque est
 * un nom propre. Une table plutôt qu'une suite de `if` — ajouter un champ
 * traduisible se fait ici, et le sélecteur de langue le prend en compte sans
 * rien savoir de lui.
 */
const LOCALIZED_EDITORIAL_KEYS = [
  'descriptionShort',
  'descriptionLong',
  'story',
  'pairing',
  'seoTitle',
  'seoDescription',
] as const satisfies readonly (keyof EditorialFields)[];

export type LocalizedEditorialKey = (typeof LOCALIZED_EDITORIAL_KEYS)[number];

/**
 * Écrit une locale dans un texte qui peut ne pas exister encore.
 *
 * `null` (rien de renseigné) et `{ fr: '' }` (une source vide) ne sont pas la
 * même chose : le premier ne compte aucune langue, le second en compterait une.
 * Écrire une valeur vide dans un texte absent le laisse donc absent.
 */
function writeText(
  text: LocalizedText | null,
  locale: Locale,
  value: string,
): LocalizedText | null {
  const trimmed = value.trim();
  if (text === null) {
    return trimmed === '' || locale !== SOURCE_LOCALE ? text : { [SOURCE_LOCALE]: trimmed };
  }
  return writeLocalized(text, locale, value);
}

/**
 * Store du formulaire produit — **fourni au niveau de la page** (une instance
 * par formulaire) et injecté par tous les panneaux. Détient l'état, les appels
 * réseau et la logique (chargement, hydratation, save par section, dirty). La
 * page ne garde que la coquille (routing, guard, shell) ; les panneaux ne font
 * que rendre leur tranche. Aucun routing ici — c'est le rôle de la page.
 */
@Injectable()
export class ProductFormStore {
  private readonly products = inject(ProductHttpApi);
  private readonly api = inject(CatalogueApi);
  private readonly emplacementStore = inject(EmplacementStore);

  /** Les noms des points de vente — lus au référentiel, jamais codés en dur. */
  readonly emplacements = this.emplacementStore.items;
  private readonly reference = inject(ReferenceApi);

  readonly kinds = KINDS;

  // État de chargement / mode
  readonly isEdit = signal(false);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  // Référentiels
  readonly categories = signal<Category[]>([]);
  readonly rates = signal<TvaRate[]>([]);
  readonly entries = signal<AllergenEntry[]>([]);
  readonly provisional = signal(false);
  readonly scope = signal<AllergenScope>('eu');

  // Champs éditables
  /**
   * Le nom, **dans toutes ses langues**. Un `LocalizedText` et non une chaîne :
   * un formulaire qui ne tenait que le français réécrivait l'objet entier à
   * chaque enregistrement, donc éditer le nom d'un produit EFFAÇAIT sa
   * traduction anglaise — en silence, puisque l'écran ne l'affichait pas.
   */
  readonly nameText = signal<LocalizedText>({ fr: '' });

  /** La langue en cours d'édition — celle que le sélecteur de la section pointe. */
  readonly nameLocale = signal<Locale>(SOURCE_LOCALE);

  /** Le nom dans la langue affichée, vide si elle n'est pas traduite. */
  readonly name = computed(() => this.nameText()[this.nameLocale()] ?? '');

  /** Écrit dans la langue affichée, sans toucher aux autres. */
  setName(value: string): void {
    this.nameText.update((text) => writeLocalized(text, this.nameLocale(), value));
  }

  /** Les langues du nom qui restent à traduire — le point ambre du sélecteur. */
  readonly nameMissing = computed(() => missingLocales(this.nameText()));

  /**
   * La langue en cours d'édition de la DESCRIPTION — la sienne, distincte de
   * celle du nom. Deux sections localisées ne basculent pas ensemble : on peut
   * très bien traduire les descriptions sans toucher aux noms, et un sélecteur
   * partagé forcerait à faire les deux d'un coup.
   */
  readonly editorialLocale = signal<Locale>(SOURCE_LOCALE);

  /** Un champ éditorial traduisible, dans la langue affichée. */
  editorialText(key: LocalizedEditorialKey): string {
    return this.editorial()[key]?.[this.editorialLocale()] ?? '';
  }

  /** Écrit un champ éditorial dans la langue affichée, sans toucher aux autres. */
  setEditorialText(key: LocalizedEditorialKey, value: string): void {
    this.editorial.update((fields) => ({
      ...fields,
      [key]: writeText(fields[key], this.editorialLocale(), value),
    }));
  }

  /**
   * Les langues qu'il reste à traduire pour la SECTION.
   *
   * Un champ vide partout ne « manque » dans aucune langue — il est simplement
   * vide, et le marquer d'un point ambre transformerait chaque fiche neuve en
   * alerte permanente. Une langue manque quand un champ est écrit dans la langue
   * source et pas dans celle-là : là, il y a bien quelque chose à traduire.
   */
  readonly editorialMissing = computed(() => {
    const fields = this.editorial();
    return LOCALES.filter((locale) =>
      LOCALIZED_EDITORIAL_KEYS.some((key) => {
        const text = fields[key];
        return text !== null && (text[SOURCE_LOCALE] ?? '') !== '' && (text[locale] ?? '') === '';
      }),
    );
  });
  readonly kind = signal<ProductKind>('daily');
  readonly categoryId = signal('');
  readonly priceEur = signal<number | null>(null);
  readonly weightGrams = signal<number | null>(null);
  readonly selected = signal<string[]>([]);
  readonly declaresNone = signal(false);
  readonly nutrition = signal<NutritionValues>(EMPTY_NUTRITION);
  readonly editorial = signal<EditorialFields>(EMPTY_EDITORIAL);
  readonly media = signal<MediaSlot[]>([]);

  /**
   * La référence — **lue, jamais saisie**. Le référentiel l'émet à la création
   * (`P-XXXXXX`, cf. ADR-16) et rien ne la modifie ensuite : l'exposer en écriture
   * inviterait un écran à proposer une saisie que le backend ignorerait.
   */
  private readonly skuValue = signal('');
  readonly sku: Signal<string> = this.skuValue;

  /**
   * Le **slug** — le handle qui pilote l'URL publique. Lu, jamais saisi, et pour
   * une raison plus forte que la référence : il est figé à la création (SEO —
   * une URL qui change casse les liens et le référencement acquis). L'exposer
   * en écriture proposerait de corriger ce que le backend refuse de bouger.
   *
   * Vide tant que le produit n'a pas été poussé : le handle naît de la première
   * publication, pas de la création. Un slug « proposé » affiché ici prétendrait
   * connaître l'algorithme du serveur — et le jour où ils divergent, l'écran
   * aurait menti sans que rien ne le dise.
   */
  private readonly slugValue = signal('');
  readonly slug: Signal<string> = this.slugValue;
  /**
   * L'état de publication — **lu**, et changé par le menu de l'en-tête, jamais
   * par un champ. Il vit ici et pas dans la page parce que c'est un fait DU
   * PRODUIT : la page le peint, le rail de publication le lit, et les deux
   * doivent voir la même valeur après un « Publier ».
   */
  private readonly statusValue = signal<ProductStatus>('draft');
  readonly status: Signal<ProductStatus> = this.statusValue;

  /**
   * Le nombre de déclinaisons — un COMPTE, pas la liste. L'en-tête a besoin de
   * « 3 déclinaisons » ; personne n'édite encore les déclinaisons ici, donc
   * hydrater la liste entière serait déclarer plus que l'écran ne sait faire.
   */
  private readonly variantCountValue = signal(0);
  readonly variantCount: Signal<number> = this.variantCountValue;

  /** Un dépôt en cours — le bouton se désarme, la liste ne bouge pas encore. */
  readonly uploading = signal(false);

  private readonly productId = signal('');
  private readonly variantId = signal('');
  private readonly statusMap = signal<Partial<Record<FormSection, SectionStatus>>>({});
  private readonly baseline = signal<Partial<Record<FormSection, string>>>({});

  /**
   * Le titre de la page **est le nom du produit** — plus « Éditer le produit —
   * X ». Une fiche ne s'intitule pas par le geste qu'on y fait : le fil
   * d'Ariane dit d'où l'on vient, le titre dit ce qu'on regarde, et « Éditer »
   * ne disait ni l'un ni l'autre (tout est éditable en permanence, donc le mot
   * ne distinguait plus rien).
   */
  readonly pageTitle = computed(() => {
    if (!this.isEdit()) {
      return 'Nouveau produit';
    }
    const name = this.nameText()[SOURCE_LOCALE].trim();
    return name === '' ? 'Produit sans nom' : name;
  });

  /** La famille du produit, nommée — `''` tant que le référentiel n'a pas répondu. */
  readonly categoryName = computed(() => this.selectedCategory()?.name.fr ?? '');

  /** Le type de produit, nommé — lu dans la même table que le sélecteur. */
  readonly kindLabel = computed(
    () => KINDS.find((option) => option.value === this.kind())?.label ?? '',
  );

  private readonly regimeById = computed(() => new Map(this.rates().map((r) => [r.id, r])));

  private readonly selectedCategory = computed<Category | undefined>(() =>
    this.categories().find((c) => c.id === this.categoryId()),
  );

  readonly channelsInheritance = computed<CategoryInheritanceView | null>(() => {
    const category = this.selectedCategory();
    if (category === undefined) {
      return null;
    }
    const tva = (id: string): string => {
      const rate = this.regimeById().get(id);
      return rate === undefined ? '—' : `${rate.name} · ${formatPercent(rate.percent)}`;
    };
    return {
      categoryName: category.name.fr,
      emporter: {
        sold: sellsMode(category.channelPreset, 'emporter'),
        boutiques: boutiquesWith(category.channelPreset, 'emporter', this.emplacements()),
        tva: tva(category.emporterTvaId),
      },
      surPlace: {
        sold: sellsMode(category.channelPreset, 'surPlace'),
        boutiques: boutiquesWith(category.channelPreset, 'surPlace', this.emplacements()),
        tva: tva(category.surPlaceTvaId),
      },
    };
  });

  readonly groups = computed<AllergenGroup[]>(() => {
    const byLabel = new Map<string, AllergenEntry[]>();
    for (const entry of this.entries()) {
      const key = entry.incoLabel ?? 'Hors obligation UE';
      const bucket = byLabel.get(key);
      if (bucket === undefined) {
        byLabel.set(key, [entry]);
      } else {
        bucket.push(entry);
      }
    }
    return [...byLabel.entries()].map(([incoLabel, group]) => ({
      incoLabel,
      entries: group,
    }));
  });

  readonly dirtySections = computed<SectionRef[]>(() => {
    if (!this.isEdit()) {
      return [];
    }
    const base = this.baseline();
    return SAVEABLE.filter(
      (section) =>
        base[section.key] !== undefined && this.snapshot(section.key) !== base[section.key],
    );
  });

  /** Les sections enregistrables, dans l'ordre de la page. */
  readonly saveable = SAVEABLE;

  /** Cette section a-t-elle des modifications en attente ? */
  isDirty(section: FormSection): boolean {
    return this.dirtySections().some((s) => s.key === section);
  }

  /**
   * Annule les modifications d'une section — retour à sa dernière valeur
   * enregistrée.
   *
   * Le pendant exact de `snapshot()`, et il vit collé à lui pour cette raison :
   * l'instantané est un tableau POSITIONNEL, donc ajouter un champ d'un côté
   * sans l'autre casse silencieusement l'annulation. Les deux se lisent
   * ensemble ou pas du tout.
   */
  revert(section: FormSection): void {
    const raw = this.baseline()[section];
    if (raw === undefined) {
      return;
    }
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) {
      // `communication` et `visuels` sérialisent un objet / un tableau d'objets.
      if (section === 'communication') {
        this.editorial.set(value as EditorialFields);
      }
      return;
    }
    switch (section) {
      case 'identite':
        this.nameText.set(value[0] as LocalizedText);
        this.setKind(String(value[1] ?? ''));
        this.categoryId.set(String(value[2] ?? ''));
        return;
      case 'tarif':
        this.priceEur.set(value[0] as number | null);
        this.weightGrams.set(value[1] as number | null);
        return;
      case 'fiche':
        this.declaresNone.set(Boolean(value[0]));
        this.selected.set([...(value[1] as string[])]);
        this.nutrition.set(value[2] as NutritionValues);
        return;
      case 'visuels':
        this.media.set(value as MediaSlot[]);
        return;
      case 'communication':
        return;
    }
  }

  readonly dirtyLabel = computed(() =>
    this.dirtySections()
      .map((section) => section.label)
      .join(', '),
  );

  statusText(section: FormSection): string {
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

  isValid(): boolean {
    return this.nameText()[SOURCE_LOCALE].trim() !== '' && this.categoryId() !== '';
  }

  // ── Mutations d'état avec un peu de logique ──────────────────────────────

  setKind(value: string): void {
    if (value === 'daily' || value === 'made_to_order' || value === 'resale') {
      this.kind.set(value);
    }
  }

  setCategory(value: string): void {
    if (value !== '') {
      this.categoryId.set(value);
    }
  }

  /** Le seul champ éditorial NON traduisible — un nom propre. */
  setBrand(value: string): void {
    this.editorial.update((current) => ({ ...current, brand: value }));
  }

  setNutrition(key: keyof NutritionValues, value: number | null): void {
    this.nutrition.update((current) => ({ ...current, [key]: value }));
  }

  toggleAllergen(code: string, on: boolean): void {
    this.selected.update((current) =>
      on ? [...current, code] : current.filter((entry) => entry !== code),
    );
  }

  declareNoAllergen(on: boolean): void {
    this.declaresNone.set(on);
    if (on) {
      this.selected.set([]);
    }
  }

  addMedia(): void {
    this.media.update((current) => [
      ...current,
      { role: current.length === 0 ? 'hero' : 'gallery', url: '' },
    ]);
  }

  /**
   * Dépose un fichier et l'ajoute à la liste — SANS enregistrer la section.
   *
   * Les deux gestes restent distincts parce qu'ils ne portent pas le même
   * risque : déposer crée un fichier et ne touche à aucune fiche, enregistrer
   * remplace la liste entière du produit. Confondre les deux ferait qu'ouvrir
   * une image écrase les autres avant même qu'on ait choisi son rôle.
   *
   * Le refus du serveur (format, poids, dimensions) s'affiche dans l'erreur de
   * la page : c'est lui qui porte la raison, en français, et la répéter ici
   * serait la maintenir à deux endroits.
   */
  async uploadMedia(file: File): Promise<void> {
    this.uploading.set(true);
    this.error.set(null);
    try {
      const uploaded = await this.products.uploadMedia(file);
      this.media.update((current) => [
        ...current,
        {
          role: current.length === 0 ? 'hero' : 'gallery',
          url: uploaded.url,
          width: uploaded.width,
          height: uploaded.height,
        },
      ]);
    } catch (caught) {
      this.error.set(messageOf(caught));
    } finally {
      this.uploading.set(false);
    }
  }

  removeMedia(index: number): void {
    this.media.update((current) => current.filter((_, position) => position !== index));
  }

  setMedia(index: number, key: 'role' | 'url', value: string): void {
    this.media.update((current) =>
      current.map((slot, position) => (position === index ? { ...slot, [key]: value } : slot)),
    );
  }

  /** La langue en cours d'édition des textes alternatifs — la sienne. */
  readonly mediaLocale = signal<Locale>(SOURCE_LOCALE);

  /** Le texte alternatif d'un visuel, dans la langue affichée. */
  mediaAlt(index: number): string {
    return this.media()[index]?.alt?.[this.mediaLocale()] ?? '';
  }

  /** Écrit le texte alternatif dans la langue affichée, sans toucher aux autres. */
  setMediaAlt(index: number, value: string): void {
    this.media.update((current) =>
      current.map((slot, position) => {
        if (position !== index) {
          return slot;
        }
        const alt = writeText(slot.alt ?? null, this.mediaLocale(), value);
        // `exactOptionalPropertyTypes` : une clé ABSENTE et une clé à `undefined`
        // ne sont pas la même chose, et c'est bien la première qu'on veut —
        // « pas d'alternative » plutôt que « alternative indéfinie ».
        const { alt: _dropped, ...rest } = slot;
        return alt === null ? rest : { ...rest, alt };
      }),
    );
  }

  /**
   * Les langues qu'il reste à traduire sur les visuels. Même règle que
   * l'éditorial : un visuel sans alternative du tout n'est pas « à traduire »,
   * il est à rédiger — et c'est la complétude qui le dit, pas ce point-ci.
   */
  readonly mediaMissing = computed(() =>
    LOCALES.filter((locale) =>
      this.media().some(
        (slot) =>
          slot.alt !== undefined &&
          (slot.alt[SOURCE_LOCALE] ?? '') !== '' &&
          (slot.alt[locale] ?? '') === '',
      ),
    ),
  );

  // ── Chargement / mode ────────────────────────────────────────────────────

  async init(id: string | null): Promise<void> {
    this.isEdit.set(id !== null);
    this.productId.set(id ?? '');
    this.loading.set(true);
    try {
      const [categories, rates] = await Promise.all([
        this.api.listCategories(),
        this.api.listTvaRates(),
      ]);
      const active = categories.filter((category) => !category.isArchived);
      this.categories.set(active);
      this.rates.set(rates);
      await this.loadReference('eu');
      if (id === null) {
        const first = active[0];
        if (first !== undefined) {
          this.categoryId.set(first.id);
        }
        return;
      }
      await this.hydrate(id);
    } catch (caught) {
      this.error.set(messageOf(caught));
    } finally {
      this.loading.set(false);
    }
  }

  async changeScope(scope: AllergenScope): Promise<void> {
    this.scope.set(scope);
    await this.loadReference(scope);
  }

  // ── Create : un submit ; renvoie l'id créé (la page navigue) ─────────────

  async submit(): Promise<string | null> {
    if (!this.isValid()) {
      return null;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const price = this.priceEur();
      const weight = this.weightGrams();
      const description = (this.editorial().descriptionShort?.[SOURCE_LOCALE] ?? '').trim();
      const declares = this.declaresNone() || this.selected().length > 0;
      const created = await this.api.createProduct({
        name: this.nameText(),
        kind: this.kind(),
        categoryId: this.categoryId(),
        ...(declares ? { allergens: this.selected() } : {}),
        ...(price === null ? {} : { priceEur: price }),
        ...(weight === null ? {} : { weightGrams: weight }),
        ...(description === '' ? {} : { descriptionFr: description }),
      });
      return created.id;
    } catch (caught) {
      this.error.set(messageOf(caught));
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  // ── Edit : un save par section ───────────────────────────────────────────

  saveIdentity(): Promise<void> {
    if (!this.isValid()) {
      return Promise.resolve();
    }
    return this.save('identite', () =>
      this.products.saveIdentity(this.productId(), {
        name: this.nameText(),
        kind: this.kind(),
        categoryId: this.categoryId(),
      }),
    );
  }

  savePricing(): Promise<void> {
    const price = this.priceEur();
    const weight = this.weightGrams();
    return this.save('tarif', () =>
      this.products.savePricing(this.productId(), this.variantId(), {
        priceCents: price === null ? null : Math.round(price * 100),
        weightGrams: weight === null ? null : Math.round(weight),
      }),
    );
  }

  saveFiche(): Promise<void> {
    return this.save('fiche', () =>
      this.products.saveNutrition(this.productId(), this.variantId(), {
        allergens: this.declaresNone() ? [] : this.selected(),
        nutrition: this.nutrition(),
      }),
    );
  }

  /** Section Visuels — la liste entière, dans son ordre : c'est un remplacement. */
  saveMedia(): Promise<void> {
    return this.save('visuels', () => this.products.saveMedia(this.productId(), this.media()));
  }

  saveCommunication(): Promise<void> {
    return this.save('communication', () =>
      this.products.saveEditorial(this.productId(), this.editorial()),
    );
  }

  /** Enregistre chaque section modifiée (pour « sauvegarder puis quitter »). */
  async saveDirty(): Promise<void> {
    for (const section of this.dirtySections()) {
      await this.saveOne(section.key);
    }
  }

  /**
   * Publie, dépublie ou archive — le menu de l'en-tête.
   *
   * Ce n'est PAS un enregistrement de section : rien ici ne dépend de ce qui
   * est en attente dans les champs, et l'inverse est vrai aussi — un produit se
   * publie avec des sections modifiées, elles restent modifiées après. Les deux
   * gestes ne se mélangent donc pas, et `statusMap` (par section) ne le suit
   * pas.
   *
   * L'état n'avance qu'au retour du serveur : le peindre avant, c'est afficher
   * « Publié » sur un produit que le backend a refusé.
   */
  async changeStatus(next: ProductStatus): Promise<void> {
    const id = this.productId();
    if (id === '' || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.callStatus(id, next);
      this.statusValue.set(next);
    } catch (caught) {
      this.error.set(messageOf(caught));
    } finally {
      this.busy.set(false);
    }
  }

  private callStatus(id: string, next: ProductStatus): Promise<void> {
    switch (next) {
      case 'published':
        return this.api.publishProduct(id);
      case 'draft':
        return this.api.unpublishProduct(id);
      case 'archived':
        return this.api.archiveProduct(id);
    }
  }

  /** Enregistre UNE section — le bouton posé à droite de son titre. */
  saveOne(key: FormSection): Promise<void> {
    switch (key) {
      case 'identite':
        return this.saveIdentity();
      case 'tarif':
        return this.savePricing();
      case 'fiche':
        return this.saveFiche();
      case 'communication':
        return this.saveCommunication();
      case 'visuels':
        return this.saveMedia();
    }
  }

  private async save(section: FormSection, action: () => Promise<void>): Promise<void> {
    this.statusMap.update((current) => ({ ...current, [section]: 'saving' }));
    this.error.set(null);
    try {
      await action();
      this.statusMap.update((current) => ({ ...current, [section]: 'saved' }));
      this.baseline.update((base) => ({
        ...base,
        [section]: this.snapshot(section),
      }));
    } catch (caught) {
      this.statusMap.update((current) => ({ ...current, [section]: 'error' }));
      this.error.set(messageOf(caught));
    }
  }

  private snapshot(section: FormSection): string {
    switch (section) {
      case 'identite':
        return JSON.stringify([this.nameText(), this.kind(), this.categoryId()]);
      case 'tarif':
        return JSON.stringify([this.priceEur(), this.weightGrams()]);
      case 'fiche':
        return JSON.stringify([this.declaresNone(), [...this.selected()].sort(), this.nutrition()]);
      case 'communication':
        return JSON.stringify(this.editorial());
      case 'visuels':
        // L'ORDRE compte autant que le contenu : réordonner deux images est une
        // modification, et un instantané insensible à l'ordre l'ignorerait.
        return JSON.stringify(this.media());
    }
  }

  private captureBaseline(): void {
    const base: Record<string, string> = {};
    for (const section of SAVEABLE) {
      base[section.key] = this.snapshot(section.key);
    }
    this.baseline.set(base);
  }

  private async hydrate(id: string): Promise<void> {
    const detail = await this.products.getDetail(id);
    if (detail === null) {
      this.notFound.set(true);
      return;
    }
    const product = detail.product;
    this.skuValue.set(product.sku);
    this.statusValue.set(product.status);
    this.slugValue.set(product.slug?.fr ?? '');
    this.variantCountValue.set(product.variants.length);
    this.nameText.set(product.name);
    this.kind.set(product.kind);
    this.categoryId.set(product.categoryId);
    this.priceEur.set(product.priceEur ?? null);
    this.weightGrams.set(product.weightGrams ?? null);
    this.editorial.set(detail.editorial);
    this.media.set([...detail.media]);
    this.nutrition.set(detail.nutrition);
    const variant = product.variants.find((entry) => entry.isDefault) ?? product.variants[0];
    this.variantId.set(variant?.id ?? '');
    const allergens = detail.allergens;
    if (allergens === null) {
      this.declaresNone.set(false);
      this.selected.set([]);
    } else if (allergens.length === 0) {
      this.declaresNone.set(true);
    } else {
      this.selected.set([...allergens]);
    }
    this.captureBaseline();
  }

  private async loadReference(scope: AllergenScope): Promise<void> {
    const ref = await this.reference.allergens(scope);
    this.entries.set(ref.entries);
    this.provisional.set(ref.hasProvisionalCodes);
  }
}

/**
 * Le message que l'écran affichera.
 *
 * `caught.message` était trompeur : une `HttpErrorResponse` EST une `Error`, et
 * sa propriété `message` vaut « Http failure response for … : 400 Bad Request ».
 * Le refus du serveur — « Visuel refusé : format non accepté, PNG, JPEG ou WebP
 * attendus » — vit dans l'enveloppe, sous `error.error.message`, et se perdait
 * intégralement. L'utilisateur lisait une URL et un code là où le backend avait
 * pris la peine de lui expliquer, en français, ce qui n'allait pas dans son
 * fichier.
 *
 * `httpErrorMessage` (@lfd/endpoints) sait lire cette enveloppe, et c'est déjà
 * ce qu'emploient les toasts et la liste des emplacements.
 */
function messageOf(caught: unknown): string {
  return httpErrorMessage(caught, 'Erreur inattendue.');
}
