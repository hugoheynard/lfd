import type { AppError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * Ce qu'une révision fait de la photo d'une carte : la garder, la retirer, ou
 * la remplacer par une photo **déjà validée**.
 *
 * Une union plutôt qu'un booléen et un fichier facultatif côte à côte : les
 * deux ensemble (« retire-la » ET « voici la nouvelle ») n'ont pas de
 * représentation ici, ils sont refusés à la construction.
 */
export type PhotoChange<P> =
  | { readonly kind: "keep" }
  | { readonly kind: "remove" }
  | { readonly kind: "replace"; readonly photo: P };

/** Ce que l'usage fournit : sa validation de photo, et son refus de l'ambiguïté. */
export interface PhotoChangeRules<P> {
  readonly accept: (bytes: Buffer) => P;
  readonly ambiguous: () => AppError;
}

/**
 * Lit l'intention d'une révision.
 *
 * @throws la fabrique `ambiguous` — retrait demandé ET photo jointe.
 * @throws ce que lève `accept` — la photo jointe n'est pas acceptée.
 */
export function readPhotoChange<P>(
  removePhoto: boolean,
  bytes: Buffer | null,
  rules: PhotoChangeRules<P>,
): PhotoChange<P> {
  if (removePhoto && bytes !== null) {
    throw rules.ambiguous();
  }
  if (removePhoto) {
    return { kind: "remove" };
  }
  return bytes === null ? { kind: "keep" } : { kind: "replace", photo: rules.accept(bytes) };
}
