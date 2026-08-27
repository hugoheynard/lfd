/**
 * Ce que chaque rayon raconte de lui-même — la matière de la feuille « En savoir
 * plus », une par rayon, « Tout » compris.
 *
 * C'est du contenu de MAISON, pas du chrome d'interface : il vit avec le
 * catalogue et suivra le même chemin que lui vers le serveur. C'est pourquoi il
 * n'est pas dans les dictionnaires de langue, où il faudrait le traduire trois
 * fois pour une maquette — et pourquoi il a son fichier, à côté du catalogue
 * plutôt que dedans.
 */

export interface RayonStory {
  readonly tag: string;
  /** La ligne courte sous le nom — celle que porte la bannière du rayon. */
  readonly sub: string;
  /** Deux lignes, séparées par un retour. */
  readonly title: string;
  readonly body: string;
  readonly facts: readonly { readonly value: string; readonly key: string }[];
  readonly caption: string;
  readonly cta: string;
}

/** Ce que dit la maison quand aucun rayon n'est filtré. */
const HOUSE_STORY: RayonStory = {
  tag: 'La maison',
  sub: 'Onze ans de fournil, à 1 850 m',
  title: 'Tout sort\nd’ici.',
  body: 'Pas de laboratoire central, pas de surgelé qu’on décongèle à 6 h. Tout ce que vous voyez au rayon a été fait au Labo, route de la Balme, par cinq personnes qui commencent à 4 h 15. Ce qui n’est pas vendu le jour ne revient pas en vitrine le lendemain.',
  facts: [
    { value: '4 h 15', key: 'premier pétrissage' },
    { value: '5', key: 'personnes au fournil' },
    { value: '1 850 m', key: 'd’altitude, ça change la pousse' },
    { value: '0', key: 'produit surgelé' },
  ],
  caption: 'Le Labo, route de la Balme — 4 h 15, premier pétrissage.',
  cta: 'Voir tout le rayon',
};

const RAYON_STORIES: Readonly<Record<string, RayonStory>> = {
  pains: {
    tag: 'Nos pains',
    sub: 'Farines, levain, temps de pousse',
    title: 'Du vrai pain.\nPain barre.',
    body: 'Trois farines, pas trente : un T80 de meule, un seigle de l’Yonne, un petit épeautre du Vercors. Levain nourri deux fois par jour depuis onze ans, fermentation de 18 à 24 heures. C’est plus long que la levure, ça se digère mieux, et ça se garde trois jours sans se transformer en éponge.',
    facts: [
      { value: '24 h', key: 'de fermentation' },
      { value: '3', key: 'farines, sur meule de pierre' },
      { value: '100 %', key: 'française, jamais d’additif' },
      { value: '4 h 15', key: 'premier pétrissage' },
    ],
    caption: 'Tourte de seigle 1,2 kg — grignée à la lame, cuite à même la sole.',
    cta: 'Voir les pains',
  },
  vienn: {
    tag: 'Nos viennoiseries',
    sub: 'Beurre AOP, tourage, pousse au froid',
    title: 'Le réveil\nqui claque.',
    body: 'Beurre AOP Charentes-Poitou, tourage à la main, six heures de pousse au froid. On ne fait pas de viennoiserie surgelée : ce qui n’est pas vendu le jour part en pain perdu, jamais en vitrine le lendemain.',
    facts: [
      { value: '6 h', key: 'de pousse au froid' },
      { value: 'AOP', key: 'Charentes-Poitou' },
      { value: '5 h', key: 'premier four' },
      { value: '0', key: 'surgelé' },
    ],
    caption: 'Croissant au beurre — 27 couches, comptées à la découpe.',
    cta: 'Voir les viennoiseries',
  },
  patis: {
    tag: 'Nos pâtisseries',
    sub: 'Fruits de saison, praliné maison',
    title: 'La gourmandise\nd’altitude.',
    body: 'Myrtilles sauvages de nos alpages, gousses de vanille de Madagascar, praliné maison torréfié au fournil. Les fruits suivent la saison — quand il n’y a plus de myrtilles, il n’y a plus de tarte aux myrtilles, et on ne la remplace pas par du surgelé.',
    facts: [
      { value: 'Alpages', key: 'myrtilles sauvages' },
      { value: 'Maison', key: 'praliné torréfié ici' },
      { value: 'Saison', key: 'aucun fruit hors saison' },
      { value: '2 h', key: 'de cuisson pour le flan' },
    ],
    caption: 'Tarte aux myrtilles — pâte sablée au beurre, montée le matin même.',
    cta: 'Voir les pâtisseries',
  },
  sale: {
    tag: 'Salé & traiteur',
    sub: 'Charcuterie et tomme de la vallée',
    title: 'Ça tient\nau corps.',
    body: 'Des quiches et des sandwichs pensés pour une journée de ski, pas pour une vitrine de gare. Pain du jour, jambon d’un charcutier de Bourg-Saint-Maurice, tomme de la vallée. Les parts sont généreuses parce qu’on sait à qui on les vend.',
    facts: [
      { value: 'Vallée', key: 'charcuterie et tomme' },
      { value: 'Jour', key: 'pain de la fournée' },
      { value: '450 g', key: 'la part de quiche' },
      { value: '11 h', key: 'sortie du salé' },
    ],
    caption: 'Sandwich de station — tomme, jambon sec, beurre de baratte.',
    cta: 'Voir le salé',
  },
  choco: {
    tag: 'Chocolat & confiserie',
    sub: 'Moulé main, 40 skis par jour',
    title: 'Notre\npetite folie.',
    body: 'Le ski fourré au praliné, c’est notre signature — et notre déraison. Moulé à la main, garni de praliné noisette torréfié au fournil, il ne survit jamais à l’après-midi. Les pattes d’ourson en guimauve maison suivent la même logique : peu, bien, et jamais raisonnable.',
    facts: [
      { value: '70 %', key: 'de cacao, origine unique' },
      { value: 'Main', key: 'moulé un par un' },
      { value: '40', key: 'skis par jour, pas plus' },
      { value: 'Maison', key: 'guimauve et praliné' },
    ],
    caption: 'Ski fourré praliné — le seul produit qu’on refuse de faire en série.',
    cta: 'Voir les chocolats',
  },
};

/** L'histoire d'un rayon — celle de la maison quand on les regarde tous. */
export function storyOf(categoryId: string): RayonStory {
  return RAYON_STORIES[categoryId] ?? HOUSE_STORY;
}
