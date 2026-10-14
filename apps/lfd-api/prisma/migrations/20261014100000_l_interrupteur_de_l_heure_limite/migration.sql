-- L'INTERRUPTEUR DE L'HEURE LIMITE GÉNÉRALE
--
-- Plan `documentation/commandes/plan-reglages-commandes.md`, §8 et §8.1, lot
-- O3 (Hugo, 2026-10-14) : « Heure limite générale : activée / désactivée »,
-- dans Réglages › Commandes › Heure limite, sous `lfc_order_settings`.
-- Désactivée, la règle du commerce (`order_cutoff`) n'est plus servie à la
-- passation, à la boutique ni au fournil ; elle reste en base, intacte.
--
-- ADDITIF : une table neuve, une ligne au plus (clé `orders`), AUCUNE ligne
-- posée ici. Ligne absente = ACTIVÉE (le lecteur fait ce repli) : rien ne
-- change au déploiement. Aucun droit accordé à un rôle — la ressource
-- `lfc_order_settings` existe déjà.
--
-- Retour arrière du SCHÉMA : `DROP TABLE` une fois qu'aucun binaire ne la lit.

SET lock_timeout = '5s';

CREATE TABLE "public"."order_cutoff_settings" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,

    CONSTRAINT "order_cutoff_settings_pkey" PRIMARY KEY ("key")
);
