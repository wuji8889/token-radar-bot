// Token Radar's page: the board, a detail view for each protocol, a filter, the live set
// and the method. No network: every figure comes from window.RADAR (data.js, written by main.ts
// from the same board.json the gate reads), so the screen and the code cannot disagree.

(function () {
  var R = window.RADAR;
  if (!R || !Array.isArray(R.rows)) {
    document.getElementById('stats').textContent = 'No board data. Run main.ts first.';
    return;
  }

  var $ = function (id) { return document.getElementById(id); };
  var rowsEl = $('rows'), liveEl = $('live-rows'), multEl = $('mult-rows');
  var detailEl = $('detail'), countEl = $('count');

  // -- formatting ------------------------------------------------------------
  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n == null) return '—';
    var s = (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
    return '<span class="' + (n >= 0 ? 'pos' : 'neg') + '">' + s + '</span>';
  }
  function age(d) {
    if (d == null) return '—';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return d + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // -- state ------------------------------------------------------------------
  var state = { q: '', cat: '', chain: '', wl: false, sort: 'rank', dir: 1, detail: null };
  function readHash() {
    var h = location.hash.replace(/^#/, '');
    var parts = h ? h.split('&') : [];
    parts.forEach(function (p) {
      var kv = p.split('=');
      var k = kv[0], v = decodeURIComponent(kv[1] || '');
      if (k === 'detail') state.detail = v || null;
      if (k === 'cat') state.cat = v;
      if (k === 'chain') state.chain = v;
      if (k === 'wl') state.wl = v === '1';
      if (k === 'q') state.q = v;
    });
  }
  function writeHash() {
    var bits = [];
    if (state.detail) bits.push('detail=' + encodeURIComponent(state.detail));
    if (state.cat) bits.push('cat=' + encodeURIComponent(state.cat));
    if (state.chain) bits.push('chain=' + encodeURIComponent(state.chain));
    if (state.wl) bits.push('wl=1');
    if (state.q) bits.push('q=' + encodeURIComponent(state.q));
    history.replaceState(null, '', bits.length ? '#' + bits.join('&') : location.pathname + location.search);
  }

  // -- selects ----------------------------------------------------------------
  function fillSelect(el, values) {
    var cur = el.value;
    el.querySelectorAll('option:not([value=""])').forEach(function (o) { o.remove(); });
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      el.appendChild(o);
    });
    el.value = cur;
  }
  var cats = [...new Set(R.rows.map(function (r) { return r.category || '(no category)'; }))].sort();
  var chains = [...new Set(R.rows.flatMap(function (r) { return r.chains; }))].sort();
  fillSelect($('cat'), cats);
  fillSelect($('chain'), chains);

  // -- filtering and sorting ---------------------------------------------------
  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = R.rows.filter(function (r) {
      if (state.wl && !r.on_watchlist) return false;
      if (state.cat && (r.category || '(no category)') !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort, dir = state.dir;
    list.sort(function (a, b) {
      var va = a[key], vb = b[key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      if (Array.isArray(va)) return (va.length - vb.length) * dir;
      return (va - vb) * dir;
    });
    return list;
  }

  function renderRows() {
    var list = filtered();
    countEl.textContent = list.length + ' of ' + R.rows.length + ' rows';
    rowsEl.innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.detail === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong>' +
        (r.on_watchlist ? '<span class="tag">watchlist</span>' : '') +
        '<br><span class="sub">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num val">' + money(r.implied_value_usd) + '</td></tr>';
    }).join('');
    document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
      th.classList.toggle('on', th.getAttribute('data-sort') === state.sort);
      th.textContent = th.textContent.replace(/ [▲▼]$/, '') + (th.getAttribute('data-sort') === state.sort ? (state.dir === 1 ? ' ▲' : ' ▼') : '');
    });
  }

  // -- detail ------------------------------------------------------------------
  function renderDetail() {
    var r = R.rows.find(function (x) { return x.slug === state.detail; });
    if (!r) { detailEl.hidden = true; detailEl.innerHTML = ''; return; }
    var m = r;
    var multNote = m.multiple_source === 'category'
      ? 'median of ' + (R.multiples.find(function (x) { return x.category === (r.category || '(no category)'); }) || {}).comps + ' live comps'
      : 'whole-market median';
    detailEl.hidden = false;
    detailEl.innerHTML =
      '<h3>' + esc(r.name) + (r.on_watchlist ? '<span class="tag">on the watchlist</span>' : '') + '</h3>' +
      '<p class="meta">' + esc(r.slug) + ' &middot; ' + esc(r.category || 'no category') + ' &middot; ' +
      esc(r.chains.join(', ') || 'no chain listed') + ' &middot; tracked since ' + esc(r.listed_at || 'unknown') +
      ' &middot; records no token</p>' +
      '<h4>Implied value — how it is built</h4>' +
      '<div class="model-grid">' +
      '<div class="cell"><div class="k">TVL</div><div class="v">' + money(r.tvl_usd) + '</div></div>' +
      '<div class="cell"><div class="k">Category multiple</div><div class="v">' + m.multiple.toFixed(3) + ' <small>' + multNote + '</small></div></div>' +
      '<div class="cell"><div class="k">Growth &times; ' + R.model.growth_weight + '</div><div class="v">' + m.growth_multiplier.toFixed(3) + ' <small>' + (r.change_7d == null ? 'no 7d figure' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</small></div></div>' +
      '<div class="cell"><div class="k">Maturity</div><div class="v">' + m.maturity_multiplier.toFixed(3) + ' <small>' + age(r.age_days) + ' with no token</small></div></div>' +
      '<div class="cell"><div class="k">Breadth</div><div class="v">' + m.breadth_multiplier.toFixed(3) + ' <small>' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</small></div></div>' +
      '<div class="cell"><div class="k">Implied value</div><div class="v val">' + money(r.implied_value_usd) + '</div></div>' +
      '</div>' +
      '<h4>Farm plan — what to do, what it costs, how long it takes</h4>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="hint">A farm plan is a guess at what counts, not a promise of a token. Never pay to claim.</p>';
  }

  // -- live and multiples ------------------------------------------------------
  liveEl.innerHTML = R.live.map(function (p) {
    var ratio = p.tvl_usd > 0 && p.mcap_usd != null ? (p.mcap_usd / p.tvl_usd).toFixed(2) : '—';
    return '<tr><td><strong>' + esc(p.name) + '</strong><br><span class="sub">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num">' + money(p.mcap_usd) + '</td>' +
      '<td class="num">' + ratio + '</td>' +
      '<td class="num">' + pct(p.change_7d) + '</td></tr>';
  }).join('');
  multEl.innerHTML = R.multiples.map(function (m) {
    return '<tr><td>' + esc(m.category) + '</td><td class="num">' + m.comps + '</td>' +
      '<td class="num">' + m.multiple.toFixed(3) + '</td><td>' + (m.source === 'category' ? 'category median' : 'global median') + '</td></tr>';
  }).join('') +
    '<tr><td><strong>Whole market (fallback)</strong></td><td class="num">—</td>' +
    '<td class="num"><strong>' + R.global_multiple.toFixed(3) + '</strong></td><td>global median</td></tr>';

  // -- header ------------------------------------------------------------------
  $('as-of').textContent = R.as_of;
  $('as-of-2').textContent = R.as_of;
  $('model-ver').textContent = R.model_version;
  $('stats').innerHTML = '<b>' + R.board_size + '</b> rows ranked &middot; <b>' + R.watchlist_size +
    '</b> watchlist protocols covered &middot; <b>' + R.early_size + '</b> early finds below the $' +
    (R.floor_usd / 1e6) + 'M floor &middot; <b>' + R.live_size + '</b> live-token protocols set aside &middot; ' +
    R.rows.length + ' of ' + R.snapshot_size + ' protocols in the snapshot';

  // -- events ------------------------------------------------------------------
  $('q').addEventListener('input', function (e) { state.q = e.target.value; writeHash(); renderRows(); });
  $('cat').addEventListener('change', function (e) { state.cat = e.target.value; writeHash(); renderRows(); });
  $('chain').addEventListener('change', function (e) { state.chain = e.target.value; writeHash(); renderRows(); });
  $('wl').addEventListener('change', function (e) { state.wl = e.target.checked; writeHash(); renderRows(); });
  document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; }
      renderRows();
    });
  });
  rowsEl.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    state.detail = state.detail === tr.getAttribute('data-slug') ? null : tr.getAttribute('data-slug');
    writeHash();
    renderRows();
    renderDetail();
    if (state.detail) detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // -- init --------------------------------------------------------------------
  readHash();
  $('q').value = state.q;
  $('cat').value = state.cat;
  $('chain').value = state.chain;
  $('wl').checked = state.wl;
  renderRows();
  renderDetail();
})();
