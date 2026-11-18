import type { Buffer } from "node:buffer";

import type { AllergenMatrixPaper } from "../allergen-matrix-paper.js";

/**
 * **Met en page la matrice** — le port que le domaine tend à la bibliothèque PDF.
 *
 * Le domaine garde le modèle (lignes, colonnes, mentions, dates) ; le dessin
 * (A4 paysage, grille, folio, polices) est un détail de rendu qui change à son
 * rythme et ne doit pas faire importer `platform/pdf` à une règle métier. Un
 * autre rendu (impression, autre format) est un autre adaptateur.
 *
 * La méthode porte le nom du document (`renderAllergenMatrixPdf`) : c'est ce nom
 * que `lint:pdf-specimens` cherche dans le handler d'exemple de la planche des
 * documents, et il garde ce lien visible.
 *
 * Pur : mêmes entrées, mêmes octets — l'instant est dans le papier, le logo est
 * passé, rien n'est lu en route.
 */
export abstract class AllergenMatrixRenderer {
  abstract renderAllergenMatrixPdf(paper: AllergenMatrixPaper, logo: Buffer): Promise<Buffer>;
}
