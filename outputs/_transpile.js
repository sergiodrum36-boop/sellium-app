// Transpila los _check_*.js (ES modules) a CommonJS usando @babel/core del
// propio proyecto, sin red y sin depender de un binario babel-cli.
const path = require('path');
const fs = require('fs');
const babel = require(path.join(process.cwd(), 'node_modules', '@babel', 'core'));

const archivos = ['_check_calculosAP.js', '_check_matching.js', '_check_alertas.js'];
const dir = '/tmp/verify';

archivos.forEach((nombre) => {
  const entrada = path.join(dir, nombre);
  const salida = path.join(dir, nombre.replace(/\.js$/, '.cjs'));
  const codigoFuente = fs.readFileSync(entrada, 'utf8');
  const resultado = babel.transform(codigoFuente, {
    presets: [[path.join(process.cwd(), 'node_modules', '@babel', 'preset-env')]],
    plugins: [[path.join(process.cwd(), 'node_modules', '@babel', 'plugin-transform-modules-commonjs')]],
    filename: entrada,
    babelrc: false,
    configFile: false
  });
  fs.writeFileSync(salida, resultado.code, 'utf8');
  console.log('OK ->', salida);
});
