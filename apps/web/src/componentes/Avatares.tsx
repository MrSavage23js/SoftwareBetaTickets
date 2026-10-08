// Galería de avatares (idea beta): dibujos de trazo, del mismo estilo que los íconos, que el usuario elige en
// Apariencia en lugar de sus iniciales. Van sobre el círculo con el degradado de su paleta y toman el color
// del texto de los botones (currentColor), así combinan con cualquier paleta y modo.
import type { ReactNode } from 'react';
import type { Avatar } from '@mesa/shared';

// Los ojos llevan la clase "ojo" para el parpadeo al pasar el mouse (estilos/app.css).
const ojo = (x: number, y: number, r = 1.1) => <circle className="ojo" cx={x} cy={y} r={r} fill="currentColor" stroke="none" />;

const TRAZOS: Record<Avatar, ReactNode> = {
  gato: (
    <>
      <path d="M7 14l1-8 5 4h6l5-4 1 8a9 9 0 11-18 0z" />
      {ojo(12.5, 16)}
      {ojo(19.5, 16)}
      <path d="M15 19.5h2l-1 1.2z" />
      <path d="M5.5 19l4 .6M5.5 22l4-.5M26.5 19l-4 .6M26.5 22l-4-.5" />
    </>
  ),
  perro: (
    <>
      <path d="M9 12a7 7 0 0114 0v7a7 7 0 01-14 0z" />
      <path d="M9 12c-3 0-4 5-3 8 1 1 3 0 3-2M23 12c3 0 4 5 3 8-1 1-3 0-3-2" />
      {ojo(13, 16)}
      {ojo(19, 16)}
      <ellipse cx="16" cy="20.5" rx="1.6" ry="1.1" fill="currentColor" />
      <path d="M16 21.6v1.6" />
    </>
  ),
  zorro: (
    <>
      <path d="M6 7l5 6h10l5-6-1 10-9 9-9-9z" />
      <path d="M10 17l6 2 6-2" />
      {ojo(12.5, 15.5)}
      {ojo(19.5, 15.5)}
      <circle cx="16" cy="22.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  oso: (
    <>
      <circle cx="9" cy="9.5" r="3" />
      <circle cx="23" cy="9.5" r="3" />
      <circle cx="16" cy="17" r="9" />
      <ellipse cx="16" cy="20.5" rx="4" ry="3" />
      <circle cx="16" cy="19.6" r="1.1" fill="currentColor" stroke="none" />
      {ojo(12.5, 15)}
      {ojo(19.5, 15)}
    </>
  ),
  panda: (
    <>
      <circle cx="9" cy="9.5" r="3" fill="currentColor" />
      <circle cx="23" cy="9.5" r="3" fill="currentColor" />
      <circle cx="16" cy="17" r="9" />
      <ellipse cx="12.3" cy="15.5" rx="2" ry="2.6" transform="rotate(25 12.3 15.5)" fill="currentColor" />
      <ellipse cx="19.7" cy="15.5" rx="2" ry="2.6" transform="rotate(-25 19.7 15.5)" fill="currentColor" />
      <path d="M15 20.5h2l-1 1.2z" />
    </>
  ),
  buho: (
    <>
      <path d="M8 13a8 8 0 0116 0v7a8 8 0 01-16 0z" />
      <path d="M9 7.5l3 3.5M23 7.5l-3 3.5" />
      <circle cx="12.5" cy="15" r="3" />
      <circle cx="19.5" cy="15" r="3" />
      {ojo(12.5, 15)}
      {ojo(19.5, 15)}
      <path d="M15 19l1 2 1-2z" />
    </>
  ),
  conejo: (
    <>
      <path d="M11 14.5V5.5a1.75 1.75 0 013.5 0V13M17.5 13V5.5a1.75 1.75 0 013.5 0v9" />
      <circle cx="16" cy="20" r="7" />
      {ojo(13.5, 19)}
      {ojo(18.5, 19)}
      <path d="M15.2 22h1.6l-.8 1z" />
    </>
  ),
  pinguino: (
    <>
      <path d="M16 5c-5 0-8 5-8 11v6c0 3 3 5 8 5s8-2 8-5v-6c0-6-3-11-8-11z" />
      <path d="M12 18c0-3 2-5 4-5s4 2 4 5v4c0 2-2 3-4 3s-4-1-4-3z" />
      {ojo(14, 10.5)}
      {ojo(18, 10.5)}
      <path d="M15 13h2l-1 1.6z" />
    </>
  ),
  robot: (
    <>
      <rect x="8" y="10" width="16" height="13" rx="3" />
      <path d="M16 10V6.5" />
      <circle cx="16" cy="5.2" r="1.3" />
      <circle cx="12.5" cy="15.5" r="1.7" />
      <circle cx="19.5" cy="15.5" r="1.7" />
      <path d="M12.5 19.5h7M8 14.5H6v4h2M24 14.5h2v4h-2" />
      <path d="M12 23v3M20 23v3" />
    </>
  ),
  astronauta: (
    <>
      <circle cx="16" cy="14" r="9" />
      <path d="M10 14a6 5 0 0112 0v.5a6 4 0 01-12 0z" />
      <path d="M12.5 12.5l2-1.5" />
      <path d="M9 27.5c0-3 3-4.5 7-4.5s7 1.5 7 4.5" />
    </>
  ),
  cohete: (
    <>
      <path d="M16 4c4 3 6 8 6 13l-2 4h-8l-2-4c0-5 2-10 6-13z" />
      <circle cx="16" cy="13" r="2.5" />
      <path d="M10 17l-3 4 4 1M22 17l3 4-4 1" />
      <path d="M14 23.5l2 4 2-4" />
    </>
  ),
  cactus: (
    <>
      <path d="M14 24V9a2 2 0 014 0v15" />
      <path d="M14 18h-3a2 2 0 01-2-2v-3M18 15h3a2 2 0 002-2v-2" />
      <path d="M9.5 24h13l-1.5 4h-10z" />
    </>
  ),
  cafe: (
    <>
      <path d="M8 13h13v7a5 5 0 01-5 5h-3a5 5 0 01-5-5z" />
      <path d="M21 15h2a2.5 2.5 0 010 5h-2" />
      <path d="M12 10c0-1.5 1.5-1.5 1.5-3.5M16.5 10c0-1.5 1.5-1.5 1.5-3.5" />
      <path d="M7 27.5h16" />
    </>
  ),
  estrella: <path d="M16 4.5l3.4 6.9 7.6 1.1-5.5 5.4 1.3 7.6L16 21.9l-6.8 3.6 1.3-7.6L5 12.5l7.6-1.1z" />,
  rayo: <path d="M18 4L8 18h7l-2 10 11-15h-7z" />,
  planta: (
    <>
      <path d="M16 25V15" />
      <path d="M16 18c-6 0-8-4-8-9 5 0 8 3 8 9zM16 15c0-5 3-8 8-8 0 5-3 8-8 8z" />
      <path d="M10.5 25h11l-1.5 3.5h-8z" />
    </>
  ),
};

export const NOMBRE_AVATAR: Record<Avatar, string> = {
  gato: 'Gato',
  perro: 'Perro',
  zorro: 'Zorro',
  oso: 'Oso',
  panda: 'Panda',
  buho: 'Búho',
  conejo: 'Conejo',
  pinguino: 'Pingüino',
  robot: 'Robot',
  astronauta: 'Astronauta',
  cohete: 'Cohete',
  cactus: 'Cactus',
  cafe: 'Café',
  estrella: 'Estrella',
  rayo: 'Rayo',
  planta: 'Planta',
};

/** El dibujo del avatar; se coloca dentro de un círculo con el degradado de la paleta (.face, .avatar.on, .ap-avatar). */
export function DibujoAvatar({ avatar }: { avatar: Avatar }) {
  return (
    <svg className="avatar-dibujo" data-avatar={avatar} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRAZOS[avatar]}
    </svg>
  );
}
