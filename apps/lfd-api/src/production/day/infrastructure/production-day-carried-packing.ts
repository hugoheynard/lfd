/**
 * **La recopie du colisage de l'ancien poste** — sortie de
 * `PrismaProductionDayRepository` (dette du réassort, 2026-11-02), qui seul
 * l'appelle (vérifié le 2026-11-02). Les colonnes `packed_*` et
 * `container_count` ne sont plus ni lues par le domaine ni écrites par un
 * geste (K3c, §17.3) ; ce fichier est leur seul lecteur, pour qu'un retirage
 * ne les remette pas à vide.
 */

/** Le colisage de l'ancien poste d'une commande, tel que la base le porte. */
interface CarriedOrderPacking {
  readonly packedAt: Date | null;
  readonly packedBy: string | null;
  readonly containerCount: number;
}

/** Le colisage de l'ancien poste d'une ligne, tel que la base le porte. */
interface CarriedLinePacking {
  readonly packedAt: Date | null;
  readonly packedBy: string | null;
  readonly packedInitials: string;
}

/** Ce que `carriedPacking` relit d'une journée — la seule lecture restante des colonnes mortes. */
export interface CarriedPacking {
  /** Par envoi — cf. `carriedKey`. */
  readonly orders: ReadonlyMap<string, CarriedOrderPacking>;
  /** Par `<envoi>/<sku>`. */
  readonly lines: ReadonlyMap<string, CarriedLinePacking>;
}

/** Le client transactionnel, réduit à la seule lecture dont la recopie a besoin. */
export interface PackingCarrierClient {
  readonly productionOrder: {
    findMany(args: {
      where: { serviceDay: string };
      select: {
        orderId: true;
        rank: true;
        packedAt: true;
        packedBy: true;
        containerCount: true;
        lines: { select: { sku: true; packedAt: true; packedBy: true; packedInitials: true } };
      };
    }): Promise<
      readonly (CarriedOrderPacking & {
        readonly orderId: string;
        readonly rank: number;
        readonly lines: readonly (CarriedLinePacking & { readonly sku: string })[];
      })[]
    >;
  };
}

/** La clé d'un envoi dans les tables de recopie — interne à la recopie, jamais écrite. */
export function carriedKey(orderId: string, rank: number): string {
  return `${orderId}:r${String(rank)}`;
}

/**
 * **Relit le colisage de l'ancien poste**, pour le recopier tel quel (cf.
 * `PrismaProductionDayRepository.save`). Rien ne l'interprète : il passe d'une ligne effacée à la ligne
 * recréée, et une commande ou une ligne nouvelle naît avec les défauts de la
 * base.
 */
export async function carriedPacking(
  tx: PackingCarrierClient,
  serviceDay: string,
): Promise<CarriedPacking> {
  const rows = await tx.productionOrder.findMany({
    where: { serviceDay },
    select: {
      orderId: true,
      rank: true,
      packedAt: true,
      packedBy: true,
      containerCount: true,
      lines: { select: { sku: true, packedAt: true, packedBy: true, packedInitials: true } },
    },
  });
  return {
    orders: new Map(
      rows.map((row) => [
        carriedKey(row.orderId, row.rank),
        { packedAt: row.packedAt, packedBy: row.packedBy, containerCount: row.containerCount },
      ]),
    ),
    lines: new Map(
      rows.flatMap((row) =>
        row.lines.map((line) => [
          `${carriedKey(row.orderId, row.rank)}/${line.sku}`,
          { packedAt: line.packedAt, packedBy: line.packedBy, packedInitials: line.packedInitials },
        ]),
      ),
    ),
  };
}
