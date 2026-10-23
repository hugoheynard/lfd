-- LA DEMANDE DE MODIFICATION DE COMMANDE — ses colonnes (plan
-- `documentation/commandes/plan-modifier-une-commande.md`, M4, 2026-10-23).
--
-- ADDITIVE : quatre colonnes nullables sur `customer_request`, des CHECK qui
-- ne visent que le type neuf (aucune ligne existante n'en est), un index
-- partiel. Aucune donnée existante n'est touchée.
--
-- · `change_base_revision` : la révision sur laquelle le client a composé —
--   le commerce applique sur ELLE, et une commande modifiée entre-temps
--   refuse (R7) plutôt que d'écraser ;
-- · `change_content` : la composition demandée, le corps d'une révision ;
--   vidée à l'anonymisation (adresse, note) ;
-- · `change_applied_revision` / `change_refusal` : la réponse — l'une OU
--   l'autre, jamais les deux.
--
-- RETOUR ARRIÈRE :
--   DROP INDEX "public"."customer_request_one_pending_order_change";
--   ALTER TABLE "public"."customer_request"
--     DROP CONSTRAINT "customer_request_order_change_shape",
--     DROP CONSTRAINT "customer_request_change_columns_only_on_order_change",
--     DROP COLUMN "change_base_revision", DROP COLUMN "change_content",
--     DROP COLUMN "change_applied_revision", DROP COLUMN "change_refusal";

ALTER TABLE "public"."customer_request"
    ADD COLUMN "change_base_revision" INTEGER,
    ADD COLUMN "change_content" JSONB,
    ADD COLUMN "change_applied_revision" INTEGER,
    ADD COLUMN "change_refusal" TEXT;

ALTER TABLE "public"."customer_request"
    -- Les colonnes de la demande de modification n'appartiennent qu'à elle.
    ADD CONSTRAINT "customer_request_change_columns_only_on_order_change" CHECK (
        "kind" = 'order_change' OR (
            "change_base_revision" IS NULL AND "change_content" IS NULL
            AND "change_applied_revision" IS NULL AND "change_refusal" IS NULL
        )
    ),
    -- Une demande de modification cite sa commande, sa révision de départ et
    -- sa composition — jusqu'à l'anonymisation —, et n'a qu'une réponse,
    -- posée avec le traitement.
    ADD CONSTRAINT "customer_request_order_change_shape" CHECK (
        "kind" <> 'order_change' OR (
            "change_base_revision" IS NOT NULL
            AND ("anonymized_at" IS NOT NULL OR (
                "order_id" IS NOT NULL AND "order_number" IS NOT NULL
                AND "change_content" IS NOT NULL
            ))
            AND NOT ("change_applied_revision" IS NOT NULL AND "change_refusal" IS NOT NULL)
            AND (("change_applied_revision" IS NULL AND "change_refusal" IS NULL)
                 OR "handled_at" IS NOT NULL)
        )
    );

-- Une seule demande EN ATTENTE par commande : une seconde attendrait une
-- réponse que la première rendrait caduque.
CREATE UNIQUE INDEX "customer_request_one_pending_order_change"
    ON "public"."customer_request" ("order_id")
    WHERE "kind" = 'order_change' AND "handled_at" IS NULL AND "anonymized_at" IS NULL;
