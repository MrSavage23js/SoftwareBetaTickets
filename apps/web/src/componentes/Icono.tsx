// Íconos de la maqueta (mismo trazo). Uso: <Icono n="ticket" /> o <Icono n="plus" t="s" />.
const TRAZOS = {
  ticket: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4h6v3H9z" /><path d="M9 12h6M9 16h4" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.5a3.5 3.5 0 010 7M18 14.5c2 .7 3.5 2.5 3.5 5.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  filter: <path d="M3 5h18l-7 8v6l-4-2v-4z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  kanban: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="10" rx="1" /><rect x="17" y="4" width="4" height="13" rx="1" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  clip: <path d="M20 11l-8.5 8.5a5 5 0 01-7-7L13 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L14 7" />,
  send: <path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12l5 5 9-10" />,
  paleta: <><path d="M12 3a9 9 0 100 18c1.3 0 1.9-1 1.3-2.1-.6-1.1-.1-2.4 1.3-2.4H17a4 4 0 004-4c0-5-4.2-9.5-9-9.5z" /><circle cx="7.5" cy="11" r="1.2" /><circle cx="10" cy="7" r="1.2" /><circle cx="15" cy="7.5" r="1.2" /></>,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  logout: <path d="M10 5H6a2 2 0 00-2 2v10a2 2 0 002 2h4M15 8l4 4-4 4M19 12H9" />,
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path d="M7 5l12 7-12 7z" />,
  swap: <path d="M7 7h12l-3-3M17 17H5l3 3" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  respuestas: <><path d="M4 5h16v11H10l-5 4v-4H4z" /><path d="M8 9h8M8 12h5" /></>,
  docplus: <><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M12 12v6M9 15h6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  bold: <path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z" />,
  italic: <path d="M14 5h-4M14 19h-4M15 5l-6 14" />,
  under: <path d="M7 4v7a5 5 0 0010 0V4M5 20h14" />,
  ol: <path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v4M3.5 13.5h3L3.5 17h3" />,
  link: <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M4 18l5-5 4 4 3-3 4 4" /></>,
  clear: <path d="M5 5h10M10 5l-3 14M15 15l5 5M20 15l-5 5" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  history: <><path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.4" /><path d="M3 4v4h4M12 8v4l3 2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
  catalog: <><path d="M4 5h16v4H4zM4 11h16v4H4zM4 17h16v2H4z" /></>,
  alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></>,
  refresh: <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" />,
  palette: <><circle cx="12" cy="12" r="9" /><circle cx="8" cy="10" r="1.2" /><circle cx="12" cy="7.5" r="1.2" /><circle cx="16" cy="10" r="1.2" /><path d="M12 21a2 2 0 010-4h2a3 3 0 003-3" /></>,
  file: <><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /></>,
  reopen: <path d="M4 12a8 8 0 0114-5.3L20 9M20 4v5h-5M20 12a8 8 0 01-14 5.3L4 15M4 20v-5h5" />,
  bell: <><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" /><path d="M10 20a2 2 0 004 0" /></>,
  chevron: <path d="M15 6l-6 6 6 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  chart: <><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-7" /></>,
  // Marca del sistema: una vela sencilla (llama, mecha, cuerpo y base).
  vela: <><path d="M12 2.8c1.5 1.7 2.3 2.9 2.3 4a2.3 2.3 0 01-4.6 0c0-1.1.8-2.3 2.3-4z" /><path d="M12 9.1v1.4" /><rect x="8.5" y="10.5" width="7" height="9.5" rx="1.5" /><path d="M6 20h12" /></>,
  descargar: <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14" />,
  megafono: <><path d="M4 10v4h3l7 4V6L7 10z" /><path d="M17.5 9a4 4 0 010 6M7 14l1.5 5h2.5l-1-4.5" /></>,
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ n, t, className }: { n: NombreIcono; t?: 's' | 'l'; className?: string }) {
  return (
    <svg className={['ic', t, className].filter(Boolean).join(' ')} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {TRAZOS[n]}
    </svg>
  );
}
