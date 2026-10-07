/**
 * E2E **les positions entières ou nulles** — les cinq CHECK « ensemble ou
 * aucune » des positions relevées au geste et des points du carnet
 * (`documentation/livraisons/livreur/gps-y-aller-et-position.md`).
 *
 * Régression (audit du 2026-10-07, B3 —
 * `documentation/livraisons/audit-2026-10-07.md`) : la branche « ensemble » de
 * ces contraintes ne portait que des bornes (`BETWEEN`, `>= 0`), jamais
 * `IS NOT NULL`. Une comparaison avec NULL vaut NULL, et un CHECK qui vaut NULL
 * laisse passer : `lat` posée, `lng` nulle, la ligne entrait. Réécrites sous
 * le même nom par la migration `20261007200000_les_positions_entieres_ou_nulles`.
 *
 * Seule une écriture BRUTE peut éprouver ces contraintes : aucun chemin
 * applicatif n'écrit de position partielle — `GesturePosition` et `GeoPoint`
 * portent leurs champs ensemble, et la purge les remet à NULL ensemble
 * (vérifié le 2026-10-07). Les lignes éprouvées, elles, naissent des vrais
 * gestes : une tournée partie (l'arrêt, son exécution), une adresse du carnet,
 * une décision du bureau par sa factory et son adaptateur.
 */
import { AddressSuggestionDecision } from "../src/delivery/domain/entities/address-suggestion-decision.js";
import { AddressSuggestionDecisionRepository } from "../src/delivery/domain/ports/address-suggestion-decision.repository.js";
import { staffWithRole } from "./delivery-driver-scene.js";
import { departedStops, DOOR_DAY, DOOR_ROLE } from "./delivery-handover-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, forgetCustomer } from "./delivery-rounds-scene.js";
import { forgetRoutingScene, seedLocatedDelivery } from "./delivery-routing-scene.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  type E2eContext,
} from "./e2e-harness.js";

/** Des colonnes et leurs valeurs ; `null` écrit NULL. */
type Columns = Readonly<Record<string, number | null>>;

/** Une contrainte « entières ou nulles », et de quoi l'éprouver par SQL brut. */
interface WholeOrNullCheck {
  readonly constraint: string;
  /** Schéma compris, tel que la migration d'origine le nomme. */
  readonly table: string;
  readonly key: string;
  /** La position ENTIÈRE : une valeur dans les bornes pour chaque colonne. */
  readonly whole: Readonly<Record<string, number>>;
  /** Pour chaque colonne, une valeur HORS de ses bornes d'origine. */
  readonly outside: Readonly<Record<string, number>>;
  /** Sème la ligne éprouvée par les vrais gestes ; rend sa clé. */
  readonly seedRow: () => Promise<string>;
}

/** Le point du carnet que la scène du retrait sème (`delivery-handover-scene.ts`). */
const CARNET = { lat: 45.6, lng: 6.1 } as const;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
  forgetRoutingScene();
  await ctx.asSub(E2E_STAFF_SUB).post("/admin/staff-roles").send(DOOR_ROLE).expect(201);
});

/** Un arrêt d'une tournée partie : sa ligne d'arrêt, et l'exécution que le départ a figée. */
async function departedStopId(): Promise<string> {
  const paul = await staffWithRole(ctx, "livreur-paul");
  const { stops } = await departedStops(ctx, paul, 1);
  return stops[0]?.stopId ?? "";
}

/** L'adresse de livraison qu'une commande relie, au carnet de sa société. */
async function deliveryAddressId(): Promise<string> {
  const orderId = await seedLocatedDelivery(ctx, DOOR_DAY, CARNET);
  const order = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { deliveryAddressId: true },
  });
  return order.deliveryAddressId ?? "";
}

/** « Ignorer » une suggestion, par la factory du domaine et l'adaptateur réel. */
async function decisionId(): Promise<string> {
  const decision = AddressSuggestionDecision.ignore({
    id: "decision-e2e",
    // Opaque, sans clé étrangère vers `public.addresses` : rien à semer derrière.
    addressId: "adresse-e2e",
    kind: "door",
    point: CARNET,
    at: new Date(daysAgo(1)),
    author: { staffUserId: E2E_STAFF_ID, name: "Opérateur E2E" },
  });
  await ctx.app.get(AddressSuggestionDecisionRepository).record(decision);
  return decision.toSnapshot().id;
}

const CHECKS: readonly WholeOrNullCheck[] = [
  {
    constraint: "delivery_round_stop_closed_position_check",
    table: `"delivery"."delivery_round_stop"`,
    key: `"id"`,
    whole: { closed_lat: 45.4612, closed_lng: 6.9031, closed_accuracy_m: 14 },
    outside: { closed_lat: 90.5, closed_lng: 180.5, closed_accuracy_m: -1 },
    seedRow: departedStopId,
  },
  {
    constraint: "delivery_stop_execution_arrived_position_check",
    table: `"delivery"."delivery_stop_execution"`,
    key: `"stop_id"`,
    whole: { arrived_lat: 45.4612, arrived_lng: 6.9031, arrived_accuracy_m: 14 },
    outside: { arrived_lat: -90.5, arrived_lng: -180.5, arrived_accuracy_m: -0.5 },
    seedRow: departedStopId,
  },
  {
    constraint: "delivery_stop_execution_parking_point_check",
    table: `"delivery"."delivery_stop_execution"`,
    key: `"stop_id"`,
    whole: { parking_lat: CARNET.lat, parking_lng: CARNET.lng },
    outside: { parking_lat: 91, parking_lng: 181 },
    seedRow: departedStopId,
  },
  {
    constraint: "addresses_parking_point_check",
    table: `"public"."addresses"`,
    key: `"id"`,
    whole: { parking_lat: CARNET.lat, parking_lng: CARNET.lng },
    outside: { parking_lat: -91, parking_lng: -181 },
    seedRow: deliveryAddressId,
  },
  {
    constraint: "delivery_address_suggestion_decision_point_check",
    table: `"delivery"."delivery_address_suggestion_decision"`,
    key: `"id"`,
    whole: { point_lat: CARNET.lat, point_lng: CARNET.lng },
    outside: { point_lat: 95, point_lng: 185 },
    seedRow: decisionId,
  },
];

/** `UPDATE` brut des colonnes données : la seule écriture qui puisse encore tenter une position partielle. */
function write(check: WholeOrNullCheck, key: string, columns: Columns): Promise<number> {
  const assignments = Object.entries(columns)
    .map(([column, value]) => `"${column}" = ${value === null ? "NULL" : String(value)}`)
    .join(", ");
  return ctx.prisma.$executeRawUnsafe(
    `UPDATE ${check.table} SET ${assignments} WHERE ${check.key} = $1`,
    key,
  );
}

/** Relit les colonnes de la contrainte sur la ligne éprouvée. */
async function read(check: WholeOrNullCheck, key: string): Promise<Columns | undefined> {
  const columns = Object.keys(check.whole)
    .map((column) => `"${column}"`)
    .join(", ");
  const rows = await ctx.prisma.$queryRawUnsafe<Columns[]>(
    `SELECT ${columns} FROM ${check.table} WHERE ${check.key} = $1`,
    key,
  );
  return rows[0];
}

/**
 * Chaque position PARTIELLE : toute partie des colonnes, ni vide ni pleine,
 * posée — les autres à NULL. Six formes sur trois colonnes, deux sur deux :
 * `lat` et `lng` sans précision compte autant que `lat` seule.
 */
function partials(whole: WholeOrNullCheck["whole"]): readonly Columns[] {
  const names = Object.keys(whole);
  const subsets = names.reduce<readonly (readonly string[])[]>(
    (found, name) => [...found, ...found.map((subset) => [...subset, name])],
    [[]],
  );
  return subsets
    .filter((posed) => posed.length > 0 && posed.length < names.length)
    .map((posed) =>
      Object.fromEntries(
        names.map((name) => [name, posed.includes(name) ? (whole[name] ?? null) : null]),
      ),
    );
}

/** Chaque position entière dont UNE colonne sort de ses bornes. */
function outOfBounds(check: WholeOrNullCheck): readonly Columns[] {
  return Object.entries(check.outside).map(([name, value]) => ({ ...check.whole, [name]: value }));
}

/** La position effacée, telle que la purge à 60 jours la laisse. */
function cleared(whole: WholeOrNullCheck["whole"]): Columns {
  return Object.fromEntries(Object.keys(whole).map((name) => [name, null]));
}

describe.each(CHECKS)("$constraint", (check) => {
  it("une position partielle est refusée, en nommant la contrainte, et rien n'est écrit", async () => {
    const key = await check.seedRow();
    const before = await read(check, key);
    const shapes = partials(check.whole);
    expect(before).toBeDefined();
    expect(shapes).not.toHaveLength(0);

    for (const partial of shapes) {
      await expect(write(check, key, partial)).rejects.toThrow(check.constraint);
    }

    expect(await read(check, key)).toEqual(before);
  });

  it("entière dans ses bornes puis effacée : acceptée ; une colonne hors bornes : refusée", async () => {
    const key = await check.seedRow();
    const shapes = outOfBounds(check);
    expect(shapes).not.toHaveLength(0);

    for (const outside of shapes) {
      await expect(write(check, key, outside)).rejects.toThrow(check.constraint);
    }
    await expect(write(check, key, check.whole)).resolves.toBe(1);
    expect(await read(check, key)).toEqual(check.whole);
    await expect(write(check, key, cleared(check.whole))).resolves.toBe(1);
    expect(await read(check, key)).toEqual(cleared(check.whole));
  });
});
