import * as XLSX from 'xlsx';
import fs from 'fs';
import { parseSellOutClientes } from './src/parserSellOutClientes.js';

const buffer = fs.readFileSync('/sessions/youthful-eloquent-hamilton/mnt/outputs/VENTAS 2025-2026 MERINO.xlsx');
const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
const parsed = parseSellOutClientes(workbook);
console.log('Avisos:', parsed.avisos);
console.log('Hoja leida:', parsed.hojaLeida);
console.log('Total filas parseadas:', parsed.filas.length);
const conComercial = parsed.filas.filter(f => f.comercial && f.comercial.trim() !== '').length;
console.log('Con Zona (comercial) no vacia:', conComercial, '/', parsed.filas.length);
const meses = new Set(parsed.filas.map(f => f.mesAno));
console.log('Meses distintos:', [...meses].sort());
