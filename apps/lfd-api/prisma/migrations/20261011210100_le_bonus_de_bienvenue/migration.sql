-- Le bonus de bienvenue et l'ouverture du programme (2026-10-11) — lot B du plan
-- `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`
-- (§7 : B2, S2 / R4, S7, S8).
--
-- ADDITIVE : quatre colonnes nullables, un index unique partiel, et le CHECK de
-- forme du grand livre REMPLACÉ (DROP + ADD dans la même transaction) pour
-- connaître `welcome`. Les trois branches existantes sont recopiées À
-- L'IDENTIQUE de `20260926160000_la_fidelite` : aucune ligne déjà écrite ne
-- peut être refusée par le nouveau CHECK.
--
-- ─── Les colonnes ───────────────────────────────────────────────────────────
--
-- · `loyalty_settings.public_opened_at` — le premier instant où le programme
--   a été ouvert au public. Posé par l'application quand `open_to_public`
--   passe à vrai pour la première fois, jamais effacé. Une commande publique
--   passée AVANT ne rapporte rien (R4).
-- · `loyalty_settings.welcome_bonus_points` — NULL = pas de bonus ; sinon un
--   entier > 0 (CHECK).
-- · `loyalty_settings.welcome_bonus_since` — posé chaque fois que le bonus
--   passe de NULL à un nombre ; la passe de nuit du lot C ne rattrape que les
--   comptes devenus comptes depuis.
-- · `users.became_account_at` — l'instant où la fiche est devenue un compte
--   connectable (création, rattachement d'un invité, ouverture d'accès staff :
--   lot A). NULL pour un invité.
--
-- ─── Les reprises, et ce qu'elles approximent ──────────────────────────────
--
-- · `public_opened_at` : si la ligne `default` existe et est ouverte au
--   public, on pose son `updated_at`. C'est une APPROXIMATION PAR EXCÈS : le
--   réglage a pu être rouvert, ou réenregistré, après la vraie ouverture. Les
--   commandes déjà créditées ne sont pas touchées ; une commande publique
--   passée entre la vraie ouverture et ce `updated_at`, et pas encore
--   créditée, ne le sera plus. Une ligne fermée au public reste NULL : la
--   prochaine ouverture posera l'instant exact.
-- · `became_account_at` : pour les fiches déjà connectables
--   (`auth0_sub IS NOT NULL`), `created_at`. Approximation la plus honnête
--   disponible — un invité devenu compte par l'ouverture d'accès staff a un
--   `created_at` antérieur à son passage. Elle ne crée aucun bonus : aucun
--   bonus n'est actif (`welcome_bonus_since` naît NULL partout).
--
-- ⚠️ `updated_at` et `created_at` sont des `TIMESTAMP(3)` sans fuseau, que
-- Prisma écrit en UTC : `AT TIME ZONE 'UTC'` les lit comme tels, quel que soit
-- le fuseau de la session qui applique la migration.
--
-- Retour arrière : DROP INDEX `loyalty_ledger_entries_welcome_user_key` ;
-- remettre le CHECK `loyalty_ledger_entries_kind_shape` d'origine (DROP + ADD
-- des trois branches, possible tant qu'aucune ligne `welcome` n'existe) ;
-- DROP COLUMN des quatre colonnes — perte de l'instant d'ouverture et du
-- réglage du bonus seulement. Aucun droit accordé.

ALTER TABLE "public"."loyalty_settings"
  ADD COLUMN "public_opened_at" TIMESTAMPTZ NULL,
  ADD COLUMN "welcome_bonus_points" INTEGER NULL,
  ADD COLUMN "welcome_bonus_since" TIMESTAMPTZ NULL,
  ADD CONSTRAINT "loyalty_settings_welcome_bonus_positive" CHECK ("welcome_bonus_points" IS NULL OR "welcome_bonus_points" > 0);

ALTER TABLE "public"."users" ADD COLUMN "became_account_at" TIMESTAMPTZ NULL;

UPDATE "public"."loyalty_settings"
   SET "public_opened_at" = "updated_at" AT TIME ZONE 'UTC'
 WHERE "id" = 'default' AND "open_to_public" = true;

UPDATE "public"."users"
   SET "became_account_at" = "created_at" AT TIME ZONE 'UTC'
 WHERE "auth0_sub" IS NOT NULL;

-- Le CHECK de forme : les trois branches d'origine, plus `welcome` — une
-- personne (jamais une société), un montant positif. Rien de plus strict que
-- les autres sortes ; `loyalty_ledger_entries_one_holder` tient déjà le
-- « exactement un titulaire ».
ALTER TABLE "public"."loyalty_ledger_entries" DROP CONSTRAINT "loyalty_ledger_entries_kind_shape";
ALTER TABLE "public"."loyalty_ledger_entries" ADD CONSTRAINT "loyalty_ledger_entries_kind_shape" CHECK (
  ("kind" = 'earned' AND "points" > 0 AND "order_id" IS NOT NULL)
  OR ("kind" = 'converted' AND "points" < 0 AND "voucher_id" IS NOT NULL)
  OR ("kind" = 'adjusted' AND "points" <> 0 AND "staff_user_id" IS NOT NULL
      AND "reason" IS NOT NULL AND btrim("reason") <> '')
  OR ("kind" = 'welcome' AND "points" > 0 AND "user_id" IS NOT NULL AND "company_id" IS NULL)
);

-- Une personne ne reçoit la bienvenue qu'une fois, quel que soit le nombre de
-- passages : la base refuse la seconde.
CREATE UNIQUE INDEX "loyalty_ledger_entries_welcome_user_key" ON "public"."loyalty_ledger_entries"("user_id") WHERE "kind" = 'welcome';
