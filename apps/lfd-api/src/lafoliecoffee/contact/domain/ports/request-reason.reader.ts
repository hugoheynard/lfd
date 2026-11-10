import type {
  CustomerAudience,
  PublicRequestReasonView,
  RequestKind,
  RequestReasonView,
} from "@lfd/contracts";

/** Port de **lecture** des motifs — pour l'écran de réglage et pour la boutique (ISP). */
export abstract class RequestReasonReader {
  /** Les motifs non archivés de ce formulaire, par rang puis libellé. */
  abstract list(kind: RequestKind): Promise<RequestReasonView[]>;
  /** Les motifs actifs, non archivés, de ce formulaire et visibles pour ce public — sans adresse. */
  abstract offered(
    kind: RequestKind,
    audience: CustomerAudience,
  ): Promise<PublicRequestReasonView[]>;
}
