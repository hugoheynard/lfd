-- **Les notes photo du commercial sur un compte client** — plan
-- `documentation/b2b/plan-notes-photo-du-commercial.md`, D1, D2, D5, D12.
--
-- ## Additive
--
-- Deux tables neuves et deux droits ajoutés aux rôles de référence. Aucune
-- colonne existante touchée, aucune donnée déplacée : une société sans ligne ici
-- se lit comme un carnet vide.
--
-- Retour arrière : `DROP TABLE "public"."client_notes";` puis
-- `DROP TABLE "public"."client_notebooks";` — **tant qu'aucune note n'a été
-- saisie**. Après, ce serait détruire les notes d'une commerciale. Les droits
-- ajoutés aux rôles se laissent en place : ils ne désignent plus aucune route.
--
-- ## Trois choix qui se lisent ici
--
-- - **Pas d'unique sur `(notebook_id, position)`.** Même raison que les étapes
--   de livraison : un réordonnancement échange des positions, et un unique non
--   différé ferait échouer l'échange de deux lignes. L'ordre est tenu par
--   l'agrégat `ClientNotebook`.
-- - **`company_id` unique, `RESTRICT` vers `companies`.** Un carnet par société,
--   et une société ne se supprime pas en emportant ses notes.
-- - **`ON DELETE CASCADE` des notes.** Le carnet ne se supprime jamais : la
--   cascade ne sert qu'à ne pas laisser d'orphelins si ce retour arrière est un
--   jour joué. Une note, elle, se supprime physiquement (D4).

-- CreateTable
CREATE TABLE "public"."client_notebooks" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_notebooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."client_notes" (
    "id" TEXT NOT NULL,
    "notebook_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "photo_key" TEXT,
    "created_by_sub" TEXT NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_notebooks_company_id_key" ON "public"."client_notebooks"("company_id");

-- CreateIndex
CREATE INDEX "client_notes_notebook_id_position_idx" ON "public"."client_notes"("notebook_id", "position");

-- AddForeignKey
ALTER TABLE "public"."client_notebooks" ADD CONSTRAINT "client_notebooks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."client_notes" ADD CONSTRAINT "client_notes_notebook_id_fkey" FOREIGN KEY ("notebook_id") REFERENCES "public"."client_notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- **Les droits des rôles de référence** : `write` pour `admin` et `commercial`,
-- rien pour les autres — la copie en base de `ROLE_GRANTS` (`@lfd/contracts`).
--
-- ⚠️ Ce JSON n'autorise rien pour ces cinq rôles : l'accès se résout depuis
-- `ROLE_GRANTS` (`prisma-staff-access.resolver.ts`, vérifié le 2026-09-15). Il
-- est ce que l'écran des rôles MONTRE ; sans cette mise à jour, l'administrateur
-- y paraîtrait privé d'un droit qu'il exerce.
--
-- Rejouable : un rôle qui porte déjà la ressource — posée à la main depuis
-- l'écran — n'est pas touché. Du texte JSON, pas la valeur d'enum : la
-- restriction de la migration précédente ne s'applique pas ici.
UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"b2b_client_notes","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" IN ('admin', 'commercial')
  AND NOT ("grants" @> '[{"resource":"b2b_client_notes"}]'::jsonb);
