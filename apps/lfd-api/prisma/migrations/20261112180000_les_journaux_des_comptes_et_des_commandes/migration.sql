-- LES JOURNAUX DES COMPTES ET DES COMMANDES — plan
-- `documentation/caching-usage/plan-veilleur-unique.md`, § 3.2.
--
-- Strictement ADDITIVE : deux tables neuves, deux fonctions, 48
-- déclencheurs (trois par table surveillée). Aucune colonne existante touchée,
-- aucune donnée déplacée. Les binaires en place ne lisent pas ces tables ; ils
-- les ALIMENTENT sans le savoir, puisque le déclencheur tourne dans la base.
--
-- Retour arrière : `DROP TRIGGER` des déclencheurs, `DROP FUNCTION` des deux
-- fonctions, `DROP TABLE` des deux journaux. Il ne perd que des numéros
-- d'affichage.
--
-- La forme est celle de `public.day_change` : un journal en ajout seul dont le
-- numéro est `max(id)`, jamais un compteur — une ligne de compteur
-- verrouillerait toutes les écritures de comptes jusqu'au commit. Déclencheurs
-- AU NIVEAU DE L'INSTRUCTION : une instruction qui touche des lignes écrit UNE
-- ligne, une instruction qui n'en touche aucune n'écrit rien (tables de
-- transition vides). `TRUNCATE` ne les déclenche pas.
--
-- 🔴 Tout reste dans `public` : aucune table d'un autre schéma n'est
-- surveillée. `handover.order_handover` n'y entre pas — un retrait change le
-- statut de la commande, donc `public.orders`, dont le déclencheur suffit ; un
-- déclencheur de `handover` qui écrirait dans `public` serait la jointure que
-- `lint:cross-schema-join` refuse dans le code.

-- `orders` est la table la plus écrite de la base : mieux vaut que le
-- déploiement échoue proprement en 5 s, et se relance, que de faire attendre
-- les passations derrière la pose d'un déclencheur.
SET lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LES JOURNAUX — en ajout seul ; le numéro est le plus grand `id`
-- ─────────────────────────────────────────────────────────────────────────────
-- `max(id)` est un parcours de la clé primaire à rebours : aucun autre index.
CREATE TABLE IF NOT EXISTS "public"."company_change" (
    "id"          BIGSERIAL    NOT NULL,
    "changed_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "company_change_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."order_change" (
    "id"          BIGSERIAL    NOT NULL,
    "changed_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "order_change_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LES FONCTIONS — une ligne par instruction qui a touché au moins une ligne
-- ─────────────────────────────────────────────────────────────────────────────
-- Une table de transition ne se déclare que pour UN événement : trois
-- déclencheurs par table, une seule fonction par journal, et chaque branche ne
-- lit que la table de transition que son événement déclare.
CREATE OR REPLACE FUNCTION "public"."record_company_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM old_rows) THEN
      INSERT INTO "public"."company_change" DEFAULT VALUES;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM new_rows) THEN
    INSERT INTO "public"."company_change" DEFAULT VALUES;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "public"."record_order_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM old_rows) THEN
      INSERT INTO "public"."order_change" DEFAULT VALUES;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM new_rows) THEN
    INSERT INTO "public"."order_change" DEFAULT VALUES;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LES COMPTES CLIENTS — `companies`
-- ─────────────────────────────────────────────────────────────────────────────
-- Les tables que lisent la liste et la fiche staff des sociétés
-- (`prisma-admin-company.reader.ts`, `prisma-customer-sheet.reader.ts`,
-- `prisma-company-address.reader.ts`, `company-hierarchy.projection.ts`) :
--   · `companies` — la société, KBIS compris (ses colonnes) ;
--   · `users` — le propriétaire nommé dans la liste, l'état des accès sur la fiche ;
--   · `memberships` — propriétaire et accès ; les membres comptent les paniers récurrents ;
--   · `addresses` — facturation et livraison (pièces du dossier, carnet, ville des sous-comptes) ;
--   · `delivery_procedures` — la procédure d'une adresse de livraison ;
--   · `delivery_procedure_steps` — le nombre d'étapes affiché par adresse ;
--   · `company_contacts` — le carnet des contacts ;
--   · `company_follows` — les rattachements (sous-comptes, aspects suivis) ;
--   · `company_collection_form` — la forme d'encaissement d'un sous-compte ;
--   · `support_requests` — le drapeau « demande ouverte » ;
--   · `payment_mandates` — l'avertissement « aucun mandat actif » ;
--   · `company_bank_accounts` — l'existence du RIB sur la fiche ;
--   · `subscriptions` — le compte des paniers récurrents actifs de la fiche ;
--
-- Hors journal, et sans numéro : l'historique (`activity_events`) et ce qui
-- dépend de l'heure seule (échéance d'une invitation, début d'un suivi). Le
-- filet de 5 min des écrans les rattrape. Le chiffre d'affaires et les
-- commandes récentes de la fiche suivent `orders-all`.
CREATE TRIGGER "companies_company_change_insert"
  AFTER INSERT ON "public"."companies"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "companies_company_change_update"
  AFTER UPDATE ON "public"."companies"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "companies_company_change_delete"
  AFTER DELETE ON "public"."companies"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "users_company_change_insert"
  AFTER INSERT ON "public"."users"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "users_company_change_update"
  AFTER UPDATE ON "public"."users"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "users_company_change_delete"
  AFTER DELETE ON "public"."users"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "memberships_company_change_insert"
  AFTER INSERT ON "public"."memberships"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "memberships_company_change_update"
  AFTER UPDATE ON "public"."memberships"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "memberships_company_change_delete"
  AFTER DELETE ON "public"."memberships"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "addresses_company_change_insert"
  AFTER INSERT ON "public"."addresses"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "addresses_company_change_update"
  AFTER UPDATE ON "public"."addresses"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "addresses_company_change_delete"
  AFTER DELETE ON "public"."addresses"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "delivery_procedures_company_change_insert"
  AFTER INSERT ON "public"."delivery_procedures"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "delivery_procedures_company_change_update"
  AFTER UPDATE ON "public"."delivery_procedures"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "delivery_procedures_company_change_delete"
  AFTER DELETE ON "public"."delivery_procedures"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "delivery_procedure_steps_company_change_insert"
  AFTER INSERT ON "public"."delivery_procedure_steps"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "delivery_procedure_steps_company_change_update"
  AFTER UPDATE ON "public"."delivery_procedure_steps"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "delivery_procedure_steps_company_change_delete"
  AFTER DELETE ON "public"."delivery_procedure_steps"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_contacts_company_change_insert"
  AFTER INSERT ON "public"."company_contacts"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_contacts_company_change_update"
  AFTER UPDATE ON "public"."company_contacts"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_contacts_company_change_delete"
  AFTER DELETE ON "public"."company_contacts"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_follows_company_change_insert"
  AFTER INSERT ON "public"."company_follows"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_follows_company_change_update"
  AFTER UPDATE ON "public"."company_follows"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_follows_company_change_delete"
  AFTER DELETE ON "public"."company_follows"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_collection_form_company_change_insert"
  AFTER INSERT ON "public"."company_collection_form"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_collection_form_company_change_update"
  AFTER UPDATE ON "public"."company_collection_form"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_collection_form_company_change_delete"
  AFTER DELETE ON "public"."company_collection_form"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "support_requests_company_change_insert"
  AFTER INSERT ON "public"."support_requests"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "support_requests_company_change_update"
  AFTER UPDATE ON "public"."support_requests"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "support_requests_company_change_delete"
  AFTER DELETE ON "public"."support_requests"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "payment_mandates_company_change_insert"
  AFTER INSERT ON "public"."payment_mandates"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "payment_mandates_company_change_update"
  AFTER UPDATE ON "public"."payment_mandates"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "payment_mandates_company_change_delete"
  AFTER DELETE ON "public"."payment_mandates"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_bank_accounts_company_change_insert"
  AFTER INSERT ON "public"."company_bank_accounts"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_bank_accounts_company_change_update"
  AFTER UPDATE ON "public"."company_bank_accounts"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "company_bank_accounts_company_change_delete"
  AFTER DELETE ON "public"."company_bank_accounts"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "subscriptions_company_change_insert"
  AFTER INSERT ON "public"."subscriptions"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "subscriptions_company_change_update"
  AFTER UPDATE ON "public"."subscriptions"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();
CREATE TRIGGER "subscriptions_company_change_delete"
  AFTER DELETE ON "public"."subscriptions"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_company_change"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TOUTES LES COMMANDES — `orders-all`, sans condition de date
-- ─────────────────────────────────────────────────────────────────────────────
-- Les tables que lit la liste staff des commandes
-- (`prisma-admin-order-list.reader.ts`) :
--   · `orders` — la commande, son statut et son état de paiement (`payment_status`) ;
--   · `order_lines` — les lignes, remplacées par une révision ;
--   · `order_shortfall` — le manque signalé ou décidé, montré par la liste ;
--
-- L'état de paiement affiché est la colonne `orders.payment_status` : aucune
-- table d'un autre schéma à surveiller.
CREATE TRIGGER "orders_order_change_insert"
  AFTER INSERT ON "public"."orders"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_order_change"();
CREATE TRIGGER "orders_order_change_update"
  AFTER UPDATE ON "public"."orders"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_order_change"();
CREATE TRIGGER "orders_order_change_delete"
  AFTER DELETE ON "public"."orders"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_order_change"();
CREATE TRIGGER "order_lines_order_change_insert"
  AFTER INSERT ON "public"."order_lines"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_order_change"();
CREATE TRIGGER "order_lines_order_change_update"
  AFTER UPDATE ON "public"."order_lines"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_order_change"();
CREATE TRIGGER "order_lines_order_change_delete"
  AFTER DELETE ON "public"."order_lines"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_order_change"();
CREATE TRIGGER "order_shortfall_order_change_insert"
  AFTER INSERT ON "public"."order_shortfall"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_order_change"();
CREATE TRIGGER "order_shortfall_order_change_update"
  AFTER UPDATE ON "public"."order_shortfall"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_order_change"();
CREATE TRIGGER "order_shortfall_order_change_delete"
  AFTER DELETE ON "public"."order_shortfall"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."record_order_change"();

RESET lock_timeout;
