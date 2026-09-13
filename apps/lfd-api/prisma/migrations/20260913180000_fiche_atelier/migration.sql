-- LA FICHE D'ATELIER — de quoi cocher ce qui est sorti du four.
--
-- Strictement ADDITIVE : quatre colonnes nullables (ou à défaut), une table
-- neuve, aucun renommage, aucune donnée déplacée. Rien de ce qui est servi
-- aujourd'hui ne change de forme, donc les binaires en place continuent de
-- lire et d'écrire sans rien savoir de ces colonnes.
--
-- Le retour arrière est le `DROP` symétrique, et il ne perd que ce que cette
-- fonctionnalité a écrit — les coches du fournil et les contenants réglés.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LE RETIRAGE — le compte à produire peut être REPRIS, jamais recalculé
-- ─────────────────────────────────────────────────────────────────────────────
--
-- L'agrégat refuse depuis toujours de recalculer une journée arrêtée : le
-- fournil a lancé ses fournées sur un nombre, et le refaire en donnerait un
-- autre. Le retirage ne lève pas cette règle, il la NOMME — quelqu'un à qui on
-- vient de montrer les lignes qui changent décide d'absorber ce qui est arrivé
-- depuis. D'où l'auteur : un recalcul anonyme serait exactement ce qu'on refuse.
ALTER TABLE "production"."production_day"
    ADD COLUMN IF NOT EXISTS "retaken_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "retaken_by" TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LES COCHES — un fait du FOURNIL, comme le colisage
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `done_at` est le seul état « pas fait » : NULL. L'auteur l'accompagne pour la
-- même raison que `packed_by` accompagne `packed_at` — un fait daté sans auteur
-- ne se conteste pas, il s'efface.
--
-- Les initiales, elles, sont à DÉFAUT vide et non nullables : une ligne peut
-- être faite sans signature (on coche d'abord, on signe si on veut), et un
-- troisième nullable laisserait croire à un quatrième état qui n'existe pas.
ALTER TABLE "production"."production_count"
    ADD COLUMN IF NOT EXISTS "done_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "done_by" TEXT,
    ADD COLUMN IF NOT EXISTS "done_initials" TEXT NOT NULL DEFAULT '';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LE CONTENANT — le matériel du four, pas le conditionnement de vente
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Le SKU est la clé naturelle et reste OPAQUE : aucune clé étrangère vers le
-- catalogue, qui vit dans un autre schéma et dont la production ne lit rien.
-- Un produit sans ligne ici n'a pas de contenant réglé, et la fiche laisse la
-- colonne vide plutôt que d'inventer un nombre de plaques.
CREATE TABLE IF NOT EXISTS "production"."production_container" (
    "sku"                 TEXT         NOT NULL,
    "units_per_container" INTEGER      NOT NULL,
    "singular"            TEXT         NOT NULL,
    "plural"              TEXT         NOT NULL,
    "updated_by"          TEXT,
    "updated_at"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_container_pkey" PRIMARY KEY ("sku")
);

-- Refusé en BASE plutôt que vérifié à l'écriture : une division par zéro dans
-- le calcul du libellé (« ceil(quantité / n) ») n'a pas à dépendre de la
-- discipline d'un handler.
ALTER TABLE "production"."production_container"
    DROP CONSTRAINT IF EXISTS "production_container_units_positive";
ALTER TABLE "production"."production_container"
    ADD CONSTRAINT "production_container_units_positive"
    CHECK ("units_per_container" >= 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. LA PRÉFÉRENCE DE POSTE — elle suit la PERSONNE, pas la machine
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Même sac JSON que `public.users.nav_prefs`, pour la même raison : un réglage
-- purement UI, sans invariant, qui grossira. Ce qu'il porte aujourd'hui est la
-- catégorie sur laquelle un poste s'est mis — il n'y a pas d'affectation de
-- catégorie par personne, chaque poste reçoit tout et choisit sa page.
--
-- Le navigateur ne convenait pas : le téléphone du pétrin n'est pas la machine
-- du chef, et c'est celui qui reprend son poste qui doit retrouver sa fiche.
ALTER TABLE "public"."staff_users"
    ADD COLUMN IF NOT EXISTS "nav_prefs" JSONB;
