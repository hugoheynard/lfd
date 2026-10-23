-- LE LOT REJETÉ PAR LA BANQUE (PSR1 après « Marquer déposé »)
-- (`documentation/comptabilite/prelevement/plan-lot-rejete-par-la-banque.md`, § 0, § 6)
--
-- Un lot DÉPOSÉ dont la banque refuse le fichier entier passe
-- `rejected_by_bank` : il garde la trace de son dépôt, gagne celle du rejet,
-- et ne compte plus comme lot vivant de sa clôture.
--
-- Ce que la migration fait aux lignes EXISTANTES : rien n'est réécrit.
-- 1. Trois colonnes nullables neuves (`rejected_at`, `rejected_by_staff_id`,
--    `rejection_reason`), nulles partout. Pas de clé étrangère sur
--    `rejected_by_staff_id`, comme ses voisines `deposited_by_staff_id` et
--    `cancelled_by_staff_id` (vérifié le 2026-10-23 : aucune n'en a).
-- 2. `collection_batch_deposited_is_signed` est REMPLACÉ : la trace du dépôt
--    va avec `deposited` OU `rejected_by_bank` (un lot rejeté a été déposé).
--    Pour toute ligne qui n'est pas `rejected_by_bank` — aucune ne l'est —
--    la condition est identique à l'ancienne.
-- 3. `collection_batch_rejected_is_signed` (neuf) : les trois colonnes du
--    rejet posées ssi `status = 'rejected_by_bank'`. Vraie sur toute ligne
--    existante (colonnes nulles, aucun lot rejeté).
-- 4. `collection_batch_one_live_per_cycle` est RECRÉÉ : un lot rejeté ne
--    compte pas plus qu'un lot annulé, sans quoi la clôture ne se
--    reconstituerait jamais. Il couvre exactement les mêmes lignes
--    qu'avant, puisqu'aucune n'est `rejected_by_bank`.
-- 5. `collection_batch_transition` (neuf) : `rejected_by_bank` ne s'atteint
--    QUE depuis `deposited`, et n'en sort jamais (terminal, trace du rejet
--    et du dépôt figées). C'est la condition du point 6.
-- 6. `billing_statement_immutable` est REMPLACÉ (`CREATE OR REPLACE`) :
--    l'arrêté d'un lot s'annule tant que le lot est `constituted` — inchangé —
--    OU qu'il est `rejected_by_bank` en base. Le lot s'écrit donc AVANT ses
--    arrêtés (`RejectCollectionBatchByBankHandler`). Un relâchement borné à
--    un état que seul le geste atteint (point 5).
--
-- Retour arrière (migration EN AVANT) : remettre l'ancien corps de
-- `billing_statement_immutable` (`20261008140000`), supprimer le
-- déclencheur et la fonction `collection_batch_transition`, recréer l'index
-- avec `WHERE "status" <> 'cancelled'` et l'ancien CHECK — ce qui n'est
-- possible que tant qu'AUCUN lot n'est `rejected_by_bank`. Après le premier
-- rejet, un lot rejeté est une pièce : ne pas le faire.

SET lock_timeout = '5s';

-- 1. La trace du rejet.
ALTER TABLE "public"."collection_batch"
    ADD COLUMN "rejected_at" TIMESTAMPTZ(3),
    ADD COLUMN "rejected_by_staff_id" TEXT,
    ADD COLUMN "rejection_reason" TEXT;

-- 2. Un lot rejeté garde la trace de son dépôt.
ALTER TABLE "public"."collection_batch"
    DROP CONSTRAINT "collection_batch_deposited_is_signed";
ALTER TABLE "public"."collection_batch"
    ADD CONSTRAINT "collection_batch_deposited_is_signed" CHECK (
        ("status" IN ('deposited', 'rejected_by_bank'))
            = ("deposited_at" IS NOT NULL AND "deposited_by_staff_id" IS NOT NULL)
    );

-- 3. Un lot rejeté dit quand, par qui, et pourquoi.
ALTER TABLE "public"."collection_batch"
    ADD CONSTRAINT "collection_batch_rejected_is_signed" CHECK (
        ("status" = 'rejected_by_bank')
            = ("rejected_at" IS NOT NULL
               AND "rejected_by_staff_id" IS NOT NULL
               AND "rejection_reason" IS NOT NULL)
    );

-- 4. Un seul lot VIVANT par (entité, schéma, clôture) : ni annulé, ni rejeté.
DROP INDEX "public"."collection_batch_one_live_per_cycle";
CREATE UNIQUE INDEX "collection_batch_one_live_per_cycle"
    ON "public"."collection_batch"("legal_entity_id", "scheme", "cycle_closes_at")
    WHERE "status" NOT IN ('cancelled', 'rejected_by_bank');

-- 5. `rejected_by_bank` : depuis `deposited` seulement, et terminal.
--    (`TRUNCATE` ne déclenche pas un déclencheur de ligne : la remise à zéro
--    des e2e n'est pas concernée. `last_downloaded_at` reste libre : le
--    fichier d'un lot rejeté se retélécharge.)
CREATE FUNCTION "public"."collection_batch_transition"() RETURNS trigger AS $$
BEGIN
    IF OLD."status" = 'rejected_by_bank' AND (
        NEW."status" IS DISTINCT FROM OLD."status"
        OR NEW."rejected_at" IS DISTINCT FROM OLD."rejected_at"
        OR NEW."rejected_by_staff_id" IS DISTINCT FROM OLD."rejected_by_staff_id"
        OR NEW."rejection_reason" IS DISTINCT FROM OLD."rejection_reason"
        OR NEW."deposited_at" IS DISTINCT FROM OLD."deposited_at"
        OR NEW."deposited_by_staff_id" IS DISTINCT FROM OLD."deposited_by_staff_id"
    ) THEN
        RAISE EXCEPTION 'collection_batch_transition: le lot % est rejeté par la banque, cet état est définitif', OLD."id";
    END IF;
    IF NEW."status" = 'rejected_by_bank' AND OLD."status" <> 'rejected_by_bank'
        AND OLD."status" <> 'deposited' THEN
        RAISE EXCEPTION 'collection_batch_transition: le lot % est %, seul un lot déposé peut être rejeté par la banque', OLD."id", OLD."status";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "collection_batch_transition"
    BEFORE UPDATE ON "public"."collection_batch"
    FOR EACH ROW EXECUTE FUNCTION "public"."collection_batch_transition"();

-- Un lot né rejeté n'a pas été déposé par le geste : refusé aussi.
CREATE FUNCTION "public"."collection_batch_born_live"() RETURNS trigger AS $$
BEGIN
    IF NEW."status" = 'rejected_by_bank' THEN
        RAISE EXCEPTION 'collection_batch_born_live: le lot % ne peut pas naître rejeté par la banque', NEW."id";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "collection_batch_born_live"
    BEFORE INSERT ON "public"."collection_batch"
    FOR EACH ROW EXECUTE FUNCTION "public"."collection_batch_born_live"();

-- 6. L'arrêté d'un lot rejeté par la banque s'annule aussi. Le reste du
--    corps est celui de `20261008140000`, mot pour mot.
CREATE OR REPLACE FUNCTION "public"."billing_statement_immutable"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'billing_statement_immutable: l''arrêté % ne se supprime pas, il s''annule avec son lot', OLD."id";
    END IF;
    IF OLD."status" <> 'active' OR NEW."status" <> 'cancelled'
        OR (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
        RAISE EXCEPTION 'billing_statement_immutable: l''arrêté % ne change que de active à cancelled', OLD."id";
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "public"."collection_batch"
        WHERE "id" = OLD."batch_id" AND "status" IN ('constituted', 'rejected_by_bank')
    ) THEN
        RAISE EXCEPTION 'billing_statement_immutable: le lot % n''est plus constitué (ni rejeté par la banque), son arrêté % ne s''annule plus', OLD."batch_id", OLD."id";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
