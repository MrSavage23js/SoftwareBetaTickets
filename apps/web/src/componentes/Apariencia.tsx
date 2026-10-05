// Ventana "Apariencia": modo claro/oscuro y paleta de color de cada usuario. Cada opción se aplica al
// instante (la página entera es la vista previa) y se guarda para el usuario en el servidor.
import { useState } from 'react';
import type { Acento, Apariencia, Tema } from '@mesa/shared';
import { mensajeDe } from '../api/cliente';
import { useSesion } from '../sesion/Sesion';
import { Icono } from './Icono';
import { Modal, useAvisos } from './ui';

const MODOS: { valor: Tema; nombre: string; detalle: string }[] = [
  { valor: 'sistema', nombre: 'Automático', detalle: 'Igual que tu equipo' },
  { valor: 'claro', nombre: 'Claro', detalle: 'Fondo blanco' },
  { valor: 'oscuro', nombre: 'Oscuro', detalle: 'Descansa la vista' },
];

const PALETAS: { valor: Acento; nombre: string }[] = [
  { valor: 'aqua', nombre: 'Aqua' },
  { valor: 'oceano', nombre: 'Océano' },
  { valor: 'bosque', nombre: 'Bosque' },
  { valor: 'ambar', nombre: 'Ámbar' },
  { valor: 'ciruela', nombre: 'Ciruela' },
  { valor: 'coral', nombre: 'Coral' },
  { valor: 'grafito', nombre: 'Grafito' },
  { valor: 'rosa', nombre: 'Rosa' },
  { valor: 'muertos', nombre: 'Día de Muertos' },
];

/** Radio accesible: flechas para moverse entre opciones, como un grupo de radio nativo. */
function moverConFlechas(e: React.KeyboardEvent<HTMLDivElement>) {
  const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!delta) return;
  e.preventDefault();
  const opciones = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  const i = opciones.indexOf(document.activeElement as HTMLButtonElement);
  const sig = opciones[(i + delta + opciones.length) % opciones.length];
  sig?.focus();
  sig?.click();
}

export function VentanaApariencia({ alCerrar }: { alCerrar: () => void }) {
  const { usuario, cambiarApariencia } = useSesion();
  const avisar = useAvisos();
  const [guardando, setGuardando] = useState(false);
  if (!usuario) return null;
  const actual = usuario.apariencia;

  const elegir = async (a: Apariencia) => {
    if (guardando || (a.tema === actual.tema && a.acento === actual.acento)) return;
    setGuardando(true);
    try {
      await cambiarApariencia(a);
    } catch (e) {
      avisar(`No se guardó la apariencia: ${mensajeDe(e)}`, 'mal');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="Apariencia"
      icono="paleta"
      alCerrar={alCerrar}
      pie={
        <button className="btn p" onClick={alCerrar}>
          Listo
        </button>
      }
    >
      <div className="apariencia">
        <p className="apariencia-nota">Se guarda en tu usuario: la verás igual en cualquier equipo donde entres.</p>

        <h3 id="ap-modo">Modo</h3>
        <div className="ap-modos" role="radiogroup" aria-labelledby="ap-modo" onKeyDown={moverConFlechas}>
          {MODOS.map((m) => {
            const activo = actual.tema === m.valor;
            return (
              <button
                key={m.valor}
                type="button"
                role="radio"
                aria-checked={activo}
                tabIndex={activo ? 0 : -1}
                className="ap-modo"
                onClick={() => void elegir({ ...actual, tema: m.valor })}
              >
                <span className={`ap-modo-vista ${m.valor}`} aria-hidden="true">
                  <span className="lado" />
                  <span className="hoja">
                    <span className="renglon" />
                    <span className="renglon corto" />
                  </span>
                </span>
                <span className="ap-texto">
                  <b>{m.nombre}</b>
                  <small>{m.detalle}</small>
                </span>
                {activo && <Icono n="check" t="s" />}
              </button>
            );
          })}
        </div>

        <h3 id="ap-color">Color</h3>
        <div className="ap-paletas" role="radiogroup" aria-labelledby="ap-color" onKeyDown={moverConFlechas}>
          {PALETAS.map((p) => {
            const activo = actual.acento === p.valor;
            return (
              <button
                key={p.valor}
                type="button"
                role="radio"
                aria-checked={activo}
                tabIndex={activo ? 0 : -1}
                className="ap-paleta"
                onClick={() => void elegir({ ...actual, acento: p.valor })}
              >
                {/* Miniatura del sistema con esta paleta: barra lateral, página y botón principal. */}
                <span className="mini" data-acento={p.valor} aria-hidden="true">
                  <span className="mini-lado">
                    <span className="mini-punto" />
                    <span className="mini-item on" />
                    <span className="mini-item" />
                  </span>
                  <span className="mini-pagina">
                    <span className="mini-tarjeta">
                      <span className="mini-renglon" />
                      <span className="mini-renglon corto" />
                    </span>
                    <span className="mini-boton" />
                  </span>
                </span>
                <span className="ap-nombre">
                  {p.nombre}
                  {activo && <Icono n="check" t="s" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
