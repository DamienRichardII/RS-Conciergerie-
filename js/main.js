(function () {
  var header = document.getElementById('header');
  var bar = document.getElementById('bar');
  var burger = document.getElementById('burger');
  var menu = document.getElementById('menu');

  function onScroll() {
    var y = window.scrollY || 0;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (header) header.classList.toggle('scrolled', y > 24);
    if (bar && h > 0) bar.style.width = (y / h * 100) + '%';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function setMenu(open) {
    menu.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  if (burger && menu) {
    burger.addEventListener('click', function () { setMenu(!menu.classList.contains('open')); });
    menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  }

  var items = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  var tt = document.getElementById('themeToggle');
  function applyTheme(dark) {
    var root = document.documentElement;
    if (dark) root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    if (tt) {
      tt.setAttribute('aria-pressed', dark ? 'true' : 'false');
      tt.setAttribute('aria-label', dark ? 'Activer le mode jour' : 'Activer le mode nuit');
    }
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '#0a1f33' : '#ffffff');
  }
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark');
  if (tt) tt.addEventListener('click', function () {
    var dark = document.documentElement.getAttribute('data-theme') !== 'dark';
    applyTheme(dark);
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
  });

  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  var form = document.getElementById('contactForm');
  if (form) {
    var cfg = window.RS_SUPABASE;
    var submitBtn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var st = document.getElementById('status');
      var f = new FormData(form);
      if (f.get('website')) { return; } // anti-spam (champ piège)
      var nom = (f.get('nom') || '').trim();
      var email = (f.get('email') || '').trim();
      if (nom.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) {
        st.textContent = 'Merci de renseigner votre nom et un e-mail valide.';
        return;
      }
      function clean(v) { v = (v || '').toString().trim(); return v ? v : null; }
      var payload = {
        nom: nom,
        email: email,
        tel: clean(f.get('tel')),
        besoin: clean(f.get('besoin')),
        ville: clean(f.get('ville')),
        message: clean(f.get('message')),
        source: 'site'
      };
      function viaMail() {
        var body = [
          'Nom : ' + nom,
          'E-mail : ' + email,
          'Téléphone : ' + (payload.tel || '-'),
          'Besoin : ' + (payload.besoin || '-'),
          'Ville du logement : ' + (payload.ville || '-'),
          '',
          payload.message || ''
        ].join('\n');
        window.location.href = 'mailto:contact@rsconciergerie.fr?subject=' +
          encodeURIComponent('Demande via le site — ' + (payload.besoin || 'Contact')) +
          '&body=' + encodeURIComponent(body);
      }
      if (!cfg || !cfg.url || !cfg.key) { viaMail(); return; }
      if (submitBtn) submitBtn.disabled = true;
      st.textContent = 'Envoi en cours…';
      fetch(cfg.url + '/rest/v1/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': cfg.key, 'Prefer': 'return=minimal' },
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        st.textContent = 'Merci ! Votre demande a bien été envoyée. Nous revenons vers vous rapidement.';
        form.reset();
      }).catch(function () {
        st.textContent = 'Envoi impossible pour le moment : ouverture de votre messagerie…';
        viaMail();
      }).then(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
    });
  }
})();
