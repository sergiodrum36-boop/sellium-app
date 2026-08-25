/*
 * StockDistribuidor.js (Versión 5.4 - Rediseño visual Fase 3)
 * Cambios sobre la 5.3: solo la maquetación pasa a Tailwind CSS (con
 * soporte de modo oscuro). El cálculo de stock no cambia.
 */

import React, { useState, useEffect } from 'react';
import { unidadesAcuerdo } from './calculosAP';
import { inputClasses, etiqueta, filtroContenedor, tdClasses } from './uiClasses';
import TablaOrdenable from './TablaOrdenable';

// --- Función para obtener una lista de años ---
const getAnosDisponibles = () => {
  const anoActual = new Date().getFullYear();
  const anos = [];
  // Mostramos desde 2024 hasta el año actual + 2
  for (let i = 2024; i <= anoActual + 2; i++) {
    anos.push(i.toString());
  }
  return anos;
};

function StockDistribuidor({ marcas, historicoSellIn, historicoSellOut, stockInicialImportado }) {

  const [stockCalculado, setStockCalculado] = useState([]);
  const [cargando, setCargando] = useState(true);

  // --- Estado para el filtro de año ---
  const [anoSeleccionado, setAnoSeleccionado] = useState(new Date().getFullYear().toString());
  const [anosDisponibles] = useState(getAnosDisponibles());

  useEffect(() => {
    if (!marcas) {
      setCargando(true);
      return;
    }

    setCargando(true);
    const anoSelNum = parseInt(anoSeleccionado, 10);

    // Mapas de compras/ventas POR AÑO EXACTO (no solo "antes/durante"), para
    // poder aplicar el corte del Stock Inicial declarado en el Excel (si lo
    // hay) desde el año en que se declaró en adelante.
    const comprasPorMarcaAnio = new Map(); // id_marca -> Map(anio -> total)
    const ventasPorMarcaAnio = new Map();

    (historicoSellIn || []).forEach(mov => {
      const anio = parseInt((mov.mes_ano || '0000').substring(0, 4), 10);
      if (!comprasPorMarcaAnio.has(mov.id_marca)) comprasPorMarcaAnio.set(mov.id_marca, new Map());
      const m = comprasPorMarcaAnio.get(mov.id_marca);
      m.set(anio, (m.get(anio) || 0) + (mov.unidades_compradas || 0));
    });

    (historicoSellOut || []).forEach(mov => {
      const anio = parseInt((mov.mes_ano || '0000').substring(0, 4), 10);
      const salidas = (mov.ventas_uds || 0) + (mov.regaladas_uds || 0) + (mov.muestras_uds || 0) + unidadesAcuerdo(mov);
      if (!ventasPorMarcaAnio.has(mov.id_marca)) ventasPorMarcaAnio.set(mov.id_marca, new Map());
      const m = ventasPorMarcaAnio.get(mov.id_marca);
      m.set(anio, (m.get(anio) || 0) + salidas);
    });

    // Stock Inicial declarado (columna "Stock Inicial" del Excel de
    // liquidación): por marca, nos quedamos con la declaración de año más
    // reciente que sea <= año seleccionado (si un distribuidor reimporta un
    // Excel de un año posterior con un Stock Inicial distinto, ESE valor
    // manda a partir de su año, igual que con Ventas Reales).
    const seedPorMarca = new Map(); // id_marca -> { anio, stock_inicial }
    (stockInicialImportado || []).forEach(s => {
      if (s.anio > anoSelNum) return; // todavía no aplica para el año que se está viendo
      const actual = seedPorMarca.get(s.id_marca);
      if (!actual || s.anio > actual.anio) seedPorMarca.set(s.id_marca, { anio: s.anio, stock_inicial: s.stock_inicial || 0 });
    });

    // Construir el estado final
    const stockFinal = marcas.map(marca => {
      const seed = seedPorMarca.get(marca.id) || null;
      const anioDesde = seed ? seed.anio : -Infinity; // desde qué año (incl.) contar movimientos
      const seedValor = seed ? seed.stock_inicial : 0;

      const comprasMarca = comprasPorMarcaAnio.get(marca.id) || new Map();
      const ventasMarca = ventasPorMarcaAnio.get(marca.id) || new Map();

      let totalCompradoDesdeSeed = 0;
      let totalVendidoDesdeSeed = 0;
      comprasMarca.forEach((total, anio) => {
        if (anio >= anioDesde && anio < anoSelNum) totalCompradoDesdeSeed += total;
      });
      ventasMarca.forEach((total, anio) => {
        if (anio >= anioDesde && anio < anoSelNum) totalVendidoDesdeSeed += total;
      });

      // Stock Inicial = lo declarado en el Excel (si lo hay) + compras -
      // salidas registradas desde ese año hasta antes del año seleccionado.
      // Si no hay Stock Inicial declarado, se comporta igual que antes
      // (arranca de 0 y solo suma/resta lo que haya en la app).
      const stock_inicial = seedValor + totalCompradoDesdeSeed - totalVendidoDesdeSeed;

      // Cálculo del Año seleccionado (sin cambios: solo movimientos de ESE año)
      const compras_ano = comprasMarca.get(anoSelNum) || 0;
      const salidas_ano = ventasMarca.get(anoSelNum) || 0;

      // Cálculo de Stock Final
      const stock_final = stock_inicial + compras_ano - salidas_ano;

      return {
        id_marca: marca.id,
        nombre_marca: marca.nombre_marca,
        stock_inicial: stock_inicial,
        compras_ano: compras_ano,
        salidas_ano: salidas_ano,
        stock_final: stock_final,
        tieneStockDeclarado: !!seed
      };
    });

    setStockCalculado(stockFinal.filter(
      // Mostrar solo filas con algún movimiento
      fila => fila.stock_inicial !== 0 || fila.compras_ano > 0 || fila.salidas_ano > 0
    ));

    setCargando(false);

  }, [marcas, historicoSellIn, historicoSellOut, stockInicialImportado, anoSeleccionado]); // ¡Ahora depende del año!

  if (cargando) {
    return <div className="text-slate-500 dark:text-slate-400">Calculando stock...</div>;
  }

  return (
    <div>

      <div className={filtroContenedor}>
        <label className={etiqueta}>Mostrando Stock para el Año:</label>
        <select
          value={anoSeleccionado}
          onChange={(e) => setAnoSeleccionado(e.target.value)}
          className={inputClasses}
        >
          {anosDisponibles.map(ano => (
            <option key={ano} value={ano}>{ano}</option>
          ))}
        </select>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
        (Stock Final = Stock Inicial + Compras del Año - Salidas del Año)
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800">
        {stockCalculado.length === 0 ? (
          <p className={`${tdClasses} text-center py-5`}>No hay movimientos de stock registrados para este distribuidor en {anoSeleccionado}.</p>
        ) : (
          <TablaOrdenable
            filas={stockCalculado}
            keyExtractor={fila => fila.id_marca}
            columnas={[
              { titulo: 'Marca', valor: fila => fila.nombre_marca, render: fila => <span className="font-semibold">{fila.nombre_marca}</span> },
              { titulo: 'STOCK INICIAL (uds)', derecha: true, valor: fila => fila.stock_inicial, render: fila => Math.round(fila.stock_inicial) },
              { titulo: 'COMPRAS AÑO (uds)', derecha: true, valor: fila => fila.compras_ano, render: fila => Math.round(fila.compras_ano) },
              { titulo: 'SALIDAS AÑO (uds)', derecha: true, valor: fila => fila.salidas_ano, render: fila => Math.round(fila.salidas_ano) },
              {
                titulo: 'STOCK FINAL (uds)', derecha: true, valor: fila => fila.stock_final,
                claseCabecera: '!bg-indigo-50 dark:!bg-indigo-500/20 !text-indigo-700 dark:!text-indigo-300',
                claseCelda: 'font-semibold bg-indigo-50/60 dark:bg-indigo-500/20',
                render: fila => (
                  <span className={fila.stock_final < 0 ? 'text-red-600 dark:text-red-400' : ''}>{Math.round(fila.stock_final)}</span>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}

export default StockDistribuidor;
