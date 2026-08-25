const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const files = [
  'src/App.js','src/Layout.js','src/Sidebar.js','src/AlertasBell.js','src/uiClasses.js','src/KpiCard.js',
  'src/PantallaInicio.js','src/PantallaGrupo.js','src/PantallaDistribuidor.js','src/PantallaSellOutClientes.js',
  'src/DashboardSellOutClientes.js','src/DashboardSellOutMarcas.js',
  'src/DashboardVentasReales.js','src/PantallaDashboardAPCompania.js','src/PantallaDashboard.js','src/PantallaPresupuesto.js',
  'src/FiltroMultiSelect.js','src/FiltroBuscador.js','src/PeriodoComparador.js'
];

const globals = new Set([
  'window','document','console','Math','Array','Object','String','Number','Boolean','Date','JSON',
  'Promise','Map','Set','Intl','undefined','null','NaN','Infinity','fetch','localStorage','sessionStorage',
  'MutationObserver','alert','confirm','React','require','module','exports','process','setTimeout','clearTimeout',
  'setInterval','clearInterval','parseInt','parseFloat','isNaN','isFinite','Error','RegExp','Symbol','Reflect',
  'Proxy','WeakMap','WeakSet','ArrayBuffer','Uint8Array','Float32Array','FileReader','Blob','URL','navigator',
  'FormData','__dirname','__filename','global','globalThis'
]);

let totalProblems = 0;

files.forEach((f) => {
  const code = fs.readFileSync(f, 'utf8');
  let ast;
  try {
    ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  } catch (e) {
    console.log('PARSE ERROR', f, e.message);
    return;
  }
  const problems = [];
  traverse(ast, {
    ReferencedIdentifier(path) {
      const name = path.node.name;
      if (globals.has(name)) return;
      if (path.scope.hasBinding(name)) return;
      if (path.scope.hasGlobal(name)) return;
      // JSX component names starting uppercase that might be globals (React types) - still flag, better to check
      problems.push({ name, line: path.node.loc ? path.node.loc.start.line : '?' });
    }
  });
  if (problems.length) {
    totalProblems += problems.length;
    console.log('--- ' + f + ' ---');
    const seen = new Set();
    problems.forEach(p => {
      const key = p.name + ':' + p.line;
      if (seen.has(key)) return;
      seen.add(key);
      console.log('  line ' + p.line + ': "' + p.name + '" not defined in scope');
    });
  }
});

console.log('\nTotal potential no-undef issues:', totalProblems);
