/**
 * **La plaquette professionnelle — Hiver 2026, telle qu'elle est imprimée.**
 *
 * Les 89 lignes du catalogue « Professionnels — Hiver 2026 », relevées le
 * 2026-09-13 depuis le PDF remis par le commerce.
 *
 * ## Pourquoi des PRIX et non une règle
 *
 * On a cherché la formule. Il n'y en a pas : ces prix ont été posés à la main,
 * article par article. Au même prix public de 6,00 €, la plaquette porte
 * 3,20 €, 4,50 €, 4,60 € et 4,80 € — aucune fonction du prix public ne rend
 * quatre valeurs pour une entrée. L'analyse complète, ses quatre preuves et ce
 * qu'elle a coûté au code sont dans
 * `documentation/pim/analyse-plaquette-professionnelle.md`.
 *
 * C'est donc une **grille négociée**, et elle entre comme telle : un prix B2B
 * par article, par-dessus ce que le référentiel calcule.
 *
 * ## 🔴 Huit lignes sont FAUSSES, et elles sont ici quand même
 *
 * Sur huit articles, le prix professionnel **hors taxe** dépasse le prix public
 * **toutes taxes comprises** — le professionnel y paie plus cher que le
 * particulier. C'est une erreur, elle est imprimée, et la corriger ici
 * silencieusement ferait facturer autre chose que ce qui est annoncé. L'import
 * les écrit et les NOMME dans son compte rendu ; la décision de les changer
 * appartient au commerce, et passera par un nouveau tirage.
 *
 * `publicTtcCents` n'entre nulle part en base : il est relevé pour que l'import
 * puisse dire lesquelles sont inversées, et pour qu'une relecture de ce fichier
 * puisse le revérifier sans rouvrir le PDF.
 *
 * ## Ce qui n'y est pas
 *
 * Deux lignes de la plaquette ne portent qu'UN prix — « Tourte Beaufort part »
 * (6,50 €) et « Quiche lorraine part » (5,50 €) — sans dire s'il est
 * professionnel ou public. Elles sont exclues : deviner de quel prix il s'agit
 * reviendrait à en inventer un.
 */
export interface LignePlaquette {
  /** Le libellé imprimé, tel quel — c'est lui qu'on rapproche du catalogue. */
  readonly nom: string;
  readonly famille: string;
  /** Le prix professionnel HT, en millicentimes (10⁻⁵ €). */
  readonly proHtMillicents: number;
  /** Le prix public TTC en centimes. Relevé pour le contrôle, jamais écrit. */
  readonly publicTtcCents: number;
}

export const PLAQUETTE_HIVER_2026: readonly LignePlaquette[] = [
  { nom: "CROISSANT", famille: "viennoiseries", proHtMillicents: 150_000, publicTtcCents: 200 },
  { nom: "PAIN CHOCOLAT", famille: "viennoiseries", proHtMillicents: 160_000, publicTtcCents: 220 },
  { nom: "PATTE D’OURS", famille: "viennoiseries", proHtMillicents: 230_000, publicTtcCents: 300 },
  {
    nom: "PAIN AUX RAISINS",
    famille: "viennoiseries",
    proHtMillicents: 198_000,
    publicTtcCents: 250,
  },
  {
    nom: "CHAUSSON AUX POMMES",
    famille: "viennoiseries",
    proHtMillicents: 230_000,
    publicTtcCents: 300,
  },
  {
    nom: "BRIOCHE PRALINE INDIVIDUELLE",
    famille: "viennoiseries",
    proHtMillicents: 198_000,
    publicTtcCents: 250,
  },
  {
    nom: "BRIOCHE PEPITES DE CHOCOLAT",
    famille: "viennoiseries",
    proHtMillicents: 200_000,
    publicTtcCents: 270,
  },
  {
    nom: "BRIOCHE AU SUCRE",
    famille: "viennoiseries",
    proHtMillicents: 170_000,
    publicTtcCents: 230,
  },
  { nom: "PAIN AU LAIT", famille: "viennoiseries", proHtMillicents: 150_000, publicTtcCents: 200 },
  { nom: "BRIOCHE TETE", famille: "viennoiseries", proHtMillicents: 198_000, publicTtcCents: 250 },
  {
    nom: "GROSSE BRIOCHE PIECE 350 G",
    famille: "viennoiseries",
    proHtMillicents: 789_000,
    publicTtcCents: 1000,
  },
  { nom: "ABRICOTIN", famille: "viennoiseries", proHtMillicents: 198_000, publicTtcCents: 250 },
  {
    nom: "PAIN CHOCOLAT-BANANE",
    famille: "viennoiseries",
    proHtMillicents: 198_000,
    publicTtcCents: 250,
  },
  {
    nom: "MIE BRIOCHE PIECE 500G CUIT",
    famille: "viennoiseries",
    proHtMillicents: 513_000,
    publicTtcCents: 650,
  },
  {
    nom: "CROIX DE SAVOIE",
    famille: "viennoiseries",
    proHtMillicents: 230_000,
    publicTtcCents: 300,
  },
  { nom: "SABLE SUISSE", famille: "viennoiseries", proHtMillicents: 300_000, publicTtcCents: 380 },
  {
    nom: "CROISSANT AUX AMANDES",
    famille: "viennoiseries",
    proHtMillicents: 230_000,
    publicTtcCents: 300,
  },
  {
    nom: "PAIN AU CHOCOLAT AMANDES",
    famille: "viennoiseries",
    proHtMillicents: 230_000,
    publicTtcCents: 300,
  },
  { nom: "GROS COOKIE", famille: "viennoiseries", proHtMillicents: 320_000, publicTtcCents: 400 },
  { nom: "BAGUETTE TRADITION", famille: "pains", proHtMillicents: 157_000, publicTtcCents: 200 },
  {
    nom: "BAGUETTE ARTISANE 200 G",
    famille: "pains",
    proHtMillicents: 140_000,
    publicTtcCents: 180,
  },
  {
    nom: "BAGUETTE VILLAGE PLATEAU 200GR",
    famille: "pains",
    proHtMillicents: 187_000,
    publicTtcCents: 200,
  },
  {
    nom: "PAIN VIKING PIECE 300G",
    famille: "pains",
    proHtMillicents: 316_000,
    publicTtcCents: 400,
  },
  { nom: "PT PAIN BEAUFORT", famille: "pains", proHtMillicents: 170_000, publicTtcCents: 210 },
  {
    nom: "PAIN MOISSON PIECE 300G",
    famille: "pains",
    proHtMillicents: 316_000,
    publicTtcCents: 400,
  },
  { nom: "FLUTE VILLAGE 450 G", famille: "pains", proHtMillicents: 197_000, publicTtcCents: 250 },
  { nom: "CAMPAGNE 300 G", famille: "pains", proHtMillicents: 316_000, publicTtcCents: 400 },
  {
    nom: "BAGUETTE CAMPAGRAIN 200 G",
    famille: "pains",
    proHtMillicents: 197_000,
    publicTtcCents: 250,
  },
  {
    nom: "FICELLE ARTISANE 140 G",
    famille: "pains",
    proHtMillicents: 140_000,
    publicTtcCents: 175,
  },
  { nom: "FLUTE ARTISANE 420 G", famille: "pains", proHtMillicents: 280_000, publicTtcCents: 350 },
  {
    nom: "FLUTE TRADITION PIECE 450 G",
    famille: "pains",
    proHtMillicents: 280_000,
    publicTtcCents: 350,
  },
  { nom: "COMPLET 300 G", famille: "pains", proHtMillicents: 316_000, publicTtcCents: 400 },
  { nom: "SEIGLE 300G", famille: "pains", proHtMillicents: 316_000, publicTtcCents: 400 },
  { nom: "PAIN SPORTIF AU KG", famille: "pains", proHtMillicents: 1_270_000, publicTtcCents: 1600 },
  { nom: "CAMPAILLOU AU KG", famille: "pains", proHtMillicents: 790_000, publicTtcCents: 1000 },
  { nom: "PAVE NOIX PIECE 300 G", famille: "pains", proHtMillicents: 395_000, publicTtcCents: 500 },
  { nom: "MIE CARRE FRAIS 340 G", famille: "pains", proHtMillicents: 435_000, publicTtcCents: 550 },
  {
    nom: "ARTELETTE MYRTILLES",
    famille: "patisseries",
    proHtMillicents: 320_000,
    publicTtcCents: 600,
  },
  {
    nom: "FLAN NATURE PART",
    famille: "patisseries",
    proHtMillicents: 450_000,
    publicTtcCents: 400,
  },
  {
    nom: "TARTELETTE FRAMBOISES",
    famille: "patisseries",
    proHtMillicents: 320_000,
    publicTtcCents: 600,
  },
  {
    nom: "DELICE DES NEIGES",
    famille: "patisseries",
    proHtMillicents: 450_000,
    publicTtcCents: 400,
  },
  { nom: "ECLAIR CHOCOLAT", famille: "patisseries", proHtMillicents: 450_000, publicTtcCents: 600 },
  {
    nom: "TARTELETTE CITRON",
    famille: "patisseries",
    proHtMillicents: 450_000,
    publicTtcCents: 600,
  },
  { nom: "ECLAIR CAFE", famille: "patisseries", proHtMillicents: 450_000, publicTtcCents: 600 },
  { nom: "ECLAIR VANILLE", famille: "patisseries", proHtMillicents: 450_000, publicTtcCents: 600 },
  {
    nom: "T.PART CITRON MERINGUEE",
    famille: "patisseries",
    proHtMillicents: 450_000,
    publicTtcCents: 600,
  },
  {
    nom: "CRUMBLE FRAMBOISE",
    famille: "patisseries",
    proHtMillicents: 600_000,
    publicTtcCents: 750,
  },
  { nom: "ROSE DES SABLES", famille: "patisseries", proHtMillicents: 320_000, publicTtcCents: 400 },
  { nom: "PYRAMIDE", famille: "patisseries", proHtMillicents: 400_000, publicTtcCents: 500 },
  {
    nom: "TARTELETTE NOIX CARAMEL",
    famille: "patisseries",
    proHtMillicents: 450_000,
    publicTtcCents: 600,
  },
  { nom: "MOUSSE CHOCOLAT", famille: "patisseries", proHtMillicents: 450_000, publicTtcCents: 600 },
  {
    nom: "T. MYRTILLE T1 (4PERS)",
    famille: "patisseries",
    proHtMillicents: 2_400_000,
    publicTtcCents: 3000,
  },
  {
    nom: "MONTBLANC INDIVIDUEL",
    famille: "patisseries",
    proHtMillicents: 550_000,
    publicTtcCents: 700,
  },
  {
    nom: "T.PART POIRE FERMIERE",
    famille: "patisseries",
    proHtMillicents: 400_000,
    publicTtcCents: 500,
  },
  {
    nom: "T.PART ABRICOT FERMIERE",
    famille: "patisseries",
    proHtMillicents: 400_000,
    publicTtcCents: 500,
  },
  {
    nom: "SANDWICH JAMBON BLANC BEAUFORT",
    famille: "traiteur",
    proHtMillicents: 530_000,
    publicTtcCents: 700,
  },
  { nom: "PAN BAGNAT THON", famille: "traiteur", proHtMillicents: 530_000, publicTtcCents: 700 },
  { nom: "PIZZA PART", famille: "traiteur", proHtMillicents: 430_000, publicTtcCents: 550 },
  { nom: "CLUB POULET", famille: "traiteur", proHtMillicents: 530_000, publicTtcCents: 700 },
  {
    nom: "SANDWICH POULET GRAINES",
    famille: "traiteur",
    proHtMillicents: 530_000,
    publicTtcCents: 700,
  },
  {
    nom: "SANDWICH JAMBON CRU TOMME",
    famille: "traiteur",
    proHtMillicents: 530_000,
    publicTtcCents: 700,
  },
  { nom: "SANDWICH PERSILLE", famille: "traiteur", proHtMillicents: 530_000, publicTtcCents: 700 },
  {
    nom: "SANDWICH JAMBON BEURRE CORNICHONS",
    famille: "traiteur",
    proHtMillicents: 710_000,
    publicTtcCents: 650,
  },
  {
    nom: "QUICHE POIREAUX/CHEVRE PART",
    famille: "traiteur",
    proHtMillicents: 460_000,
    publicTtcCents: 600,
  },
  {
    nom: "SALADE CESAR BARQUETTE",
    famille: "traiteur",
    proHtMillicents: 750_000,
    publicTtcCents: 1000,
  },
  {
    nom: "TRANCHE TOMATE MOZZARELLA",
    famille: "traiteur",
    proHtMillicents: 530_000,
    publicTtcCents: 700,
  },
  {
    nom: "QUICHE SAUMON EPINARD PART",
    famille: "traiteur",
    proHtMillicents: 530_000,
    publicTtcCents: 700,
  },
  {
    nom: "SALADE LENTILLES BARQUETTE",
    famille: "traiteur",
    proHtMillicents: 650_000,
    publicTtcCents: 850,
  },
  {
    nom: "TRANCHE MIEL CHEVRE",
    famille: "traiteur",
    proHtMillicents: 710_000,
    publicTtcCents: 650,
  },
  {
    nom: "QUICHE LEGUMES PART",
    famille: "traiteur",
    proHtMillicents: 430_000,
    publicTtcCents: 550,
  },
  { nom: "SANDWICH ROSETTE", famille: "traiteur", proHtMillicents: 530_000, publicTtcCents: 700 },
  {
    nom: "FOUGASSE PROVENCALE",
    famille: "traiteur",
    proHtMillicents: 710_000,
    publicTtcCents: 650,
  },
  { nom: "CROQUE COURGETTE", famille: "traiteur", proHtMillicents: 710_000, publicTtcCents: 650 },
  {
    nom: "CROQUE MONSIEUR RUSTIQUE",
    famille: "traiteur",
    proHtMillicents: 710_000,
    publicTtcCents: 650,
  },
  { nom: "TRANCHE LEGUMES", famille: "traiteur", proHtMillicents: 710_000, publicTtcCents: 650 },
  { nom: "SANDWICH MARAICHER", famille: "traiteur", proHtMillicents: 530_000, publicTtcCents: 700 },
  {
    nom: "GROS FLORENTIN LAIT",
    famille: "chocolat",
    proHtMillicents: 480_000,
    publicTtcCents: 600,
  },
  {
    nom: "GROS FLORENTIN NOIR",
    famille: "chocolat",
    proHtMillicents: 480_000,
    publicTtcCents: 600,
  },
  {
    nom: "TABLETTE CHOCOLAT MAISON LAIT 100G",
    famille: "chocolat",
    proHtMillicents: 700_000,
    publicTtcCents: 1000,
  },
  {
    nom: "SABLE GIANDUJA PIECE 300",
    famille: "chocolat",
    proHtMillicents: 500_000,
    publicTtcCents: 650,
  },
  {
    nom: "MAGALINETTES 150 GRS SACHET",
    famille: "chocolat",
    proHtMillicents: 900_000,
    publicTtcCents: 1300,
  },
  {
    nom: "SABLES GIANDUJA (200 GRS)",
    famille: "chocolat",
    proHtMillicents: 1_200_000,
    publicTtcCents: 1700,
  },
  {
    nom: "BOITE FLORENTINS 220 G",
    famille: "chocolat",
    proHtMillicents: 2_000_000,
    publicTtcCents: 2800,
  },
  {
    nom: "GRIGNOTTINES BOITE 150G",
    famille: "chocolat",
    proHtMillicents: 1_200_000,
    publicTtcCents: 1700,
  },
  {
    nom: "OEUFS PRALINE 150 GRS",
    famille: "chocolat",
    proHtMillicents: 1_100_000,
    publicTtcCents: 1500,
  },
  {
    nom: "MERINGUETTES NOISETTE 100 G",
    famille: "chocolat",
    proHtMillicents: 700_000,
    publicTtcCents: 1000,
  },
  {
    nom: "OUPS 250 GRS CHOCOLAT DES MONTAGNES",
    famille: "chocolat",
    proHtMillicents: 2_200_000,
    publicTtcCents: 3000,
  },
  {
    nom: "BOITE 6 PATTES D’OURSON",
    famille: "chocolat",
    proHtMillicents: 1_150_000,
    publicTtcCents: 1600,
  },
  {
    nom: "MENDIANT 200 GRS BOITE",
    famille: "chocolat",
    proHtMillicents: 1_150_000,
    publicTtcCents: 1600,
  },
];
