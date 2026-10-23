-- Les textes des e-mails (2026-10-23) — lot E2 du plan
-- `documentation/contenu-ecommerce/plan-textes-des-e-mails.md` (C2, C3, C5).
--
-- ADDITIVE : un type énuméré, deux tables neuves, aucune donnée existante
-- touchée. Aucun droit accordé à un rôle : l'édition passe par la ressource
-- existante `b2b_storefront` (C7).
--
-- Même forme que `shop_copy_entries` / `shop_copy_publication`
-- (`20261011220000_les_textes_de_la_boutique`) :
--
-- · `mail_copy_entries` — un remplacement par (e-mail, chemin, langue). Le
--   brouillon a TROIS états ; `draft_text` n'existe que dans l'état `set`.
-- · `mail_copy_publication` — une seule ligne (`key = 'mail'`) : la version
--   publiée, estampille des caches.

CREATE TYPE "public"."MailCopyDraftState" AS ENUM ('unchanged', 'set', 'reset');

CREATE TABLE "public"."mail_copy_entries" (
    "mail" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "draft_state" "public"."MailCopyDraftState" NOT NULL DEFAULT 'unchanged',
    "draft_text" TEXT,
    "draft_at" TIMESTAMP(3),
    "draft_by" TEXT,
    "published_text" TEXT,
    "published_at" TIMESTAMP(3),
    "published_by" TEXT,

    CONSTRAINT "mail_copy_entries_pkey" PRIMARY KEY ("mail", "path", "locale"),
    CONSTRAINT "mail_copy_entries_locale_check" CHECK ("locale" IN ('fr', 'en', 'it')),
    CONSTRAINT "mail_copy_entries_revision_check" CHECK ("revision" >= 1),
    -- Le texte du brouillon existe si et seulement si le brouillon REMPLACE.
    CONSTRAINT "mail_copy_entries_draft_text_check" CHECK (
        ("draft_state" = 'set') = ("draft_text" IS NOT NULL)
    ),
    -- Un texte vide n'est pas un remplacement : vider, c'est rétablir le défaut.
    CONSTRAINT "mail_copy_entries_not_blank_check" CHECK (
        ("draft_text" IS NULL OR btrim("draft_text") <> '')
        AND ("published_text" IS NULL OR btrim("published_text") <> '')
    )
);

CREATE TABLE "public"."mail_copy_publication" (
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "published_by" TEXT NOT NULL,

    CONSTRAINT "mail_copy_publication_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "mail_copy_publication_single_check" CHECK ("key" = 'mail'),
    CONSTRAINT "mail_copy_publication_version_check" CHECK ("version" >= 1)
);
