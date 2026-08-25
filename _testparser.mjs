import * as XLSX from 'xlsx';
import fs from 'fs';
import { parseSellOutClientes } from './src/parserSellOutClientes.js';

const buffer = fs.readFileSync('/sessions/youthful-eloquent-hamilton/mnt/uploads/VENTAS 2025 MERINO.xlsx');
const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
const parsed = parseSellOutClientes(workbook);
console.log('Avisos:', parsed.avisos);
console.log('Hoja leida:', parsed.hojaLeida);
console.log('Total filas:', parsed.filas.length);
console.log('Primeras 5 filas (comercial/preventista):');
parsed.filas.slice(0, 5).forEach(f => console.log('  comercial:', JSON.stringify(f.comercial), '| preventista:', JSON.stringify(f.preventista), '| cliente:', f.cliente));
const conComercial = parsed.filas.filter(f => f.comercial && f.comercial.trim() !== '').length;
console.log('Filas con comercial no vacio:', conComercial, '/', parsed.filas.length);
