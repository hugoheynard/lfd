/**
 * Ce qu'un objet de vitrine peut MONTRER — et, sinon, à qui il rend ses cases.
 *
 * 🔴 « Aucune case n'est jamais vide » (Hugo, 2026-09-24 : « dans le doute,
 * pas d'info = articles » ; `documentation/order/boutique-rayon-layout.md`,
 * « Une page par rayon »). Un objet qui n'a rien d'affichable ne laisse pas de
 * trou : ses cases reviennent au reste du rayon, comme des cases libres.
 *
 * Deux lecteurs, une seule définition : l'éditeur le DIT sur l'objet, la
 * boutique (lot 4) rend ses cases au rayon. Deux définitions divergeraient au
 * premier cas ajouté — et l'éditeur promettrait une tuile que la boutique ne
 * montre pas.
 *
 * Les types sont STRUCTURELS : le paquet n'importe pas le contrat (sans zod,
 * D8), il ne lit que ce dont la règle a besoin.
 */

/** Un contenu, réduit à ce qui décide s'il s'affiche. */
export type RenderableContent =
  | { readonly kind: "product"; readonly sku: string }
  | {
      readonly kind: "info";
      readonly title: { readonly fr: string };
      readonly image: { readonly url: string } | null;
    };

/**
 * Un contenu s'affiche-t-il ?
 *
 * - un **produit**, si le catalogue sert encore son SKU (D4) ;
 * - une **info**, si elle a un titre en français. L'image est facultative :
 *   sans elle, c'est une annonce en texte sur le fond de son ton.
 *
 * 🔴 Jusqu'au 2026-09-24, une info sans image était « vide » et rendait ses
 * cases au rayon : les deux premières infos composées en dev (« Tes », « 2 »)
 * n'ont jamais paru en boutique, sans un mot. Une annonce « Fermé le 25 »
 * n'a pas besoin de photo (Hugo : « ça a marché pour produit, pas pour info »).
 */
export function isContentRenderable(
  content: RenderableContent,
  servedSkus: ReadonlySet<string>,
): boolean {
  if (content.kind === "product") {
    return servedSkus.has(content.sku);
  }
  return content.title.fr.trim() !== "";
}

/**
 * L'objet montre-t-il quelque chose ? Oui dès qu'UN de ses contenus s'affiche
 * — les autres sortent du défilement. Aucun contenu : non, et ses cases
 * reviennent au rayon.
 */
export function isRenderable(
  object: { readonly contents: readonly RenderableContent[] },
  servedSkus: ReadonlySet<string>,
): boolean {
  return object.contents.some((content) => isContentRenderable(content, servedSkus));
}
