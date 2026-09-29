import { describe, expect, it } from 'vitest';
import {
  ACCIONES,
  ESTATUS,
  LISTA_ESTATUS,
  PERMISOS_INICIALES,
  accionesDisponibles,
  pasosCompletados,
  validarAccion,
  type Estatus,
  type TicketParaReglas,
} from '../src';

const admin = { id: 10, permisos: new Set<string>(PERMISOS_INICIALES.ADMIN_SOPORTE) };
const otroAdmin = { id: 11, permisos: new Set<string>(PERMISOS_INICIALES.ADMIN_SOPORTE) };
const usuario = { id: 20, permisos: new Set<string>(PERMISOS_INICIALES.USUARIO) };
const conReabrir = { id: 12, permisos: new Set<string>([...PERMISOS_INICIALES.ADMIN_SOPORTE, 'tickets.reabrir']) };

const ticket = (estatus: Estatus, asignadoAId: number | null = null): TicketParaReglas => ({
  estatus,
  solicitanteId: usuario.id,
  asignadoAId,
});

describe('máquina de estados', () => {
  it('tomar: pendiente sin asignar → en proceso', () => {
    expect(validarAccion('tomar', ticket('PENDIENTE'), admin)).toEqual({ ok: true, estatusNuevo: 'EN_PROCESO' });
  });

  it('tomar: rechaza si ya tiene técnico', () => {
    expect(validarAccion('tomar', ticket('PENDIENTE', otroAdmin.id), admin)).toMatchObject({ ok: false, codigo: 'YA_ASIGNADO' });
  });

  it('tomar: un usuario solicitante no puede', () => {
    expect(validarAccion('tomar', ticket('PENDIENTE'), usuario)).toMatchObject({ ok: false, codigo: 'SIN_PERMISO' });
  });

  it('pausar y reanudar solo el técnico asignado', () => {
    expect(validarAccion('pausar', ticket('EN_PROCESO', admin.id), admin)).toEqual({ ok: true, estatusNuevo: 'PAUSADO' });
    expect(validarAccion('pausar', ticket('EN_PROCESO', admin.id), otroAdmin)).toMatchObject({ codigo: 'NO_ASIGNADO' });
    expect(validarAccion('reanudar', ticket('PAUSADO', admin.id), admin)).toEqual({ ok: true, estatusNuevo: 'EN_PROCESO' });
    expect(validarAccion('reanudar', ticket('EN_PROCESO', admin.id), admin)).toMatchObject({ codigo: 'ESTATUS_INVALIDO' });
  });

  it('reasignar: cualquier admin, solo en proceso o pausado, sin cambiar estatus', () => {
    expect(validarAccion('reasignar', ticket('PAUSADO', admin.id), otroAdmin)).toEqual({ ok: true, estatusNuevo: 'PAUSADO' });
    expect(validarAccion('reasignar', ticket('EN_PROCESO', admin.id), otroAdmin)).toEqual({ ok: true, estatusNuevo: 'EN_PROCESO' });
    expect(validarAccion('reasignar', ticket('PENDIENTE'), otroAdmin)).toMatchObject({ codigo: 'ESTATUS_INVALIDO' });
    expect(validarAccion('reasignar', ticket('COMPLETADO', admin.id), otroAdmin)).toMatchObject({ codigo: 'ESTATUS_INVALIDO' });
  });

  it('cerrar: desde en proceso o pausado, solo el asignado', () => {
    expect(validarAccion('cerrar', ticket('EN_PROCESO', admin.id), admin)).toEqual({ ok: true, estatusNuevo: 'COMPLETADO' });
    expect(validarAccion('cerrar', ticket('PAUSADO', admin.id), admin)).toEqual({ ok: true, estatusNuevo: 'COMPLETADO' });
    expect(validarAccion('cerrar', ticket('EN_PROCESO', admin.id), otroAdmin)).toMatchObject({ codigo: 'NO_ASIGNADO' });
    expect(validarAccion('cerrar', ticket('PENDIENTE'), admin)).toMatchObject({ codigo: 'ESTATUS_INVALIDO' });
    expect(validarAccion('cerrar', ticket('COMPLETADO', admin.id), admin)).toMatchObject({ codigo: 'ESTATUS_INVALIDO' });
  });

  it('responder requiere haber tomado el ticket', () => {
    expect(validarAccion('responder', ticket('PENDIENTE'), admin)).toMatchObject({ codigo: 'ESTATUS_INVALIDO' });
    expect(validarAccion('responder', ticket('EN_PROCESO', admin.id), admin).ok).toBe(true);
    expect(validarAccion('responder', ticket('PAUSADO', admin.id), admin).ok).toBe(true);
    expect(validarAccion('responder', ticket('EN_PROCESO', admin.id), usuario)).toMatchObject({ codigo: 'SIN_PERMISO' });
  });

  it('comentar: solo el solicitante y mientras no esté completado', () => {
    expect(validarAccion('comentar', ticket('PENDIENTE'), usuario).ok).toBe(true);
    expect(validarAccion('comentar', ticket('EN_PROCESO', admin.id), usuario).ok).toBe(true);
    expect(validarAccion('comentar', ticket('PAUSADO', admin.id), usuario).ok).toBe(true);
    expect(validarAccion('comentar', ticket('COMPLETADO', admin.id), usuario)).toMatchObject({ codigo: 'ESTATUS_INVALIDO' });
    const ajeno = { id: 99, permisos: usuario.permisos };
    expect(validarAccion('comentar', ticket('PENDIENTE'), ajeno)).toMatchObject({ codigo: 'SIN_PERMISO' });
  });

  it('reabrir no está concedido por defecto (DECISIONES P4)', () => {
    expect(validarAccion('reabrir', ticket('COMPLETADO', admin.id), admin)).toMatchObject({ codigo: 'SIN_PERMISO' });
    expect(validarAccion('reabrir', ticket('COMPLETADO', admin.id), conReabrir)).toEqual({ ok: true, estatusNuevo: 'EN_PROCESO' });
    expect(validarAccion('reabrir', ticket('EN_PROCESO', admin.id), conReabrir)).toMatchObject({ codigo: 'ESTATUS_INVALIDO' });
  });

  it('un actor sin permisos no puede hacer nada en ningún estatus', () => {
    const nadie = { id: 1, permisos: new Set<string>() };
    for (const e of LISTA_ESTATUS) expect(accionesDisponibles(ticket(e, 1), nadie)).toEqual([]);
  });

  it('un ticket completado solo admite reabrir (con permiso)', () => {
    const permitidas = ACCIONES.filter((a) => validarAccion(a, ticket(ESTATUS.COMPLETADO, conReabrir.id), conReabrir).ok);
    expect(permitidas).toEqual(['reabrir']);
  });

  it('acciones del técnico asignado en cada estatus', () => {
    expect(accionesDisponibles(ticket('PENDIENTE'), admin)).toEqual(['tomar']);
    expect(accionesDisponibles(ticket('EN_PROCESO', admin.id), admin)).toEqual(['pausar', 'reasignar', 'responder', 'cerrar']);
    expect(accionesDisponibles(ticket('PAUSADO', admin.id), admin)).toEqual(['reanudar', 'reasignar', 'responder', 'cerrar']);
    expect(accionesDisponibles(ticket('COMPLETADO', admin.id), admin)).toEqual([]);
  });

  it('acepta permisos como arreglo además de Set', () => {
    expect(validarAccion('tomar', ticket('PENDIENTE'), { id: 5, permisos: ['tickets.tomar'] }).ok).toBe(true);
  });
});

describe('barra de avance', () => {
  const base = { creadoAt: '2026-01-01', tomadoAt: null, primeraRespuestaAt: null, cerradoAt: null };
  it('marca cada paso según las fechas', () => {
    expect(pasosCompletados({ ...base, estatus: 'PENDIENTE' })).toBe(1);
    expect(pasosCompletados({ ...base, tomadoAt: '2026-01-02', estatus: 'EN_PROCESO' })).toBe(2);
    expect(pasosCompletados({ ...base, tomadoAt: '2026-01-02', primeraRespuestaAt: '2026-01-03', estatus: 'PAUSADO' })).toBe(3);
    expect(pasosCompletados({ ...base, cerradoAt: '2026-01-04', estatus: 'COMPLETADO' })).toBe(4);
  });
});
