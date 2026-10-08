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

  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  var form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var st = document.getElementById('status');
      var f = new FormData(form);
      var nom = (f.get('nom') || '').trim();
      var email = (f.get('email') || '').trim();
      if (!nom || !/^\S+@\S+\.\S+$/.test(email)) {
        st.textContent = 'Merci de renseigner votre nom et un e-mail valide.';
        return;
      }
      var body = [
        'Nom : ' + nom,
        'E-mail : ' + email,
        'Téléphone : ' + (f.get('tel') || '-'),
        'Besoin : ' + f.get('besoin'),
        'Ville du logement : ' + (f.get('ville') || '-'),
        '',
        (f.get('message') || '')
      ].join('\n');
      var url = 'mailto:contact@rsconciergerie.fr?subject=' +
        encodeURIComponent('Demande via le site — ' + f.get('besoin')) +
        '&body=' + encodeURIComponent(body);
      st.textContent = 'Ouverture de votre messagerie…';
      window.location.href = url;
    });
  }
})();
