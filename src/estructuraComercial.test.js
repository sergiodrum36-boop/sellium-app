/*
 * estructuraComercial.test.js
 * Tests de la lógica pura de Estructura Comercial: árbol de jerarquía
 * (construirJerarquiaComerciales) y detección de preventistas sin vincular
 * (getPreventistasSinVincular). Mismo patrón que alertas.test.js/matching
 * (datos ya cargados, sin Firestore de por medio).
 */
import { construirJerarquiaComerciales, getPreventistasSinVincular } from './estructuraComercial';

describe('construirJerarquiaComerciales', () => {
  test('sin id_supervisor, todos son raíz (lista plana)', () => {
    const comerciales = [
      { id: 'a', nombre: 'Ana' },
      { id: 'b', nombre: 'Berta' },
    ];
    const arbol = construirJerarquiaComerciales(comerciales);
    expect(arbol.map(n => n.id)).toEqual(['a', 'b']); // orden alfabético
    expect(arbol.every(n => n.children.length === 0)).toBe(true);
  });

  test('cuelga a un comercial de su supervisor', () => {
    const comerciales = [
      { id: 'jefe', nombre: 'Jefe', id_supervisor: null },
      { id: 'sub', nombre: 'Subordinado', id_supervisor: 'jefe' },
    ];
    const arbol = construirJerarquiaComerciales(comerciales);
    expect(arbol).toHaveLength(1);
    expect(arbol[0].id).toBe('jefe');
    expect(arbol[0].children).toHaveLength(1);
    expect(arbol[0].children[0].id).toBe('sub');
  });

  test('árbol de 3 niveles', () => {
    const comerciales = [
      { id: 'gerente', nombre: 'Gerente', id_supervisor: null },
      { id: 'supervisor', nombre: 'Supervisor', id_supervisor: 'gerente' },
      { id: 'preventista', nombre: 'Preventista', id_supervisor: 'supervisor' },
    ];
    const arbol = construirJerarquiaComerciales(comerciales);
    expect(arbol).toHaveLength(1);
    expect(arbol[0].children[0].id).toBe('supervisor');
    expect(arbol[0].children[0].children[0].id).toBe('preventista');
  });

  test('id_supervisor que no existe en la lista -> el nodo es raíz (no rompe)', () => {
    const comerciales = [{ id: 'a', nombre: 'Ana', id_supervisor: 'no-existe' }];
    const arbol = construirJerarquiaComerciales(comerciales);
    expect(arbol).toHaveLength(1);
    expect(arbol[0].id).toBe('a');
  });

  test('un comercial que se auto-referencia como supervisor -> raíz, no recursión infinita', () => {
    const comerciales = [{ id: 'a', nombre: 'Ana', id_supervisor: 'a' }];
    const arbol = construirJerarquiaComerciales(comerciales);
    expect(arbol).toHaveLength(1);
    expect(arbol[0].id).toBe('a');
    expect(arbol[0].children).toHaveLength(0);
  });

  test('ciclo entre dos comerciales (A supervisa a B, B supervisa a A) no cuelga la función', () => {
    const comerciales = [
      { id: 'a', nombre: 'Ana', id_supervisor: 'b' },
      { id: 'b', nombre: 'Berta', id_supervisor: 'a' },
    ];
    // No debe lanzar ni quedarse colgado (recursión/bucle infinito); ambos
    // deberían acabar siendo alcanzables desde el resultado de una forma u
    // otra (al menos uno como raíz).
    const arbol = construirJerarquiaComerciales(comerciales);
    const idsEnArbol = new Set();
    const recorrer = (nodos) => nodos.forEach(n => { idsEnArbol.add(n.id); recorrer(n.children); });
    recorrer(arbol);
    expect(idsEnArbol.has('a')).toBe(true);
    expect(idsEnArbol.has('b')).toBe(true);
  });

  test('lista vacía o undefined no rompe', () => {
    expect(construirJerarquiaComerciales([])).toEqual([]);
    expect(construirJerarquiaComerciales(undefined)).toEqual([]);
  });
});

describe('getPreventistasSinVincular', () => {
  test('detecta un preventista que aparece en movimientos pero no está dado de alta', () => {
    const movimientos = [{ preventista: 'Manuel Claro Romero' }, { preventista: 'Manuel Claro Romero' }];
    const resultado = getPreventistasSinVincular(movimientos, []);
    expect(resultado).toEqual([{ texto: 'Manuel Claro Romero', count: 2 }]);
  });

  test('NO lo lista si ya existe un comercial con ese nombre (comparación exacta)', () => {
    const movimientos = [{ preventista: 'Manuel Claro Romero' }];
    const comerciales = [{ id: 'x', nombre: 'Manuel Claro Romero' }];
    expect(getPreventistasSinVincular(movimientos, comerciales)).toEqual([]);
  });

  test('normaliza mayúsculas/acentos/puntuación antes de comparar (mismo criterio que matching.js)', () => {
    const movimientos = [{ preventista: 'MANUEL CLARO ROMERO.' }];
    const comerciales = [{ id: 'x', nombre: 'Manuel Claro Romero' }];
    expect(getPreventistasSinVincular(movimientos, comerciales)).toEqual([]);
  });

  test('ignora movimientos sin preventista (vacío o solo espacios)', () => {
    const movimientos = [{ preventista: '' }, { preventista: '   ' }, { }];
    expect(getPreventistasSinVincular(movimientos, [])).toEqual([]);
  });

  test('ordena de más a menos frecuente, y alfabéticamente en empate', () => {
    const movimientos = [
      { preventista: 'Zoe' }, { preventista: 'Zoe' },
      { preventista: 'Ana' },
      { preventista: 'Berta' },
    ];
    const resultado = getPreventistasSinVincular(movimientos, []);
    expect(resultado.map(r => r.texto)).toEqual(['Zoe', 'Ana', 'Berta']);
  });

  test('llamada sin argumentos no revienta', () => {
    expect(getPreventistasSinVincular(undefined, undefined)).toEqual([]);
  });
});
