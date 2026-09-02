import { Injectable, computed, inject, signal, type Signal } from '@angular/core';

import {
  htFromTtc,
  proPriceFromPublic,
  LOCALES,
  SOURCE_LOCALE,
  missingLocales,
  writeLocalized,
  type Locale,
  type LocalizedText,
  type ProductReadinessView,
} from '@lfd/pim-contracts';

import { httpErrorMessage } from '@lfd/endpoints';

import { NO_CHANNELS, formatPercent, pointsOfSaleSelling, sellsContext } from '../../data/channels';
import type { SalesChannels } from '../../data/models';
import { AccountingRulesStore } from '../../accounting-rules/accounting-rules.store';
import { formatDiscount } from '../../accounting-rules/pro-discount';
import { PointOfSaleStore } from '../../points-of-sale/point-of-sale-store';
import { SalesContextStore } from '../../sales-contexts/sales-context-store';
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
 * **L'autre face du prix**, pour un contexte donné — calculée ici, jamais reçue.
 *
 * Un prix d'étiquette rend son hors taxe ; un prix hors taxe rend son TTC. C'est
 * toujours l'inverse de l'assiette saisie, et c'est le seul nombre que l'écran
 * ait à ajouter : le stocker en ferait une troisième valeur à tenir d'accord
 * avec les deux autres. C'est une aide à la lecture, pas une donnée — la
 * facture, elle, est calculée par le serveur au moment de la commande.
 *
 * Les conversions viennent de `@lfd/pim-contracts`, donc du même code que le
 * serveur. Un aperçu qui arrondirait autrement que la facture serait pire
 * qu'aucun aperçu.
 */
function counterpartOf(priceEur: number | null, percent: number | undefined): DerivedAmount | null {
  if (priceEur === null || percent === undefined) {
    return null;
  }
  return { label: 'HT', amount: euros(htFromTtc(Math.round(priceEur * 100), percent)) };
}

const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** Des centimes entiers vers « 1,14 € ». */
function euros(cents: number): string {
  return EUROS.format(cents / 100);
}

/**
 * Un montant dérivé et ce qu'il EST.
 *
 * `label` ne vaut plus que `'HT'` — il a porté `'TTC'` du temps où une fiche
 * pouvait être ancrée au hors taxe, et où la contrepartie changeait donc de
 * nature. Il reste parce que le nombre seul ne dit toujours pas ce qu'il est,
 * et qu'un montant nu à côté d'un prix public se lirait comme un autre prix.
 */
export interface DerivedAmount {
  readonly label: 'HT';
  readonly amount: string;
}

/**
 * Le prix professionnel tel que l'écran le montre : le TTC, la remise qui l'a
 * produit, et le hors taxe qui en découle.
 */
export interface ProPricing {
  readonly ttc: string;
  /** « −10 % » — la pastille, pour que le nombre ne tombe pas de nulle part. */
  readonly discountLabel: string;
  /** `null` quand le contexte professionnel n'a pas de taux réglé. */
  readonly ht: string | null;
}

/**
 * La clé du contexte que le prix PROFESSIONNEL concerne.
 *
 * Cet écran ne nomme aucun contexte — c'est une règle, et elle tient : les
 * lignes viennent du registre. Celle-ci est l'exception assumée, pour la même
 * raison que la projection B2B nomme la sienne : ce bloc EST le prix
 * professionnel, pas « le prix d'un contexte quelconque ». Une constante nommée
 * plutôt qu'une chaîne au fil du code — le jour où elle ne désigne plus rien,
 * il n'y a qu'un endroit à corriger.
 */
const PRO_CONTEXT_KEY = 'b2b';

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
  /**
   * L'autre face du prix, pour CE contexte — `null` sans prix ou sans taux.
   *
   * C'est ici que l'ancrage TTC se voit : un prix d'étiquette unique donne un
   * hors taxe par taux, et c'est cette colonne qui les montre côte à côte.
   */
  readonly counterpart: DerivedAmount | null;
  /**
   * Cette ligne part-elle d'un prix **remisé** plutôt que du prix public ?
   *
   * Le montant seul ne le dit pas, et un professionnel qui compare le tableau
   * au prix affiché plus haut ne retrouverait pas ses comptes sans cette
   * mention.
   */
  readonly discounted: boolean;
}

export interface CategoryInheritanceView {
  readonly categoryName: string;
  /** La matrice affichée vient-elle de la famille, ou de la fiche ? */
  readonly channelsSource: 'inherited' | 'overridden';
  readonly channels: readonly ChannelInheritance[];
}

/** Les sections **enregistrables** — la seule source des clés de section. */
export type FormSection = 'identite' | 'tarif' | 'fiche' | 'communication' | 'visuels';

/**
 * Les quatre gestes du cycle de vie, nommés par l'**intention**.
 *
 * Pas par le statut visé, et c'est tout l'objet du type. Le magasin prenait un
 * `ProductStatus` cible, où `'draft'` est l'aboutissement de DEUX gestes
 * distincts — dépublier et restaurer. Les deux partaient donc sur la même
 * route, celle de la dépublication, que le domaine ignore sur un produit
 * archivé : « Restaurer » ne restaurait rien, et tout le monde lisait un succès
 * (audit 2026-09-01, §1).
 *
 * Un type qui ne peut pas exprimer la confusion vaut mieux qu'un test qui la
 * détecte.
 */
export type LifecycleGesture = 'publish' | 'unpublish' | 'archive' | 'restore';

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
  private readonly pointStore = inject(PointOfSaleStore);
  /** Le rapport prix public / prix pro — réglé une fois, lu partout. */
  private readonly accounting = inject(AccountingRulesStore);
  private readonly contextStore = inject(SalesContextStore);

  /** Les noms des points de vente — lus au référentiel, jamais codés en dur. */
  readonly pointsOfSale = this.pointStore.items;
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
   * **Ce que `priceEur` veut dire.**
   *
   * `ttc` par défaut : c'est ce que l'écran demande désormais (« Prix public
   * TTC »), et une fiche neuve n'a aucune raison de naître dans l'assiette
   * qu'on quitte. Une fiche RELUE, elle, garde la sienne — on ne réinterprète
   * pas un montant enregistré en changeant l'étiquette au-dessus.
   */

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

  /**
   * Ce que la **composition** de la fiche mentionne comme allergènes.
   *
   * 🔴 Une aide de saisie, **sans aucune valeur de contrôle** — et les trois
   * interdits de `ProductIngredientAllergensView` (D5) valent ici tels quels :
   *
   * 1. **Le silence ne vaut rien.** La liste d'ingrédients est ÉDITORIALE : elle
   *    cite « le beurre de Savoie AOP » et tait la farine. Vide veut dire « rien
   *    à proposer », jamais « rien à ajouter » ni « composition couverte ». D'où
   *    un écran qui n'affiche **rien du tout** dans ce cas, plutôt qu'un
   *    rassurant « aucun allergène dans la composition ».
   * 2. **La maille est le PRODUIT.** Les ingrédients sont cités par la fiche, la
   *    déclaration est portée par la déclinaison. Les libellés parlent donc de
   *    « la composition de ce produit », jamais de ce que cette déclinaison
   *    contient.
   * 3. **Le dérivé propose, la déclaration décide.** Rien n'est appliqué : la
   *    reprise est un geste explicite, et elle ne part qu'avec la section.
   *
   * Le champ existait côté serveur — la route, le handler, le contrat et ses
   * tests — et **aucun écran ne l'appelait**. Un ingrédient porteur d'un
   * allergène, cité par une fiche qui n'en déclare aucun, ne produisait donc
   * aucune alerte (audit 2026-09-01, §3).
   */
  private readonly citedAllergensValue = signal<readonly string[]>([]);
  readonly citedAllergens: Signal<readonly string[]> = this.citedAllergensValue;

  /**
   * La composition n'a pas pu être lue.
   *
   * Un drapeau à part, et pas une liste vide : « rien à proposer » et « on n'a
   * pas pu regarder » se ressemblent à l'écran, et le premier est déjà une
   * absence d'information (D5, interdit n° 1). Les confondre ferait passer une
   * panne réseau pour une composition sans allergène.
   */
  readonly citedAllergensUnreadable = signal(false);
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
   * Le **slug** — le handle qui pilote l'URL publique. Lu, jamais saisi : il est
   * DÉRIVÉ du nom par le domaine, et l'exposer en écriture proposerait de
   * corriger ce que le serveur recalcule.
   *
   * ⚠️ Ce JSDoc a dit deux choses fausses, corrigées le 2026-09-02 : le handle
   * ne naît pas de la première publication, et il n'est pas figé à la création.
   * `Product.rename()` le **re-dérive** — donc renommer une fiche déjà poussée
   * déplace son URL publique, et l'historique Shopify, unique par
   * `(handle, version)`, repart à v1 sous le nouveau handle en laissant
   * l'ancien orphelin. Le commentaire prétendait empêcher exactement ce qu'il
   * décrivait.
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
   * **La signature « publiable »** — `null` tant que personne ne s'est prononcé.
   *
   * Elle vit à côté du statut sans en être un : le statut dit ce que le
   * catalogue fait de la fiche, la signature dit ce qu'une personne affirme de
   * son contenu. Une fiche signée reste un brouillon.
   */
  private readonly readinessValue = signal<ProductReadinessView | null>(null);
  readonly readiness: Signal<ProductReadinessView | null> = this.readinessValue;

  /**
   * La signature vaut-elle encore ? **Lue**, jamais calculée ici.
   *
   * Elle l'était : l'écran comparait `readyAt` à un `contentUpdatedAt` reçu au
   * chargement. Deux défauts symétriques, tous deux invisibles à la lecture du
   * code de comparaison, qui était juste :
   *
   * - côté serveur, la date venait de `product.updated_at`, un `@updatedAt`
   *   posé sur la ligne qui porte `status` — **mettre en vente périmait donc la
   *   signature qui justifiait la mise en vente** ;
   * - côté écran, la date n'était posée qu'à l'hydratation et jamais
   *   rafraîchie, si bien qu'enregistrer une section ne périmait rien tant
   *   qu'on ne rechargeait pas la page.
   *
   * Un indicateur faux dans les deux sens n'informe pas, il use. Le serveur
   * répond désormais sur les FAITS du journal (`domain/content-facts.ts`), et
   * l'écran se contente de le relire — y compris après un changement de statut,
   * cf. {@link refreshLifecycle} (audit 2026-09-01, tranches 2, 3 et 7).
   */
  private readonly readinessStaleValue = signal(false);
  readonly readinessStale: Signal<boolean> = this.readinessStaleValue;

  /**
   * Le nombre de déclinaisons — un COMPTE, pas la liste. L'en-tête a besoin de
   * « 3 déclinaisons » ; personne n'édite encore les déclinaisons ici, donc
   * hydrater la liste entière serait déclarer plus que l'écran ne sait faire.
   */
  private readonly variantCountValue = signal(0);
  readonly variantCount: Signal<number> = this.variantCountValue;

  /** Un dépôt en cours — le bouton se désarme, la liste ne bouge pas encore. */
  readonly uploading = signal(false);

  /**
   * L'identifiant de la fiche ouverte — vide tant qu'on crée.
   *
   * Lisible de l'extérieur depuis la section Ingrédients : elle vit sur un
   * AUTRE agrégat, avec son propre point d'API, et n'a besoin de ce magasin que
   * pour savoir de quelle fiche elle parle. La rendre écrivable ferait de ce
   * magasin le sujet de deux propriétaires.
   */
  private readonly productIdValue = signal('');
  readonly productId: Signal<string> = this.productIdValue;
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

  /**
   * Le taux EFFECTIF d'un contexte, en pourcentage — dérogation de la fiche
   * par-dessus celle de sa famille. `undefined` = pas de taux réglé.
   */
  private percentOf(contextKey: string): number | undefined {
    const rateId =
      this.vatOverride()[contextKey] ?? this.selectedCategory()?.vatByContext[contextKey];
    return rateId === undefined ? undefined : this.regimeById().get(rateId)?.percent;
  }

  /**
   * Le **prix professionnel**, dérivé du prix public par le rapport des règles
   * comptables — et son hors taxe.
   *
   * `null` dès qu'une pièce manque : pas de prix, pas de rapport réglé, ou une
   * fiche encore ancrée au hors taxe. Le rapport est un rapport TTC/TTC ; il ne
   * veut rien dire appliqué à un montant hors taxe, et le faire quand même
   * afficherait un prix que le serveur ne calculerait pas.
   */
  /**
   * Le prix **de départ** d'un contexte, avant son taux.
   *
   * C'est le prix public partout — sauf pour le contexte professionnel, qui ne
   * vend pas au prix public : il vend au prix remisé. Sans cette distinction,
   * l'écran affichait DEUX hors taxe B2B différents, l'un sous le prix pro et
   * l'autre dans le tableau, et rien ne disait lequel serait facturé.
   *
   * Le rapport est un rapport TTC/TTC, et le prix saisi EST un prix public
   * TTC : il n'y a plus d'assiette à vérifier avant de l'appliquer.
   */
  private basePriceEurFor(contextKey: string): number | null {
    const priceEur = this.priceEur();
    const ratioBp = this.accounting.rules().ratioBp;
    if (contextKey !== PRO_CONTEXT_KEY || priceEur === null || ratioBp === null) {
      return priceEur;
    }
    return proPriceFromPublic(Math.round(priceEur * 100), ratioBp) / 100;
  }

  readonly proPricing = computed<ProPricing | null>(() => {
    const priceEur = this.priceEur();
    const ratioBp = this.accounting.rules().ratioBp;
    if (priceEur === null || ratioBp === null) {
      return null;
    }
    const proTtcCents = proPriceFromPublic(Math.round(priceEur * 100), ratioBp);
    const percent = this.percentOf(PRO_CONTEXT_KEY);
    return {
      ttc: euros(proTtcCents),
      discountLabel: formatDiscount(ratioBp),
      // Le hors taxe se déduit du prix pro ARRONDI, pas d'un rationnel gardé
      // jusqu'au bout : les deux nombres s'affichent l'un sous l'autre, et le
      // second re-taxé doit redonner le premier. Un client qui recompte
      // trouverait le désaccord avant nous.
      ht: percent === undefined ? null : euros(htFromTtc(proTtcCents, percent)),
    };
  });

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

  /**
   * **La fiche n'est vendue nulle part.**
   *
   * Le trou que la complétude ne peut pas boucher : elle mesure ce que la fiche
   * PORTE — un nom, un prix, des allergènes, un visuel — et rien de tout ça ne
   * dit où on la vend. Une fiche pouvait donc être à 10/10, signée, « En
   * ligne », et n'apparaître dans aucun contexte : tout était juste, et il ne se
   * passait rien. Rien à l'écran ne le disait (audit 2026-09-01, §11).
   *
   * ⚠️ Ce n'est **pas** une condition de complétude, et c'est délibéré :
   * préparer une fiche avant d'ouvrir ses canaux est un usage normal, et la
   * rendre bloquante l'interdirait. C'est un avertissement, posé là où le geste
   * se fait — le bloc de mise en vente.
   *
   * Lu sur les CANAUX et non sur les contextes résolus : résoudre demande le
   * référentiel des points de vente, et tant qu'il n'a pas répondu toute fiche
   * paraîtrait vendue nulle part. Le couple (lieu, contexte) est là ou il n'y
   * est pas — la question ne dépend d'aucun chargement.
   */
  readonly soldNowhere = computed(() => this.effectiveChannels().length === 0);

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
    const counterpartFor = (contextKey: string): DerivedAmount | null =>
      counterpartOf(this.basePriceEurFor(contextKey), this.percentOf(contextKey));
    return {
      categoryName: category.name.fr,
      // UNE ligne par contexte du registre : un contexte de plus en base est une
      // ligne de plus ici, sans livrer de front.
      channelsSource: this.channelsOverride() === null ? 'inherited' : 'overridden',
      channels: this.orderedContexts().map((context) => ({
        key: context.key,
        label: context.label,
        // Plus aucune branche, ni sur le nom d'un contexte ni sur sa forme :
        // « est-il vendu ? » et « par qui ? » se lisent pareil pour tous. La
        // plateforme professionnelle se nomme comme une boutique se nomme.
        sold: sellsContext(channels, context.key),
        boutiques: pointsOfSaleSelling(channels, context.key, this.pointsOfSale()),
        rate: rateOf(context.key),
        counterpart: counterpartFor(context.key),
        discounted: this.basePriceEurFor(context.key) !== this.priceEur(),
        source: override[context.key] === undefined ? 'inherited' : 'overridden',
      })),
    };
  });

  /**
   * Les contextes dans l'ordre du REGISTRE.
   *
   * Ils étaient rangés « ce qui n'a pas besoin d'un lieu d'abord » — une manière
   * de mettre le B2B en tête sans le nommer, l'app vendant aux professionnels.
   * Ce critère a disparu avec `perLocation` (p-2) : c'est le point de vente qui
   * dit ce qu'il offre, pas le contexte qui dit s'il lui faut un lieu.
   *
   * Reste `position`, réglable à l'écran des contextes. L'ordre de lecture est
   * donc devenu une donnée qu'on peut corriger, au lieu d'une déduction que
   * personne ne voyait.
   */
  private readonly orderedContexts = computed(() =>
    [...this.contextStore.items()].sort((a, b) => a.position - b.position),
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

  /**
   * Les allergènes cités par la composition et **absents de la déclaration en
   * cours** — la proposition, pas une vérification.
   *
   * Elle se calcule sur `selected()`, l'état à l'écran, et non sur ce qui est
   * enregistré : cocher une case doit faire disparaître la ligne tout de suite,
   * sinon l'encart reproche encore ce qu'on vient de corriger.
   *
   * Un code que le référentiel du catalogue courant ne connaît pas est ignoré :
   * la portée « UE » n'expose pas tout, et proposer un code sans libellé
   * afficherait `en:e220` à un opérateur.
   */
  readonly citedNotDeclared = computed<AllergenChoice[]>(() => {
    const declared = new Set(this.selected());
    const byCode = new Map(this.entries().map((entry) => [entry.code, entry]));
    return this.citedAllergens()
      .filter((code) => !declared.has(code))
      .flatMap((code) => {
        const entry = byCode.get(code);
        return entry === undefined ? [] : [{ code, label: entry.incoLabel ?? entry.label }];
      });
  });

  /**
   * La composition contredit-elle un « aucun allergène » ?
   *
   * Le cas le plus grave des deux, et le seul que l'écran doit crier : quelqu'un
   * a affirmé qu'il n'y en avait aucun, et la fiche cite un ingrédient qui en
   * porte un. C'est exactement le beurre de l'audit. Une proposition ordinaire
   * se range, celle-ci s'oppose.
   */
  readonly citedContradictsNone = computed(
    () => this.declaresNone() && this.citedAllergens().length > 0,
  );

  /**
   * **Reprendre** ce que la composition mentionne dans la déclaration.
   *
   * Le geste explicite que D5 exige : rien n'est appliqué tout seul, et rien
   * n'est enregistré ici non plus — la section part avec le reste. Un « aucun
   * allergène » qui traînait est levé au passage, sans quoi la déclaration se
   * contredirait elle-même.
   *
   * Jamais de RETRAIT : un allergène déclaré à la main (contamination croisée
   * d'atelier) n'est pas démenti par une composition qui l'ignore.
   */
  adoptCitedAllergens(): void {
    const missing = this.citedNotDeclared().map((choice) => choice.code);
    if (missing.length === 0 && !this.citedContradictsNone()) {
      return;
    }
    this.declaresNone.set(false);
    this.selected.update((current) => [
      ...current,
      ...missing.filter((code) => !current.includes(code)),
    ]);
  }

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
    this.productIdValue.set(id ?? '');
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
      // Un prix public TTC — la seule assiette. Le hors taxe se déduit du taux
      // de chaque canal, il ne s'enregistre pas.
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
   * **Déclarer la fiche publiable.**
   *
   * Le geste que la complétude ne peut pas faire : elle dit que tout est
   * rempli, elle ne dira jamais que c'est juste. Il ne touche pas au statut, et
   * n'enregistre rien des champs — une section modifiée le reste, et la
   * signature portera sur ce qui est ENREGISTRÉ, pas sur ce qui est à l'écran.
   *
   * La déclaration revient du serveur plutôt que d'être peinte d'avance : sa
   * date et son auteur sont décidés là-bas, et les inventer ici afficherait une
   * signature que la base ne porte pas.
   */
  async declareReady(): Promise<void> {
    const id = this.productId();
    if (id === '' || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      this.readinessValue.set(await this.products.declareReady(id));
      // La signature vient d'être posée à l'horloge du serveur, donc APRÈS tout
      // fait déjà écrit : rien ne peut la périmer à l'instant où elle naît. Le
      // dire ici évite un aller-retour, et surtout évite de laisser à l'écran
      // l'avertissement de péremption de la signature PRÉCÉDENTE.
      this.readinessStaleValue.set(false);
    } catch (caught) {
      this.error.set(messageOf(caught));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * **Un geste du cycle de vie**, nommé par l'intention et non par le statut visé.
   *
   * 🔴 C'est la correction du défaut le plus coûteux de l'écran, et elle tient
   * dans le TYPE. La méthode prenait un `ProductStatus` cible, et `'draft'` est
   * la cible de deux gestes différents : dépublier (depuis « en ligne ») et
   * restaurer (depuis « archivé »). Les deux se retrouvaient donc sur la route
   * de dépublication — que le domaine ignore sur un produit archivé. Résultat :
   * l'écran peignait « Brouillon », le journal inscrivait un retrait de la vente
   * qui n'avait pas eu lieu, la base restait archivée, et la restauration
   * n'existait nulle part ailleurs dans l'interface (audit 2026-09-01, §1).
   *
   * Nommer l'intention rend la confusion **inexprimable** : il n'y a plus de
   * cible commune où deux gestes puissent se rejoindre.
   *
   * Ce n'est PAS un enregistrement de section : rien ici ne dépend de ce qui est
   * en attente dans les champs, et l'inverse est vrai aussi — un produit se
   * publie avec des sections modifiées, elles restent modifiées après. D'où le
   * rafraîchissement CIBLÉ de {@link refreshLifecycle} plutôt qu'une
   * réhydratation, qui écraserait la saisie en cours.
   */
  async runLifecycle(gesture: LifecycleGesture): Promise<void> {
    const id = this.productId();
    if (id === '' || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.callLifecycle(id, gesture);
      await this.refreshLifecycle(id);
    } catch (caught) {
      this.error.set(messageOf(caught));
    } finally {
      this.busy.set(false);
    }
  }

  private callLifecycle(id: string, gesture: LifecycleGesture): Promise<void> {
    switch (gesture) {
      case 'publish':
        return this.api.publishProduct(id);
      case 'unpublish':
        return this.api.unpublishProduct(id);
      case 'archive':
        return this.api.archiveProduct(id);
      case 'restore':
        return this.api.restoreProduct(id);
    }
  }

  /**
   * Relit du serveur ce qu'un geste de cycle de vie a pu déplacer — et RIEN
   * d'autre.
   *
   * L'état était peint d'avance (`statusValue.set(next)`), ce qui affichait le
   * résultat espéré même quand le serveur n'avait rien fait. Il est maintenant
   * relu, et c'est ce qui rend une panne visible plutôt que muette.
   *
   * Ciblé, pas une réhydratation : `hydrate()` réécrit tous les champs et
   * effacerait les sections en attente, qu'une mise en vente est censée laisser
   * intactes. Quatre valeurs sont reprises, et ce sont exactement celles qu'un
   * statut déplace : l'état lui-même, la signature et sa péremption (le serveur
   * ne compte plus un statut comme une modification du contenu, mais c'est LUI
   * qui le dit maintenant), et le `slug`, que le serveur re-dérive du nom.
   */
  private async refreshLifecycle(id: string): Promise<void> {
    const detail = await this.products.getDetail(id);
    if (detail === null) {
      this.notFound.set(true);
      return;
    }
    this.statusValue.set(detail.product.status);
    this.slugValue.set(detail.product.slug?.fr ?? '');
    this.readinessValue.set(detail.readiness);
    this.readinessStaleValue.set(detail.readinessStale);
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
      // 🔴 Les CINQ sections écrivent du contenu — identité, tarif, fiche
      // réglementaire, communication, visuels. Chacune inscrit donc un fait
      // postérieur à la signature, et la périme.
      //
      // Déduit plutôt que relu : un aller-retour de plus rendrait la même
      // réponse, et il pourrait échouer APRÈS un enregistrement réussi — on
      // afficherait alors une signature valide sur un contenu qui vient de
      // changer, c'est-à-dire exactement le défaut qu'on répare.
      //
      // Sans cette ligne, la signature restait verte pour toute la session :
      // `readinessStale` n'était rafraîchi qu'à l'hydratation et après un geste
      // de cycle de vie. Reprendre les allergènes cités, enregistrer, et le rail
      // n'offrait pas « Déclarer à nouveau » — la fiche paraissait signée sur un
      // contenu qu'elle n'avait plus (constaté par Hugo le 2026-09-01).
      if (this.readinessValue() !== null) {
        this.readinessStaleValue.set(true);
      }
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
    this.readinessValue.set(detail.readiness);
    this.readinessStaleValue.set(detail.readinessStale);
    this.nutrition.set(detail.nutrition);
    const variant = product.variants.find((entry) => entry.isDefault) ?? product.variants[0];
    this.variantId.set(variant?.id ?? '');
    // Les DEUX champs sont posés dans les trois branches. Ils ne l'étaient pas :
    // `[]` ne remettait que `declaresNone`, une liste non vide ne remettait que
    // `selected`. Une seconde hydratation sur la même instance pouvait donc
    // laisser `declaresNone` à `true` au-dessus d'une sélection non vide — et
    // `saveFiche()` aurait alors envoyé `[]`, effaçant les allergènes déclarés
    // sans un mot (audit 2026-09-01, §13).
    const allergens = detail.allergens;
    this.declaresNone.set(allergens !== null && allergens.length === 0);
    this.selected.set(allergens === null ? [] : [...allergens]);
    this.captureBaseline();
    await this.loadCitedAllergens(id);
  }

  /**
   * Ce que la composition mentionne — une aide, jamais un bloqueur.
   *
   * Un échec ne fait pas tomber la fiche : la déclaration réglementaire se
   * saisit très bien sans proposition. Mais il ne se tait pas non plus, et
   * c'est la seule chose qui compte ici — « rien à proposer » et « on n'a pas
   * pu regarder » se ressemblent à l'écran et ne veulent pas du tout dire la
   * même chose (D5, interdit n° 1). D'où un drapeau distinct plutôt qu'une
   * liste vide.
   */
  private async loadCitedAllergens(id: string): Promise<void> {
    try {
      this.citedAllergensValue.set(await this.products.citedAllergens(id));
      this.citedAllergensUnreadable.set(false);
    } catch {
      this.citedAllergensValue.set([]);
      this.citedAllergensUnreadable.set(true);
    }
  }

  /**
   * **La composition vient d'être enregistrée** — appelé par la section
   * Ingrédients, qui vit sur un autre agrégat et porte son propre bouton.
   *
   * Deux conséquences, et une seule méthode pour les deux parce que c'est un
   * seul événement :
   *
   * - on relit ce que la composition mentionne, sans quoi ajouter « beurre » ne
   *   changerait rien à ce que la section réglementaire propose tant qu'on n'a
   *   pas rechargé la page ;
   * - on périme la signature, comme pour les cinq autres sections : changer la
   *   composition peut rendre fausse une déclaration d'allergènes déjà signée,
   *   et c'est précisément pour ça que `product.ingredients_saved` est classé
   *   fait de contenu côté serveur.
   */
  async noteCompositionSaved(): Promise<void> {
    const id = this.productId();
    if (id === '') {
      return;
    }
    await this.loadCitedAllergens(id);
    if (this.readinessValue() !== null) {
      this.readinessStaleValue.set(true);
    }
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
