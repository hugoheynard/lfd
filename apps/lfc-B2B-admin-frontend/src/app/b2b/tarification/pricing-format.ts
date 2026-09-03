import { formatEuros } from '@lfd/catalog-ui';
import { PRICE_STAGE_LABELS } from '@lfd/contracts';
import type {
  ElasticityComparison,
  ItemElasticityView,
  PriceFloorView,
  PriceMode,
  PriceRuleView,
  PriceScopePayload,
  PriceScopeType,
  PriceStage,
  PricingItemView,
} from '@lfd/contracts';

/**
 * **La mise en forme des chiffres de l'écran Tarification.**
 *
 * Des fonctions pures, hors du composant : elles n'ont besoin ni de l'état de la
 * page ni d'Angular, et chacune porte une décision d'affichage qui mérite d'être
 * éprouvée seule. Un ratio infini, un écart nul, un objectif sans référence :
 * trois cas où la bonne réponse est de **ne rien afficher** plutôt qu'un
 * symbole que personne ne saurait lire.
 */

/**
 * De combien le prix a bougé, en pourcentage du tarif d'entrée.
 *
 * `null` quand rien n'a bougé : un « 0 % » sur chaque ligne inchangée serait du
 * bruit là où l'absence de puce dit déjà tout.
 */
export function deltaLabel(item: PricingItemView): string | null {
  if (item.canonicalMillicents <= 0 || item.finalMillicents === item.canonicalMillicents) {
    return null;
  }
  const ratio = (item.finalMillicents - item.canonicalMillicents) / item.canonicalMillicents;
  return `${ratio < 0 ? '−' : '+'}${Math.abs(ratio * 100)
    .toFixed(1)
    .replace('.', ',')} %`;
}

/** Une baisse et une hausse ne se lisent pas pareil : la puce le dit. */
export function isDiscount(item: PricingItemView): boolean {
  return item.finalMillicents < item.canonicalMillicents;
}

/**
 * Le ratio iso-chiffre, en clair : « ×1,25 ».
 *
 * `null` quand il n'a pas de valeur finie — un article offert n'atteint le
 * chiffre d'origine à aucun volume, et « ×∞ » n'aide personne.
 */
export function ratioLabel(elasticity: ItemElasticityView): string | null {
  const ratio = elasticity.isoRevenueRatioBp;
  return ratio === null ? null : `×${(ratio / 10_000).toFixed(2).replace('.', ',')}`;
}

/** Où en est le réalisé vis-à-vis de l'objectif, en pourcent entier. */
export function attainmentLabel(comparison: ElasticityComparison): string | null {
  return comparison.attainmentBp === null
    ? null
    : `${String(Math.round(comparison.attainmentBp / 100))} %`;
}

/** L'objectif est-il tenu ? Sert à colorer, jamais à cacher le chiffre. */
export function isOnTrack(comparison: ElasticityComparison): boolean {
  return comparison.attainmentBp !== null && comparison.attainmentBp >= 10_000;
}

/**
 * La marge négociable, dans les DEUX unités — le commercial choisit celle qu'il
 * annonce, et l'écran les met au même poids.
 */
export function roomEuros(maxDiscountMillicents: number): string {
  return formatEuros(maxDiscountMillicents);
}

export function roomPercent(maxDiscountBp: number): string {
  return `${(maxDiscountBp / 100).toFixed(1).replace('.', ',')} %`;
}

/**
 * **Un centime vaut mille millicentimes.**
 *
 * Nommé plutôt que multiplié : c'est exactement le facteur qui manquait, et
 * c'est celui qui rendait une règle « −0,05 € » égale à 0,00005 €.
 */
export const MILLICENTS_PER_CENT = 1_000;

/**
 * **Ce que l'écran saisit → ce que le fil attend.**
 *
 * Un pourcentage part en points de base (5 % → 500) ; un montant part en
 * **millicentimes** (0,05 € → 5 000), parce qu'il altère un PRIX UNITAIRE et
 * que tout prix unitaire vit en millicentimes dans le modèle.
 *
 * Les deux facteurs diffèrent, et c'est le fond de l'affaire : les trois
 * panneaux de saisie appliquaient `× 100` aux deux, un commentaire à l'appui
 * expliquant que « les deux unités du modèle sont des centièmes de leur unité
 * naturelle » et demandant qu'on ne le « corrige » pas. C'était vrai des points
 * de base, faux des montants — et le commentaire a protégé le défaut plus
 * longtemps que le défaut ne se serait tenu seul.
 *
 * Écrit ICI, à un seul endroit, pour que les trois panneaux ne puissent plus
 * diverger.
 */
export function magnitudeToWire(value: number, mode: PriceMode): number {
  return mode === 'percent' ? Math.round(value * 100) : Math.round(value * 100_000);
}

/** L'inverse — pour rouvrir une limite déjà posée sur la valeur qu'on avait saisie. */
export function magnitudeFromWire(value: number, mode: PriceMode): number {
  return mode === 'percent' ? value / 100 : value / 100_000;
}

/**
 * **Une limite, en clair** — « 1,22 € » ou « 50 % du tarif ».
 *
 * Les deux formes ne sont pas interchangeables et le libellé le dit : un montant
 * ne veut rien dire au-delà d'un article (« jamais sous 1,50 € » laisse passer
 * une pièce montée et relève un croissant), une fraction suit l'article. Écrite
 * ici plutôt que sur un composant, parce que la bande du catalogue et la table
 * d'un rayon l'affichent toutes deux — et deux formulations divergeraient.
 */
export function floorLabel(floor: PriceFloorView): string {
  return floor.mode === 'percent'
    ? `${String(floor.value / 100)} % du tarif`
    : formatEuros(floor.value);
}

/**
 * **Ce qu'une règle fait, en une phrase.**
 *
 * Écrite une fois, lue à deux endroits : sur le nœud de la règle, et dans le
 * panneau qui demande pourquoi on l'archive. Deux formulations divergeraient, et
 * c'est précisément au moment d'archiver qu'on veut reconnaître ce qu'on avait
 * sous les yeux.
 *
 * L'étage y figure **en toutes lettres** : c'est ce qui permet à la couleur du
 * rail de renforcer l'information sans jamais la porter seule.
 *
 * **Le franchissement du scellement y figure aussi**, et c'est le plus important
 * des trois. Une mercuriale scelle : par défaut, une promotion ne touche pas les
 * comptes au tarif négocié. La règle qui porte l'override accorde une remise
 * PAR-DESSUS une remise déjà consentie — c'est la décision la plus lourde qu'on
 * puisse cocher sur une règle, et elle se cochait sans laisser la moindre trace
 * à l'écran une fois posée. Dite ici, elle apparaît partout où une règle se
 * résume : sur son nœud, sur la frise, et dans le panneau qui demande pourquoi
 * on l'archive.
 */
export function ruleSentence(rule: PriceRuleView): string {
  const stage = PRICE_STAGE_LABELS[rule.stage];
  const tier = rule.minQuantity === null ? '' : ` dès ${String(rule.minQuantity)}`;
  const pierces = rule.stacksOverMercuriale ? ' · par-dessus mercuriale' : '';
  return `${stage} ${ruleEffect(rule)}${tier}${pierces}`;
}

function ruleEffect(rule: PriceRuleView): string {
  if (rule.effect.nature === 'replace') {
    return `à ${formatEuros(rule.effect.amountMillicents)}`;
  }
  const sign = rule.effect.direction === 'decrease' ? '−' : '+';
  return rule.effect.mode === 'percent'
    ? `${sign}${String(rule.effect.value / 100).replace('.', ',')} %`
    : `${sign}${formatEuros(rule.effect.value)}`;
}

/**
 * **Une variation en clair**, depuis des points de base.
 *
 * `—` quand elle ne se calcule pas — partir de zéro n'est pas une variation,
 * c'est une apparition. Inventer un `0 %` là ferait lire « rien n'a bougé » sur
 * un article qui vient d'entrer au catalogue.
 */
export function formatVariation(bp: number | null): string {
  if (bp === null) {
    return '—';
  }
  const value = Math.abs(bp / 100)
    .toFixed(1)
    .replace('.', ',');
  return `${bp > 0 ? '+' : bp < 0 ? '−' : ''}${value} %`;
}

/** Le SENS d'une variation, pour la couleur — jamais pour l'information seule. */
export function variationDirection(bp: number | null): 'up' | 'down' | 'flat' {
  if (bp === null || bp === 0) {
    return 'flat';
  }
  return bp > 0 ? 'up' : 'down';
}

/**
 * « 12 septembre 2026 » — la forme longue, celle d'un titre.
 *
 * Rendue **en UTC**, comme le jour qu'elle reçoit : les deux bouts de la chaîne
 * parlent du même fuseau, sinon un titre annonce la veille de ce qui est
 * affiché dessous.
 */
export function formatLongDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// ---------------------------------------------------------------------------
// La trace du chemin du prix
// ---------------------------------------------------------------------------

/**
 * **La portée d'un étage, écrite en adverbe.**
 *
 * `PRICE_SCOPE_LABELS` existe et ne convient pas ici : il nomme la CIBLE d'un
 * champ de saisie (« Famille », « Produit »), là où la trace décrit une action
 * (« portée famille »). Deux registres, deux tables — les fondre obligerait
 * l'un des deux à mal se lire.
 */
const STEP_SCOPE_LABELS: Readonly<Record<PriceScopeType, string>> = {
  global: 'portée catalogue',
  category: 'portée famille',
  product: 'portée article',
  variant: 'portée déclinaison',
};

/**
 * **La limite n'est pas un étage** — écrit une fois, à côté du pointillé qui le
 * dessine. Elle s'applique en fin de chaîne quelle que soit sa place dans la
 * lecture, et c'est la seule chose que la cascade pourrait faire mal lire.
 */
const OUT_OF_CHAIN: PricePathNote = { text: 'hors chaîne · s’applique après', tone: 'muted' };

/** Ce que la limite protège, nommé par sa portée — jamais par un étage. */
const FLOOR_SCOPE_LABELS: Readonly<Record<PriceScopeType, string>> = {
  global: 'Limite catalogue',
  category: 'Limite famille',
  product: 'Limite article',
  variant: 'Limite déclinaison',
};

/**
 * Les nombres en toutes lettres, jusqu'à quatre — le nombre d'étages.
 *
 * Au-delà, ce ne sont plus des étages mais des règles évincées, dont le compte
 * n'est pas borné : on repasse aux chiffres plutôt que d'écrire « treize ».
 */
const COUNT_WORDS: readonly string[] = ['zéro', 'un', 'deux', 'trois', 'quatre'];

function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

/**
 * Un montant **signé**, le signe ÉCRIT.
 *
 * Le signe est composé ici plutôt que laissé à `Intl` : la maison écrit `−`
 * (U+2212) et non le trait d'union, et c'est déjà ce que font `deltaLabel` et
 * `ruleEffect`. Trois conventions du signe sur le même écran finiraient par
 * s'y voir.
 */
export function signedEuros(millicents: number): string {
  const sign = millicents < 0 ? '−' : millicents > 0 ? '+' : '';
  return `${sign}${formatEuros(Math.abs(millicents))}`;
}

/** La variation d'un étage, en pourcent du prix qui y entre. */
function relativeLabel(entering: number, leaving: number): string | null {
  if (entering <= 0 || leaving === entering) {
    return null;
  }
  const ratio = (leaving - entering) / entering;
  return `${ratio < 0 ? '−' : '+'}${Math.abs(ratio * 100)
    .toFixed(1)
    .replace('.', ',')} %`;
}

/** La nature d'un tronçon : ce qui décide de sa forme, jamais de son contenu. */
export type PricePathLegKind = 'canonical' | 'stage' | 'floor' | 'final';

/**
 * **Une mention sous la légende**, avec le poids qu'elle doit avoir.
 *
 * Le ton est porté par la DONNÉE et non deviné du texte dans le gabarit : sinon
 * la seule chose qui distinguerait « absorbé par la limite » de « canonique »
 * serait une comparaison de chaînes dans un template, c'est-à-dire une décision
 * produit cachée dans du HTML.
 */
export interface PricePathNote {
  readonly text: string;
  readonly tone: 'muted' | 'warn' | 'alert';
}

/**
 * **Un tronçon du chemin du prix** — une colonne de la cascade, et sa légende.
 *
 * Tout y est déjà mis en forme. Le gabarit ne calcule rien, pas même une
 * hauteur de barre : c'est ce qui permet d'éprouver la trace en énumérant des
 * cas plutôt qu'en montant un composant, et ce qui garantit que les quatre
 * mentions qui portent la décision produit (« absorbé par la limite »,
 * « hors chaîne · s'applique après »…) s'écrivent à un seul endroit.
 */
export interface PricePathLeg {
  readonly key: string;
  readonly kind: PricePathLegKind;
  /** L'étage, quand c'en est un — il porte la teinte du liseré. `null` sinon. */
  readonly stage: PriceStage | null;
  /** « Tarif catalogue », « Promotion −12,0 % », « Limite famille », « Prix final ». */
  readonly title: string;
  /** Le prix **à ce point de la chaîne** : la hauteur de la barre. */
  readonly amountMillicents: number;
  /** L'effet chiffré et signé, au-dessus de la barre. `null` = c'est le prix qui s'écrit. */
  readonly effect: string | null;
  /** « portée article ». `null` hors des étages : une limite n'en a pas au même sens. */
  readonly scopeLabel: string | null;
  /** Les règles évincées, mises en phrase — destinées au barré. */
  readonly supersedes: readonly string[];
  /** Les mentions sous la légende. Chacune est une décision produit, pas un ornement. */
  readonly notes: readonly PricePathNote[];
  /** La limite n'est PAS un étage : elle se dessine en pointillé, jamais en plein. */
  readonly dashed: boolean;
  /** La hauteur de la barre, en pourcent du plus haut prix de la chaîne. */
  readonly heightPercent: number;
}

/**
 * **Ce que la limite a REPRIS** sur ce que la chaîne avait produit, en
 * millicentimes. `0` quand elle n'a pas mordu.
 *
 * C'est le nombre que l'écran ne savait pas dire, et le plus coûteux du moteur :
 * une règle posée, un geste accordé, et presque rien qui arrive au client. Il
 * demande `steps` ET `floored` réunis — donc la trace, pas la grille.
 */
export function floorRecoveryMillicents(item: PricingItemView): number {
  if (!item.floored) {
    return 0;
  }
  return Math.max(0, item.finalMillicents - chainEndMillicents(item));
}

/** Le prix au bout de la chaîne, AVANT que la limite ne s'en mêle. */
function chainEndMillicents(item: PricingItemView): number {
  const last = item.steps.at(-1);
  return last === undefined ? item.canonicalMillicents : last.resultMillicents;
}

/**
 * **Le chemin du prix, déplié** — le tarif d'entrée, chaque étage qui a agi, la
 * limite, le prix final.
 *
 * La limite figure comme un tronçon parce qu'elle se voit, jamais comme un
 * étage : elle s'applique **en fin de chaîne**, quelle que soit sa place dans la
 * lecture, d'où le pointillé et la mention qui le dit. La dessiner pleine
 * laisserait croire qu'elle compose avec les autres.
 */
export function pricePath(item: PricingItemView): readonly PricePathLeg[] {
  const legs: PricePathLeg[] = [];
  const room = item.negotiationRoom;

  legs.push({
    key: 'canonical',
    kind: 'canonical',
    stage: null,
    title: 'Tarif catalogue',
    amountMillicents: item.canonicalMillicents,
    effect: null,
    scopeLabel: null,
    supersedes: [],
    notes: [{ text: 'canonique', tone: 'muted' }],
    dashed: false,
    heightPercent: 0,
  });

  const lastIndex = item.steps.length - 1;
  let entering = item.canonicalMillicents;
  item.steps.forEach((step, index) => {
    const relative = relativeLabel(entering, step.resultMillicents);
    const notes: PricePathNote[] = [];
    // « Absorbé » ne se déduit ni de `floored` seul ni de l'étape seule : c'est
    // l'écart entre ce que le DERNIER étage a produit et ce que la limite a
    // laissé passer. Le cas est celui qu'on ne voyait pas — une règle posée qui
    // n'accorde presque rien, et personne pour s'en apercevoir.
    if (index === lastIndex && absorbedByFloor(item, entering)) {
      notes.push({ text: 'absorbé par la limite', tone: 'alert' });
    }
    legs.push({
      key: `step-${String(index)}-${step.ruleId}`,
      kind: 'stage',
      stage: step.stage,
      title:
        relative === null
          ? PRICE_STAGE_LABELS[step.stage]
          : `${PRICE_STAGE_LABELS[step.stage]} ${relative}`,
      amountMillicents: step.resultMillicents,
      effect: signedEuros(step.resultMillicents - entering),
      scopeLabel: step.scope === null ? null : STEP_SCOPE_LABELS[step.scope.type],
      // Le perdant s'affiche dans la cellule du GAGNANT, barré : c'est la seule
      // façon de dire que deux règles se disputaient le même étage sans
      // dessiner une seconde chaîne à côté de la première.
      supersedes: step.supersedes.map((rival) => `${rival.label} supplantée`),
      notes,
      dashed: false,
      heightPercent: 0,
    });
    entering = step.resultMillicents;
  });

  if (room !== null) {
    const recovery = floorRecoveryMillicents(item);
    legs.push({
      key: 'floor',
      kind: 'floor',
      stage: null,
      title: floorTitle(item.effectiveFloor?.scope ?? null),
      amountMillicents: room.floorMillicents,
      effect: recovery > 0 ? signedEuros(recovery) : null,
      scopeLabel: null,
      supersedes: [],
      notes: item.floored ? [OUT_OF_CHAIN, { text: 'a relevé', tone: 'warn' }] : [OUT_OF_CHAIN],
      dashed: true,
      heightPercent: 0,
    });
  }

  legs.push({
    key: 'final',
    kind: 'final',
    stage: null,
    title: 'Prix final',
    amountMillicents: item.finalMillicents,
    effect: null,
    scopeLabel: null,
    supersedes: [],
    notes: finalNotes(item),
    dashed: false,
    heightPercent: 0,
  });

  return withHeights(legs);
}

/**
 * La limite a-t-elle repris tout ou partie de ce que le dernier étage venait
 * d'accorder ?
 */
function absorbedByFloor(item: PricingItemView, enteringLastStep: number): boolean {
  if (!item.floored) {
    return false;
  }
  const produced = chainEndMillicents(item) - enteringLastStep;
  const delivered = item.finalMillicents - enteringLastStep;
  return Math.abs(delivered) < Math.abs(produced);
}

function floorTitle(scope: PriceScopePayload | null): string {
  return scope === null ? 'Limite' : FLOOR_SCOPE_LABELS[scope.type];
}

/**
 * Ce qui se dit sous le prix final.
 *
 * `null` de `negotiationRoom` vaut « pas de référence » et non « 0 € » : sans
 * limite posée, il n'y a pas de marge définie, et annoncer un nombre supposerait
 * un plancher que personne n'a décidé.
 */
function finalNotes(item: PricingItemView): readonly PricePathNote[] {
  const notes: PricePathNote[] = [];
  if (item.clampedToZero) {
    notes.push({ text: 'ramené à zéro', tone: 'alert' });
  }
  const room = item.negotiationRoom;
  if (room === null) {
    notes.push({ text: 'pas de référence', tone: 'muted' });
    return notes;
  }
  if (room.maxDiscountMillicents === 0) {
    notes.push({ text: 'déjà au plancher', tone: 'warn' });
  }
  notes.push({ text: `négoce ${formatEuros(room.maxDiscountMillicents)}`, tone: 'muted' });
  return notes;
}

/**
 * La part de hauteur réservée au tronçon le PLUS BAS de la chaîne.
 *
 * L'axe est donc **tronqué**, et c'est une décision, pas un raccourci : une
 * chaîne va couramment de 2,50 € à 2,18 €. Mesurées depuis zéro, ses cinq barres
 * tiennent entre 87 % et 100 % — cinq rectangles que rien ne distingue, sur un
 * graphique dont l'unique raison d'être est de montrer des marches.
 *
 * Ce qui rend la troncature admissible ici, et qui manquerait ailleurs : la
 * **magnitude est écrite**, signe compris, au-dessus de chaque barre. La barre
 * ordonne, elle ne chiffre pas — c'est l'inverse d'un graphique de presse, où
 * l'axe tronqué ment parce qu'il est seul à parler.
 */
const SHORTEST_BAR_PERCENT = 42;

/**
 * Les hauteurs, sur l'amplitude RÉELLE de la chaîne.
 *
 * Le pourcentage vaut pour la piste — pas pour le bloc entier, qui porte aussi
 * l'étiquette d'effet. C'est ce qui permet à la ligne de plancher de se poser au
 * même pourcentage que les barres : deux échelles pour un seul dessin, et le
 * trait tombe à côté de ce qu'il prétend couper.
 */
function withHeights(legs: readonly PricePathLeg[]): readonly PricePathLeg[] {
  const amounts = legs.map((leg) => leg.amountMillicents);
  const tallest = Math.max(...amounts, 0);
  const shortest = Math.min(...amounts, tallest);
  if (tallest <= 0) {
    return legs;
  }
  const span = tallest - shortest;
  return legs.map((leg) => ({
    ...leg,
    // Une chaîne plate — aucun étage n'a agi — n'a pas d'amplitude : toutes ses
    // barres valent le même prix, donc la même hauteur. Les échelonner sur une
    // amplitude nulle demanderait de diviser par zéro, et n'aurait rien à dire.
    heightPercent:
      span === 0
        ? 100
        : Math.round(
            (SHORTEST_BAR_PERCENT +
              (100 - SHORTEST_BAR_PERCENT) * ((leg.amountMillicents - shortest) / span)) *
              10,
          ) / 10,
  }));
}

/**
 * **Un morceau de la phrase de verdict.**
 *
 * La phrase se rend en segments plutôt qu'en une chaîne, pour une seule raison :
 * le NOMBRE qu'elle annonce — ce que la limite a repris — doit ressortir, et un
 * gabarit ne peut pas emphaser l'intérieur d'une chaîne sans passer par du HTML
 * injecté. Le découpage est donc porté par la donnée, là où il se teste.
 */
export interface PriceVerdictPart {
  readonly text: string;
  /** Le chiffre dont la phrase parle — mis en avant, jamais coloré seul. */
  readonly emphasis: boolean;
}

/**
 * **Ce qui s'est passé, en une phrase.**
 *
 * Le livrable de la trace : elle répond à « qu'est-ce qui s'est passé ? » avant
 * tout graphique, et c'est elle qu'on lit d'abord — la cascade dit *comment*,
 * la phrase dit *quoi*. Quatre gabarits, et un cinquième que le moteur peut
 * produire sans qu'aucune règle n'agisse : un tarif déjà sous sa propre limite.
 */
export function priceVerdict(item: PricingItemView): readonly PriceVerdictPart[] {
  const acted = item.steps.length;
  const superseded = item.steps.reduce((total, step) => total + step.supersedes.length, 0);
  const recovery = floorRecoveryMillicents(item);

  const head =
    acted === 0
      ? 'Aucun étage n’a agi'
      : `${capitalize(countWord(acted))} étage${acted > 1 ? 's' : ''} ${acted > 1 ? 'ont' : 'a'} agi`;

  // Une clause est faite de segments : celle de la limite porte le montant, qui
  // est le seul mot de la phrase qu'on doit pouvoir lire sans la lire.
  const clauses: (readonly PriceVerdictPart[])[] = [];
  if (superseded > 0) {
    clauses.push([
      {
        text:
          superseded > 1
            ? `${countWord(superseded)} ont été supplantés`
            : `${countWord(superseded)} a été supplanté`,
        emphasis: false,
      },
    ]);
  }
  if (item.floored) {
    clauses.push(
      recovery > 0
        ? [
            { text: 'la limite a repris ', emphasis: false },
            { text: formatEuros(recovery), emphasis: true },
          ]
        : [{ text: 'la limite a relevé le prix', emphasis: false }],
    );
  }
  if (item.clampedToZero) {
    clauses.push([{ text: 'le prix a été ramené à zéro', emphasis: false }]);
  }

  if (clauses.length === 0) {
    return [
      {
        text: acted === 0 ? `${head}. Le prix est le tarif catalogue.` : `${head}.`,
        emphasis: false,
      },
    ];
  }

  const parts: PriceVerdictPart[] = [];
  const last = clauses[clauses.length - 1] ?? [];
  const front = clauses.slice(0, -1);
  parts.push({ text: front.length === 0 ? `${head} et ` : `${head}, `, emphasis: false });
  front.forEach((clause) => {
    parts.push(...clause, { text: ', ', emphasis: false });
  });
  if (front.length > 0) {
    parts.push({ text: 'et ', emphasis: false });
  }
  parts.push(...last, { text: '.', emphasis: false });
  return parts;
}

/** La phrase à plat — pour les tests, et pour tout lecteur qui n'a pas de balises. */
export function priceVerdictText(item: PricingItemView): string {
  return priceVerdict(item)
    .map((part) => part.text)
    .join('');
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * **Quels étages ont agi**, nommés, pour la colonne du prix final.
 *
 * Elle affichait « 3 étage(s) » : la seule chose que l'écran savait dire d'un
 * tableau d'étapes résolues était sa longueur. Trois noms tiennent dans la même
 * place et répondent à la question qu'on se pose en balayant la colonne — « une
 * promotion, ou un geste ? ». Le détail, lui, est dans le chemin du prix.
 *
 * `null` quand aucun étage n'a agi : il n'y a alors rien à nommer, et l'absence
 * de mention le dit déjà.
 */
export function stageTrail(item: PricingItemView): string | null {
  if (item.steps.length === 0) {
    return null;
  }
  return item.steps.map((step) => PRICE_STAGE_LABELS[step.stage].toLowerCase()).join(' · ');
}

/**
 * **La largeur de la jauge d'effort**, ou `null` quand il n'y a pas de jauge à
 * dessiner.
 *
 * `null` est le cas qui compte : sans référence, une barre vide se lirait
 * « 0 % de l'objectif », ce qui est faux. `pricing-format` a déjà tranché que la
 * bonne réponse est alors de ne rien afficher — la jauge suit.
 *
 * Écrêtée à 100 % pour la BARRE seulement : le libellé, lui, dit « 112 % ».
 * Une barre qui déborderait de sa piste ne dirait rien de plus, et le chiffre
 * reste écrit à côté.
 */
export function gaugeWidth(comparison: ElasticityComparison): string | null {
  if (comparison.attainmentBp === null) {
    return null;
  }
  return `${String(Math.min(Math.round(comparison.attainmentBp / 100), 100))}%`;
}
