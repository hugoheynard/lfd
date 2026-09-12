import type { DeclareLegalEntityPayload } from "@lfd/contracts";
import type { CommandBus } from "@nestjs/cqrs";

import {
  AssignCreditorIdentifierCommand,
  DeclareLegalEntityCommand,
  SetCreditorAccountCommand,
  SetLegalEntityLogoCommand,
} from "../../b2b/accounting/application/commands/legal-entity-commands.js";
import type { PrismaClient } from "../../platform/database/client/client.js";
import { DocumentStorageUnavailableError } from "../../platform/shared/errors/storage-errors.js";
import { BRAND_LOGO_BW, BRAND_LOGO_FILE_NAME } from "./brand-logo.js";

/**
 * **L'entité émettrice de développement** — celle au nom de qui les mandats SEPA
 * et les factures sortiront.
 *
 * Semée **complète** : raison sociale, ICS et compte créancier. `canCollect()`
 * est donc vrai, et tout ce qui en dépend — le tableau de bord, la fiche de
 * mandat — a de quoi travailler sur un poste neuf.
 *
 * ## 🔴 Les trois valeurs sont FACTICES, et doivent le rester
 *
 * Aucune n'est la nôtre. Le SIREN, l'ICS et l'IBAN ci-dessous sont construits
 * pour être reconnaissables au premier coup d'œil, parce qu'ils vont être
 * IMPRIMÉS : un mandat porte l'ICS en toutes lettres, et c'est lui que le
 * débiteur oppose à sa banque. Une valeur de développement qui ressemblerait à
 * une vraie finirait sur un document qu'on croit bon.
 *
 * ⚠️ Le jour où le DAF fournit le véritable ICS, il ne se pose **pas ici**. Il
 * se saisit par l'écran, sur la base réelle, et il est irréversible une fois
 * attribué (`CreditorIdentifierIsImmutableError`). Un ICS de production écrit
 * dans un fichier de seed est un ICS qu'un `db:seed` malheureux réattribue.
 *
 * ## Par les COMMANDES, jamais par Prisma
 *
 * Même raison que `station.seed.ts` : les value objects valident (clé de Luhn du
 * SIREN, mod-97 de l'IBAN, forme de l'ICS) et `IdGenerator` frappe l'identité.
 * Une écriture directe enjamberait les trois et sèmerait une entité que le
 * produit n'aurait jamais pu produire.
 *
 * ## Complétant, pas seulement idempotent
 *
 * Chaque valeur se décide seule : un poste qui porte déjà l'entité mais pas son
 * ICS reçoit l'ICS. Passer son tour sur la seule existence de la ligne laisserait
 * les postes semés avant cette version définitivement incomplets — et c'est
 * arrivé, l'entité ayant d'abord été semée sans coordonnées.
 */

/** Le libellé sème et sert de compte rendu — un seul endroit pour les deux. */
export const SEEDED_LEGAL_ENTITY_NAME = "Crazeativity";

/**
 * ⚠️ **SIREN de remplissage.**
 *
 * `900000001` passe la clé de Luhn — vérifié contre `isLuhnValid` du dépôt — et
 * n'est pas une suite de zéros, donc le value object l'accepte. Sa forme
 * (`900 000 001`) le rend reconnaissable comme factice, ce qui est exactement ce
 * qu'on veut : il ne doit emprunter le numéro d'aucune entreprise réelle.
 *
 * Le SIREN ne se corrige pas — il identifie la personne morale, et la route de
 * correction ne le porte pas. Passer au vrai numéro se fait en redéclarant.
 */
const SEEDED_SIREN = "900000001";

/**
 * ⚠️ **ICS de remplissage.**
 *
 * `FR` + clé `00` + code activité `ZZZ` + `900001`, qui reprend le SIREN semé :
 * un lecteur qui croise cet ICS sur un document sait d'où il vient. La clé `00`
 * n'est pas calculée, et n'a pas à l'être — `CreditorIdentifier` ne vérifie
 * délibérément pas la clé de contrôle, faute d'ICS réel contre quoi éprouver
 * l'implémentation (la raison est écrite dans le value object).
 */
const SEEDED_ICS = "FR00ZZZ900001";

/**
 * ⚠️ **IBAN de remplissage.**
 *
 * C'est l'IBAN d'exemple canonique de la documentation bancaire française : sa
 * clé mod-97 est valide, donc `Iban.create` l'accepte, et son numéro de compte
 * (`1234567890189`) le désigne comme factice à quiconque le lit.
 *
 * 🔴 Il n'est ici que parce que c'est le compte du **créancier** — le nôtre,
 * celui où l'argent arrive, et qui s'imprime sur un mandat. Un IBAN de
 * **débiteur** ne se sèmerait pas ainsi : il ne se stocke pas en clair
 * (`architecture-prelevement-sepa-direct.md` §4).
 */
const SEEDED_CREDITOR_IBAN = "FR7630006000011234567890189";

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
 * Sème l'entité, puis complète ce qui lui manque. Trois décisions séparées, pour
 * la raison dite plus haut : un poste peut porter l'une sans les autres.
 *
 * La lecture est directe — constater qu'un ICS est déjà posé n'engage aucune
 * règle. L'écriture, elle, passe toujours par le bus.
 */
export async function seedAccounting({ prisma, commands }: AccountingContext): Promise<void> {
  // L'idempotence se joue sur le SIREN plutôt que sur le nom : c'est lui qui
  // porte l'index unique, donc lui qui trancherait de toute façon. Constater sur
  // autre chose laisserait un second passage échouer en base.
  const existing = await prisma.legalEntity.findUnique({ where: { siren: SEEDED_SIREN } });

  let entityId: string;
  if (existing) {
    console.log(`· Entité « ${existing.name} » déjà présente — inchangée.`);
    entityId = existing.id;
  } else {
    entityId = await commands.execute<DeclareLegalEntityCommand, string>(
      new DeclareLegalEntityCommand(ENTITY),
    );
    console.log(`✓ Entité « ${ENTITY.name} ${ENTITY.legalForm} » semée.`);
  }

  // L'ICS est IRRÉVERSIBLE : l'agrégat refuse de le remplacer. La garde n'est
  // donc pas une optimisation, c'est ce qui évite de faire échouer un second
  // `db:seed` sur une exception métier parfaitement légitime.
  if (existing?.ics) {
    console.log(`· ICS déjà attribué (${existing.ics}) — inchangé.`);
  } else {
    await commands.execute(new AssignCreditorIdentifierCommand(entityId, SEEDED_ICS));
    console.log(`✓ ICS ${SEEDED_ICS} attribué — factice, à ne jamais confondre avec le vrai.`);
  }

  // Le compte, lui, se change — on change de banque. Il est reposé seulement
  // s'il manque, pour ne pas écraser un IBAN saisi à la main sur le poste.
  if (existing?.creditorIban) {
    console.log("· Compte créancier déjà posé — inchangé.");
  } else {
    await commands.execute(new SetCreditorAccountCommand(entityId, SEEDED_CREDITOR_IBAN));
    console.log("✓ Compte créancier posé — l'entité peut désormais prélever.");
  }

  if (existing?.logoKey) {
    console.log("· Logo déjà attaché — inchangé.");
  } else {
    await seedLogo(entityId, commands);
  }
}

/**
 * Attache le logo — **sans faire échouer le semis si le stockage manque**.
 *
 * ## 🔴 Le jugement, et sa raison
 *
 * C'est la seule étape du semis qui sorte de Postgres : elle écrit dans MinIO.
 * Sur un poste où `pnpm dev:infra` n'a pas démarré le conteneur de stockage,
 * elle échoue — et la question est ce qu'on fait alors du reste.
 *
 * **On continue.** Le logo est décoratif : sans lui, l'entité prélève et son
 * mandat sort avec une cellule vide, ce qui est un document valide. Le reste du
 * semis, lui, ne l'est pas — la station, l'entité, le client, ses commandes sont
 * ce sur quoi on travaille. Faire tomber tout un jeu de données parce qu'un rond
 * manque sur un PDF de développement échangerait une gêne visible contre un
 * poste inutilisable, et l'échange est mauvais dans ce sens-là.
 *
 * ⚠️ Ce qui est rattrapé est **exactement** `DocumentStorageUnavailableError`, et
 * rien d'autre. Un `catch` large avalerait aussi le refus du domaine (logo trop
 * petit, format inattendu) : le jour où la constante embarquée cesserait de
 * passer les bornes, le semis se tairait, et on chercherait pourquoi les mandats
 * de développement n'ont plus de rond. Le refus métier, lui, doit faire tomber
 * le semis — il signale que le jeu de données ne correspond plus au produit.
 *
 * L'avertissement nomme la commande qui répare : un message qui dit seulement
 * « échec » se lit deux fois et n'apprend rien.
 */
async function seedLogo(entityId: string, commands: CommandBus): Promise<void> {
  try {
    await commands.execute(
      new SetLegalEntityLogoCommand(entityId, BRAND_LOGO_FILE_NAME, BRAND_LOGO_BW),
    );
    console.log("✓ Logo attaché — les mandats de ce poste porteront le rond.");
  } catch (error) {
    if (!(error instanceof DocumentStorageUnavailableError)) {
      throw error;
    }
    console.warn(
      "⚠ Logo non attaché : le stockage objet est indisponible. Le semis continue — " +
        "un mandat sans logo reste valide. Pour l'attacher, démarrez le stockage " +
        "(pnpm dev:infra à la racine) puis relancez le semis.",
    );
  }
}
