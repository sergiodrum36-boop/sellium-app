// Shim mínimo de describe/test/expect para poder ejecutar los tests con
// node normal (Jest no arranca en este sandbox sobre el mount FUSE).
global.__stats = { pasadas: 0, fallidas: 0 };
let pilaDescribe = [];

global.describe = (nombre, fn) => {
  pilaDescribe.push(nombre);
  fn();
  pilaDescribe.pop();
};

global.test = (nombre, fn) => {
  const ruta = [...pilaDescribe, nombre].join(' > ');
  try {
    fn();
    global.__stats.pasadas++;
    console.log('PASS -', ruta);
  } catch (e) {
    global.__stats.fallidas++;
    console.log('FAIL -', ruta, '\n   ', e.message);
  }
};

function expect(valor) {
  return {
    toBe(esperado) {
      if (!Object.is(valor, esperado)) throw new Error(`esperado ${JSON.stringify(esperado)}, recibido ${JSON.stringify(valor)}`);
    },
    toEqual(esperado) {
      const a = JSON.stringify(valor);
      const b = JSON.stringify(esperado);
      if (a !== b) throw new Error(`esperado ${b}, recibido ${a}`);
    },
    toHaveLength(n) {
      if (!valor || valor.length !== n) throw new Error(`esperado length ${n}, recibido ${valor && valor.length}`);
    },
    toBeNull() {
      if (valor !== null) throw new Error(`esperado null, recibido ${JSON.stringify(valor)}`);
    },
    toBeGreaterThan(n) {
      if (!(valor > n)) throw new Error(`esperado > ${n}, recibido ${valor}`);
    }
  };
}
global.expect = expect;
