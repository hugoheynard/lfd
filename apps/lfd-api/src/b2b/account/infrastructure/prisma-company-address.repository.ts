import {
  type BillingAddressPayload,
  type DeliverySpecs,
  deliverySpecsSchema,
  doorstepRuleSchema,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { AddressKind } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  DeliveryAddressBook,
  type DeliveryAddress,
  type DeliveryBookState,
} from "../domain/entities/delivery-address-book.js";
import { DeliveryAddressBookStaleError } from "../domain/errors/account-errors.js";
import { CompanyAddressRepository } from "../domain/ports/company-address.repository.js";

/** Colonnes postales communes, extraites d'une charge validée. */
function postal(payload: BillingAddressPayload): {
  label: string;
  ligne1: string;
  ligne2: string;
  codePostal: string;
  ville: string;
  pays: string;
} {
  return {
    label: payload.label,
    ligne1: payload.ligne1,
    ligne2: payload.ligne2,
    codePostal: payload.codePostal,
    ville: payload.ville,
    pays: payload.pays,
  };
}

/** Ce que la base rend d'une adresse de livraison, avant rehydratation. */
interface DeliveryRow {
  readonly id: string;
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
  readonly deliverySpecs: unknown;
  readonly depositAllowed: boolean;
  readonly doorstepRule: string | null;
  readonly parkingLat: number | null;
  readonly parkingLng: number | null;
  readonly isDefault: boolean;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
}

/** Consignes vides — une livraison saisie avant que les consignes existent. */
const NO_SPECS: DeliverySpecs = {
  note: "",
  slotList: { mode: "everyday", slots: [] },
  deliveryContact: null,
  gps: null,
  signatureRequired: null,
};

/** Ligne → entrée du carnet. Les consignes sont du JSON libre côté base. */
function toDomain(row: DeliveryRow): DeliveryAddress {
  return {
    id: row.id,
    lines: {
      label: row.label,
      ligne1: row.ligne1,
      ligne2: row.ligne2,
      codePostal: row.codePostal,
      ville: row.ville,
      pays: row.pays,
    },
    specs: specsOf(row.deliverySpecs),
    depositAllowed: row.depositAllowed,
    // Un CHECK tient la valeur en base : une autre lève plutôt que d'être devinée.
    doorstepRule: row.doorstepRule === null ? null : doorstepRuleSchema.parse(row.doorstepRule),
    // Un CHECK tient les deux ensemble : l'un sans l'autre n'existe pas en base.
    parking:
      row.parkingLat === null || row.parkingLng === null
        ? null
        : { lat: row.parkingLat, lng: row.parkingLng },
    createdAt: row.createdAt,
    archivedAt: row.archivedAt,
  };
}

/**
 * La colonne `delivery_specs` est un `jsonb` : elle peut être `null` (livraison
 * d'avant les consignes) et rien en base ne garantit sa forme. Elle passe par
 * le MÊME schéma que les lectures (`prisma-company-address.reader.ts`) : le
 * carnet réécrit toutes ses entrées à chaque geste, et une valeur seulement
 * « reconnue » à la présence de `slots` y entrait brute (plan composition
 * automatique §14.1, BLOQUANT 2). Une forme illisible lève plutôt que d'être
 * réécrite en consignes vides.
 */
function specsOf(value: unknown): DeliverySpecs {
  return value === null || value === undefined ? NO_SPECS : deliverySpecsSchema.parse(value);
}

/** Les colonnes d'une entrée du carnet : celles du chargement, et de la relecture avant écriture. */
const BOOK_COLUMNS = {
  id: true,
  label: true,
  ligne1: true,
  ligne2: true,
  codePostal: true,
  ville: true,
  pays: true,
  deliverySpecs: true,
  depositAllowed: true,
  doorstepRule: true,
  parkingLat: true,
  parkingLng: true,
  isDefault: true,
  archivedAt: true,
  createdAt: true,
} as const;

/**
 * L'empreinte de ce qu'un carnet a lu : ses lignes, triées, sérialisées. Deux
 * lectures égales n'ont rien manqué l'une de l'autre ; une ligne ajoutée,
 * modifiée ou archivée entre-temps la change.
 */
function fingerprintOf(rows: readonly Readonly<Record<string, unknown>>[]): string {
  return JSON.stringify(
    [...rows].sort((left, right) => String(left["id"]).localeCompare(String(right["id"]))),
  );
}

/**
 * Les entrées du carnet dans l'ordre où les écrire : l'adresse par défaut EN
 * DERNIER.
 *
 * L'index unique partiel `addresses_one_default_delivery` (migration
 * `20260903190000_un_seul_defaut_de_livraison`) est vérifié à chaque ligne
 * écrite, pas en fin de transaction. Écrire le nouveau défaut avant que l'ancien
 * ne l'ait perdu fait exister deux défauts le temps d'une ligne, et la base
 * refuse (409). C'est ce qui arrivait en rendant le défaut à une adresse lue
 * AVANT l'actuelle — le `findMany` rend l'ordre physique, que rien ne trie —,
 * et aucun tri du chargement ne l'évite : l'ordre sûr dépend de qui gagne le
 * défaut (constaté le 2026-10-07, e2e « rend le défaut à la première adresse
 * après l'avoir donné à la seconde »).
 */
function defaultLast(state: DeliveryBookState): readonly DeliveryAddress[] {
  const others = state.entries.filter((entry) => entry.id !== state.defaultId);
  const current = state.entries.filter((entry) => entry.id === state.defaultId);
  return [...others, ...current];
}

/**
 * Adaptateur Prisma des adresses.
 *
 * Le mur (appartenance + rôle) est vérifié en amont par les handlers ; ici,
 * chaque écriture reste filtrée sur `companyId` — défense en profondeur. Vrai
 * depuis le 2026-10-07 seulement (`documentation/livraisons/audit-2026-10-07.md`,
 * B2) : le carnet s'écrivait par `upsert` sur le seul `id`, la facturation par
 * un `update` sur l'`id` d'une lecture murée. Toute écriture met désormais à
 * jour SOUS le mur, et crée sinon : un `id` déjà pris par une autre société
 * n'est jamais réécrit, sa création se heurte à la clé primaire (`P2002`, 409
 * par `mapPersistenceError`) et la transaction du carnet tombe entière.
 *
 * Ce que cet adaptateur **ne fait plus** : arbitrer le défaut. Il ne démote plus
 * les autres lignes, ne promeut plus la plus ancienne à l'archivage, ne décide
 * plus qu'une première adresse devient le défaut. Ces quatre règles vivaient ici,
 * en SQL, éclatées sur quatre méthodes ; elles sont dans `DeliveryAddressBook`.
 * Il ne reste qu'une traduction : `is_default` vaut vrai pour l'unique
 * `defaultId` du carnet, faux partout ailleurs.
 */
@Injectable()
export class PrismaCompanyAddressRepository extends CompanyAddressRepository {
  /**
   * Ce que chaque carnet chargé a lu, pour refuser de l'écrire si la base a
   * bougé depuis (2026-10-07). Une carte faible : un carnet oublié ne retient
   * rien. Un carnet qui n'a pas été chargé ici (neuf) n'est pas vérifié.
   */
  private readonly readAs = new WeakMap<DeliveryAddressBook, string>();

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async saveBilling(companyId: string, payload: BillingAddressPayload): Promise<void> {
    // Une seule facturation par entreprise : on met à jour celle qui existe, on la
    // crée sinon. Pas d'`isDefault` sur une facturation (notion propre à la livraison).
    const { count } = await this.prisma.address.updateMany({
      where: { companyId, kind: AddressKind.billing, archivedAt: null },
      data: postal(payload),
    });
    if (count === 0) {
      await this.prisma.address.create({
        data: { companyId, kind: AddressKind.billing, isDefault: false, ...postal(payload) },
      });
    }
  }

  async loadDeliveryBook(companyId: string): Promise<DeliveryAddressBook> {
    const rows = await this.prisma.address.findMany({
      where: { companyId, kind: AddressKind.delivery },
      select: BOOK_COLUMNS,
    });
    const current = rows.find((row) => row.isDefault && row.archivedAt === null);
    const book = DeliveryAddressBook.reconstitute({
      companyId,
      entries: rows.map(toDomain),
      defaultId: current?.id ?? null,
    });
    this.readAs.set(book, fingerprintOf(rows));
    return book;
  }

  async saveDeliveryBook(book: DeliveryAddressBook): Promise<void> {
    const state = book.toPersistence();
    // Le carnet de CETTE société, tel que `loadDeliveryBook` le lit.
    const wall = { companyId: state.companyId, kind: AddressKind.delivery };
    const read = this.readAs.get(book);
    await this.prisma.$transaction(async (tx) => {
      // Deux gestes sur le même carnet passent l'un après l'autre : le verrou
      // de la société les range, et le second relit ce que le premier a écrit.
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${state.companyId} FOR UPDATE`;
      if (read !== undefined) {
        const now = await tx.address.findMany({ where: wall, select: BOOK_COLUMNS });
        if (fingerprintOf(now) !== read) {
          throw new DeliveryAddressBookStaleError();
        }
      }
      for (const entry of defaultLast(state)) {
        const columns = {
          ...entry.lines,
          deliverySpecs: entry.specs,
          // Relu au chargement, réécrit tel quel : seul `allowDeposit` le change.
          depositAllowed: entry.depositAllowed,
          // De même : seul `setDoorstepRule` le change (B3 bis).
          doorstepRule: entry.doorstepRule,
          // De même : seul `correctPoint` le change (§6).
          parkingLat: entry.parking?.lat ?? null,
          parkingLng: entry.parking?.lng ?? null,
          // L'unique source du défaut : le carnet, jamais la ligne.
          isDefault: entry.id === state.defaultId,
          archivedAt: entry.archivedAt,
        };
        const { count } = await tx.address.updateMany({
          where: { ...wall, id: entry.id },
          data: columns,
        });
        if (count === 0) {
          await tx.address.create({
            data: { id: entry.id, ...wall, createdAt: entry.createdAt, ...columns },
          });
        }
      }
    });
  }
}
