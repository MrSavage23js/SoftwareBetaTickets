// Datos visibles de la demo (se importan desde la pantalla de inicio sin cargar el servidor simulado).
export const CLAVE_DEMO = 'mesa-ayuda-demo-v1';
export const PASSWORD_DEMO = 'Demo1234';
export const USUARIOS_DEMO = [
  { username: 'admin', rol: 'Admin soporte' },
  { username: 'tecnico', rol: 'Admin soporte (técnico)' },
  { username: 'laura', rol: 'Solicitante' },
  { username: 'pedro', rol: 'Solicitante' },
];

/** Borra los datos de la demo de este navegador y recarga con los datos de ejemplo. */
export function reiniciarDemo() {
  try {
    localStorage.removeItem(CLAVE_DEMO);
  } catch {
    /* sin almacenamiento */
  }
  window.location.reload();
}
