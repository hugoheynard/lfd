import type { RequestKind } from "@lfd/contracts";

import type { CustomerRequestDetails } from "../../domain/customer-request-details.js";

/** Ce que le courriel et la cloche disent d'un type de demande. */
export interface RequestPresentation {
  /** Le nom du formulaire, tel que l'équipe le lit. */
  readonly formLabel: string;
  /** Le numéro de la commande citée ; vide si le type n'en cite pas. */
  readonly orderNumber: string;
  readonly photoCount: number;
}

type DetailsOf<K extends RequestKind> = Extract<CustomerRequestDetails, { readonly kind: K }>;

/**
 * Une présentation par type (OCP) : un type neuf ajoute une entrée, que le
 * `Record` sur `RequestKind` exige — aucun `switch` à rallonger.
 */
const PRESENTATIONS: {
  readonly [K in RequestKind]: (details: DetailsOf<K>) => RequestPresentation;
} = {
  contact: () => ({ formLabel: "Nous écrire", orderNumber: "", photoCount: 0 }),
  order_problem: (details) => ({
    formLabel: "Signaler un problème",
    orderNumber: details.order?.number ?? "",
    photoCount: details.photos.filter((photo) => photo.purgedAt === null).length,
  }),
};

/** La présentation de ces détails. */
export function presentationOf(details: CustomerRequestDetails): RequestPresentation {
  const present = PRESENTATIONS[details.kind] as (d: CustomerRequestDetails) => RequestPresentation;
  return present(details);
}
