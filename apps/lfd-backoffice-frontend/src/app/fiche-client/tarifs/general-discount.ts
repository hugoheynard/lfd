import type {
  CompanyPricingCategoryView,
  GeneralDiscountModeValue,
  GeneralDiscountPayload,
  GeneralDiscountTargetValue,
  GeneralDiscountView,
} from '@lfd/contracts';
import { decidingScopeRule } from '@lfd/contracts/promotion-scope';
import { fromCents, roundToCents, scaleByBasisPoints } from '@lfd/money';

import { floorMillicentsOf } from '../../commercial/tarification/grille/mercuriale-row';

/**
 * **La remise générale d'une mercuriale, côté écran**
 * (`documentation/pricing/mercuriales/la-remise-generale.md`, « Un taux par
 * famille ») — « −30 % sur tout, −40 % sur le pain, sauf le chocolat ».
 *
 * Chaque ligne porte son taux ou l'exclusion ; la plus précise gagne
 * (déclinaison, puis famille la plus proche, puis le taux de base du mode).
 * La recherche de la ligne qui décide est celle du moteur
 * (`decidingScopeRule`, `@lfd/contracts/promotion-scope`), et le prix remisé
 * la même arithmétique exacte que la caisse (`@lfd/money`). Pure.
 */

/** Une ligne en cours de saisie : un taux pas encore tapé n'est pas une exclusion. */
export interface DiscountLineForm {
  readonly target: GeneralDiscountTargetValue;
  readonly targetId: string;
  readonly excluded: boolean;
  /** En points de base ; `null` = pas encore saisi. Ignoré si `excluded`. */
  readonly bp: number | null;
}

export interface GeneralDiscountForm {
  readonly mode: GeneralDiscountModeValue;
  /** Gardé quand on passe en « Seulement… » ; n'est envoyé qu'en « Tout sauf ». */
  readonly baseBp: number | null;
  readonly lines: readonly DiscountLineForm[];
}

/** Ce qu'ouvre l'interrupteur : « tout le catalogue », taux à saisir. */
export const NEW_GENERAL_DISCOUNT: GeneralDiscountForm = {
  mode: 'all_except',
  baseBp: null,
  lines: [],
};

const MIN_BP = 1;
const MAX_BP = 9_999;
/** 100 points de base font 1 %. */
const BP_PER_PERCENT = 100;

export const DISCOUNT_MODE_LABELS: Readonly<Record<GeneralDiscountModeValue, string>> = {
  all_except: 'Tout le catalogue, sauf…',
  only: 'Seulement…',
};

/** Le champ rend des pourcents ; on garde des points de base entiers. */
export function bpOfPercent(percent: number | null): number | null {
  return percent === null ? null : Math.round(percent * BP_PER_PERCENT);
}

export function percentOfBp(bp: number | null): number | null {
  return bp === null ? null : bp / BP_PER_PERCENT;
}

/** `3000` → « −30 % », `3250` → « −32,5 % ». */
export function discountLabel(bp: number): string {
  const percent = (bp / BP_PER_PERCENT).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  return `−${percent} %`;
}

/** Ce que la lecture rend, en saisie. */
export function discountFormOf(
  view: GeneralDiscountView | null | undefined,
): GeneralDiscountForm | null {
  if (view === null || view === undefined) {
    return null;
  }
  return {
    mode: view.mode,
    baseBp: view.baseBp,
    lines: view.rules.map((rule) => ({
      target: rule.target,
      targetId: rule.targetId,
      excluded: rule.bp === null,
      bp: rule.bp,
    })),
  };
}

function badRate(bp: number | null): boolean {
  return bp !== null && (bp < MIN_BP || bp > MAX_BP);
}

/** Ce qui manque pour l'envoyer — les refus du domaine, dits avant l'envoi. */
export function discountProblem(form: GeneralDiscountForm | null): string | null {
  if (form === null) {
    return null;
  }
  if (form.mode === 'all_except' && form.baseBp === null) {
    return 'Saisissez le taux de base de la remise générale.';
  }
  const rated = form.lines.filter((line) => !line.excluded);
  if (rated.some((line) => line.bp === null)) {
    return 'Une ligne de la remise n’a pas de taux : saisissez-le, ou marquez-la « exclue ».';
  }
  const rates = [
    ...(form.mode === 'all_except' ? [form.baseBp] : []),
    ...rated.map((line) => line.bp),
  ];
  if (rates.some(badRate)) {
    return 'Un taux de remise est compris entre 0,01 % et 99,99 %.';
  }
  if (form.mode === 'only' && rated.length === 0) {
    return 'En « Seulement… », au moins une ligne doit porter un taux.';
  }
  return null;
}

/** Le corps envoyé : le taux de base est toujours écrit, `null` en « Seulement… ». */
export function discountPayload(form: GeneralDiscountForm): GeneralDiscountPayload {
  return {
    mode: form.mode,
    baseBp: form.mode === 'all_except' ? form.baseBp : null,
    rules: form.lines.map((line) => ({
      target: line.target,
      targetId: line.targetId,
      bp: line.excluded ? null : line.bp,
    })),
  };
}

/** Le même corps, ou `null` sans remise ou tant qu'il manque quelque chose. */
export function discountViewOf(form: GeneralDiscountForm | null): GeneralDiscountView | null {
  return form === null || discountProblem(form) !== null ? null : discountPayload(form);
}

/** Deux remises disent-elles la même chose ? L'ordre des lignes ne compte pas. */
export function sameDiscount(
  a: GeneralDiscountView | null,
  b: GeneralDiscountView | null,
): boolean {
  const key = (view: GeneralDiscountView | null) =>
    view === null
      ? 'none'
      : JSON.stringify([
          view.mode,
          view.mode === 'all_except' ? view.baseBp : null,
          view.rules.map((rule) => `${rule.target}:${rule.targetId}:${String(rule.bp)}`).sort(),
        ]);
  return key(a) === key(b);
}

/** Un article de la fiche tarifaire, avec ce que la remise lit. */
export interface DiscountArticle {
  readonly sku: string;
  readonly name: string;
  /** Sa famille puis ses parentes, la plus proche en tête. */
  readonly categoryPath: readonly string[];
  readonly canonicalMillicents: number;
  readonly floorMillicents: number | null;
}

/**
 * Les articles, chacun avec le chemin de sa famille. Le serveur l'émet
 * (`CatalogFamilyView.path`) ; à défaut, la famille directe seule.
 */
export function discountArticlesOf(
  categories: readonly CompanyPricingCategoryView[],
): readonly DiscountArticle[] {
  return categories.flatMap((category) =>
    category.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      categoryPath: category.family.path ?? [category.id],
      canonicalMillicents: item.canonicalMillicents,
      floorMillicents: floorMillicentsOf(item),
    })),
  );
}

/**
 * **Le taux qui s'applique à cet article**, ou `null` : exclu, ou hors d'une
 * remise « Seulement… ». La ligne la plus précise décide, sinon le mode.
 */
export function discountBpFor(
  discount: GeneralDiscountView,
  article: Pick<DiscountArticle, 'sku' | 'categoryPath'>,
): number | null {
  const decision = decidingScopeRule(discount.rules, {
    sku: article.sku,
    productId: null,
    categoryPath: article.categoryPath,
  });
  if (decision !== null) {
    return decision.rule.bp;
  }
  return discount.mode === 'all_except' ? discount.baseBp : null;
}

/** Le prix de base remisé — l'arithmétique exacte et l'arrondi unique de la caisse. */
export function discountedMillicents(canonicalMillicents: number, bp: number): number {
  return roundToCents(scaleByBasisPoints(fromCents(canonicalMillicents), bp, -1));
}

/** Ce que la remise fait à un article. */
export interface ArticleDiscount {
  readonly bp: number;
  /** Le prix remisé, avant la limite. */
  readonly discountedMillicents: number;
  /** Le prix facturé : le prix remisé, relevé par la limite s'il le faut. */
  readonly finalMillicents: number;
  readonly floored: boolean;
}

export function articleDiscount(
  discount: GeneralDiscountView,
  article: DiscountArticle,
): ArticleDiscount | null {
  const bp = discountBpFor(discount, article);
  if (bp === null) {
    return null;
  }
  const discounted = discountedMillicents(article.canonicalMillicents, bp);
  const floored = article.floorMillicents !== null && discounted < article.floorMillicents;
  return {
    bp,
    discountedMillicents: discounted,
    finalMillicents:
      floored && article.floorMillicents !== null ? article.floorMillicents : discounted,
    floored,
  };
}

/**
 * Les articles que la remise fait, par SKU : couverts **et** sans prix ferme
 * — le prix ferme l'emporte toujours (D2).
 */
export function discountedArticles(
  discount: GeneralDiscountView | null,
  articles: readonly DiscountArticle[],
  firmSkus: ReadonlySet<string>,
): ReadonlyMap<string, ArticleDiscount> {
  const result = new Map<string, ArticleDiscount>();
  if (discount === null) {
    return result;
  }
  for (const article of articles) {
    if (firmSkus.has(article.sku)) {
      continue;
    }
    const verdict = articleDiscount(discount, article);
    if (verdict !== null) {
      result.set(article.sku, verdict);
    }
  }
  return result;
}

/** Les noms des articles que la limite relèvera (Q3), dans l'ordre du catalogue. */
export function flooredNames(
  discounted: ReadonlyMap<string, ArticleDiscount>,
  articles: readonly DiscountArticle[],
): readonly string[] {
  return articles
    .filter((article) => discounted.get(article.sku)?.floored === true)
    .map((article) => article.name);
}

/** Une famille qu'une ligne peut viser, sous-familles et parentes sans article comprises. */
export interface DiscountFamily {
  readonly id: string;
  readonly name: string;
  /** Elle puis ses parentes. */
  readonly path: readonly string[];
}

/** Les familles, chacune après ses parentes, dans l'ordre du catalogue. */
export function discountFamiliesOf(
  categories: readonly CompanyPricingCategoryView[],
): readonly DiscountFamily[] {
  const seen = new Map<string, DiscountFamily>();
  for (const category of categories) {
    const path = category.family.path ?? [category.id];
    const ancestors = category.family.ancestors ?? [];
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      const ancestor = ancestors[index];
      if (ancestor !== undefined && !seen.has(ancestor.id)) {
        const at = path.indexOf(ancestor.id);
        seen.set(ancestor.id, {
          id: ancestor.id,
          name: ancestor.name,
          path: at === -1 ? [ancestor.id] : path.slice(at),
        });
      }
    }
    if (!seen.has(category.id)) {
      seen.set(category.id, { id: category.id, name: category.name, path });
    }
  }
  return [...seen.values()];
}

/** Les noms des cibles d'une remise : familles et articles. */
export function discountNames(
  categories: readonly CompanyPricingCategoryView[],
): ReadonlyMap<string, string> {
  return new Map([
    ...discountFamiliesOf(categories).map((family) => [family.id, family.name] as const),
    ...categories.flatMap((category) =>
      category.items.map((item) => [item.sku, `${item.name} (${item.sku})`] as const),
    ),
  ]);
}

/** Une ligne affichée : sa cible nommée, et ce qu'elle décide. */
export interface DiscountLineRow {
  readonly line: DiscountLineForm;
  readonly key: string;
  readonly name: string;
  readonly subtitle: string;
  /** Une sous-famille (ou un article) range sous la ligne de famille qui la contient. */
  readonly nested: boolean;
}

/** La ligne de famille la plus proche qui contient ce chemin, hors lui-même. */
function parentLine(
  path: readonly string[],
  lines: readonly DiscountLineForm[],
  self: string,
): DiscountLineForm | undefined {
  const families = new Map(
    lines.filter((line) => line.target === 'category').map((line) => [line.targetId, line]),
  );
  return path
    .filter((id) => id !== self)
    .map((id) => families.get(id))
    .find((line) => line);
}

function decisionWord(line: DiscountLineForm): string {
  if (line.excluded) {
    return 'exclue';
  }
  return line.bp === null ? 'taux à saisir' : discountLabel(line.bp);
}

/**
 * Les lignes, rangées : chaque famille suit l'ordre du catalogue, une
 * sous-famille ou un article vient sous la ligne de famille qui le contient,
 * et dit ce qu'il change à son parent (« sous-famille de Pains (−40 %) »).
 * Le compte est celui des articles que la ligne décide.
 */
export function discountLineRows(
  form: GeneralDiscountForm,
  families: readonly DiscountFamily[],
  articles: readonly DiscountArticle[],
  names: ReadonlyMap<string, string>,
): readonly DiscountLineRow[] {
  const familyOrder = new Map(families.map((family, index) => [family.id, index]));
  const pathOf = (line: DiscountLineForm): readonly string[] =>
    line.target === 'category'
      ? (families.find((family) => family.id === line.targetId)?.path ?? [line.targetId])
      : (articles.find((article) => article.sku === line.targetId)?.categoryPath ?? []);
  const rank = (line: DiscountLineForm): number =>
    familyOrder.get(line.target === 'category' ? line.targetId : (pathOf(line)[0] ?? '')) ??
    Number.MAX_SAFE_INTEGER;
  const rules = form.lines.map((line) => ({
    target: line.target,
    targetId: line.targetId,
    line,
  }));
  const decided = (line: DiscountLineForm): number =>
    articles.filter(
      (article) =>
        decidingScopeRule(rules, {
          sku: article.sku,
          productId: null,
          categoryPath: article.categoryPath,
        })?.rule.line === line,
    ).length;
  return [...form.lines]
    .sort(
      (a, b) =>
        rank(a) - rank(b) || Number(a.target === 'variant') - Number(b.target === 'variant'),
    )
    .map((line) => {
      const parent = parentLine(pathOf(line), form.lines, line.targetId);
      const kind = line.target === 'category' ? 'Famille' : 'Article';
      const head =
        parent === undefined
          ? kind
          : `${line.target === 'category' ? 'Sous-famille' : 'Article'} de ${names.get(parent.targetId) ?? parent.targetId} (${decisionWord(parent)})`;
      const count = decided(line);
      return {
        line,
        key: `${line.target}:${line.targetId}`,
        name: names.get(line.targetId) ?? line.targetId,
        subtitle: `${head} · ${String(count)} article(s)`,
        nested: parent !== undefined,
      };
    });
}

/** Ajoute une ligne ; une cible ne se règle qu'une fois. */
export function withDiscountLine(
  form: GeneralDiscountForm,
  target: GeneralDiscountTargetValue,
  targetId: string,
): GeneralDiscountForm {
  if (form.lines.some((line) => line.target === target && line.targetId === targetId)) {
    return form;
  }
  // En « tout sauf », on ajoute surtout pour exclure ; en « seulement », pour remiser.
  const excluded = form.mode === 'all_except';
  return { ...form, lines: [...form.lines, { target, targetId, excluded, bp: null }] };
}

export function withoutDiscountLine(
  form: GeneralDiscountForm,
  line: DiscountLineForm,
): GeneralDiscountForm {
  return { ...form, lines: form.lines.filter((candidate) => candidate !== line) };
}

export function withDiscountLineChange(
  form: GeneralDiscountForm,
  line: DiscountLineForm,
  change: Partial<Pick<DiscountLineForm, 'excluded' | 'bp'>>,
): GeneralDiscountForm {
  return {
    ...form,
    lines: form.lines.map((candidate) =>
      candidate === line ? { ...candidate, ...change } : candidate,
    ),
  };
}

/**
 * La remise lue : sa tête, puis une entrée par ligne (« Pains −40 % »,
 * « Chocolat exclue »). Les lignes sont des taux particuliers ou des
 * exclusions : la tête dit « sur le reste du catalogue », jamais « sauf »,
 * qui les faisait toutes lire comme des exclusions.
 */
export interface DiscountReading {
  readonly head: string;
  readonly items: readonly string[];
}

export function discountReading(
  view: GeneralDiscountView,
  names: ReadonlyMap<string, string>,
): DiscountReading {
  const items = view.rules.map(
    (rule) =>
      `${names.get(rule.targetId) ?? rule.targetId} ${rule.bp === null ? 'exclue' : discountLabel(rule.bp)}`,
  );
  const head =
    view.mode === 'only' || view.baseBp === null
      ? 'Seulement'
      : `${discountLabel(view.baseBp)} sur ${items.length > 0 ? 'le reste du' : 'tout le'} catalogue`;
  return { head, items };
}

/**
 * **La remise en une phrase** — « −30 % sur le reste du catalogue ; Pains
 * −40 % ; Chocolat exclue » ou « Seulement : Pains −40 % ».
 */
export function discountPhrase(
  view: GeneralDiscountView,
  names: ReadonlyMap<string, string>,
): string {
  const { head, items } = discountReading(view, names);
  if (items.length === 0) {
    return head;
  }
  return head === 'Seulement' ? `${head} : ${items.join(' ; ')}` : `${head} ; ${items.join(' ; ')}`;
}
