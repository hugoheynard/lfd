-- LA PHOTO DU BON SIGNÉ — Hugo, 2026-10-25 : quand l'arrêt exige une
-- signature, le livreur photographie aussi le bon signé, en plus de la
-- commande déposée et du tracé au doigt. Rangée au bucket des pièces, sous
-- cette clé, comme `photo_key` et `signature_key` ; effacée avec elles par la
-- même purge (`HandoverProof.imageKeys`).
--
-- Nulle pour toute pièce d'avant, pour un dépôt, et pour une remise sans
-- signature exigée : aucune donnée existante n'est touchée.
--
-- ADDITIVE. Retour arrière, sans perte tant qu'aucun bon n'a été photographié :
--   ALTER TABLE "production"."order_handover_proof" DROP COLUMN "signed_slip_key";

ALTER TABLE "production"."order_handover_proof"
    ADD COLUMN "signed_slip_key" TEXT;
