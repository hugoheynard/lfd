/**
 * Rapporteur : le temps que prend CHAQUE suite, du plus lent au plus rapide.
 *
 * Pourquoi il existe. Les e2e ont pris 6 min 40 sur un run et 16 min 45 sur le
 * suivant, à code identique. Un total ne dit pas quelle suite a explosé, et
 * `--verbose` nomme les tests sans les chronométrer — on lisait donc une durée
 * globale sans jamais savoir à qui l'imputer.
 *
 * En `--runInBand` (le cas des e2e), les suites s'exécutent l'une après l'autre :
 * la somme des lignes ci-dessous EST le temps du run. Une ligne qui double d'un
 * run à l'autre est donc la coupable, sans autre instrumentation.
 *
 * `perfStats.runtime` vient de Jest lui-même — rien n'est mesuré ici, on ne fait
 * que trier ce qu'il a déjà compté.
 */
const TOP = 15;

/** Un total et une part, alignés — la part dit s'il faut regarder plus loin. */
function line(row, total, width) {
  const seconds = (row.ms / 1000).toFixed(1).padStart(7);
  const share = total > 0 ? Math.round((row.ms / total) * 100) : 0;
  return `  ${seconds}s  ${String(share).padStart(3)}%  ${row.name.padEnd(width)}  ${row.tests} test(s)`;
}

class SlowSuitesReporter {
  #rows = [];

  onTestResult(test, result) {
    this.#rows.push({
      name: (result.testFilePath ?? test.path).split("/").slice(-2).join("/"),
      ms: result.perfStats?.runtime ?? 0,
      tests: result.testResults?.length ?? 0,
    });
  }

  onRunComplete() {
    // Une seule suite : la durée est déjà celle du run, le tableau n'apprend rien.
    if (this.#rows.length < 2) {
      return;
    }
    const total = this.#rows.reduce((sum, row) => sum + row.ms, 0);
    const sorted = [...this.#rows].sort((a, b) => b.ms - a.ms);
    const shown = sorted.slice(0, TOP);
    const width = Math.max(...shown.map((row) => row.name.length));

    const header = `\n⏱  Suites les plus lentes — ${this.#rows.length} suites, ${(total / 1000).toFixed(1)}s cumulées\n`;
    const body = shown.map((row) => line(row, total, width)).join("\n");
    const rest = sorted.length - shown.length;
    const tail = rest > 0 ? `\n  … ${rest} suite(s) plus rapides\n` : "\n";
    process.stdout.write(`${header}${body}${tail}`);
  }
}

module.exports = SlowSuitesReporter;
