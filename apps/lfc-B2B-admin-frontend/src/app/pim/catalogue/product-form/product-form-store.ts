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

import { NO_CHANNELS, formatPercent, locationsSelling, sellsContext } from '../../data/channels';
import type { SalesChannels } from '../../data/models';
import { LocationStore } from '../../locations/location-store';
import { SalesContextStore } from '../sales-contexts/sales-context-store';
import type {
  AllergenEntry,
  AllergenScope,
  Category,
  ProductKind,
  ProductStatus,
  VatRate,
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

/**
 * Une catégorie INCO qui ne contient **qu'une** substance — son nom EST la
 * substance. « Céleri » ne groupe rien ; « Fruits à coque » groupe quatre
 * fruits. Les premières se cochent à plat, les secondes seules méritent une
 * boîte.
 */
export interface AllergenChoice {
  readonly code: string;
  /** Le libellé d'ÉTIQUETTE, celui qui fait foi — « Anhydride sulfureux et sulfites ». */
  readonly label: string;
}

/**
 * Un taux, en DEUX faits plutôt qu'en une phrase : « Réduit » nomme le régime,
 * « 5,5 % » le chiffre. Assemblés dans le magasin — « TVA Réduit · 5,5 % » —
 * ils forçaient l'écran à tout peindre du même poids, alors que le chiffre est
 * ce qu'on cherche et le nom ce qui le qualifie.
 */
export interface RateView {
  readonly name: string;
  readonly percent: string;
}

/**
 * Le prix TTC d'un contexte — **calculé ici**, jamais reçu.
 *
 * Le catalogue porte un prix HT et un taux par contexte : le TTC en découle, et
 * le stocker en ferait une troisième valeur à tenir d'accord avec les deux
 * autres. C'est une aide à la lecture, pas une donnée : la facture, elle, est
 * calculée par le serveur au moment de la commande.
 */
function grossOf(priceEur: number | null, percent: number | undefined): string | null {
  if (priceEur === null || percent === undefined) {
    return null;
  }
  return EUROS.format(Math.round(priceEur * (1 + percent / 100) * 100) / 100);
}

const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/**
 * Une ligne de l'héritage : un contexte de vente, ce qu'il dessert, son taux.
 *
 * C'étaient trois champs nommés (`emporter`, `surPlace`, `b2b`). Un quatrième
 * contexte demandait de modifier ce type, le calcul, le gabarit et son test —
 * pour une information que la base savait déjà porter.
 */
export interface ChannelInheritance {
  readonly key: string;
  readonly label: string;
  /**
   * D'où vient le taux affiché. `overridden` = cette fiche déroge à sa famille.
   *
   * La provenance voyage AVEC la valeur : sans elle, l'écran ne pourrait ni
   * marquer la ligne, ni proposer d'y renoncer — et un taux sans provenance ne
   * se défend pas devant quelqu'un qui le conteste.
   */
  readonly source: 'inherited' | 'overridden';
  /**
   * Le contexte est-il vendu ? **Distinct** de la liste de noms ci-dessous :
   * savoir qu'un mode se vend et savoir nommer les boutiques sont deux faits, et
   * le second peut manquer (référentiel pas encore chargé) sans que le premier
   * soit faux. L'écran affichait « non proposé » dès que les noms manquaient, et
   * cachait la TVA derrière eux.
   */
  readonly sold: boolean;
  /** Vide pour un contexte sans comptoir — le B2B se vend depuis la plateforme. */
  readonly boutiques: readonly string[];
  readonly rate: RateView | null;
  /** Le prix TTC de ce contexte — `null` sans prix ou sans taux. */
  readonly gross: string | null;
}

export interface CategoryInheritanceView {
  readonly categoryName: string;
  /** La matrice affichée vient-elle de la famille, ou de la fiche ? */
  readonly channelsSource: 'inherited' | 'overridden';
  readonly channels: readonly ChannelInheritance[];
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

/**
 * Le rôle d'un visuel neuf.
 *
 * L'API en exige un, mais l'écran n'en propose plus : classer une image est une
 * décision de CANAL — quelle image une boutique prend pour vignette — et elle
 * vivra dans « Diffusion par canal ». Le premier déposé devenait « hero », ce
 * qui affirmait une hiérarchie qu'aucun canal ne lit aujourd'hui : ni la
 * projection Shopify ni le B2B ne consultent le rôle.
 *
 * `gallery` est le neutre : « une image du produit », sans prétention d'usage.
 */
const DEFAULT_MEDIA_ROLE = 'gallery';

const EMPTY_NUTRITION: NutritionValues = {
  energyKcal: null,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  sugarsG: null,
  proteinG: null,
  saltG: null,
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
  private readonly locationStore = inject(LocationStore);
  private readonly contextStore = inject(SalesContextStore);

  /** Les noms des points de vente — lus au référentiel, jamais codés en dur. */
  readonly locations = this.locationStore.items;
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
  readonly rates = signal<VatRate[]>([]);
  readonly entries = signal<readonly AllergenEntry[]>([]);
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

  /**
   * La **dérogation** de cette fiche, par clé de contexte. Vide = elle hérite.
   *
   * Séparée de l'héritage, et non fusionnée : l'écran doit pouvoir dire d'où
   * vient chaque taux, et une valeur fusionnée aurait perdu la provenance en
   * chemin — donc le moyen de revenir en arrière.
   */
  readonly vatOverride = signal<Readonly<Record<string, string>>>({});

  /**
   * Où la fiche se vend quand elle ne suit PAS sa famille. `null` = elle hérite.
   *
   * Tout-ou-rien, à la différence des taux : une matrice à moitié redéfinie ne
   * se lit pas — devant une case vide, on ne saurait pas dire si la fiche n'est
   * pas vendue là ou si sa famille ne l'y vendait pas.
   */
  readonly channelsOverride = signal<SalesChannels | null>(null);
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

  /**
   * Les taux de la FAMILLE du produit, par contexte — l'héritage nu, sans la
   * dérogation. Le panneau en a besoin pour nommer ce à quoi « hériter » vaut :
   * proposer « revenir au défaut » sans dire lequel, c'est choisir à l'aveugle.
   */
  readonly familyVat = computed<Readonly<Record<string, string>>>(
    () => this.selectedCategory()?.vatByContext ?? {},
  );

  /** La matrice de la FAMILLE — l'héritage nu, celui auquel on peut revenir. */
  readonly familyChannels = computed<SalesChannels>(
    () => this.selectedCategory()?.channelPreset ?? NO_CHANNELS,
  );

  /**
   * Où la fiche se vend RÉELLEMENT : sa matrice si elle en a une, celle de sa
   * famille sinon. La même règle qu'au serveur, et pour la même raison — deux
   * écritures finiraient par ne plus dire la même chose.
   */
  readonly effectiveChannels = computed<SalesChannels>(
    () => this.channelsOverride() ?? this.familyChannels(),
  );

  readonly channelsInheritance = computed<CategoryInheritanceView | null>(() => {
    const category = this.selectedCategory();
    if (category === undefined) {
      return null;
    }
    const viewOf = (rateId: string | undefined): RateView | null => {
      const rate = rateId === undefined ? undefined : this.regimeById().get(rateId);
      return rate === undefined ? null : { name: rate.name, percent: formatPercent(rate.percent) };
    };
    // La règle de résolution, à l'écran comme au serveur : la fiche d'abord, sa
    // famille ensuite. Contexte par contexte — on peut déroger en B2B et suivre
    // sa famille au comptoir.
    const override = this.vatOverride();
    // Les canaux EFFECTIFS : une fiche qui a redéfini où elle se vend se lit
    // sur les siens, pas sur ceux de sa famille.
    const channels = this.effectiveChannels();
    const rateIdOf = (contextKey: string): string | undefined =>
      override[contextKey] ?? category.vatByContext[contextKey];
    const rateOf = (contextKey: string): RateView | null => viewOf(rateIdOf(contextKey));
    const grossFor = (contextKey: string): string | null => {
      const rateId = rateIdOf(contextKey);
      const rate = rateId === undefined ? undefined : this.regimeById().get(rateId);
      return grossOf(this.priceEur(), rate?.percent);
    };
    return {
      categoryName: category.name.fr,
      // UNE ligne par contexte du registre : un contexte de plus en base est une
      // ligne de plus ici, sans livrer de front.
      channelsSource: this.channelsOverride() === null ? 'inherited' : 'overridden',
      channels: this.orderedContexts().map((context) => ({
        key: context.key,
        label: context.label,
        // Plus aucune branche sur le nom d'un contexte : « est-il vendu ? » se
        // lit pareil pour tous. Un contexte SANS LIEU ne nomme aucun point de
        // vente — non pas parce qu'il s'appelle « b2b », mais parce que le
        // registre dit qu'il ne se vend pas depuis un lieu.
        sold: sellsContext(channels, context.key),
        boutiques: context.perLocation
          ? locationsSelling(channels, context.key, this.locations())
          : [],
        rate: rateOf(context.key),
        gross: grossFor(context.key),
        source: override[context.key] === undefined ? 'inherited' : 'overridden',
      })),
    };
  });

  /**
   * Les contextes, **B2B en tête**.
   *
   * L'ordre du registre sert la projection ; celui-ci sert la LECTURE de cette
   * app, dont le métier est la vente aux professionnels — le comptoir y est le
   * cas particulier. Une décision d'écran, donc écrite dans l'écran.
   */
  private readonly orderedContexts = computed(() =>
    // Les contextes SANS LIEU d'abord — pas « le b2b d'abord ». L'app vend aux
    // professionnels ; ce qui se commande sans passer par un comptoir la
    // concerne en premier, quel que soit son nom.
    [...this.contextStore.items()].sort((a, b) => Number(a.perLocation) - Number(b.perLocation)),
  );

  /** Le référentiel rangé par catégorie d'étiquette, dans l'ordre du registre. */
  private readonly allergenBuckets = computed<AllergenGroup[]>(() => {
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

  /**
   * Les catégories qui groupent VRAIMENT — le gluten et ses quatre céréales,
   * les fruits à coque et leurs quatre fruits. Il n'y en a que deux.
   */
  readonly groups = computed<AllergenGroup[]>(() =>
    this.allergenBuckets().filter((group) => group.entries.length > 1),
  );

  /**
   * Les douze autres, à plat.
   *
   * Chacune n'a qu'une substance, et son libellé d'étiquette la nomme : une
   * boîte encadrée intitulée « Lait » contenant une seule case « Lait » était
   * douze fois du chrome pour douze cases — l'écran disait deux fois la même
   * chose et prenait la place de la déclaration entière. C'est le libellé
   * RÉGLEMENTAIRE qu'on garde ici, pas le granulaire : « Anhydride sulfureux
   * et sulfites » est ce qui doit figurer sur l'étiquette, « Sulfites » n'est
   * que la façon dont notre référentiel l'abrège.
   */
  readonly singleAllergens = computed<AllergenChoice[]>(() =>
    this.allergenBuckets()
      .filter((group) => group.entries.length === 1)
      .flatMap((group) =>
        group.entries.map((entry) => ({ code: entry.code, label: entry.incoLabel ?? entry.label })),
      ),
  );

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
        this.vatOverride.set(value[1] as Readonly<Record<string, string>>);
        this.channelsOverride.set(value[2] as SalesChannels | null);
        return;
      case 'fiche':
        this.declaresNone.set(Boolean(value[0]));
        this.selected.set([...(value[1] as string[])]);
        this.nutrition.set(value[2] as NutritionValues);
        this.weightGrams.set(value[3] as number | null);
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
          role: DEFAULT_MEDIA_ROLE,
          name: '',
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

  /**
   * Renomme un visuel — la SEULE écriture libre de la liste. L'URL, elle, vient
   * du dépôt : elle désigne un objet de notre stockage, et la saisir à la main
   * ferait pointer une fiche vers un fichier que personne ici ne garde.
   */
  setMediaName(index: number, name: string): void {
    this.media.update((current) =>
      current.map((slot, position) => (position === index ? { ...slot, name } : slot)),
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

  /** Remplace le texte alternatif d'un visuel, dans toutes ses langues. */
  setMediaAltText(index: number, alt: LocalizedText | undefined): void {
    this.media.update((current) =>
      current.map((slot, position) => {
        if (position !== index) {
          return slot;
        }
        // `exactOptionalPropertyTypes` : « pas d'alternative » est une clé
        // ABSENTE, pas une clé à `undefined`.
        const { alt: _dropped, ...rest } = slot;
        return alt === undefined ? rest : { ...rest, alt };
      }),
    );
  }

  /**
   * Les langues qui manquent au texte alternatif d'UN visuel.
   *
   * Par image ET par langue, parce que c'est la question qu'on se pose devant
   * une galerie : pas « est-ce qu'il manque des traductions » mais « laquelle,
   * sur laquelle ». Le compte agrégé de la section ne peut pas y répondre.
   */
  mediaAltMissing(index: number): readonly Locale[] {
    const alt = this.media()[index]?.alt;
    return alt === undefined ? LOCALES : missingLocales(alt);
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
        this.api.listVatRates(),
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

  /**
   * Change de catalogue — et ne bascule le sélecteur QUE si la liste a suivi.
   *
   * Le référentiel était une liste en dur : cet appel ne pouvait pas échouer, et
   * personne n'avait à s'en soucier. Depuis qu'il vient du serveur, un échec
   * laisserait le bouton sur « Monde » au-dessus des entrées « UE » — un
   * catalogue qui ment sur ce qu'il montre, et sur un champ réglementé le
   * mensonge est celui-là même qu'on cherchait à empêcher.
   */
  async changeScope(scope: AllergenScope): Promise<void> {
    const previous = this.scope();
    if (scope === previous) {
      return;
    }
    this.scope.set(scope);
    try {
      await this.loadReference(scope);
    } catch (caught) {
      this.scope.set(previous);
      this.error.set(messageOf(caught));
    }
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

  /**
   * Déroge au taux de la famille pour UN contexte, ou lui rend la main.
   *
   * `null` retire la clé plutôt que d'écrire une valeur vide : « je reviens à
   * l'héritage » est un geste, et il ne doit pas s'écrire comme une décision.
   */
  setVatOverride(contextKey: string, rateId: string | null): void {
    this.vatOverride.update((current) => {
      const { [contextKey]: _dropped, ...rest } = current;
      return rateId === null ? rest : { ...rest, [contextKey]: rateId };
    });
  }

  savePricing(): Promise<void> {
    return this.save('tarif', async () => {
      await this.saveVariantFacts();
      // Le prix et son régime partent ENSEMBLE : ils sont dans la même section,
      // et enregistrer l'un sans l'autre laisserait l'écran vert sur une moitié
      // de décision.
      await this.products.saveVat(this.productId(), this.vatOverride());
      // Les canaux partent avec : fermer un canal efface les taux qu'on y avait
      // posés, et les envoyer séparément laisserait une fenêtre où l'un des deux
      // gestes est passé et l'autre non.
      await this.products.saveChannels(this.productId(), this.channelsOverride());
    });
  }

  saveFiche(): Promise<void> {
    return this.save('fiche', async () => {
      await this.products.saveNutrition(this.productId(), this.variantId(), {
        allergens: this.declaresNone() ? [] : this.selected(),
        nutrition: this.nutrition(),
      });
      // Le poids voyage par la route du TARIF, qui porte prix ET poids sur la
      // déclinaison. Les deux valeurs partent à chaque fois : la section qui
      // n'a pas bougé renvoie ce qu'elle avait, rien ne se perd.
      await this.saveVariantFacts();
    });
  }

  /** Prix + poids de la déclinaison — une route, deux sections qui l'appellent. */
  private saveVariantFacts(): Promise<void> {
    const price = this.priceEur();
    const weight = this.weightGrams();
    return this.products.savePricing(this.productId(), this.variantId(), {
      priceCents: price === null ? null : Math.round(price * 100),
      weightGrams: weight === null ? null : Math.round(weight),
    });
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
        return JSON.stringify([this.priceEur(), this.vatOverride(), this.channelsOverride()]);
      case 'fiche':
        // Le poids net est de CETTE section : la grille est « pour 100 g », et
        // sans lui elle ne dit rien de ce qu'on vend.
        return JSON.stringify([
          this.declaresNone(),
          [...this.selected()].sort(),
          this.nutrition(),
          this.weightGrams(),
        ]);
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
    this.vatOverride.set(product.vatByContext);
    this.channelsOverride.set(product.channelsOverride);
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
