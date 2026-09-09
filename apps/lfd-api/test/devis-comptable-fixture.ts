/**
 * **Un devis fabriqué DEHORS**, par le logiciel comptable de la maison, et
 * repris ici comme oracle.
 *
 * ## Pourquoi ce fichier vaut plus que les tests qui l'entourent
 *
 * Tous nos autres tests vérifient que le moteur fait ce que **son auteur** croit
 * qu'il doit faire. Celui-ci confronte nos montants à un document qu'aucun de
 * nous n'a produit : c'est le seul type de preuve capable d'attraper une erreur
 * que le code et ses tests partagent. Il a d'ailleurs déjà servi — c'est lui qui
 * a montré que `MAX_LINE_QUANTITY` refusait un devis de saison parfaitement
 * ordinaire (101 380 pièces sur une ligne).
 *
 * ## Ce qui a été retiré, et ce qui reste
 *
 * Anonymisé : le client, son contact, son SIRET, son numéro, la référence de
 * l'affaire, les coordonnées bancaires, et jusqu'aux libellés d'articles —
 * remplacés par les SKU du semis de test. **Restent les quantités et les prix**,
 * parce qu'ils SONT ce qu'on éprouve : les réduire détruirait la preuve, l'arrondi
 * par ligne ne se voyant qu'à ces volumes. Renommer masque *qui*, pas *l'affaire*.
 *
 * La ligne de **livraison** (450 € à 20 %) est écartée : ce n'est pas un article
 * de mercuriale. Restent 44 lignes, toutes à 5,5 %, toutes à remise nulle.
 *
 * ## Les trois totaux du document, et le chemin qui n'est pas le nôtre
 *
 * | | Document | Nous |
 * | --- | ---: | ---: |
 * | HT | 292 561,22 € | **292 561,22 €** |
 * | TVA 5,5 % | 16 090,87 € | **16 090,87 €** |
 * | TTC | 308 652,09 € | **308 652,09 €** |
 *
 * 🔴 **L'accord passe par deux différences qui s'annulent**, et c'est la seule
 * chose à savoir avant de toucher à ce fichier :
 *
 * 1. le logiciel additionne les produits **exacts** et n'arrondit qu'une fois
 *    (292 561,21871 → 292 561,22) ; nous arrondissons **chaque ligne** puis nous
 *    sommons. La somme des montants **affichés** sur le document fait d'ailleurs
 *    292 561,**21** — le document ne s'additionne pas lui-même ;
 * 2. une ligne, et une seule, tombe sur un demi exact : 75 × 1,575 € = 118,125 €.
 *    Le document affiche **118,12**, nous rendons **118,13**.
 *
 * Ce centime-là est exactement celui qui rattrape l'écart du point 1. **Sur un
 * autre panier, ils ne s'annuleraient pas** — c'est pourquoi cette suite assert
 * ligne à ligne et pas seulement sur le total : un test vert par compensation
 * rougirait un jour sans que personne ne sache pourquoi.
 *
 * ⚠️ **Ne pas « corriger » notre arrondi sur cette base.** Le nôtre est *demi
 * s'éloignant de zéro*, documenté dans `roundToCents` : l'arrondi au pair de
 * l'IEEE y est écarté comme « indéfendable devant un client qui recompte ». Le
 * 118,12 du logiciel est soit cet arrondi au pair, soit — plus probablement —
 * un artefact de flottant binaire, 1,575 n'étant pas représentable. **Un seul
 * cas ne permet pas de trancher**, et une règle documentée ne se retourne pas
 * sur un point de mesure.
 *
 * ## Ce que ce document N'éprouve PAS
 *
 * C'est le cas facile : un seul taux, remise nulle partout, aucune promotion,
 * aucun palier de volume, aucun plancher. Il éprouve la colonne vertébrale du
 * calcul — la mercuriale traverse intacte, l'arrondi, la somme — pas les
 * décisions du moteur.
 */

/** Une ligne du document : ce qu'on demande, et ce que le comptable a écrit. */
export interface LigneDevisComptable {
  readonly sku: string;
  readonly quantity: number;
  /** Le PU du document, en millicentimes — ses 5 décimales y entrent sans perte. */
  readonly unitPriceMillicents: number;
  /** Le montant HT que NOTRE moteur doit produire pour cette ligne, en centimes. */
  readonly expectedLineCents: number;
  /** Le montant HT **affiché** sur le document, en centimes. Diffère une seule fois. */
  readonly documentLineCents: number;
}

/**
 * Le HT attendu, en centimes : la somme de NOS lignes arrondies.
 *
 * Égal au total du document, qui l'obtient pourtant en n'arrondissant qu'une
 * fois — cf. les deux différences qui s'annulent, en tête de fichier.
 */
export const DEVIS_COMPTABLE_HT_CENTS = 29_256_122;

/** La TVA du document, 5,5 % sur l'assiette agrégée. Jamais ligne à ligne. */
export const DEVIS_COMPTABLE_TVA_CENTS = 1_609_087;

/** Le TTC du document. */
export const DEVIS_COMPTABLE_TTC_CENTS = 30_865_209;

export const DEVIS_COMPTABLE: readonly LigneDevisComptable[] = [
  {
    sku: "VIE-001",
    quantity: 101380,
    unitPriceMillicents: 99000,
    expectedLineCents: 10036620,
    documentLineCents: 10036620,
  }, // Croissant
  {
    sku: "VIE-002",
    quantity: 16040,
    unitPriceMillicents: 82000,
    expectedLineCents: 1315280,
    documentLineCents: 1315280,
  }, // Pain au chocolat
  {
    sku: "VIE-003",
    quantity: 4496,
    unitPriceMillicents: 142180,
    expectedLineCents: 639241,
    documentLineCents: 639241,
  }, // Patte d'ours
  {
    sku: "VIE-004",
    quantity: 1676,
    unitPriceMillicents: 242000,
    expectedLineCents: 405592,
    documentLineCents: 405592,
  }, // Pain aux raisins
  {
    sku: "VIE-005",
    quantity: 1676,
    unitPriceMillicents: 258000,
    expectedLineCents: 432408,
    documentLineCents: 432408,
  }, // Chausson aux pommes
  {
    sku: "VIE-006",
    quantity: 1150,
    unitPriceMillicents: 230000,
    expectedLineCents: 264500,
    documentLineCents: 264500,
  }, // Brioche pralinée individuelle
  {
    sku: "VIE-007",
    quantity: 932,
    unitPriceMillicents: 100000,
    expectedLineCents: 93200,
    documentLineCents: 93200,
  }, // Brioche pépites de chocolat
  {
    sku: "VIE-009",
    quantity: 3905,
    unitPriceMillicents: 77000,
    expectedLineCents: 300685,
    documentLineCents: 300685,
  }, // Pain au lait
  {
    sku: "VIE-010",
    quantity: 12960,
    unitPriceMillicents: 57820,
    expectedLineCents: 749347,
    documentLineCents: 749347,
  }, // Brioche a tete
  {
    sku: "VIE-011",
    quantity: 4296,
    unitPriceMillicents: 242000,
    expectedLineCents: 1039632,
    documentLineCents: 1039632,
  }, // Grosse brioche 350 g
  {
    sku: "VIE-012",
    quantity: 1316,
    unitPriceMillicents: 650000,
    expectedLineCents: 855400,
    documentLineCents: 855400,
  }, // Abricotin
  {
    sku: "VIE-013",
    quantity: 462,
    unitPriceMillicents: 759000,
    expectedLineCents: 350658,
    documentLineCents: 350658,
  }, // Pain chocolat-banane
  {
    sku: "VIE-014",
    quantity: 2660,
    unitPriceMillicents: 872038,
    expectedLineCents: 2319621,
    documentLineCents: 2319621,
  }, // Pain de mie brioché 500 g cuit
  {
    sku: "VIE-015",
    quantity: 2130,
    unitPriceMillicents: 218000,
    expectedLineCents: 464340,
    documentLineCents: 464340,
  }, // Croix de Savoie
  {
    sku: "VIE-016",
    quantity: 11235,
    unitPriceMillicents: 58000,
    expectedLineCents: 651630,
    documentLineCents: 651630,
  }, // Sablé suisse
  {
    sku: "VIE-017",
    quantity: 4047,
    unitPriceMillicents: 104265,
    expectedLineCents: 421960,
    documentLineCents: 421960,
  }, // Croissant aux amandes
  {
    sku: "VIE-018",
    quantity: 3910,
    unitPriceMillicents: 283412,
    expectedLineCents: 1108141,
    documentLineCents: 1108141,
  }, // Pain au chocolat aux amandes
  {
    sku: "VIE-019",
    quantity: 3961,
    unitPriceMillicents: 113744,
    expectedLineCents: 450540,
    documentLineCents: 450540,
  }, // Gros cookie
  {
    sku: "PAI-001",
    quantity: 2712,
    unitPriceMillicents: 218009,
    expectedLineCents: 591240,
    documentLineCents: 591240,
  }, // Baguette tradition
  {
    sku: "PAI-002",
    quantity: 2665,
    unitPriceMillicents: 194313,
    expectedLineCents: 517844,
    documentLineCents: 517844,
  }, // Baguette artisane 200 g
  {
    sku: "PAI-003",
    quantity: 2650,
    unitPriceMillicents: 170616,
    expectedLineCents: 452132,
    documentLineCents: 452132,
  }, // Baguette village plateau 200 g
  {
    sku: "PAI-004",
    quantity: 1762,
    unitPriceMillicents: 208333,
    expectedLineCents: 367083,
    documentLineCents: 367083,
  }, // Pain Viking 300 g
  {
    sku: "PAI-005",
    quantity: 1621,
    unitPriceMillicents: 284360,
    expectedLineCents: 460948,
    documentLineCents: 460948,
  }, // Petit pain Beaufort
  {
    sku: "PAI-006",
    quantity: 1556,
    unitPriceMillicents: 113744,
    expectedLineCents: 176986,
    documentLineCents: 176986,
  }, // Pain moisson 300 g
  {
    sku: "PAI-007",
    quantity: 1400,
    unitPriceMillicents: 94787,
    expectedLineCents: 132702,
    documentLineCents: 132702,
  }, // Flûte village 450 g
  {
    sku: "PAI-008",
    quantity: 1129,
    unitPriceMillicents: 250000,
    expectedLineCents: 282250,
    documentLineCents: 282250,
  }, // Pain de campagne 300 g
  {
    sku: "PAI-009",
    quantity: 725,
    unitPriceMillicents: 216667,
    expectedLineCents: 157084,
    documentLineCents: 157084,
  }, // Baguette campagrain 200 g
  {
    sku: "PAI-010",
    quantity: 724,
    unitPriceMillicents: 218009,
    expectedLineCents: 157839,
    documentLineCents: 157839,
  }, // Ficelle artisane 140 g
  {
    sku: "PAI-011",
    quantity: 627,
    unitPriceMillicents: 151659,
    expectedLineCents: 95090,
    documentLineCents: 95090,
  }, // Flûte artisane 420 g
  {
    sku: "PAI-012",
    quantity: 554,
    unitPriceMillicents: 1042654,
    expectedLineCents: 577630,
    documentLineCents: 577630,
  }, // Flûte tradition 450 g
  {
    sku: "PAI-013",
    quantity: 489,
    unitPriceMillicents: 1833333,
    expectedLineCents: 896500,
    documentLineCents: 896500,
  }, // Pain complet 300 g
  {
    sku: "PAI-014",
    quantity: 466,
    unitPriceMillicents: 791667,
    expectedLineCents: 368917,
    documentLineCents: 368917,
  }, // Pain de seigle 300 g
  {
    sku: "PAI-015",
    quantity: 415,
    unitPriceMillicents: 2843602,
    expectedLineCents: 1180095,
    documentLineCents: 1180095,
  }, // Pain sportif au kg
  {
    sku: "PAI-016",
    quantity: 395,
    unitPriceMillicents: 47393,
    expectedLineCents: 18720,
    documentLineCents: 18720,
  }, // Campaillou au kg
  {
    sku: "PAI-017",
    quantity: 395,
    unitPriceMillicents: 1042654,
    expectedLineCents: 411848,
    documentLineCents: 411848,
  }, // Pavé aux noix 300 g
  {
    sku: "PAI-018",
    quantity: 360,
    unitPriceMillicents: 189573,
    expectedLineCents: 68246,
    documentLineCents: 68246,
  }, // Pain de mie carré frais 340 g
  {
    sku: "PAT-001",
    quantity: 305,
    unitPriceMillicents: 284360,
    expectedLineCents: 86730,
    documentLineCents: 86730,
  }, // Tartelette myrtilles
  {
    sku: "PAT-002",
    quantity: 219,
    unitPriceMillicents: 284360,
    expectedLineCents: 62275,
    documentLineCents: 62275,
  }, // Flan nature (part)
  {
    sku: "PAT-003",
    quantity: 199,
    unitPriceMillicents: 170616,
    expectedLineCents: 33953,
    documentLineCents: 33953,
  }, // Tartelette framboises
  {
    sku: "PAT-004",
    quantity: 168,
    unitPriceMillicents: 995261,
    expectedLineCents: 167204,
    documentLineCents: 167204,
  }, // Délice des neiges
  {
    sku: "PAT-005",
    quantity: 147,
    unitPriceMillicents: 378199,
    expectedLineCents: 55595,
    documentLineCents: 55595,
  }, // Éclair chocolat
  {
    sku: "PAT-006",
    quantity: 80,
    unitPriceMillicents: 166667,
    expectedLineCents: 13333,
    documentLineCents: 13333,
  }, // Tartelette citron
  {
    sku: "VIE-008",
    quantity: 75,
    unitPriceMillicents: 157500,
    expectedLineCents: 11813,
    documentLineCents: 11812,
  }, // Brioche au sucre — LA ligne du demi exact
  {
    sku: "PAT-007",
    quantity: 70,
    unitPriceMillicents: 189573,
    expectedLineCents: 13270,
    documentLineCents: 13270,
  }, // Éclair café
];
