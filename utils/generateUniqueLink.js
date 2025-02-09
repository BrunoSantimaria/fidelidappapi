/**
 * Genera un link único para una agenda basado en su nombre
 * @param name Nombre de la agenda
 * @returns string Link único
 */
const generateUniqueLink = () => {
  // Genera un identificador aleatorio de 7 caracteres
  const randomStr = Math.random().toString(36).substring(2, 9); // 7 caracteres aleatorios

  // Convierte el primer carácter a mayúscula para cumplir con el ejemplo
  const shortName = randomStr.charAt(0).toUpperCase() + randomStr.slice(1);

  return shortName;
};

/**
 * Valida si un link es único en la base de datos
 * @param link Link a validar
 * @returns boolean
 */
const isLinkUnique = async (link) => {
  try {
    const response = await fetch(`/api/agenda/check-link/${link}`);
    const data = await response.json();
    return data.isUnique;
  } catch (error) {
    console.error("Error checking link uniqueness:", error);
    return false;
  }
};

module.exports = { generateUniqueLink, isLinkUnique };
