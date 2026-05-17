/**
 * src/utils/currency.js
 * Utilitario de conversión de divisas para CHIKILUKY.app.
 */

/**
 * Convierte un monto en dólares de referencia ($REF) a Bolívares (Bs)
 * aplicando la tasa del BCV, redondeando a 2 decimales y formateando
 * el resultado bajo el estándar de notación venezolano (miles: ., decimales: ,).
 * 
 * @param {number|string} montoRef - Monto en dólares de referencia.
 * @param {number|string} tasaBcv - Tasa de cambio oficial del BCV.
 * @returns {string} Monto formateado (ejemplo: "600,00 Bs" o "1.250,50 Bs").
 */
export function convertirRefABs(montoRef, tasaBcv) {
  const numRef = parseFloat(montoRef);
  const numTasa = parseFloat(tasaBcv);

  // Validación de seguridad para entradas nulas, inválidas o menores/iguales a cero
  if (isNaN(numRef) || isNaN(numTasa) || numRef <= 0 || numTasa <= 0) {
    return "0,00 Bs";
  }

  // Multiplicación y redondeo exacto a 2 decimales
  const total = Math.round((numRef * numTasa) * 100) / 100;

  // Formateo manual ultra-robusto inmune a la falta de locales en el servidor/cliente
  const partes = total.toFixed(2).split('.');
  const enteros = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimales = partes[1];

  return `${enteros},${decimales} Bs`;
}
