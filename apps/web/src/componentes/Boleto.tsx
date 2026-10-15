// El ticket como boleto: cuerpo con el folio grande y los datos, línea perforada y un talón con el
// sello del estatus y un código de barras (decorativo, sale del folio). Es la firma visual del sistema.
import type { ReactNode } from 'react';
import { INFO_ESTATUS, type Estatus, type TicketDetalle } from '@mesa/shared';
import { fmtFechaCorta, fmtFechaHora } from '../lib/formato';
import { BadgeUrgencia } from './Urgencia';
import { Avatar } from './ui';

export function Boleto({ t }: { t: TicketDetalle }) {
  const vacio = <span className="ph">—</span>;
  return (
    <div className="boleto-caja">
      {/* "final": al cerrarse, el talón se arranca (si pasa con el ticket abierto, se ve la animación). */}
      <section className={`boleto ${INFO_ESTATUS[t.estatus].esFinal ? 'final' : ''}`} aria-label={`Ticket ${t.folio}`}>
        <div className="bol-cuerpo">
          <div className="bol-enc">
            <span className="bol-rotulo">Ticket de soporte · {t.departamento.nombre}</span>
            <span className="pill type">{t.tipo.nombre}</span>
            <BadgeUrgencia urgencia={t.urgencia} />
          </div>
          <div className="bol-folio">{t.folio}</div>
          <dl className="bol-datos">
            <Dato titulo="Solicitante">
              <Avatar grande avatar={t.solicitante.avatar} />
              {t.solicitante.nombre}
            </Dato>
            <Dato titulo="Asignado a">
              {t.asignado ? (
                <>
                  <Avatar grande activo avatar={t.asignado.avatar} />
                  {t.asignado.nombre}
                </>
              ) : (
                <span className="ph">Sin asignar</span>
              )}
            </Dato>
            <Dato titulo="Empresa">{t.empresa.nombre}</Dato>
            <Dato titulo="Módulo">{t.modulo?.nombre ?? vacio}</Dato>
            <Dato titulo="Concepto">{t.concepto ?? vacio}</Dato>
            <Dato titulo="Folio(s)">{t.foliosRef ?? vacio}</Dato>
            <Dato titulo="Fecha de creación">{fmtFechaHora(t.creadoAt)}</Dato>
          </dl>
        </div>
        <div className="bol-talon">
          <span className="bol-etq">Estatus</span>
          {/* Se vuelve a montar al cambiar de estatus: el sello "cae" con el valor nuevo. */}
          <Sello key={t.estatus} estatus={t.estatus} />
          <span className="bol-fechas">
            <span>Emitido {fmtFechaCorta(t.creadoAt)}</span>
            {t.cerradoAt && <span>Cerrado {fmtFechaCorta(t.cerradoAt)}</span>}
          </span>
          <CodigoBarras texto={t.folio} />
          <span className="bol-folio-chico">{t.folio}</span>
        </div>
      </section>
    </div>
  );
}

/** Talón suelto con el folio: la confirmación al crear un ticket. */
export function TalonFolio({ folio }: { folio: string }) {
  return (
    <div className="talon-folio">
      <span className="bol-etq">Tu folio es</span>
      <span className="bol-folio">{folio}</span>
      <CodigoBarras texto={folio} />
    </div>
  );
}

function Dato({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <dt>{titulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function Sello({ estatus }: { estatus: Estatus }) {
  const i = INFO_ESTATUS[estatus];
  return <span className={`sello ${i?.clase ?? 'pend'}`}>{i?.nombre ?? estatus}</span>;
}

/** Barras deterministas a partir del texto: siempre el mismo dibujo para el mismo folio. */
function CodigoBarras({ texto }: { texto: string }) {
  const barras: { x: number; w: number }[] = [];
  let x = 0;
  const barra = (w: number, hueco: number) => {
    barras.push({ x, w });
    x += w + hueco;
  };
  barra(1, 1);
  barra(1, 2);
  for (const ch of texto) {
    const c = ch.charCodeAt(0);
    barra(1 + (c % 3), 1 + ((c >> 2) % 2));
    barra(1 + ((c >> 3) % 2), 1 + ((c >> 1) % 3));
  }
  barra(1, 1);
  barra(1, 0);
  return (
    <svg className="bol-codigo" viewBox={`0 0 ${x} 20`} preserveAspectRatio="none" aria-hidden="true">
      {barras.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={20} />
      ))}
    </svg>
  );
}
