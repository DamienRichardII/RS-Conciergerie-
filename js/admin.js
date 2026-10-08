/* RS Conciergerie — espace admin (Supabase) */
(function () {
  'use strict';

  var cfg = window.RS_SUPABASE;
  var $ = function (id) { return document.getElementById(id); };

  var STATUTS = [
    { key: 'nouveau', label: 'Nouveau' },
    { key: 'contacte', label: 'Contacté' },
    { key: 'rdv', label: 'RDV planifié' },
    { key: 'gagne', label: 'Gagné' },
    { key: 'perdu', label: 'Perdu' }
  ];
  var LABEL = {};
  STATUTS.forEach(function (s) { LABEL[s.key] = s.label; });

  var state = { leads: [], filter: 'all', q: '', besoin: '', current: null, user: null, loaded: false };
  var sb = null;

  /* ---------- utilitaires ---------- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "à l’instant";
    if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h';
    if (s < 86400 * 30) return 'il y a ' + Math.floor(s / 86400) + ' j';
    return fmtDate(iso).split(' · ')[0];
  }
  function toast(msg, err) {
    var t = h('div', { class: 'toast' + (err ? ' err' : ''), text: msg, role: 'status' });
    $('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  }
  function telHref(t) { return 'tel:' + String(t || '').replace(/[^\d+]/g, ''); }

  /* ---------- thème (même réglage que le site) ---------- */
  function applyTheme(dark) {
    var root = document.documentElement;
    if (dark) root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    var tt = $('themeToggle');
    if (tt) {
      tt.setAttribute('aria-pressed', dark ? 'true' : 'false');
      tt.setAttribute('aria-label', dark ? 'Activer le mode jour' : 'Activer le mode nuit');
    }
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '#0a1f33' : '#ffffff');
  }
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark');
  $('themeToggle').addEventListener('click', function () {
    var dark = document.documentElement.getAttribute('data-theme') !== 'dark';
    applyTheme(dark);
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
  });

  /* ---------- démarrage ---------- */
  if (!window.supabase || !cfg) {
    $('login').hidden = false;
    $('loginError').textContent = 'Connexion au serveur impossible. Rechargez la page.';
    return;
  }
  sb = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  sb.auth.getSession().then(function (r) {
    var session = r && r.data && r.data.session;
    if (session) enter(session.user); else showLogin();
  });
  sb.auth.onAuthStateChange(function (ev) {
    if (ev === 'SIGNED_OUT') showLogin();
  });

  function showLogin() {
    state.user = null;
    $('app').hidden = true;
    $('login').hidden = false;
    $('loginPass').value = '';
  }

  function isAdmin(user) {
    return sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle().then(function (r) {
      return !r.error && !!r.data;
    });
  }

  function enter(user) {
    isAdmin(user).then(function (ok) {
      if (!ok) {
        $('loginError').textContent = "Ce compte n’a pas accès à l’espace admin.";
        return sb.auth.signOut();
      }
      state.user = user;
      $('who').textContent = user.email || '';
      $('login').hidden = true;
      $('app').hidden = false;
      renderSkeleton();
      loadLeads();
      subscribe();
    });
  }

  /* ---------- connexion / déconnexion ---------- */
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('loginEmail').value.trim();
    var pass = $('loginPass').value;
    var err = $('loginError');
    err.textContent = '';
    if (!email || !pass) { err.textContent = 'Renseignez votre e-mail et votre mot de passe.'; return; }
    var btn = $('loginBtn');
    btn.disabled = true; btn.textContent = 'Connexion…';
    sb.auth.signInWithPassword({ email: email, password: pass }).then(function (r) {
      if (r.error || !r.data || !r.data.user) {
        err.textContent = 'Identifiants incorrects.';
        return;
      }
      enter(r.data.user);
    }).catch(function () {
      err.textContent = 'Connexion impossible pour le moment.';
    }).then(function () {
      btn.disabled = false; btn.textContent = 'Se connecter';
    });
  });
  $('logoutBtn').addEventListener('click', function () {
    closeDrawer();
    if (state.channel) { sb.removeChannel(state.channel); state.channel = null; }
    sb.auth.signOut();
  });
  $('refreshBtn').addEventListener('click', function () { loadLeads(true); });

  /* ---------- données ---------- */
  function loadLeads(manual) {
    var btn = $('refreshBtn');
    btn.classList.add('spin');
    return sb.from('leads').select('*').order('created_at', { ascending: false }).limit(2000).then(function (r) {
      btn.classList.remove('spin');
      if (r.error) { toast('Chargement impossible : ' + r.error.message, true); return; }
      state.leads = r.data || [];
      state.loaded = true;
      render();
      if (state.current) {
        var cur = state.leads.filter(function (l) { return l.id === state.current.id; })[0];
        if (cur && !$('drawer').classList.contains('open')) state.current = cur;
      }
      if (manual) toast('Données actualisées.');
    });
  }

  function subscribe() {
    if (state.channel) return;
    try {
      state.channel = sb.channel('leads-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, function (p) {
          if (p.eventType === 'INSERT' && p.new) toast('Nouvelle demande : ' + p.new.nom);
          loadLeads();
        })
        .subscribe();
    } catch (e) { /* le temps réel est optionnel */ }
  }

  /* ---------- rendu ---------- */
  function renderSkeleton() {
    var l = $('list'); l.textContent = '';
    for (var i = 0; i < 4; i++) l.appendChild(h('div', { class: 'skeleton' }));
  }

  function counts() {
    var c = { all: state.leads.length };
    STATUTS.forEach(function (s) { c[s.key] = 0; });
    state.leads.forEach(function (l) { c[l.statut] = (c[l.statut] || 0) + 1; });
    return c;
  }

  function render() {
    renderKpis();
    renderCharts();
    renderBesoins();
    renderChips();
    renderList();
    var n = counts().nouveau;
    document.title = (n ? '(' + n + ') ' : '') + 'Espace admin — RS Conciergerie';
  }

  function renderKpis() {
    var c = counts(), now = Date.now();
    var week = state.leads.filter(function (l) { return now - new Date(l.created_at) < 7 * 864e5; }).length;
    var late = state.leads.filter(function (l) { return l.statut === 'nouveau' && now - new Date(l.created_at) > 48 * 36e5; }).length;
    $('kTotal').textContent = c.all;
    $('kNew').textContent = c.nouveau;
    $('kWeek').textContent = week;
    $('kLate').textContent = late;
    $('kConv').textContent = c.all ? Math.round(c.gagne / c.all * 100) + ' %' : '–';
  }

  function renderCharts() {
    // 30 jours
    var days = [], map = {}, i;
    for (i = 29; i >= 0; i--) {
      var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      var k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      map[k] = days.length; days.push({ d: d, n: 0 });
    }
    state.leads.forEach(function (l) {
      var x = new Date(l.created_at);
      var k2 = x.getFullYear() + '-' + (x.getMonth() + 1) + '-' + x.getDate();
      if (map[k2] !== undefined) days[map[k2]].n++;
    });
    var max = Math.max(3, Math.max.apply(null, days.map(function (x) { return x.n; })));
    var W = 600, H = 150, pad = 22, bw = (W - 10) / 30;
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + (H + pad));
    var base = document.createElementNS(NS, 'line');
    base.setAttribute('x1', 0); base.setAttribute('x2', W); base.setAttribute('y1', H); base.setAttribute('y2', H);
    svg.appendChild(base);
    days.forEach(function (x, idx) {
      var bh = x.n ? Math.max(4, x.n / max * (H - 14)) : 0;
      var r = document.createElementNS(NS, 'rect');
      r.setAttribute('class', 'bar');
      r.setAttribute('x', 5 + idx * bw + 2); r.setAttribute('width', bw - 4);
      r.setAttribute('y', H - bh); r.setAttribute('height', bh); r.setAttribute('rx', 3);
      var t = document.createElementNS(NS, 'title');
      t.textContent = x.d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + ' : ' + x.n + ' demande(s)';
      r.appendChild(t); svg.appendChild(r);
      if (x.n) {
        var tx = document.createElementNS(NS, 'text');
        tx.setAttribute('x', 5 + idx * bw + bw / 2); tx.setAttribute('y', H - bh - 4);
        tx.setAttribute('text-anchor', 'middle'); tx.textContent = x.n; svg.appendChild(tx);
      }
    });
    [0, 14, 29].forEach(function (idx) {
      var tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', 5 + idx * bw + bw / 2); tx.setAttribute('y', H + 15);
      tx.setAttribute('text-anchor', idx === 0 ? 'start' : idx === 29 ? 'end' : 'middle');
      tx.textContent = days[idx].d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      svg.appendChild(tx);
    });
    var box = $('chart30'); box.textContent = ''; box.appendChild(svg);

    // répartition
    var c = counts(), total = Math.max(1, c.all);
    var pipe = $('pipe'); pipe.textContent = '';
    var bar = h('div', { class: 'pipe-bar' });
    STATUTS.forEach(function (s) {
      if (c[s.key]) bar.appendChild(h('i', { class: 's-' + s.key, style: 'width:' + (c[s.key] / total * 100) + '%', title: s.label }));
    });
    pipe.appendChild(bar);
    var lg = h('div', { class: 'pipe-legend' });
    STATUTS.forEach(function (s) {
      lg.appendChild(h('div', { class: 's-' + s.key }, [
        h('span', null, [h('i', { class: 'dot' }), s.label]),
        h('b', { text: String(c[s.key]) })
      ]));
    });
    pipe.appendChild(lg);
  }

  function renderBesoins() {
    var sel = $('besoinFilter'), cur = state.besoin, seen = {};
    sel.textContent = '';
    sel.appendChild(h('option', { value: '', text: 'Tous les besoins' }));
    state.leads.forEach(function (l) {
      if (l.besoin && !seen[l.besoin]) { seen[l.besoin] = 1; sel.appendChild(h('option', { value: l.besoin, text: l.besoin })); }
    });
    sel.value = seen[cur] ? cur : '';
    state.besoin = sel.value;
  }

  function renderChips() {
    var c = counts(), box = $('chips'); box.textContent = '';
    [{ key: 'all', label: 'Toutes' }].concat(STATUTS).forEach(function (s) {
      box.appendChild(h('button', {
        class: 'chip-f', type: 'button', role: 'tab',
        'aria-selected': String(state.filter === s.key),
        onclick: function () { state.filter = s.key; renderChips(); renderList(); }
      }, [s.label, h('em', { text: String(c[s.key] || 0) })]));
    });
  }

  function filtered() {
    var q = state.q.toLowerCase();
    return state.leads.filter(function (l) {
      if (state.filter !== 'all' && l.statut !== state.filter) return false;
      if (state.besoin && l.besoin !== state.besoin) return false;
      if (!q) return true;
      return [l.nom, l.email, l.tel, l.ville, l.besoin, l.message, l.notes].some(function (v) {
        return v && String(v).toLowerCase().indexOf(q) !== -1;
      });
    });
  }

  function renderList() {
    var box = $('list'), rows = filtered();
    box.textContent = '';
    if (!state.leads.length) {
      box.appendChild(h('div', { class: 'empty' }, [h('b', { text: 'Aucune demande pour le moment' }), 'Les messages envoyés depuis le formulaire du site apparaîtront ici.']));
      return;
    }
    if (!rows.length) {
      box.appendChild(h('div', { class: 'empty' }, [h('b', { text: 'Aucun résultat' }), 'Modifiez la recherche ou les filtres.']));
      return;
    }
    rows.forEach(function (l, i) {
      var row = h('div', {
        class: 'lead' + (l.statut === 'nouveau' ? ' is-new' : ''),
        tabindex: '0', role: 'button', 'aria-label': 'Ouvrir la demande de ' + l.nom,
        style: 'animation-delay:' + Math.min(i, 12) * 30 + 'ms',
        onclick: function () { openDrawer(l.id); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(l.id); } }
      }, [
        h('div', { class: 'l-date' }, [ago(l.created_at), h('br'), fmtDate(l.created_at).split(' · ')[0]]),
        h('div', { class: 'l-who' }, [h('b', { text: l.nom }), h('span', { text: l.email }), l.tel ? h('span', { text: l.tel }) : null]),
        h('div', { class: 'l-need' }, [l.besoin || '—', h('small', { text: l.ville || '' })]),
        h('div', { class: 'l-st' }, [h('span', { class: 'badge s-' + l.statut, text: LABEL[l.statut] || l.statut })]),
        h('div', { class: 'l-open', text: 'Ouvrir →' })
      ]);
      box.appendChild(row);
    });
  }

  $('q').addEventListener('input', function (e) { state.q = e.target.value.trim(); renderList(); });
  $('besoinFilter').addEventListener('change', function (e) { state.besoin = e.target.value; renderList(); });

  /* ---------- panneau détail ---------- */
  function byId(id) { return state.leads.filter(function (l) { return l.id === id; })[0]; }

  function openDrawer(id) {
    var l = byId(id); if (!l) return;
    state.current = l;
    $('dName').textContent = l.nom;
    $('dDate').textContent = 'Reçue le ' + fmtDate(l.created_at) + ' (' + ago(l.created_at) + ')';
    var info = $('dInfo'); info.textContent = '';
    function row(k, v) { info.appendChild(h('div', null, [h('dt', { text: k }), h('dd', null, [v])])); }
    row('E-mail', h('a', { href: 'mailto:' + l.email, text: l.email }));
    row('Téléphone', l.tel ? h('a', { href: telHref(l.tel), text: l.tel }) : '—');
    row('Besoin', l.besoin || '—');
    row('Ville', l.ville || '—');
    row('Source', l.source || 'site');
    $('dMsg').textContent = l.message || 'Aucun message.';
    $('dNotes').value = l.notes || '';
    $('dSaved').textContent = '';
    renderSeg();
    var call = $('dCall');
    if (l.tel) { call.href = telHref(l.tel); call.hidden = false; } else { call.hidden = true; }
    $('dMail').href = 'mailto:' + l.email + '?subject=' + encodeURIComponent('Votre demande — RS Conciergerie') +
      '&body=' + encodeURIComponent('Bonjour ' + l.nom + ',\n\nMerci pour votre message. ');
    $('scrim').hidden = false;
    var d = $('drawer'); d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $('dClose').focus();
  }

  function closeDrawer() {
    var d = $('drawer'); d.classList.remove('open'); d.setAttribute('aria-hidden', 'true');
    $('scrim').hidden = true;
    document.body.style.overflow = '';
  }
  $('dClose').addEventListener('click', closeDrawer);
  $('scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

  function renderSeg() {
    var box = $('dStatus'); box.textContent = '';
    STATUTS.forEach(function (s) {
      box.appendChild(h('button', {
        type: 'button', class: 's-' + s.key, text: s.label,
        'aria-pressed': String(state.current.statut === s.key),
        onclick: function () { setStatus(s.key); }
      }));
    });
  }

  function patch(id, fields) {
    return sb.from('leads').update(fields).eq('id', id).select().single().then(function (r) {
      if (r.error) throw r.error;
      var i = state.leads.findIndex(function (x) { return x.id === id; });
      if (i > -1) state.leads[i] = r.data;
      if (state.current && state.current.id === id) state.current = r.data;
      return r.data;
    });
  }

  function setStatus(key) {
    var l = state.current; if (!l || l.statut === key) return;
    patch(l.id, { statut: key }).then(function () {
      renderSeg(); render(); toast('Statut : ' + LABEL[key]);
    }).catch(function (e) { toast('Échec de la mise à jour : ' + e.message, true); });
  }

  $('dSave').addEventListener('click', function () {
    var l = state.current; if (!l) return;
    var btn = $('dSave'); btn.disabled = true;
    var v = $('dNotes').value.trim();
    patch(l.id, { notes: v || null }).then(function () {
      $('dSaved').textContent = 'Notes enregistrées ✓';
      render();
    }).catch(function (e) { toast('Échec de l’enregistrement : ' + e.message, true); })
      .then(function () { btn.disabled = false; });
  });

  $('dDelete').addEventListener('click', function () {
    var l = state.current; if (!l) return;
    if (!window.confirm('Supprimer définitivement la demande de ' + l.nom + ' ?')) return;
    sb.from('leads').delete().eq('id', l.id).then(function (r) {
      if (r.error) { toast('Suppression impossible : ' + r.error.message, true); return; }
      state.leads = state.leads.filter(function (x) { return x.id !== l.id; });
      state.current = null; closeDrawer(); render(); toast('Demande supprimée.');
    });
  });

  /* ---------- export CSV ---------- */
  function csvCell(v) {
    v = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; // évite l'injection de formules Excel
    return '"' + v.replace(/"/g, '""') + '"';
  }
  $('exportBtn').addEventListener('click', function () {
    var rows = filtered();
    if (!rows.length) { toast('Rien à exporter.', true); return; }
    var head = ['Date', 'Nom', 'E-mail', 'Téléphone', 'Besoin', 'Ville', 'Statut', 'Message', 'Notes'];
    var lines = [head.map(csvCell).join(';')];
    rows.forEach(function (l) {
      lines.push([fmtDate(l.created_at), l.nom, l.email, l.tel, l.besoin, l.ville, LABEL[l.statut], l.message, l.notes].map(csvCell).join(';'));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = h('a', { href: URL.createObjectURL(blob), download: 'demandes-rs-conciergerie-' + new Date().toISOString().slice(0, 10) + '.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    toast(rows.length + ' demande(s) exportée(s).');
  });
})();
