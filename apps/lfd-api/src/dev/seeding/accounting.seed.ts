import type { DeclareLegalEntityPayload } from "@lfd/contracts";
import type { CommandBus } from "@nestjs/cqrs";

import { DeclareLegalEntityCommand } from "../../b2b/accounting/application/commands/legal-entity-commands.js";
import type { PrismaClient } from "../../platform/database/client/client.js";

/**
 * **L'entité émettrice de développement** — celle au nom de qui les mandats SEPA
 * et les factures sortiront.
 *
 * ## Déclarée INCOMPLÈTE, et c'est le but
 *
 * Ni ICS, ni IBAN. Ce n'est pas un raccourci de semis : c'est l'état réel dans
 * lequel une entité passe ses premières semaines, parce que la Banque de France
 * attribue l'identifiant créancier longtemps après qu'on a saisi la raison
 * sociale. `canCollect()` est donc `false`, et `missingToCollect()` rend la
 * liste de ce qui manque.
 *
 * C'est aussi ce qui rend le tableau de bord intéressant sur un poste neuf : la
 * carte « émetteur » y montre son écart au lieu d'un vert immédiat. Semer une
 * entité déjà complète cacherait l'écran que le staff verra vraiment.
 *
 * 🔴 **Poser l'ICS et l'IBAN reste un geste humain**, par les routes dédiées.
 * L'ICS est irréversible une fois attribué (`CreditorIdentifierIsImmutableError`)
 * et un IBAN de développement en dur finirait par être recopié en production.
 *
 * ## Par la COMMANDE, jamais par Prisma
 *
 * Même raison que `station.seed.ts` : le SIREN est validé par son value object
 * (longueur, chiffres, clé de Luhn, refus des zéros) et l'identité est frappée
 * par `IdGenerator`. Une écriture directe enjamberait les deux et sèmerait une
 * entité que le produit n'aurait jamais pu produire.
 */

/** Le libellé sème et sert de clé d'idempotence — un seul endroit pour les deux. */
export const SEEDED_LEGAL_ENTITY_NAME = "Crazeativity";

/**
 * ⚠️ **SIREN de remplissage, à remplacer par le vrai.**
 *
 * `900000001` passe la clé de Luhn — vérifié contre `isLuhnValid` du dépôt — et
 * n'est pas une suite de zéros, donc le value object l'accepte. Sa forme
 * (`900 000 001`) le rend reconnaissable comme factice au premier coup d'œil,
 * ce qui est exactement ce qu'on veut d'une donnée de développement : elle ne
 * doit ressembler à aucune entreprise réelle, et surtout pas en emprunter le
 * numéro.
 *
 * Le SIREN ne se corrige pas : il identifie la personne morale, et la route de
 * correction ne le porte pas. Passer au vrai numéro se fait en redéclarant.
 */
const SEEDED_SIREN = "900000001";

const ENTITY: DeclareLegalEntityPayload = {
  name: SEEDED_LEGAL_ENTITY_NAME,
  legalForm: "SAS",
  siren: SEEDED_SIREN,
  rcs: "Chambéry",
  // 10 000 € — en centimes, comme tout l'argent du dépôt.
  shareCapitalCents: 1_000_000,
  // ⚠️ Vide à dessein : un numéro de TVA intracommunautaire se dérive du SIREN
  // par une clé que nous ne calculons pas, et l'inventer le ferait imprimer.
  vatNumber: "",
  // ⚠️ Adresse de remplissage, calée sur la station du seed pour la cohérence.
  address: {
    line1: "Route de la Balme",
    line2: "",
    postalCode: "73150",
    city: "Val d'Isère",
    countryCode: "FR",
  },
};

/** Ce dont le semis a besoin : le bus pour écrire, la base pour constater. */
export interface AccountingContext {
  readonly prisma: PrismaClient;
  readonly commands: CommandBus;
}

/**
 * Sème l'entité si elle est absente. Idempotent par le SIREN plutôt que par le
 * nom : c'est lui qui porte l'index unique, donc lui qui déciderait de toute
 * façon — constater sur autre chose laisserait un second passage échouer en
 * base au lieu de passer son tour.
 */
export async function seedAccounting({ prisma, commands }: AccountingContext): Promise<void> {
  const existing = await prisma.legalEntity.findUnique({ where: { siren: SEEDED_SIREN } });
  if (existing) {
    console.log(`· Entité « ${existing.name} » déjà présente — inchangée.`);
    return;
  }
  await commands.execute(new DeclareLegalEntityCommand(ENTITY));
  console.log(
    `✓ Entité « ${ENTITY.name} ${ENTITY.legalForm} » semée — sans ICS ni IBAN, elle ne peut pas encore prélever.`,
  );
}
