-- Les **rôles deviennent de la donnée**.
--
-- Additive et réversible : cette migration ne touche PAS `staff_users.role`,
-- qui reste l'enum `StaffRole` et continue de piloter la résolution d'accès.
-- Rien du chemin d'authentification ne change ici — c'est l'étape « étendre »
-- des trois (étendre, basculer, resserrer) : la table existe et se remplit,
-- personne ne la lit encore pour décider d'un accès.
--
-- Les cinq lignes semées sont la COPIE EXACTE de `ROLE_GRANTS`
-- (`packages/contracts/src/staff-access.ts`), générée depuis lui et non
-- retranscrite à la main. Après la bascule, ce sont ces lignes qui font foi.
--
-- `superadmin` n'est volontairement pas semé : il est court-circuité dans le
-- contrat. Une ligne en base serait une ligne modifiable, donc une issue de
-- secours condamnable.
CREATE TABLE "public"."staff_role_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "grants" JSONB NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_role_definitions_pkey" PRIMARY KEY ("id")
);

-- La clé est l'identité du rôle : elle sera écrite sur les fiches.
CREATE UNIQUE INDEX "staff_role_definitions_key_key" ON "public"."staff_role_definitions"("key");

-- `superadmin` ne peut pas exister en base : il vit dans le code, et une ligne
-- homonyme créerait deux vérités sur ce que le sommet accorde. Une contrainte
-- plutôt qu'un contrôle applicatif — l'agrégat le refuse déjà, la base le rend
-- impossible même par un INSERT direct.
ALTER TABLE "public"."staff_role_definitions"
  ADD CONSTRAINT "staff_role_definitions_key_not_superadmin" CHECK ("key" <> 'superadmin');

INSERT INTO "public"."staff_role_definitions" ("id", "key", "label", "grants", "updated_at")
SELECT gen_random_uuid()::text, seed.key, seed.label, seed.grants, CURRENT_TIMESTAMP
FROM (VALUES
  ('admin', 'Administrateur', '[{"resource":"companies","action":"write"},{"resource":"orders","action":"write"},{"resource":"catalog","action":"write"},{"resource":"tax","action":"write"},{"resource":"growth","action":"write"},{"resource":"appointments","action":"write"},{"resource":"support","action":"write"},{"resource":"settings","action":"write"},{"resource":"staff","action":"write"},{"resource":"activity","action":"write"},{"resource":"tech","action":"write"},{"resource":"ops","action":"write"}]'::jsonb),
  ('commercial', 'Commercial', '[{"resource":"companies","action":"write"},{"resource":"orders","action":"write"},{"resource":"catalog","action":"read"},{"resource":"tax","action":"read"},{"resource":"growth","action":"write"},{"resource":"appointments","action":"write"},{"resource":"support","action":"write"},{"resource":"settings","action":"read"}]'::jsonb),
  ('comptabilite', 'Comptabilité', '[{"resource":"companies","action":"read"},{"resource":"orders","action":"write"},{"resource":"catalog","action":"read"},{"resource":"tax","action":"write"},{"resource":"settings","action":"read"}]'::jsonb),
  ('support', 'Support', '[{"resource":"companies","action":"read"},{"resource":"orders","action":"read"},{"resource":"appointments","action":"write"},{"resource":"support","action":"write"}]'::jsonb),
  ('dev', 'Technique', '[{"resource":"catalog","action":"read"},{"resource":"tax","action":"read"},{"resource":"settings","action":"read"},{"resource":"tech","action":"write"},{"resource":"ops","action":"read"}]'::jsonb)
) AS seed(key, label, grants)
-- Rejouable : une base déjà semée n'est pas modifiée.
ON CONFLICT ("key") DO NOTHING;
