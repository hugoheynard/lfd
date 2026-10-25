import { readFileSync } from "node:fs";

/** Le vrai logo imprimable du dépôt : l'en-tête des papiers du fournil le pose tel quel. */
export const PAPER_LOGO = readFileSync(
  new URL("../../../../../assets/logo-la-folie-coffee-noir-et-blanc.png", import.meta.url),
);
