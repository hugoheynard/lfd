-- LA RÉVISION D'UNE COMMANDE
--
-- Plan `documentation/commandes/plan-modifier-une-commande.md`, lot M1 (§9).
--
-- 1. `orders.revision` (`0` à la passation, `+1` à chaque modification) et
--    `orders.revised_at` (`NULL` tant qu'aucune). Toute ligne existante est à
--    sa passation : le défaut `0` est la vérité, rien n'est rattrapé.
-- 2. `public.order_revision` : l'historique — une ligne par modification, qui
--    garde EN ENTIER la composition remplacée, son auteur, sa date et l'écart.
--    Les lignes de `order_lines` sont remplacées en bloc par la révision ;
--    c'est cette table qui fait foi du passé.
-- 3. `production.order_revision_notice` : la révision notée sous le verrou de
--    chaque journée qu'elle touche, que la clôture et le retirage relisent
--    sous le même verrou (§9.1). En ajout seul, sans clé étrangère.
--
-- ADDITIVE : deux colonnes avec défaut, deux tables neuves, aucune donnée
-- touchée, aucun droit accordé. Retour arrière, avant toute modification
-- réelle : `DROP TABLE` des deux tables, puis les deux `DROP COLUMN`.
--
-- Les déclencheurs de journée (`20260928140000_la_version_par_journee`)
-- surveillent `orders`, pas `order_lines` : chaque révision écrit `orders`
-- (au moins `revision`), donc l'ancien et le nouveau jour avancent. La
-- justification qui disait « les lignes ne s'écrivent qu'à la création » est
-- reprise, à jour, dans `test/day-change-triggers.e2e-spec.ts`.

-- `orders` est la table la plus écrite de la base : mieux vaut un déploiement
-- qui échoue proprement et se relance qu'une file de passations bloquées.
SET lock_timeout = '5s';

ALTER TABLE "public"."orders"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "revised_at" TIMESTAMPTZ(6);

CREATE TABLE "public"."order_revision" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "replaced_revision" INTEGER NOT NULL,
    "composition" JSONB NOT NULL,
    "changes" TEXT[],
    "total_before_cents" INTEGER NOT NULL,
    "total_after_cents" INTEGER NOT NULL,
    "revised_by_kind" TEXT NOT NULL,
    "revised_by_user_id" TEXT,
    "revised_by_staff_id" TEXT,
    "revised_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_revision_pkey" PRIMARY KEY ("id"),
    -- Qui a modifié : le client (son compte) ou l'équipe (sa fiche), jamais les deux.
    CONSTRAINT "order_revision_author_check" CHECK (
      ("revised_by_kind" = 'customer' AND "revised_by_user_id" IS NOT NULL AND "revised_by_staff_id" IS NULL)
      OR ("revised_by_kind" = 'staff' AND "revised_by_staff_id" IS NOT NULL AND "revised_by_user_id" IS NULL)
    )
);

CREATE UNIQUE INDEX "order_revision_order_id_replaced_revision_key"
    ON "public"."order_revision"("order_id", "replaced_revision");

ALTER TABLE "public"."order_revision"
    ADD CONSTRAINT "order_revision_order_id_fkey" FOREIGN KEY ("order_id")
    REFERENCES "public"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "production"."order_revision_notice" (
    "id" SERIAL NOT NULL,
    "order_id" TEXT NOT NULL,
    "service_day" VARCHAR(10) NOT NULL,
    "revision" INTEGER NOT NULL,
    "noted_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_revision_notice_pkey" PRIMARY KEY ("id")
);

-- `max(id) WHERE service_day = $1` : un parcours d'index à rebours.
CREATE INDEX "order_revision_notice_service_day_id_idx"
    ON "production"."order_revision_notice"("service_day", "id");
