import { BLACK, BOLD, type Doc, HAIRLINE, MM, put, REGULAR } from "./mandate-pdf-drawing.js";

/**
 * **La grille du mandat interentreprises** — le tableau à cellules grises du
 * gabarit DGFiP (`mandat_prelevement_sepa_interentreprise.pdf`).
 *
 * Propre à cette mise en page : le mandat CORE garde la grille EPC à zones
 * numérotées (`core-mandate-rows.ts`). Les champs à remplir du gabarit sont
 * aplats bleus d'un formulaire à l'écran ; ici ils sont **blancs et cernés**,
 * parce que ce papier s'imprime et s'écrit à la main — une encre sur un aplat
 * soutenu ne se relit pas.
 */
export const LEFT = 20 * MM;
export const RIGHT = 190 * MM;
export const WIDTH = RIGHT - LEFT;

/** Le gris des bandeaux de rubrique et des cellules de libellé. */
export const LABEL_GRAY = "#D9D9D9";
/** Le gris soutenu du bandeau de consigne, sous le titre. */
export const BAND_GRAY = "#7F7F7F";
/** Le gris des repères « JJMMAAAA » dans le peigne de la date. */
export const HINT_GRAY = "#9A9A9A";

/** Le corps des libellés de la grille. */
export const LABEL_SIZE = 8.5;
/** Le corps des valeurs préremplies. */
export const VALUE_SIZE = 9;

/** Hauteur de capitale d'Helvetica, en fraction du corps (AFM : 718/1000). */
const CAP_HEIGHT = 0.718;

/** L'ordonnée où poser un texte d'un corps donné pour le centrer dans une rangée. */
export function middle(y: number, height: number, size: number): number {
  return y + (height - CAP_HEIGHT * size) / 2;
}

/** Une cellule cernée, grisée si `fill` est donné. */
export function cell(
  doc: Doc,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string | null = null,
): void {
  doc.save().lineWidth(HAIRLINE).strokeColor(BLACK);
  if (fill === null) {
    doc.rect(x, y, width, height).stroke();
  } else {
    doc.rect(x, y, width, height).fillAndStroke(fill, BLACK);
  }
  doc.restore();
  doc.fillColor(BLACK);
}

/** Un bandeau de rubrique gris, pleine largeur, titre gras centré. */
export function heading(doc: Doc, y: number, text: string, height = 5 * MM): number {
  cell(doc, LEFT, y, WIDTH, height, LABEL_GRAY);
  put(doc, text, LEFT, middle(y, height, LABEL_SIZE + 0.5), {
    size: LABEL_SIZE + 0.5,
    font: BOLD,
    width: WIDTH,
    align: "center",
  });
  return y + height;
}

/** Une cellule de libellé : texte gras centré, sur une ou deux lignes. */
export function labelCell(
  doc: Doc,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  fill: string | null = LABEL_GRAY,
): void {
  cell(doc, x, y, width, height, fill);
  doc.font(BOLD).fontSize(LABEL_SIZE);
  const textHeight = doc.heightOfString(text, { width: width - 2 * MM });
  put(doc, text, x + 1 * MM, y + (height - textHeight) / 2 + 0.3 * MM, {
    size: LABEL_SIZE,
    font: BOLD,
    width: width - 2 * MM,
    align: "center",
  });
}

/** Une valeur préremplie, en gras, centrée verticalement dans sa rangée. */
export function value(doc: Doc, text: string, x: number, y: number, height: number): void {
  if (text !== "") {
    put(doc, text, x, middle(y, height, VALUE_SIZE), { size: VALUE_SIZE, font: BOLD });
  }
}

/** Le plus petit corps qu'une valeur s'autorise pour tenir dans sa case. */
const MIN_FITTED_SIZE = 6;
const FITTED_STEP = 0.5;

/**
 * Une valeur préremplie dans une **case étroite** : le corps descend jusqu'à ce
 * qu'elle tienne sur une ligne, sans passer sous 6 pt ; au-delà, elle passe à
 * la ligne dans la largeur de la case.
 *
 * Existe pour la civilité ou forme juridique du titulaire, bornée à 40
 * caractères pour une case de 28 mm : {@link value}, sans largeur, la ferait
 * déborder sur le libellé voisin.
 */
export function fittedValue(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (text === "") {
    return;
  }
  const widthAt = (size: number): number => doc.font(BOLD).fontSize(size).widthOfString(text);
  let size = VALUE_SIZE;
  while (size > MIN_FITTED_SIZE && widthAt(size) > width) {
    size -= FITTED_STEP;
  }
  if (widthAt(size) <= width) {
    put(doc, text, x, middle(y, height, size), { size, font: BOLD });
    return;
  }
  const wrapped = doc.font(BOLD).fontSize(size).heightOfString(text, { width });
  put(doc, text, x, y + (height - wrapped) / 2, { size, font: BOLD, width });
}

/**
 * Une ligne d'adresse : l'amorce en romain (« Code postal et ville : ») puis la
 * valeur. Rend l'abscisse où la valeur commence.
 */
export function addressLine(
  doc: Doc,
  x: number,
  y: number,
  height: number,
  prompt: string,
  filled: string,
): number {
  put(doc, prompt, x, middle(y, height, LABEL_SIZE), { size: LABEL_SIZE, font: REGULAR });
  const start = x + doc.font(REGULAR).fontSize(LABEL_SIZE).widthOfString(prompt) + 1.5 * MM;
  value(doc, filled, start, y, height);
  return start;
}
