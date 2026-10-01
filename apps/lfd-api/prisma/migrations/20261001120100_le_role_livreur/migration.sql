-- LE RÔLE LIVREUR, ET LE DROIT DE CONDUIRE DE L'ADMINISTRATEUR
--
-- Plan `documentation/livraisons/plan-ma-tournee.md`, MT-D1 v2. Séparée de la
-- migration précédente parce que Postgres refuse d'UTILISER une valeur d'enum
-- dans la transaction qui l'ajoute.
--
-- ⚠️ Le rôle `livreur` n'a PAS de valeur `StaffRole` : depuis
-- `20260926120000_les_roles_se_lisent_en_base`, un rôle vit par sa clé texte,
-- et la colonne enum est promise au resserrage. C'est une ligne de
-- `staff_role_definitions`, comme un rôle créé à l'écran.
--
-- | Droit              | Lecture         | Écriture        |
-- | ------------------ | --------------- | --------------- |
-- | `delivery_driving` | admin, livreur  | admin, livreur  |
--
-- 🔴 Le livreur n'a QUE `delivery_driving` — pas même la cloche
-- (`staff_notifications`) : elle ne filtre aucun destinataire, il y lirait les
-- alertes de compte et les demandes des clients, et les éteindrait pour tout le
-- monde. `write` emporte `read`.
--
-- État des lieux AVANT la mise en ligne, lu par Hugo :
--   SELECT key, grants FROM staff_role_definitions WHERE key = 'livreur';
-- Vide attendu. S'il existe déjà un rôle `livreur` créé à l'écran, cette
-- migration ne le réécrit pas (`DO NOTHING`) — on décide avant.
--
-- Retour arrière : archiver la définition `livreur` (une définition ne se
-- supprime pas, des fiches la portent) et retirer `delivery_driving` des
-- `grants` de l'admin. La valeur d'enum reste (migration précédente).

-- ── 1. LE RÔLE NEUF ────────────────────────────────────────────────────────
--
-- `id` et `updated_at` sont fournis : leurs défauts sont posés par PRISMA, pas
-- par Postgres.
INSERT INTO "public"."staff_role_definitions" ("id", "key", "label", "grants", "updated_at") VALUES (gen_random_uuid()::text, 'livreur', 'Livreur', '[{"resource":"delivery_driving","action":"write"}]'::jsonb, CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;

-- ── 2. L'ADMINISTRATEUR COUVRE TOUT, SANS TROU ─────────────────────────────
--
-- Idempotent : on n'ajoute que si la ressource n'y est pas déjà.
UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"delivery_driving","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'delivery_driving'
  );
