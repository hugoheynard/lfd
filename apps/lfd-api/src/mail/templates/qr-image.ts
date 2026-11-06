import qrcode from "qrcode-generator";

import { greyscalePng } from "./png.js";

/**
 * **Le QR d'un e-mail**, en PNG, prêt à joindre en ligne.
 *
 * Le jeton de remise voyage dans le corps du message parce que c'est la seule
 * chose qu'on vient chercher debout devant un comptoir : un lien à ouvrir dans
 * l'app, la main sur la porte, ne se scanne pas.
 *
 * Correction de niveau **M** (~15 % de redondance) : un QR d'e-mail est lu sur
 * un écran, souvent tenu de travers, parfois avec une trace de doigt. `L` suffit
 * sur papier propre, `Q` densifie les modules pour rien ici.
 *
 * Le type `0` laisse la bibliothèque choisir la plus petite version qui contient
 * la donnée — écrire une version en dur ferait échouer l'encodage le jour où une
 * URL s'allonge d'un segment.
 */

/** Pixels par module. 6 px donne ~200 px de côté : lisible sans être lourd. */
const SCALE = 6;

/** La zone de silence exigée par la norme, en modules. En dessous, le scan rate. */
const QUIET_ZONE = 4;

/**
 * Rend le PNG d'un QR encodant `value`.
 *
 * **Déterministe** : deux appels sur la même valeur rendent les mêmes octets —
 * ni date, ni aléa, ni compteur. C'est ce qui permet de l'affirmer dans un test,
 * et ce qui évite qu'un e-mail relancé porte une pièce jointe différente.
 */
export function qrPng(value: string): Buffer {
  const code = qrcode(0, "M");
  code.addData(value);
  code.make();

  const modules = code.getModuleCount();
  const grid = Array.from({ length: modules }, (_unused, row) =>
    Array.from({ length: modules }, (_ignored, col) => code.isDark(row, col)),
  );

  return greyscalePng(grid, SCALE, QUIET_ZONE);
}
