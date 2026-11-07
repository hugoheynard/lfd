import type { ModelSectionId } from "./model-sections.js";

/**
 * Le nom d'un bloc du modèle tel que l'équipe le lit — dans les refus et dans
 * l'éditeur. Un modèle peut le préciser (« Choisir un mot de passe ») ; ceci est le
 * nom générique.
 */
export const MODEL_SECTION_LABELS: Readonly<Record<ModelSectionId, string>> = {
  title: "Titre",
  body: "Message",
  summary: "Récapitulatif",
  image: "Image",
  itinerary: "Itinéraire vers la boutique",
  cta: "Bouton et lien secondaire",
  footer: "Pied",
};
