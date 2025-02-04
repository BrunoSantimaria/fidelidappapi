/**
 * Genera un link único para una agenda basado en su nombre
 * @param name Nombre de la agenda
 * @returns string Link único
 */
const generateUniqueLink = (name) => {
  // Limpia el nombre: convierte a minúsculas y reemplaza espacios por guiones
  const cleanName = name
    .toLowerCase()
    .trim()
    .replace(/[^a-zA-Z0-9\s]/g, "") // Elimina caracteres especiales
    .replace(/\s+/g, "-"); // Reemplaza espacios por guiones

  // Genera componentes aleatorios
  const timestamp = Date.now().toString(36); // Convierte timestamp a base36
  const randomStr = Math.random().toString(36).substring(2, 8); // 6 caracteres aleatorios

  // Combina los componentes para crear el link único
  return `${cleanName}-${timestamp}-${randomStr}`;
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
