-- L'ordre des sections des e-mails (2026-10-23) — lot E4a du plan
-- `documentation/contenu-ecommerce/plan-textes-des-e-mails.md` (§3, S2, S3).
--
-- ADDITIVE : une table neuve, aucune donnée existante touchée, aucun droit
-- accordé à un rôle (l'édition passe par `b2b_storefront`, C7).
--
-- Même cycle que `mail_copy_entries` : un brouillon à trois états (le type
-- `MailCopyDraftState` existant), une révision, et le publié — mis en service
-- par le même « Publier », sous la même version (`mail_copy_publication`).
-- `published_order` vide : l'ordre du code, celui qui rend les e-mails
-- d'avant les sections.

CREATE TABLE "public"."mail_section_orders" (
    "mail" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "draft_state" "public"."MailCopyDraftState" NOT NULL DEFAULT 'unchanged',
    "draft_order" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "draft_at" TIMESTAMP(3),
    "draft_by" TEXT,
    "published_order" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "published_at" TIMESTAMP(3),
    "published_by" TEXT,

    CONSTRAINT "mail_section_orders_pkey" PRIMARY KEY ("mail"),
    CONSTRAINT "mail_section_orders_revision_check" CHECK ("revision" >= 1),
    -- L'ordre du brouillon existe si et seulement si le brouillon REMPLACE.
    CONSTRAINT "mail_section_orders_draft_order_check" CHECK (
        ("draft_state" = 'set') = (cardinality("draft_order") > 0)
    )
);
