/**
 * Champs d'une fiche pro réservés au pro et à l'équipe Taara :
 * jamais renvoyés dans les réponses que voient les clients.
 */
export const PRIVATE_PRO_FIELDS = {
  certifications: true,
  guarantorName: true,
  guarantorPhone: true,
} as const;
