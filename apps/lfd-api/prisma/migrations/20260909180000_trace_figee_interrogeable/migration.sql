-- ───────────────────────────────────────────────────────────────────────────
-- RENDRE LA TRACE FIGÉE INTERROGEABLE
--
-- Depuis que clore BORNE la fenêtre d'une décision tarifaire (R17), une
-- décision close garde sa place dans le passé. Reposer par-dessus sa période
-- réécrirait l'explication d'une facture : la trace gelée sur la commande
-- garderait l'ancien montant, et la relecture datée en rendrait un autre.
--
-- 🔴 La frontière du refus est « **a-t-elle facturé** », pas « est-elle
-- passée ». Une mercuriale close sans qu'aucune commande ne l'ait citée ne
-- bloque rien : la reposer est le geste ordinaire « je me suis trompé, je
-- recommence ». Répondre demande donc d'interroger `pricing_steps` et
-- `pricing_commitment`, qui citent les décisions ayant produit chaque prix.
--
-- Sans index, `@>` sur du `jsonb` est un parcours complet des lignes de
-- commande. La question ne se pose jamais sur le chemin qui facture — c'est un
-- geste de staff, quelques fois par jour — mais elle grossirait avec l'histoire.
--
-- **Partiels** : une ligne sans trace ne répondra jamais oui, et l'index n'a
-- aucune raison de la porter. Additifs et réversibles — un `DROP INDEX` suffit,
-- aucune donnée n'est touchée.
-- ───────────────────────────────────────────────────────────────────────────
CREATE INDEX "order_lines_pricing_steps_gin"
    ON "order_lines" USING gin ("pricing_steps" jsonb_path_ops)
    WHERE "pricing_steps" IS NOT NULL;

CREATE INDEX "order_lines_pricing_commitment_gin"
    ON "order_lines" USING gin ("pricing_commitment" jsonb_path_ops)
    WHERE "pricing_commitment" IS NOT NULL;
