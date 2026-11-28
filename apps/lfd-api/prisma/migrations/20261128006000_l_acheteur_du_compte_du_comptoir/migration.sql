-- L'ACHETEUR D'UN COMPTE OUVERT AU COMPTOIR — lot K5 du plan
-- documentation/comptes-client/plan-comptes-du-comptoir.md, § 3.1.
--
-- Le contact donné à l'ouverture devient une fiche invité (`users`, sans
-- `auth0_sub`) et SANS rattachement (`memberships`) : il désigne au nom de qui
-- l'équipe commande, il n'ouvre l'espace à personne. La trace d'ouverture
-- garde le lien, posé à l'insertion (la ligne est append-only).
--
-- ADDITIVE : une colonne nullable, sans clé étrangère (identifiant opaque,
-- comme `company_id`). Les traces déjà écrites n'ont pas d'acheteur : un
-- ajout de colonne ne déclenche pas le refus des réécritures.

ALTER TABLE "public"."counter_opening_attestations" ADD COLUMN "buyer_user_id" TEXT;
