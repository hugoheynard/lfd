/**
 * **Qui fait le geste que le commerce porte au fournil** — l'auteur d'une
 * annulation ou d'une révision, réduit à ce que les versions du plan gardent
 * (`documentation/fournil/les-versions-du-plan.md`) : la fiche
 * staff et son nom pour l'équipe, la seule nature pour un client ou un
 * invité. Un identifiant de client n'entre pas au schéma `production`.
 */
export type DeskActor =
  | { readonly kind: "staff"; readonly staffId: string; readonly name?: string | null }
  | { readonly kind: "customer" }
  | { readonly kind: "guest" };
