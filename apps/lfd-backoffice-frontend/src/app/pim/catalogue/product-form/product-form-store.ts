import {
  Injectable,
  computed,
  inject,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';

import {
  htFromTtc,
  proPriceOf,
  LOCALES,
  SOURCE_LOCALE,
  missingLocales,
  writeLocalized,
  type Locale,
  type LocalizedText,
  type OperationAudience,
  type ProductLineageView,
  type ProductReadinessView,
  type ProPrice,
  type SaleUnit,
  type VariantAspect,
} from '@lfd/pim-contracts';

import { MILLICENTS_PER_CENT } from '@lfd/money';

import { variantTabLabel } from './variant-label';
import { activationRefusalOf, type ActivationRefusal } from './activation-refusal';
import { proPriceMillicentsOf, proPricePayloadOf, proPriceTextOf } from './pro-price-entry';
import {
  bucketsOf,
  citedNotDeclaredIn,
  mergedEntries,
  groupsOf,
  singlesOf,
  traceOptionsOf,
} from './allergen-choices';
import {
  NO_DECLARATION,
  declaresNone,
  hasDeclared,
  selectedAllergens,
  withAllergen,
  withCitedAdopted,
  withNoAllergen,
  withTraces,
  type AllergenDeclaration,
} from './allergen-declaration';

import { httpErrorMessage } from '@lfd/endpoints';

import { formatPercent } from '../../data/channels';
import { SalesContextStore } from '../../sales-contexts/sales-context-store';
import type {
  AllergenEntry,
  AllergenScope,
  Category,
  ProductKind,
  ProductStatus,
  Variant,
  VatRate,
} from '../../data/models';
import { CatalogueApi } from '../catalogue-api';
import type { PickedMedia } from '../library-picker/library-picker';
import { isPublishedMediaRole } from '../media-roles';
import { MEDIA_ROLE_FORMATS, roleLabel } from '../media-formats';
import { ReferenceApi } from '../reference-api';
import { NotifyService } from '../../../notify.service';
import { isPrecautionary, PRECAUTIONARY_NOTICE } from '../product-compliance';
import {
  ProductHttpApi,
  type EditorialFields,
  type MediaSlot,
  type NutritionValues,
} from '../product-http-api';
import {
  flattenMediaImages,
  groupMediaByImage,
  persistedMedia,
  withMediaRoles,
} from '../media-usages';
import { PendingCreatedMedia, type CreatedMediaFailure } from '../pending-created-media';

// Réexporté : les panneaux le tenaient d'ici, et il vit maintenant au niveau de
// l'API — la couche qui parle au serveur possède la forme qu'elle envoie.
export type { MediaSlot };

// ── Types de vue partagés par la page et les panneaux ──────────────────────

export interface KindOption {
  readonly value: ProductKind;
  readonly label: string;
}

/**
 * Le regroupement du registre INCO et ses libellés vivent dans
 * `allergen-choices.ts` — des règles de présentation du référentiel, pures et
 * éprouvables sans formulaire. Réexportés ici : les panneaux les tenaient du
 * magasin.
 *
 * `AllergenGroup` garde son nom d'usage à l'écran ; c'est le même objet que
 * `AllergenBucket`.
 */
export type { AllergenChoice } from './allergen-choices';
export type { AllergenBucket as AllergenGroup } from './allergen-choices';

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
 * Le prix professionnel tel que l'écran le montre : le HT saisi, qui fait foi,
 * et le TTC qui n'en est que l'affichage. Toujours saisi depuis le lot R3
 * (`plan-retirer-le-rapport-pro.md`, 2026-10-27) : la remise des règles
 * comptables, sa pastille et sa source `ratio` sont retirées.
 */
export interface ProPricing {
  readonly ttc: string;
  readonly ht: string;
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
  readonly rate: RateView | null;
  /**
   * L'autre face du prix, pour CE contexte — `null` sans prix ou sans taux.
   *
   * C'est ici que l'ancrage TTC se voit : un prix d'étiquette unique donne un
   * hors taxe par taux, et c'est cette colonne qui les montre côte à côte.
   */
  readonly counterpart: DerivedAmount | null;
  /**
   * Cette ligne part-elle du **prix pro saisi** plutôt que du prix public ?
   * (Son nom date du rapport pro, retiré au lot R3.)
   *
   * Le montant seul ne le dit pas, et un professionnel qui compare le tableau
   * au prix affiché plus haut ne retrouverait pas ses comptes sans cette
   * mention.
   */
  readonly discounted: boolean;
}

export interface CategoryInheritanceView {
  readonly categoryName: string;
  readonly channels: readonly ChannelInheritance[];
}

/**
 * Les sections **enregistrables** — la seule source des clés de section.
 *
 * `fiche` s'est scindée en `allergenes` et `nutrition` le 2026-09-22 : les deux
 * moitiés ont chacune leur route, leur fait de journal et son drapeau
 * d'alignement, et enregistrer l'une ne doit RIEN envoyer de l'autre.
 */
export type FormSection =
  'identite' | 'tarif' | 'allergenes' | 'nutrition' | 'communication' | 'visuels';

/**
 * Ce qu'une déclinaison peut suivre du défaut — le vocabulaire du **serveur**.
 *
 * 🔴 Il vient de `@lfd/pim-contracts` et n'est plus redéclaré ici. La copie
 * locale valait `'regulatory' | 'pricing'` : elle a survécu au dédoublement du
 * drapeau réglementaire, et cet écran envoyait donc encore `"regulatory"` là où
 * le serveur attend `"allergens"` ou `"nutrition"`. Un type recopié ne périme
 * pas quand l'original bouge — c'est tout ce qu'on lui reproche.
 */
export type { VariantAspect };

/**
 * **Ce que la ligne sous l'en-tête d'une carte doit dire.**
 *
 * Trois états et pas deux, parce que « rien à aligner » et « portée par la
 * fiche » ne sont pas la même réponse : la première vaut sur la déclinaison par
 * défaut, où l'alignement n'a pas de sens ; la seconde vaut sur une carte que
 * le MODÈLE ne laisse pas diverger, et elle doit dire où aller la modifier.
 *
 * Le calcul est ici et non dans le gabarit : c'est une règle de modèle, et une
 * règle dans un gabarit est une règle qu'aucun test unitaire n'atteint.
 */
export type SectionAlignment =
  /** Une case à cocher : cette section s'aligne. */
  | { readonly kind: 'alignable'; readonly aspect: VariantAspect; readonly aligned: boolean }
  /** Portée par la fiche — commune à toutes les déclinaisons. */
  | { readonly kind: 'product' }
  /** Rien à dire : on édite la déclinaison par défaut. */
  | { readonly kind: 'none' };

/**
 * Quelle section suit quoi. Les absentes sont portées par la FICHE.
 *
 * 🔴 Plus rien n'envoie `"regulatory"` depuis cet écran. La valeur reste
 * acceptée en écriture par le serveur le temps que les autres appelants
 * basculent (§6d du plan) ; ici elle est libérée.
 */
const ALIGNABLE: Partial<Record<FormSection, VariantAspect>> = {
  tarif: 'pricing',
  allergenes: 'allergens',
  nutrition: 'nutrition',
};

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

/**
 * **La famille de lecture d'une section** — quatre, et elles suivent ce que
 * chacune fait à la fiche, pas un classement de confort (décision Hugo,
 * 2026-09-23).
 *
 * Ce qui les sépare, **dans le code d'aujourd'hui** :
 *
 * - `reglementaire` **commande la publication** : l'invariant 7 refuse de
 *   mettre en vente une déclinaison active sans déclaration d'allergènes
 *   (`pim/catalogue/product/domain/entities/product.ts`, `publish()`). La
 *   nutrition, elle, n'y entre pas — le règlement l'exempte de ce qu'on vend.
 * - `communication` **ne bloque rien** : aucun texte, aucune image n'empêche de
 *   publier.
 * - `identite` porte ce sans quoi le produit n'existe pas au catalogue ;
 *   `commerce` ce qui décide de sa vente.
 *
 * ⚠️ **Ce qui ne les sépare qu'à MOITIÉ**, et la moitié a bougé dans la
 * journée du 2026-09-23 :
 *
 * - les **visuels** ne périment plus la signature de publiabilité
 *   (`product.media_saved` est passé à `false` dans `content-facts.ts`, avec
 *   son amendement daté) ;
 * - les **textes**, si (`product.editorial_saved` vaut toujours `true`). C'est
 *   une décision **en attente**, pas un oubli : « pour l'instant on se
 *   concentre sur les médias, on ira sur contenu après ».
 *
 * Et les deux entrent toujours dans l'**empreinte de révision** (`editorial` et
 * `media` dans `revision.ts`). Un plan proposait de les en sortir ; il a été
 * contredit et **abandonné** — le critère de l'ancre est « ce qu'un canal doit
 * recevoir pour être autosuffisant », et la projection B2B porte désormais la
 * note et l'image.
 *
 * ⚠️ Cette incise a déjà été fausse **deux fois** le même jour : écrite au
 * présent voulu plutôt qu'au présent réel, puis périmée par la bascule des
 * visuels quelques heures plus tard. Elle parle d'un autre fichier — c'est
 * exactement le « commentaire dangereux » du `CLAUDE.md` §8. **Rouvrir
 * `content-facts.ts` et `revision.ts` avant de la croire.**
 *
 * La raison est écrite parce qu'un regroupement muet se fait réarranger par le
 * premier qui trouve un autre ordre « plus logique ».
 */
export type SectionFamily = 'identite' | 'commerce' | 'reglementaire' | 'communication';

export interface SectionRef {
  readonly key: FormSection;
  readonly label: string;
  /**
   * La famille de la section, PORTÉE PAR ELLE.
   *
   * Pas une seconde table à tenir d'accord : une section ajoutée à
   * {@link SAVEABLE} sans famille ne compile pas, là où une table parallèle
   * l'aurait laissée tomber en silence hors de tout filtre.
   */
  readonly family: SectionFamily;
}

type SectionStatus = 'saving' | 'saved' | 'error';

const KINDS: readonly KindOption[] = [
  { value: 'daily', label: 'Frais du jour' },
  { value: 'made_to_order', label: 'Sur commande' },
  { value: 'resale', label: 'Revente' },
];

const SAVEABLE: readonly SectionRef[] = [
  { key: 'identite', label: 'Identité', family: 'identite' },
  { key: 'tarif', label: 'Tarif & logistique', family: 'commerce' },
  { key: 'allergenes', label: 'Allergènes', family: 'reglementaire' },
  { key: 'nutrition', label: 'Valeurs nutritionnelles', family: 'reglementaire' },
  { key: 'communication', label: 'Communication', family: 'communication' },
  // Les visuels s'enregistraient... nulle part. Le panneau ajoutait, retirait et
  // réordonnait dans le vide, et le garde « modifications non enregistrées » ne
  // les comptait pas — on pouvait donc les perdre sans le moindre avertissement.
  { key: 'visuels', label: 'Visuels', family: 'communication' },
];

/**
 * Le rôle d'un visuel neuf : `gallery`, le neutre — « une image du produit »,
 * sans prétention d'usage. C'est {@link ProductFormStore.setMediaRoles} qui
 * promeut, jamais le dépôt.
 *
 * 🔴 **Ce commentaire a affirmé le contraire jusqu'au 2026-09-23**, et il a
 * coûté une fonctionnalité entière. Il disait : « le premier déposé devenait
 * `hero`, ce qui affirmait une hiérarchie qu'aucun canal ne lit aujourd'hui :
 * ni la projection de l'ancien canal ni le B2B ne consultent le rôle. »
 *
 * Les deux moitiés étaient fausses. La vitrine du canal B2B cherche
 * **précisément** le `hero` (`pim/channels/b2b-platform/products/showcase.ts`),
 * et l'ancien canal de vente en ligne est sorti du dépôt le 2026-09-21. Conséquence mesurée : aucun
 * produit ne portait de `hero`, `heroOf()` rendait donc toujours `null`, et
 * **la vitrine n'a jamais montré la moindre image**. Une phrase qui justifiait
 * de ne rien construire, par l'état d'un fichier que personne n'a rouvert.
 *
 * La vitrine, elle, refuse délibérément de se rabattre sur le premier visuel —
 * « afficher une photo de table à la place d'un croissant serait pire que le
 * vide ». Elle attend donc une désignation, et il fallait la lui donner.
 */
const DEFAULT_MEDIA_ROLE = 'gallery';

/**
 * Les cinq usages d'un visuel, et leur libellé.
 *
 * Ils existent dans le domaine depuis l'origine (`MEDIA_ROLES`) ; aucun écran
 * n'en proposait plus d'un jusqu'au 2026-09-23. Le libellé et le format de
 * chacun viennent de la table des formats (`media-formats.ts`), seule source.
 */
export const MEDIA_ROLE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(MEDIA_ROLE_FORMATS).map(([role, entry]) => [role, roleLabel(entry)]),
);

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
 * Ce qu'une déclinaison porte d'ÉDITABLE — le brouillon qu'on met de côté en
 * changeant d'article.
 *
 * Ni le nom ni la référence : ils ne s'éditent pas encore ici, et les stocker
 * ferait croire le contraire.
 */
interface VariantDraft {
  readonly priceEur: number | null;
  readonly weightGrams: number | null;
  /** Le prix pro HT, en TEXTE tel que saisi : cinq décimales ne passent pas par un flottant. */
  readonly proPriceHtText: string;
  /** Le prix au kilo public TTC saisi, en euros (`plan-prix-au-kilo.md`, K4). */
  readonly publicPricePerKgEur: number | null;
  /** Le prix au kilo pro HT saisi, en TEXTE comme le prix pro HT. */
  readonly proPricePerKgHtText: string;
  /** L'unité de vente, son pas et son minimum (`vente-au-poids.md`, P1). */
  readonly saleUnit: SaleUnit;
  readonly weightStepGrams: number | null;
  readonly weightMinGrams: number | null;
  /**
   * Allergènes **et** traces, en un seul état tri-étatique.
   *
   * Les traces sont ici et non avec la nutrition : une trace est un allergène
   * (§5 du plan). Elles partent donc avec la section qui les montre, et aucune
   * écriture de nutrition ne peut plus les effacer — le bug 0a devient
   * inatteignable, il n'est plus rattrapé par un transport.
   */
  readonly declaration: AllergenDeclaration;
  readonly nutrition: NutritionValues;
  readonly allergensAligned: boolean;
  readonly nutritionAligned: boolean;
  readonly pricingAligned: boolean;
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
  /** Le rapport prix public / prix pro — réglé une fois, lu partout. */
  private readonly contextStore = inject(SalesContextStore);
  private readonly reference = inject(ReferenceApi);
  private readonly notify = inject(NotifyService);
  private readonly pendingCreatedMedia = inject(PendingCreatedMedia);

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
  /**
   * Le référentiel MONDE, pour nommer ce que la composition cite hors de la
   * portée affichée (sarrasin, maïs, noix de coco — décision de Hugo,
   * 2026-10-26). Vide tant qu'il n'est pas lu : rien n'est alors nommé de plus.
   */
  readonly citedReference = signal<readonly AllergenEntry[]>([]);

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
   * **Le prix pro HT saisi**, en TEXTE (lot P) — `""` = pas saisi.
   *
   * Un texte et non un nombre : cinq décimales tapées doivent arriver au
   * serveur telles quelles, et c'est lui qui refuse la sixième.
   */
  readonly proPriceHtText = signal('');

  /**
   * **Les prix au kilo saisis** (`plan-prix-au-kilo.md`, K4) — informatifs,
   * jamais calculés : le public TTC en euros comme `priceEur`, le pro HT en
   * TEXTE comme `proPriceHtText`. Vide = non saisi.
   */
  readonly publicPricePerKgEur = signal<number | null>(null);
  readonly proPricePerKgHtText = signal('');

  /**
   * **L'unité de vente** (`vente-au-poids.md`, P1) — à la pièce ou au
   * poids. Au poids, les prix saisis sont AU KILO, et le pas de saisie (requis
   * pour activer) et le minimum (facultatif) se règlent en grammes.
   */
  readonly saleUnit = signal<SaleUnit>('piece');
  readonly weightStepGrams = signal<number | null>(null);
  readonly weightMinGrams = signal<number | null>(null);

  /**
   * L'unité est figée dès la première publication : le serveur refuserait le
   * changement (409), l'écran ne le propose donc pas.
   */
  readonly saleUnitLocked = computed(
    () =>
      this.variantsValue().find((variant) => variant.id === this.variantId())?.hasBeenPublished ??
      false,
  );

  /** La saisie, lue — `null` si vide ou si elle ne fait pas un prix. */
  readonly proPriceMillicents = computed(() => proPriceMillicentsOf(this.proPriceHtText()));

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
   * Vendu seulement pendant une opération (D3). Hors des sections : sa carte
   * l'écrit seule, sur sa propre route, comme la limite de commande.
   */
  readonly operationOnly = signal(false);
  /** Demande le froid (lot 4 bis). Hors des sections, comme la réservation. */
  readonly requiresCold = signal(false);
  /** Chaque déclinaison en vignette au rayon. Hors des sections, comme le froid. */
  readonly variantsAsTiles = signal(true);
  /**
   * À qui la fiche vend quand elle déroge à sa famille ; `null` = elle hérite.
   * Une écriture à part (`PUT …/audience`), hors des sections.
   */
  readonly audience = signal<OperationAudience | null>(null);
  /**
   * Le refus d'ACTIVER, rangé à part de `error` : il porte une liste par
   * déclinaison, que le rail montre sous le bouton qui l'a provoqué.
   */
  readonly activationRefusal = signal<ActivationRefusal | null>(null);
  readonly weightGrams = signal<number | null>(null);
  /**
   * **La déclaration d'allergènes — un seul signal, et c'est le sujet.**
   *
   * Elle portait un booléen « aucun allergène » à côté d'une liste de codes,
   * et à l'enregistrement le booléen gagnait en jetant la liste (bug 0c vu de
   * l'écran). Le tri-état supprime la divergence au lieu de la valider ; les
   * trois lectures ci-dessous sont DÉRIVÉES, jamais posées.
   */
  readonly declaration = signal<AllergenDeclaration>(NO_DECLARATION);

  /** Les codes cochés — `[]` aussi bien pour le silence que pour l'affirmation. */
  readonly selected = computed(() => selectedAllergens(this.declaration()));

  /** « Aucun allergène » est-il AFFIRMÉ ? */
  readonly declaresNone = computed(() => declaresNone(this.declaration()));

  /**
   * Personne ne s'est prononcé : la déclinaison se publie par précaution
   * (`plan-allergenes-jamais-bloquants.md`, règle B).
   */
  readonly allergensUndeclared = computed(() => !hasDeclared(this.declaration()));

  /** Les traces « peut contenir » — saisies ici depuis le 2026-09-22. */
  readonly mayContain = computed(() => this.declaration().mayContain);

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
   * La fiche a des visuels, et AUCUN n'a un usage publié : la boutique n'en
   * montrera aucun. Faux sur une fiche sans visuel — le vide de la grille le
   * dit déjà.
   */
  readonly noPublishedMedia = computed(
    () => this.media().length > 0 && !this.media().some((slot) => isPublishedMediaRole(slot.role)),
  );

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
   * déplace son URL publique, en laissant l'ancienne orpheline. Le commentaire prétendait empêcher exactement ce qu'il
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
  /**
   * **Les déclinaisons de la fiche**, telles que le serveur les a rendues.
   *
   * Elles ne servaient à rien : la page aplatissait la déclinaison par défaut
   * dans le produit et n'en éditait qu'une. Une fiche peut en avoir plusieurs,
   * et ce sont elles qui portent le prix, le poids et la fiche réglementaire.
   */
  private readonly variantsValue = signal<readonly Variant[]>([]);
  readonly variants: Signal<readonly Variant[]> = this.variantsValue;

  /**
   * **La filiation d'un détachement** (`plan-gestes-de-declinaison.md`, G2) :
   * d'où vient la fiche, et ce que ses déclinaisons archivées sont devenues.
   */
  private readonly lineageValue = signal<ProductLineageView>({ origin: null, detachedTo: {} });
  readonly lineage: Signal<ProductLineageView> = this.lineageValue;

  private readonly variantId = signal('');
  /** La déclinaison qu'on édite — le défaut à l'ouverture. */
  readonly selectedVariantId: Signal<string> = this.variantId;

  /**
   * Les brouillons des déclinaisons qu'on a quittées **sans enregistrer**.
   *
   * Basculer d'un article à l'autre ne doit rien perdre : ce qui était tapé est
   * mis de côté ici, et rendu au retour. Sans cette mise de côté, il aurait
   * fallu soit bloquer la bascule sur une section modifiée — donc interdire de
   * comparer deux articles, ce qu'on vient précisément d'ouvrir — soit jeter la
   * saisie sans un mot.
   */
  private readonly drafts = new Map<string, VariantDraft>();
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
   * Le prix **de départ** d'un contexte, avant son taux.
   *
   * C'est le prix public partout — sauf pour le contexte professionnel, qui ne
   * vend pas au prix public : il vend au prix pro saisi. Sans cette
   * distinction, l'écran affichait DEUX hors taxe B2B différents, l'un sous le
   * prix pro et l'autre dans le tableau, et rien ne disait lequel serait
   * facturé.
   */
  private basePriceEurFor(contextKey: string): number | null {
    const priceEur = this.priceEur();
    if (contextKey !== PRO_CONTEXT_KEY || priceEur === null) {
      return priceEur;
    }
    const proCents = this.proPrice()?.ttcCents ?? null;
    // En EUROS, comme son nom le dit. Sans saisie ni taux, on rend le prix
    // public : cette fonction sert d'assiette à un affichage, et `null` y
    // ferait disparaître une ligne plutôt que de la dire.
    return proCents === null ? priceEur : proCents / 100;
  }

  readonly proPricing = computed<ProPricing | null>(() => {
    // Sans prix public, la section ne dit rien du prix pro : la ligne qui
    // manque est celle du prix public.
    if (this.priceEur() === null) {
      return null;
    }
    const price = this.proPrice();
    // Sans saisie — ou sans taux pro, que le canal exige aussi pour facturer —
    // il n'y a pas de prix pro. Montrer le TTC public ici laisserait croire
    // à un prix pro.
    return price === null
      ? null
      : {
          ttc: euros(price.ttcCents),
          // La SAISIE, qui fait foi — le TTC n'en est que l'affichage, et
          // personne n'en redérive un HT.
          ht: euros(Math.round(price.htMillicents / MILLICENTS_PER_CENT)),
        };
  });

  /**
   * La ligne B2B du tableau montre la SAISIE, au centime d'affichage — jamais
   * un HT redérivé du TTC pro, qui perdrait les décimales saisies (lot P, « le
   * HT fait foi »).
   */
  private enteredCounterpart(): DerivedAmount | null {
    const ht = this.proPriceMillicents();
    return ht === null
      ? null
      : { label: 'HT', amount: euros(Math.round(ht / MILLICENTS_PER_CENT)) };
  }

  /**
   * Le prix pro saisi, par la porte que le fil emprunte (`proPriceOf`) —
   * `null` sans saisie ou sans taux pro.
   */
  private proPrice(): ProPrice | null {
    return proPriceOf(this.percentOf(PRO_CONTEXT_KEY) ?? null, this.proPriceMillicents());
  }

  private readonly selectedCategory = computed<Category | undefined>(() =>
    this.categories().find((c) => c.id === this.categoryId()),
  );

  /** L'audience de la famille — ce dont la fiche hérite. `null` tant qu'elle n'est pas chargée. */
  readonly familyAudience = computed<OperationAudience | null>(
    () => this.selectedCategory()?.audience ?? null,
  );

  /**
   * Les taux de la FAMILLE du produit, par contexte — l'héritage nu, sans la
   * dérogation. Le panneau en a besoin pour nommer ce à quoi « hériter » vaut :
   * proposer « revenir au défaut » sans dire lequel, c'est choisir à l'aveugle.
   */
  readonly familyVat = computed<Readonly<Record<string, string>>>(
    () => this.selectedCategory()?.vatByContext ?? {},
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
    const rateIdOf = (contextKey: string): string | undefined =>
      override[contextKey] ?? category.vatByContext[contextKey];
    const rateOf = (contextKey: string): RateView | null => viewOf(rateIdOf(contextKey));
    const counterpartFor = (contextKey: string): DerivedAmount | null =>
      contextKey === PRO_CONTEXT_KEY
        ? this.enteredCounterpart()
        : counterpartOf(this.basePriceEurFor(contextKey), this.percentOf(contextKey));
    return {
      categoryName: category.name.fr,
      // UNE ligne par contexte du registre : un contexte de plus en base est une
      // ligne de plus ici, sans livrer de front.
      channels: this.orderedContexts().map((context) => ({
        key: context.key,
        label: context.label,
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
  private readonly allergenBuckets = computed(() => bucketsOf(this.entries()));

  /** Les catégories qui groupent vraiment — elles seules méritent une boîte. */
  readonly groups = computed(() => groupsOf(this.allergenBuckets()));

  /** Les autres, à plat, sous leur libellé d'étiquette. */
  readonly singleAllergens = computed(() => singlesOf(this.allergenBuckets()));

  /**
   * Les allergènes cités par la composition et **absents de la déclaration en
   * cours** — la proposition, pas une vérification.
   *
   * Elle se calcule sur `selected()`, l'état à l'écran, et non sur ce qui est
   * enregistré : cocher une case doit faire disparaître la ligne tout de suite,
   * sinon l'encart reproche encore ce qu'on vient de corriger.
   *
   * Les codes hors de la portée affichée sont nommés par le référentiel monde
   * (`citedReference`) : la portée « UE » ne connaît pas le sarrasin, et le
   * taire faisait s'ouvrir l'encart de contradiction sur une liste vide.
   */
  readonly citedNotDeclared = computed(() =>
    citedNotDeclaredIn(
      this.citedAllergens(),
      new Set(this.selected()),
      mergedEntries(this.entries(), this.citedReference()),
    ),
  );

  /**
   * La composition contredit-elle un « aucun allergène » ?
   *
   * Quelqu'un a affirmé qu'il n'y en avait aucun, et la fiche cite un
   * ingrédient qui en porte un. Plus un refus depuis le 2026-10-27 (règle A de
   * `plan-allergenes-jamais-bloquants.md`) : l'état servi ajoute ce qui est
   * cité, et l'encart le dit dans ses propres mots.
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
    const contradicts = this.citedContradictsNone();
    this.declaration.update((current) =>
      // La contradiction se lève même quand rien n'est reprenable : la
      // composition peut citer un code que la portée courante n'expose pas, et
      // laisser « aucun allergène » coché le démentirait quand même.
      withCitedAdopted(contradicts ? withNoAllergen(current, false) : current, missing),
    );
    // Un code repris hors de la portée affichée doit SE VOIR coché : sans
    // bascule, le sarrasin serait déclaré sans case à l'écran pour le décocher.
    const shown = new Set(this.entries().map((entry) => entry.code));
    if (missing.some((code) => !shown.has(code))) {
      void this.changeScope('world');
    }
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
        // `value[2]` portait la matrice des canaux, partie en X4 : la place
        // reste, pour qu'un brouillon d'avant se relise sans décalage.
        this.proPriceHtText.set(String(value[4] ?? ''));
        this.publicPricePerKgEur.set((value[5] as number | null | undefined) ?? null);
        this.proPricePerKgHtText.set(String(value[6] ?? ''));
        this.saleUnit.set(value[7] === 'weight' ? 'weight' : 'piece');
        this.weightStepGrams.set((value[8] as number | null | undefined) ?? null);
        this.weightMinGrams.set((value[9] as number | null | undefined) ?? null);
        return;
      case 'allergenes':
        this.declaration.set({
          allergens: value[0] as readonly string[] | null,
          mayContain: value[1] as readonly string[],
        });
        this.allergensAligned.set(Boolean(value[2]));
        return;
      case 'nutrition':
        this.nutrition.set(value[0] as NutritionValues);
        this.weightGrams.set(value[1] as number | null);
        this.nutritionAligned.set(Boolean(value[2]));
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
    this.declaration.update((current) => withAllergen(current, code, on));
  }

  /**
   * Pose les **traces** — « peut contenir », la liste entière.
   *
   * Le même référentiel que la présence, et exclusif d'elle : le serveur refuse
   * un code déclaré des deux côtés (`OverlappingAllergensError`). Le contrôle
   * ne propose donc que ce qui n'est pas déjà présent, et le modèle retire ce
   * qui le deviendrait — le 400 n'est pas traduit, il est rendu inatteignable.
   */
  setTraces(codes: readonly string[]): void {
    this.declaration.update((current) => withTraces(current, codes));
  }

  /**
   * Ce qu'on peut déclarer en **trace** : le référentiel, moins ce qui est déjà
   * déclaré présent. La règle et son pourquoi vivent dans `allergen-choices.ts`.
   */
  readonly traceChoices = computed(() =>
    traceOptionsOf(this.allergenBuckets(), new Set(this.selected())),
  );

  declareNoAllergen(on: boolean): void {
    this.declaration.update((current) => withNoAllergen(current, on));
  }

  /*
   * 🔴 **Le dépôt a quitté la fiche le 2026-09-23.** `uploadMedia` vivait ici
   * et faisait entrer des octets par un produit ; la bibliothèque est un bloc
   * à part, et une fiche ne fait que RATTACHER une URL. Le panneau de
   * médiathèque porte le geste — voir `addFromLibrary`, seule entrée restante.
   */

  /**
   * Les images de la fiche, UNE fois chacune, avec tous leurs usages.
   *
   * 🔴 `media` reste la liste PLATE (une entrée par couple image × usage) : c'est
   * la forme du serveur, de l'instantané de section et du brouillon rangé. La
   * galerie lit ce regroupement, recalculé — jamais une seconde source.
   */
  readonly mediaImages = computed(() => groupMediaByImage(this.media()));

  /** Les images décochées de partout : elles ne s'enregistreront pas, et l'écran le dit. */
  readonly unassignedMedia = computed(() =>
    this.mediaImages().filter((image) => image.roles.length === 0),
  );

  /** Retire une image de la fiche, tous usages compris — pas de la bibliothèque. */
  removeMediaImage(url: string): void {
    this.media.update((current) => current.filter((slot) => slot.url !== url));
  }

  /**
   * Donne à une image EXACTEMENT ces usages (cf. `withMediaRoles`).
   *
   * 🔴 Depuis le 2026-10-18, une image porte plusieurs usages. L'unicité de
   * l'ouverture et de la vignette appartient au verbe : les cocher ici les
   * retire de l'image qui les portait, dans la même mise à jour.
   */
  setMediaRoles(url: string, roles: readonly string[]): void {
    this.media.update((current) =>
      flattenMediaImages(withMediaRoles(groupMediaByImage(current), url, roles)),
    );
  }

  /**
   * Ajoute des images de la **bibliothèque** à la liste de la fiche.
   *
   * Aucun dépôt : ces octets sont déjà chez nous. C'est le renversement du
   * modèle — on tague à la source, on attribue à l'usage.
   *
   * 🔴 Les URL **déjà présentes sont ignorées**, silencieusement. Une même image
   * deux fois dans la même fiche n'a pas de sens, et le serveur refuserait de
   * toute façon un second `hero` — mais l'écran ne doit pas laisser produire la
   * situation pour la voir refusée ensuite.
   */
  addFromLibrary(picked: readonly PickedMedia[]): void {
    this.media.update((current) => {
      const known = new Set(current.map((slot) => slot.url));
      const added = picked
        .filter((image) => !known.has(image.url))
        .map((image) => ({
          role: DEFAULT_MEDIA_ROLE,
          name: image.name,
          url: image.url,
          // Mesurés par la bibliothèque, transportés jusqu'ici : sans eux la
          // galerie dirait « Dimensions inconnues » d'une image qu'on vient de
          // rattacher, jusqu'au prochain rechargement.
          width: image.width,
          height: image.height,
        }));
      return [...current, ...added];
    });
  }

  /*
   * 🔴 **L'étiquette et le texte alternatif ont quitté la fiche le
   * 2026-09-23.** Ils décrivent l'IMAGE, pas l'emploi qu'une fiche en fait, et
   * une image est partagée : corriger une faute d'alternative depuis une fiche
   * changeait silencieusement ce qu'une autre affichait.
   *
   * Toute la machinerie qui vivait ici — langue en cours d'édition, écriture
   * par langue, langues manquantes par visuel et pour la section — est partie
   * avec eux. Elle ne se recopie pas : elle appartient à la médiathèque, qui
   * est le seul point où ces deux champs s'écrivent désormais.
   *
   * Ce que la fiche décide encore d'un visuel : son USAGE et son RANG.
   */

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
      const declaration = this.declaration();
      const declares = hasDeclared(declaration);
      const created = await this.api.createProduct({
        name: this.nameText(),
        kind: this.kind(),
        categoryId: this.categoryId(),
        ...(declares ? { allergens: [...this.selected()] } : {}),
        // Les traces partent AVEC, même quand personne n'a déclaré de présence :
        // les taire à la création serait le bug 0a déplacé d'un écran.
        ...(declaration.mayContain.length === 0 ? {} : { mayContain: [...declaration.mayContain] }),
        ...(price === null ? {} : { priceEur: price }),
        ...(weight === null ? {} : { weightGrams: weight }),
        ...(description === '' ? {} : { descriptionFr: description }),
      });
      // Les photos n'existent que dans le brouillon de l'écran : la route de
      // création ne les porte pas, et la page suivante relit la fiche au
      // serveur. Sans cet envoi, elles disparaissaient à la navigation
      // (signalé par Hugo le 2026-10-16). Même geste « Créer », jamais avant.
      await this.saveCreatedMedia(created.id);
      return created.id;
    } catch (caught) {
      this.error.set(messageOf(caught));
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Enregistre les photos choisies avant la création, sur la fiche qui vient
   * de naître.
   *
   * Un échec ici ne remonte PAS comme un échec de création : la fiche existe,
   * et rendre `null` laisserait l'écran de création ouvert — un second clic
   * sur « Créer » ferait un doublon. La page navigue donc quand même, et le
   * refus est rangé hors de ce store (qui meurt avec la page) pour que la
   * fiche créée l'affiche et propose de le renvoyer.
   */
  private async saveCreatedMedia(id: string): Promise<void> {
    const media = persistedMedia(this.media());
    if (media.length === 0) {
      return;
    }
    try {
      await this.products.saveMedia(id, media);
    } catch (caught) {
      this.pendingCreatedMedia.record(id, { slots: [...media], message: messageOf(caught) });
    }
  }

  /** Les photos de la création que le serveur a refusées, pour CETTE fiche. */
  readonly createdMediaFailure: Signal<CreatedMediaFailure | null> = computed(() =>
    this.isEdit() ? this.pendingCreatedMedia.of(this.productId()) : null,
  );

  readonly retryingCreatedMedia = signal(false);

  /**
   * Renvoie les photos refusées à la création.
   *
   * La route remplace la liste entière : les photos déjà sur la fiche sont donc
   * renvoyées avec, et une photo déjà présente (même URL) n'est pas doublée.
   */
  async retryCreatedMedia(): Promise<void> {
    const id = this.productId();
    const failure = this.pendingCreatedMedia.of(id);
    if (failure === null || this.retryingCreatedMedia()) {
      return;
    }
    const current = this.media();
    const missing = failure.slots.filter((slot) => !current.some((kept) => kept.url === slot.url));
    const merged = [...current, ...missing];
    this.retryingCreatedMedia.set(true);
    try {
      await this.products.saveMedia(id, persistedMedia(merged));
      this.media.set(merged);
      this.baseline.update((base) => ({ ...base, visuels: this.snapshot('visuels') }));
      this.pendingCreatedMedia.clear(id);
    } catch (caught) {
      this.pendingCreatedMedia.record(id, { slots: failure.slots, message: messageOf(caught) });
    } finally {
      this.retryingCreatedMedia.set(false);
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
      // L'alignement PART EN PREMIER, et il décide du reste — même règle que
      // sur la fiche réglementaire : aligner puis écrire un prix laisserait un
      // montant propre sur une déclinaison qui n'en porte plus, et le prochain
      // désalignement le ferait réapparaître sans que personne l'ait décidé.
      if (!this.editingDefault()) {
        await this.products.alignVariant(
          this.productId(),
          this.variantId(),
          'pricing',
          this.pricingAligned(),
        );
      }
      if (!this.pricingAligned()) {
        await this.saveVariantFacts();
      }
      // Le prix et son régime partent ENSEMBLE : ils sont dans la même section,
      // et enregistrer l'un sans l'autre laisserait l'écran vert sur une moitié
      // de décision.
      await this.products.saveVat(this.productId(), this.vatOverride());
      // Corriger le tarif du DÉFAUT change ce que voient celles qui le suivent.
      if (this.editingDefault()) {
        await this.reloadVariants();
      }
    });
  }

  /**
   * Section **Allergènes** — les codes présents et les traces, rien d'autre.
   *
   * Elle n'envoie plus une valeur nutritionnelle, et c'est tout l'objet du
   * chantier : une requête qui remplaçait la fiche entière effaçait ce qu'elle
   * ne renvoyait pas (bugs 0a et 0c). Les traces partent d'ici parce qu'elles
   * sont des allergènes.
   */
  saveAllergens(): Promise<void> {
    // 🔴 `[]` est une AFFIRMATION — « aucun allergène ». L'envoyer quand personne
    // ne s'est prononcé la FABRIQUE : la fiche deviendrait publiable sur un
    // silence. Le tri-état rend cette confusion inexprimable dans l'état ; il
    // reste à refuser l'ENVOI, parce que `allergens` est requis par le contrat
    // et que l'omettre vaudrait un 400 muet.
    //
    // Le refus se pose ICI plutôt qu'en exception : `messageOf` ne sait lire
    // qu'une erreur HTTP, et une `Error` nue y devient « Erreur inattendue. »,
    // qui ne dit pas le geste.
    if (!this.allergensAligned() && !hasDeclared(this.declaration())) {
      this.statusMap.update((current) => ({ ...current, allergenes: 'error' }));
      this.error.set(
        'Déclarez les allergènes avant d’enregistrer : cochez « aucun allergène » ou ' +
          'sélectionnez-en. Enregistrer sans rien affirmerait que la fiche n’en contient aucun.',
      );
      return Promise.resolve();
    }
    return this.save('allergenes', async () => {
      // L'alignement PART EN PREMIER, et il décide du reste. Aligner puis
      // déclarer écrirait une fiche propre sur une déclinaison qui n'en porte
      // plus — une donnée réglementaire orpheline, que le prochain
      // désalignement ferait réapparaître sans que personne l'ait écrite.
      if (!this.editingDefault()) {
        await this.products.alignVariant(
          this.productId(),
          this.variantId(),
          'allergens',
          this.allergensAligned(),
        );
      }
      if (!this.allergensAligned()) {
        const declaration = this.declaration();
        await this.products.saveVariantAllergens(this.productId(), this.variantId(), {
          allergens: declaration.allergens ?? [],
          mayContain: declaration.mayContain,
        });
      }
      // Corriger la déclaration du DÉFAUT change ce que voient toutes celles qui
      // le suivent. On relit donc la liste — et seulement elle : c'est le
      // serveur qui résout l'héritage, et le refaire ici en donnerait une
      // seconde version, qui finirait par diverger.
      if (this.editingDefault()) {
        await this.reloadVariants();
      }
    });
  }

  /**
   * Section **Valeurs nutritionnelles** — les sept valeurs de l'annexe XV,
   * l'indice glycémique, et le poids net qui les rend lisibles.
   *
   * ⚠️ Aucun code d'allergène ne part d'ici, et la route le REFUSE (400) : sur
   * du réglementaire, un `200` qui n'écrit rien est pire qu'un refus (§7 du
   * plan). Rien à enregistrer côté allergènes n'empêche d'enregistrer ici —
   * c'est le sens de la scission.
   */
  saveNutrition(): Promise<void> {
    return this.save('nutrition', async () => {
      if (!this.editingDefault()) {
        await this.products.alignVariant(
          this.productId(),
          this.variantId(),
          'nutrition',
          this.nutritionAligned(),
        );
      }
      if (!this.nutritionAligned()) {
        await this.products.saveVariantNutrition(
          this.productId(),
          this.variantId(),
          this.nutrition(),
        );
      }
      // Le poids voyage par la route du TARIF, qui porte prix ET poids sur la
      // déclinaison — c'est donc le drapeau du TARIF qui décide, pas celui de
      // la nutrition. Les deux valeurs partent à chaque fois : la section qui
      // n'a pas bougé renvoie ce qu'elle avait, rien ne se perd. Sauf quand le
      // tarif est HÉRITÉ — écrire alors poserait un prix propre que personne
      // n'a saisi, et détacherait la déclinaison sans qu'on l'ait demandé.
      if (!this.pricingAligned()) {
        await this.saveVariantFacts();
      }
      if (this.editingDefault()) {
        await this.reloadVariants();
      }
    });
  }

  /**
   * Relit les déclinaisons **sans toucher à ce qui est à l'écran**.
   *
   * Ni les brouillons des autres articles, ni les lignes de base : une saisie en
   * cours ailleurs n'a pas à disparaître parce qu'on vient d'enregistrer ici.
   * Publique : la carte de quantité minimale, qui écrit sur sa propre route,
   * relit par là.
   */
  async reloadVariants(): Promise<void> {
    const detail = await this.products.getDetail(this.productId());
    if (detail !== null) {
      this.variantsValue.set(detail.product.variants);
    }
  }

  /** Prix + poids de la déclinaison — une route, deux sections qui l'appellent. */
  private saveVariantFacts(): Promise<void> {
    const price = this.priceEur();
    const weight = this.weightGrams();
    const perKg = this.publicPricePerKgEur();
    const unit = this.saleUnit();
    return this.products.savePricing(this.productId(), this.variantId(), {
      // Un prix public TTC — la seule assiette. Le hors taxe se déduit du taux
      // de chaque canal, il ne s'enregistre pas.
      priceCents: price === null ? null : Math.round(price * 100),
      weightGrams: weight === null ? null : Math.round(weight),
      // Le prix pro HT part en TEXTE, tel que saisi : le serveur le lit et
      // refuse une sixième décimale (lot P).
      proPriceHt: proPricePayloadOf(this.proPriceHtText()),
      // Les prix au kilo saisis (K4) : informatifs, sous la même forme que
      // leurs voisins — centimes pour le public, texte pour le pro.
      publicPricePerKgTtcCents: perKg === null ? null : Math.round(perKg * 100),
      proPricePerKgHt: proPricePayloadOf(this.proPricePerKgHtText()),
      // L'unité et ses grammes (P1) partent toujours : le serveur refuse un
      // changement d'unité sur une déclinaison déjà publiée, pas sa répétition.
      // À la pièce, le pas et le minimum n'ont pas d'objet.
      saleUnit: unit,
      weightStepGrams: unit === 'weight' ? gramsOf(this.weightStepGrams()) : null,
      weightMinGrams: unit === 'weight' ? gramsOf(this.weightMinGrams()) : null,
    });
  }

  /** Section Visuels — la liste entière, dans son ordre : c'est un remplacement. */
  saveMedia(): Promise<void> {
    return this.save('visuels', () =>
      this.products.saveMedia(this.productId(), persistedMedia(this.media())),
    );
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
   * **Retirer la signature** — une déclaration posée par erreur se défait
   * (décision de Hugo, 2026-10-26). Le statut ne bouge pas ; l'avertissement
   * de péremption tombe avec la signature qu'il commentait.
   */
  async withdrawReady(): Promise<void> {
    const id = this.productId();
    if (id === '' || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.products.withdrawReady(id);
      this.readinessValue.set(null);
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
    this.activationRefusal.set(null);
    try {
      await this.callLifecycle(id, gesture);
      await this.refreshLifecycle(id);
      if (gesture === 'publish') {
        await this.noticeIfPrecautionary(id);
      }
    } catch (caught) {
      const refusal = activationRefusalOf(caught);
      if (refusal === null) {
        this.error.set(messageOf(caught));
      } else {
        this.activationRefusal.set(refusal);
      }
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Publiée sans déclaration d'allergènes : un toast d'information, qui ne
   * demande rien (`plan-allergenes-jamais-bloquants.md`, §2). Lu sur le
   * constat du serveur, jamais recalculé ; une lecture en échec se tait — la
   * publication, elle, a réussi.
   */
  private async noticeIfPrecautionary(id: string): Promise<void> {
    try {
      const views = await this.api.listComplianceWarnings();
      if (isPrecautionary(views.find((view) => view.productId === id)?.warnings)) {
        this.notify.info(PRECAUTIONARY_NOTICE);
      }
    } catch {
      // Le constat reste lisible dans la liste des produits.
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
  /**
   * **Les onglets de la barre**, prêts à rendre — le composant n'en dérive rien.
   *
   * Le libellé vient d'ici et pas du gabarit : c'est une règle de nommage, et
   * une règle dans un gabarit est une règle qu'aucun test unitaire n'atteint.
   * La règle elle-même vit dans `variant-label.ts`, avec sa raison d'être.
   *
   * `name` voyage à côté de `label` : le second peut être un repli (le rang,
   * quand le nom est vide), et un formulaire de renommage pré-rempli avec
   * « Déclinaison 2 » ferait enregistrer le repli comme s'il était un nom.
   */
  readonly variantTabs = computed(() =>
    // Une archivée n'est plus un onglet (`plan-gestes-de-declinaison.md`, G1) :
    // elle se liste à part, sous la barre ({@link archivedVariants}).
    this.variants()
      .filter((variant) => !variant.isDiscontinued)
      .map((variant) => ({
        id: variant.id,
        label: variantTabLabel(variant),
        /** Le LIBELLÉ brut, pour le formulaire de renommage — celui de l'onglet peut être un repli. */
        name: variant.internalLabel,
        sku: variant.sku,
        isDefault: variant.isDefault,
        selected: variant.id === this.variantId(),
      })),
  );

  /**
   * **Les déclinaisons archivées**, listées à part sous la barre — chacune avec
   * le produit qu'elle est devenue si elle a été détachée (et alors sans
   * « Désarchiver » : le serveur le refuserait).
   */
  readonly archivedVariants = computed(() =>
    this.variants()
      .filter((variant) => variant.isDiscontinued)
      .map((variant) => ({
        id: variant.id,
        label: variantTabLabel(variant),
        sku: variant.sku,
        detachedTo: this.lineageValue().detachedTo[variant.id] ?? null,
      })),
  );

  /** La déclinaison éditée est-elle celle par défaut ? */
  readonly editingDefault = computed(
    () => this.variants().find((variant) => variant.id === this.variantId())?.isDefault ?? true,
  );

  /**
   * Cette section appartient-elle à la FICHE, donc verrouillée sur une autre
   * déclinaison que le défaut ?
   *
   * La réponse est ici parce qu'elle vient du MODÈLE : identité, communication
   * et visuels sont portées par le produit, une déclinaison ne peut pas en
   * diverger. Une case à cocher sur ces cartes-là promettrait une divergence que
   * la base refuse.
   */
  readonly lockedSections: Signal<ReadonlySet<FormSection>> = computed(() =>
    this.editingDefault()
      ? new Set<FormSection>()
      : new Set<FormSection>(['identite', 'communication', 'visuels']),
  );

  /**
   * La case « aligner sur le défaut » de la carte **Allergènes**.
   *
   * Elle fait partie du brouillon de la déclinaison, pas d'un réglage à part :
   * décocher ouvre la saisie, et ce qu'on tape ensuite part avec elle au même
   * enregistrement.
   *
   * ⚠️ Côté serveur, c'est toujours la colonne `regulatory_follows_default` qui
   * la porte : elle garde son nom et devient le drapeau des allergènes (§6d du
   * plan). Le nom ment un peu, l'aspect envoyé ne ment pas.
   */
  readonly allergensAligned = signal(false);

  /**
   * La même case, sur la carte **Valeurs nutritionnelles**.
   *
   * Deux cases et pas une, parce que les deux moitiés s'enregistrent
   * séparément : saisir un tableau nutritionnel propre à une déclinaison ne
   * doit pas l'obliger à retaper les allergènes du défaut, ni l'inverse (D1).
   */
  readonly nutritionAligned = signal(false);

  /** La même case, sur la carte « Tarif & TVA » — prix ET poids ensemble. */
  readonly pricingAligned = signal(false);

  /**
   * La ligne à rendre sous l'en-tête de CHAQUE carte, prête à afficher.
   *
   * Une carte n'a pas à savoir si elle est alignable : elle demande sa ligne et
   * la rend. Ce qui suit le défaut, ce qui appartient à la fiche et ce qui n'a
   * rien à dire sont trois faits du modèle, pas trois conditions de gabarit.
   */
  readonly alignments: Signal<ReadonlyMap<FormSection, SectionAlignment>> = computed(() => {
    const rows = new Map<FormSection, SectionAlignment>();
    for (const section of SAVEABLE) {
      rows.set(section.key, this.alignmentOf(section.key));
    }
    return rows;
  });

  /** Bascule la case d'une carte — l'écran ne connaît que sa section. */
  setAlignment(section: FormSection, aligned: boolean): void {
    const aspect = ALIGNABLE[section];
    if (aspect !== undefined) {
      this.alignedSignal(aspect).set(aligned);
    }
  }

  /**
   * Le drapeau d'un aspect. Un `switch` exhaustif et non un ternaire : trois
   * aspects se lisent mal en cascade, et la valeur `"regulatory"` — que plus
   * rien n'envoie — doit échouer à la compilation le jour où elle reviendrait.
   */
  private alignedSignal(aspect: VariantAspect): WritableSignal<boolean> {
    switch (aspect) {
      case 'pricing':
        return this.pricingAligned;
      case 'nutrition':
        return this.nutritionAligned;
      case 'allergens':
      case 'regulatory':
        return this.allergensAligned;
    }
  }

  private alignmentOf(section: FormSection): SectionAlignment {
    if (this.editingDefault()) {
      return { kind: 'none' };
    }
    const aspect = ALIGNABLE[section];
    if (aspect === undefined) {
      return { kind: 'product' };
    }
    return { kind: 'alignable', aspect, aligned: this.alignedSignal(aspect)() };
  }

  /**
   * Bascule sur une autre déclinaison — **sans rien perdre**.
   *
   * Ce qui était tapé est mis de côté, ce que l'autre avait est rendu, et les
   * lignes de base des deux sections qui appartiennent à un article sont
   * reprises : sans elles, l'écran annoncerait « modifié » sur une saisie qu'on
   * vient seulement d'afficher.
   */
  selectVariant(id: string): void {
    if (id === this.variantId() || !this.variants().some((variant) => variant.id === id)) {
      return;
    }
    this.drafts.set(this.variantId(), this.currentDraft());
    this.variantId.set(id);
    this.applyDraft(this.drafts.get(id) ?? this.draftOf(id));
    this.rebaseVariantSections();
  }

  /**
   * Ajoute une déclinaison, puis l'ouvre.
   *
   * Le serveur décide de sa référence, de son rang et de son alignement — d'où
   * une relecture complète plutôt qu'une ligne peinte d'avance : trois valeurs
   * inventées ici seraient trois occasions de mentir.
   */
  async addVariant(name: string): Promise<void> {
    const id = this.productId();
    if (id === '' || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const created = await this.products.addVariant(id, { [SOURCE_LOCALE]: name.trim() });
      await this.hydrate(id);
      this.selectVariant(created);
    } catch (caught) {
      this.error.set(messageOf(caught));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * **Rebaptise une déclinaison**, celle qu'on désigne — pas forcément celle
   * qu'on édite.
   *
   * Son libellé INTERNE seulement (`plan-identite-de-declinaison.md`, I5) : le
   * nom de boutique se change dans la carte « Identité de la déclinaison ».
   * Relecture complète après coup, comme pour l'ajout : peindre l'onglet
   * d'avance ferait croire à un enregistrement que le serveur peut refuser.
   */
  async renameVariant(variantId: string, name: string): Promise<void> {
    const id = this.productId();
    const trimmed = name.trim();
    if (id === '' || trimmed === '' || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.products.renameVariant(id, variantId, trimmed);
      await this.hydrate(id);
    } catch (caught) {
      this.error.set(messageOf(caught));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * **Le nom de boutique enregistré** par la carte « Identité de la
   * déclinaison » (`plan-identite-de-declinaison.md`, § 3) — posé sur la
   * déclinaison SANS relire la fiche : une relecture effacerait les brouillons
   * des autres cartes, que cette carte n'enregistre pas. L'onglet ne change pas,
   * il lit le libellé interne.
   */
  acceptVariantShopName(variantId: string, name: LocalizedText): void {
    this.variantsValue.update((variants) =>
      variants.map((variant) => (variant.id === variantId ? { ...variant, name } : variant)),
    );
  }

  /** **Archive une déclinaison** — puis relit : l'onglet disparaît, la liste à part la montre. */
  discontinueVariant(variantId: string): Promise<boolean> {
    return this.runVariantGesture((id) => this.products.discontinueVariant(id, variantId));
  }

  /**
   * **En fait la déclinaison par défaut** — puis relit : l'onglet reste ouvert,
   * il porte désormais la fiche (G4).
   */
  makeVariantDefault(variantId: string): Promise<boolean> {
    return this.runVariantGesture((id) => this.products.makeVariantDefault(id, variantId));
  }

  /** **La désarchive** — elle redevient un onglet, à son rang. */
  restoreVariant(variantId: string): Promise<boolean> {
    return this.runVariantGesture((id) => this.products.restoreVariant(id, variantId));
  }

  /**
   * **En fait un produit** — rend l'id de la nouvelle fiche, que la page ouvre,
   * ou `null` si le serveur a refusé (le message est déjà affiché).
   */
  async detachVariant(variantId: string): Promise<string | null> {
    let born: string | null = null;
    await this.runVariantGesture(async (id) => {
      born = await this.products.detachVariant(id, variantId);
    });
    return born;
  }

  /**
   * Le cadre des trois gestes : un à la fois, l'erreur affichée, puis une
   * relecture complète — rien n'est peint d'avance, le serveur décide.
   */
  private async runVariantGesture(gesture: (productId: string) => Promise<void>): Promise<boolean> {
    const id = this.productId();
    if (id === '' || this.busy()) {
      return false;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await gesture(id);
      await this.hydrate(id);
      return true;
    } catch (caught) {
      this.error.set(messageOf(caught));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  saveOne(key: FormSection): Promise<void> {
    switch (key) {
      case 'identite':
        return this.saveIdentity();
      case 'tarif':
        return this.savePricing();
      case 'allergenes':
        return this.saveAllergens();
      case 'nutrition':
        return this.saveNutrition();
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
        // La case « aligner » EST une modification de la section : sans elle,
        // elle bascule et le bouton d'enregistrement n'apparaît pas.
        return JSON.stringify([
          this.priceEur(),
          this.vatOverride(),
          // L'ancienne place de la matrice des canaux (partie en X4) : gardée
          // vide pour que les positions lues par la restauration ne bougent pas.
          null,
          this.pricingAligned(),
          // Le prix pro HT (lot P) : une saisie qui bouge EST une modification
          // de la section, sans quoi le bouton d'enregistrement n'apparaît pas.
          this.proPriceHtText(),
          // Les prix au kilo saisis (K4), à la suite : les positions d'avant
          // ne bougent pas.
          this.publicPricePerKgEur(),
          this.proPricePerKgHtText(),
          // L'unité de vente et ses grammes (P1), à la suite.
          this.saleUnit(),
          this.weightStepGrams(),
          this.weightMinGrams(),
        ]);
      case 'allergenes': {
        const declaration = this.declaration();
        // `null` et `[]` ne se confondent pas ici non plus : passer du silence à
        // « aucun allergène » EST une modification, et c'est la plus lourde de
        // la section.
        return JSON.stringify([
          declaration.allergens === null ? null : [...declaration.allergens].sort(),
          [...declaration.mayContain].sort(),
          // Cocher « aligner sur le défaut » EST une modification de la section :
          // sans lui, la case bascule et le bouton d'enregistrement n'apparaît
          // pas — donc la case ne fait rien, et rien ne le dit.
          this.allergensAligned(),
        ]);
      }
      case 'nutrition':
        // Le poids net est de CETTE section : la grille est « pour 100 g », et
        // sans lui elle ne dit rien de ce qu'on vend.
        return JSON.stringify([this.nutrition(), this.weightGrams(), this.nutritionAligned()]);
      case 'communication':
        return JSON.stringify(this.editorial());
      case 'visuels':
        // L'ORDRE compte autant que le contenu : réordonner deux images est une
        // modification, et un instantané insensible à l'ordre l'ignorerait.
        return JSON.stringify(this.media());
    }
  }

  /** Ce qui est à l'écran, mis en forme de brouillon. */
  private currentDraft(): VariantDraft {
    return {
      priceEur: this.priceEur(),
      weightGrams: this.weightGrams(),
      proPriceHtText: this.proPriceHtText(),
      publicPricePerKgEur: this.publicPricePerKgEur(),
      proPricePerKgHtText: this.proPricePerKgHtText(),
      saleUnit: this.saleUnit(),
      weightStepGrams: this.weightStepGrams(),
      weightMinGrams: this.weightMinGrams(),
      declaration: this.declaration(),
      nutrition: this.nutrition(),
      allergensAligned: this.allergensAligned(),
      nutritionAligned: this.nutritionAligned(),
      pricingAligned: this.pricingAligned(),
    };
  }

  /** Ce que le SERVEUR porte pour cette déclinaison — l'état sans brouillon. */
  private draftOf(variantId: string): VariantDraft {
    const variant = this.variants().find((candidate) => candidate.id === variantId);
    const allergens = variant?.allergens ?? null;
    return {
      priceEur:
        variant?.priceCents === undefined || variant.priceCents === null
          ? null
          : variant.priceCents / 100,
      weightGrams: variant?.weightGrams ?? null,
      proPriceHtText: proPriceTextOf(variant?.proPriceMillicents ?? null),
      publicPricePerKgEur:
        variant?.publicPricePerKgTtcCents === undefined || variant.publicPricePerKgTtcCents === null
          ? null
          : variant.publicPricePerKgTtcCents / 100,
      proPricePerKgHtText: proPriceTextOf(variant?.proPricePerKgMillicents ?? null),
      saleUnit: variant?.saleUnit ?? 'piece',
      weightStepGrams: variant?.weightStepGrams ?? null,
      weightMinGrams: variant?.weightMinGrams ?? null,
      // `[]` est une AFFIRMATION (« aucun allergène »), `null` une absence de
      // réponse. Les confondre transformerait un oubli de saisie en promesse —
      // et le serveur rend déjà les deux, c'est l'écran qui les aplatissait.
      declaration: {
        allergens: allergens === null ? null : [...allergens],
        mayContain: [...(variant?.mayContain ?? [])],
      },
      nutrition: variant?.nutrition ?? EMPTY_NUTRITION,
      allergensAligned: variant?.regulatoryFollowsDefault ?? false,
      nutritionAligned: variant?.nutritionFollowsDefault ?? false,
      pricingAligned: variant?.pricingFollowsDefault ?? false,
    };
  }

  private applyDraft(draft: VariantDraft): void {
    this.priceEur.set(draft.priceEur);
    this.weightGrams.set(draft.weightGrams);
    this.proPriceHtText.set(draft.proPriceHtText);
    this.publicPricePerKgEur.set(draft.publicPricePerKgEur);
    this.proPricePerKgHtText.set(draft.proPricePerKgHtText);
    this.saleUnit.set(draft.saleUnit);
    this.weightStepGrams.set(draft.weightStepGrams);
    this.weightMinGrams.set(draft.weightMinGrams);
    this.declaration.set(draft.declaration);
    this.nutrition.set(draft.nutrition);
    this.allergensAligned.set(draft.allergensAligned);
    this.nutritionAligned.set(draft.nutritionAligned);
    this.pricingAligned.set(draft.pricingAligned);
  }

  /**
   * Reprend la ligne de base des SEULES sections qui appartiennent à un article.
   *
   * Reprendre tout effacerait, en changeant d'onglet, une modification en cours
   * sur l'identité ou la communication — qui, elles, sont portées par la fiche
   * et n'ont pas bougé.
   */
  private rebaseVariantSections(): void {
    this.baseline.update((base) => ({
      ...base,
      tarif: this.snapshot('tarif'),
      allergenes: this.snapshot('allergenes'),
      nutrition: this.snapshot('nutrition'),
    }));
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
    // Les ARCHIVÉES ne comptent pas : l'en-tête dit ce que la fiche vend.
    this.variantCountValue.set(product.variants.filter((entry) => !entry.isDiscontinued).length);
    this.lineageValue.set(detail.lineage);
    this.nameText.set(product.name);
    this.kind.set(product.kind);
    this.categoryId.set(product.categoryId);
    // Le prix, le poids et la fiche réglementaire appartiennent à un ARTICLE :
    // ils se lisent sur la déclinaison ouverte, plus sur le produit aplati.
    this.vatOverride.set(product.vatByContext);
    this.operationOnly.set(product.operationOnly);
    this.requiresCold.set(product.requiresCold);
    this.variantsAsTiles.set(product.variantsAsTiles);
    this.audience.set(product.audience);

    this.editorial.set(detail.editorial);
    this.media.set([...detail.media]);
    this.readinessValue.set(detail.readiness);
    this.readinessStaleValue.set(detail.readinessStale);

    this.variantsValue.set(product.variants);
    // On garde la déclinaison ouverte si elle existe encore — une relecture
    // après enregistrement ne doit pas ramener l'écran sur le défaut.
    // Une archivée n'est plus un onglet : elle ne peut pas rester ouverte.
    const kept = product.variants.find(
      (entry) => entry.id === this.variantId() && !entry.isDiscontinued,
    );
    const variant =
      kept ?? product.variants.find((entry) => entry.isDefault) ?? product.variants[0];
    this.variantId.set(variant?.id ?? '');
    this.drafts.clear();
    // Les champs éditables de la déclinaison sont posés ENSEMBLE, par le même
    // chemin que la bascule d'onglet. Ils ne l'étaient pas : `[]` ne remettait
    // que `declaresNone`, une liste non vide ne remettait que `selected`. Une
    // seconde hydratation pouvait donc laisser « aucun allergène » coché
    // au-dessus d'une sélection non vide — et l'enregistrement aurait envoyé
    // `[]`, effaçant les allergènes déclarés sans un mot (audit 2026-09-01,
    // §13). Cette panne-là n'est plus exprimable : la déclaration est UN champ.
    this.applyDraft(this.draftOf(this.variantId()));
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
      const [cited, world] = await Promise.all([
        this.products.citedAllergens(id),
        this.reference.allergens('world'),
      ]);
      this.citedAllergensValue.set(cited);
      this.citedReference.set(world.entries);
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
/** Des grammes saisis, en entier — vide reste vide. */
function gramsOf(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function messageOf(caught: unknown): string {
  return httpErrorMessage(caught, 'Erreur inattendue.');
}
