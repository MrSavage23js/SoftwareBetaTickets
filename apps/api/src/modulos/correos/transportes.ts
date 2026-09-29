// Tres formas de enviar, intercambiables con MAIL_TRANSPORT en .env:
//   consola → guarda un .eml en storage/correos-consola (desarrollo y pruebas)
//   smtp    → servidor SMTP (Office 365: smtp.office365.com:587 con STARTTLS)
//   graph   → Microsoft Graph /sendMail con credenciales de aplicación (docs/CORREO_M365.md)
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { env, RUTAS } from '../../config/env';
import type { Destinatario } from '../../db/tipos';

export interface CorreoListo {
  id: number;
  para: Destinatario[];
  cc: Destinatario[];
  asunto: string;
  html: string;
  texto: string;
}

export interface Transporte {
  nombre: 'consola' | 'smtp' | 'graph';
  enviar(c: CorreoListo): Promise<{ idMensaje: string | null }>;
}

const remitente = () => ({ name: env.MAIL_FROM_NAME, address: env.MAIL_FROM });
const direccion = (d: Destinatario) => (d.nombre ? { name: d.nombre, address: d.email } : d.email);

function transporteConsola(): Transporte {
  const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
  return {
    nombre: 'consola',
    async enviar(c) {
      const info = await t.sendMail({
        from: remitente(),
        to: c.para.map(direccion),
        cc: c.cc.map(direccion),
        subject: c.asunto,
        html: c.html,
        text: c.texto,
      });
      const archivo = join(RUTAS.correosConsola, `${new Date().toISOString().replace(/[:.]/g, '-')}_${c.id}.eml`);
      await writeFile(archivo, info.message as Buffer);
      return { idMensaje: archivo };
    },
  };
}

function transporteSmtp(): Transporte {
  let t: Transporter | undefined;
  return {
    nombre: 'smtp',
    async enviar(c) {
      t ??= nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        requireTLS: !env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        pool: true,
        maxConnections: 2,
        connectionTimeout: 20_000,
        socketTimeout: 30_000,
      });
      const info = await t.sendMail({
        from: remitente(),
        to: c.para.map(direccion),
        cc: c.cc.map(direccion),
        subject: c.asunto,
        html: c.html,
        text: c.texto,
      });
      return { idMensaje: info.messageId ?? null };
    },
  };
}

function transporteGraph(): Transporte {
  let token: { valor: string; vence: number } | undefined;

  async function obtenerToken(): Promise<string> {
    if (token && token.vence > Date.now() + 60_000) return token.valor;
    const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env.GRAPH_TENANT_ID)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GRAPH_CLIENT_ID,
        client_secret: env.GRAPH_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const cuerpo = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!r.ok || !cuerpo.access_token) {
      throw new Error(`Graph: no se obtuvo token (${r.status}) ${cuerpo.error_description?.split('\n')[0] ?? ''}`.trim());
    }
    token = { valor: cuerpo.access_token, vence: Date.now() + (cuerpo.expires_in ?? 3600) * 1000 };
    return token.valor;
  }

  const destinatarios = (l: Destinatario[]) =>
    l.map((d) => ({ emailAddress: { address: d.email, ...(d.nombre ? { name: d.nombre } : {}) } }));

  return {
    nombre: 'graph',
    async enviar(c) {
      const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.GRAPH_REMITENTE)}/sendMail`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await obtenerToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject: c.asunto,
            body: { contentType: 'HTML', content: c.html },
            toRecipients: destinatarios(c.para),
            ccRecipients: destinatarios(c.cc),
          },
          saveToSentItems: true,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (r.status === 401) token = undefined;
      if (r.status !== 202) {
        const detalle = (await r.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
        throw new Error(`Graph ${r.status}: ${detalle.error?.code ?? ''} ${detalle.error?.message ?? ''}`.trim());
      }
      return { idMensaje: r.headers.get('request-id') };
    },
  };
}

let actual: Transporte | undefined;
export function transporte(): Transporte {
  actual ??= env.MAIL_TRANSPORT === 'smtp' ? transporteSmtp() : env.MAIL_TRANSPORT === 'graph' ? transporteGraph() : transporteConsola();
  return actual;
}

/** Solo para pruebas: reemplaza el transporte (p. ej. uno que siempre falla). `undefined` vuelve al de .env. */
export function usarTransporte(t: Transporte | undefined): void {
  actual = t;
}
