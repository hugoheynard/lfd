-- L'**entité juridique émettrice** — nous, pas un client.
--
-- Le bloc `b2b` appelle `companies` le client professionnel. L'émetteur ne peut
-- donc pas s'appeler ainsi, et il n'est pas non plus une ligne de configuration :
-- il porte une identité légale qui s'imprime sur des documents opposables, un
-- identifiant créancier SEPA, et le compte où l'argent arrive.
--
-- **Purement ADDITIVE.** Aucune table existante n'est touchée, aucune colonne
-- déplacée, aucune donnée convertie. Le retour arrière de la TABLE est un
-- `DROP TABLE` sur une table que rien ne référence encore — et il le restera
-- tant que le mandat direct (T2) n'aura pas posé sa clé étrangère.
--
-- ⚠️ **Le retour arrière n'est PAS complet, et il faut le savoir avant de le
-- tenter.** La valeur d'enum ajoutée en fin de fichier ne se retire pas :
-- Postgres n'a pas d'`ALTER TYPE … DROP VALUE`, et la seule sortie est de
-- recréer le type, de recaster chaque colonne qui l'utilise et de reposer ses
-- contraintes. Sur `StaffResource`, cela touche les dérogations de permissions
-- — c'est-à-dire ce qui décide qui a le droit de faire quoi.
--
-- Ce n'est pas grave ici, et c'est la raison d'être de cette note : une valeur
-- d'enum inutilisée ne coûte rien, personne ne la voit, aucune ligne ne la
-- porte. Le geste de repli, en cas de recul, est donc de **laisser la valeur en
-- place** et de retirer la table. Écrire l'inverse dans un runbook ferait
-- entreprendre une recréation de type sous pression, sur la table des
-- permissions, pour rien.
--
-- Trois choix qui ne se relisent pas dans le DDL :
--
-- 1. `id` est TEXT sans `DEFAULT` : l'identité est frappée par la commande
--    (ULID, via le port `IdGenerator`), jamais par la base. C'est ce qui rend la
--    RUM dérivable de l'identifiant avant la première écriture.
-- 2. `ics` est NULLABLE, et c'est un état normal qui dure des semaines : la
--    Banque de France l'attribue longtemps après qu'on a saisi la raison
--    sociale. L'exiger interdirait de préparer le dossier en attendant.
-- 3. `ics` et `siren` sont UNIQUE : deux entités sous le même identifiant
--    créancier rendraient impossible de dire, devant un mandat signé, laquelle
--    a prélevé. Postgres traite les NULL comme distincts, donc l'unicité sur
--    `ics` ne gêne pas les entités encore sans ICS — c'est exactement ce qu'on
--    veut ici, et c'est le piège qu'il faudra éviter ailleurs (cf. §0 ter,
--    objection 2 de `documentation/b2b/architecture-prelevement-sepa-direct.md`).
--
-- ⚠️ L'invariant central n'est PAS ici : `ics` ne se remplace pas une fois posé,
-- parce qu'il est imprimé sur chaque mandat signé. Un CHECK ne sait pas comparer
-- une valeur à son ancienne ; c'est l'agrégat qui refuse, et le refus est
-- éprouvé (`legal-entity.spec.ts`). La hiérarchie du dépôt place ce cas au
-- niveau « refusé par l'agrégat », pas « refusé en base ».

CREATE TABLE "public"."legal_entities" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "legal_form" TEXT NOT NULL,
  "siren" TEXT NOT NULL,
  "rcs" TEXT NOT NULL DEFAULT '',
  "vat_number" TEXT NOT NULL DEFAULT '',
  "share_capital_cents" INTEGER NOT NULL DEFAULT 0,
  "address_line1" TEXT NOT NULL,
  "address_line2" TEXT NOT NULL DEFAULT '',
  "postal_code" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "country_code" TEXT NOT NULL DEFAULT 'FR',
  "ics" TEXT,
  "creditor_iban" TEXT,
  "pre_notification_days" INTEGER NOT NULL DEFAULT 14,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legal_entities_siren_key" ON "public"."legal_entities"("siren");
CREATE UNIQUE INDEX "legal_entities_ics_key" ON "public"."legal_entities"("ics");

-- ─────────────────────────────────────────────────────────────────────────────
-- La ressource de permission qui va avec
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `b2b_accounting` est distincte de `b2b_payments`, et la distinction est le
-- sujet : `b2b_payments` enregistre le mandat d'UN CLIENT — un travail de tous
-- les jours ; `b2b_accounting` change le compte qui reçoit l'argent de
-- l'entreprise — la cible numéro un de la fraude au virement. Les réunir
-- donnerait le second à quiconque a besoin du premier.
--
-- `IF NOT EXISTS` parce qu'une migration se rejoue : sans lui, un second passage
-- échoue sur une valeur déjà présente et bloque la file entière.
--
-- `BEFORE 'b2b_alerts'` pour que l'ordre en base suive l'ordre déclaré dans
-- `schema.prisma`. Sans position, Postgres l'ajoute en queue et le schéma dérive
-- de la base sur un détail qui ne se voit qu'au prochain `migrate diff`.
--
-- ⚠️ **Aucune permission n'est accordée ici.** Les droits par rôle vivent dans
-- `ROLE_GRANTS` (`packages/contracts`), résolus à chaque requête ; cette valeur
-- ne sert qu'aux DÉROGATIONS individuelles, qui sont des lignes en base. Une
-- migration qui distribuerait des droits serait une élévation de privilèges
-- écrite là où personne ne la relit.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_accounting' BEFORE 'b2b_alerts';
