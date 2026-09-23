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
  type ProductReadinessView,
  type VariantAspect,
} from '@lfd/pim-contracts';

import { MILLICENTS_PER_CENT } from '@lfd/money';

import { variantTabLabel } from './variant-label';
import {
  bucketsOf,
  citedNotDeclaredIn,
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
  Variant,
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
 * sans prétention d'usage. C'est {@link ProductFormStore.setMainVisual} qui
 * promeut, jamais le dépôt.
 *
 * 🔴 **Ce commentaire a affirmé le contraire jusqu'au 2026-09-23**, et il a
 * coûté une fonctionnalité entière. Il disait : « le premier déposé devenait
 * `hero`, ce qui affirmait une hiérarchie qu'aucun canal ne lit aujourd'hui :
 * ni la projection Shopify ni le B2B ne consultent le rôle. »
 *
 * Les deux moitiés étaient fausses. La vitrine du canal B2B cherche
 * **précisément** le `hero` (`pim/channels/b2b-platform/products/showcase.ts`),
 * et Shopify est sorti du dépôt le 2026-09-21. Conséquence mesurée : aucun
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
 * Le rôle du **packshot** — le visuel que les canaux montrent quand ils n'en
 * montrent qu'un.
 */
const MAIN_MEDIA_ROLE = 'hero';

/**
 * Les cinq usages d'un visuel, et leur libellé.
 *
 * Ils existent dans le domaine depuis l'origine (`MEDIA_ROLES`) ; aucun écran
 * n'en proposait plus d'un jusqu'au 2026-09-23. Les ratios attendus de chacun
 * sont dans `documentation/pim/images-du-catalogue.md` §2.
 */
export const MEDIA_ROLE_LABELS: Readonly<Record<string, string>> = {
  hero: 'Ouverture (3/2)',
  thumbnail: 'Vignette de rayon (4/3)',
  gallery: 'Galerie',
  lifestyle: 'Mise en situation (16/9)',
  print: 'Tirage papier (1/1)',
};

/**
 * Les rôles dont il ne peut exister **qu'un seul par fiche**.
 *
 * Même liste que `SINGLE_ROLES` du domaine, et le serveur refuse le second
 * (`DuplicateMediaRoleError`). L'écran ne se contente pas d'éviter le refus :
 * il rend le doublon **inexprimable**, en dégradant celui qui portait le rôle.
 */
const SINGLE_MEDIA_ROLES: readonly string[] = [MAIN_MEDIA_ROLE, 'thumbnail'];

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
  /**
   * **Les déclinaisons de la fiche**, telles que le serveur les a rendues.
   *
   * Elles ne servaient à rien : la page aplatissait la déclinaison par défaut
   * dans le produit et n'en éditait qu'une. Une fiche peut en avoir plusieurs,
   * et ce sont elles qui portent le prix, le poids et la fiche réglementaire.
   */
  private readonly variantsValue = signal<readonly Variant[]>([]);
  readonly variants: Signal<readonly Variant[]> = this.variantsValue;

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
    if (contextKey !== PRO_CONTEXT_KEY || priceEur === null) {
      return priceEur;
    }
    // Le prix pro de la MÉTHODE appliquée — celle que le push suivra. Garder
    // ici le calcul d'origine ferait afficher un prix pendant que le fil en
    // pousse un autre, ce que le JSDoc de `proPriceOf` interdit précisément.
    const proCents = this.proPriceCentsAt(priceEur, this.percentOf(PRO_CONTEXT_KEY));
    // En EUROS, comme son nom le dit et comme le rendait la version d'origine.
    // Sans taux, on rend le prix public : cette fonction sert d'assiette à un
    // affichage, et `null` y ferait disparaître une ligne plutôt que de la dire.
    return proCents === null ? priceEur : proCents / 100;
  }

  readonly proPricing = computed<ProPricing | null>(() => {
    const priceEur = this.priceEur();
    const rules = this.accounting.rules();
    const percent = this.percentOf(PRO_CONTEXT_KEY);
    if (priceEur === null || rules.ratioBp === null) {
      return null;
    }
    const price = proPriceOf(
      Math.round(priceEur * 100),
      { method: rules.method, ratioBp: rules.ratioBp },
      percent ?? null,
    );
    if (price === null) {
      // Sans taux, aucune des deux méthodes ne produit de prix — et le canal
      // écarterait l'article pour la même raison. Montrer le TTC public ici
      // laisserait croire à un prix pro.
      return null;
    }
    return {
      ttc: euros(price.ttcCents),
      discountLabel: formatDiscount(rules.ratioBp),
      // Le hors taxe vient de `proPriceOf`, comme le TTC — les deux s'affichent
      // l'un sous l'autre, et le second re-taxé doit redonner le premier. Le
      // déduire ici avec `htFromTtc` marcherait sous `ratio_ttc` et mentirait
      // d'un centime sous la plaquette, où c'est le HT qui est l'original.
      ht: euros(Math.round(price.htMillicents / MILLICENTS_PER_CENT)),
    };
  });

  /** Le TTC pro en centimes sous la méthode appliquée — `null` faute de taux. */
  private proPriceCentsAt(priceEur: number, percent: number | undefined): number | null {
    const rules = this.accounting.rules();
    if (rules.ratioBp === null) {
      return null;
    }
    return (
      proPriceOf(
        Math.round(priceEur * 100),
        { method: rules.method, ratioBp: rules.ratioBp },
        percent ?? null,
      )?.ttcCents ?? null
    );
  }

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
   * Un code que le référentiel du catalogue courant ne connaît pas est ignoré :
   * la portée « UE » n'expose pas tout, et proposer un code sans libellé
   * afficherait `en:e220` à un opérateur.
   */
  readonly citedNotDeclared = computed(() =>
    citedNotDeclaredIn(this.citedAllergens(), new Set(this.selected()), this.entries()),
  );

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
    const contradicts = this.citedContradictsNone();
    this.declaration.update((current) =>
      // La contradiction se lève même quand rien n'est reprenable : la
      // composition peut citer un code que la portée courante n'expose pas, et
      // laisser « aucun allergène » coché le démentirait quand même.
      withCitedAdopted(contradicts ? withNoAllergen(current, false) : current, missing),
    );
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

  /** Le rang du visuel principal, `-1` si la fiche n'en désigne aucun. */
  mainVisualIndex(): number {
    return this.media().findIndex((slot) => slot.role === MAIN_MEDIA_ROLE);
  }

  /**
   * Désigne **le** visuel principal — ou retire la désignation.
   *
   * 🔴 **Un seul par fiche, et c'est le GESTE qui le garantit**, pas une règle
   * vérifiée après coup : une seule mise à jour repasse sur toute la liste, met
   * `hero` sur le rang visé et rend les autres à `gallery`. Deux principaux
   * sont donc inexprimables, plutôt qu'interdits — « une donnée peut être
   * fausse ; une structure, non ».
   *
   * ⚠️ N'en désigner **aucun** reste légal, et c'est l'état de toutes les fiches
   * jusqu'au 2026-09-23. La vitrine du canal ne montre alors rien, ce qu'elle
   * préfère à montrer n'importe laquelle.
   */
  setMainVisual(index: number, isMain: boolean): void {
    this.setMediaRole(index, isMain ? MAIN_MEDIA_ROLE : DEFAULT_MEDIA_ROLE);
  }

  /**
   * Donne son USAGE à un visuel.
   *
   * 🔴 **L'unicité appartient au verbe.** Poser un rôle à titulaire unique
   * (`hero`, `thumbnail`) rend à la galerie celui qui le portait, en une seule
   * mise à jour : deux ouvertures sont inexprimables, pas interdites.
   *
   * ⚠️ **Seul le PORTEUR DU MÊME RÔLE est dégradé**, et c'est une correction du
   * 2026-09-23 : `setMainVisual` rendait TOUS les autres à `gallery`, ce qui
   * était sans conséquence tant qu'aucun écran ne proposait les trois autres
   * usages. Désigner une ouverture aurait désormais effacé une mise en
   * situation et un tirage papier au passage.
   */
  setMediaRole(index: number, role: string): void {
    this.media.update((current) =>
      current.map((slot, position) => {
        if (position === index) {
          return slot.role === role ? slot : { ...slot, role };
        }
        // Un rôle pluriel ne déloge personne : une fiche peut porter dix
        // images de galerie et trois mises en situation.
        if (!SINGLE_MEDIA_ROLES.includes(role) || slot.role !== role) {
          return slot;
        }
        return { ...slot, role: DEFAULT_MEDIA_ROLE };
      }),
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
  addFromLibrary(picked: readonly { url: string; name: string }[]): void {
    this.media.update((current) => {
      const known = new Set(current.map((slot) => slot.url));
      const added = picked
        .filter((image) => !known.has(image.url))
        .map((image) => ({ role: DEFAULT_MEDIA_ROLE, name: image.name, url: image.url }));
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
      // Les canaux partent avec : fermer un canal efface les taux qu'on y avait
      // posés, et les envoyer séparément laisserait une fenêtre où l'un des deux
      // gestes est passé et l'autre non.
      await this.products.saveChannels(this.productId(), this.channelsOverride());
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
   */
  private async reloadVariants(): Promise<void> {
    const detail = await this.products.getDetail(this.productId());
    if (detail !== null) {
      this.variantsValue.set(detail.product.variants);
    }
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
    this.variants().map((variant) => ({
      id: variant.id,
      label: variantTabLabel(variant),
      /** Le NOM brut, pour le formulaire de renommage — le libellé peut être un repli. */
      name: variant.name[SOURCE_LOCALE] ?? '',
      sku: variant.sku,
      isDefault: variant.isDefault,
      selected: variant.id === this.variantId(),
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
   * Relecture complète après coup, comme pour l'ajout : le nom part dans les
   * envois vers les canaux, et peindre l'onglet d'avance ferait croire à un
   * enregistrement que le serveur peut encore refuser.
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
      await this.products.renameVariant(id, variantId, { [SOURCE_LOCALE]: trimmed });
      await this.hydrate(id);
    } catch (caught) {
      this.error.set(messageOf(caught));
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
          this.channelsOverride(),
          this.pricingAligned(),
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
    this.variantCountValue.set(product.variants.length);
    this.nameText.set(product.name);
    this.kind.set(product.kind);
    this.categoryId.set(product.categoryId);
    // Le prix, le poids et la fiche réglementaire appartiennent à un ARTICLE :
    // ils se lisent sur la déclinaison ouverte, plus sur le produit aplati.
    this.vatOverride.set(product.vatByContext);
    this.channelsOverride.set(product.channelsOverride);

    this.editorial.set(detail.editorial);
    this.media.set([...detail.media]);
    this.readinessValue.set(detail.readiness);
    this.readinessStaleValue.set(detail.readinessStale);

    this.variantsValue.set(product.variants);
    // On garde la déclinaison ouverte si elle existe encore — une relecture
    // après enregistrement ne doit pas ramener l'écran sur le défaut.
    const kept = product.variants.find((entry) => entry.id === this.variantId());
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
