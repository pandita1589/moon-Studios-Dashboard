import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getAllUsers } from '@/lib/firebase';
import EmployeeContractModal from '@/components/EmployeeContractModal';
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  query, orderBy, Timestamp, updateDoc, setDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  TrendingUp, TrendingDown, DollarSign, FileText,
  Plus, Trash2, RefreshCw, BarChart2, Wallet,
  ArrowUpCircle, ArrowDownCircle, Target, AlertCircle,
  CheckCircle, Search, Edit2,
  Users, CreditCard, ChevronRight,
  Download, Settings, Building2, Hash, ImageIcon,
   BookOpen
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// ─── Tipos ────────────────────────────────────────────────────────────────────
type TipoTransaccion = 'ingreso' | 'egreso';

interface Transaccion {
  id: string;
  tipo: TipoTransaccion;
  monto: number;
  descripcion: string;
  categoria: string;
  fecha: any;
  creadoPor: string;
  creadoPorNombre: string;
}

interface Factura {
  id: string;
  numero: string;
  entidad: string;        // proveedor o cliente
  tipoEntidad: 'proveedor' | 'cliente';
  monto: number;
  estado: 'pendiente' | 'pagada' | 'vencida' | 'anulada';
  fecha: any;
  descripcion: string;
  creadoPor: string;
  observaciones: string;
}

interface Presupuesto {
  id: string;
  nombre: string;
  categoria: string;
  montoAsignado: number;
  montoUsado: number;
  periodo: string;       // "2025-01", "2025-02", etc.
  creadoPor: string;
}

interface LineaAsiento {
  cuentaCodigo: string;
  cuentaNombre: string;
  glosa: string;
  debe: number;
  haber: number;
}

interface AsientoContable {
  id: string;
  numero: number;
  fecha: any;
  glosa: string;
  lineas: LineaAsiento[];
  totalDebe: number;
  totalHaber: number;
  creadoPor: string;
  creadoPorNombre: string;
  creadoEn: any;
}

interface Sueldo {
  id: string;
  empleadoUid: string;
  empleadoNombre: string;
  empleadoRol: string;
  montoBase: number;
  bonificaciones: number;
  descuentos: number;
  netoAPagar: number;
  periodo: string;          // "2025-01"
  estado: 'pendiente' | 'pagado';
  observaciones: string;
  creadoPor: string;
  creadoEn: any;
}

interface CompanyConfig {
  empresaNombre: string;
  ruc: string;
  direccion: string;
  telefono: string;
  email: string;
  logoUrl: string;
}

type Moneda = 'PEN' | 'USD' | 'EUR' | 'GBP';

interface MonedaConfig {
  monedaActiva: Moneda;
  tipoCambioUSD: number;  // cuántos soles vale 1 dólar
  tipoCambioEUR: number;
  tipoCambioGBP: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const CATEGORIAS_INGRESO = [
  'Ventas', 'Servicios', 'Inversiones', 'Otros ingresos'
];
const CATEGORIAS_EGRESO = [
  'Sueldos', 'Alquiler', 'Servicios básicos', 'Marketing',
  'Tecnología', 'Materiales', 'Logística', 'Impuestos', 'Otros gastos'
];

const ESTADO_FACTURA_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'text-yellow-400', bg: 'bg-yellow-950/60', border: 'border-yellow-800/60' },
  pagada:    { label: 'Pagada',    color: 'text-green-400',  bg: 'bg-green-950/60',  border: 'border-green-800/60'  },
  vencida:   { label: 'Vencida',   color: 'text-red-400',    bg: 'bg-red-950/60',    border: 'border-red-800/60'    },
  anulada:   { label: 'Anulada',   color: 'text-zinc-400',   bg: 'bg-zinc-800/60',   border: 'border-zinc-700/60'   },
};

const ESTADO_SUELDO_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'text-yellow-400', bg: 'bg-yellow-950/60', border: 'border-yellow-800/60' },
  pagado:    { label: 'Pagado',    color: 'text-green-400',  bg: 'bg-green-950/60',  border: 'border-green-800/60'  },
};

const _PLAN_PE_RAW: { codigo: string; nombre: string; tipo: 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'gasto' }[] = [
  // ── ACTIVO ─────────────────────────────────────────────────────────────────
  // Efectivo y equivalentes
  { codigo: '1011', nombre: 'Caja - Soles',                               tipo: 'activo' },
  { codigo: '1012', nombre: 'Caja - Dólares',                             tipo: 'activo' },
  { codigo: '1013', nombre: 'Caja Chica',                                 tipo: 'activo' },
  { codigo: '1041', nombre: 'Banco BCP - Cta. Corriente Soles',           tipo: 'activo' },
  { codigo: '1042', nombre: 'Banco BCP - Cta. Corriente Dólares',         tipo: 'activo' },
  { codigo: '1043', nombre: 'Banco BBVA - Cta. Corriente Soles',          tipo: 'activo' },
  { codigo: '1044', nombre: 'Banco BBVA - Cta. Corriente Dólares',        tipo: 'activo' },
  { codigo: '1045', nombre: 'Banco Interbank - Cta. Corriente Soles',     tipo: 'activo' },
  { codigo: '1046', nombre: 'Banco Scotiabank - Cta. Corriente Soles',    tipo: 'activo' },
  { codigo: '1047', nombre: 'Banco de la Nación',                         tipo: 'activo' },
  { codigo: '1051', nombre: 'Cta. de Ahorros BCP - Soles',               tipo: 'activo' },
  { codigo: '1052', nombre: 'Cta. de Ahorros BBVA - Soles',              tipo: 'activo' },
  { codigo: '1061', nombre: 'Depósitos a Plazo - Soles',                  tipo: 'activo' },

  // Cuentas por cobrar comerciales
  { codigo: '1211', nombre: 'Facturas por Cobrar - Emitidas',             tipo: 'activo' },
  { codigo: '1212', nombre: 'Facturas por Cobrar - En cartera',           tipo: 'activo' },
  { codigo: '1213', nombre: 'Letras por Cobrar',                          tipo: 'activo' },
  { codigo: '1219', nombre: 'Otras Cuentas por Cobrar Comerciales',       tipo: 'activo' },

  // Cuentas por cobrar diversas
  { codigo: '1411', nombre: 'Préstamos al Personal',                      tipo: 'activo' },
  { codigo: '1412', nombre: 'Adelanto de Sueldos',                        tipo: 'activo' },
  { codigo: '1611', nombre: 'Rec. en Litigio - Terceros',                 tipo: 'activo' },
  { codigo: '1621', nombre: 'Depósitos en Garantía',                      tipo: 'activo' },
  { codigo: '1631', nombre: 'Intereses por Cobrar',                       tipo: 'activo' },

  // IGV Crédito Fiscal
  { codigo: '1641', nombre: 'IGV - Crédito Fiscal',                       tipo: 'activo' },
  { codigo: '1642', nombre: 'Pagos a Cuenta - Impuesto a la Renta',       tipo: 'activo' },
  { codigo: '1643', nombre: 'Retenciones y Detracciones por Recuperar',   tipo: 'activo' },

  // Existencias
  { codigo: '2011', nombre: 'Mercaderías - Stock',                        tipo: 'activo' },
  { codigo: '2012', nombre: 'Mercaderías en Tránsito',                    tipo: 'activo' },
  { codigo: '2031', nombre: 'Materiales Auxiliares',                      tipo: 'activo' },
  { codigo: '2511', nombre: 'Materiales y Suministros de Oficina',        tipo: 'activo' },
  { codigo: '2611', nombre: 'Envases y Embalajes',                        tipo: 'activo' },

  // Activos no corrientes
  { codigo: '3311', nombre: 'Terrenos',                                   tipo: 'activo' },
  { codigo: '3321', nombre: 'Edificios y Construcciones',                 tipo: 'activo' },
  { codigo: '3341', nombre: 'Equipos de Cómputo y Redes',                 tipo: 'activo' },
  { codigo: '3342', nombre: 'Maquinaria y Equipos de Producción',         tipo: 'activo' },
  { codigo: '3351', nombre: 'Muebles y Enseres',                          tipo: 'activo' },
  { codigo: '3361', nombre: 'Equipos Diversos',                           tipo: 'activo' },
  { codigo: '3371', nombre: 'Unidades de Transporte',                     tipo: 'activo' },
  { codigo: '3391', nombre: 'Depreciación Acumulada (Cr)',                tipo: 'activo' },

  // Intangibles
  { codigo: '3411', nombre: 'Concesiones, Licencias y Derechos',         tipo: 'activo' },
  { codigo: '3431', nombre: 'Software y Programas Informáticos',          tipo: 'activo' },
  { codigo: '3491', nombre: 'Amortización Acumulada Intangibles (Cr)',    tipo: 'activo' },

  // ── PASIVO ─────────────────────────────────────────────────────────────────
  // Tributos por pagar
  { codigo: '4011', nombre: 'IGV - Por Pagar',                            tipo: 'pasivo' },
  { codigo: '4012', nombre: 'IGV - Retenciones de Terceros',              tipo: 'pasivo' },
  { codigo: '4017', nombre: 'Impuesto a la Renta - Por Pagar',            tipo: 'pasivo' },
  { codigo: '4018', nombre: 'Impuesto a la Renta - 4ta Categoría',        tipo: 'pasivo' },
  { codigo: '4019', nombre: 'Impuesto a la Renta - 5ta Categoría',        tipo: 'pasivo' },
  { codigo: '4021', nombre: 'IGV - Detracciones por Pagar',               tipo: 'pasivo' },
  { codigo: '4031', nombre: 'ONP por Pagar',                              tipo: 'pasivo' },
  { codigo: '4032', nombre: 'AFP por Pagar',                              tipo: 'pasivo' },
  { codigo: '4033', nombre: 'EsSalud por Pagar',                          tipo: 'pasivo' },
  { codigo: '4034', nombre: 'SCTR por Pagar',                             tipo: 'pasivo' },

  // Remuneraciones por pagar
  { codigo: '4111', nombre: 'Sueldos y Salarios por Pagar',               tipo: 'pasivo' },
  { codigo: '4112', nombre: 'Comisiones por Pagar',                       tipo: 'pasivo' },
  { codigo: '4113', nombre: 'Gratificaciones por Pagar',                  tipo: 'pasivo' },
  { codigo: '4114', nombre: 'CTS por Pagar',                              tipo: 'pasivo' },
  { codigo: '4115', nombre: 'Vacaciones por Pagar',                       tipo: 'pasivo' },
  { codigo: '4116', nombre: 'Utilidades por Pagar',                       tipo: 'pasivo' },

  // Cuentas por pagar comerciales
  { codigo: '4211', nombre: 'Facturas por Pagar - Proveedores',           tipo: 'pasivo' },
  { codigo: '4212', nombre: 'Letras por Pagar - Proveedores',             tipo: 'pasivo' },
  { codigo: '4219', nombre: 'Otras Cuentas por Pagar Comerciales',        tipo: 'pasivo' },

  // Cuentas por pagar diversas
  { codigo: '4411', nombre: 'Préstamos Bancarios Corto Plazo - BCP',      tipo: 'pasivo' },
  { codigo: '4412', nombre: 'Préstamos Bancarios Corto Plazo - BBVA',     tipo: 'pasivo' },
  { codigo: '4413', nombre: 'Préstamos Bancarios Corto Plazo - Interbank',tipo: 'pasivo' },
  { codigo: '4511', nombre: 'Préstamos Bancarios Largo Plazo',            tipo: 'pasivo' },
  { codigo: '4512', nombre: 'Leasing Financiero por Pagar',               tipo: 'pasivo' },
  { codigo: '4611', nombre: 'Dividendos por Pagar',                       tipo: 'pasivo' },
  { codigo: '4611', nombre: 'Anticipos de Clientes',                      tipo: 'pasivo' },

  // ── PATRIMONIO ─────────────────────────────────────────────────────────────
  { codigo: '5011', nombre: 'Capital Social',                             tipo: 'patrimonio' },
  { codigo: '5021', nombre: 'Acciones de Inversión',                      tipo: 'patrimonio' },
  { codigo: '5611', nombre: 'Reserva Legal',                              tipo: 'patrimonio' },
  { codigo: '5621', nombre: 'Otras Reservas',                             tipo: 'patrimonio' },
  { codigo: '5711', nombre: 'Resultados Acumulados - Utilidades',         tipo: 'patrimonio' },
  { codigo: '5712', nombre: 'Resultados Acumulados - Pérdidas',           tipo: 'patrimonio' },
  { codigo: '5911', nombre: 'Utilidad del Ejercicio',                     tipo: 'patrimonio' },
  { codigo: '5912', nombre: 'Pérdida del Ejercicio',                      tipo: 'patrimonio' },

  // ── GASTOS ─────────────────────────────────────────────────────────────────
  // Personal
  { codigo: '6211', nombre: 'Sueldos y Salarios',                         tipo: 'gasto' },
  { codigo: '6213', nombre: 'Comisiones al Personal',                     tipo: 'gasto' },
  { codigo: '6214', nombre: 'Gratificaciones',                            tipo: 'gasto' },
  { codigo: '6215', nombre: 'Vacaciones',                                 tipo: 'gasto' },
  { codigo: '6216', nombre: 'Compensación por Tiempo de Servicios (CTS)', tipo: 'gasto' },
  { codigo: '6217', nombre: 'EsSalud - Aporte Empleador',                 tipo: 'gasto' },
  { codigo: '6218', nombre: 'SCTR - Aporte Empleador',                    tipo: 'gasto' },
  { codigo: '6271', nombre: 'Régimen de Prestaciones de Salud',           tipo: 'gasto' },

  // Servicios de terceros
  { codigo: '6311', nombre: 'Transporte y Fletes',                        tipo: 'gasto' },
  { codigo: '6321', nombre: 'Honorarios - Recibo por Honorarios',         tipo: 'gasto' },
  { codigo: '6322', nombre: 'Asesoría Legal',                             tipo: 'gasto' },
  { codigo: '6323', nombre: 'Asesoría Contable y Auditoría',              tipo: 'gasto' },
  { codigo: '6324', nombre: 'Consultoría de TI / Sistemas',               tipo: 'gasto' },
  { codigo: '6331', nombre: 'Primas de Seguros',                          tipo: 'gasto' },
  { codigo: '6341', nombre: 'Alquiler de Local / Oficina',                tipo: 'gasto' },
  { codigo: '6342', nombre: 'Alquiler de Vehículos',                      tipo: 'gasto' },
  { codigo: '6343', nombre: 'Alquiler de Equipos',                        tipo: 'gasto' },
  { codigo: '6351', nombre: 'Mantenimiento y Reparaciones - Local',       tipo: 'gasto' },
  { codigo: '6352', nombre: 'Mantenimiento y Reparaciones - Equipos',     tipo: 'gasto' },
  { codigo: '6361', nombre: 'Publicidad y Marketing Digital',             tipo: 'gasto' },
  { codigo: '6362', nombre: 'Relaciones Públicas y Eventos',              tipo: 'gasto' },
  { codigo: '6363', nombre: 'Impresiones y Material Publicitario',        tipo: 'gasto' },
  { codigo: '6371', nombre: 'Servicios Básicos - Agua',                   tipo: 'gasto' },
  { codigo: '6372', nombre: 'Servicios Básicos - Electricidad / Luz',     tipo: 'gasto' },
  { codigo: '6373', nombre: 'Telefonía e Internet',                       tipo: 'gasto' },
  { codigo: '6374', nombre: 'Gas',                                        tipo: 'gasto' },
  { codigo: '6381', nombre: 'Servicio de Mensajería y Courier',           tipo: 'gasto' },
  { codigo: '6391', nombre: 'Gastos Bancarios y Comisiones',              tipo: 'gasto' },
  { codigo: '6392', nombre: 'Portes y Gastos de Transferencias',          tipo: 'gasto' },

  // Cargas diversas de gestión
  { codigo: '6411', nombre: 'Gastos de Representación',                   tipo: 'gasto' },
  { codigo: '6421', nombre: 'Gastos de Viaje - Pasajes',                  tipo: 'gasto' },
  { codigo: '6422', nombre: 'Gastos de Viaje - Viáticos y Alojamiento',   tipo: 'gasto' },
  { codigo: '6431', nombre: 'Suscripciones y Membresías',                 tipo: 'gasto' },
  { codigo: '6432', nombre: 'Licencias de Software',                      tipo: 'gasto' },
  { codigo: '6433', nombre: 'Capacitación y Formación del Personal',      tipo: 'gasto' },
  { codigo: '6441', nombre: 'Útiles de Oficina y Papelería',              tipo: 'gasto' },
  { codigo: '6442', nombre: 'Materiales de Limpieza',                     tipo: 'gasto' },
  { codigo: '6451', nombre: 'Impuestos Municipales y Licencias',          tipo: 'gasto' },
  { codigo: '6452', nombre: 'Multas y Sanciones',                         tipo: 'gasto' },

  // Provisiones y depreciación
  { codigo: '6811', nombre: 'Depreciación - Edificios',                   tipo: 'gasto' },
  { codigo: '6814', nombre: 'Depreciación - Inmuebles, Maq. y Equipo',    tipo: 'gasto' },
  { codigo: '6815', nombre: 'Depreciación - Equipos de Cómputo',          tipo: 'gasto' },
  { codigo: '6816', nombre: 'Depreciación - Unidades de Transporte',      tipo: 'gasto' },
  { codigo: '6821', nombre: 'Amortización - Intangibles / Software',      tipo: 'gasto' },
  { codigo: '6841', nombre: 'Provisión para Cuentas de Cobranza Dudosa',  tipo: 'gasto' },

  // Gastos financieros
  { codigo: '6711', nombre: 'Intereses por Préstamos Bancarios',          tipo: 'gasto' },
  { codigo: '6712', nombre: 'Intereses por Leasing',                      tipo: 'gasto' },
  { codigo: '6713', nombre: 'Pérdida por Diferencia de Cambio',           tipo: 'gasto' },

  // ── INGRESOS ───────────────────────────────────────────────────────────────
  { codigo: '7011', nombre: 'Ventas de Mercaderías - Mercado Local',      tipo: 'ingreso' },
  { codigo: '7012', nombre: 'Ventas de Mercaderías - Exportación',        tipo: 'ingreso' },
  { codigo: '7021', nombre: 'Ventas de Productos Terminados',             tipo: 'ingreso' },
  { codigo: '7031', nombre: 'Prestación de Servicios - Mercado Local',    tipo: 'ingreso' },
  { codigo: '7032', nombre: 'Prestación de Servicios - Exterior',         tipo: 'ingreso' },
  { codigo: '7033', nombre: 'Servicios de Consultoría',                   tipo: 'ingreso' },
  { codigo: '7034', nombre: 'Servicios de Mantenimiento',                 tipo: 'ingreso' },
  { codigo: '7041', nombre: 'Descuentos y Rebajas Obtenidos',             tipo: 'ingreso' },
  { codigo: '7051', nombre: 'Alquiler de Bienes',                         tipo: 'ingreso' },
  { codigo: '7091', nombre: 'Devoluciones sobre Ventas (Cr)',             tipo: 'ingreso' },
  { codigo: '7511', nombre: 'Ingresos por Comisiones',                    tipo: 'ingreso' },
  { codigo: '7591', nombre: 'Otros Ingresos de Gestión',                  tipo: 'ingreso' },
  { codigo: '7711', nombre: 'Intereses Ganados',                          tipo: 'ingreso' },
  { codigo: '7712', nombre: 'Ganancia por Diferencia de Cambio',          tipo: 'ingreso' },
  { codigo: '7713', nombre: 'Dividendos Recibidos',                       tipo: 'ingreso' },
  { codigo: '7791', nombre: 'Ingresos Financieros Diversos',              tipo: 'ingreso' },
];

// ─── Plan General Contable — España 🇪🇸 ───────────────────────────────────────
const _PLAN_ES_RAW: { codigo: string; nombre: string; tipo: 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'gasto' }[] = [
  // ── GRUPO 1: FINANCIACIÓN BÁSICA ─────────────────────────────────────────────
  // Capital
  { codigo: '100', nombre: 'Capital social',                                tipo: 'patrimonio' },
  { codigo: '101', nombre: 'Fondo social',                                  tipo: 'patrimonio' },
  { codigo: '102', nombre: 'Capital',                                       tipo: 'patrimonio' },
  { codigo: '108', nombre: 'Acciones propias en situaciones especiales',    tipo: 'patrimonio' },
  { codigo: '109', nombre: 'Acciones propias para reducción de capital',    tipo: 'patrimonio' },
  // Reservas
  { codigo: '110', nombre: 'Prima de emisión o asunción',                   tipo: 'patrimonio' },
  { codigo: '112', nombre: 'Reserva legal',                                 tipo: 'patrimonio' },
  { codigo: '113', nombre: 'Reservas voluntarias',                          tipo: 'patrimonio' },
  { codigo: '114', nombre: 'Reservas especiales',                           tipo: 'patrimonio' },
  { codigo: '120', nombre: 'Remanente',                                     tipo: 'patrimonio' },
  { codigo: '121', nombre: 'Resultados negativos de ejercicios anteriores', tipo: 'patrimonio' },
  { codigo: '129', nombre: 'Resultado del ejercicio',                       tipo: 'patrimonio' },
  // Subvenciones
  { codigo: '130', nombre: 'Subvenciones oficiales de capital',             tipo: 'patrimonio' },
  { codigo: '131', nombre: 'Donaciones y legados de capital',               tipo: 'patrimonio' },
  { codigo: '132', nombre: 'Otras subvenciones, donaciones y legados',      tipo: 'patrimonio' },
  { codigo: '137', nombre: 'Ingresos fiscales a distribuir en varios ej.',  tipo: 'patrimonio' },
  // Provisiones
  { codigo: '140', nombre: 'Provisión para impuestos',                      tipo: 'pasivo' },
  { codigo: '141', nombre: 'Provisión para otras responsabilidades',        tipo: 'pasivo' },
  { codigo: '142', nombre: 'Provisión para desmantelamiento',               tipo: 'pasivo' },
  { codigo: '143', nombre: 'Provisión por actuaciones medioambientales',    tipo: 'pasivo' },
  // Deudas LP partes vinculadas
  { codigo: '160', nombre: 'Deudas LP con entidades de crédito vinculadas', tipo: 'pasivo' },
  { codigo: '161', nombre: 'Proveedores de inmovilizado LP partes vinc.',   tipo: 'pasivo' },
  { codigo: '163', nombre: 'Otras deudas LP con partes vinculadas',         tipo: 'pasivo' },
  // Deudas LP préstamos
  { codigo: '170', nombre: 'Deudas LP con entidades de crédito',            tipo: 'pasivo' },
  { codigo: '171', nombre: 'Deudas a largo plazo',                          tipo: 'pasivo' },
  { codigo: '172', nombre: 'Deudas LP transformables en subvenciones',      tipo: 'pasivo' },
  { codigo: '180', nombre: 'Fianzas recibidas a largo plazo',               tipo: 'pasivo' },
  { codigo: '185', nombre: 'Depósitos recibidos a largo plazo',             tipo: 'pasivo' },

  // ── GRUPO 2: ACTIVO NO CORRIENTE ─────────────────────────────────────────────
  // Inmovilizado intangible
  { codigo: '200', nombre: 'Investigación',                                 tipo: 'activo' },
  { codigo: '201', nombre: 'Desarrollo',                                    tipo: 'activo' },
  { codigo: '202', nombre: 'Concesiones administrativas',                   tipo: 'activo' },
  { codigo: '203', nombre: 'Propiedad industrial',                          tipo: 'activo' },
  { codigo: '205', nombre: 'Derechos de traspaso',                          tipo: 'activo' },
  { codigo: '206', nombre: 'Aplicaciones informáticas',                     tipo: 'activo' },
  { codigo: '209', nombre: 'Anticipos para inmovilizado intangible',        tipo: 'activo' },
  // Inmovilizado material
  { codigo: '210', nombre: 'Terrenos y bienes naturales',                   tipo: 'activo' },
  { codigo: '211', nombre: 'Construcciones',                                tipo: 'activo' },
  { codigo: '212', nombre: 'Instalaciones técnicas',                        tipo: 'activo' },
  { codigo: '213', nombre: 'Maquinaria',                                    tipo: 'activo' },
  { codigo: '214', nombre: 'Utillaje',                                      tipo: 'activo' },
  { codigo: '215', nombre: 'Otras instalaciones',                           tipo: 'activo' },
  { codigo: '216', nombre: 'Mobiliario',                                    tipo: 'activo' },
  { codigo: '217', nombre: 'Equipos para procesos de información',          tipo: 'activo' },
  { codigo: '218', nombre: 'Elementos de transporte',                       tipo: 'activo' },
  { codigo: '219', nombre: 'Otro inmovilizado material',                    tipo: 'activo' },
  // Inversiones inmobiliarias
  { codigo: '220', nombre: 'Inversiones en terrenos y bienes naturales',    tipo: 'activo' },
  { codigo: '221', nombre: 'Inversiones en construcciones',                 tipo: 'activo' },
  // Inmovilizado en curso
  { codigo: '230', nombre: 'Adaptación de terrenos',                        tipo: 'activo' },
  { codigo: '231', nombre: 'Construcciones en curso',                       tipo: 'activo' },
  { codigo: '239', nombre: 'Anticipos para inmovilizado material',          tipo: 'activo' },
  // Inversiones financieras LP
  { codigo: '240', nombre: 'Participaciones LP en partes vinculadas',       tipo: 'activo' },
  { codigo: '242', nombre: 'Créditos LP a partes vinculadas',               tipo: 'activo' },
  { codigo: '250', nombre: 'Inversiones financieras LP en patrimonio',      tipo: 'activo' },
  { codigo: '252', nombre: 'Créditos a largo plazo',                        tipo: 'activo' },
  { codigo: '260', nombre: 'Fianzas constituidas a largo plazo',            tipo: 'activo' },
  { codigo: '265', nombre: 'Depósitos constituidos a largo plazo',          tipo: 'activo' },
  // Amortización y deterioro
  { codigo: '280', nombre: 'Amort. acumulada del inmovilizado intangible',  tipo: 'activo' },
  { codigo: '281', nombre: 'Amort. acumulada del inmovilizado material',    tipo: 'activo' },
  { codigo: '282', nombre: 'Amort. acumulada de inversiones inmobiliarias', tipo: 'activo' },
  { codigo: '290', nombre: 'Deterioro del inmovilizado intangible',         tipo: 'activo' },
  { codigo: '291', nombre: 'Deterioro del inmovilizado material',           tipo: 'activo' },

  // ── GRUPO 3: EXISTENCIAS ──────────────────────────────────────────────────────
  { codigo: '300', nombre: 'Mercaderías A',                                 tipo: 'activo' },
  { codigo: '301', nombre: 'Mercaderías B',                                 tipo: 'activo' },
  { codigo: '310', nombre: 'Materias primas A',                             tipo: 'activo' },
  { codigo: '320', nombre: 'Elementos y conjuntos incorporables',           tipo: 'activo' },
  { codigo: '321', nombre: 'Combustibles',                                  tipo: 'activo' },
  { codigo: '322', nombre: 'Repuestos',                                     tipo: 'activo' },
  { codigo: '325', nombre: 'Materiales diversos',                           tipo: 'activo' },
  { codigo: '326', nombre: 'Embalajes',                                     tipo: 'activo' },
  { codigo: '327', nombre: 'Envases',                                       tipo: 'activo' },
  { codigo: '328', nombre: 'Material de oficina',                           tipo: 'activo' },
  { codigo: '330', nombre: 'Productos en curso A',                          tipo: 'activo' },
  { codigo: '350', nombre: 'Productos terminados A',                        tipo: 'activo' },

  // ── GRUPO 4: ACREEDORES Y DEUDORES ───────────────────────────────────────────
  { codigo: '400', nombre: 'Proveedores',                                   tipo: 'pasivo' },
  { codigo: '4000',nombre: 'Proveedores (euros)',                           tipo: 'pasivo' },
  { codigo: '4004',nombre: 'Proveedores (moneda extranjera)',               tipo: 'pasivo' },
  { codigo: '410', nombre: 'Acreedores por prestaciones de servicios',      tipo: 'pasivo' },
  { codigo: '411', nombre: 'Acreedores, efectos comerciales a pagar',       tipo: 'pasivo' },
  { codigo: '430', nombre: 'Clientes',                                      tipo: 'activo' },
  { codigo: '4300',nombre: 'Clientes (euros)',                              tipo: 'activo' },
  { codigo: '4304',nombre: 'Clientes (moneda extranjera)',                  tipo: 'activo' },
  { codigo: '440', nombre: 'Deudores',                                      tipo: 'activo' },
  { codigo: '460', nombre: 'Anticipos de remuneraciones',                   tipo: 'activo' },
  { codigo: '465', nombre: 'Remuneraciones pendientes de pago',             tipo: 'pasivo' },
  { codigo: '470', nombre: 'Hacienda Pública deudora',                      tipo: 'activo' },
  { codigo: '472', nombre: 'Hacienda Pública IVA soportado',                tipo: 'activo' },
  { codigo: '475', nombre: 'Hacienda Pública acreedora',                    tipo: 'pasivo' },

  // ── GRUPO 5: CUENTAS FINANCIERAS ─────────────────────────────────────────────
  { codigo: '500', nombre: 'Obligaciones y bonos a corto plazo',            tipo: 'pasivo' },
  { codigo: '520', nombre: 'Deudas CP con entidades de crédito',            tipo: 'pasivo' },
  { codigo: '521', nombre: 'Deudas a corto plazo',                          tipo: 'pasivo' },
  { codigo: '540', nombre: 'Inversiones financieras CP en patrimonio',      tipo: 'activo' },
  { codigo: '550', nombre: 'Titular de la explotación',                     tipo: 'patrimonio' },
  { codigo: '560', nombre: 'Fianzas recibidas a corto plazo',               tipo: 'pasivo' },
  { codigo: '570', nombre: 'Caja, euros',                                   tipo: 'activo' },
  { codigo: '571', nombre: 'Caja, moneda extranjera',                       tipo: 'activo' },
  { codigo: '572', nombre: 'Bancos e instituciones de crédito c/c euros',   tipo: 'activo' },
  { codigo: '573', nombre: 'Bancos e instituciones de crédito c/c m.ext.',  tipo: 'activo' },

  // ── GRUPO 6: COMPRAS Y GASTOS ─────────────────────────────────────────────────
  { codigo: '600', nombre: 'Compras de mercaderías',                        tipo: 'gasto' },
  { codigo: '601', nombre: 'Compras de materias primas',                    tipo: 'gasto' },
  { codigo: '610', nombre: 'Variación de existencias de mercaderías',       tipo: 'gasto' },
  { codigo: '621', nombre: 'Arrendamientos y cánones',                      tipo: 'gasto' },
  { codigo: '622', nombre: 'Reparaciones y conservación',                   tipo: 'gasto' },
  { codigo: '623', nombre: 'Servicios profesionales independientes',        tipo: 'gasto' },
  { codigo: '624', nombre: 'Transportes',                                   tipo: 'gasto' },
  { codigo: '625', nombre: 'Primas de seguros',                             tipo: 'gasto' },
  { codigo: '626', nombre: 'Servicios bancarios',                           tipo: 'gasto' },
  { codigo: '627', nombre: 'Publicidad',                                    tipo: 'gasto' },
  { codigo: '628', nombre: 'Suministros',                                   tipo: 'gasto' },
  { codigo: '630', nombre: 'Impuesto sobre beneficios',                     tipo: 'gasto' },
  { codigo: '640', nombre: 'Sueldos y salarios',                            tipo: 'gasto' },
  { codigo: '641', nombre: 'Indemnizaciones',                               tipo: 'gasto' },
  { codigo: '642', nombre: 'Seguridad Social a cargo de la empresa',        tipo: 'gasto' },
  { codigo: '650', nombre: 'Pérdidas de créditos comerciales',              tipo: 'gasto' },
  { codigo: '662', nombre: 'Intereses de deudas',                           tipo: 'gasto' },
  { codigo: '670', nombre: 'Pérdidas del inmovilizado intangible',          tipo: 'gasto' },
  { codigo: '680', nombre: 'Amortización del inmovilizado intangible',      tipo: 'gasto' },
  { codigo: '681', nombre: 'Amortización del inmovilizado material',        tipo: 'gasto' },
  { codigo: '690', nombre: 'Pérdidas por deterioro del inmovilizado int.',  tipo: 'gasto' },

  // ── GRUPO 7: VENTAS E INGRESOS ────────────────────────────────────────────────
  { codigo: '700', nombre: 'Ventas de mercaderías',                         tipo: 'ingreso' },
  { codigo: '701', nombre: 'Ventas de productos terminados',                tipo: 'ingreso' },
  { codigo: '704', nombre: 'Ventas de envases y embalajes',                 tipo: 'ingreso' },
  { codigo: '705', nombre: 'Prestaciones de servicios',                     tipo: 'ingreso' },
  { codigo: '706', nombre: 'Descuentos sobre ventas por pronto pago',       tipo: 'ingreso' },
  { codigo: '708', nombre: 'Devoluciones de ventas',                        tipo: 'ingreso' },
  { codigo: '710', nombre: 'Variación de existencias de mercaderías',       tipo: 'ingreso' },
  { codigo: '730', nombre: 'Trabajos realizados para inmovilizado int.',    tipo: 'ingreso' },
  { codigo: '740', nombre: 'Subvenciones a la explotación',                 tipo: 'ingreso' },
  { codigo: '752', nombre: 'Ingresos por arrendamientos',                   tipo: 'ingreso' },
  { codigo: '760', nombre: 'Ingresos de participaciones en patrimonio',     tipo: 'ingreso' },
  { codigo: '762', nombre: 'Ingresos de créditos',                          tipo: 'ingreso' },
  { codigo: '770', nombre: 'Beneficios del inmovilizado intangible',        tipo: 'ingreso' },
  { codigo: '790', nombre: 'Reversión del deterioro del inmovilizado int.', tipo: 'ingreso' },
];

// ─── Plan contable combinado con país ────────────────────────────────────────
type PlanEntry = { codigo: string; nombre: string; tipo: 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'gasto'; country: 'PE' | 'ES' };

const PLAN_CONTABLE: PlanEntry[] = [
  ..._PLAN_PE_RAW.map(e => ({ ...e, country: 'PE' as const })),
  ..._PLAN_ES_RAW.map(e => ({ ...e, country: 'ES' as const })),
];

const TIPO_COLOR: Record<string, string> = {
  activo:     'text-blue-400',
  pasivo:     'text-orange-400',
  patrimonio: 'text-purple-400',
  ingreso:    'text-emerald-400',
  gasto:      'text-red-400',
};

const MONEDAS_CONFIG: Record<Moneda, { label: string; simbolo: string; locale: string; iso: string; flag: string }> = {
  PEN: { label: 'Sol peruano',    simbolo: 'S/',  locale: 'es-PE', iso: 'PEN', flag: '🇵🇪' },
  USD: { label: 'Dólar americano',simbolo: '$',   locale: 'en-US', iso: 'USD', flag: '🇺🇸' },
  EUR: { label: 'Euro',           simbolo: '€',   locale: 'de-DE', iso: 'EUR', flag: '🇪🇺' },
  GBP: { label: 'Libra esterlina',simbolo: '£',   locale: 'en-GB', iso: 'GBP', flag: '🇬🇧' },
};

const MESES = [
  'Ene','Feb','Mar','Abr','May','Jun',
  'Jul','Ago','Sep','Oct','Nov','Dic'
];

// ─── Libro Bancos — tipos y constantes ───────────────────────────────────────
interface LibroBancoEntry {
  id: string;
  date: Date;
  tipo: TipoTransaccion;
  bankId: string;
  bankName: string;
  description: string;
  reference?: string;
  amount: number;
  currency: 'PEN' | 'EUR' | 'USD';
  category: string;
  createdBy: string;
  creatorName: string;
  notes?: string;
  createdAt: Date;
}

interface BancoOption {
  id: string;
  name: string;
  country: 'PE' | 'ES' | 'custom';
}

const BANCOS: BancoOption[] = [
  // Perú
  { id: 'bcp',       name: 'BCP',              country: 'PE' },
  { id: 'interbank', name: 'Interbank',         country: 'PE' },
  { id: 'bbva-pe',   name: 'BBVA Perú',         country: 'PE' },
  { id: 'scotiabank',name: 'Scotiabank',         country: 'PE' },
  { id: 'banbif',    name: 'BanBif',            country: 'PE' },
  { id: 'pichincha', name: 'Pichincha',         country: 'PE' },
  { id: 'yape',      name: 'Yape',              country: 'PE' },
  { id: 'plin',      name: 'Plin',              country: 'PE' },
  // España
  { id: 'santander', name: 'Santander',         country: 'ES' },
  { id: 'bbva-es',   name: 'BBVA España',       country: 'ES' },
  { id: 'caixabank', name: 'CaixaBank',         country: 'ES' },
  { id: 'sabadell',  name: 'Sabadell',          country: 'ES' },
  { id: 'ing-es',    name: 'ING España',        country: 'ES' },
  { id: 'revolut',   name: 'Revolut',           country: 'ES' },
  // Otros
  { id: 'efectivo',  name: 'Efectivo / Caja',   country: 'custom' },
  { id: 'otro',      name: 'Otro',              country: 'custom' },
];

const BANCO_FLAG: Record<string, string> = { PE: '🇵🇪', ES: '🇪🇸', custom: '💼' };

const CATEGORIAS_BANCO = [
  'Ventas', 'Servicios', 'Inversión', 'Préstamo recibido',
  'Nómina', 'Proveedor', 'Impuestos', 'Gastos operativos',
  'Marketing', 'Equipamiento', 'Suscripciones', 'Transferencia', 'Otro',
];

const getBancoById = (id: string): BancoOption | null =>
  BANCOS.find(b => b.id === id) ?? null;

const formatBancoCurrency = (amount: number, currency: string): string => {
  const symbols: Record<string, string> = { PEN: 'S/', EUR: '€', USD: '$' };
  return `${symbols[currency] ?? ''} ${amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ─── Helper para convertir fecha ──────────────────────────────────────────────
const toDate = (fecha: any): Date => {
  if (fecha instanceof Timestamp) {
    return fecha.toDate();
  }
  if (fecha?.toDate) {
    return fecha.toDate();
  }
  if (typeof fecha === 'string') {
    return new Date(fecha);
  }
  return new Date();
};

// ─── Componente principal ─────────────────────────────────────────────────────
const Contador: React.FC = () => {
  const { userProfile, isCEO, isContador } = useAuth();
  const canWrite = isCEO || isContador;

  // ── Contabilidad state ──
  const [transacciones,  setTransacciones]  = useState<Transaccion[]>([]);
  const [facturas,       setFacturas]       = useState<Factura[]>([]);
  const [presupuestos,   setPresupuestos]   = useState<Presupuesto[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);

  // ── Empleados state ──
  const [empleados,          setEmpleados]          = useState<UserProfile[]>([]);
  const [sueldos,            setSueldos]            = useState<Sueldo[]>([]);
  const [empSearch,          setEmpSearch]          = useState('');
  const [selectedEmp,        setSelectedEmp]        = useState<UserProfile | null>(null);
  const [showEmpDetail,      setShowEmpDetail]      = useState(false);
  const [showContractModal,  setShowContractModal]  = useState(false);
  const [contractEmp,        setContractEmp]        = useState<UserProfile | null>(null);
  const [showSueldoModal,    setShowSueldoModal]    = useState(false);
  const [editSueldoId,       setEditSueldoId]       = useState<string | null>(null);
  const [sueldoForm, setSueldoForm] = useState({
    montoBase:      '',
    bonificaciones: '0',
    descuentos:     '0',
    periodo:        format(new Date(), 'yyyy-MM'),
    estado:         'pendiente' as Sueldo['estado'],
    observaciones:  '',
  });

  // ── Configuración empresa (para PDF) ──
  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>({
    empresaNombre: '', ruc: '', direccion: '', telefono: '', email: '', logoUrl: '',
  });
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configForm, setConfigForm] = useState<CompanyConfig>({
    empresaNombre: '', ruc: '', direccion: '', telefono: '', email: '', logoUrl: '',
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

  // Modales
  const [showTxModal,   setShowTxModal]   = useState(false);
  const [showFacModal,  setShowFacModal]  = useState(false);
  const [showPresModal, setShowPresModal] = useState(false);
  const [editPresId,    setEditPresId]    = useState<string | null>(null);

  // Filtros transacciones
  const [txSearch,  setTxSearch]  = useState('');
  const [txFiltro,  setTxFiltro]  = useState<'todos' | 'ingreso' | 'egreso'>('todos');
  const [txCatFiltro, setTxCatFiltro] = useState('todas');

  // Filtro facturas
  const [facSearch,  setFacSearch]  = useState('');
  const [facEstado,  setFacEstado]  = useState<'todos' | Factura['estado']>('todos');

  const [asientos,         setAsientos]         = useState<AsientoContable[]>([]);
  const [showAsientoModal, setShowAsientoModal] = useState(false);
  const [asientoSearch,    setAsientoSearch]    = useState('');
  const [asientoFiltroMes, setAsientoFiltroMes] = useState('todos');
  const [expandedAsiento,  setExpandedAsiento]  = useState<string | null>(null);
  const [asientoForm,      setAsientoForm]      = useState({ fecha: format(new Date(), 'yyyy-MM-dd'), glosa: '' });
  const [lineasForm,       setLineasForm]       = useState<Omit<LineaAsiento,'glosa'>[]>([
    { cuentaCodigo: '', cuentaNombre: '', debe: 0, haber: 0 },
    { cuentaCodigo: '', cuentaNombre: '', debe: 0, haber: 0 },
  ]);
  const [cuentaSearch, setCuentaSearch] = useState<{ [key: string]: string }>({});
  const [cuentaPais,   setCuentaPais]   = useState<{ [key: number]: 'PE' | 'ES' }>({});

  // Forms
  const [txForm, setTxForm] = useState({
    tipo: 'ingreso' as TipoTransaccion,
    monto: '',
    descripcion: '',
    categoria: '',
    fecha: format(new Date(), 'yyyy-MM-dd'),
  });
  const [facForm, setFacForm] = useState({
  numero: '',
  entidad: '',
  tipoEntidad: 'proveedor' as 'proveedor' | 'cliente',
  monto: '',
  estado: 'pendiente' as Factura['estado'],
  fecha: format(new Date(), 'yyyy-MM-dd'),
  descripcion: '',
  observaciones: '',  // ← agregar
});
  const [presForm, setPresForm] = useState({
    nombre: '',
    categoria: '',
    montoAsignado: '',
    periodo: format(new Date(), 'yyyy-MM'),
  });
  const [monedaConfig, setMonedaConfig] = useState<MonedaConfig>({
    monedaActiva:  'PEN',
    tipoCambioUSD: 3.75,
    tipoCambioEUR: 4.05,
    tipoCambioGBP: 4.70,
  });
  const [showMonedaModal, setShowMonedaModal] = useState(false);
  const [monedaForm,      setMonedaForm]      = useState<MonedaConfig>({
    monedaActiva:  'PEN',
    tipoCambioUSD: 3.75,
    tipoCambioEUR: 4.05,
    tipoCambioGBP: 4.70,
  });
  const [savingMoneda, setSavingMoneda] = useState(false);

  const [saving, setSaving] = useState(false);

  // ── Libro Bancos state ──
  const [libroEntries,     setLibroEntries]     = useState<LibroBancoEntry[]>([]);
  const [showLibroModal,   setShowLibroModal]   = useState(false);
  const [libroDeletingId,  setLibroDeletingId]  = useState<string | null>(null);
  const [libroSearch,      setLibroSearch]      = useState('');
  const [libroFilterTipo,  setLibroFilterTipo]  = useState<'todos' | TipoTransaccion>('todos');
  const [libroFilterBanco, setLibroFilterBanco] = useState('all');
  const [libroDateFrom,    setLibroDateFrom]    = useState('');
  const [libroDateTo,      setLibroDateTo]      = useState('');
  const [showLibroFilters, setShowLibroFilters] = useState(false);
  const [libroForm, setLibroForm] = useState({
    date:        format(new Date(), 'yyyy-MM-dd'),
    tipo:        'ingreso' as TipoTransaccion,
    bankId:      '',
    description: '',
    reference:   '',
    amount:      '',
    currency:    'PEN' as 'PEN' | 'EUR' | 'USD',
    category:    'Ventas',
    notes:       '',
  });

  const formatMoney = useCallback((n: number) => {
    const cfg = MONEDAS_CONFIG[monedaConfig.monedaActiva];
    return new Intl.NumberFormat(cfg.locale, {
      style:    'currency',
      currency: cfg.iso,
      minimumFractionDigits: 2,
    }).format(n);
  }, [monedaConfig.monedaActiva]);

  // ── Fetch ──
  const fetchAll = useCallback(async () => {
    try {
      const [txSnap, facSnap, presSnap, empData, sueldosSnap, configSnap, asientosSnap, libroSnap] = await Promise.all([
        getDocs(query(collection(db, 'contabilidad_transacciones'), orderBy('fecha', 'desc'))),
        getDocs(query(collection(db, 'contabilidad_facturas'),      orderBy('fecha', 'desc'))),
        getDocs(query(collection(db, 'contabilidad_presupuestos'),  orderBy('periodo', 'desc'))),
        getAllUsers(),
        getDocs(query(collection(db, 'contabilidad_sueldos'),       orderBy('creadoEn', 'desc'))),
        getDocs(collection(db, 'contabilidad_config')),
        getDocs(query(collection(db, 'contabilidad_asientos'),      orderBy('numero', 'desc'))),
        getDocs(query(collection(db, 'libro_diario'),               orderBy('date', 'desc'))),
      ]);
      setTransacciones(txSnap.docs.map(d  => ({ id: d.id, ...d.data() } as Transaccion)));
      setFacturas(facSnap.docs.map(d      => ({ id: d.id, ...d.data() } as Factura)));
      setPresupuestos(presSnap.docs.map(d => ({ id: d.id, ...d.data() } as Presupuesto)));
      setEmpleados(empData as UserProfile[]);
      setSueldos(sueldosSnap.docs.map(d   => ({ id: d.id, ...d.data() } as Sueldo)));
      setAsientos(asientosSnap.docs.map(d => ({ id: d.id, ...d.data() } as AsientoContable)));
      setLibroEntries(libroSnap.docs.map(d => {
        const raw = d.data();
        return {
          ...raw,
          id:        d.id,
          date:      raw.date?.toDate?.() ?? new Date(raw.date),
          createdAt: raw.createdAt?.toDate?.() ?? new Date(),
        } as LibroBancoEntry;
      }));
      
      const cfgDoc = configSnap.docs.find(d => d.id === 'empresa');
      const monedaDoc = configSnap.docs.find(d => d.id === 'moneda');
      if (monedaDoc) {
        const m = monedaDoc.data() as MonedaConfig;
        setMonedaConfig(m);
        setMonedaForm(m);
      }
      if (cfgDoc) {
        const cfg = cfgDoc.data() as CompanyConfig;
        setCompanyConfig(cfg);
        setConfigForm(cfg);
      }
    } catch (e) {
      console.error('Error fetching contabilidad:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  // ── KPIs ──
  const totalIngresos      = transacciones.filter(t => t.tipo === 'ingreso').reduce((a, t) => a + t.monto, 0);
  const totalEgresos       = transacciones.filter(t => t.tipo === 'egreso').reduce((a, t) => a + t.monto, 0);
  const balance            = totalIngresos - totalEgresos;
  const facturasPendientes = facturas.filter(f => f.estado === 'pendiente').length;
  const facturasVencidas   = facturas.filter(f => f.estado === 'vencida').length;
  const sueldosPendientes  = sueldos.filter(s => s.estado === 'pendiente').length;
  const totalPlanillaMes   = sueldos
    .filter(s => s.periodo === format(new Date(), 'yyyy-MM'))
    .reduce((a, s) => a + (s.montoBase + s.bonificaciones - s.descuentos), 0);

  // ── Datos para gráfica de barras por mes ──
  const chartData = MESES.map((mes, idx) => {
    const mesNum = idx + 1;
    const ingresos = transacciones
      .filter(t => t.tipo === 'ingreso' && toDate(t.fecha).getMonth() + 1 === mesNum)
      .reduce((a, t) => a + t.monto, 0);
    const egresos = transacciones
      .filter(t => t.tipo === 'egreso' && toDate(t.fecha).getMonth() + 1 === mesNum)
      .reduce((a, t) => a + t.monto, 0);
    return { mes, ingresos, egresos, balance: ingresos - egresos };
  });

  // ── Datos para gráfica de categorías ──
  const catData = CATEGORIAS_EGRESO.map(cat => ({
    cat: cat.slice(0, 10),
    monto: transacciones
      .filter(t => t.tipo === 'egreso' && t.categoria === cat)
      .reduce((a, t) => a + t.monto, 0),
  })).filter(c => c.monto > 0);

  // ── Guardar Transacción ──
  const handleSaveTx = async () => {
    if (!txForm.monto || !txForm.descripcion || !txForm.categoria) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'contabilidad_transacciones'), {
        tipo:           txForm.tipo,
        monto:          parseFloat(txForm.monto),
        descripcion:    txForm.descripcion,
        categoria:      txForm.categoria,
        fecha:          Timestamp.fromDate(new Date(txForm.fecha)),
        creadoPor:      userProfile?.uid || '',
        creadoPorNombre: userProfile?.displayName || '',
      });
      setShowTxModal(false);
      setTxForm({ tipo: 'ingreso', monto: '', descripcion: '', categoria: '', fecha: format(new Date(), 'yyyy-MM-dd') });
      fetchAll();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const totalDebeForm  = lineasForm.reduce((a, l) => a + (l.debe  || 0), 0);
  const totalHaberForm = lineasForm.reduce((a, l) => a + (l.haber || 0), 0);
  const asientoBalanceado = Math.abs(totalDebeForm - totalHaberForm) < 0.01 && totalDebeForm > 0;

  const handleAddLinea = () =>
    setLineasForm(p => [...p, { cuentaCodigo: '', cuentaNombre: '', debe: 0, haber: 0 }]);

  const handleRemoveLinea = (idx: number) =>
    setLineasForm(p => p.filter((_, i) => i !== idx));

  const handleLineaChange = (idx: number, field: keyof Omit<LineaAsiento,'glosa'>, value: string | number) =>
    setLineasForm(p => p.map((l, i) => i === idx ? { ...l, [field]: value } : l));

  const handleSelectCuenta = (idx: number, c: typeof PLAN_CONTABLE[0]) => {
    handleLineaChange(idx, 'cuentaCodigo', c.codigo);
    handleLineaChange(idx, 'cuentaNombre', c.nombre);
    setCuentaSearch(p => ({ ...p, [idx]: '' }));
  };

  const handleSaveAsiento = async () => {
    if (!asientoBalanceado || !asientoForm.glosa) return;
    setSaving(true);
    try {
      const nextNumero = (asientos[0]?.numero ?? 0) + 1;
      const lineasFinal: LineaAsiento[] = lineasForm
  .filter(l => l.debe > 0 || l.haber > 0)
  .map((l, idx) => ({
    ...l,
    glosa: cuentaSearch[`desc_${idx}`] || asientoForm.glosa,
  }));
      await addDoc(collection(db, 'contabilidad_asientos'), {
        numero:          nextNumero,
        fecha:           Timestamp.fromDate(new Date(asientoForm.fecha)),
        glosa:           asientoForm.glosa,
        lineas:          lineasFinal,
        totalDebe:       totalDebeForm,
        totalHaber:      totalHaberForm,
        creadoPor:       userProfile?.uid || '',
        creadoPorNombre: userProfile?.displayName || '',
        creadoEn:        Timestamp.now(),
      });
      setShowAsientoModal(false);
      setAsientoForm({ fecha: format(new Date(), 'yyyy-MM-dd'), glosa: '' });
      setLineasForm([
        { cuentaCodigo: '', cuentaNombre: '', debe: 0, haber: 0 },
        { cuentaCodigo: '', cuentaNombre: '', debe: 0, haber: 0 },
      ]);
      fetchAll();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  // ── Guardar Factura ──
  const handleSaveFac = async () => {
    if (!facForm.entidad || !facForm.monto) return;
    setSaving(true);
    try {
      const numeroAuto = generarNumeroFactura();
      await addDoc(collection(db, 'contabilidad_facturas'), {
        numero:      numeroAuto,
        entidad:     facForm.entidad,
        tipoEntidad: facForm.tipoEntidad,
        monto:       parseFloat(facForm.monto),
        estado:      facForm.estado,
        fecha:       Timestamp.fromDate(new Date(facForm.fecha)),
        descripcion: facForm.descripcion,
        creadoPor:   userProfile?.uid || '',
        observaciones: facForm.observaciones,  // ← agregar
      });
      setShowFacModal(false);
      setFacForm({ numero: '', entidad: '', tipoEntidad: 'proveedor', monto: '', estado: 'pendiente', fecha: format(new Date(), 'yyyy-MM-dd'), descripcion: '', observaciones: '' });
      fetchAll();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  // ── Guardar Presupuesto ──
  const handleSavePres = async () => {
    if (!presForm.nombre || !presForm.montoAsignado || !presForm.categoria) return;
    setSaving(true);
    try {
      if (editPresId) {
        await updateDoc(doc(db, 'contabilidad_presupuestos', editPresId), {
          nombre:        presForm.nombre,
          categoria:     presForm.categoria,
          montoAsignado: parseFloat(presForm.montoAsignado),
          periodo:       presForm.periodo,
        });
      } else {
        await addDoc(collection(db, 'contabilidad_presupuestos'), {
          ...presForm,
          montoAsignado: parseFloat(presForm.montoAsignado),
          montoUsado:    0,
          creadoPor:     userProfile?.uid || '',
        });
      }
      setShowPresModal(false);
      setEditPresId(null);
      setPresForm({ nombre: '', categoria: '', montoAsignado: '', periodo: format(new Date(), 'yyyy-MM') });
      fetchAll();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  // ── Eliminar ──
  const handleDelete = async (col: string, id: string) => {
    if (!confirm('¿Eliminar este registro?')) return;
    try {
      await deleteDoc(doc(db, col, id));
      fetchAll();
    } catch (e) { console.error(e); }
  };

  // ── Cambiar estado factura ──
  const handleEstadoFac = async (id: string, estado: Factura['estado']) => {
    try {
      await updateDoc(doc(db, 'contabilidad_facturas', id), { estado });
      fetchAll();
    } catch (e) { console.error(e); }
  };

  // ── Auto-generar N° de factura ──
  const generarNumeroFactura = useCallback(() => {
    const total = facturas.length + 1;
    const serie = 'F001';
    const correlativo = String(total).padStart(5, '0');
    return `${serie}-${correlativo}`;
  }, [facturas.length]);

  // ── Guardar configuración empresa ──
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await setDoc(doc(db, 'contabilidad_config', 'empresa'), configForm);
      setCompanyConfig(configForm);
      setShowConfigModal(false);
    } catch (e) { console.error(e); } finally { setSavingConfig(false); }
  };

  const handleSaveMoneda = async () => {
    setSavingMoneda(true);
    try {
      await setDoc(doc(db, 'contabilidad_config', 'moneda'), monedaForm);
      setMonedaConfig(monedaForm);
      setShowMonedaModal(false);
    } catch (e) { console.error(e); } finally { setSavingMoneda(false); }
  };

  // ── Generar PDF de factura A4 ──
 const handleDownloadPDF = async (factura: Factura) => {
  setGeneratingPdf(factura.id);
  try {
    const jsPDF = (await import('jspdf')).default;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const W = 210;
    const M = 20;

    // ── Colores ──
    const DARK    = [15, 15, 17]    as [number,number,number];
    const ACCENT  = [52, 211, 153]  as [number,number,number];
    const WHITE   = [255, 255, 255] as [number,number,number];
    const GRAY    = [120, 120, 130] as [number,number,number];
    const LGRAY   = [180, 180, 190] as [number,number,number];
    const ROWALT  = [245, 245, 248] as [number,number,number];
    const BORDER  = [220, 220, 225] as [number,number,number];

    // ══ HEADER verde oscuro ══
    pdf.setFillColor(...DARK);
    pdf.rect(0, 0, W, 58, 'F');

    // Franja de acento izquierda
    pdf.setFillColor(...ACCENT);
    pdf.rect(0, 0, 5, 58, 'F');

    // Logo
    let logoLoaded = false;
    if (companyConfig.logoUrl) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej();
          img.src = companyConfig.logoUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        const ratio = img.width / img.height;
        const h = 26, w = Math.min(h * ratio, 55);
        pdf.addImage(dataUrl, 'PNG', M, 16, w, h);
        logoLoaded = true;
      } catch (_) {}
    }

    // Nombre empresa
    const nameX = logoLoaded ? M + 62 : M;
    pdf.setTextColor(...WHITE);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text(companyConfig.empresaNombre || 'Mi Empresa', nameX, 22);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...LGRAY);
    let infoY = 30;
    if (companyConfig.ruc)      { pdf.text(`RUC: ${companyConfig.ruc}`, nameX, infoY); infoY += 6; }
    if (companyConfig.direccion){ pdf.text(companyConfig.direccion,      nameX, infoY); infoY += 6; }
    if (companyConfig.telefono) { pdf.text(`Tel: ${companyConfig.telefono}`, nameX, infoY); infoY += 6; }
    if (companyConfig.email)    { pdf.text(companyConfig.email,           nameX, infoY); }

    // FACTURA label derecha
    pdf.setTextColor(...ACCENT);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(26);
    pdf.text('FACTURA', W - M, 24, { align: 'right' });
    pdf.setFontSize(10);
    pdf.setTextColor(...WHITE);
    pdf.text(`N° ${factura.numero}`, W - M, 34, { align: 'right' });
    pdf.setFontSize(8);
    pdf.setTextColor(...LGRAY);
    pdf.text(`Fecha: ${format(toDate(factura.fecha), 'dd/MM/yyyy', { locale: es })}`, W - M, 42, { align: 'right' });
    const estadoCfg = ESTADO_FACTURA_CONFIG[factura.estado];
    pdf.text(`Estado: ${estadoCfg.label.toUpperCase()}`, W - M, 49, { align: 'right' });

    let y = 68;

    // ══ BLOQUE PROVEEDOR/CLIENTE ══
    pdf.setFillColor(...ROWALT);
    pdf.roundedRect(M, y, W - M * 2, 32, 3, 3, 'F');
    pdf.setDrawColor(...BORDER);
    pdf.roundedRect(M, y, W - M * 2, 32, 3, 3, 'S');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...GRAY);
    pdf.text(factura.tipoEntidad.toUpperCase(), M + 6, y + 9);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(30, 30, 35);
    pdf.text(factura.entidad, M + 6, y + 20);

    // Descripción con text wrapping
    if (factura.descripcion) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...GRAY);
      const descLines = pdf.splitTextToSize(factura.descripcion, W - M * 2 - 12);
      pdf.text(descLines[0], M + 6, y + 28); // máx 1 línea en el bloque
    }

    y += 44;

    // ══ TABLA HEADER ══
    pdf.setFillColor(30, 30, 35);
    pdf.rect(M, y, W - M * 2, 10, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...ACCENT);
    pdf.text('DESCRIPCIÓN DEL SERVICIO / PRODUCTO', M + 4, y + 7);
    pdf.text('CANT.', W - M - 58, y + 7, { align: 'right' });
    pdf.text('P. UNIT.', W - M - 30, y + 7, { align: 'right' });
    pdf.text('IMPORTE', W - M - 2, y + 7, { align: 'right' });
    y += 10;

    // ══ FILA DE PRODUCTO — con descripción completa y wrapping ══
    const fullDesc = factura.descripcion || 'Servicio / Producto';
    const descWrapped = pdf.splitTextToSize(fullDesc, W - M * 2 - 80); // deja espacio para cant/precio
    const rowHeight = Math.max(12, descWrapped.length * 5 + 6);

    pdf.setFillColor(252, 252, 254);
    pdf.rect(M, y, W - M * 2, rowHeight, 'F');
    pdf.setDrawColor(...BORDER);
    pdf.line(M, y + rowHeight, W - M, y + rowHeight);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(30, 30, 35);
    pdf.text(descWrapped, M + 4, y + 7);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(30, 30, 35);
    const midRow = y + rowHeight / 2 + 2;
    pdf.text('1',                         W - M - 58, midRow, { align: 'right' });
    pdf.text(formatMoney(factura.monto),  W - M - 30, midRow, { align: 'right' });
    pdf.text(formatMoney(factura.monto),  W - M - 2,  midRow, { align: 'right' });

    y += rowHeight + 12;

    // ══ TOTALES ══
    const colLabel = W - M - 68;
    const colVal   = W - M - 2;
    const subTotal = factura.monto / 1.18;
    const igv      = factura.monto - subTotal;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...GRAY);

    pdf.text('Subtotal (sin IGV):', colLabel, y);
    pdf.text(formatMoney(subTotal), colVal, y, { align: 'right' });
    y += 7;

    pdf.text('IGV (18%):', colLabel, y);
    pdf.text(formatMoney(igv), colVal, y, { align: 'right' });
    y += 4;

    pdf.setDrawColor(...BORDER);
    pdf.line(colLabel, y, W - M, y);
    y += 6;

    // Total box
    pdf.setFillColor(...DARK);
    pdf.roundedRect(colLabel - 4, y - 3, W - M - colLabel + 8, 14, 2, 2, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...ACCENT);
    pdf.text('TOTAL A PAGAR:', colLabel, y + 7);
    pdf.text(formatMoney(factura.monto), colVal, y + 7, { align: 'right' });

    y += 24;

    // ══ NOTA / OBSERVACIONES (si hubiera descripción larga) ══
    if (factura.observaciones && factura.observaciones.length > 0) {
  pdf.setFillColor(248, 248, 252);
  pdf.setDrawColor(...BORDER);
  const noteLines = pdf.splitTextToSize(factura.observaciones, W - M * 2 - 12);
      const noteHeight = noteLines.length * 5 + 10;
      pdf.roundedRect(M, y, W - M * 2, noteHeight, 2, 2, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...GRAY);
      pdf.text('OBSERVACIONES', M + 6, y + 7);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(60, 60, 70);
      pdf.text(noteLines, M + 6, y + 13);
      y += noteHeight + 8;
    }

    // ══ FOOTER ══
    pdf.setFillColor(...DARK);
    pdf.rect(0, 282, W, 15, 'F');
    pdf.setFillColor(...ACCENT);
    pdf.rect(0, 282, 5, 15, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(...LGRAY);
    pdf.text(
      `Documento generado automáticamente · ${companyConfig.empresaNombre || ''}`,
      W / 2, 291, { align: 'center' }
    );
    pdf.text(
      format(new Date(), "dd/MM/yyyy HH:mm", { locale: es }),
      W - M, 291, { align: 'right' }
    );

    pdf.save(`Factura_${factura.numero.replace('-', '_')}.pdf`);
  } catch (e) {
    console.error('Error generando PDF:', e);
    alert('Error al generar PDF. Verifica que jspdf esté instalado: npm install jspdf');
  } finally {
    setGeneratingPdf(null);
  }
};

  // ── Guardar Sueldo ──
  const handleSaveSueldo = async () => {
    if (!selectedEmp || !sueldoForm.montoBase) return;
    setSaving(true);
    try {
      const neto = parseFloat(sueldoForm.montoBase)
                 + parseFloat(sueldoForm.bonificaciones || '0')
                 - parseFloat(sueldoForm.descuentos || '0');
      const payload = {
        empleadoUid:    selectedEmp.uid,
        empleadoNombre: selectedEmp.displayName,
        empleadoRol:    selectedEmp.role,
        montoBase:      parseFloat(sueldoForm.montoBase),
        bonificaciones: parseFloat(sueldoForm.bonificaciones || '0'),
        descuentos:     parseFloat(sueldoForm.descuentos || '0'),
        netoAPagar:     neto,
        periodo:        sueldoForm.periodo,
        estado:         sueldoForm.estado,
        observaciones:  sueldoForm.observaciones,
        creadoPor:      userProfile?.uid || '',
        creadoEn:       Timestamp.now(),
      };
      if (editSueldoId) {
        await updateDoc(doc(db, 'contabilidad_sueldos', editSueldoId), payload);
      } else {
        await addDoc(collection(db, 'contabilidad_sueldos'), payload);
      }
      setShowSueldoModal(false);
      setEditSueldoId(null);
      setSueldoForm({ montoBase: '', bonificaciones: '0', descuentos: '0', periodo: format(new Date(), 'yyyy-MM'), estado: 'pendiente', observaciones: '' });
      fetchAll();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  // ── Cambiar estado sueldo ──
  const handleEstadoSueldo = async (id: string, estado: Sueldo['estado']) => {
    try {
      await updateDoc(doc(db, 'contabilidad_sueldos', id), { estado });
      fetchAll();
    } catch (e) { console.error(e); }
  };

  // ── Libro Bancos: guardar entrada ────────────────────────────────────────────
  const handleSaveLibroEntry = async () => {
    if (!libroForm.bankId || !libroForm.description.trim()) return;
    const amount = parseFloat(libroForm.amount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;
    const banco = getBancoById(libroForm.bankId);
    setSaving(true);
    try {
      await addDoc(collection(db, 'libro_diario'), {
        date:        Timestamp.fromDate(new Date(libroForm.date + 'T12:00:00')),
        tipo:        libroForm.tipo,
        bankId:      libroForm.bankId,
        bankName:    banco?.name ?? libroForm.bankId,
        description: libroForm.description.trim(),
        reference:   libroForm.reference.trim() || null,
        amount,
        currency:    libroForm.currency,
        category:    libroForm.category,
        notes:       libroForm.notes.trim() || null,
        createdBy:   userProfile?.uid || '',
        creatorName: userProfile?.displayName || '',
        createdAt:   Timestamp.now(),
      });
      setShowLibroModal(false);
      setLibroForm({ date: format(new Date(), 'yyyy-MM-dd'), tipo: 'ingreso', bankId: '', description: '', reference: '', amount: '', currency: 'PEN', category: 'Ventas', notes: '' });
      fetchAll();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleDeleteLibroEntry = async (id: string, desc: string) => {
    if (!confirm(`¿Eliminar "${desc}"?`)) return;
    setLibroDeletingId(id);
    try {
      await deleteDoc(doc(db, 'libro_diario', id));
      fetchAll();
    } catch (e) { console.error(e); } finally { setLibroDeletingId(null); }
  };

  // ── Filtros ──
  const txFiltradas = transacciones.filter(t => {
    const matchTipo = txFiltro === 'todos' || t.tipo === txFiltro;
    const matchCat  = txCatFiltro === 'todas' || t.categoria === txCatFiltro;
    const matchSearch = t.descripcion?.toLowerCase().includes(txSearch.toLowerCase()) ||
                        t.categoria?.toLowerCase().includes(txSearch.toLowerCase());
    return matchTipo && matchCat && matchSearch;
  });

  const asientosFiltrados = asientos.filter(a => {
    const matchSearch = a.glosa?.toLowerCase().includes(asientoSearch.toLowerCase()) ||
      a.lineas?.some(l =>
        l.cuentaCodigo?.includes(asientoSearch) ||
        l.cuentaNombre?.toLowerCase().includes(asientoSearch.toLowerCase())
      );
    const mes = format(toDate(a.fecha), 'yyyy-MM');
    const matchMes = asientoFiltroMes === 'todos' || mes === asientoFiltroMes;
    return matchSearch && matchMes;
  });

  const totalDebeLibro  = asientosFiltrados.reduce((a, x) => a + x.totalDebe, 0);
  const totalHaberLibro = asientosFiltrados.reduce((a, x) => a + x.totalHaber, 0);

  const facFiltradas = facturas.filter(f => {
    const matchEstado  = facEstado === 'todos' || f.estado === facEstado;
    const matchSearch  = f.entidad?.toLowerCase().includes(facSearch.toLowerCase()) ||
                         f.numero?.toLowerCase().includes(facSearch.toLowerCase());
    return matchEstado && matchSearch;
  });

  const empFiltrados = empleados.filter(e =>
    e.displayName?.toLowerCase().includes(empSearch.toLowerCase()) ||
    e.email?.toLowerCase().includes(empSearch.toLowerCase()) ||
    e.role?.toLowerCase().includes(empSearch.toLowerCase())
  );

  const sueldosDelEmp = selectedEmp
    ? sueldos.filter(s => s.empleadoUid === selectedEmp.uid)
    : [];

  // ── Libro Bancos: filtros y totales ──
  const libroFiltered = libroEntries.filter(e => {
    const matchTipo  = libroFilterTipo === 'todos' || e.tipo === libroFilterTipo;
    const matchBanco = libroFilterBanco === 'all' || e.bankId === libroFilterBanco;
    const matchSearch = !libroSearch ||
      e.description.toLowerCase().includes(libroSearch.toLowerCase()) ||
      e.bankName?.toLowerCase().includes(libroSearch.toLowerCase()) ||
      e.category?.toLowerCase().includes(libroSearch.toLowerCase()) ||
      e.reference?.toLowerCase().includes(libroSearch.toLowerCase());
    const entryDate = e.date instanceof Date ? e.date : new Date(e.date);
    const matchFrom = !libroDateFrom || entryDate >= new Date(libroDateFrom + 'T00:00:00');
    const matchTo   = !libroDateTo   || entryDate <= new Date(libroDateTo   + 'T23:59:59');
    return matchTipo && matchBanco && matchSearch && matchFrom && matchTo;
  });
  const libroIngresos  = libroFiltered.filter(e => e.tipo === 'ingreso').reduce((s, e) => s + e.amount, 0);
  const libroEgresos   = libroFiltered.filter(e => e.tipo === 'egreso' ).reduce((s, e) => s + e.amount, 0);
  const libroBalance   = libroIngresos - libroEgresos;
  const libroBancosUsados = [...new Set(libroEntries.map(e => e.bankId))];
  const libroBancoSummary = libroBancosUsados.map(bankId => {
    const ents = libroFiltered.filter(e => e.bankId === bankId);
    const ing  = ents.filter(e => e.tipo === 'ingreso').reduce((s, e) => s + e.amount, 0);
    const egr  = ents.filter(e => e.tipo === 'egreso' ).reduce((s, e) => s + e.amount, 0);
    const b    = getBancoById(bankId);
    return { bankId, bankName: b?.name ?? bankId, country: b?.country ?? 'custom', ing, egr, balance: ing - egr };
  }).filter(b => b.ing > 0 || b.egr > 0);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="w-8 h-8 animate-spin text-zinc-500" />
    </div>
  );

  return (
    <div className="space-y-6">
     {/* DESPUÉS — todo en un solo header */}
<div className="flex items-center justify-between">
  <h2 className="text-2xl font-extralight text-white flex items-center gap-3">
    <DollarSign className="w-6 h-6 text-emerald-400" strokeWidth={1.5} />
    Contabilidad
  </h2>
  <div className="flex items-center gap-2">
    {canWrite && (
      <Button
        variant="outline" size="sm"
        onClick={() => { setMonedaForm(monedaConfig); setShowMonedaModal(true); }}
        className="border-zinc-800 text-white hover:bg-zinc-900 gap-2 font-extralight"
      >
        <span>{MONEDAS_CONFIG[monedaConfig.monedaActiva].flag}</span>
        <span className="text-zinc-300 text-xs">{MONEDAS_CONFIG[monedaConfig.monedaActiva].simbolo}</span>
        <span className="text-zinc-500 text-xs">{monedaConfig.monedaActiva}</span>
      </Button>
    )}
    <Button variant="outline" size="sm" disabled={refreshing} onClick={handleRefresh}
      className="border-zinc-800 text-white hover:bg-zinc-900">
      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
    </Button>
  </div>
</div>

      <Tabs defaultValue="resumen">
        <TabsList className="bg-zinc-950 border border-zinc-800 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="resumen"       className="data-[state=active]:bg-zinc-900 text-zinc-400 data-[state=active]:text-white font-extralight">
            <BarChart2 className="w-4 h-4 mr-2" /> Resumen
          </TabsTrigger>
          <TabsTrigger value="empleados"     className="data-[state=active]:bg-zinc-900 text-zinc-400 data-[state=active]:text-white font-extralight">
            <Users className="w-4 h-4 mr-2" /> Empleados
            {sueldosPendientes > 0 && (
              <Badge className="ml-2 bg-yellow-950 text-yellow-400 border-yellow-800 text-xs px-1.5 py-0">
                {sueldosPendientes}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="transacciones" className="data-[state=active]:bg-zinc-900 text-zinc-400 data-[state=active]:text-white font-extralight">
            <Wallet className="w-4 h-4 mr-2" /> Transacciones
          </TabsTrigger>
          <TabsTrigger value="facturas"      className="data-[state=active]:bg-zinc-900 text-zinc-400 data-[state=active]:text-white font-extralight">
            <FileText className="w-4 h-4 mr-2" /> Facturas
            {(facturasPendientes + facturasVencidas) > 0 && (
              <Badge className="ml-2 bg-yellow-950 text-yellow-400 border-yellow-800 text-xs px-1.5 py-0">
                {facturasPendientes + facturasVencidas}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="presupuestos"  className="data-[state=active]:bg-zinc-900 text-zinc-400 data-[state=active]:text-white font-extralight">
            <Target className="w-4 h-4 mr-2" /> Presupuestos
          </TabsTrigger>
          <TabsTrigger value="librodiario" className="data-[state=active]:bg-zinc-900 text-zinc-400 data-[state=active]:text-white font-extralight">
            <BookOpen className="w-4 h-4 mr-2" /> Libro Diario
          </TabsTrigger>
          <TabsTrigger value="librobancos" className="data-[state=active]:bg-zinc-900 text-zinc-400 data-[state=active]:text-white font-extralight">
            <Wallet className="w-4 h-4 mr-2" /> Libro Bancos
          </TabsTrigger>
        </TabsList>

        {/* ══ RESUMEN ══════════════════════════════════════════════════════════ */}
        <TabsContent value="resumen" className="mt-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Ingresos', value: formatMoney(totalIngresos),
                icon: ArrowUpCircle,   color: 'text-emerald-400', border: 'border-emerald-900/40' },
              { label: 'Total Egresos',  value: formatMoney(totalEgresos),
                icon: ArrowDownCircle, color: 'text-red-400',     border: 'border-red-900/40'     },
              { label: 'Balance Neto',   value: formatMoney(balance),
                icon: DollarSign,      color: balance >= 0 ? 'text-emerald-400' : 'text-red-400',
                border: balance >= 0 ? 'border-emerald-900/40' : 'border-red-900/40' },
              { label: 'Facturas Pendientes', value: facturasPendientes,
                icon: FileText,        color: 'text-yellow-400', border: 'border-yellow-900/40' },
            ].map(kpi => (
              <Card key={kpi.label} className={`bg-zinc-950 border-zinc-800 ${kpi.border}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">{kpi.label}</p>
                    <kpi.icon className={`w-4 h-4 ${kpi.color}`} strokeWidth={1.5} />
                  </div>
                  <p className={`text-xl font-extralight ${kpi.color}`}>{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-zinc-400 font-extralight text-sm uppercase tracking-wider">
                Ingresos vs Egresos por mes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="mes" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `S/ ${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: '#09090b', border: '1px solid #27272a', borderRadius: 8 }}
                    labelStyle={{ color: '#a1a1aa', fontSize: 12 }}
                    formatter={(val: number) => [formatMoney(val)]}
                  />
                  <Legend formatter={v => <span style={{ color: '#71717a', fontSize: 11 }}>{v}</span>} />
                  <Bar dataKey="ingresos" name="Ingresos" fill="#34d399" radius={[4,4,0,0]} />
                  <Bar dataKey="egresos"  name="Egresos"  fill="#f87171" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-zinc-400 font-extralight text-sm uppercase tracking-wider">
                  Evolución del balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="mes" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false}
                      tickFormatter={v => `S/ ${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: '#09090b', border: '1px solid #27272a', borderRadius: 8 }}
                      formatter={(val: number) => [formatMoney(val), 'Balance']}
                    />
                    <Line type="monotone" dataKey="balance" stroke="#a78bfa"
                      strokeWidth={2} dot={{ fill: '#a78bfa', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-zinc-400 font-extralight text-sm uppercase tracking-wider">
                  Egresos por categoría
                </CardTitle>
              </CardHeader>
              <CardContent>
                {catData.length === 0 ? (
                  <p className="text-zinc-600 text-sm font-extralight text-center py-8">Sin egresos registrados</p>
                ) : (
                  <div className="space-y-3">
                    {catData.sort((a,b) => b.monto - a.monto).slice(0,6).map(c => {
                      const max = Math.max(...catData.map(x => x.monto));
                      const pct = max > 0 ? (c.monto / max) * 100 : 0;
                      return (
                        <div key={c.cat}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-zinc-400 text-xs font-extralight">{c.cat}</span>
                            <span className="text-zinc-300 text-xs font-extralight">{formatMoney(c.monto)}</span>
                          </div>
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500/70 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ══ EMPLEADOS ════════════════════════════════════════════════════════ */}
        <TabsContent value="empleados" className="mt-6 space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-zinc-950 border-zinc-800 border-blue-900/30">
              <CardContent className="p-4">
                <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">Total empleados</p>
                <p className="text-2xl font-extralight text-white mt-1">{empleados.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-950 border-zinc-800 border-yellow-900/30">
              <CardContent className="p-4">
                <p className="text-yellow-400 text-xs font-extralight uppercase tracking-wider">Sueldos pendientes</p>
                <p className="text-2xl font-extralight text-white mt-1">{sueldosPendientes}</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-950 border-zinc-800 border-emerald-900/30">
              <CardContent className="p-4">
                <p className="text-emerald-400 text-xs font-extralight uppercase tracking-wider">Planilla este mes</p>
                <p className="text-xl font-extralight text-emerald-400 mt-1">{formatMoney(totalPlanillaMes)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input value={empSearch} onChange={e => setEmpSearch(e.target.value)}
              placeholder="Buscar empleado..." className="pl-9 bg-zinc-900 border-zinc-800 text-white font-extralight" />
          </div>

          <Card className="bg-zinc-950 border-zinc-800">
            <CardContent className="p-0">
              {empFiltrados.length === 0 ? (
                <div className="py-12 text-center">
                  <Users className="w-8 h-8 text-zinc-700 mx-auto mb-2" strokeWidth={1} />
                  <p className="text-zinc-500 font-extralight text-sm">Sin empleados</p>
                </div>
              ) : empFiltrados.map(emp => {
                const sueldosEmp    = sueldos.filter(s => s.empleadoUid === emp.uid);
                const ultimoSueldo  = sueldosEmp[0];
                const pendientesEmp = sueldosEmp.filter(s => s.estado === 'pendiente').length;
                return (
                  <div key={emp.uid}
                    className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 last:border-0 hover:bg-zinc-900/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center flex-shrink-0">
                        {emp.avatar
                          ? <img src={emp.avatar} alt={emp.displayName} className="w-full h-full object-cover"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          : <span className="text-white font-extralight text-sm">{emp.displayName?.[0]?.toUpperCase()}</span>
                        }
                      </div>
                      <div>
                        <p className="text-white font-extralight text-sm">{emp.displayName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-zinc-500 text-xs font-extralight">{emp.role}</span>
                          {ultimoSueldo && (
                            <>
                              <span className="text-zinc-700 text-xs">·</span>
                              <span className="text-zinc-500 text-xs font-extralight">
                                Último: {formatMoney(ultimoSueldo.netoAPagar || ultimoSueldo.montoBase)}
                              </span>
                            </>
                          )}
                          {pendientesEmp > 0 && (
                            <Badge className="bg-yellow-950/60 text-yellow-400 border border-yellow-800/60 font-extralight text-[10px] px-1.5 py-0">
                              {pendientesEmp} pendiente{pendientesEmp > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm"
                        onClick={() => { setContractEmp(emp); setShowContractModal(true); }}
                        className="text-zinc-500 hover:text-white hover:bg-zinc-800 text-xs font-extralight gap-1.5"
                        title="Ver contratos">
                        <FileText className="w-3.5 h-3.5" /> Contrato
                      </Button>

                      <Button variant="ghost" size="sm"
                        onClick={() => { setSelectedEmp(emp); setShowEmpDetail(true); }}
                        className="text-zinc-500 hover:text-white hover:bg-zinc-800 text-xs font-extralight gap-1.5">
                        <CreditCard className="w-3.5 h-3.5" /> Sueldos
                      </Button>

                      <ChevronRight className="w-4 h-4 text-zinc-700" />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ TRANSACCIONES ════════════════════════════════════════════════════ */}
        <TabsContent value="transacciones" className="mt-6 space-y-5">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input value={txSearch} onChange={e => setTxSearch(e.target.value)}
                  placeholder="Buscar..." className="pl-9 bg-zinc-900 border-zinc-800 text-white font-extralight w-48" />
              </div>
              <Select value={txFiltro} onValueChange={(v: any) => setTxFiltro(v)}>
                <SelectTrigger className="w-36 bg-zinc-900 border-zinc-800 text-white font-extralight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="todos" className="font-extralight">Todos</SelectItem>
                  <SelectItem value="ingreso" className="font-extralight">Ingresos</SelectItem>
                  <SelectItem value="egreso"  className="font-extralight">Egresos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={txCatFiltro} onValueChange={setTxCatFiltro}>
                <SelectTrigger className="w-40 bg-zinc-900 border-zinc-800 text-white font-extralight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="todas" className="font-extralight">Todas las categorías</SelectItem>
                  {[...CATEGORIAS_INGRESO, ...CATEGORIAS_EGRESO].map(c => (
                    <SelectItem key={c} value={c} className="font-extralight">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canWrite && (
              <Button onClick={() => setShowTxModal(true)}
                className="bg-white text-black hover:bg-zinc-200 font-extralight gap-2">
                <Plus className="w-4 h-4" /> Nueva Transacción
              </Button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Mostradas', value: txFiltradas.length, color: 'text-white' },
              { label: 'Ingresos filtrados', value: formatMoney(txFiltradas.filter(t=>t.tipo==='ingreso').reduce((a,t)=>a+t.monto,0)), color: 'text-emerald-400' },
              { label: 'Egresos filtrados',  value: formatMoney(txFiltradas.filter(t=>t.tipo==='egreso').reduce((a,t)=>a+t.monto,0)),  color: 'text-red-400'     },
            ].map(s => (
              <Card key={s.label} className="bg-zinc-950 border-zinc-800">
                <CardContent className="p-3">
                  <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">{s.label}</p>
                  <p className={`text-lg font-extralight mt-0.5 ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-zinc-950 border-zinc-800">
            <CardContent className="p-0">
              {txFiltradas.length === 0 ? (
                <div className="py-12 text-center">
                  <Wallet className="w-8 h-8 text-zinc-700 mx-auto mb-2" strokeWidth={1} />
                  <p className="text-zinc-500 font-extralight text-sm">Sin transacciones</p>
                </div>
              ) : txFiltradas.map(t => (
                <div key={t.id}
                  className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 last:border-0 hover:bg-zinc-900/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      t.tipo === 'ingreso' ? 'bg-emerald-950/60 border border-emerald-800/60' : 'bg-red-950/60 border border-red-800/60'
                    }`}>
                      {t.tipo === 'ingreso'
                        ? <TrendingUp className="w-4 h-4 text-emerald-400"  strokeWidth={1.5} />
                        : <TrendingDown className="w-4 h-4 text-red-400"     strokeWidth={1.5} />
                      }
                    </div>
                    <div>
                      <p className="text-white font-extralight text-sm">{t.descripcion}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-zinc-500 text-xs font-extralight">{t.categoria}</span>
                        <span className="text-zinc-700 text-xs">·</span>
                        <span className="text-zinc-600 text-xs font-extralight">
                          {format(toDate(t.fecha), 'dd MMM yyyy', { locale: es })}
                        </span>
                        <span className="text-zinc-700 text-xs">·</span>
                        <span className="text-zinc-600 text-xs font-extralight">{t.creadoPorNombre}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-extralight text-sm ${t.tipo === 'ingreso' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.tipo === 'ingreso' ? '+' : '-'}{formatMoney(t.monto)}
                    </span>
                    {canWrite && (
                      <Button variant="ghost" size="sm"
                        onClick={() => handleDelete('contabilidad_transacciones', t.id)}
                        className="text-zinc-600 hover:text-red-400 hover:bg-red-950/30">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ FACTURAS ═════════════════════════════════════════════════════════ */}
        <TabsContent value="facturas" className="mt-6 space-y-5">
          {companyConfig.empresaNombre ? (
            <div className="flex items-center justify-between p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg">
              <div className="flex items-center gap-3">
                {companyConfig.logoUrl && (
                  <img src={companyConfig.logoUrl} alt="logo" className="h-8 w-auto object-contain rounded" />
                )}
                <div>
                  <p className="text-white font-extralight text-sm">{companyConfig.empresaNombre}</p>
                  <p className="text-zinc-500 text-xs font-extralight">
                    {companyConfig.ruc && `RUC ${companyConfig.ruc}`}
                    {companyConfig.ruc && companyConfig.direccion && ' · '}
                    {companyConfig.direccion}
                  </p>
                </div>
              </div>
              {canWrite && (
                <Button variant="ghost" size="sm"
                  onClick={() => { setConfigForm(companyConfig); setShowConfigModal(true); }}
                  className="text-zinc-500 hover:text-white hover:bg-zinc-800 gap-1.5 font-extralight text-xs">
                  <Settings className="w-3.5 h-3.5" /> Editar
                </Button>
              )}
            </div>
          ) : canWrite && (
            <button onClick={() => setShowConfigModal(true)}
              className="w-full flex items-center gap-3 p-3 border border-dashed border-zinc-700 rounded-lg text-zinc-500 hover:text-white hover:border-zinc-500 transition-colors">
              <Building2 className="w-4 h-4" />
              <span className="text-sm font-extralight">Configurar datos de empresa para los PDFs</span>
            </button>
          )}

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input value={facSearch} onChange={e => setFacSearch(e.target.value)}
                  placeholder="Buscar..." className="pl-9 bg-zinc-900 border-zinc-800 text-white font-extralight w-48" />
              </div>
              <Select value={facEstado} onValueChange={(v: any) => setFacEstado(v)}>
                <SelectTrigger className="w-40 bg-zinc-900 border-zinc-800 text-white font-extralight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="todos"    className="font-extralight">Todos los estados</SelectItem>
                  <SelectItem value="pendiente" className="font-extralight">Pendiente</SelectItem>
                  <SelectItem value="pagada"    className="font-extralight">Pagada</SelectItem>
                  <SelectItem value="vencida"   className="font-extralight">Vencida</SelectItem>
                  <SelectItem value="anulada"   className="font-extralight">Anulada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canWrite && (
              <Button onClick={() => setShowFacModal(true)}
                className="bg-white text-black hover:bg-zinc-200 font-extralight gap-2">
                <Plus className="w-4 h-4" /> Nueva Factura
              </Button>
            )}
          </div>

          {facturasVencidas > 0 && (
            <div className="flex items-center gap-3 p-3 bg-red-950/30 border border-red-900/50 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm font-extralight">
                {facturasVencidas} factura{facturasVencidas > 1 ? 's' : ''} vencida{facturasVencidas > 1 ? 's' : ''}
              </p>
            </div>
          )}

          <Card className="bg-zinc-950 border-zinc-800">
            <CardContent className="p-0">
              {facFiltradas.length === 0 ? (
                <div className="py-12 text-center">
                  <FileText className="w-8 h-8 text-zinc-700 mx-auto mb-2" strokeWidth={1} />
                  <p className="text-zinc-500 font-extralight text-sm">Sin facturas</p>
                </div>
              ) : facFiltradas.map(f => {
                const cfg = ESTADO_FACTURA_CONFIG[f.estado];
                return (
                  <div key={f.id}
                    className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 last:border-0 hover:bg-zinc-900/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-zinc-500" strokeWidth={1.5} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-white font-extralight text-sm">{f.entidad}</p>
                          <span className="text-zinc-600 text-xs font-extralight">#{f.numero}</span>
                          <Badge className="text-[10px] px-1.5 py-0 font-extralight" variant="outline">
                            {f.tipoEntidad}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-zinc-500 text-xs font-extralight">{f.descripcion}</span>
                          <span className="text-zinc-700 text-xs">·</span>
                          <span className="text-zinc-600 text-xs font-extralight">
                            {format(toDate(f.fecha), 'dd MMM yyyy', { locale: es })}
                          </span>
                        </div>
                        
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-white font-extralight text-sm">{formatMoney(f.monto)}</span>

                      <Button variant="ghost" size="sm"
                        onClick={() => handleDownloadPDF(f)}
                        disabled={generatingPdf === f.id}
                        title="Descargar PDF"
                        className="text-zinc-500 hover:text-emerald-400 hover:bg-emerald-950/30">
                        {generatingPdf === f.id
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          : <Download className="w-3.5 h-3.5" />
                        }
                      </Button>

                      {canWrite ? (
                        <Select value={f.estado} onValueChange={(v: any) => handleEstadoFac(f.id, v)}>
                          <SelectTrigger className={`w-28 h-7 text-xs font-extralight border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800">
                            <SelectItem value="pendiente" className="font-extralight text-yellow-400">Pendiente</SelectItem>
                            <SelectItem value="pagada"    className="font-extralight text-green-400">Pagada</SelectItem>
                            <SelectItem value="vencida"   className="font-extralight text-red-400">Vencida</SelectItem>
                            <SelectItem value="anulada"   className="font-extralight text-zinc-400">Anulada</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={`${cfg.bg} ${cfg.color} ${cfg.border} border font-extralight`}>
                          {cfg.label}
                        </Badge>
                      )}

                      {canWrite && (
                        <Button variant="ghost" size="sm"
                          onClick={() => handleDelete('contabilidad_facturas', f.id)}
                          className="text-zinc-600 hover:text-red-400 hover:bg-red-950/30">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ PRESUPUESTOS ═════════════════════════════════════════════════════ */}
        <TabsContent value="presupuestos" className="mt-6 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-zinc-500 font-extralight text-sm">
              {presupuestos.length} presupuesto{presupuestos.length !== 1 ? 's' : ''} activos
            </p>
            {canWrite && (
              <Button onClick={() => { setEditPresId(null); setShowPresModal(true); }}
                className="bg-white text-black hover:bg-zinc-200 font-extralight gap-2">
                <Plus className="w-4 h-4" /> Nuevo Presupuesto
              </Button>
            )}
          </div>

          {presupuestos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Target className="w-8 h-8 text-zinc-700 mb-2" strokeWidth={1} />
              <p className="text-zinc-500 font-extralight text-sm">Sin presupuestos creados</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {presupuestos.map(p => {
                const pct   = p.montoAsignado > 0 ? Math.min((p.montoUsado / p.montoAsignado) * 100, 100) : 0;
                const libre = Math.max(p.montoAsignado - p.montoUsado, 0);
                const over  = p.montoUsado > p.montoAsignado;
                return (
                  <Card key={p.id} className={`bg-zinc-950 border-zinc-800 ${over ? 'border-red-900/50' : ''}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-white font-extralight">{p.nombre}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-zinc-500 text-xs font-extralight">{p.categoria}</span>
                            <span className="text-zinc-700 text-xs">·</span>
                            <span className="text-zinc-600 text-xs font-extralight">{p.periodo}</span>
                          </div>
                        </div>
                        {canWrite && (
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm"
                              onClick={() => {
                                setEditPresId(p.id);
                                setPresForm({
                                  nombre:        p.nombre,
                                  categoria:     p.categoria,
                                  montoAsignado: String(p.montoAsignado),
                                  periodo:       p.periodo,
                                });
                                setShowPresModal(true);
                              }}
                              className="text-zinc-600 hover:text-white hover:bg-zinc-800 h-7 w-7 p-0">
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm"
                              onClick={() => handleDelete('contabilidad_presupuestos', p.id)}
                              className="text-zinc-600 hover:text-red-400 hover:bg-red-950/30 h-7 w-7 p-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-extralight">
                          <span className={over ? 'text-red-400' : 'text-zinc-400'}>
                            Usado: {formatMoney(p.montoUsado)}
                          </span>
                          <span className="text-zinc-500">
                            Asignado: {formatMoney(p.montoAsignado)}
                          </span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              over ? 'bg-red-500' : pct > 80 ? 'bg-yellow-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs font-extralight">
                          <span className={`${over ? 'text-red-400' : 'text-zinc-500'}`}>
                            {pct.toFixed(0)}% utilizado
                          </span>
                          <span className={over ? 'text-red-400' : 'text-emerald-400'}>
                            {over ? `Excedido en ${formatMoney(p.montoUsado - p.montoAsignado)}` : `Libre: ${formatMoney(libre)}`}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="librodiario" className="mt-6 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'N° Asientos',  value: asientos.length,            color: 'text-white'      },
              { label: 'Total Debe',   value: formatMoney(totalDebeLibro), color: 'text-blue-400'   },
              { label: 'Total Haber',  value: formatMoney(totalHaberLibro),color: 'text-purple-400' },
              {
                label: Math.abs(totalDebeLibro - totalHaberLibro) < 0.01 ? '✓ Libro cuadrado' : '⚠ Revisar',
                value: `${asientosFiltrados.length} mostrados`,
                color: Math.abs(totalDebeLibro - totalHaberLibro) < 0.01 ? 'text-emerald-400' : 'text-yellow-400',
              },
            ].map(kpi => (
              <Card key={kpi.label} className="bg-zinc-950 border-zinc-800">
                <CardContent className="p-4">
                  <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">{kpi.label}</p>
                  <p className={`text-lg font-extralight mt-1 ${kpi.color}`}>{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  value={asientoSearch}
                  onChange={e => setAsientoSearch(e.target.value)}
                  placeholder="Buscar cuenta, glosa..."
                  className="pl-9 bg-zinc-900 border-zinc-800 text-white font-extralight w-52"
                />
              </div>
              <Select value={asientoFiltroMes} onValueChange={setAsientoFiltroMes}>
                <SelectTrigger className="w-40 bg-zinc-900 border-zinc-800 text-white font-extralight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="todos" className="font-extralight">Todos los meses</SelectItem>
                  {[new Date().getFullYear(), new Date().getFullYear() - 1].flatMap(anio =>
  Array.from({ length: 12 }, (_, i) => {
    const val = format(new Date(anio, i, 1), 'yyyy-MM');
    return (
      <SelectItem key={val} value={val} className="font-extralight">
        {MESES[i]} {anio}
      </SelectItem>
    );
  })
)}
                </SelectContent>
              </Select>
            </div>
            {canWrite && (
              <Button onClick={() => setShowAsientoModal(true)} className="bg-white text-black hover:bg-zinc-200 font-extralight gap-2">
                <Plus className="w-4 h-4" /> Nuevo Asiento
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-xs font-extralight">
            {(['activo','pasivo','patrimonio','ingreso','gasto'] as const).map(t => (
              <span key={t} className={`flex items-center gap-1.5 ${TIPO_COLOR[t]}`}>
                <span className="w-2 h-2 rounded-full bg-current" />
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </span>
            ))}
          </div>

          {asientosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <BookOpen className="w-8 h-8 text-zinc-700 mb-2" strokeWidth={1} />
              <p className="text-zinc-500 font-extralight text-sm">Sin asientos registrados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {asientosFiltrados.map(asiento => {
                const isExpanded = expandedAsiento === asiento.id;
                const cuadrado   = Math.abs(asiento.totalDebe - asiento.totalHaber) < 0.01;
                return (
                  <Card key={asiento.id} className={`bg-zinc-950 border-zinc-800 ${!cuadrado ? 'border-red-900/60' : ''}`}>
                    <CardContent className="p-0">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-900/40 transition-colors text-left"
                        onClick={() => setExpandedAsiento(isExpanded ? null : asiento.id)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-8 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                            <span className="text-zinc-300 font-extralight text-xs">#{asiento.numero}</span>
                          </div>
                          <div>
                            <p className="text-white font-extralight text-sm">{asiento.glosa}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-zinc-500 text-xs font-extralight">
                                {format(toDate(asiento.fecha), "dd 'de' MMMM yyyy", { locale: es })}
                              </span>
                              <span className="text-zinc-700 text-xs">·</span>
                              <span className="text-zinc-600 text-xs font-extralight">{asiento.lineas?.length || 0} líneas</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right hidden sm:block">
                            <p className="text-blue-400 font-extralight text-sm">{formatMoney(asiento.totalDebe)}</p>
                            <p className="text-zinc-600 text-xs font-extralight">Debe</p>
                          </div>
                          <div className="text-right hidden sm:block">
                            <p className="text-purple-400 font-extralight text-sm">{formatMoney(asiento.totalHaber)}</p>
                            <p className="text-zinc-600 text-xs font-extralight">Haber</p>
                          </div>
                          {cuadrado
                            ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" strokeWidth={1.5} />
                            : <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0"    strokeWidth={1.5} />
                          }
                          <ChevronRight className={`w-4 h-4 text-zinc-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          {canWrite && (
                            <Button variant="ghost" size="sm"
                              onClick={e => { e.stopPropagation(); handleDelete('contabilidad_asientos', asiento.id); }}
                              className="text-zinc-600 hover:text-red-400 hover:bg-red-950/30 h-7 w-7 p-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-zinc-800">
                          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-zinc-900/60 text-xs font-extralight uppercase tracking-wider text-zinc-500">
                            <div className="col-span-2">Cuenta</div>
                            <div className="col-span-5">Descripción</div>
                            <div className="col-span-2 text-right">Debe</div>
                            <div className="col-span-2 text-right">Haber</div>
                            <div className="col-span-1" />
                          </div>
                          {asiento.lineas?.map((linea, idx) => {
                            const tipo = PLAN_CONTABLE.find(p => p.codigo === linea.cuentaCodigo)?.tipo;
                            return (
                              <div key={idx} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-t border-zinc-900 hover:bg-zinc-900/20">
                                <div className="col-span-2 flex items-center">
                                  <span className={`font-mono text-xs ${tipo ? TIPO_COLOR[tipo] : 'text-zinc-400'}`}>
                                    {linea.cuentaCodigo}
                                  </span>
                                </div>
                                <div className="col-span-5">
  <p className="text-zinc-300 font-extralight text-xs">
    {linea.cuentaNombre || <span className="text-zinc-600 italic">Sin cuenta PCGE</span>}
  </p>
  {linea.glosa && linea.glosa !== asiento.glosa && (
    <p className="text-zinc-600 font-extralight text-[10px] mt-0.5">{linea.glosa}</p>
  )}
</div>
                                <div className="col-span-2 text-right">
                                  {linea.debe > 0
                                    ? <span className="text-blue-400 font-extralight text-sm">{formatMoney(linea.debe)}</span>
                                    : <span className="text-zinc-700 text-xs">—</span>}
                                </div>
                                <div className="col-span-2 text-right">
                                  {linea.haber > 0
                                    ? <span className="text-purple-400 font-extralight text-sm">{formatMoney(linea.haber)}</span>
                                    : <span className="text-zinc-700 text-xs">—</span>}
                                </div>
                                <div className="col-span-1" />
                              </div>
                            );
                          })}
                          <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-zinc-900/40 border-t border-zinc-700">
                            <div className="col-span-7 flex items-center">
                              <span className="text-zinc-500 font-extralight text-xs uppercase tracking-wider">Sumas iguales</span>
                            </div>
                            <div className="col-span-2 text-right">
                              <span className="text-blue-400 font-extralight text-sm">{formatMoney(asiento.totalDebe)}</span>
                            </div>
                            <div className="col-span-2 text-right">
                              <span className="text-purple-400 font-extralight text-sm">{formatMoney(asiento.totalHaber)}</span>
                            </div>
                            <div className="col-span-1 flex items-center justify-end">
                              {cuadrado
                                ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                : <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              <Card className="bg-zinc-900 border-zinc-700">
                <CardContent className="p-4">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-7 flex items-center">
                      <span className="text-zinc-400 font-extralight text-sm uppercase tracking-wider">Totales del período</span>
                    </div>
                    <div className="col-span-2 text-right">
                      <p className="text-blue-400 font-extralight text-sm">{formatMoney(totalDebeLibro)}</p>
                      <p className="text-zinc-600 text-xs font-extralight">Debe</p>
                    </div>
                    <div className="col-span-2 text-right">
                      <p className="text-purple-400 font-extralight text-sm">{formatMoney(totalHaberLibro)}</p>
                      <p className="text-zinc-600 text-xs font-extralight">Haber</p>
                    </div>
                    <div className="col-span-1 flex items-center justify-end">
                      {Math.abs(totalDebeLibro - totalHaberLibro) < 0.01
                        ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                        : <AlertCircle className="w-4 h-4 text-yellow-400" />}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ══ LIBRO BANCOS 🇵🇪🇪🇸 ═══════════════════════════════════════════════ */}
        <TabsContent value="librobancos" className="mt-6 space-y-5">

          {/* Totales */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-zinc-950 border-emerald-900/40">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-emerald-400" strokeWidth={1.5} />
                  <p className="text-emerald-400 text-xs font-extralight uppercase tracking-wider">Ingresos</p>
                </div>
                <p className="text-white text-lg font-extralight">{formatBancoCurrency(libroIngresos, 'PEN')}</p>
                <p className="text-zinc-600 text-xs font-extralight">{libroFiltered.filter(e => e.tipo === 'ingreso').length} movimientos</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-950 border-red-900/40">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="w-4 h-4 text-red-400" strokeWidth={1.5} />
                  <p className="text-red-400 text-xs font-extralight uppercase tracking-wider">Egresos</p>
                </div>
                <p className="text-white text-lg font-extralight">{formatBancoCurrency(libroEgresos, 'PEN')}</p>
                <p className="text-zinc-600 text-xs font-extralight">{libroFiltered.filter(e => e.tipo === 'egreso').length} movimientos</p>
              </CardContent>
            </Card>
            <Card className={`bg-zinc-950 ${libroBalance >= 0 ? 'border-blue-900/40' : 'border-red-900/40'}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4" style={{ color: libroBalance >= 0 ? '#60a5fa' : '#f87171' }} strokeWidth={1.5} />
                  <p className="text-xs font-extralight uppercase tracking-wider" style={{ color: libroBalance >= 0 ? '#60a5fa' : '#f87171' }}>Balance</p>
                </div>
                <p className="text-white text-lg font-extralight">{formatBancoCurrency(Math.abs(libroBalance), 'PEN')}</p>
                <p className="text-zinc-600 text-xs font-extralight">{libroBalance >= 0 ? 'Favorable' : 'Negativo'}</p>
              </CardContent>
            </Card>
          </div>

          {/* Resumen por banco */}
          {libroBancoSummary.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {libroBancoSummary.map(b => (
                <Card key={b.bankId} className="bg-zinc-950 border-zinc-800">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">{BANCO_FLAG[b.country]}</span>
                      <span className="text-white font-extralight text-xs truncate">{b.bankName}</span>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-emerald-400 font-extralight text-xs">+ {formatBancoCurrency(b.ing, 'PEN')}</p>
                      <p className="text-red-400 font-extralight text-xs">- {formatBancoCurrency(b.egr, 'PEN')}</p>
                      <div className="h-px bg-zinc-800 my-1" />
                      <p className={`font-extralight text-xs ${b.balance >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                        = {formatBancoCurrency(Math.abs(b.balance), 'PEN')}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Controles */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap justify-between">
              <div className="flex items-center gap-2 flex-wrap flex-1">
                <div className="relative min-w-[180px] flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input value={libroSearch} onChange={e => setLibroSearch(e.target.value)}
                    placeholder="Buscar movimiento..." className="pl-9 bg-zinc-900 border-zinc-800 text-white font-extralight" />
                </div>
                <div className="inline-flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 gap-0.5">
                  {([['todos','Todos'],['ingreso','Ingresos'],['egreso','Egresos']] as [string,string][]).map(([val,label]) => (
                    <button key={val} type="button" onClick={() => setLibroFilterTipo(val as any)}
                      className={`px-3 py-1.5 rounded-md text-xs font-extralight transition-all ${
                        libroFilterTipo === val ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                      }`}>{label}</button>
                  ))}
                </div>
                <Button variant="outline" size="sm"
                  onClick={() => setShowLibroFilters(p => !p)}
                  className={`border-zinc-800 font-extralight text-xs gap-1.5 ${showLibroFilters ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900'}`}>
                  <Search className="w-3.5 h-3.5" /> Filtros
                </Button>
              </div>
              {canWrite && (
                <Button onClick={() => setShowLibroModal(true)}
                  className="bg-white text-black hover:bg-zinc-200 font-extralight gap-2">
                  <Plus className="w-4 h-4" /> Nuevo movimiento
                </Button>
              )}
            </div>

            {showLibroFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800">
                <div className="space-y-1.5">
                  <Label className="text-zinc-500 font-extralight text-xs uppercase tracking-wider">Banco</Label>
                  <Select value={libroFilterBanco} onValueChange={setLibroFilterBanco}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white font-extralight h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      <SelectItem value="all" className="font-extralight text-xs">Todos los bancos</SelectItem>
                      {libroBancosUsados.map(id => {
                        const b = getBancoById(id);
                        return <SelectItem key={id} value={id} className="font-extralight text-xs">
                          {b ? `${BANCO_FLAG[b.country]} ${b.name}` : id}
                        </SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-500 font-extralight text-xs uppercase tracking-wider">Desde</Label>
                  <Input type="date" value={libroDateFrom} onChange={e => setLibroDateFrom(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white font-extralight h-8 text-xs [color-scheme:dark]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-500 font-extralight text-xs uppercase tracking-wider">Hasta</Label>
                  <Input type="date" value={libroDateTo} onChange={e => setLibroDateTo(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white font-extralight h-8 text-xs [color-scheme:dark]" />
                </div>
              </div>
            )}
          </div>

          {/* Tabla de movimientos */}
          <Card className="bg-zinc-950 border-zinc-800">
            <CardContent className="p-0">
              {libroEntries.length === 0 ? (
                <div className="py-16 text-center">
                  <Wallet className="w-8 h-8 text-zinc-700 mx-auto mb-2" strokeWidth={1} />
                  <p className="text-zinc-500 font-extralight text-sm">Sin movimientos registrados</p>
                  <p className="text-zinc-700 font-extralight text-xs mt-1">Registra el primer ingreso o egreso por banco</p>
                </div>
              ) : libroFiltered.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-zinc-600 font-extralight text-sm">Sin resultados para los filtros aplicados</p>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-3 px-4 py-2 border-b border-zinc-800" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <span className="col-span-2 text-zinc-600 text-xs font-extralight uppercase tracking-wider">Fecha</span>
                    <span className="col-span-1 text-zinc-600 text-xs font-extralight uppercase tracking-wider">Tipo</span>
                    <span className="col-span-3 text-zinc-600 text-xs font-extralight uppercase tracking-wider">Descripción</span>
                    <span className="col-span-2 text-zinc-600 text-xs font-extralight uppercase tracking-wider">Banco</span>
                    <span className="col-span-1 text-zinc-600 text-xs font-extralight uppercase tracking-wider">Cat.</span>
                    <span className="col-span-2 text-zinc-600 text-xs font-extralight uppercase tracking-wider text-right">Importe</span>
                    <span className="col-span-1" />
                  </div>
                  <div className="divide-y divide-zinc-900/50">
                    {libroFiltered.map(entry => {
                      const entryDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
                      const banco     = getBancoById(entry.bankId);
                      const isIng     = entry.tipo === 'ingreso';
                      const isDel     = libroDeletingId === entry.id;
                      return (
                        <div key={entry.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-zinc-900/30 transition-colors">
                          <div className="col-span-2">
                            <p className="text-zinc-400 font-extralight text-xs">{format(entryDate, 'dd MMM', { locale: es })}</p>
                            <p className="text-zinc-700 font-extralight text-[10px]">{format(entryDate, 'yyyy')}</p>
                          </div>
                          <div className="col-span-1">
                            <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isIng ? 'bg-emerald-950/60' : 'bg-red-950/60'}`}>
                              {isIng
                                ? <TrendingUp className="w-3 h-3 text-emerald-400" strokeWidth={1.5} />
                                : <TrendingDown className="w-3 h-3 text-red-400" strokeWidth={1.5} />}
                            </div>
                          </div>
                          <div className="col-span-3 min-w-0">
                            <p className="text-white font-extralight text-xs truncate">{entry.description}</p>
                            {entry.reference && <p className="text-zinc-600 font-extralight text-[10px]">Ref: {entry.reference}</p>}
                          </div>
                          <div className="col-span-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs">{banco ? BANCO_FLAG[banco.country] : '💼'}</span>
                              <span className="text-zinc-400 font-extralight text-xs truncate">{entry.bankName}</span>
                            </div>
                          </div>
                          <div className="col-span-1">
                            <span className="text-zinc-600 font-extralight text-xs truncate">{entry.category}</span>
                          </div>
                          <div className="col-span-2 text-right">
                            <p className={`font-extralight text-sm ${isIng ? 'text-emerald-400' : 'text-red-400'}`}>
                              {isIng ? '+' : '-'} {formatBancoCurrency(entry.amount, entry.currency)}
                            </p>
                            <p className="text-zinc-700 font-extralight text-[10px]">{entry.currency}</p>
                          </div>
                          <div className="col-span-1 flex justify-end">
                            {canWrite && (
                              <Button variant="ghost" size="sm"
                                onClick={() => handleDeleteLibroEntry(entry.id, entry.description)}
                                disabled={isDel}
                                className="text-zinc-700 hover:text-red-400 hover:bg-red-950/30 h-7 w-7 p-0">
                                {isDel
                                  ? <RefreshCw className="w-3 h-3 animate-spin" />
                                  : <Trash2 className="w-3 h-3" />}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Pie */}
                  <div className="px-4 py-3 border-t border-zinc-800 text-center">
                    <p className="text-zinc-600 font-extralight text-xs">
                      Mostrando {libroFiltered.length} de {libroEntries.length} movimientos
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ MODAL: Nuevo movimiento Libro Bancos ══════════════════════════════════ */}
      <Dialog open={showLibroModal} onOpenChange={setShowLibroModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-extralight text-lg flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-400" /> Nuevo movimiento bancario
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-extralight text-sm">
              Registra un ingreso o egreso por banco (Perú 🇵🇪 · España 🇪🇸).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Tipo */}
            <div className="inline-flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 gap-0.5 w-full">
              {(['ingreso', 'egreso'] as TipoTransaccion[]).map(t => (
                <button key={t} type="button"
                  onClick={() => setLibroForm(f => ({ ...f, tipo: t }))}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-extralight transition-all ${
                    libroForm.tipo === t ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}>
                  {t === 'ingreso'
                    ? <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-400" />
                    : <ArrowDownCircle className="w-3.5 h-3.5 text-red-400" />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Fecha */}
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Fecha</Label>
                <Input type="date" value={libroForm.date}
                  onChange={e => setLibroForm(f => ({ ...f, date: e.target.value }))}
                  className="bg-zinc-900 border-zinc-800 text-white font-extralight [color-scheme:dark]" />
              </div>
              {/* Moneda + Importe */}
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Importe</Label>
                <div className="flex gap-2">
                  <Select value={libroForm.currency} onValueChange={(v: any) => setLibroForm(f => ({ ...f, currency: v }))}>
                    <SelectTrigger className="w-24 bg-zinc-900 border-zinc-800 text-white font-extralight shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      <SelectItem value="PEN" className="font-extralight">🇵🇪 S/</SelectItem>
                      <SelectItem value="EUR" className="font-extralight">🇪🇺 €</SelectItem>
                      <SelectItem value="USD" className="font-extralight">🇺🇸 $</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" min="0" step="0.01"
                    value={libroForm.amount}
                    onChange={e => setLibroForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="bg-zinc-900 border-zinc-800 text-white font-extralight flex-1" />
                </div>
              </div>
            </div>

            {/* Banco */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 font-extralight text-xs">Banco / Medio de pago</Label>
              <Select value={libroForm.bankId} onValueChange={v => setLibroForm(f => ({ ...f, bankId: v }))}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-extralight">
                  <SelectValue placeholder="Seleccionar banco..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <div className="px-2 py-1 text-zinc-600 text-[10px] font-extralight uppercase tracking-wider">🇵🇪 Perú</div>
                  {BANCOS.filter(b => b.country === 'PE').map(b => (
                    <SelectItem key={b.id} value={b.id} className="font-extralight">{b.name}</SelectItem>
                  ))}
                  <div className="px-2 py-1 text-zinc-600 text-[10px] font-extralight uppercase tracking-wider mt-1">🇪🇸 España</div>
                  {BANCOS.filter(b => b.country === 'ES').map(b => (
                    <SelectItem key={b.id} value={b.id} className="font-extralight">{b.name}</SelectItem>
                  ))}
                  <div className="px-2 py-1 text-zinc-600 text-[10px] font-extralight uppercase tracking-wider mt-1">💼 Otros</div>
                  {BANCOS.filter(b => b.country === 'custom').map(b => (
                    <SelectItem key={b.id} value={b.id} className="font-extralight">{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Categoría */}
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Categoría</Label>
                <Select value={libroForm.category} onValueChange={v => setLibroForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-extralight">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {CATEGORIAS_BANCO.map(c => (
                      <SelectItem key={c} value={c} className="font-extralight">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Referencia */}
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">N° referencia (opcional)</Label>
                <Input value={libroForm.reference}
                  onChange={e => setLibroForm(f => ({ ...f, reference: e.target.value }))}
                  placeholder="OP-00123"
                  className="bg-zinc-900 border-zinc-800 text-white font-extralight" />
              </div>
            </div>

            {/* Descripción */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 font-extralight text-xs">Descripción *</Label>
              <Input value={libroForm.description}
                onChange={e => setLibroForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Ej: Pago cliente ABC · Factura F001-00123"
                className="bg-zinc-900 border-zinc-800 text-white font-extralight" />
            </div>

            {/* Notas */}
            <div className="space-y-1.5">
              <Label className="text-zinc-400 font-extralight text-xs">Notas (opcional)</Label>
              <Textarea value={libroForm.notes}
                onChange={e => setLibroForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} placeholder="Observaciones adicionales..."
                className="bg-zinc-900 border-zinc-800 text-white font-extralight resize-none" />
            </div>

            {/* Preview importe */}
            {libroForm.amount && parseFloat(libroForm.amount) > 0 && (
              <div className="p-3 rounded-xl border flex items-center justify-between"
                style={{ background: libroForm.tipo === 'ingreso' ? 'rgba(52,211,153,0.06)' : 'rgba(248,113,113,0.06)', borderColor: libroForm.tipo === 'ingreso' ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)' }}>
                <span className="text-zinc-500 font-extralight text-sm">
                  {libroForm.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} a registrar
                </span>
                <span className={`font-extralight text-lg ${libroForm.tipo === 'ingreso' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {libroForm.tipo === 'ingreso' ? '+' : '-'} {formatBancoCurrency(parseFloat(libroForm.amount), libroForm.currency)}
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLibroModal(false)}
              className="border-zinc-800 text-white hover:bg-zinc-900 font-extralight">Cancelar</Button>
            <Button onClick={handleSaveLibroEntry}
              disabled={saving || !libroForm.bankId || !libroForm.description || !libroForm.amount || parseFloat(libroForm.amount) <= 0}
              className="bg-white text-black hover:bg-zinc-200 font-extralight">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showTxModal} onOpenChange={setShowTxModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-extralight text-lg flex items-center gap-2">
              <Wallet className="w-5 h-5" /> Nueva Transacción
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-extralight text-sm">
              Registra un ingreso o egreso.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="inline-flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 gap-0.5">
              {(['ingreso', 'egreso'] as TipoTransaccion[]).map(t => (
                <button key={t} type="button"
                  onClick={() => setTxForm(f => ({ ...f, tipo: t, categoria: '' }))}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-extralight transition-all ${
                    txForm.tipo === t ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}>
                  {t === 'ingreso'
                    ? <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-400" />
                    : <ArrowDownCircle className="w-3.5 h-3.5 text-red-400" />
                  }
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Monto (S/)</Label>
                <Input type="number" value={txForm.monto} onChange={e => setTxForm(f => ({ ...f, monto: e.target.value }))}
                  placeholder="0.00" className="bg-zinc-900 border-zinc-800 text-white font-extralight" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Fecha</Label>
                <Input type="date" value={txForm.fecha} onChange={e => setTxForm(f => ({ ...f, fecha: e.target.value }))}
                  className="bg-zinc-900 border-zinc-800 text-white font-extralight [color-scheme:dark]" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-400 font-extralight text-xs">Categoría</Label>
              <Select value={txForm.categoria} onValueChange={v => setTxForm(f => ({ ...f, categoria: v }))}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-extralight">
                  <SelectValue placeholder="Selecciona categoría" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {(txForm.tipo === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_EGRESO).map(c => (
                    <SelectItem key={c} value={c} className="font-extralight">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-400 font-extralight text-xs">Descripción</Label>
              <Textarea value={txForm.descripcion} onChange={e => setTxForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Detalle de la transacción..." rows={2}
                className="bg-zinc-900 border-zinc-800 text-white font-extralight resize-none" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTxModal(false)}
              className="border-zinc-800 text-white hover:bg-zinc-900 font-extralight">
              Cancelar
            </Button>
            <Button onClick={handleSaveTx} disabled={saving || !txForm.monto || !txForm.descripcion || !txForm.categoria}
              className="bg-white text-black hover:bg-zinc-200 font-extralight">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ MODAL: Nueva Factura ════════════════════════════════════════════════ */}
      <Dialog open={showFacModal} onOpenChange={setShowFacModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-extralight text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" /> Nueva Factura
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-extralight text-sm">
              Registra una factura de proveedor o cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
              <Hash className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">N° generado automáticamente</p>
                <p className="text-emerald-400 font-extralight text-sm mt-0.5">{generarNumeroFactura()}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-400 font-extralight text-xs">Tipo</Label>
              <Select value={facForm.tipoEntidad} onValueChange={(v: any) => setFacForm(f => ({ ...f, tipoEntidad: v }))}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-extralight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="proveedor" className="font-extralight">Proveedor</SelectItem>
                  <SelectItem value="cliente"   className="font-extralight">Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-400 font-extralight text-xs">
                {facForm.tipoEntidad === 'proveedor' ? 'Proveedor' : 'Cliente'}
              </Label>
              <Input value={facForm.entidad} onChange={e => setFacForm(f => ({ ...f, entidad: e.target.value }))}
                placeholder="Nombre o razón social" className="bg-zinc-900 border-zinc-800 text-white font-extralight" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Monto (S/)</Label>
                <Input type="number" value={facForm.monto} onChange={e => setFacForm(f => ({ ...f, monto: e.target.value }))}
                  placeholder="0.00" className="bg-zinc-900 border-zinc-800 text-white font-extralight" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Fecha</Label>
                <Input type="date" value={facForm.fecha} onChange={e => setFacForm(f => ({ ...f, fecha: e.target.value }))}
                  className="bg-zinc-900 border-zinc-800 text-white font-extralight [color-scheme:dark]" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-400 font-extralight text-xs">Estado inicial</Label>
              <Select value={facForm.estado} onValueChange={(v: any) => setFacForm(f => ({ ...f, estado: v }))}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-extralight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="pendiente" className="font-extralight">Pendiente</SelectItem>
                  <SelectItem value="pagada"    className="font-extralight">Pagada</SelectItem>
                  <SelectItem value="vencida"   className="font-extralight">Vencida</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
  <Label className="text-zinc-400 font-extralight text-xs">Descripción / Concepto</Label>
  <Input value={facForm.descripcion} onChange={e => setFacForm(f => ({ ...f, descripcion: e.target.value }))}
    placeholder="Detalla el concepto de la factura..." className="bg-zinc-900 border-zinc-800 text-white font-extralight" />
</div>

{/* ← AQUÍ va Observaciones */}
<div className="space-y-1.5">
  <Label className="text-zinc-400 font-extralight text-xs">Observaciones</Label>
  <Textarea
    value={facForm.observaciones}
    onChange={e => setFacForm(f => ({ ...f, observaciones: e.target.value }))}
    placeholder="Notas internas, condiciones de pago, vencimiento..."
    rows={2}
    className="bg-zinc-900 border-zinc-800 text-white font-extralight resize-none"
  />
</div>

{facForm.monto && parseFloat(facForm.monto) > 0 && (
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1">
                <div className="flex justify-between text-xs font-extralight">
                  <span className="text-zinc-500">Subtotal (sin IGV):</span>
                  <span className="text-zinc-300">{formatMoney(parseFloat(facForm.monto) / 1.18)}</span>
                </div>
                <div className="flex justify-between text-xs font-extralight">
                  <span className="text-zinc-500">IGV (18%):</span>
                  <span className="text-zinc-300">{formatMoney(parseFloat(facForm.monto) - parseFloat(facForm.monto) / 1.18)}</span>
                </div>
                <div className="flex justify-between text-sm font-extralight border-t border-zinc-700 pt-1 mt-1">
                  <span className="text-white">Total:</span>
                  <span className="text-emerald-400">{formatMoney(parseFloat(facForm.monto))}</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFacModal(false)}
              className="border-zinc-800 text-white hover:bg-zinc-900 font-extralight">
              Cancelar
            </Button>
            <Button onClick={handleSaveFac} disabled={saving || !facForm.entidad || !facForm.monto}
              className="bg-white text-black hover:bg-zinc-200 font-extralight">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ MODAL: Presupuesto ══════════════════════════════════════════════════ */}
      <Dialog open={showPresModal} onOpenChange={v => { setShowPresModal(v); if (!v) setEditPresId(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-extralight text-lg flex items-center gap-2">
              <Target className="w-5 h-5" />
              {editPresId ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-extralight text-sm">
              Define un límite de gasto por categoría y período.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 font-extralight text-xs">Nombre</Label>
              <Input value={presForm.nombre} onChange={e => setPresForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Marketing Q1" className="bg-zinc-900 border-zinc-800 text-white font-extralight" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Categoría</Label>
                <Select value={presForm.categoria} onValueChange={v => setPresForm(f => ({ ...f, categoria: v }))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-extralight">
                    <SelectValue placeholder="Categoría" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {CATEGORIAS_EGRESO.map(c => (
                      <SelectItem key={c} value={c} className="font-extralight">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Período</Label>
                <Input type="month" value={presForm.periodo}
                  onChange={e => setPresForm(f => ({ ...f, periodo: e.target.value }))}
                  className="bg-zinc-900 border-zinc-800 text-white font-extralight [color-scheme:dark]" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-400 font-extralight text-xs">Monto asignado (S/)</Label>
              <Input type="number" value={presForm.montoAsignado}
                onChange={e => setPresForm(f => ({ ...f, montoAsignado: e.target.value }))}
                placeholder="0.00" className="bg-zinc-900 border-zinc-800 text-white font-extralight" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPresModal(false); setEditPresId(null); }}
              className="border-zinc-800 text-white hover:bg-zinc-900 font-extralight">
              Cancelar
            </Button>
            <Button onClick={handleSavePres}
              disabled={saving || !presForm.nombre || !presForm.montoAsignado || !presForm.categoria}
              className="bg-white text-black hover:bg-zinc-200 font-extralight">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              {editPresId ? 'Actualizar' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ MODAL: Detalle de sueldos del empleado ═══════════════════════════════ */}
      <Dialog open={showEmpDetail} onOpenChange={v => { setShowEmpDetail(v); if (!v) setSelectedEmp(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedEmp && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {selectedEmp.avatar
                      ? <img src={selectedEmp.avatar} alt={selectedEmp.displayName} className="w-full h-full object-cover" />
                      : <span className="text-white font-extralight">{selectedEmp.displayName?.[0]?.toUpperCase()}</span>
                    }
                  </div>
                  <div>
                    <DialogTitle className="font-extralight text-lg">{selectedEmp.displayName}</DialogTitle>
                    <DialogDescription className="text-zinc-500 font-extralight text-sm">
                      {selectedEmp.role} · {selectedEmp.email}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="grid grid-cols-3 gap-3 py-2">
                {[
                  { label: 'Registros',  value: sueldosDelEmp.length },
                  { label: 'Pagados',    value: sueldosDelEmp.filter(s => s.estado === 'pagado').length },
                  { label: 'Pendientes', value: sueldosDelEmp.filter(s => s.estado === 'pendiente').length },
                ].map(s => (
                  <Card key={s.label} className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-3 text-center">
                      <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">{s.label}</p>
                      <p className="text-white text-xl font-extralight mt-0.5">{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {canWrite && (
                <Button onClick={() => {
                  setEditSueldoId(null);
                  setSueldoForm({ montoBase: '', bonificaciones: '0', descuentos: '0', periodo: format(new Date(), 'yyyy-MM'), estado: 'pendiente', observaciones: '' });
                  setShowSueldoModal(true);
                }} className="bg-white text-black hover:bg-zinc-200 font-extralight gap-2 w-full">
                  <Plus className="w-4 h-4" /> Registrar sueldo
                </Button>
              )}

              <div className="space-y-2 mt-1">
                {sueldosDelEmp.length === 0 ? (
                  <p className="text-zinc-600 text-sm font-extralight text-center py-6">Sin registros de sueldo</p>
                ) : sueldosDelEmp.map(s => {
                  const neto = s.netoAPagar ?? (s.montoBase + s.bonificaciones - s.descuentos);
                  const cfg  = ESTADO_SUELDO_CONFIG[s.estado];
                  return (
                    <div key={s.id} className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-extralight text-sm">{s.periodo}</span>
                          <Badge className={`${cfg.bg} ${cfg.color} ${cfg.border} border font-extralight text-[10px] px-1.5 py-0`}>{cfg.label}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400 font-extralight">{formatMoney(neto)}</span>
                          {canWrite && (
                            <>
                              <Select value={s.estado} onValueChange={(v: any) => handleEstadoSueldo(s.id, v)}>
                                <SelectTrigger className="w-24 h-6 text-xs font-extralight bg-zinc-800 border-zinc-700 text-zinc-300"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800">
                                  <SelectItem value="pendiente" className="font-extralight text-yellow-400 text-xs">Pendiente</SelectItem>
                                  <SelectItem value="pagado"    className="font-extralight text-green-400 text-xs">Pagado</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button variant="ghost" size="sm"
                                onClick={() => handleDelete('contabilidad_sueldos', s.id)}
                                className="text-zinc-600 hover:text-red-400 hover:bg-red-950/30 h-6 w-6 p-0">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs font-extralight">
                        <div><span className="text-zinc-600">Base:</span><span className="text-zinc-300 ml-1">{formatMoney(s.montoBase)}</span></div>
                        <div><span className="text-zinc-600">Bonif.:</span><span className="text-emerald-400 ml-1">+{formatMoney(s.bonificaciones)}</span></div>
                        <div><span className="text-zinc-600">Desc.:</span><span className="text-red-400 ml-1">-{formatMoney(s.descuentos)}</span></div>
                      </div>
                      {s.observaciones && (
                        <p className="text-zinc-600 text-xs font-extralight mt-2 border-t border-zinc-800 pt-2">{s.observaciones}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <DialogFooter>
                <Button onClick={() => setShowEmpDetail(false)} className="bg-white text-black hover:bg-zinc-200 font-extralight">Cerrar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ══ MODAL: Registrar sueldo ══════════════════════════════════════════════ */}
      <Dialog open={showSueldoModal} onOpenChange={setShowSueldoModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-extralight text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5" /> Registrar Sueldo
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-extralight text-sm">
              {selectedEmp?.displayName} · {selectedEmp?.role}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Período</Label>
                <Input type="month" value={sueldoForm.periodo}
                  onChange={e => setSueldoForm(f => ({ ...f, periodo: e.target.value }))}
                  className="bg-zinc-900 border-zinc-800 text-white font-extralight [color-scheme:dark]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Estado</Label>
                <Select value={sueldoForm.estado} onValueChange={(v: any) => setSueldoForm(f => ({ ...f, estado: v }))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-white font-extralight"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="pendiente" className="font-extralight">Pendiente</SelectItem>
                    <SelectItem value="pagado"    className="font-extralight">Pagado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-400 font-extralight text-xs">Sueldo base (S/)</Label>
              <Input type="number" value={sueldoForm.montoBase}
                onChange={e => setSueldoForm(f => ({ ...f, montoBase: e.target.value }))}
                placeholder="0.00" className="bg-zinc-900 border-zinc-800 text-white font-extralight" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Bonificaciones (S/)</Label>
                <Input type="number" value={sueldoForm.bonificaciones}
                  onChange={e => setSueldoForm(f => ({ ...f, bonificaciones: e.target.value }))}
                  placeholder="0.00" className="bg-zinc-900 border-zinc-800 text-white font-extralight" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Descuentos (S/)</Label>
                <Input type="number" value={sueldoForm.descuentos}
                  onChange={e => setSueldoForm(f => ({ ...f, descuentos: e.target.value }))}
                  placeholder="0.00" className="bg-zinc-900 border-zinc-800 text-white font-extralight" />
              </div>
            </div>

            {sueldoForm.montoBase && (
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-between">
                <span className="text-zinc-500 text-sm font-extralight">Neto a pagar</span>
                <span className="text-emerald-400 font-extralight text-lg">
                  {formatMoney(
                    parseFloat(sueldoForm.montoBase || '0')
                    + parseFloat(sueldoForm.bonificaciones || '0')
                    - parseFloat(sueldoForm.descuentos || '0')
                  )}
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-zinc-400 font-extralight text-xs">Observaciones (opcional)</Label>
              <Textarea value={sueldoForm.observaciones}
                onChange={e => setSueldoForm(f => ({ ...f, observaciones: e.target.value }))}
                placeholder="CTS, vacaciones, horas extra..." rows={2}
                className="bg-zinc-900 border-zinc-800 text-white font-extralight resize-none" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSueldoModal(false)}
              className="border-zinc-800 text-white hover:bg-zinc-900 font-extralight">Cancelar</Button>
            <Button onClick={handleSaveSueldo} disabled={saving || !sueldoForm.montoBase}
              className="bg-white text-black hover:bg-zinc-200 font-extralight">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ MODAL: Contratos del empleado (solo lectura) ══════════════════════════ */}
      <EmployeeContractModal
        open={showContractModal}
        onClose={() => { setShowContractModal(false); setContractEmp(null); }}
        user={contractEmp}
      />

      {/* ══ MODAL: Configuración empresa ═════════════════════════════════════════ */}
      <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-extralight text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5" /> Configuración Empresa
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-extralight text-sm">
              Estos datos aparecerán en los PDFs de facturas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-zinc-400 font-extralight text-xs flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5" /> Logo de la empresa (URL)
              </Label>
              <Input
                value={configForm.logoUrl}
                onChange={e => setConfigForm(f => ({ ...f, logoUrl: e.target.value }))}
                placeholder="https://tu-empresa.com/logo.png"
                className="bg-zinc-900 border-zinc-800 text-white font-extralight"
              />
              {configForm.logoUrl && (
                <div className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <img
                    src={configForm.logoUrl}
                    alt="preview"
                    className="h-12 w-auto object-contain rounded"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <p className="text-zinc-500 text-xs font-extralight">Vista previa del logo</p>
                </div>
              )}
              <p className="text-zinc-600 text-xs font-extralight">
                Usa una URL pública. Para Supabase Storage copia el enlace público de tu bucket.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-zinc-400 font-extralight text-xs">Nombre de la empresa *</Label>
                <Input
                  value={configForm.empresaNombre}
                  onChange={e => setConfigForm(f => ({ ...f, empresaNombre: e.target.value }))}
                  placeholder="Mi Empresa S.A.C."
                  className="bg-zinc-900 border-zinc-800 text-white font-extralight"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">RUC</Label>
                <Input
                  value={configForm.ruc}
                  onChange={e => setConfigForm(f => ({ ...f, ruc: e.target.value }))}
                  placeholder="20123456789"
                  className="bg-zinc-900 border-zinc-800 text-white font-extralight"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Teléfono</Label>
                <Input
                  value={configForm.telefono}
                  onChange={e => setConfigForm(f => ({ ...f, telefono: e.target.value }))}
                  placeholder="+51 999 888 777"
                  className="bg-zinc-900 border-zinc-800 text-white font-extralight"
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-zinc-400 font-extralight text-xs">Dirección</Label>
                <Input
                  value={configForm.direccion}
                  onChange={e => setConfigForm(f => ({ ...f, direccion: e.target.value }))}
                  placeholder="Av. Principal 123, Lima, Perú"
                  className="bg-zinc-900 border-zinc-800 text-white font-extralight"
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-zinc-400 font-extralight text-xs">Correo electrónico</Label>
                <Input
                  value={configForm.email}
                  onChange={e => setConfigForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="contacto@miempresa.com"
                  className="bg-zinc-900 border-zinc-800 text-white font-extralight"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigModal(false)}
              className="border-zinc-800 text-white hover:bg-zinc-900 font-extralight">
              Cancelar
            </Button>
            <Button onClick={handleSaveConfig} disabled={savingConfig || !configForm.empresaNombre}
              className="bg-white text-black hover:bg-zinc-200 font-extralight">
              {savingConfig ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Guardar configuración
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ MODAL: Nuevo Asiento Contable ════════════════════════════════════════ */}
      <Dialog open={showAsientoModal} onOpenChange={v => {
        setShowAsientoModal(v);
        if (!v) { 
          setCuentaSearch({});
          setCuentaPais({});
          setLineasForm([
            { cuentaCodigo: '', cuentaNombre: '', debe: 0, haber: 0 },
            { cuentaCodigo: '', cuentaNombre: '', debe: 0, haber: 0 },
          ]); 
        }
      }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-extralight text-lg flex items-center gap-2">
              <BookOpen className="w-5 h-5" /> Nuevo Asiento Contable
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-extralight text-sm">
              Partida doble: el Debe debe ser igual al Haber para poder guardar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Fecha</Label>
                <Input type="date" value={asientoForm.fecha}
                  onChange={e => setAsientoForm(f => ({ ...f, fecha: e.target.value }))}
                  className="bg-zinc-900 border-zinc-800 text-white font-extralight [color-scheme:dark]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 font-extralight text-xs">Glosa</Label>
                <Input value={asientoForm.glosa}
                  onChange={e => setAsientoForm(f => ({ ...f, glosa: e.target.value }))}
                  placeholder="Ej: Pago planilla enero 2025"
                  className="bg-zinc-900 border-zinc-800 text-white font-extralight" />
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2 px-1 text-xs font-extralight uppercase tracking-wider text-zinc-500">
  <div className="col-span-4">Cuenta PCGE</div>
  <div className="col-span-3">Descripción</div>
  <div className="col-span-2 text-right">Debe (S/)</div>
  <div className="col-span-2 text-right">Haber (S/)</div>
  <div className="col-span-1" />
</div>

            <div className="space-y-2">
              {lineasForm.map((linea, idx) => {
                const tipo      = PLAN_CONTABLE.find(p => p.codigo === linea.cuentaCodigo)?.tipo;
                const busqueda  = cuentaSearch[idx] ?? '';
                  {/* Campo descripción libre por línea */}
<Input
  value={cuentaSearch[`desc_${idx}`] ?? ''}
  onChange={e => setCuentaSearch(p => ({ ...p, [`desc_${idx}`]: e.target.value }))}
  placeholder="Descripción (opcional)"
  className="bg-zinc-900 border-zinc-800 text-zinc-400 font-extralight text-xs h-7 mt-1"
/>

                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-start">
  {/* Cuenta PCGE */}
  {/* Cuenta PCGE — selector con categorías */}
<div className="col-span-4 relative">
  {linea.cuentaCodigo ? (
    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md">
      <span className="text-xs flex-shrink-0">
        {PLAN_CONTABLE.find(p => p.codigo === linea.cuentaCodigo && p.country === (cuentaPais[idx] ?? 'PE'))?.country === 'ES' ? '🇪🇸' : '🇵🇪'}
      </span>
      <span className={`font-mono text-xs flex-shrink-0 ${tipo ? TIPO_COLOR[tipo] : 'text-zinc-400'}`}>
        {linea.cuentaCodigo}
      </span>
      <span className="text-zinc-300 font-extralight text-xs truncate">{linea.cuentaNombre}</span>
      <button type="button"
        onClick={() => { handleLineaChange(idx,'cuentaCodigo',''); handleLineaChange(idx,'cuentaNombre',''); }}
        className="ml-auto text-zinc-600 hover:text-red-400 flex-shrink-0 text-base leading-none">×</button>
    </div>
  ) : (
    <>
      {/* Buscador */}
      <Input value={busqueda}
        onChange={e => setCuentaSearch(p => ({ ...p, [idx]: e.target.value }))}
        placeholder="Buscar por nombre o código..."
        className="bg-zinc-900 border-zinc-800 text-white font-extralight text-xs h-9" />

      {/* Dropdown: búsqueda activa O navegación por categoría */}
      <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-zinc-950 border border-zinc-700 rounded-md shadow-xl overflow-hidden"
           style={{ display: busqueda.length > 0 || cuentaSearch[`open_${idx}`] ? 'block' : 'none' }}>

        {/* Toggle país */}
        <div className="flex border-b border-zinc-800">
          {(['PE', 'ES'] as const).map(pais => (
            <button key={pais} type="button"
              onClick={() => setCuentaPais(p => ({ ...p, [idx]: pais }))}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-extralight transition-colors ${
                (cuentaPais[idx] ?? 'PE') === pais
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}>
              <span>{pais === 'PE' ? '🇵🇪' : '🇪🇸'}</span>
              <span>{pais === 'PE' ? 'Perú (PCGE)' : 'España (PGC)'}</span>
            </button>
          ))}
        </div>

        {/* Si hay búsqueda, muestra resultados filtrados por país */}
        {busqueda.length >= 1 ? (
          <div className="max-h-52 overflow-y-auto">
            {PLAN_CONTABLE.filter(p =>
              p.country === (cuentaPais[idx] ?? 'PE') &&
              (p.codigo.includes(busqueda) || p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
            ).slice(0, 12).map(c => (
              <button key={`${c.country}-${c.codigo}`} type="button"
                onClick={() => handleSelectCuenta(idx, c)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 text-left border-b border-zinc-900 last:border-0">
                <span className={`font-mono text-xs w-12 flex-shrink-0 ${TIPO_COLOR[c.tipo]}`}>{c.codigo}</span>
                <span className="text-zinc-300 font-extralight text-xs flex-1">{c.nombre}</span>
              </button>
            ))}
            {PLAN_CONTABLE.filter(p =>
              p.country === (cuentaPais[idx] ?? 'PE') &&
              (p.codigo.includes(busqueda) || p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
            ).length === 0 && (
              <p className="text-zinc-600 text-xs font-extralight px-3 py-3 text-center">Sin resultados en el plan {cuentaPais[idx] ?? 'PE'}</p>
            )}
          </div>
        ) : (
          /* Navegación por categoría, filtrada por país */
          <div className="max-h-64 overflow-y-auto">
            {(['activo','pasivo','patrimonio','ingreso','gasto'] as const).map(tipoCat => (
              <div key={tipoCat}>
                <button type="button"
                  onClick={() => setCuentaSearch(p => ({
                    ...p,
                    [`grupo_${idx}`]: p[`grupo_${idx}`] === tipoCat ? '' : tipoCat
                  }))}
                  className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900 hover:bg-zinc-800 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full bg-current ${TIPO_COLOR[tipoCat]}`} />
                    <span className={`text-xs font-extralight uppercase tracking-wider ${TIPO_COLOR[tipoCat]}`}>
                      {tipoCat === 'activo'     ? 'Activo — Caja, Bancos, Cuentas por Cobrar'    :
                       tipoCat === 'pasivo'     ? 'Pasivo — Deudas, Tributos, Sueldos por Pagar'  :
                       tipoCat === 'patrimonio' ? 'Patrimonio — Capital, Resultados'               :
                       tipoCat === 'ingreso'    ? 'Ingresos — Ventas, Servicios'                   :
                                                 'Gastos — Sueldos, Servicios, Depreciación'      }
                    </span>
                  </div>
                  <ChevronRight className={`w-3 h-3 text-zinc-600 transition-transform ${
                    cuentaSearch[`grupo_${idx}`] === tipoCat ? 'rotate-90' : ''
                  }`} />
                </button>
                {cuentaSearch[`grupo_${idx}`] === tipoCat && (
                  <div className="bg-zinc-950">
                    {PLAN_CONTABLE.filter(p => p.tipo === tipoCat && p.country === (cuentaPais[idx] ?? 'PE')).map(c => (
                      <button key={`${c.country}-${c.codigo}`} type="button"
                        onClick={() => {
                          handleSelectCuenta(idx, c);
                          setCuentaSearch(p => ({ ...p, [`grupo_${idx}`]: '', [`open_${idx}`]: '' }));
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800 text-left border-t border-zinc-900">
                        <span className={`font-mono text-[10px] w-10 flex-shrink-0 ${TIPO_COLOR[c.tipo]}`}>{c.codigo}</span>
                        <span className="text-zinc-300 font-extralight text-xs">{c.nombre}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Botón para abrir/cerrar el panel sin escribir */}
      {busqueda.length === 0 && (
        <button type="button"
          onClick={() => setCuentaSearch(p => ({
            ...p,
            [`open_${idx}`]: p[`open_${idx}`] ? '' : 'open'
          }))}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs font-extralight">
          {cuentaSearch[`open_${idx}`] ? '▲' : '▼'}
        </button>
      )}
    </>
  )}
</div>

  {/* Descripción libre */}
  <div className="col-span-3">
    <Input
      value={cuentaSearch[`desc_${idx}`] ?? ''}
      onChange={e => setCuentaSearch(p => ({ ...p, [`desc_${idx}`]: e.target.value }))}
      placeholder="Detalle..."
      className="bg-zinc-900 border-zinc-800 text-zinc-300 font-extralight text-xs h-9"
    />
  </div>

  {/* Debe */}
  <div className="col-span-2">
    <Input type="number" min="0" step="0.01"
      value={linea.debe || ''}
      onChange={e => { handleLineaChange(idx,'debe',parseFloat(e.target.value)||0); if(parseFloat(e.target.value)>0) handleLineaChange(idx,'haber',0); }}
      placeholder="0.00"
      className="bg-zinc-900 border-zinc-800 text-blue-400 font-extralight text-right h-9" />
  </div>

  {/* Haber */}
  <div className="col-span-2">
    <Input type="number" min="0" step="0.01"
      value={linea.haber || ''}
      onChange={e => { handleLineaChange(idx,'haber',parseFloat(e.target.value)||0); if(parseFloat(e.target.value)>0) handleLineaChange(idx,'debe',0); }}
      placeholder="0.00"
      className="bg-zinc-900 border-zinc-800 text-purple-400 font-extralight text-right h-9" />
  </div>

  {/* Eliminar */}
  <div className="col-span-1 flex items-center justify-center">
    {lineasForm.length > 2 && (
      <Button variant="ghost" size="sm" onClick={() => handleRemoveLinea(idx)}
        className="text-zinc-600 hover:text-red-400 hover:bg-red-950/30 h-8 w-8 p-0">
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    )}
  </div>
</div>
                );
              })}
            </div>

            <Button type="button" variant="outline" onClick={handleAddLinea}
              className="w-full border-dashed border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 font-extralight gap-2 h-9">
              <Plus className="w-3.5 h-3.5" /> Agregar línea
            </Button>

            <div className={`p-4 rounded-lg border ${asientoBalanceado ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-zinc-900 border-zinc-800'}`}>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider mb-1">Total Debe</p>
                  <p className="text-blue-400 font-extralight text-lg">{formatMoney(totalDebeForm)}</p>
                </div>
                <div className="flex items-center justify-center">
                  {asientoBalanceado
                    ? <div className="text-center"><CheckCircle className="w-6 h-6 text-emerald-400 mx-auto" /><p className="text-emerald-400 text-xs font-extralight mt-1">Cuadrado</p></div>
                    : <div className="text-center"><AlertCircle className="w-6 h-6 text-yellow-400 mx-auto" /><p className="text-yellow-400 text-xs font-extralight mt-1">Diferencia: {formatMoney(Math.abs(totalDebeForm - totalHaberForm))}</p></div>
                  }
                </div>
                <div>
                  <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider mb-1">Total Haber</p>
                  <p className="text-purple-400 font-extralight text-lg">{formatMoney(totalHaberForm)}</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAsientoModal(false)}
              className="border-zinc-800 text-white hover:bg-zinc-900 font-extralight">Cancelar</Button>
            <Button onClick={handleSaveAsiento}
              disabled={saving || !asientoBalanceado || !asientoForm.glosa}
              className="bg-white text-black hover:bg-zinc-200 font-extralight gap-2">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Registrar Asiento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ MODAL: Configuración Monetaria ═══════════════════════════════════════ */}
      <Dialog open={showMonedaModal} onOpenChange={setShowMonedaModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="font-extralight text-lg flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" /> Configuración Monetaria
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-extralight text-sm">
              Selecciona la moneda de trabajo y configura los tipos de cambio respecto al Sol (PEN).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label className="text-zinc-400 font-extralight text-xs uppercase tracking-wider">Moneda activa</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(MONEDAS_CONFIG) as Moneda[]).map(m => {
                  const cfg     = MONEDAS_CONFIG[m];
                  const activa  = monedaForm.monedaActiva === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMonedaForm(f => ({ ...f, monedaActiva: m }))}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                        activa
                          ? 'bg-zinc-800 border-emerald-700 text-white'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      <span className="text-xl">{cfg.flag}</span>
                      <div className="text-left">
                        <p className="font-extralight text-sm">{cfg.simbolo} {m}</p>
                        <p className="text-zinc-500 text-xs font-extralight">{cfg.label}</p>
                      </div>
                      {activa && <CheckCircle className="w-4 h-4 text-emerald-400 ml-auto" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400 font-extralight text-xs uppercase tracking-wider">
                Tipos de cambio (1 moneda extranjera = X soles)
              </Label>
              <p className="text-zinc-600 text-xs font-extralight">
                Se usan para mostrar equivalencias. Los montos se guardan siempre en la moneda activa.
              </p>

              {[
                { key: 'tipoCambioUSD' as keyof MonedaConfig, flag: '🇺🇸', label: '1 USD =' },
                { key: 'tipoCambioEUR' as keyof MonedaConfig, flag: '🇪🇺', label: '1 EUR =' },
                { key: 'tipoCambioGBP' as keyof MonedaConfig, flag: '🇬🇧', label: '1 GBP =' },
              ].map(({ key, flag, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-lg w-8">{flag}</span>
                  <span className="text-zinc-400 font-extralight text-sm w-16">{label}</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={monedaForm[key] as number}
                    onChange={e => setMonedaForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
                    className="bg-zinc-900 border-zinc-800 text-white font-extralight w-28 text-right"
                  />
                  <span className="text-zinc-500 font-extralight text-sm">S/</span>
                </div>
              ))}
            </div>

            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
              <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">Vista previa</p>
              <p className="text-white font-extralight text-sm">
                Ejemplo: {formatMoney(1000)} → se mostrará así en todo el sistema
              </p>
              {monedaForm.monedaActiva !== 'PEN' && (
                <p className="text-zinc-500 font-extralight text-xs">
                  Equivale a S/ {(
                    1000 * (
                      monedaForm.monedaActiva === 'USD' ? monedaForm.tipoCambioUSD :
                      monedaForm.monedaActiva === 'EUR' ? monedaForm.tipoCambioEUR :
                      monedaForm.tipoCambioGBP
                    )
                  ).toFixed(2)} soles
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMonedaModal(false)}
              className="border-zinc-800 text-white hover:bg-zinc-900 font-extralight">
              Cancelar
            </Button>
            <Button onClick={handleSaveMoneda} disabled={savingMoneda}
              className="bg-white text-black hover:bg-zinc-200 font-extralight gap-2">
              {savingMoneda
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <CheckCircle className="w-4 h-4" />
              }
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Contador;