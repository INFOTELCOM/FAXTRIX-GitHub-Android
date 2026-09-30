/* =============================================================
   FAXTRIX — interactions
   ============================================================= */
(function () {
"use strict";

var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var fine = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
var $ = function (s, c) { return (c || document).querySelector(s); };
var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
var lerp = function (a, b, t) { return a + (b - a) * t; };
var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

/* ---------------- 1. Séquence de démarrage ---------------- */
(function boot() {
  var loader = $('#loader'), fill = $('#loaderFill'), pct = $('#loaderPct');
  var p = 0, done = false;

  function finish() {
    if (done) return;
    done = true;
    loader.classList.add('done');
    document.body.classList.remove('locked');
    $$('.hero-title .w').forEach(function (w, i) {
      w.style.transition = 'transform 1s cubic-bezier(.16,1,.3,1) ' + (i * 0.07) + 's';
      w.style.transform = 'none';
    });
    $$('[data-boot]').forEach(function (el) {
      var d = parseInt(el.getAttribute('data-boot'), 10) * 0.13;
      el.style.transition = 'opacity .9s cubic-bezier(.16,1,.3,1) ' + d + 's, transform .9s cubic-bezier(.16,1,.3,1) ' + d + 's';
      el.style.opacity = 1;
      el.style.transform = 'none';
    });
  }

  $$('[data-boot]').forEach(function (el) { el.style.opacity = 0; el.style.transform = 'translateY(18px)'; });
  document.body.classList.add('locked');

  if (reduced) { if (fill) fill.style.width = '100%'; setTimeout(finish, 120); return; }

  var tick = setInterval(function () {
    p += Math.random() * 14 + 4;
    if (p >= 100) { p = 100; clearInterval(tick); setTimeout(finish, 320); }
    fill.style.width = p + '%';
    pct.textContent = Math.round(p) + '%';
  }, 110);
  setTimeout(function () { clearInterval(tick); fill.style.width = '100%'; finish(); }, 4200);
})();

/* ---------------- 2. Curseur ---------------- */
if (fine && !reduced) {
  var cur = $('#cursor'), dot = cur.firstElementChild;
  var cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
  addEventListener('mousemove', function (e) { tx = e.clientX; ty = e.clientY; cur.classList.add('ready'); }, { passive: true });
  (function loop() {
    cx = lerp(cx, tx, 0.18); cy = lerp(cy, ty, 0.18);
    dot.style.transform = 'translate(' + cx + 'px,' + cy + 'px)' + (cur.classList.contains('hot') ? ' scale(1.9)' : '');
    requestAnimationFrame(loop);
  })();
  document.addEventListener('mouseover', function (e) {
    var t = e.target.closest('a,button,.slide,.shot,.i-card,[data-magnet]');
    cur.classList.toggle('hot', !!t);
  });
}

/* ---------------- 3. Boutons magnétiques ---------------- */
if (fine && !reduced) {
  $$('[data-magnet]').forEach(function (el) {
    el.addEventListener('mousemove', function (e) {
      var r = el.getBoundingClientRect();
      var mx = (e.clientX - r.left - r.width / 2) * 0.22;
      var my = (e.clientY - r.top - r.height / 2) * 0.32;
      el.style.transform = 'translate(' + mx + 'px,' + my + 'px)';
    });
    el.addEventListener('mouseleave', function () { el.style.transform = ''; });
  });
}

/* ---------------- 4. Header, progression, nav ---------------- */
var header = $('#header'), prog = $('#scrollProgress');
var navA = $$('[data-nav]');
var navSecs = navA.map(function (a) { return $(a.getAttribute('href')); });

function onScroll() {
  var st = scrollY || document.documentElement.scrollTop;
  var h = document.documentElement.scrollHeight - innerHeight;
  prog.style.width = (h > 0 ? (st / h) * 100 : 0) + '%';
  header.classList.toggle('solid', st > 40);

  var mid = st + innerHeight * 0.35, cur = -1;
  navSecs.forEach(function (s, i) { if (s && s.offsetTop <= mid) cur = i; });
  navA.forEach(function (a, i) { a.classList.toggle('on', i === cur); });

  updateRail();
  parallax(st);
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', function () { railMetrics(); onScroll(); }, { passive: true });

/* ---------------- 5. Menu mobile ---------------- */
var burger = $('#burger'), navlinks = $('#navlinks');
burger.addEventListener('click', function () {
  burger.classList.toggle('x');
  navlinks.classList.toggle('open');
});
navA.forEach(function (a) {
  a.addEventListener('click', function () { burger.classList.remove('x'); navlinks.classList.remove('open'); });
});

/* ---------------- 6. Reveal ---------------- */
var io = new IntersectionObserver(function (es) {
  es.forEach(function (e) {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  });
}, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
$$('.reveal').forEach(function (el) { io.observe(el); });

/* ---------------- 7. Parallaxe douce ---------------- */
var pxEls = $$('.sec-bg');
function parallax(st) {
  if (reduced) return;
  pxEls.forEach(function (el) {
    var r = el.parentElement.getBoundingClientRect();
    var p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
    el.style.transform = 'translateY(' + (p * -50) + 'px) scale(1.12)';
  });
  var mark = $('#heroMark');
  if (mark && st < innerHeight * 1.4) mark.style.transform = 'translateY(' + (st * 0.14) + 'px)';
}

/* Parallaxe souris du hero */
if (fine && !reduced) {
  var mark = $('#heroMark');
  addEventListener('mousemove', function (e) {
    var x = (e.clientX / innerWidth - 0.5), y = (e.clientY / innerHeight - 0.5);
    if (mark) mark.style.marginLeft = (x * 26) + 'px', mark.style.marginTop = (y * 20) + 'px';
  }, { passive: true });
}

/* ---------------- 8. Rail horizontal (parcours) ---------------- */
var rail = $('#parcours'), railTrack = $('#railTrack'), railFill = $('#railFill');
var railDist = 0, railOn = false;

function railMetrics() {
  railOn = innerWidth > 860 && !!rail;
  if (!railOn) { railTrack.style.transform = ''; rail.style.height = ''; return; }
  var pad = Math.max(34, (innerWidth - 1280) / 2 + 34);
  railDist = Math.max(0, railTrack.scrollWidth - innerWidth + pad);
  rail.style.height = (railDist * 1.15 + innerHeight) + 'px';
}
function updateRail() {
  if (!railOn) return;
  var r = rail.getBoundingClientRect();
  var total = rail.offsetHeight - innerHeight;
  var p = clamp(-r.top / total, 0, 1);
  railTrack.style.transform = 'translate3d(' + (-p * railDist) + 'px,0,0)';
  railFill.style.width = (p * 100) + '%';
}
railMetrics();

/* ---------------- 9. Carrousel ---------------- */
(function carousel() {
  var wrap = $('#carousel'), track = $('#carTrack'), dotsBox = $('#galDots');
  if (!wrap) return;
  var slides = $$('.slide', track);
  var pos = 0, target = 0, max = 0, index = 0;
  var dragging = false, startX = 0, startPos = 0, velocity = 0, lastX = 0;

  function metrics() {
    var pad = Math.max(34, (innerWidth - 1280) / 2 + 34);
    max = Math.max(0, track.scrollWidth - innerWidth + pad);
    target = clamp(target, -max, 0);
  }
  function slideX(i) {
    var s = slides[i];
    var pad = Math.max(34, (innerWidth - 1280) / 2 + 34);
    return -clamp(s.offsetLeft - pad, 0, max);
  }
  function goTo(i) { index = clamp(i, 0, slides.length - 1); target = slideX(index); syncDots(); }
  function nearest() {
    var best = 0, d = Infinity;
    slides.forEach(function (s, i) { var dd = Math.abs(slideX(i) - target); if (dd < d) { d = dd; best = i; } });
    return best;
  }
  function syncDots() {
    $$('button', dotsBox).forEach(function (b, i) { b.classList.toggle('on', i === index); });
  }

  slides.forEach(function (s, i) {
    var b = document.createElement('button');
    b.setAttribute('aria-label', 'Écran ' + (i + 1));
    b.addEventListener('click', function () { goTo(i); });
    dotsBox.appendChild(b);
  });

  $('#galNext').addEventListener('click', function () { goTo(index + 1); });
  $('#galPrev').addEventListener('click', function () { goTo(index - 1); });

  function down(x) { dragging = true; startX = x; lastX = x; startPos = target; wrap.classList.add('dragging'); }
  function move(x) {
    if (!dragging) return;
    target = clamp(startPos + (x - startX), -max, 0);
    velocity = x - lastX; lastX = x;
  }
  function up() {
    if (!dragging) return;
    dragging = false; wrap.classList.remove('dragging');
    target = clamp(target + velocity * 6, -max, 0);
    index = nearest(); target = slideX(index); syncDots();
    velocity = 0;
  }
  wrap.addEventListener('mousedown', function (e) { e.preventDefault(); down(e.clientX); });
  addEventListener('mousemove', function (e) { move(e.clientX); });
  addEventListener('mouseup', up);
  wrap.addEventListener('touchstart', function (e) { down(e.touches[0].clientX); }, { passive: true });
  wrap.addEventListener('touchmove', function (e) { move(e.touches[0].clientX); }, { passive: true });
  wrap.addEventListener('touchend', up);

  wrap.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') goTo(index + 1);
    if (e.key === 'ArrowLeft') goTo(index - 1);
  });
  wrap.tabIndex = 0;

  /* clic -> lightbox (uniquement si pas de glissement) */
  slides.forEach(function (s) {
    s.addEventListener('click', function () {
      if (Math.abs(target - startPos) > 6) return;
      openLb(s.getAttribute('data-img'), s.getAttribute('data-title'));
    });
  });

  metrics();
  addEventListener('resize', function () { metrics(); target = slideX(index); }, { passive: true });
  (function loop() {
    pos = lerp(pos, target, reduced ? 1 : 0.11);
    track.style.transform = 'translate3d(' + pos + 'px,0,0)';
    requestAnimationFrame(loop);
  })();
  syncDots();
})();

/* ---------------- 10. Lightbox ---------------- */
var lb = $('#lightbox'), lbImg = $('#lbImg'), lbCap = $('#lbCap');
function openLb(src, cap) {
  if (!src) return;
  lbImg.src = src; lbCap.textContent = cap || '';
  lb.classList.add('on'); lb.setAttribute('aria-hidden', 'false');
}
function closeLb() { lb.classList.remove('on'); lb.setAttribute('aria-hidden', 'true'); }
$('#lbClose').addEventListener('click', closeLb);
lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });
addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLb(); });
$$('.shot').forEach(function (f) {
  f.addEventListener('click', function () {
    openLb(f.querySelector('img').getAttribute('src'), f.querySelector('figcaption').textContent);
  });
});

/* ---------------- 11. Mobile terrain ---------------- */
(function fsm() {
  var states = $$('.pstate'), btns = $$('#fsmDots button');
  if (!states.length) return;
  var i = 0, timer;
  function show(n) {
    i = n % states.length;
    states.forEach(function (s, k) { s.classList.toggle('on', k === i); });
    btns.forEach(function (b, k) { b.classList.toggle('on', k === i); });
  }
  function auto() { clearInterval(timer); if (!reduced) timer = setInterval(function () { show(i + 1); }, 3800); }
  btns.forEach(function (b, k) { b.addEventListener('click', function () { show(k); auto(); }); });
  new IntersectionObserver(function (es) {
    es.forEach(function (e) { e.isIntersecting ? auto() : clearInterval(timer); });
  }, { threshold: 0.3 }).observe($('#phone'));
})();

/* ---------------- 12. Démo à onglets ---------------- */
(function demo() {
  var tabs = $$('#demoTabs button'), ink = $('#tabInk'), crumb = $('#demoCrumb');
  var panels = $$('.panel');
  function moveInk(btn) { ink.style.width = btn.offsetWidth + 'px'; ink.style.transform = 'translateX(' + btn.offsetLeft + 'px)'; }
  function activate(name) {
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.classList.toggle('on', on);
      if (on) { moveInk(t); crumb.textContent = name; }
    });
    panels.forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-panel') === name); });
    countUp($('.panel.on'));
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { activate(t.getAttribute('data-tab')); }); });
  addEventListener('resize', function () { var on = $('#demoTabs button.on'); if (on) moveInk(on); }, { passive: true });
  setTimeout(function () { moveInk(tabs[0]); }, 200);

  /* horloge */
  setInterval(function () {
    var d = new Date();
    $('#demoClock').textContent = String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
  }, 1000);

  /* flux simulé */
  var lines = {
    crm: ['Nouvelle opportunité — Cedar Corp', 'Devis #2210 envoyé à Nova Industrie', 'Relance programmée — Atlas Distribution',
          'Contrat signé — GroupeLevant', 'Appel enregistré — ABC Réseaux', 'Étape mise à jour : Négociation'],
    tickets: ['Ticket #4823 ouvert — priorité haute', 'SLA à 30 min — ticket #4818', 'Escalade automatique — #4809',
              'Ticket #4812 résolu en 2 h 04', 'Nouveau commentaire client — #4821', 'Technicien assigné — #4823'],
    terrain: ['Équipe A — prestation démarrée', 'Rapport #4812-R signé par le client', 'Équipe B en route — 14 min',
              'Photo ajoutée à l\'intervention #4821', 'Équipe C — surcharge détectée', 'Mission clôturée — Nova Industrie'],
    ia: ['Signal faible détecté — client ABC', 'Process mining : 2 étapes cachées', 'Charge équipe C au-dessus du seuil',
         'Simulation lancée — +2 techniciens', 'Accès inhabituel signalé — export massif', 'Action prioritaire recalculée']
  };
  Object.keys(lines).forEach(function (k) {
    var box = $('[data-feed="' + k + '"]'); var n = 0;
    function push() {
      var p = document.createElement('p');
      var d = new Date();
      p.innerHTML = '<b>' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + '</b> ' + lines[k][n % lines[k].length];
      box.insertBefore(p, box.firstChild);
      while (box.children.length > 7) box.removeChild(box.lastChild);
      n++;
    }
    push(); push(); push();
    if (!reduced) setInterval(push, 3200 + Math.random() * 1600);
  });

  activate('crm');
})();

/* ---------------- 13. Compteurs ---------------- */
function countUp(scope) {
  if (!scope) return;
  $$('[data-count]', scope).forEach(function (el) {
    var to = parseFloat(el.getAttribute('data-count'));
    var sfx = el.getAttribute('data-suffix') || '';
    if (reduced) { el.textContent = to + sfx; return; }
    var t0 = performance.now(), dur = 1100;
    (function step(t) {
      var p = clamp((t - t0) / dur, 0, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * e) + sfx;
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  });
}

/* ---------------- 14. Tilt 3D ---------------- */
if (fine && !reduced) {
  $$('[data-tilt]').forEach(function (el) {
    el.addEventListener('mousemove', function (e) {
      var r = el.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = 'perspective(900px) rotateY(' + (x * 7) + 'deg) rotateX(' + (-y * 7) + 'deg) translateZ(6px)';
    });
    el.addEventListener('mouseleave', function () { el.style.transform = ''; });
  });
}

/* ---------------- 15. Diagramme : impulsions ---------------- */
(function diagram() {
  var g = $('#diagPulses'), paths = $$('#diagLines path');
  if (!g || reduced) return;
  paths.forEach(function (p, i) {
    var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('r', '3.2'); c.setAttribute('class', 'pulse-o');
    var m = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
    m.setAttribute('dur', (2.6 + i * 0.35) + 's');
    m.setAttribute('repeatCount', 'indefinite');
    m.setAttribute('path', p.getAttribute('d'));
    m.setAttribute('begin', (i * 0.42) + 's');
    c.appendChild(m); g.appendChild(c);
  });
})();

/* ---------------- 16. Minuteur du hero ---------------- */
(function timer() {
  var el = $('#heroTimer'); if (!el || reduced) return;
  var s = 1 * 3600 + 42 * 60 + 8;
  setInterval(function () {
    s++;
    el.textContent = String(Math.floor(s / 3600)).padStart(2, '0') + ':' +
      String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }, 1000);
})();

/* ---------------- 17. Fond de particules ---------------- */
(function bg() {
  var cv = $('#bg-canvas'); if (!cv || reduced) return;
  var ctx = cv.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 2);
  var pts = [], mx = -999, my = -999;
  function size() {
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.min(90, Math.round(innerWidth / 16));
    pts = [];
    for (var i = 0; i < n; i++) pts.push({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
      r: Math.random() * 1.3 + 0.4
    });
  }
  size(); addEventListener('resize', size, { passive: true });
  addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });

  (function draw() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = innerWidth; if (p.x > innerWidth) p.x = 0;
      if (p.y < 0) p.y = innerHeight; if (p.y > innerHeight) p.y = 0;
      var dx = p.x - mx, dy = p.y - my, d = Math.sqrt(dx * dx + dy * dy);
      var near = d < 190;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.fillStyle = near ? 'rgba(255,138,31,' + (0.75 - d / 380) + ')' : 'rgba(255,180,92,.28)';
      ctx.fill();
      if (near) {
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mx, my);
        ctx.strokeStyle = 'rgba(255,122,0,' + (0.18 - d / 1900) + ')';
        ctx.lineWidth = 0.7; ctx.stroke();
      }
    }
    requestAnimationFrame(draw);
  })();
})();

/* ---------------- 18. Noyau 3D du hero ---------------- */
(function core3d() {
  var cv = $('#hero-canvas');
  if (!cv || typeof THREE === 'undefined' || reduced) return;
  var w = innerWidth, h = innerHeight;
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h);

  var scene = new THREE.Scene();
  var cam = new THREE.PerspectiveCamera(48, w / h, 0.1, 100);
  cam.position.z = 8.4;

  var group = new THREE.Group();
  scene.add(group);

  /* coque filaire */
  var geo = new THREE.IcosahedronGeometry(2.5, 1);
  var wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0xffb45c, transparent: true, opacity: 0.32 })
  );
  group.add(wire);

  /* sommets */
  var dots = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffe3c2, size: 0.075, transparent: true, opacity: 0.9 }));
  group.add(dots);

  /* anneaux orbitaux */
  var rings = [];
  [[3.6, 0.012, 0.45, 0xff7a00], [4.4, 0.008, -0.8, 0xffb45c], [5.3, 0.006, 1.25, 0x55c8f5]].forEach(function (c) {
    var t = new THREE.Mesh(
      new THREE.TorusGeometry(c[0], c[1], 8, 160),
      new THREE.MeshBasicMaterial({ color: c[3], transparent: true, opacity: 0.55 })
    );
    t.rotation.x = Math.PI / 2 + c[2];
    t.rotation.y = c[2] * 0.6;
    scene.add(t); rings.push(t);
  });

  /* champ d'étoiles */
  var starGeo = new THREE.BufferGeometry();
  var n = 900, arr = new Float32Array(n * 3);
  for (var i = 0; i < n; i++) {
    var r = 12 + Math.random() * 22, a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1);
    arr[i * 3] = r * Math.sin(b) * Math.cos(a);
    arr[i * 3 + 1] = r * Math.sin(b) * Math.sin(a);
    arr[i * 3 + 2] = r * Math.cos(b) - 10;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdff7ff, size: 0.055, transparent: true, opacity: 0.6 })));

  var tmx = 0, tmy = 0, cmx = 0, cmy = 0;
  addEventListener('mousemove', function (e) {
    tmx = (e.clientX / innerWidth - 0.5); tmy = (e.clientY / innerHeight - 0.5);
  }, { passive: true });
  addEventListener('resize', function () {
    w = innerWidth; h = innerHeight;
    cam.aspect = w / h; cam.updateProjectionMatrix(); renderer.setSize(w, h);
  }, { passive: true });

  var visible = true;
  new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }, { threshold: 0 }).observe($('#hero'));

  (function render(t) {
    requestAnimationFrame(render);
    if (!visible) return;
    var s = (scrollY || 0) * 0.0012;
    cmx = lerp(cmx, tmx, 0.05); cmy = lerp(cmy, tmy, 0.05);
    group.rotation.y = t * 0.00013 + cmx * 0.6;
    group.rotation.x = Math.sin(t * 0.0002) * 0.18 + cmy * 0.4 + s;
    rings.forEach(function (r, i) {
      r.rotation.z += 0.0011 * (i + 1);
      r.rotation.y = Math.sin(t * 0.00018 + i) * 0.35 + cmx * 0.3;
    });
    cam.position.x = lerp(cam.position.x, cmx * 1.1, 0.06);
    cam.position.y = lerp(cam.position.y, -cmy * 0.8, 0.06);
    cam.lookAt(0, 0, 0);
    renderer.render(scene, cam);
  })(0);
})();

/* ---------------- 19. Méga-menu ---------------- */
(function megaMenu() {
  var btn = $('#megaBtn'), mega = $('#mega');
  if (!btn || !mega) return;
  /* sur mobile le panneau vit dans le menu déroulant, sur grand écran sous le header */
  var navItem = btn.parentElement, mq = matchMedia('(max-width:860px)');
  function place() {
    var parent = mq.matches ? navItem : document.body;
    if (mega.parentElement !== parent) parent.appendChild(mega);
  }
  place();
  (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(place);
  var open = false, t;
  function set(v) {
    open = v;
    mega.classList.toggle('on', v);
    btn.classList.toggle('on', v);
    btn.setAttribute('aria-expanded', v);
    mega.setAttribute('aria-hidden', !v);
  }
  var lastHover = 0;
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (Date.now() - lastHover < 500) return;   /* déjà ouvert au survol */
    set(!open);
  });
  if (fine) {
    btn.addEventListener('mouseenter', function () { clearTimeout(t); lastHover = Date.now(); set(true); });
    [btn, mega].forEach(function (el) {
      el.addEventListener('mouseleave', function () { t = setTimeout(function () { set(false); }, 260); });
      el.addEventListener('mouseenter', function () { clearTimeout(t); });
    });
  }
  document.addEventListener('click', function (e) {
    if (open && !mega.contains(e.target) && e.target !== btn) set(false);
  });
  addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  $$('a', mega).forEach(function (a) {
    a.addEventListener('click', function () { set(false); burger.classList.remove('x'); navlinks.classList.remove('open'); });
  });
})();

/* ---------------- 20. Palette de commandes ---------------- */
(function palette() {
  var box = $('#cmdk'), input = $('#cmdkInput'), list = $('#cmdkList'), btn = $('#cmdkBtn');
  if (!box) return;
  var items = [
    { t: 'Plateforme', d: 'Les briques du quotidien', h: '#plateforme', k: 'K' },
    { t: 'Parcours', d: 'Du prospect à l\'intervention', h: '#parcours', k: 'P' },
    { t: 'Field service', d: 'La mission sur le terrain', h: '#terrain', k: 'T' },
    { t: 'Galerie', d: 'La plateforme écran par écran', h: '#galerie', k: 'G' },
    { t: 'Démo interactive', d: 'CRM, tickets, terrain, intelligence', h: '#demo', k: 'D' },
    { t: 'Intelligence', d: 'Les six modules de niveau 3', h: '#intelligence', k: 'I' },
    { t: 'Sécurité', d: 'Cloisonnement et journal d\'accès', h: '#securite', k: 'S' },
    { t: 'Tarifs', d: 'Essentiel, Opérations, Intelligence', h: '#tarifs', k: '€' },
    { t: 'Témoignages', d: 'Ce que change une seule plateforme', h: '#temoignages', k: '“' },
    { t: 'FAQ', d: 'Les questions avant de signer', h: '#faq', k: '?' },
    { t: 'Business Brain', d: 'L\'état réel de l\'entreprise', h: '#intelligence', k: 'B' },
    { t: 'Early Warning', d: 'Les signaux faibles', h: '#intelligence', k: 'E' },
    { t: 'Process Mining', d: 'Le processus réel', h: '#intelligence', k: 'M' },
    { t: 'Decision Simulator', d: 'Tester avant de trancher', h: '#intelligence', k: 'X' },
    { t: 'Automatisations', d: 'Règles et escalades sans code', h: '#plateforme', k: 'A' },
    { t: 'Demander une démo', d: 'Parler à l\'équipe INFOTELCOM', h: '#cta', k: '→' }
  ];
  var sel = 0, shown = items.slice();

  function norm(v) { return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function render() {
    list.innerHTML = '';
    if (!shown.length) { list.innerHTML = '<div class="cmdk-empty">Aucun résultat. L\'équipe répond directement depuis la page contact.</div>'; return; }
    shown.forEach(function (it, i) {
      var b = document.createElement('button');
      b.className = 'cmdk-item' + (i === sel ? ' sel' : '');
      b.innerHTML = '<em>' + it.k + '</em><b>' + it.t + '</b><span>' + it.d + '</span>';
      b.addEventListener('click', function () { go(it); });
      b.addEventListener('mousemove', function () { sel = i; paint(); });
      list.appendChild(b);
    });
  }
  function paint() { $$('.cmdk-item', list).forEach(function (b, i) { b.classList.toggle('sel', i === sel); }); }
  function go(it) { close(); var el = $(it.h); if (el) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); }
  function open() { box.classList.add('on'); box.setAttribute('aria-hidden', 'false'); input.value = ''; shown = items.slice(); sel = 0; render(); setTimeout(function () { input.focus(); }, 60); }
  function close() { box.classList.remove('on'); box.setAttribute('aria-hidden', 'true'); }

  btn.addEventListener('click', open);
  box.addEventListener('click', function (e) { if (e.target === box) close(); });
  input.addEventListener('input', function () {
    var q = norm(input.value.trim());
    shown = q ? items.filter(function (i) { return norm(i.t + ' ' + i.d).indexOf(q) > -1; }) : items.slice();
    sel = 0; render();
  });
  addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); box.classList.contains('on') ? close() : open(); return; }
    if (!box.classList.contains('on')) return;
    if (e.key === 'Escape') { close(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); paint(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); }
    if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); go(shown[sel]); }
  });
})();

/* ---------------- 21. Dock latéral + retour haut ---------------- */
(function dock() {
  var d = $('#dock'), top = $('#toTop');
  var map = [['#hero', 'Accueil'], ['#plateforme', 'Plateforme'], ['#parcours', 'Parcours'], ['#terrain', 'Terrain'],
             ['#galerie', 'Galerie'], ['#demo', 'Démo'], ['#intelligence', 'Intelligence'], ['#securite', 'Sécurité'],
             ['#tarifs', 'Tarifs'], ['#temoignages', 'Témoignages'], ['#faq', 'FAQ'], ['#cta', 'Contact']];
  var els = [];
  map.forEach(function (m) {
    var target = $(m[0]); if (!target) return;
    var b = document.createElement('button');
    b.innerHTML = '<span>' + m[1] + '</span>';
    b.setAttribute('aria-label', m[1]);
    b.addEventListener('click', function () { target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); });
    d.appendChild(b); els.push({ b: b, el: target });
  });
  top.addEventListener('click', function () { scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); });
  addEventListener('scroll', function () {
    var st = scrollY, mid = st + innerHeight * 0.4, cur = 0;
    els.forEach(function (o, i) { if (o.el.offsetTop <= mid) cur = i; });
    els.forEach(function (o, i) { o.b.classList.toggle('on', i === cur); });
    d.classList.toggle('on', st > innerHeight * 0.6);
    top.classList.toggle('on', st > innerHeight * 1.5);
  }, { passive: true });
})();

/* ---------------- 22. Compteurs hors démo ---------------- */
new IntersectionObserver(function (es, obs) {
  es.forEach(function (e) { if (e.isIntersecting) { countUp(e.target); obs.unobserve(e.target); } });
}, { threshold: 0.3 }).observe($('.count-band'));

/* ---------------- 23. Tarifs : mensuel / annuel ---------------- */
(function billing() {
  var box = $('.billing'); if (!box) return;
  var btns = $$('button', box), ink = $('#billingInk');
  function move(b) { ink.style.width = b.offsetWidth + 'px'; ink.style.transform = 'translateX(' + (b.offsetLeft - 5) + 'px)'; }
  function set(cycle) {
    btns.forEach(function (b) {
      var on = b.getAttribute('data-cycle') === cycle;
      b.classList.toggle('on', on); if (on) move(b);
    });
    $$('.price b[data-m]').forEach(function (el) {
      el.style.transform = 'translateY(-8px)'; el.style.opacity = '0';
      setTimeout(function () {
        el.textContent = el.getAttribute(cycle === 'y' ? 'data-y' : 'data-m');
        el.style.transition = 'transform .4s cubic-bezier(.16,1,.3,1),opacity .4s';
        el.style.transform = 'none'; el.style.opacity = '1';
      }, 160);
    });
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { set(b.getAttribute('data-cycle')); }); });
  setTimeout(function () { move(btns[0]); }, 250);
  addEventListener('resize', function () { var on = $('button.on', box); if (on) move(on); }, { passive: true });
})();

/* ---------------- 24. Témoignages ---------------- */
(function quotes() {
  var box = $('#quotes'); if (!box) return;
  var qs = $$('.quote', box), dots = $('#quoteDots'), i = 0, timer;
  qs.forEach(function (q, k) {
    var b = document.createElement('button');
    b.setAttribute('aria-label', 'Témoignage ' + (k + 1));
    b.addEventListener('click', function () { show(k); auto(); });
    dots.appendChild(b);
  });
  function show(n) {
    i = (n + qs.length) % qs.length;
    qs.forEach(function (q, k) { q.classList.toggle('on', k === i); });
    $$('button', dots).forEach(function (b, k) { b.classList.toggle('on', k === i); });
  }
  function auto() { clearInterval(timer); if (!reduced) timer = setInterval(function () { show(i + 1); }, 6500); }
  $('#quoteNext').addEventListener('click', function () { show(i + 1); auto(); });
  $('#quotePrev').addEventListener('click', function () { show(i - 1); auto(); });
  new IntersectionObserver(function (es) {
    es.forEach(function (e) { e.isIntersecting ? auto() : clearInterval(timer); });
  }, { threshold: 0.25 }).observe(box);
  show(0);
})();

/* ---------------- 25. FAQ : ouverture animée ---------------- */
$$('#acc details').forEach(function (d) {
  var inner = d.querySelector('div'), sum = d.querySelector('summary');
  inner.style.height = '0px';
  sum.addEventListener('click', function (e) {
    e.preventDefault();
    var opening = !d.open;
    if (opening) {
      $$('#acc details').forEach(function (o) {
        if (o !== d && o.open) { o.querySelector('div').style.height = '0px'; o.open = false; }
      });
      d.open = true;
      inner.style.transition = 'height .5s cubic-bezier(.16,1,.3,1)';
      inner.style.height = inner.scrollHeight + 'px';
    } else {
      inner.style.height = inner.scrollHeight + 'px';
      requestAnimationFrame(function () { inner.style.height = '0px'; });
      setTimeout(function () { d.open = false; }, 480);
    }
  });
});

/* ---------------- 26. Infolettre ---------------- */
(function news() {
  var f = $('#newsForm'); if (!f) return;
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('#newsMail').value.trim(), msg = $('#newsMsg');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      msg.setAttribute('data-state', 'err');
      msg.textContent = 'Cette adresse ne semble pas valide.';
      return;
    }
    submitToWeb3Forms(f, msg, 'Inscription enregistrée pour ' + v + '.');
  });
})();

/* ---------------- 27. Titres mot à mot ---------------- */
(function splitTitles() {
  if (reduced) return;
  $$('.head h2, .split h2, .faq-grid h2, .fsm h2, .rail-head h2, .cta h2').forEach(function (h) {
    if (h.querySelector('.tw')) return;
    var words = h.textContent.split(' ');
    h.textContent = '';
    words.forEach(function (w, i) {
      var sp = document.createElement('span');
      sp.className = 'tw'; sp.textContent = w;
      sp.style.transitionDelay = (i * 0.045) + 's';
      h.appendChild(sp);
      h.appendChild(document.createTextNode(' '));
    });
    new IntersectionObserver(function (es, obs) {
      es.forEach(function (e) {
        if (e.isIntersecting) { $$('.tw', h).forEach(function (t) { t.classList.add('in'); }); obs.unobserve(h); }
      });
    }, { threshold: 0.25 }).observe(h);
  });
})();

/* ---------------- 28. Reflet au survol ---------------- */
$$('.i-card, .b-cell, .slide, .scan-card').forEach(function (el) { el.classList.add('shine'); });

/* ---------------- 29. Code de scan ---------------- */
(function scanCode() {
  var el = $('#scanCode'); if (!el || reduced) return;
  setInterval(function () {
    el.textContent = 'SG-' + Math.floor(Math.random() * 9) + '-' + (4000 + Math.floor(Math.random() * 999));
  }, 2600);
})();

/* ---------------- 30. Web3Forms — configuration & envoi ---------------- */
// Clé d'accès Web3Forms — compte INFOTELCOM (contact.infotelcom@gmail.com).
var WEB3FORMS_ACCESS_KEY = "1574d137-6488-4e03-b780-bb582f50d283";

function submitToWeb3Forms(form, statusEl, successText) {
  var hp = form.querySelector('.hp');
  if (hp && hp.checked) return; // piège à robots : on abandonne en silence

  var configured = WEB3FORMS_ACCESS_KEY && WEB3FORMS_ACCESS_KEY.indexOf('REMPLACER') !== 0;
  if (!configured) {
    statusEl.setAttribute('data-state', 'warn');
    statusEl.textContent = "Configuration requise : ajoutez votre clé Web3Forms dans assets/js/main.js (section 30).";
    return;
  }

  var fd = new FormData(form);
  fd.set('access_key', WEB3FORMS_ACCESS_KEY);
  fd.delete('botcheck');
  var payload = {};
  fd.forEach(function (v, k) { payload[k] = v; });

  var btn = form.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;
  statusEl.removeAttribute('data-state');
  statusEl.textContent = "Envoi en cours…";

  fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  }).then(function (r) { return r.json(); }).then(function (res) {
    if (res && res.success) {
      statusEl.setAttribute('data-state', 'ok');
      statusEl.textContent = successText;
      form.reset();
    } else {
      statusEl.setAttribute('data-state', 'err');
      statusEl.textContent = (res && res.message) || "L'envoi a échoué. Réessayez ou écrivez à contact.infotelcom@gmail.com.";
    }
  }).catch(function () {
    statusEl.setAttribute('data-state', 'err');
    statusEl.textContent = "L'envoi a échoué. Réessayez ou écrivez à contact.infotelcom@gmail.com.";
  }).then(function () {
    if (btn) btn.disabled = false;
  });
}

/* ---------------- 31. Formulaires (connexion, inscription, contact) ---------------- */
(function forms() {
  var map = {
    signupForm: "Merci — un membre de l'équipe FAXTRIX vous contacte sous 24h ouvrées.",
    contactForm: "Message envoyé — réponse sous 24h ouvrées."
  };
  Object.keys(map).forEach(function (id) {
    var form = $('#' + id); if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = form.querySelector('[data-status]');
      submitToWeb3Forms(form, status, map[id]);
    });
  });
})();

/* ---------------- 32. Modales (connexion / inscription) ---------------- */
(function authModal() {
  var modal = $('#authModal'); if (!modal) return;
  var views = $$('.modal-view', modal);

  function showView(name) {
    views.forEach(function (v) { v.hidden = v.getAttribute('data-view') !== name; });
  }
  function openModal(name) {
    showView(name);
    modal.classList.add('on');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('locked');
    var firstField = modal.querySelector('.modal-view:not([hidden]) input:not(.hp)');
    if (firstField) setTimeout(function () { firstField.focus(); }, 320);
  }
  function closeModal() {
    modal.classList.remove('on');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('locked');
  }

  $$('[data-modal-open]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      burger.classList.remove('x');
      navlinks.classList.remove('open');
      openModal(a.getAttribute('data-modal-open'));
    });
  });
  $$('[data-modal-switch]', modal).forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      showView(a.getAttribute('data-modal-switch'));
    });
  });
  $$('[data-modal-close]', modal).forEach(function (el) {
    el.addEventListener('click', closeModal);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('on')) closeModal();
  });
})();

onScroll();
})();

/* ---------------- 19. Thème clair / sombre / auto (site) ---------------- */
(function siteTheme() {
  var KEY = 'faxtrix-theme';
  var btn = document.getElementById('siteThemeBtn');
  var icon = document.getElementById('siteThemeIcon');
  if (!btn) return;
  var mql = window.matchMedia('(prefers-color-scheme: dark)');
  var order = ['light', 'dark', 'auto'];
  var icons = { light: '☀️', dark: '🌙', auto: '⚙️' };
  function apply(mode) {
    var dark = mode === 'dark' || (mode === 'auto' && mql.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    icon.textContent = icons[mode];
  }
  var current = localStorage.getItem(KEY) || 'auto';
  apply(current);
  btn.addEventListener('click', function () {
    current = order[(order.indexOf(current) + 1) % order.length];
    try { localStorage.setItem(KEY, current); } catch (e) {}
    apply(current);
  });
  mql.addEventListener('change', function () { if (current === 'auto') apply('auto'); });
})();
