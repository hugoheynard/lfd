import { checkPlacement, describeFormat, refusalMessage } from "@lfd/storefront-layout";

import { ALL_SHELVES } from "./shelf-key.js";
import { InvalidStorefrontError } from "./storefront-errors.js";
import type { StorefrontObject } from "./storefront-object.js";
import type { StorefrontPage } from "./storefront-page.js";
import type { StorefrontTemplate } from "./storefront-template.js";

/**
 * **Les règles qui se jugent sur l'ensemble** de la vitrine — celles qui font
 * d'elle un agrégat (plan, D2).
 *
 * Fonctions pures, appelées par `Storefront.compose()` et par lui seul. La
 * géométrie (chevauchement, débordement) est celle de `@lfd/storefront-layout`,
 * que l'éditeur applique à la pose : le serveur refuse exactement ce que
 * l'éditeur refuse, avec la même table des formes.
 */

/** Deux pages ne visent pas le même rayon. */
export function assertDistinctPages(pages: readonly StorefrontPage[]): void {
  const seen = new Set<string>();
  for (const page of pages) {
    if (seen.has(page.shelfKey)) {
      throw new InvalidStorefrontError(
        "duplicate",
        `Le rayon « ${shelfLabel(page.shelfKey)} » a deux pages : gardez-en une.`,
      );
    }
    seen.add(page.shelfKey);
  }
}

/** Deux objets, ou deux gabarits, ne portent pas le même identifiant. */
export function assertDistinctIds(ids: readonly string[], kind: "objet" | "gabarit"): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new InvalidStorefrontError("duplicate", `Le ${kind} ${id} est envoyé deux fois.`);
    }
    seen.add(id);
  }
}

/** Deux gabarits ne portent pas le même nom, à la casse et aux accents près. */
export function assertDistinctTemplateNames(templates: readonly StorefrontTemplate[]): void {
  const seen = new Map<string, string>();
  for (const template of templates) {
    const clash = seen.get(template.state.nameKey);
    if (clash !== undefined) {
      throw new InvalidStorefrontError(
        "template",
        `Le gabarit « ${clash} » existe déjà : choisissez un autre nom que « ${template.state.name} ».`,
      );
    }
    seen.set(template.state.nameKey, template.state.name);
  }
}

/**
 * **Chaque objet tient sur CHACUN de ses rayons** : il a une page, il ne
 * déborde ni des 5 colonnes ni des rangées de cette page, et il ne chevauche
 * aucun autre objet qui y paraît. Un objet partagé tient partout ou nulle part.
 *
 * @throws {InvalidStorefrontError} le premier refus rencontré, qui nomme l'objet et le rayon.
 */
export function assertPlacements(
  objects: readonly StorefrontObject[],
  pages: readonly StorefrontPage[],
): void {
  const rowsOf = new Map(pages.map((page) => [page.shelfKey, page.rows]));
  const blocks = objects.map((object) => object.toPlacedBlock());
  for (const block of blocks) {
    const where = `« ${describeFormat(block.format)} » posé en colonne ${String(block.column)}, rangée ${String(block.row)}`;
    for (const shelf of block.shelves) {
      const rows = rowsOf.get(shelf);
      if (rows === undefined) {
        throw new InvalidStorefrontError(
          "placement",
          `L'objet ${where} paraît sur le rayon « ${shelfLabel(shelf)} », qui n'a pas de page : ajoutez-la, ou retirez ce rayon de l'objet.`,
        );
      }
      const verdict = checkPlacement(blocks, rows, { ...block, shelves: [shelf] });
      if (!verdict.ok) {
        // Un chevauchement nomme déjà son rayon ; un débordement, non.
        const onShelf =
          verdict.reason === "overlap" ? "" : `, sur le rayon « ${shelfLabel(shelf)} »`;
        throw new InvalidStorefrontError(
          "placement",
          `L'objet ${where}${onShelf} : ${refusalMessage(verdict, rows, shelfLabel)}`,
        );
      }
    }
  }
}

/** Le nom d'un rayon dans une phrase : « Tout », ou sa clé. */
function shelfLabel(shelf: string): string {
  return shelf === ALL_SHELVES ? "Tout" : shelf;
}
