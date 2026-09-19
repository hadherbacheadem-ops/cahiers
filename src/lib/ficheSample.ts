// A rich fiche as Claude would write it: only the body, using the kit's classes
// (.section, .grid, .card, .callout, .table-wrap, details.demo, figure.figure) and
// `$…$` for formulas. The app supplies the theme, KaTeX and the height reporting.
export const SAMPLE_FICHE = String.raw`
<h1>Mécanique céleste</h1>
<p class="lead">Mouvement d'un point matériel dans un champ de force newtonien : conservation, énergie potentielle effective, nature des trajectoires.</p>

<div class="section">
  <h2>Champ newtonien</h2>
  <p>On pose $K = GMm$. Toute la suite du chapitre s'appuie sur ces quatre formules.</p>

  <div class="grid">
    <div class="card formula-card"><span class="card-title">Force de gravitation</span>
      $$\vec F = -\dfrac{GMm}{r^2}\,\vec u_r$$</div>
    <div class="card formula-card"><span class="card-title">Énergie potentielle (nulle à l'infini)</span>
      $$E_p = -\dfrac{GMm}{r}$$</div>
    <div class="card formula-card"><span class="card-title">Énergie potentielle effective</span>
      $$E_{p,\text{eff}} = \dfrac{mC^2}{2r^2} - \dfrac{GMm}{r}$$</div>
    <div class="card formula-card"><span class="card-title">Si G ou M ne sont pas donnés</span>
      $$GM_T = g_0 R_T^2$$</div>
    <div class="card formula-card wide"><span class="card-title">Minimum de $E_{p,\text{eff}}$ : rayon du cercle</span>
      $$r_0 = \dfrac{mC^2}{GMm} = \dfrac{C^2}{GM}$$
      $$E_{p,\text{eff}}(r_0) = -\dfrac{GMm}{2r_0}$$</div>
  </div>

  <div class="callout key"><span class="callout-title">À retenir</span>
    Le mouvement est plan et vérifie la loi des aires : $r^2\dot\theta = C$ est constante. L'énergie mécanique $E_m = \tfrac12 m\dot r^2 + E_{p,\text{eff}}(r)$ se conserve.</div>

  <figure class="figure">
    <svg id="pot" viewBox="0 0 640 300" role="img" aria-label="Énergie potentielle effective et énergie mécanique">
      <line x1="60" y1="16" x2="60" y2="270" stroke="var(--text-3)" stroke-width="1.5"/>
      <line x1="60" y1="150" x2="620" y2="150" stroke="var(--text-3)" stroke-width="1.5"/>
      <text x="68" y="24">E</text><text x="604" y="168">r</text>
      <polyline id="curve" class="draw" pathLength="1" fill="none" stroke="var(--cahier-text)" stroke-width="3" stroke-linejoin="round"/>
      <line id="em" x1="60" x2="600" stroke="var(--accent)" stroke-width="2.5"/>
      <circle id="pA" r="6" fill="var(--ok)"/><circle id="pP" r="6" fill="var(--ok)"/>
      <text id="tA" text-anchor="middle"></text><text id="tP" text-anchor="middle"></text>
      <text id="tEm" x="612" text-anchor="end" style="fill:var(--accent-text);font-weight:650"></text>
    </svg>
    <div class="controls">
      <label for="e">Énergie mécanique $E_m$</label>
      <input id="e" type="range" min="-0.5" max="0.4" step="0.01" value="-0.25">
      <span class="readout" id="kind"></span>
    </div>
    <figcaption>Déplace le curseur : la nature de la trajectoire change selon la position de $E_m$ par rapport à la courbe.</figcaption>
  </figure>

  <div class="table-wrap"><table>
    <thead><tr><th>Énergie</th><th>État</th><th>Trajectoire</th></tr></thead>
    <tbody>
      <tr><td>$E_m = E_{p,\text{eff}}(r_0)$</td><td><span class="tag ok">lié</span></td><td>cercle</td></tr>
      <tr><td>$E_{p,\text{eff}}(r_0) \lt E_m \lt 0$</td><td><span class="tag ok">lié</span></td><td>ellipse, O au foyer</td></tr>
      <tr><td>$E_m = 0$</td><td><span class="tag warn">diffusion</span></td><td>parabole</td></tr>
      <tr><td>$E_m \gt 0$</td><td><span class="tag warn">diffusion</span></td><td>hyperbole</td></tr>
    </tbody></table></div>

  <details class="demo"><summary>Démo 1 : conservation de $\vec L_O$ et mouvement plan</summary>
    <div class="demo-body">
      <p>Le théorème du moment cinétique en O donne $\dfrac{d\vec L_O}{dt} = \vec{OM}\wedge\vec F$. La force est centrale ($\vec F \parallel \vec{OM}$), donc ce produit vectoriel est nul.</p>
      <p>$\vec L_O$ est un vecteur constant, et $\vec{OM}\perp\vec L_O$ à chaque instant : le mouvement reste dans le plan orthogonal à $\vec L_O$.</p>
    </div></details>

  <details class="demo"><summary>Démo 2 : constante des aires et loi des aires</summary>
    <div class="demo-body">
      <p>En coordonnées polaires, $\vec L_O = m r^2\dot\theta\,\vec e_z$, d'où $r^2\dot\theta = C$.</p>
      <p>L'aire balayée pendant $dt$ vaut $dA = \tfrac12 r^2\,d\theta$, donc $\dfrac{dA}{dt} = \dfrac{C}{2}$ : des aires égales sont balayées en des durées égales.</p>
    </div></details>

  <details class="demo cahier"><summary>Démo 3 : expression de $E_{p,\text{eff}}$ et nature du mouvement</summary>
    <div class="demo-body">
      <p>Avec $\dot\theta = C/r^2$ : $E_m = \tfrac12 m\dot r^2 + \tfrac12 m r^2\dot\theta^2 - \dfrac{GMm}{r} = \tfrac12 m\dot r^2 + \underbrace{\dfrac{mC^2}{2r^2} - \dfrac{GMm}{r}}_{E_{p,\text{eff}}(r)}$.</p>
      <p>Comme $\tfrac12 m\dot r^2 \ge 0$, le mouvement n'est possible que là où $E_{p,\text{eff}}(r) \le E_m$.</p>
    </div></details>
</div>

<script>
(function () {
  var W = 640, H = 300, X0 = 60, X1 = 600, R0 = 0.4, R1 = 6, YMIN = -0.6, YMAX = 0.7;
  var $ = function (id) { return document.getElementById(id); };
  var x = function (r) { return X0 + (r - R0) / (R1 - R0) * (X1 - X0); };
  var y = function (e) { return 270 - (e - YMIN) / (YMAX - YMIN) * 254; };
  var pts = [];
  for (var r = R0; r <= R1; r += 0.05) pts.push(x(r).toFixed(1) + ',' + y(1 / (2 * r * r) - 1 / r).toFixed(1));
  $('curve').setAttribute('points', pts.join(' '));
  function update() {
    var E = parseFloat($('e').value), roots = [];
    if (E === 0) roots = [0.5];
    else if (E < 0) {
      var d = 4 + 8 * E;
      if (d >= 0) roots = [(-2 + Math.sqrt(d)) / (4 * E), (-2 - Math.sqrt(d)) / (4 * E)].sort(function (a, b) { return a - b; });
    } else roots = [(-1 + Math.sqrt(1 + 2 * E)) / (2 * E)];
    var ye = y(E);
    $('em').setAttribute('y1', ye); $('em').setAttribute('y2', ye);
    $('tEm').setAttribute('y', ye - 8); $('tEm').textContent = 'Em';
    var P = $('pP'), A = $('pA');
    P.setAttribute('display', roots.length ? '' : 'none');
    A.setAttribute('display', roots.length > 1 ? '' : 'none');
    $('tP').textContent = ''; $('tA').textContent = '';
    if (roots.length) { P.setAttribute('cx', x(roots[0])); P.setAttribute('cy', ye); $('tP').setAttribute('x', x(roots[0]) + 16); $('tP').setAttribute('y', ye - 12); $('tP').textContent = 'rP'; }
    if (roots.length > 1) { A.setAttribute('cx', x(roots[1])); A.setAttribute('cy', ye); $('tA').setAttribute('x', x(roots[1])); $('tA').setAttribute('y', ye - 12); $('tA').textContent = 'rA'; }
    var kind = E <= -0.495 ? 'cercle (lié)' : E < 0 ? 'ellipse (lié)' : E === 0 ? 'parabole (diffusion)' : 'hyperbole (diffusion)';
    var k = $("kind"); if (k.textContent !== kind) { k.textContent = kind; k.classList.add("bump"); setTimeout(function () { k.classList.remove("bump"); }, 180); }
  }
  $('e').addEventListener('input', update);
  update();
})();
</script>
`
