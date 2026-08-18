/** Une famille reçue du PIM — des faits, sans aucune décision locale. */
export interface CatalogCategoryFacts {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly parentId: string | null;
  readonly position: number;
  /** `null` = famille non réglée dans le PIM. On ne remplit jamais ce trou. */
  readonly vatRatePercent: number | null;
  readonly receivedAt: Date;
}

/**
 * Les familles sont une **projection**, pas un agrégat — et le nom du port le
 * dit pour qu'on ne s'y trompe pas.
 *
 * La question de tri du CLAUDE.md : « existe-t-il une règle qui peut refuser
 * cette écriture ? ». Ici non. Une famille reçue n'a ni état, ni transition, ni
 * décision prise sur elle : la plateforme ne renomme pas les rayons du PIM et
 * n'en change pas la TVA. C'est un miroir, remplacé en bloc.
 *
 * Les **articles**, eux, portent une décision (prix B2B, visibilité) : ils sont
 * un agrégat, et passent par `CatalogItemRepository`. Le jour où une famille
 * gagnerait une décision propre — un rangement B2B, un rayon supplémentaire —
 * elle deviendrait un agrégat à son tour, et ce port disparaîtrait.
 */
export abstract class CatalogCategoryProjection {
  /** Remplace le miroir des familles par celui du snapshot. */
  abstract replaceAll(categories: readonly CatalogCategoryFacts[]): Promise<void>;
}
