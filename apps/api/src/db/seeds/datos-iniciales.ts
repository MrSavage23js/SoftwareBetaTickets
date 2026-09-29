// Datos iniciales. Los códigos de empresa marcados PROVISIONAL deben confirmarse (DECISIONES.md P1);
// se pueden cambiar después desde Catálogos sin tocar código.

export const EMPRESAS: { nombre: string; codigo: string }[] = [
  { nombre: 'Aram_Wax', codigo: 'AW' }, // PROVISIONAL
  { nombre: 'Aramo de la Frontera', codigo: 'AF' }, // PROVISIONAL
  { nombre: 'Autotransportes Asturcones', codigo: 'AS' }, // confirmado por folio real ASCA-0063
  { nombre: 'Cedis', codigo: 'CD' }, // PROVISIONAL
  { nombre: 'Distribuidora de Productos Aramo', codigo: 'DP' }, // PROVISIONAL
  { nombre: 'Distribuidora Jarchi', codigo: 'DJ' }, // PROVISIONAL
  { nombre: 'Etiquetas Aramo', codigo: 'EA' }, // PROVISIONAL
  { nombre: 'Luz de Vida', codigo: 'LV' }, // PROVISIONAL
  { nombre: 'Maquila Aramo', codigo: 'MA' }, // confirmado por folio real MACE-0046
  { nombre: 'Maquila Aramo DPA', codigo: 'MD' }, // PROVISIONAL
  { nombre: 'Maquila Atenco', codigo: 'MN' }, // PROVISIONAL
  { nombre: 'Maquila Los Reyes DPA', codigo: 'MR' }, // PROVISIONAL
  { nombre: 'Planta Aramo', codigo: 'PA' }, // PROVISIONAL
  { nombre: 'Productos Aramo S', codigo: 'PS' }, // PROVISIONAL
  { nombre: 'Veladoras Renacimiento', codigo: 'VR' }, // PROVISIONAL
  { nombre: 'Veladoras y Productos Aramo', codigo: 'VP' }, // confirmado por folio real VPCO-0170
  { nombre: 'Vilaflor', codigo: 'VF' }, // PROVISIONAL
];

export const TIPOS: {
  nombre: string;
  codigo: string;
  tituloDetalle: string;
  requiereModulo: boolean;
  requiereConcepto: boolean;
  requiereFolios: boolean;
}[] = [
  { nombre: 'Corrección', codigo: 'CO', tituloDetalle: 'Detalle de la corrección', requiereModulo: true, requiereConcepto: true, requiereFolios: true },
  { nombre: 'Cancelación', codigo: 'CA', tituloDetalle: 'Detalle de la cancelación', requiereModulo: true, requiereConcepto: true, requiereFolios: true },
  { nombre: 'Alta en catálogo', codigo: 'AC', tituloDetalle: 'Detalle del alta en catálogo', requiereModulo: true, requiereConcepto: true, requiereFolios: false },
  { nombre: 'Cambio de estructura', codigo: 'CE', tituloDetalle: 'Detalle del cambio de estructura', requiereModulo: true, requiereConcepto: true, requiereFolios: false },
  { nombre: 'Consulta General', codigo: 'CG', tituloDetalle: 'Detalle de la consulta', requiereModulo: false, requiereConcepto: true, requiereFolios: false },
  { nombre: 'Mantenimiento a equipo o instalación', codigo: 'MT', tituloDetalle: 'Detalle del mantenimiento', requiereModulo: false, requiereConcepto: true, requiereFolios: false },
];

export const MODULOS: { nombre: string; codigo: string }[] = [
  { nombre: 'Inventarios', codigo: 'INV' },
  { nombre: 'Compras', codigo: 'COM' },
  { nombre: 'Ventas', codigo: 'VEN' },
  { nombre: 'Cuentas por cobrar', codigo: 'CXC' },
  { nombre: 'Cuentas por pagar', codigo: 'CXP' },
  { nombre: 'Bancos', codigo: 'BAN' },
  { nombre: 'Nómina', codigo: 'NOM' },
];
