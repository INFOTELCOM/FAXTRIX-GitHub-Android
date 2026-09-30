(function () {
"use strict";

/* ---------------- 0. Aides ---------------- */
function $(sel, ctx) { return (ctx || document).querySelector(sel); }
function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
var CURRENCY_OPTIONS = {
  XAF: { label: 'FCFA', locale: 'fr-FR', suffix: ' FCFA' },
  EUR: { label: '€', locale: 'fr-FR', suffix: ' €' },
  USD: { label: '
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function timeAgo(iso) {
  if (!iso) return '';
  var diff = Math.max(0, Date.now() - new Date(iso).getTime());
  var min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return "il y a " + min + " min";
  var h = Math.floor(min / 60);
  if (h < 24) return "il y a " + h + "h";
  return "il y a " + Math.floor(h / 24) + "j";
}
function fmtElapsed(ms) {
  var s = Math.floor(ms / 1000);
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return p(h) + ':' + p(m) + ':' + p(sec);
}
function authErrorFr(msg) {
  if (!msg) return 'Une erreur est survenue.';
  if (msg === 'Invalid login credentials') return 'E-mail ou mot de passe incorrect.';
  if (/email not confirmed/i.test(msg)) return "Votre e-mail n'est pas encore confirmé. Vérifiez votre boîte de réception (et les indésirables), puis cliquez sur le lien reçu.";
  if (/user already registered/i.test(msg)) return 'Un compte existe déjà avec cet e-mail. Connectez-vous plutôt.';
  return msg;
}

/* ---------------- 1. Client Supabase ---------------- */
var SUPABASE_URL = 'https://xtkcfhbsksoqbpnaciga.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0a2NmaGJza3NvcWJwbmFjaWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNDY4ODEsImV4cCI6MjEwNTkyMjg4MX0.Drrgf-6Axsdf3u1tHXhn3UoIhTC0Tu291ER0NAQQhTQ';
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storageKey: 'faxtrix-client-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

var state = {
  profile: { id: null, company_id: null, full_name: '', company_name: '', role: 'owner' },
  crm: [], tickets: [], terrain: [], equipes: [], automations: [], notifications: [], invitations: [], statistics: null
};

/* ---------------- 2. Porte d'entrée (connexion / inscription / mot de passe) ---------------- */
(function gate() {
  var gateEl = $('#gate'), shell = $('#appShell');
  var loginForm = $('#gateForm'), signupForm = $('#signupForm');
  var resetForm = $('#resetForm'), newPassForm = $('#newPassForm');

  $$('#gateTabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#gateTabs button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      var tab = b.getAttribute('data-gate-tab');
      loginForm.hidden = tab !== 'login';
      signupForm.hidden = tab !== 'signup';
      resetForm.hidden = true; newPassForm.hidden = true;
      $('#gateTitle').textContent = tab === 'login' ? 'Connexion' : 'Créer votre entreprise';
      $('#gateSub').textContent = tab === 'login' ? 'Accédez à votre espace FAXTRIX.' : 'Un espace FAXTRIX dédié et isolé pour votre entreprise.';
    });
  });

  $('#forgotLink').addEventListener('click', function (e) {
    e.preventDefault();
    loginForm.hidden = true; resetForm.hidden = false;
    $('#gateTitle').textContent = 'Mot de passe oublié';
    $('#gateSub').textContent = 'On vous envoie un lien pour le réinitialiser.';
  });
  $('#backToLoginLink').addEventListener('click', function (e) {
    e.preventDefault();
    resetForm.hidden = true; loginForm.hidden = false;
    $('#gateTitle').textContent = 'Connexion';
    $('#gateSub').textContent = 'Accédez à votre espace FAXTRIX.';
  });

  function setStatus(form, ok, msg) {
    var el = $('[data-status]', form);
    el.setAttribute('data-state', ok ? 'ok' : 'err');
    el.textContent = msg;
  }

  async function enter() {
    var ok = await loadAll();
    if (!ok) return;
    gateEl.classList.add('app-hidden');
    shell.classList.remove('app-hidden');
    boot();
  }

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = $('#gateEmail').value.trim();
    var pass = $('#gatePass').value;
    setStatus(loginForm, true, 'Connexion en cours…');
    var res = await sb.auth.signInWithPassword({ email: email, password: pass });
    if (res.error) { setStatus(loginForm, false, authErrorFr(res.error.message)); return; }
    setStatus(loginForm, true, 'Connecté.');
    enter();
  });

  /* ---- assistant d'inscription en 3 étapes ---- */
  var stepEl = 1, totalSteps = 3;
  var stepPrevBtn = $('#stepPrev'), stepNextBtn = $('#stepNext'), stepSubmitBtn = $('#stepSubmit');
  function showStep(n) {
    stepEl = n;
    $$('.gate-step-panel').forEach(function (p) { p.classList.toggle('active', Number(p.getAttribute('data-step')) === n); });
    $$('.gate-step[data-step-dot]').forEach(function (d) {
      var num = Number(d.getAttribute('data-step-dot'));
      d.classList.toggle('active', num === n);
      d.classList.toggle('done', num < n);
    });
    stepPrevBtn.hidden = n === 1;
    stepNextBtn.hidden = n === totalSteps;
    stepSubmitBtn.hidden = n !== totalSteps;
  }
  function validateStep(n) {
    var ids = n === 1 ? ['suName', 'suEmail'] : n === 2 ? ['suCompany'] : [];
    for (var i = 0; i < ids.length; i++) {
      var el = $('#' + ids[i]);
      if (!el.checkValidity()) { el.reportValidity(); return false; }
    }
    if (n === 3) {
      if (!$('#suPass').checkValidity()) { $('#suPass').reportValidity(); return false; }
      if ($('#suPass').value !== $('#suPass2').value) { setStatus(signupForm, false, 'Les deux mots de passe ne correspondent pas.'); return false; }
      if (!$('#suTerms').checked) { setStatus(signupForm, false, "Merci d'accepter les conditions d'utilisation."); return false; }
    }
    return true;
  }
  stepNextBtn.addEventListener('click', function () { if (validateStep(stepEl)) showStep(Math.min(totalSteps, stepEl + 1)); });
  stepPrevBtn.addEventListener('click', function () { showStep(Math.max(1, stepEl - 1)); });

  var pwdMeter = $('#pwdMeter'), pwdLabel = $('#pwdMeterLabel');
  $('#suPass').addEventListener('input', function (e) {
    var v = e.target.value, score = 0;
    if (v.length >= 6) score++;
    if (v.length >= 10) score++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
    if (/[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v)) score++;
    pwdMeter.className = 'pwd-meter ' + (v ? 'w' + Math.max(1, score) : '');
    pwdLabel.textContent = !v ? '\u00a0' : ['Faible', 'Faible', 'Moyen', 'Bon', 'Excellent'][score];
  });

  signupForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!validateStep(3)) return;
    var company = $('#suCompany').value.trim();
    var fullName = $('#suName').value.trim();
    var email = $('#suEmail').value.trim();
    var pass = $('#suPass').value;
    setStatus(signupForm, true, 'Création de votre espace…');
    var res = await sb.auth.signUp({
      email: email, password: pass,
      options: { data: {
        company_name: company, full_name: fullName,
        phone: $('#suPhone').value.trim(), sector: $('#suSector').value,
        company_size: $('#suSize').value, country: $('#suCountry').value.trim(), city: $('#suCity').value.trim()
      } }
    });
    if (res.error) { setStatus(signupForm, false, authErrorFr(res.error.message)); return; }
    if (!res.data.session) {
      setStatus(signupForm, true, 'Compte créé. Confirmez votre adresse via l\u2019e-mail que nous venons d\u2019envoyer, puis connectez-vous.');
      return;
    }
    setStatus(signupForm, true, 'Espace créé.');
    enter();
  });

  resetForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = $('#resetEmail').value.trim();
    setStatus(resetForm, true, 'Envoi en cours…');
    var res = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    if (res.error) { setStatus(resetForm, false, authErrorFr(res.error.message)); return; }
    setStatus(resetForm, true, 'E-mail envoyé, si ce compte existe. Suivez le lien reçu pour choisir un nouveau mot de passe.');
  });

  newPassForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var pass = $('#newPass').value;
    setStatus(newPassForm, true, 'Mise à jour…');
    var res = await sb.auth.updateUser({ password: pass });
    if (res.error) { setStatus(newPassForm, false, authErrorFr(res.error.message)); return; }
    setStatus(newPassForm, true, 'Mot de passe mis à jour. Connexion…');
    setTimeout(enter, 700);
  });

  // Lien de réinitialisation cliqué : Supabase ouvre une session "recovery" et déclenche cet évènement.
  sb.auth.onAuthStateChange(function (event) {
    if (event === 'PASSWORD_RECOVERY') {
      loginForm.hidden = true; signupForm.hidden = true; resetForm.hidden = true; newPassForm.hidden = false;
      $('#gateTitle').textContent = 'Nouveau mot de passe';
      $('#gateSub').textContent = 'Choisissez un nouveau mot de passe pour votre compte.';
    }
  });

  // Session déjà active (retour sur le site) ?
  sb.auth.getSession().then(function (res) {
    if (res.data.session && window.location.hash.indexOf('type=recovery') === -1) enter();
  });
})();

/* ---------------- 3. Chargement des données depuis Supabase ---------------- */
async function loadAll() {
  var userRes = await sb.auth.getUser();
  var user = userRes.data && userRes.data.user;
  if (!user) return false;

  var profRes = await sb.from('profiles').select('id, company_id, full_name, role, companies(name)').eq('id', user.id).single();
  if (profRes.error || !profRes.data) {
    toast("Impossible de charger votre profil.", 'crit');
    return false;
  }
  state.profile.id = profRes.data.id;
  state.profile.company_id = profRes.data.company_id;
  state.profile.full_name = profRes.data.full_name || user.email;
  state.profile.role = profRes.data.role;
  state.profile.company_name = (profRes.data.companies && profRes.data.companies.name) || '';

  var results = await Promise.all([
    sb.from('clients').select('*').order('created_at', { ascending: false }),
    sb.from('tickets').select('*').order('created_at', { ascending: false }),
    sb.from('terrain_missions').select('*').order('created_at', { ascending: false }),
    sb.from('team_members').select('*').order('created_at', { ascending: false }),
    sb.from('automation_rules').select('*').order('created_at', { ascending: false }),
    sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(40),
    state.profile.role === 'owner'
      ? sb.from('invitations').select('*').order('created_at', { ascending: false })
      : Promise.resolve({ data: [] })
  ]);
  state.crm = results[0].data || [];
  state.tickets = results[1].data || [];
  state.terrain = results[2].data || [];
  state.equipes = results[3].data || [];
  state.automations = results[4].data || [];
  state.notifications = results[5].data || [];
  state.invitations = results[6].data || [];
  var statsRes = await sb.rpc('my_company_statistics');
  state.statistics = statsRes.error ? null : (statsRes.data || null);
  return true;
}

function withCompany(obj) {
  obj.company_id = state.profile.company_id;
  return obj;
}

async function notify(msg, kind) {
  var res = await sb.from('notifications').insert(withCompany({ msg: msg, read: false })).select().single();
  if (!res.error) { state.notifications.unshift(res.data); renderNotifBadge(); }
  toast(msg, kind);
}
function toast(msg, kind) {
  var wrap = $('#toastWrap'); if (!wrap) return;
  var el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.innerHTML = '<i></i><span>' + escapeHtml(msg) + '</span>';
  wrap.appendChild(el);
  setTimeout(function () { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; el.style.transition = 'all .3s ease'; }, 3200);
  setTimeout(function () { wrap.removeChild(el); }, 3600);
}

/* ---------------- 4. Navigation entre panneaux ---------------- */
var panelTitles = {
  accueil: ['Bonjour', 'Voici un aperçu de votre espace FAXTRIX.'],
  services: ['Services', 'Support, interventions, CRM et outils de votre entreprise.'],
  crm: ['CRM', 'Prospects, opportunités et clients actifs.'],
  tickets: ['Tickets', 'Suivi des demandes de support.'],
  terrain: ['Terrain', 'Missions et interventions en cours.'],
  equipes: ['Équipes', "Charge de travail et disponibilité."],
  automatisation: ['Automatisation', 'Règles déclenchées par vos actions.'],
  intelligence: ['Business Brain', 'Analyse en direct de vos données.'],
  simulation: ['Decision Simulator', 'Testez une décision avant de la prendre.'],
  rapports: ['Rapports & Analyses', 'Vos indicateurs en temps réel.'],
  assistant: ['Assistant IA', 'Posez une question sur vos données.'],
  securite: ['Sécurité & accès', 'Mot de passe et sessions.'],
  parametres: ['Paramètres', 'Profil et session.']
};
function showPanel(name) {
  $$('.app-nav button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-panel') === name); });
  $$('.mobile-tabbar button[data-panel]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-panel') === name); });
  $$('.app-panel').forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-panel') === name); });
  var meta = panelTitles[name];
  if (meta) {
    var greetName = state.profile.full_name || 'Albert';
    $('#topTitle').textContent = name === 'accueil' ? ('Bonjour ' + greetName) : meta[0];
    $('#topSub').textContent = meta[1];
  }
  $('#appSide').classList.remove('open');
  var serviceSheet = $('#servicesSheet'); if (serviceSheet) serviceSheet.classList.remove('on');
  renderAll();
}
$$('.app-nav button').forEach(function (b) {
  b.addEventListener('click', function () { showPanel(b.getAttribute('data-panel')); });
});
$$('.mobile-tabbar button[data-panel]').forEach(function (b) {
  b.addEventListener('click', function () { showPanel(b.getAttribute('data-panel')); });
});
$$('[data-go]').forEach(function (b) {
  b.addEventListener('click', function () {
    var t = b.getAttribute('data-go');
    if (t === 'services-sheet') { $('#servicesSheet').classList.add('on'); return; }
    showPanel(t);
    if (b.hasAttribute('data-open-ticket')) setTimeout(function () { $('#tkAddBtn').click(); }, 250);
  });
});
var servicesTabBtn = $('#servicesTabBtn');
if (servicesTabBtn) servicesTabBtn.addEventListener('click', function () { $('#servicesSheet').classList.add('on'); });
$$('[data-services-close]').forEach(function (el) { el.addEventListener('click', function () { $('#servicesSheet').classList.remove('on'); }); });
var moreTabBtn = $('#moreTabBtn');
if (moreTabBtn) moreTabBtn.addEventListener('click', function () { $('#plusSheet').classList.add('on'); });
$$('[data-plus-close]').forEach(function (el) { el.addEventListener('click', function () { $('#plusSheet').classList.remove('on'); }); });
var plusLogoutBtn = $('#plusLogoutBtn');
if (plusLogoutBtn) plusLogoutBtn.addEventListener('click', function () { doLogout(); });

/* ---------------- 5. Tiroir générique (ajout / édition) ---------------- */
var drawer = $('#drawer');
var drawerForms = { crm: $('#crmForm'), tk: $('#tkForm'), te: $('#teForm'), eq: $('#eqForm'), auto: $('#autoForm') };
function openDrawer(kind, title) {
  $('#drawerTitle').textContent = title;
  Object.keys(drawerForms).forEach(function (k) { drawerForms[k].hidden = k !== kind; });
  drawer.classList.add('on');
}
function closeDrawer() { drawer.classList.remove('on'); }
$$('[data-drawer-close]').forEach(function (el) { el.addEventListener('click', closeDrawer); });

var notifDrawer = $('#notifDrawer');
$$('[data-drawer-close-notif]').forEach(function (el) { el.addEventListener('click', function () { notifDrawer.classList.remove('on'); }); });
$('#notifBtn').addEventListener('click', async function () {
  notifDrawer.classList.add('on');
  var unread = state.notifications.filter(function (n) { return !n.read; }).map(function (n) { return n.id; });
  state.notifications.forEach(function (n) { n.read = true; });
  renderNotifBadge();
  renderNotifList();
  if (unread.length) await sb.from('notifications').update({ read: true }).in('id', unread);
});

/* ---------------- 6. CRM ---------------- */
var crmFilter = 'Tous', crmQuery = '';
$('#crmAddBtn').addEventListener('click', function () {
  $('#crmForm').reset(); $('#crmId').value = '';
  openDrawer('crm', 'Nouveau client');
});
$$('#crmTabs button').forEach(function (b) {
  b.addEventListener('click', function () {
    $$('#crmTabs button').forEach(function (x) { x.classList.remove('active'); });
    b.classList.add('active'); crmFilter = b.getAttribute('data-filter'); renderCrm();
  });
});
$('#crmSearch').addEventListener('input', function (e) { crmQuery = e.target.value.trim().toLowerCase(); renderCrm(); });
$('#crmForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var id = $('#crmId').value;
  var data = { nom: $('#crmNom').value.trim(), statut: $('#crmStatut').value, valeur: Number($('#crmValeurInput').value || 0) };
  if (id) {
    var res = await sb.from('clients').update(data).eq('id', id).select().single();
    if (!res.error) { var item = state.crm.find(function (c) { return c.id === id; }); if (item) Object.assign(item, res.data); }
  } else {
    var res2 = await sb.from('clients').insert(withCompany(data)).select().single();
    if (!res2.error) { state.crm.unshift(res2.data); notify('Nouveau client ajouté : ' + data.nom, 'ok'); }
  }
  closeDrawer(); renderAll();
});
function editCrm(id) {
  var c = state.crm.find(function (x) { return x.id === id; }); if (!c) return;
  $('#crmId').value = c.id; $('#crmNom').value = c.nom; $('#crmStatut').value = c.statut; $('#crmValeurInput').value = c.valeur;
  openDrawer('crm', 'Modifier le client');
}
async function deleteCrm(id) {
  state.crm = state.crm.filter(function (x) { return x.id !== id; }); renderAll();
  await sb.from('clients').delete().eq('id', id);
}
function renderCrm() {
  var list = $('#crmList');
  var rows = state.crm.filter(function (c) {
    var okFilter = crmFilter === 'Tous' || c.statut === crmFilter;
    var okQuery = !crmQuery || c.nom.toLowerCase().indexOf(crmQuery) !== -1;
    return okFilter && okQuery;
  });
  list.innerHTML = rows.length ? rows.map(function (c) {
    var chipClass = c.statut === 'Actif' ? 'ok' : (c.statut === 'Négociation' ? 'mid' : (c.statut === 'Attente' ? 'crit' : ''));
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(c.nom) + '</b><span>' + fcfa(c.valeur) + '</span></div>' +
      '<span class="chip ' + chipClass + '">' + c.statut + '</span>' +
      '<div class="app-row-actions"><button class="row-btn" data-crm-edit="' + c.id + '">✎</button><button class="row-btn" data-crm-del="' + c.id + '">🗑</button></div></div>';
  }).join('') : '<div class="app-empty">Aucun client pour ce filtre.</div>';

  $('#crmTotal').textContent = state.crm.length;
  $('#crmValeur').textContent = fcfa(state.crm.reduce(function (s, c) { return s + Number(c.valeur || 0); }, 0));
  $('#crmActifs').textContent = state.crm.filter(function (c) { return c.statut === 'Actif'; }).length;
  $('#crmNego').textContent = state.crm.filter(function (c) { return c.statut === 'Négociation'; }).length;
}

/* ---------------- 7. Tickets ---------------- */
var tkFilter = 'Tous', tkQuery = '';
$('#tkAddBtn').addEventListener('click', function () {
  $('#tkForm').reset(); $('#tkId').value = '';
  openDrawer('tk', 'Nouveau ticket');
});
$$('#tkTabs button').forEach(function (b) {
  b.addEventListener('click', function () {
    $$('#tkTabs button').forEach(function (x) { x.classList.remove('active'); });
    b.classList.add('active'); tkFilter = b.getAttribute('data-filter'); renderTickets();
  });
});
$('#tkSearch').addEventListener('input', function (e) { tkQuery = e.target.value.trim().toLowerCase(); renderTickets(); });
$('#tkForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var id = $('#tkId').value;
  var data = { titre: $('#tkTitre').value.trim(), client: $('#tkClient').value.trim(), priorite: $('#tkPriorite').value, statut: $('#tkStatut').value };
  if (id) {
    var res = await sb.from('tickets').update(data).eq('id', id).select().single();
    if (!res.error) { var item = state.tickets.find(function (t) { return t.id === id; }); if (item) Object.assign(item, res.data); }
  } else {
    var res2 = await sb.from('tickets').insert(withCompany(data)).select().single();
    if (!res2.error) {
      state.tickets.unshift(res2.data);
      if (data.priorite === 'Haute') {
        var rule = state.automations.find(function (a) { return a.live; });
        notify('Automatisation : ticket « ' + data.titre + '» en priorité haute — ' + (rule ? rule.action_text.toLowerCase() : 'équipe notifiée') + '.', 'crit');
      } else {
        notify('Nouveau ticket : ' + data.titre, 'ok');
      }
    }
  }
  closeDrawer(); renderAll();
});
function editTk(id) {
  var t = state.tickets.find(function (x) { return x.id === id; }); if (!t) return;
  $('#tkId').value = t.id; $('#tkTitre').value = t.titre; $('#tkClient').value = t.client; $('#tkPriorite').value = t.priorite; $('#tkStatut').value = t.statut;
  openDrawer('tk', 'Modifier le ticket');
}
async function deleteTk(id) {
  state.tickets = state.tickets.filter(function (x) { return x.id !== id; }); renderAll();
  await sb.from('tickets').delete().eq('id', id);
}
function renderTickets() {
  var list = $('#tkList');
  var rows = state.tickets.filter(function (t) {
    var okFilter = tkFilter === 'Tous' || t.statut === tkFilter;
    var okQuery = !tkQuery || t.titre.toLowerCase().indexOf(tkQuery) !== -1;
    return okFilter && okQuery;
  });
  list.innerHTML = rows.length ? rows.map(function (t) {
    var pClass = t.priorite === 'Haute' ? 'crit' : (t.priorite === 'Moyenne' ? 'mid' : 'ok');
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(t.titre) + '</b><span>' + escapeHtml(t.client || '—') + ' · ' + timeAgo(t.created_at) + '</span></div>' +
      '<span class="chip ' + pClass + '">' + t.priorite + '</span><span class="chip">' + t.statut + '</span>' +
      '<div class="app-row-actions"><button class="row-btn" data-tk-edit="' + t.id + '">✎</button><button class="row-btn" data-tk-del="' + t.id + '">🗑</button></div></div>';
  }).join('') : '<div class="app-empty">Aucun ticket pour ce filtre.</div>';

  $('#tkTotal').textContent = state.tickets.length;
  $('#tkOuverts').textContent = state.tickets.filter(function (t) { return t.statut !== 'Résolu' && t.statut !== 'Fermé'; }).length;
  $('#tkHaute').textContent = state.tickets.filter(function (t) { return t.priorite === 'Haute'; }).length;
  $('#tkResolus').textContent = state.tickets.filter(function (t) { return t.statut === 'Résolu'; }).length;
}

/* ---------------- 8. Terrain ---------------- */
$('#teAddBtn').addEventListener('click', function () {
  $('#teForm').reset(); $('#teId').value = '';
  openDrawer('te', 'Nouvelle mission');
});
$('#teForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var id = $('#teId').value;
  var data = { tech: $('#teTech').value.trim(), client: $('#teClient').value.trim(), statut: $('#teStatut').value };
  if (id) {
    var res = await sb.from('terrain_missions').update(data).eq('id', id).select().single();
    if (!res.error) { var item = state.terrain.find(function (x) { return x.id === id; }); if (item) Object.assign(item, res.data); }
  } else {
    data.started_at = data.statut === 'En cours' ? new Date().toISOString() : null; data.elapsed_ms = 0;
    var res2 = await sb.from('terrain_missions').insert(withCompany(data)).select().single();
    if (!res2.error) { state.terrain.unshift(res2.data); notify('Nouvelle mission assignée à ' + data.tech, 'ok'); }
  }
  closeDrawer(); renderAll();
});
function editTe(id) {
  var t = state.terrain.find(function (x) { return x.id === id; }); if (!t) return;
  $('#teId').value = t.id; $('#teTech').value = t.tech; $('#teClient').value = t.client; $('#teStatut').value = t.statut;
  openDrawer('te', 'Modifier la mission');
}
async function deleteTe(id) {
  state.terrain = state.terrain.filter(function (x) { return x.id !== id; }); renderAll();
  await sb.from('terrain_missions').delete().eq('id', id);
}
async function startTe(id) {
  var t = state.terrain.find(function (x) { return x.id === id; }); if (!t) return;
  t.statut = 'En cours'; t.started_at = new Date().toISOString();
  renderAll();
  await sb.from('terrain_missions').update({ statut: t.statut, started_at: t.started_at }).eq('id', id);
}
async function stopTe(id) {
  var t = state.terrain.find(function (x) { return x.id === id; }); if (!t) return;
  if (t.started_at) { t.elapsed_ms = (t.elapsed_ms || 0) + (Date.now() - new Date(t.started_at).getTime()); }
  t.statut = 'Terminée'; t.started_at = null;
  renderAll();
  await sb.from('terrain_missions').update({ statut: t.statut, started_at: null, elapsed_ms: t.elapsed_ms }).eq('id', id);
  notify('Mission terminée — ' + t.tech + ' (' + fmtElapsed(t.elapsed_ms) + ')', 'ok');
}
function renderTerrain() {
  var list = $('#teList');
  list.innerHTML = state.terrain.length ? state.terrain.map(function (t) {
    var live = t.statut === 'En cours' && t.started_at;
    var elapsed = (t.elapsed_ms || 0) + (live ? (Date.now() - new Date(t.started_at).getTime()) : 0);
    var chipClass = t.statut === 'En cours' ? 'mid' : (t.statut === 'Terminée' ? 'ok' : '');
    var actions = '<div class="app-row-actions">';
    if (t.statut !== 'En cours' && t.statut !== 'Terminée') actions += '<button class="row-btn" data-te-start="' + t.id + '">▶</button>';
    if (t.statut === 'En cours') actions += '<button class="row-btn" data-te-stop="' + t.id + '">⏸</button>';
    actions += '<button class="row-btn" data-te-edit="' + t.id + '">✎</button><button class="row-btn" data-te-del="' + t.id + '">🗑</button></div>';
    return '<div class="app-row" data-te-row="' + t.id + '"><div class="r-main"><b>' + escapeHtml(t.tech) + '</b><span>' + escapeHtml(t.client || '—') + '</span></div>' +
      '<span class="mono" data-te-timer="' + t.id + '" style="min-width:70px;text-align:right;">' + fmtElapsed(elapsed) + '</span>' +
      '<span class="chip ' + chipClass + '">' + t.statut + '</span>' + actions + '</div>';
  }).join('') : '<div class="app-empty">Aucune mission enregistrée.</div>';

  $('#teTotal').textContent = state.terrain.length;
  $('#teCours').textContent = state.terrain.filter(function (t) { return t.statut === 'En cours'; }).length;
  $('#tePlanif').textContent = state.terrain.filter(function (t) { return t.statut === 'Planifiée'; }).length;
  $('#teTerm').textContent = state.terrain.filter(function (t) { return t.statut === 'Terminée'; }).length;
}
setInterval(function () {
  $$('[data-te-timer]').forEach(function (el) {
    var id = el.getAttribute('data-te-timer');
    var t = state.terrain.find(function (x) { return x.id === id; });
    if (!t || t.statut !== 'En cours' || !t.started_at) return;
    el.textContent = fmtElapsed((t.elapsed_ms || 0) + (Date.now() - new Date(t.started_at).getTime()));
  });
}, 1000);

/* ---------------- 9. Équipes ---------------- */
$('#eqAddBtn').addEventListener('click', function () {
  $('#eqForm').reset(); $('#eqId').value = '';
  openDrawer('eq', 'Nouveau membre');
});
$('#eqForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var id = $('#eqId').value;
  var data = { nom: $('#eqNom').value.trim(), role: $('#eqRole').value.trim(), statut: $('#eqStatut').value, charge: Number($('#eqCharge').value || 0), email: $('#eqEmail').value.trim(), telephone: $('#eqTel').value.trim(), specialites: $('#eqSpec').value.trim() };
  if (id) {
    var res = await sb.from('team_members').update(data).eq('id', id).select().single();
    if (!res.error) { var item = state.equipes.find(function (x) { return x.id === id; }); if (item) Object.assign(item, res.data); }
  } else {
    var res2 = await sb.from('team_members').insert(withCompany(data)).select().single();
    if (!res2.error) { state.equipes.unshift(res2.data); notify(data.nom + ' a rejoint l\u2019équipe', 'ok'); }
  }
  closeDrawer(); renderAll();
});
function editEq(id) {
  var m = state.equipes.find(function (x) { return x.id === id; }); if (!m) return;
  $('#eqId').value = m.id; $('#eqNom').value = m.nom; $('#eqRole').value = m.role; $('#eqStatut').value = m.statut; $('#eqCharge').value = m.charge; $('#eqEmail').value = m.email || ''; $('#eqTel').value = m.telephone || ''; $('#eqSpec').value = m.specialites || '';
  openDrawer('eq', 'Modifier le membre');
}
async function deleteEq(id) {
  state.equipes = state.equipes.filter(function (x) { return x.id !== id; }); renderAll();
  await sb.from('team_members').delete().eq('id', id);
}
function renderEquipes() {
  var list = $('#eqList');
  list.innerHTML = state.equipes.length ? state.equipes.map(function (m) {
    var chipClass = m.statut === 'Disponible' ? 'ok' : (m.statut === 'En mission' ? 'crit' : 'mid');
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(m.nom) + '</b><span>' + escapeHtml(m.role || '—') + '</span></div>' +
      '<span class="mono" style="min-width:40px;">' + m.charge + '%</span>' +
      '<span class="chip ' + chipClass + '">' + m.statut + '</span>' +
      '<div class="app-row-actions"><button class="row-btn" data-eq-edit="' + m.id + '">✎</button><button class="row-btn" data-eq-del="' + m.id + '">🗑</button></div></div>';
  }).join('') : '<div class="app-empty">Aucun membre enregistré.</div>';
}

/* ---------------- 10. Automatisation ---------------- */
$('#autoAddBtn').addEventListener('click', function () {
  $('#autoForm').reset();
  openDrawer('auto', 'Nouvelle règle');
});
$('#autoForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var data = { trigger_text: $('#autoTrigger').value.trim(), action_text: $('#autoAction').value.trim(), live: false };
  var res = await sb.from('automation_rules').insert(withCompany(data)).select().single();
  if (!res.error) { state.automations.unshift(res.data); notify('Règle ajoutée : ' + data.trigger_text, 'ok'); }
  closeDrawer(); renderAll();
});
async function deleteAuto(id) {
  state.automations = state.automations.filter(function (x) { return x.id !== id; }); renderAll();
  await sb.from('automation_rules').delete().eq('id', id);
}
function renderAuto() {
  var wrap = $('#autoList');
  wrap.innerHTML = state.automations.length ? state.automations.map(function (a) {
    return '<div class="rule-row"><em>SI</em>' + escapeHtml(a.trigger_text) + '<em>ALORS</em>' + escapeHtml(a.action_text) +
      (a.live ? '<span class="chip ok">Active</span>' : '') +
      '<button class="row-btn r-x" data-auto-del="' + a.id + '">🗑</button></div>';
  }).join('') : '<div class="app-empty">Aucune règle définie.</div>';
}

/* ---------------- 11. Business Brain (calculs en direct) ---------------- */
function renderBrain() {
  var wrap = $('#brainList');
  var ticketsHaute = state.tickets.filter(function (t) { return t.priorite === 'Haute' && t.statut !== 'Résolu' && t.statut !== 'Fermé'; });
  var valeurNego = state.crm.filter(function (c) { return c.statut === 'Négociation'; }).reduce(function (s, c) { return s + Number(c.valeur || 0); }, 0);
  var nbNego = state.crm.filter(function (c) { return c.statut === 'Négociation'; }).length;
  var surcharge = state.equipes.filter(function (m) { return Number(m.charge) >= 80; });
  var missionsCours = state.terrain.filter(function (t) { return t.statut === 'En cours'; });
  var items = [];
  items.push(ticketsHaute.length
    ? { t: ticketsHaute.length + ' ticket' + (ticketsHaute.length > 1 ? 's' : '') + ' en priorité haute encore ouvert' + (ticketsHaute.length > 1 ? 's' : '') + '.', c: 'crit' }
    : { t: 'Aucun ticket critique ouvert en ce moment.', c: 'ok' });
  items.push(nbNego
    ? { t: nbNego + ' client' + (nbNego > 1 ? 's' : '') + ' en négociation, représentant ' + fcfa(valeurNego) + ' de pipeline.', c: 'mid' }
    : { t: 'Aucune négociation en cours.', c: '' });
  items.push(surcharge.length
    ? { t: surcharge.length + ' membre' + (surcharge.length > 1 ? 's' : '') + " d'équipe à plus de 80% de charge : " + surcharge.map(function (m) { return m.nom; }).join(', ') + '.', c: 'crit' }
    : { t: "Aucune surcharge d'équipe détectée.", c: 'ok' });
  items.push(missionsCours.length
    ? { t: missionsCours.length + ' mission' + (missionsCours.length > 1 ? 's' : '') + ' terrain en cours actuellement.', c: 'mid' }
    : { t: 'Aucune mission terrain en cours.', c: '' });

  wrap.innerHTML = items.map(function (it) {
    return '<div class="app-row"><div class="r-main"><span>' + it.t + '</span></div>' + (it.c ? '<span class="chip ' + it.c + '">' + (it.c === 'crit' ? 'Attention' : it.c === 'ok' ? 'Sain' : 'À suivre') + '</span>' : '') + '</div>';
  }).join('');
}

/* ---------------- 12. Decision Simulator ---------------- */
function renderSim() {
  var tech = Number($('#simTech').value);
  var delay = Number($('#simDelay').value);
  $('#simTechVal').textContent = tech;
  $('#simDelayVal').textContent = delay + '%';
  var prod = tech * 6 + delay * 0.4;
  var cost = tech * 4 - delay * 0.2;
  var risk = -(tech * 2 + delay * 0.3);
  $('#simProd').textContent = (prod >= 0 ? '+' : '') + prod.toFixed(1) + '%';
  $('#simCost').textContent = (cost >= 0 ? '+' : '') + cost.toFixed(1) + '%';
  $('#simRisk').textContent = risk.toFixed(1) + '%';
}
$('#simTech').addEventListener('input', renderSim);
$('#simDelay').addEventListener('input', renderSim);

/* ---------------- 13. Accueil ---------------- */
function renderPerfChart() {
  var svg = $('#perfChart'); if (!svg) return;
  var n = 14, pts = [], i;
  for (i = 0; i < n; i++) {
    var base = state.crm.length + state.tickets.length + state.terrain.length;
    pts.push(6 + ((base * 7 + i * 13) % 23) + i * 1.4);
  }
  var max = Math.max.apply(null, pts), min = Math.min.apply(null, pts);
  var w = 600, h = 100, step = w / (n - 1);
  var d = pts.map(function (v, k) { var y = h - ((v - min) / (max - min || 1)) * h; return (k === 0 ? 'M' : 'L') + (k * step) + ',' + y.toFixed(1); }).join(' ');
  var last = h - ((pts[n - 1] - min) / (max - min || 1)) * h;
  svg.innerHTML = '<defs><linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF7A00" stop-opacity=".28"/><stop offset="1" stop-color="#FF7A00" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + d + ' L ' + w + ',' + h + ' L 0,' + h + ' Z" fill="url(#perfFill)"/>' +
    '<path d="' + d + '" fill="none" stroke="#FF7A00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + w + '" cy="' + last + '" r="4.5" fill="#FF7A00"/>';
}
function renderAccueil() {
  $('#statClients').textContent = state.crm.length;
  $('#statTickets').textContent = state.tickets.filter(function (t) { return t.statut !== 'Résolu' && t.statut !== 'Fermé'; }).length;
  $('#statEquipes').textContent = state.equipes.length;
  $('#statMissions').textContent = state.terrain.filter(function (t) { return t.statut === 'En cours'; }).length;

  var acts = [];
  state.tickets.slice(0, 3).forEach(function (t) { acts.push({ label: 'Ticket : ' + t.titre, time: t.created_at }); });
  state.crm.slice(0, 2).forEach(function (c) { acts.push({ label: 'Client : ' + c.nom + ' (' + c.statut + ')', time: null }); });
  $('#activityList').innerHTML = acts.length ? acts.map(function (a) {
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(a.label) + '</b>' + (a.time ? '<span>' + timeAgo(a.time) + '</span>' : '') + '</div></div>';
  }).join('') : '<div class="app-empty">Aucune activité pour le moment.</div>';

  var statuts = ['Prospect', 'Négociation', 'Actif', 'Attente'];
  var total = state.crm.length || 1;
  $('#pipelineMini').innerHTML = statuts.map(function (s) {
    var n = state.crm.filter(function (c) { return c.statut === s; }).length;
    var pct = Math.round((n / total) * 100);
    return '<div style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px;"><span>' + s + '</span><span>' + n + '</span></div>' +
      '<div class="loadbar" style="height:6px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;"><i style="display:block;height:100%;width:' + pct + '%;background:linear-gradient(90deg,var(--ion),var(--electric));"></i></div></div>';
  }).join('');
}

/* ---------------- 14. Notifications & profil ---------------- */
function renderNotifBadge() {
  var n = state.notifications.filter(function (x) { return !x.read; }).length;
  var badge = $('#notifBadge');
  badge.textContent = n;
  badge.classList.toggle('app-hidden', n === 0);
}
function renderNotifList() {
  var wrap = $('#notifList');
  wrap.innerHTML = state.notifications.length ? state.notifications.map(function (n) {
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(n.msg) + '</b><span>' + timeAgo(n.created_at) + '</span></div></div>';
  }).join('') : '<div class="app-empty">Aucune notification.</div>';
}
$('#userMenuBtn').addEventListener('click', function () { showPanel('parametres'); });
$('#profileForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var name = $('#profName').value.trim() || state.profile.full_name;
  state.profile.full_name = name;
  renderTopUser();
  await sb.from('profiles').update({ full_name: name }).eq('id', state.profile.id);
  toast('Profil mis à jour.', 'ok');
});
$('#inviteForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var email = $('#inviteEmail').value.trim();
  var form = $('#inviteForm');
  var statusEl = $('[data-status]', form);
  var res = await sb.from('invitations').insert({ company_id: state.profile.company_id, email: email }).select().single();
  if (res.error) {
    statusEl.setAttribute('data-state', 'err');
    statusEl.textContent = "Impossible d'inviter cette adresse.";
    return;
  }
  state.invitations.unshift(res.data);
  form.reset();
  statusEl.setAttribute('data-state', 'ok');
  statusEl.textContent = 'Invitation enregistrée — ' + email + ' rejoindra votre entreprise en s\u2019inscrivant avec cette adresse.';
  renderInvites();
});
async function cancelInvite(id) {
  state.invitations = state.invitations.filter(function (x) { return x.id !== id; }); renderInvites();
  await sb.from('invitations').delete().eq('id', id);
}
function renderInvites() {
  var card = $('#teamCard');
  card.hidden = state.profile.role !== 'owner';
  var wrap = $('#inviteList');
  var pending = state.invitations.filter(function (i) { return !i.accepted; });
  wrap.innerHTML = pending.length ? pending.map(function (i) {
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(i.email) + '</b><span>Invitation en attente · ' + timeAgo(i.created_at) + '</span></div>' +
      '<button class="row-btn" data-invite-del="' + i.id + '">🗑</button></div>';
  }).join('') : '<div class="app-empty">Aucune invitation en attente.</div>';
}
function renderTopUser() {
  var name = state.profile.full_name || 'Vous';
  $('#userName').textContent = name;
  $('#userAv').textContent = name.charAt(0).toUpperCase();
  $('#profName').value = name;
  var companyEl = $('#profCompanyName'); if (companyEl) companyEl.textContent = state.profile.company_name || '—';
  var bannerEl = $('#companyBannerName'); if (bannerEl) bannerEl.textContent = state.profile.company_name || 'Votre entreprise';
}
async function doLogout() {
  await sb.auth.signOut();
  location.reload();
}
$('#logoutBtn').addEventListener('click', doLogout);

/* ---------------- 15. Délégation des clics sur les lignes ---------------- */
document.addEventListener('click', function (e) {
  var t = e.target;
  var id;
  if ((id = t.getAttribute && t.getAttribute('data-crm-edit'))) editCrm(id);
  else if ((id = t.getAttribute && t.getAttribute('data-crm-del'))) deleteCrm(id);
  else if ((id = t.getAttribute && t.getAttribute('data-tk-edit'))) editTk(id);
  else if ((id = t.getAttribute && t.getAttribute('data-tk-del'))) deleteTk(id);
  else if ((id = t.getAttribute && t.getAttribute('data-te-edit'))) editTe(id);
  else if ((id = t.getAttribute && t.getAttribute('data-te-del'))) deleteTe(id);
  else if ((id = t.getAttribute && t.getAttribute('data-te-start'))) startTe(id);
  else if ((id = t.getAttribute && t.getAttribute('data-te-stop'))) stopTe(id);
  else if ((id = t.getAttribute && t.getAttribute('data-eq-edit'))) editEq(id);
  else if ((id = t.getAttribute && t.getAttribute('data-eq-del'))) deleteEq(id);
  else if ((id = t.getAttribute && t.getAttribute('data-auto-del'))) deleteAuto(id);
  else if ((id = t.getAttribute && t.getAttribute('data-invite-del'))) cancelInvite(id);
});

/* ---------------- 16. Menu mobile (barre latérale) ---------------- */
(function mobileSide() {
  var side = $('#appSide');
  var top = $('.app-top');
  if (!top) return;
  var toggle = document.createElement('button');
  toggle.className = 'row-btn';
  toggle.style.display = 'none';
  toggle.setAttribute('aria-label', 'Menu');
  toggle.innerHTML = '☰';
  top.insertBefore(toggle, top.firstChild);
  function sync() { toggle.style.display = window.innerWidth <= 900 ? 'grid' : 'none'; }
  sync();
  window.addEventListener('resize', sync);
  toggle.addEventListener('click', function () { side.classList.toggle('open'); });
})();

/* ---------------- 17. Rendu global & démarrage ---------------- */
function renderAll() {
  renderAccueil();
  renderCrm();
  renderTickets();
  renderTerrain();
  renderEquipes();
  renderAuto();
  renderBrain();
  renderSim();
  renderNotifBadge();
  renderNotifList();
  renderTopUser();
  renderInvites();
  renderReports();
  renderSuivi();
  renderPerfChart();
  animateKpis();
}
async function initPermissionsUI() {
  var roleEl = $('#permissionRole'), list = $('#permissionRequestsList'), form = $('#permissionRequestForm');
  if (!roleEl || !list || !form) return;
  roleEl.textContent = state.profile.role || '—';
  try {
    var p = await sb.rpc('my_permissions');
    var rights = (p.data || []).map(function(x){ return x.permission; });
    var opts = $('#permissionRight option');
    opts.forEach(function(o){ o.disabled = rights.indexOf(o.value) !== -1; });
    var r = await sb.rpc('my_permission_requests');
    if (r.error) { list.innerHTML = '<div class="app-empty">Impossible de charger les demandes.</div>'; return; }
    var rows = r.data || [];
    list.innerHTML = rows.length ? rows.map(function(x){
      var cls = x.status === 'approved' ? 'ok' : (x.status === 'denied' ? 'crit' : 'mid');
      return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(x.requested_right) + '</b><span>' + escapeHtml(x.reason || 'Sans motif') + '</span></div><span class="chip ' + cls + '">' + escapeHtml(x.status) + '</span></div>';
    }).join('') : '<div class="app-empty">Aucune demande envoyée.</div>';
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', async function(e){
        e.preventDefault();
        var status = $('#permissionStatus');
        status.textContent = 'Envoi…';
        var right = $('#permissionRight').value;
        var reason = $('#permissionReason').value.trim();
        var res = await sb.rpc('request_faxtrix_permission', {p_right:right,p_reason:reason});
        if (res.error) { status.setAttribute('data-state','err'); status.textContent = res.error.message || 'Demande impossible.'; return; }
        status.setAttribute('data-state','ok'); status.textContent = 'Demande envoyée à INFOTELCOM.';
        $('#permissionReason').value = '';
        await initPermissionsUI();
      });
    }
  } catch(e) {
    list.innerHTML = '<div class="app-empty">Les droits seront disponibles après activation de la sécurité.</div>';
  }
}
function boot() {
  renderAll();
  initPermissionsUI();
}

/* ---------------- 18. Installation PWA ---------------- */
(function installPrompt() {
  var deferred = null;
  var btn = $('#installBtn');
  var banners = $$('.inapp-banner');
  function showBanner(text) { banners.forEach(function (b) { b.hidden = false; b.textContent = text; }); }
  var ua = navigator.userAgent || '';
  var isInApp = /FBAN|FBAV|Instagram|Line\/|Messenger|; wv\)/i.test(ua) || (/Android/.test(ua) && /WhatsApp/i.test(ua));
  var isIOS = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (isStandalone) return; // déjà installée, rien à montrer

  if (isInApp) {
    showBanner("📲 Pour installer l'application, ouvre ce lien dans Chrome ou Safari : appuie sur ⋮ (ou sur l'icône navigateur) en haut de l'écran, puis « Ouvrir dans le navigateur ».");
    return;
  }
  if (isIOS) {
    showBanner("📲 Pour installer : appuie sur l'icône Partager (⬆️ dans Safari), puis « Sur l'écran d'accueil ».");
    return;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (btn) btn.hidden = false;
  });
  if (btn) {
    btn.addEventListener('click', async function () {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      btn.hidden = true;
    });
  }
  // Après quelques secondes, si Chrome n'a pas proposé l'installation automatique,
  // on donne quand même le chemin manuel plutôt que de laisser un bouton inactif.
  setTimeout(function () {
    if (!deferred) showBanner("📲 Pas de bouton d'installation automatique ? Ouvre le menu ⋮ du navigateur puis « Installer l'application » (ou « Ajouter à l'écran d'accueil »).");
  }, 4000);
  window.addEventListener('appinstalled', function () { if (btn) btn.hidden = true; banners.forEach(function (b) { b.hidden = true; }); });
})();

/* ---------------- 19. Thème clair / sombre / auto ---------------- */
(function themeSwitch() {
  var KEY = 'faxtrix-theme';
  var mql = window.matchMedia('(prefers-color-scheme: dark)');
  function apply(mode) {
    var dark = mode === 'dark' || (mode === 'auto' && mql.matches);
    document.body.setAttribute('data-theme', dark ? 'dark' : 'light');
    $$('#themeSwitch button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-theme-choice') === mode); });
  }
  var current = localStorage.getItem(KEY) || 'auto';
  apply(current);
  $$('#themeSwitch button').forEach(function (b) {
    b.addEventListener('click', function () {
      current = b.getAttribute('data-theme-choice');
      try { localStorage.setItem(KEY, current); } catch (e) {}
      apply(current);
    });
  });
  mql.addEventListener('change', function () { if (current === 'auto') apply('auto'); });
})();

/* ---------------- 20. Suivi & statistiques ---------------- */
function suiviLabel(action, entity) {
  var map = {created:'Création',updated:'Modification',deleted:'Suppression'};
  var em = {clients:'client',tickets:'ticket',terrain_missions:'mission terrain',team_members:'membre d’équipe',automation_rules:'règle d’automatisation'};
  return (map[action] || action || 'Action') + ' · ' + (em[entity] || entity || 'donnée');
}
function renderSuivi() {
  var s = state.statistics;
  if (!s) {
    ['#suiviClients','#suiviTickets','#suiviMissions','#suiviActions'].forEach(function(id){var e=$(id);if(e)e.textContent='—';});
    var k=$('#suiviKpis'); if(k)k.innerHTML='<div class="app-empty">Les statistiques de suivi ne sont pas encore disponibles.</div>';
    var ac=$('#suiviActivity'); if(ac)ac.innerHTML='<div class="app-empty">Aucune activité.</div>';
    return;
  }
  $('#suiviClients').textContent=s.clients_total||0;
  $('#suiviTickets').textContent=s.tickets_total||0;
  $('#suiviMissions').textContent=s.missions_total||0;
  $('#suiviActions').textContent=s.activity_total||0;
  $('#suiviKpis').innerHTML=[
    ['Tickets ouverts',s.tickets_open||0],['Tickets résolus',s.tickets_resolved||0],
    ['Clients actifs',s.clients_active||0],['Pipeline CRM',fcfa(s.pipeline_value||0)],
    ['Missions en cours',s.missions_active||0],['Missions terminées',s.missions_completed||0],
    ['Membres d’équipe',s.team_total||0],['Automatisations actives',s.automations_live||0]
  ].map(function(x){return '<div class="app-row"><div class="r-main"><b>'+escapeHtml(x[0])+'</b><span>Valeur actuelle</span></div><strong>'+escapeHtml(String(x[1]))+'</strong></div>';}).join('');
  var acts=s.recent_activity||[];
  $('#suiviActivity').innerHTML=acts.length?acts.map(function(x){return '<div class="app-row"><div class="r-main"><b>'+escapeHtml(suiviLabel(x.action,x.entity_type))+'</b><span>'+timeAgo(x.created_at)+'</span></div></div>';}).join(''):'<div class="app-empty">Aucune activité enregistrée.</div>';
  var svg=$('#suiviChart'); if(!svg)return;
  var days=s.daily_activity||[];
  var max=Math.max.apply(null,days.map(function(x){return Number(x.count||0);}).concat([1]));
  var w=600/(days.length||1),out='';
  days.forEach(function(d,i){var n=Number(d.count||0),hh=Math.max(4,(n/max)*120);out+='<rect class="bar" x="'+(i*w+w*.2)+'" y="'+(140-hh)+'" width="'+(w*.6)+'" height="'+hh+'" rx="6"/><text x="'+(i*w+w/2)+'" y="160" text-anchor="middle">'+escapeHtml(String(d.label||''))+'</text>';if(n)out+='<text x="'+(i*w+w/2)+'" y="'+(134-hh)+'" text-anchor="middle" style="fill:var(--accent)">'+n+'</text>';});
  svg.innerHTML=out;
}

/* ---------------- 20. Rapports (graphique animé) ---------------- */
var repRange = 7;
$$('#rapportsRange button').forEach(function (b) {
  b.addEventListener('click', function () {
    $$('#rapportsRange button').forEach(function (x) { x.classList.remove('active'); });
    b.classList.add('active'); repRange = Number(b.getAttribute('data-range')); renderReports();
  });
});
function renderReports() {
  var svg = $('#repChart'); if (!svg) return;
  var since = Date.now() - repRange * 86400000;
  var inRange = state.tickets.filter(function (t) { return new Date(t.created_at).getTime() >= since; });
  $('#repTickets').textContent = inRange.filter(function (t) { return t.statut === 'Résolu' || t.statut === 'Fermé'; }).length;
  $('#repClients').textContent = state.crm.length;
  $('#repValeur').textContent = fcfa(state.crm.reduce(function (s, c) { return s + Number(c.valeur || 0); }, 0));
  $('#repMissions').textContent = state.terrain.length;
  var days = Math.min(repRange, 14), buckets = [], i;
  for (i = days - 1; i >= 0; i--) {
    var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    buckets.push({ label: d.getDate() + '/' + (d.getMonth() + 1), start: d.getTime(), n: 0 });
  }
  state.tickets.forEach(function (t) {
    var ts = new Date(t.created_at).getTime();
    buckets.forEach(function (b) { if (ts >= b.start && ts < b.start + 86400000) b.n++; });
  });
  var max = Math.max.apply(null, buckets.map(function (b) { return b.n; }).concat([1]));
  var w = 600 / buckets.length, out = '<defs><linearGradient id="repGrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FF7A00"/><stop offset="1" stop-color="#FFB45C"/></linearGradient></defs>';
  buckets.forEach(function (b, k) {
    var h = Math.max(4, (b.n / max) * 120);
    out += '<rect class="bar" style="animation-delay:' + (k * 45) + 'ms" x="' + (k * w + w * 0.2) + '" y="' + (130 - h) + '" width="' + (w * 0.6) + '" height="' + h + '" rx="6"/>';
    out += '<text x="' + (k * w + w / 2) + '" y="150" text-anchor="middle">' + b.label + '</text>';
    if (b.n) out += '<text x="' + (k * w + w / 2) + '" y="' + (124 - h) + '" text-anchor="middle" style="fill:var(--accent)">' + b.n + '</text>';
  });
  svg.innerHTML = out;
}

/* compteurs KPI animés */
var kpiSeen = {};
function animateKpis() {
  $$('.app-stat b').forEach(function (el) {
    var txt = el.textContent, num = parseFloat(txt.replace(/[^\d.]/g, ''));
    if (isNaN(num) || kpiSeen[el.id] === txt || txt.indexOf('€') !== -1) return;
    kpiSeen[el.id] = txt;
    var start = performance.now();
    (function tick(now) {
      var p = Math.min(1, (now - start) / 700), v = Math.round(num * (1 - Math.pow(1 - p, 3)));
      el.textContent = v; if (p < 1) requestAnimationFrame(tick); else el.textContent = txt;
    })(start);
  });
}

/* ---------------- 21. Assistant (règles sur vos vraies données) ---------------- */
function aiAnswer(q) {
  q = q.toLowerCase();
  var open = state.tickets.filter(function (t) { return t.statut !== 'Résolu' && t.statut !== 'Fermé'; });
  if (/ticket/.test(q) && /(ouvert|résum|resum|combien|urgent)/.test(q)) {
    if (!open.length) return "Tout est sous contrôle : aucun ticket ouvert.";
    var haute = open.filter(function (t) { return t.priorite === 'Haute'; });
    return open.length + " ticket(s) ouvert(s), dont " + haute.length + " en priorité haute. Les plus récents : " +
      open.slice(0, 3).map(function (t) { return '« ' + t.titre + ' »'; }).join(', ') + '.';
  }
  if (/(technicien|disponible|équipe|equipe)/.test(q)) {
    var dispo = state.equipes.filter(function (m) { return m.statut === 'Disponible'; });
    return dispo.length ? dispo.length + " membre(s) disponible(s) : " + dispo.map(function (m) { return m.nom + ' (' + m.charge + '% de charge)'; }).join(', ') + '.'
      : "Personne n'est marqué « Disponible » pour le moment.";
  }
  if (/(pipeline|crm|client|vente)/.test(q)) {
    var total = state.crm.reduce(function (s, c) { return s + Number(c.valeur || 0); }, 0);
    return state.crm.length + " client(s) pour " + fcfa(total) + " au total, dont " + state.crm.filter(function (c) { return c.statut === 'Négociation'; }).length + " en négociation.";
  }
  if (/(mission|terrain|intervention)/.test(q)) {
    return state.terrain.filter(function (t) { return t.statut === 'En cours'; }).length + " mission(s) en cours sur " + state.terrain.length + " au total.";
  }
  if (/(crée|creer|créer|nouveau).*ticket/.test(q)) { showPanel('tickets'); $('#tkAddBtn').click(); return "J'ouvre le formulaire de nouveau ticket."; }
  return "Je sais répondre sur vos tickets, clients, équipe et missions. Essayez : « Résume mes tickets ouverts ».";
}
function aiSay(text, who) {
  var log = $('#aiLog'), m = document.createElement('div');
  m.className = 'ai-msg ' + who; m.textContent = text; log.appendChild(m); log.scrollTop = log.scrollHeight; return m;
}
function aiAsk(q) {
  if (!q.trim()) return;
  aiSay(q, 'user');
  var t = document.createElement('div'); t.className = 'ai-msg bot'; t.innerHTML = '<span class="ai-typing"><i></i><i></i><i></i></span>';
  $('#aiLog').appendChild(t);
  setTimeout(function () { t.textContent = aiAnswer(q); $('#aiLog').scrollTop = 9999; }, 650);
}
$('#aiForm').addEventListener('submit', function (e) { e.preventDefault(); var i = $('#aiInput'); aiAsk(i.value); i.value = ''; });
$$('[data-ai-suggest]').forEach(function (b) { b.addEventListener('click', function () { aiAsk(b.getAttribute('data-ai-suggest')); }); });
aiSay("Bonjour ! Je peux résumer vos tickets, vos clients, votre équipe et vos missions.", 'bot');

/* ---------------- 22. Sécurité ---------------- */
$('#pwdForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var st = $('[data-status]', e.target), res = await sb.auth.updateUser({ password: $('#pwdNew').value });
  st.setAttribute('data-state', res.error ? 'err' : 'ok');
  st.textContent = res.error ? authErrorFr(res.error.message) : 'Mot de passe mis à jour.';
  if (!res.error) e.target.reset();
});
$('#logoutAllBtn').addEventListener('click', async function () { await sb.auth.signOut({ scope: 'global' }); location.reload(); });

/* ---------------- 23. Recherche globale ---------------- */
var searchModal = $('#searchModal');
function openSearch() { searchModal.classList.add('on'); setTimeout(function () { $('#searchInput').focus(); }, 60); renderSearch(''); }
function closeSearch() { searchModal.classList.remove('on'); }
$('#searchBtn').addEventListener('click', openSearch);
$$('[data-search-close]').forEach(function (el) { el.addEventListener('click', closeSearch); });
document.addEventListener('keydown', function (e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !$('#appShell').classList.contains('app-hidden')) { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape') closeSearch();
});
$('#searchInput').addEventListener('input', function (e) { renderSearch(e.target.value.trim().toLowerCase()); });
function renderSearch(q) {
  var groups = [
    ['Tickets', 'tickets', state.tickets.filter(function (t) { return !q || t.titre.toLowerCase().indexOf(q) !== -1; }), function (t) { return [t.titre, t.statut + ' · ' + t.priorite]; }],
    ['Clients', 'crm', state.crm.filter(function (c) { return !q || c.nom.toLowerCase().indexOf(q) !== -1; }), function (c) { return [c.nom, c.statut + ' · ' + fcfa(c.valeur)]; }],
    ['Équipe', 'equipes', state.equipes.filter(function (m) { return !q || m.nom.toLowerCase().indexOf(q) !== -1 || (m.role || '').toLowerCase().indexOf(q) !== -1; }), function (m) { return [m.nom, (m.role || '—') + ' · ' + m.statut]; }]
  ], html = '';
  groups.forEach(function (g) {
    if (!g[2].length) return;
    html += '<div class="sr-group">' + g[0] + '</div>' + g[2].slice(0, 5).map(function (it) {
      var d = g[3](it); return '<div class="sr-item" data-go="' + g[1] + '"><b>' + escapeHtml(d[0]) + '</b><span>' + escapeHtml(d[1]) + '</span></div>';
    }).join('');
  });
  $('#searchResults').innerHTML = html || '<div class="app-empty">Aucun résultat.</div>';
  $$('.sr-item', $('#searchResults')).forEach(function (el) { el.addEventListener('click', function () { closeSearch(); showPanel(el.getAttribute('data-go')); }); });
}

/* ---------------- 24. Connexion réseau ---------------- */
(function netState() {
  var pill = null;
  function show(ok, msg) {
    if (pill) pill.remove();
    pill = document.createElement('div'); pill.className = 'net-pill' + (ok ? ' ok' : ''); pill.textContent = msg; document.body.appendChild(pill);
    if (ok) setTimeout(function () { if (pill) { pill.remove(); pill = null; } }, 2200);
  }
  window.addEventListener('offline', function () { show(false, "Vous êtes hors connexion — synchronisation au retour du réseau."); });
  window.addEventListener('online', function () { show(true, 'Connexion rétablie'); });
})();

/* ---------------- 25. Mises à jour de l'application ---------------- */
var APP_VERSION = '1.0.0';
var PLATFORM = (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'android') ? 'android'
  : (navigator.userAgent.indexOf('Electron') !== -1 ? 'desktop' : 'web');
function cmpVer(a, b) {
  var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (var i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return 1; if ((x[i] || 0) < (y[i] || 0)) return -1; }
  return 0;
}
async function checkForUpdate(force) {
  try {
    var last = Number(localStorage.getItem('faxtrix-upd-check') || 0);
    if (!force && Date.now() - last < 6 * 3600 * 1000) return;           // pas de requêtes inutiles : 1 vérification / 6 h
    var res = await sb.from('app_versions').select('*').eq('platform', PLATFORM).maybeSingle();
    localStorage.setItem('faxtrix-upd-check', String(Date.now()));
    var v = res.data; if (!v || cmpVer(v.latest_version, APP_VERSION) <= 0) return;
    var mustUpdate = v.force_update || cmpVer(APP_VERSION, v.minimum_version) < 0;
    var snoozed = Number(localStorage.getItem('faxtrix-upd-snooze') || 0);
    if (!mustUpdate && Date.now() < snoozed) return;                      // « Plus tard » respecté 24 h
    $('#updateTitle').textContent = mustUpdate ? 'Mise à jour requise' : 'Une nouvelle version est prête';
    $('#updateBody').textContent = 'Version ' + APP_VERSION + ' → ' + v.latest_version + '. ' + (v.release_notes || 'Plus rapide, plus sûre et avec de nouvelles fonctionnalités.') +
      (mustUpdate ? ' Pour continuer à utiliser FAXTRIX, installez la dernière version.' : '');
    $('#updateLaterBtn').style.display = mustUpdate ? 'none' : '';
    var link = $('#updateNowBtn'); link.href = v.download_url || location.href;
    link.onclick = function (e) { if (!v.download_url || PLATFORM === 'web') { e.preventDefault(); navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(function (r) { r.forEach(function (x) { x.unregister(); }); }); caches && caches.keys().then(function (k) { k.forEach(function (n) { caches.delete(n); }); }); location.reload(true); } };
    $('#updateModal').classList.add('on');
  } catch (e) { /* hors ligne : on réessaiera */ }
}
$('#updateLaterBtn').addEventListener('click', function () { localStorage.setItem('faxtrix-upd-snooze', String(Date.now() + 24 * 3600 * 1000)); $('#updateModal').classList.remove('on'); });
document.addEventListener('visibilitychange', function () { if (!document.hidden && !$('#appShell').classList.contains('app-hidden')) checkForUpdate(false); });
setTimeout(function () { checkForUpdate(false); }, 2500);
var verEl = document.createElement('div'); verEl.className = 'profile-row'; verEl.innerHTML = '<span>Version</span><span>' + APP_VERSION + ' · ' + PLATFORM + '</span>';
var ps = $('#profCompanyName'); if (ps && ps.parentNode) ps.parentNode.parentNode.insertBefore(verEl, ps.parentNode.nextSibling);

})();
, locale: 'en-US', suffix: ' 
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function timeAgo(iso) {
  if (!iso) return '';
  var diff = Math.max(0, Date.now() - new Date(iso).getTime());
  var min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return "il y a " + min + " min";
  var h = Math.floor(min / 60);
  if (h < 24) return "il y a " + h + "h";
  return "il y a " + Math.floor(h / 24) + "j";
}
function fmtElapsed(ms) {
  var s = Math.floor(ms / 1000);
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return p(h) + ':' + p(m) + ':' + p(sec);
}
function authErrorFr(msg) {
  if (!msg) return 'Une erreur est survenue.';
  if (msg === 'Invalid login credentials') return 'E-mail ou mot de passe incorrect.';
  if (/email not confirmed/i.test(msg)) return "Votre e-mail n'est pas encore confirmé. Vérifiez votre boîte de réception (et les indésirables), puis cliquez sur le lien reçu.";
  if (/user already registered/i.test(msg)) return 'Un compte existe déjà avec cet e-mail. Connectez-vous plutôt.';
  return msg;
}

/* ---------------- 1. Client Supabase ---------------- */
var SUPABASE_URL = 'https://xtkcfhbsksoqbpnaciga.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0a2NmaGJza3NvcWJwbmFjaWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNDY4ODEsImV4cCI6MjEwNTkyMjg4MX0.Drrgf-6Axsdf3u1tHXhn3UoIhTC0Tu291ER0NAQQhTQ';
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storageKey: 'faxtrix-client-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

var state = {
  profile: { id: null, company_id: null, full_name: '', company_name: '', role: 'owner' },
  crm: [], tickets: [], terrain: [], equipes: [], automations: [], notifications: [], invitations: [], statistics: null
};

/* ---------------- 2. Porte d'entrée (connexion / inscription / mot de passe) ---------------- */
(function gate() {
  var gateEl = $('#gate'), shell = $('#appShell');
  var loginForm = $('#gateForm'), signupForm = $('#signupForm');
  var resetForm = $('#resetForm'), newPassForm = $('#newPassForm');

  $$('#gateTabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#gateTabs button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      var tab = b.getAttribute('data-gate-tab');
      loginForm.hidden = tab !== 'login';
      signupForm.hidden = tab !== 'signup';
      resetForm.hidden = true; newPassForm.hidden = true;
      $('#gateTitle').textContent = tab === 'login' ? 'Connexion' : 'Créer votre entreprise';
      $('#gateSub').textContent = tab === 'login' ? 'Accédez à votre espace FAXTRIX.' : 'Un espace FAXTRIX dédié et isolé pour votre entreprise.';
    });
  });

  $('#forgotLink').addEventListener('click', function (e) {
    e.preventDefault();
    loginForm.hidden = true; resetForm.hidden = false;
    $('#gateTitle').textContent = 'Mot de passe oublié';
    $('#gateSub').textContent = 'On vous envoie un lien pour le réinitialiser.';
  });
  $('#backToLoginLink').addEventListener('click', function (e) {
    e.preventDefault();
    resetForm.hidden = true; loginForm.hidden = false;
    $('#gateTitle').textContent = 'Connexion';
    $('#gateSub').textContent = 'Accédez à votre espace FAXTRIX.';
  });

  function setStatus(form, ok, msg) {
    var el = $('[data-status]', form);
    el.setAttribute('data-state', ok ? 'ok' : 'err');
    el.textContent = msg;
  }

  async function enter() {
    var ok = await loadAll();
    if (!ok) return;
    gateEl.classList.add('app-hidden');
    shell.classList.remove('app-hidden');
    boot();
  }

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = $('#gateEmail').value.trim();
    var pass = $('#gatePass').value;
    setStatus(loginForm, true, 'Connexion en cours…');
    var res = await sb.auth.signInWithPassword({ email: email, password: pass });
    if (res.error) { setStatus(loginForm, false, authErrorFr(res.error.message)); return; }
    setStatus(loginForm, true, 'Connecté.');
    enter();
  });

  /* ---- assistant d'inscription en 3 étapes ---- */
  var stepEl = 1, totalSteps = 3;
  var stepPrevBtn = $('#stepPrev'), stepNextBtn = $('#stepNext'), stepSubmitBtn = $('#stepSubmit');
  function showStep(n) {
    stepEl = n;
    $$('.gate-step-panel').forEach(function (p) { p.classList.toggle('active', Number(p.getAttribute('data-step')) === n); });
    $$('.gate-step[data-step-dot]').forEach(function (d) {
      var num = Number(d.getAttribute('data-step-dot'));
      d.classList.toggle('active', num === n);
      d.classList.toggle('done', num < n);
    });
    stepPrevBtn.hidden = n === 1;
    stepNextBtn.hidden = n === totalSteps;
    stepSubmitBtn.hidden = n !== totalSteps;
  }
  function validateStep(n) {
    var ids = n === 1 ? ['suName', 'suEmail'] : n === 2 ? ['suCompany'] : [];
    for (var i = 0; i < ids.length; i++) {
      var el = $('#' + ids[i]);
      if (!el.checkValidity()) { el.reportValidity(); return false; }
    }
    if (n === 3) {
      if (!$('#suPass').checkValidity()) { $('#suPass').reportValidity(); return false; }
      if ($('#suPass').value !== $('#suPass2').value) { setStatus(signupForm, false, 'Les deux mots de passe ne correspondent pas.'); return false; }
      if (!$('#suTerms').checked) { setStatus(signupForm, false, "Merci d'accepter les conditions d'utilisation."); return false; }
    }
    return true;
  }
  stepNextBtn.addEventListener('click', function () { if (validateStep(stepEl)) showStep(Math.min(totalSteps, stepEl + 1)); });
  stepPrevBtn.addEventListener('click', function () { showStep(Math.max(1, stepEl - 1)); });

  var pwdMeter = $('#pwdMeter'), pwdLabel = $('#pwdMeterLabel');
  $('#suPass').addEventListener('input', function (e) {
    var v = e.target.value, score = 0;
    if (v.length >= 6) score++;
    if (v.length >= 10) score++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
    if (/[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v)) score++;
    pwdMeter.className = 'pwd-meter ' + (v ? 'w' + Math.max(1, score) : '');
    pwdLabel.textContent = !v ? '\u00a0' : ['Faible', 'Faible', 'Moyen', 'Bon', 'Excellent'][score];
  });

  signupForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!validateStep(3)) return;
    var company = $('#suCompany').value.trim();
    var fullName = $('#suName').value.trim();
    var email = $('#suEmail').value.trim();
    var pass = $('#suPass').value;
    setStatus(signupForm, true, 'Création de votre espace…');
    var res = await sb.auth.signUp({
      email: email, password: pass,
      options: { data: {
        company_name: company, full_name: fullName,
        phone: $('#suPhone').value.trim(), sector: $('#suSector').value,
        company_size: $('#suSize').value, country: $('#suCountry').value.trim(), city: $('#suCity').value.trim()
      } }
    });
    if (res.error) { setStatus(signupForm, false, authErrorFr(res.error.message)); return; }
    if (!res.data.session) {
      setStatus(signupForm, true, 'Compte créé. Confirmez votre adresse via l\u2019e-mail que nous venons d\u2019envoyer, puis connectez-vous.');
      return;
    }
    setStatus(signupForm, true, 'Espace créé.');
    enter();
  });

  resetForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = $('#resetEmail').value.trim();
    setStatus(resetForm, true, 'Envoi en cours…');
    var res = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    if (res.error) { setStatus(resetForm, false, authErrorFr(res.error.message)); return; }
    setStatus(resetForm, true, 'E-mail envoyé, si ce compte existe. Suivez le lien reçu pour choisir un nouveau mot de passe.');
  });

  newPassForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var pass = $('#newPass').value;
    setStatus(newPassForm, true, 'Mise à jour…');
    var res = await sb.auth.updateUser({ password: pass });
    if (res.error) { setStatus(newPassForm, false, authErrorFr(res.error.message)); return; }
    setStatus(newPassForm, true, 'Mot de passe mis à jour. Connexion…');
    setTimeout(enter, 700);
  });

  // Lien de réinitialisation cliqué : Supabase ouvre une session "recovery" et déclenche cet évènement.
  sb.auth.onAuthStateChange(function (event) {
    if (event === 'PASSWORD_RECOVERY') {
      loginForm.hidden = true; signupForm.hidden = true; resetForm.hidden = true; newPassForm.hidden = false;
      $('#gateTitle').textContent = 'Nouveau mot de passe';
      $('#gateSub').textContent = 'Choisissez un nouveau mot de passe pour votre compte.';
    }
  });

  // Session déjà active (retour sur le site) ?
  sb.auth.getSession().then(function (res) {
    if (res.data.session && window.location.hash.indexOf('type=recovery') === -1) enter();
  });
})();

/* ---------------- 3. Chargement des données depuis Supabase ---------------- */
async function loadAll() {
  var userRes = await sb.auth.getUser();
  var user = userRes.data && userRes.data.user;
  if (!user) return false;

  var profRes = await sb.from('profiles').select('id, company_id, full_name, role, companies(name)').eq('id', user.id).single();
  if (profRes.error || !profRes.data) {
    toast("Impossible de charger votre profil.", 'crit');
    return false;
  }
  state.profile.id = profRes.data.id;
  state.profile.company_id = profRes.data.company_id;
  state.profile.full_name = profRes.data.full_name || user.email;
  state.profile.role = profRes.data.role;
  state.profile.company_name = (profRes.data.companies && profRes.data.companies.name) || '';

  var results = await Promise.all([
    sb.from('clients').select('*').order('created_at', { ascending: false }),
    sb.from('tickets').select('*').order('created_at', { ascending: false }),
    sb.from('terrain_missions').select('*').order('created_at', { ascending: false }),
    sb.from('team_members').select('*').order('created_at', { ascending: false }),
    sb.from('automation_rules').select('*').order('created_at', { ascending: false }),
    sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(40),
    state.profile.role === 'owner'
      ? sb.from('invitations').select('*').order('created_at', { ascending: false })
      : Promise.resolve({ data: [] })
  ]);
  state.crm = results[0].data || [];
  state.tickets = results[1].data || [];
  state.terrain = results[2].data || [];
  state.equipes = results[3].data || [];
  state.automations = results[4].data || [];
  state.notifications = results[5].data || [];
  state.invitations = results[6].data || [];
  var statsRes = await sb.rpc('my_company_statistics');
  state.statistics = statsRes.error ? null : (statsRes.data || null);
  return true;
}

function withCompany(obj) {
  obj.company_id = state.profile.company_id;
  return obj;
}

async function notify(msg, kind) {
  var res = await sb.from('notifications').insert(withCompany({ msg: msg, read: false })).select().single();
  if (!res.error) { state.notifications.unshift(res.data); renderNotifBadge(); }
  toast(msg, kind);
}
function toast(msg, kind) {
  var wrap = $('#toastWrap'); if (!wrap) return;
  var el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.innerHTML = '<i></i><span>' + escapeHtml(msg) + '</span>';
  wrap.appendChild(el);
  setTimeout(function () { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; el.style.transition = 'all .3s ease'; }, 3200);
  setTimeout(function () { wrap.removeChild(el); }, 3600);
}

/* ---------------- 4. Navigation entre panneaux ---------------- */
var panelTitles = {
  accueil: ['Bonjour', 'Voici un aperçu de votre espace FAXTRIX.'],
  services: ['Services', 'Support, interventions, CRM et outils de votre entreprise.'],
  crm: ['CRM', 'Prospects, opportunités et clients actifs.'],
  tickets: ['Tickets', 'Suivi des demandes de support.'],
  terrain: ['Terrain', 'Missions et interventions en cours.'],
  equipes: ['Équipes', "Charge de travail et disponibilité."],
  automatisation: ['Automatisation', 'Règles déclenchées par vos actions.'],
  intelligence: ['Business Brain', 'Analyse en direct de vos données.'],
  simulation: ['Decision Simulator', 'Testez une décision avant de la prendre.'],
  rapports: ['Rapports & Analyses', 'Vos indicateurs en temps réel.'],
  assistant: ['Assistant IA', 'Posez une question sur vos données.'],
  securite: ['Sécurité & accès', 'Mot de passe et sessions.'],
  parametres: ['Paramètres', 'Profil et session.']
};
function showPanel(name) {
  $$('.app-nav button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-panel') === name); });
  $$('.mobile-tabbar button[data-panel]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-panel') === name); });
  $$('.app-panel').forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-panel') === name); });
  var meta = panelTitles[name];
  if (meta) {
    var greetName = state.profile.full_name || 'Albert';
    $('#topTitle').textContent = name === 'accueil' ? ('Bonjour ' + greetName) : meta[0];
    $('#topSub').textContent = meta[1];
  }
  $('#appSide').classList.remove('open');
  var serviceSheet = $('#servicesSheet'); if (serviceSheet) serviceSheet.classList.remove('on');
  renderAll();
}
$$('.app-nav button').forEach(function (b) {
  b.addEventListener('click', function () { showPanel(b.getAttribute('data-panel')); });
});
$$('.mobile-tabbar button[data-panel]').forEach(function (b) {
  b.addEventListener('click', function () { showPanel(b.getAttribute('data-panel')); });
});
$$('[data-go]').forEach(function (b) {
  b.addEventListener('click', function () {
    var t = b.getAttribute('data-go');
    if (t === 'services-sheet') { $('#servicesSheet').classList.add('on'); return; }
    showPanel(t);
    if (b.hasAttribute('data-open-ticket')) setTimeout(function () { $('#tkAddBtn').click(); }, 250);
  });
});
var servicesTabBtn = $('#servicesTabBtn');
if (servicesTabBtn) servicesTabBtn.addEventListener('click', function () { $('#servicesSheet').classList.add('on'); });
$$('[data-services-close]').forEach(function (el) { el.addEventListener('click', function () { $('#servicesSheet').classList.remove('on'); }); });
var moreTabBtn = $('#moreTabBtn');
if (moreTabBtn) moreTabBtn.addEventListener('click', function () { $('#plusSheet').classList.add('on'); });
$$('[data-plus-close]').forEach(function (el) { el.addEventListener('click', function () { $('#plusSheet').classList.remove('on'); }); });
var plusLogoutBtn = $('#plusLogoutBtn');
if (plusLogoutBtn) plusLogoutBtn.addEventListener('click', function () { doLogout(); });

/* ---------------- 5. Tiroir générique (ajout / édition) ---------------- */
var drawer = $('#drawer');
var drawerForms = { crm: $('#crmForm'), tk: $('#tkForm'), te: $('#teForm'), eq: $('#eqForm'), auto: $('#autoForm') };
function openDrawer(kind, title) {
  $('#drawerTitle').textContent = title;
  Object.keys(drawerForms).forEach(function (k) { drawerForms[k].hidden = k !== kind; });
  drawer.classList.add('on');
}
function closeDrawer() { drawer.classList.remove('on'); }
$$('[data-drawer-close]').forEach(function (el) { el.addEventListener('click', closeDrawer); });

var notifDrawer = $('#notifDrawer');
$$('[data-drawer-close-notif]').forEach(function (el) { el.addEventListener('click', function () { notifDrawer.classList.remove('on'); }); });
$('#notifBtn').addEventListener('click', async function () {
  notifDrawer.classList.add('on');
  var unread = state.notifications.filter(function (n) { return !n.read; }).map(function (n) { return n.id; });
  state.notifications.forEach(function (n) { n.read = true; });
  renderNotifBadge();
  renderNotifList();
  if (unread.length) await sb.from('notifications').update({ read: true }).in('id', unread);
});

/* ---------------- 6. CRM ---------------- */
var crmFilter = 'Tous', crmQuery = '';
$('#crmAddBtn').addEventListener('click', function () {
  $('#crmForm').reset(); $('#crmId').value = '';
  openDrawer('crm', 'Nouveau client');
});
$$('#crmTabs button').forEach(function (b) {
  b.addEventListener('click', function () {
    $$('#crmTabs button').forEach(function (x) { x.classList.remove('active'); });
    b.classList.add('active'); crmFilter = b.getAttribute('data-filter'); renderCrm();
  });
});
$('#crmSearch').addEventListener('input', function (e) { crmQuery = e.target.value.trim().toLowerCase(); renderCrm(); });
$('#crmForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var id = $('#crmId').value;
  var data = { nom: $('#crmNom').value.trim(), statut: $('#crmStatut').value, valeur: Number($('#crmValeurInput').value || 0) };
  if (id) {
    var res = await sb.from('clients').update(data).eq('id', id).select().single();
    if (!res.error) { var item = state.crm.find(function (c) { return c.id === id; }); if (item) Object.assign(item, res.data); }
  } else {
    var res2 = await sb.from('clients').insert(withCompany(data)).select().single();
    if (!res2.error) { state.crm.unshift(res2.data); notify('Nouveau client ajouté : ' + data.nom, 'ok'); }
  }
  closeDrawer(); renderAll();
});
function editCrm(id) {
  var c = state.crm.find(function (x) { return x.id === id; }); if (!c) return;
  $('#crmId').value = c.id; $('#crmNom').value = c.nom; $('#crmStatut').value = c.statut; $('#crmValeurInput').value = c.valeur;
  openDrawer('crm', 'Modifier le client');
}
async function deleteCrm(id) {
  state.crm = state.crm.filter(function (x) { return x.id !== id; }); renderAll();
  await sb.from('clients').delete().eq('id', id);
}
function renderCrm() {
  var list = $('#crmList');
  var rows = state.crm.filter(function (c) {
    var okFilter = crmFilter === 'Tous' || c.statut === crmFilter;
    var okQuery = !crmQuery || c.nom.toLowerCase().indexOf(crmQuery) !== -1;
    return okFilter && okQuery;
  });
  list.innerHTML = rows.length ? rows.map(function (c) {
    var chipClass = c.statut === 'Actif' ? 'ok' : (c.statut === 'Négociation' ? 'mid' : (c.statut === 'Attente' ? 'crit' : ''));
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(c.nom) + '</b><span>' + fcfa(c.valeur) + '</span></div>' +
      '<span class="chip ' + chipClass + '">' + c.statut + '</span>' +
      '<div class="app-row-actions"><button class="row-btn" data-crm-edit="' + c.id + '">✎</button><button class="row-btn" data-crm-del="' + c.id + '">🗑</button></div></div>';
  }).join('') : '<div class="app-empty">Aucun client pour ce filtre.</div>';

  $('#crmTotal').textContent = state.crm.length;
  $('#crmValeur').textContent = fcfa(state.crm.reduce(function (s, c) { return s + Number(c.valeur || 0); }, 0));
  $('#crmActifs').textContent = state.crm.filter(function (c) { return c.statut === 'Actif'; }).length;
  $('#crmNego').textContent = state.crm.filter(function (c) { return c.statut === 'Négociation'; }).length;
}

/* ---------------- 7. Tickets ---------------- */
var tkFilter = 'Tous', tkQuery = '';
$('#tkAddBtn').addEventListener('click', function () {
  $('#tkForm').reset(); $('#tkId').value = '';
  openDrawer('tk', 'Nouveau ticket');
});
$$('#tkTabs button').forEach(function (b) {
  b.addEventListener('click', function () {
    $$('#tkTabs button').forEach(function (x) { x.classList.remove('active'); });
    b.classList.add('active'); tkFilter = b.getAttribute('data-filter'); renderTickets();
  });
});
$('#tkSearch').addEventListener('input', function (e) { tkQuery = e.target.value.trim().toLowerCase(); renderTickets(); });
$('#tkForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var id = $('#tkId').value;
  var data = { titre: $('#tkTitre').value.trim(), client: $('#tkClient').value.trim(), priorite: $('#tkPriorite').value, statut: $('#tkStatut').value };
  if (id) {
    var res = await sb.from('tickets').update(data).eq('id', id).select().single();
    if (!res.error) { var item = state.tickets.find(function (t) { return t.id === id; }); if (item) Object.assign(item, res.data); }
  } else {
    var res2 = await sb.from('tickets').insert(withCompany(data)).select().single();
    if (!res2.error) {
      state.tickets.unshift(res2.data);
      if (data.priorite === 'Haute') {
        var rule = state.automations.find(function (a) { return a.live; });
        notify('Automatisation : ticket « ' + data.titre + '» en priorité haute — ' + (rule ? rule.action_text.toLowerCase() : 'équipe notifiée') + '.', 'crit');
      } else {
        notify('Nouveau ticket : ' + data.titre, 'ok');
      }
    }
  }
  closeDrawer(); renderAll();
});
function editTk(id) {
  var t = state.tickets.find(function (x) { return x.id === id; }); if (!t) return;
  $('#tkId').value = t.id; $('#tkTitre').value = t.titre; $('#tkClient').value = t.client; $('#tkPriorite').value = t.priorite; $('#tkStatut').value = t.statut;
  openDrawer('tk', 'Modifier le ticket');
}
async function deleteTk(id) {
  state.tickets = state.tickets.filter(function (x) { return x.id !== id; }); renderAll();
  await sb.from('tickets').delete().eq('id', id);
}
function renderTickets() {
  var list = $('#tkList');
  var rows = state.tickets.filter(function (t) {
    var okFilter = tkFilter === 'Tous' || t.statut === tkFilter;
    var okQuery = !tkQuery || t.titre.toLowerCase().indexOf(tkQuery) !== -1;
    return okFilter && okQuery;
  });
  list.innerHTML = rows.length ? rows.map(function (t) {
    var pClass = t.priorite === 'Haute' ? 'crit' : (t.priorite === 'Moyenne' ? 'mid' : 'ok');
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(t.titre) + '</b><span>' + escapeHtml(t.client || '—') + ' · ' + timeAgo(t.created_at) + '</span></div>' +
      '<span class="chip ' + pClass + '">' + t.priorite + '</span><span class="chip">' + t.statut + '</span>' +
      '<div class="app-row-actions"><button class="row-btn" data-tk-edit="' + t.id + '">✎</button><button class="row-btn" data-tk-del="' + t.id + '">🗑</button></div></div>';
  }).join('') : '<div class="app-empty">Aucun ticket pour ce filtre.</div>';

  $('#tkTotal').textContent = state.tickets.length;
  $('#tkOuverts').textContent = state.tickets.filter(function (t) { return t.statut !== 'Résolu' && t.statut !== 'Fermé'; }).length;
  $('#tkHaute').textContent = state.tickets.filter(function (t) { return t.priorite === 'Haute'; }).length;
  $('#tkResolus').textContent = state.tickets.filter(function (t) { return t.statut === 'Résolu'; }).length;
}

/* ---------------- 8. Terrain ---------------- */
$('#teAddBtn').addEventListener('click', function () {
  $('#teForm').reset(); $('#teId').value = '';
  openDrawer('te', 'Nouvelle mission');
});
$('#teForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var id = $('#teId').value;
  var data = { tech: $('#teTech').value.trim(), client: $('#teClient').value.trim(), statut: $('#teStatut').value };
  if (id) {
    var res = await sb.from('terrain_missions').update(data).eq('id', id).select().single();
    if (!res.error) { var item = state.terrain.find(function (x) { return x.id === id; }); if (item) Object.assign(item, res.data); }
  } else {
    data.started_at = data.statut === 'En cours' ? new Date().toISOString() : null; data.elapsed_ms = 0;
    var res2 = await sb.from('terrain_missions').insert(withCompany(data)).select().single();
    if (!res2.error) { state.terrain.unshift(res2.data); notify('Nouvelle mission assignée à ' + data.tech, 'ok'); }
  }
  closeDrawer(); renderAll();
});
function editTe(id) {
  var t = state.terrain.find(function (x) { return x.id === id; }); if (!t) return;
  $('#teId').value = t.id; $('#teTech').value = t.tech; $('#teClient').value = t.client; $('#teStatut').value = t.statut;
  openDrawer('te', 'Modifier la mission');
}
async function deleteTe(id) {
  state.terrain = state.terrain.filter(function (x) { return x.id !== id; }); renderAll();
  await sb.from('terrain_missions').delete().eq('id', id);
}
async function startTe(id) {
  var t = state.terrain.find(function (x) { return x.id === id; }); if (!t) return;
  t.statut = 'En cours'; t.started_at = new Date().toISOString();
  renderAll();
  await sb.from('terrain_missions').update({ statut: t.statut, started_at: t.started_at }).eq('id', id);
}
async function stopTe(id) {
  var t = state.terrain.find(function (x) { return x.id === id; }); if (!t) return;
  if (t.started_at) { t.elapsed_ms = (t.elapsed_ms || 0) + (Date.now() - new Date(t.started_at).getTime()); }
  t.statut = 'Terminée'; t.started_at = null;
  renderAll();
  await sb.from('terrain_missions').update({ statut: t.statut, started_at: null, elapsed_ms: t.elapsed_ms }).eq('id', id);
  notify('Mission terminée — ' + t.tech + ' (' + fmtElapsed(t.elapsed_ms) + ')', 'ok');
}
function renderTerrain() {
  var list = $('#teList');
  list.innerHTML = state.terrain.length ? state.terrain.map(function (t) {
    var live = t.statut === 'En cours' && t.started_at;
    var elapsed = (t.elapsed_ms || 0) + (live ? (Date.now() - new Date(t.started_at).getTime()) : 0);
    var chipClass = t.statut === 'En cours' ? 'mid' : (t.statut === 'Terminée' ? 'ok' : '');
    var actions = '<div class="app-row-actions">';
    if (t.statut !== 'En cours' && t.statut !== 'Terminée') actions += '<button class="row-btn" data-te-start="' + t.id + '">▶</button>';
    if (t.statut === 'En cours') actions += '<button class="row-btn" data-te-stop="' + t.id + '">⏸</button>';
    actions += '<button class="row-btn" data-te-edit="' + t.id + '">✎</button><button class="row-btn" data-te-del="' + t.id + '">🗑</button></div>';
    return '<div class="app-row" data-te-row="' + t.id + '"><div class="r-main"><b>' + escapeHtml(t.tech) + '</b><span>' + escapeHtml(t.client || '—') + '</span></div>' +
      '<span class="mono" data-te-timer="' + t.id + '" style="min-width:70px;text-align:right;">' + fmtElapsed(elapsed) + '</span>' +
      '<span class="chip ' + chipClass + '">' + t.statut + '</span>' + actions + '</div>';
  }).join('') : '<div class="app-empty">Aucune mission enregistrée.</div>';

  $('#teTotal').textContent = state.terrain.length;
  $('#teCours').textContent = state.terrain.filter(function (t) { return t.statut === 'En cours'; }).length;
  $('#tePlanif').textContent = state.terrain.filter(function (t) { return t.statut === 'Planifiée'; }).length;
  $('#teTerm').textContent = state.terrain.filter(function (t) { return t.statut === 'Terminée'; }).length;
}
setInterval(function () {
  $$('[data-te-timer]').forEach(function (el) {
    var id = el.getAttribute('data-te-timer');
    var t = state.terrain.find(function (x) { return x.id === id; });
    if (!t || t.statut !== 'En cours' || !t.started_at) return;
    el.textContent = fmtElapsed((t.elapsed_ms || 0) + (Date.now() - new Date(t.started_at).getTime()));
  });
}, 1000);

/* ---------------- 9. Équipes ---------------- */
$('#eqAddBtn').addEventListener('click', function () {
  $('#eqForm').reset(); $('#eqId').value = '';
  openDrawer('eq', 'Nouveau membre');
});
$('#eqForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var id = $('#eqId').value;
  var data = { nom: $('#eqNom').value.trim(), role: $('#eqRole').value.trim(), statut: $('#eqStatut').value, charge: Number($('#eqCharge').value || 0), email: $('#eqEmail').value.trim(), telephone: $('#eqTel').value.trim(), specialites: $('#eqSpec').value.trim() };
  if (id) {
    var res = await sb.from('team_members').update(data).eq('id', id).select().single();
    if (!res.error) { var item = state.equipes.find(function (x) { return x.id === id; }); if (item) Object.assign(item, res.data); }
  } else {
    var res2 = await sb.from('team_members').insert(withCompany(data)).select().single();
    if (!res2.error) { state.equipes.unshift(res2.data); notify(data.nom + ' a rejoint l\u2019équipe', 'ok'); }
  }
  closeDrawer(); renderAll();
});
function editEq(id) {
  var m = state.equipes.find(function (x) { return x.id === id; }); if (!m) return;
  $('#eqId').value = m.id; $('#eqNom').value = m.nom; $('#eqRole').value = m.role; $('#eqStatut').value = m.statut; $('#eqCharge').value = m.charge; $('#eqEmail').value = m.email || ''; $('#eqTel').value = m.telephone || ''; $('#eqSpec').value = m.specialites || '';
  openDrawer('eq', 'Modifier le membre');
}
async function deleteEq(id) {
  state.equipes = state.equipes.filter(function (x) { return x.id !== id; }); renderAll();
  await sb.from('team_members').delete().eq('id', id);
}
function renderEquipes() {
  var list = $('#eqList');
  list.innerHTML = state.equipes.length ? state.equipes.map(function (m) {
    var chipClass = m.statut === 'Disponible' ? 'ok' : (m.statut === 'En mission' ? 'crit' : 'mid');
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(m.nom) + '</b><span>' + escapeHtml(m.role || '—') + '</span></div>' +
      '<span class="mono" style="min-width:40px;">' + m.charge + '%</span>' +
      '<span class="chip ' + chipClass + '">' + m.statut + '</span>' +
      '<div class="app-row-actions"><button class="row-btn" data-eq-edit="' + m.id + '">✎</button><button class="row-btn" data-eq-del="' + m.id + '">🗑</button></div></div>';
  }).join('') : '<div class="app-empty">Aucun membre enregistré.</div>';
}

/* ---------------- 10. Automatisation ---------------- */
$('#autoAddBtn').addEventListener('click', function () {
  $('#autoForm').reset();
  openDrawer('auto', 'Nouvelle règle');
});
$('#autoForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var data = { trigger_text: $('#autoTrigger').value.trim(), action_text: $('#autoAction').value.trim(), live: false };
  var res = await sb.from('automation_rules').insert(withCompany(data)).select().single();
  if (!res.error) { state.automations.unshift(res.data); notify('Règle ajoutée : ' + data.trigger_text, 'ok'); }
  closeDrawer(); renderAll();
});
async function deleteAuto(id) {
  state.automations = state.automations.filter(function (x) { return x.id !== id; }); renderAll();
  await sb.from('automation_rules').delete().eq('id', id);
}
function renderAuto() {
  var wrap = $('#autoList');
  wrap.innerHTML = state.automations.length ? state.automations.map(function (a) {
    return '<div class="rule-row"><em>SI</em>' + escapeHtml(a.trigger_text) + '<em>ALORS</em>' + escapeHtml(a.action_text) +
      (a.live ? '<span class="chip ok">Active</span>' : '') +
      '<button class="row-btn r-x" data-auto-del="' + a.id + '">🗑</button></div>';
  }).join('') : '<div class="app-empty">Aucune règle définie.</div>';
}

/* ---------------- 11. Business Brain (calculs en direct) ---------------- */
function renderBrain() {
  var wrap = $('#brainList');
  var ticketsHaute = state.tickets.filter(function (t) { return t.priorite === 'Haute' && t.statut !== 'Résolu' && t.statut !== 'Fermé'; });
  var valeurNego = state.crm.filter(function (c) { return c.statut === 'Négociation'; }).reduce(function (s, c) { return s + Number(c.valeur || 0); }, 0);
  var nbNego = state.crm.filter(function (c) { return c.statut === 'Négociation'; }).length;
  var surcharge = state.equipes.filter(function (m) { return Number(m.charge) >= 80; });
  var missionsCours = state.terrain.filter(function (t) { return t.statut === 'En cours'; });
  var items = [];
  items.push(ticketsHaute.length
    ? { t: ticketsHaute.length + ' ticket' + (ticketsHaute.length > 1 ? 's' : '') + ' en priorité haute encore ouvert' + (ticketsHaute.length > 1 ? 's' : '') + '.', c: 'crit' }
    : { t: 'Aucun ticket critique ouvert en ce moment.', c: 'ok' });
  items.push(nbNego
    ? { t: nbNego + ' client' + (nbNego > 1 ? 's' : '') + ' en négociation, représentant ' + fcfa(valeurNego) + ' de pipeline.', c: 'mid' }
    : { t: 'Aucune négociation en cours.', c: '' });
  items.push(surcharge.length
    ? { t: surcharge.length + ' membre' + (surcharge.length > 1 ? 's' : '') + " d'équipe à plus de 80% de charge : " + surcharge.map(function (m) { return m.nom; }).join(', ') + '.', c: 'crit' }
    : { t: "Aucune surcharge d'équipe détectée.", c: 'ok' });
  items.push(missionsCours.length
    ? { t: missionsCours.length + ' mission' + (missionsCours.length > 1 ? 's' : '') + ' terrain en cours actuellement.', c: 'mid' }
    : { t: 'Aucune mission terrain en cours.', c: '' });

  wrap.innerHTML = items.map(function (it) {
    return '<div class="app-row"><div class="r-main"><span>' + it.t + '</span></div>' + (it.c ? '<span class="chip ' + it.c + '">' + (it.c === 'crit' ? 'Attention' : it.c === 'ok' ? 'Sain' : 'À suivre') + '</span>' : '') + '</div>';
  }).join('');
}

/* ---------------- 12. Decision Simulator ---------------- */
function renderSim() {
  var tech = Number($('#simTech').value);
  var delay = Number($('#simDelay').value);
  $('#simTechVal').textContent = tech;
  $('#simDelayVal').textContent = delay + '%';
  var prod = tech * 6 + delay * 0.4;
  var cost = tech * 4 - delay * 0.2;
  var risk = -(tech * 2 + delay * 0.3);
  $('#simProd').textContent = (prod >= 0 ? '+' : '') + prod.toFixed(1) + '%';
  $('#simCost').textContent = (cost >= 0 ? '+' : '') + cost.toFixed(1) + '%';
  $('#simRisk').textContent = risk.toFixed(1) + '%';
}
$('#simTech').addEventListener('input', renderSim);
$('#simDelay').addEventListener('input', renderSim);

/* ---------------- 13. Accueil ---------------- */
function renderPerfChart() {
  var svg = $('#perfChart'); if (!svg) return;
  var n = 14, pts = [], i;
  for (i = 0; i < n; i++) {
    var base = state.crm.length + state.tickets.length + state.terrain.length;
    pts.push(6 + ((base * 7 + i * 13) % 23) + i * 1.4);
  }
  var max = Math.max.apply(null, pts), min = Math.min.apply(null, pts);
  var w = 600, h = 100, step = w / (n - 1);
  var d = pts.map(function (v, k) { var y = h - ((v - min) / (max - min || 1)) * h; return (k === 0 ? 'M' : 'L') + (k * step) + ',' + y.toFixed(1); }).join(' ');
  var last = h - ((pts[n - 1] - min) / (max - min || 1)) * h;
  svg.innerHTML = '<defs><linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF7A00" stop-opacity=".28"/><stop offset="1" stop-color="#FF7A00" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + d + ' L ' + w + ',' + h + ' L 0,' + h + ' Z" fill="url(#perfFill)"/>' +
    '<path d="' + d + '" fill="none" stroke="#FF7A00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + w + '" cy="' + last + '" r="4.5" fill="#FF7A00"/>';
}
function renderAccueil() {
  $('#statClients').textContent = state.crm.length;
  $('#statTickets').textContent = state.tickets.filter(function (t) { return t.statut !== 'Résolu' && t.statut !== 'Fermé'; }).length;
  $('#statEquipes').textContent = state.equipes.length;
  $('#statMissions').textContent = state.terrain.filter(function (t) { return t.statut === 'En cours'; }).length;

  var acts = [];
  state.tickets.slice(0, 3).forEach(function (t) { acts.push({ label: 'Ticket : ' + t.titre, time: t.created_at }); });
  state.crm.slice(0, 2).forEach(function (c) { acts.push({ label: 'Client : ' + c.nom + ' (' + c.statut + ')', time: null }); });
  $('#activityList').innerHTML = acts.length ? acts.map(function (a) {
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(a.label) + '</b>' + (a.time ? '<span>' + timeAgo(a.time) + '</span>' : '') + '</div></div>';
  }).join('') : '<div class="app-empty">Aucune activité pour le moment.</div>';

  var statuts = ['Prospect', 'Négociation', 'Actif', 'Attente'];
  var total = state.crm.length || 1;
  $('#pipelineMini').innerHTML = statuts.map(function (s) {
    var n = state.crm.filter(function (c) { return c.statut === s; }).length;
    var pct = Math.round((n / total) * 100);
    return '<div style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px;"><span>' + s + '</span><span>' + n + '</span></div>' +
      '<div class="loadbar" style="height:6px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;"><i style="display:block;height:100%;width:' + pct + '%;background:linear-gradient(90deg,var(--ion),var(--electric));"></i></div></div>';
  }).join('');
}

/* ---------------- 14. Notifications & profil ---------------- */
function renderNotifBadge() {
  var n = state.notifications.filter(function (x) { return !x.read; }).length;
  var badge = $('#notifBadge');
  badge.textContent = n;
  badge.classList.toggle('app-hidden', n === 0);
}
function renderNotifList() {
  var wrap = $('#notifList');
  wrap.innerHTML = state.notifications.length ? state.notifications.map(function (n) {
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(n.msg) + '</b><span>' + timeAgo(n.created_at) + '</span></div></div>';
  }).join('') : '<div class="app-empty">Aucune notification.</div>';
}
$('#userMenuBtn').addEventListener('click', function () { showPanel('parametres'); });
$('#profileForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var name = $('#profName').value.trim() || state.profile.full_name;
  state.profile.full_name = name;
  renderTopUser();
  await sb.from('profiles').update({ full_name: name }).eq('id', state.profile.id);
  toast('Profil mis à jour.', 'ok');
});
$('#inviteForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var email = $('#inviteEmail').value.trim();
  var form = $('#inviteForm');
  var statusEl = $('[data-status]', form);
  var res = await sb.from('invitations').insert({ company_id: state.profile.company_id, email: email }).select().single();
  if (res.error) {
    statusEl.setAttribute('data-state', 'err');
    statusEl.textContent = "Impossible d'inviter cette adresse.";
    return;
  }
  state.invitations.unshift(res.data);
  form.reset();
  statusEl.setAttribute('data-state', 'ok');
  statusEl.textContent = 'Invitation enregistrée — ' + email + ' rejoindra votre entreprise en s\u2019inscrivant avec cette adresse.';
  renderInvites();
});
async function cancelInvite(id) {
  state.invitations = state.invitations.filter(function (x) { return x.id !== id; }); renderInvites();
  await sb.from('invitations').delete().eq('id', id);
}
function renderInvites() {
  var card = $('#teamCard');
  card.hidden = state.profile.role !== 'owner';
  var wrap = $('#inviteList');
  var pending = state.invitations.filter(function (i) { return !i.accepted; });
  wrap.innerHTML = pending.length ? pending.map(function (i) {
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(i.email) + '</b><span>Invitation en attente · ' + timeAgo(i.created_at) + '</span></div>' +
      '<button class="row-btn" data-invite-del="' + i.id + '">🗑</button></div>';
  }).join('') : '<div class="app-empty">Aucune invitation en attente.</div>';
}
function renderTopUser() {
  var name = state.profile.full_name || 'Vous';
  $('#userName').textContent = name;
  $('#userAv').textContent = name.charAt(0).toUpperCase();
  $('#profName').value = name;
  var companyEl = $('#profCompanyName'); if (companyEl) companyEl.textContent = state.profile.company_name || '—';
  var bannerEl = $('#companyBannerName'); if (bannerEl) bannerEl.textContent = state.profile.company_name || 'Votre entreprise';
}
async function doLogout() {
  await sb.auth.signOut();
  location.reload();
}
$('#logoutBtn').addEventListener('click', doLogout);

/* ---------------- 15. Délégation des clics sur les lignes ---------------- */
document.addEventListener('click', function (e) {
  var t = e.target;
  var id;
  if ((id = t.getAttribute && t.getAttribute('data-crm-edit'))) editCrm(id);
  else if ((id = t.getAttribute && t.getAttribute('data-crm-del'))) deleteCrm(id);
  else if ((id = t.getAttribute && t.getAttribute('data-tk-edit'))) editTk(id);
  else if ((id = t.getAttribute && t.getAttribute('data-tk-del'))) deleteTk(id);
  else if ((id = t.getAttribute && t.getAttribute('data-te-edit'))) editTe(id);
  else if ((id = t.getAttribute && t.getAttribute('data-te-del'))) deleteTe(id);
  else if ((id = t.getAttribute && t.getAttribute('data-te-start'))) startTe(id);
  else if ((id = t.getAttribute && t.getAttribute('data-te-stop'))) stopTe(id);
  else if ((id = t.getAttribute && t.getAttribute('data-eq-edit'))) editEq(id);
  else if ((id = t.getAttribute && t.getAttribute('data-eq-del'))) deleteEq(id);
  else if ((id = t.getAttribute && t.getAttribute('data-auto-del'))) deleteAuto(id);
  else if ((id = t.getAttribute && t.getAttribute('data-invite-del'))) cancelInvite(id);
});

/* ---------------- 16. Menu mobile (barre latérale) ---------------- */
(function mobileSide() {
  var side = $('#appSide');
  var top = $('.app-top');
  if (!top) return;
  var toggle = document.createElement('button');
  toggle.className = 'row-btn';
  toggle.style.display = 'none';
  toggle.setAttribute('aria-label', 'Menu');
  toggle.innerHTML = '☰';
  top.insertBefore(toggle, top.firstChild);
  function sync() { toggle.style.display = window.innerWidth <= 900 ? 'grid' : 'none'; }
  sync();
  window.addEventListener('resize', sync);
  toggle.addEventListener('click', function () { side.classList.toggle('open'); });
})();

/* ---------------- 17. Rendu global & démarrage ---------------- */
function renderAll() {
  renderAccueil();
  renderCrm();
  renderTickets();
  renderTerrain();
  renderEquipes();
  renderAuto();
  renderBrain();
  renderSim();
  renderNotifBadge();
  renderNotifList();
  renderTopUser();
  renderInvites();
  renderReports();
  renderSuivi();
  renderPerfChart();
  animateKpis();
}
async function initPermissionsUI() {
  var roleEl = $('#permissionRole'), list = $('#permissionRequestsList'), form = $('#permissionRequestForm');
  if (!roleEl || !list || !form) return;
  roleEl.textContent = state.profile.role || '—';
  try {
    var p = await sb.rpc('my_permissions');
    var rights = (p.data || []).map(function(x){ return x.permission; });
    var opts = $('#permissionRight option');
    opts.forEach(function(o){ o.disabled = rights.indexOf(o.value) !== -1; });
    var r = await sb.rpc('my_permission_requests');
    if (r.error) { list.innerHTML = '<div class="app-empty">Impossible de charger les demandes.</div>'; return; }
    var rows = r.data || [];
    list.innerHTML = rows.length ? rows.map(function(x){
      var cls = x.status === 'approved' ? 'ok' : (x.status === 'denied' ? 'crit' : 'mid');
      return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(x.requested_right) + '</b><span>' + escapeHtml(x.reason || 'Sans motif') + '</span></div><span class="chip ' + cls + '">' + escapeHtml(x.status) + '</span></div>';
    }).join('') : '<div class="app-empty">Aucune demande envoyée.</div>';
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', async function(e){
        e.preventDefault();
        var status = $('#permissionStatus');
        status.textContent = 'Envoi…';
        var right = $('#permissionRight').value;
        var reason = $('#permissionReason').value.trim();
        var res = await sb.rpc('request_faxtrix_permission', {p_right:right,p_reason:reason});
        if (res.error) { status.setAttribute('data-state','err'); status.textContent = res.error.message || 'Demande impossible.'; return; }
        status.setAttribute('data-state','ok'); status.textContent = 'Demande envoyée à INFOTELCOM.';
        $('#permissionReason').value = '';
        await initPermissionsUI();
      });
    }
  } catch(e) {
    list.innerHTML = '<div class="app-empty">Les droits seront disponibles après activation de la sécurité.</div>';
  }
}
function boot() {
  renderAll();
  initPermissionsUI();
}

/* ---------------- 18. Installation PWA ---------------- */
(function installPrompt() {
  var deferred = null;
  var btn = $('#installBtn');
  var banners = $$('.inapp-banner');
  function showBanner(text) { banners.forEach(function (b) { b.hidden = false; b.textContent = text; }); }
  var ua = navigator.userAgent || '';
  var isInApp = /FBAN|FBAV|Instagram|Line\/|Messenger|; wv\)/i.test(ua) || (/Android/.test(ua) && /WhatsApp/i.test(ua));
  var isIOS = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (isStandalone) return; // déjà installée, rien à montrer

  if (isInApp) {
    showBanner("📲 Pour installer l'application, ouvre ce lien dans Chrome ou Safari : appuie sur ⋮ (ou sur l'icône navigateur) en haut de l'écran, puis « Ouvrir dans le navigateur ».");
    return;
  }
  if (isIOS) {
    showBanner("📲 Pour installer : appuie sur l'icône Partager (⬆️ dans Safari), puis « Sur l'écran d'accueil ».");
    return;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (btn) btn.hidden = false;
  });
  if (btn) {
    btn.addEventListener('click', async function () {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      btn.hidden = true;
    });
  }
  // Après quelques secondes, si Chrome n'a pas proposé l'installation automatique,
  // on donne quand même le chemin manuel plutôt que de laisser un bouton inactif.
  setTimeout(function () {
    if (!deferred) showBanner("📲 Pas de bouton d'installation automatique ? Ouvre le menu ⋮ du navigateur puis « Installer l'application » (ou « Ajouter à l'écran d'accueil »).");
  }, 4000);
  window.addEventListener('appinstalled', function () { if (btn) btn.hidden = true; banners.forEach(function (b) { b.hidden = true; }); });
})();

/* ---------------- 19. Thème clair / sombre / auto ---------------- */
(function themeSwitch() {
  var KEY = 'faxtrix-theme';
  var mql = window.matchMedia('(prefers-color-scheme: dark)');
  function apply(mode) {
    var dark = mode === 'dark' || (mode === 'auto' && mql.matches);
    document.body.setAttribute('data-theme', dark ? 'dark' : 'light');
    $$('#themeSwitch button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-theme-choice') === mode); });
  }
  var current = localStorage.getItem(KEY) || 'auto';
  apply(current);
  $$('#themeSwitch button').forEach(function (b) {
    b.addEventListener('click', function () {
      current = b.getAttribute('data-theme-choice');
      try { localStorage.setItem(KEY, current); } catch (e) {}
      apply(current);
    });
  });
  mql.addEventListener('change', function () { if (current === 'auto') apply('auto'); });
})();

/* ---------------- 20. Suivi & statistiques ---------------- */
function suiviLabel(action, entity) {
  var map = {created:'Création',updated:'Modification',deleted:'Suppression'};
  var em = {clients:'client',tickets:'ticket',terrain_missions:'mission terrain',team_members:'membre d’équipe',automation_rules:'règle d’automatisation'};
  return (map[action] || action || 'Action') + ' · ' + (em[entity] || entity || 'donnée');
}
function renderSuivi() {
  var s = state.statistics;
  if (!s) {
    ['#suiviClients','#suiviTickets','#suiviMissions','#suiviActions'].forEach(function(id){var e=$(id);if(e)e.textContent='—';});
    var k=$('#suiviKpis'); if(k)k.innerHTML='<div class="app-empty">Les statistiques de suivi ne sont pas encore disponibles.</div>';
    var ac=$('#suiviActivity'); if(ac)ac.innerHTML='<div class="app-empty">Aucune activité.</div>';
    return;
  }
  $('#suiviClients').textContent=s.clients_total||0;
  $('#suiviTickets').textContent=s.tickets_total||0;
  $('#suiviMissions').textContent=s.missions_total||0;
  $('#suiviActions').textContent=s.activity_total||0;
  $('#suiviKpis').innerHTML=[
    ['Tickets ouverts',s.tickets_open||0],['Tickets résolus',s.tickets_resolved||0],
    ['Clients actifs',s.clients_active||0],['Pipeline CRM',fcfa(s.pipeline_value||0)],
    ['Missions en cours',s.missions_active||0],['Missions terminées',s.missions_completed||0],
    ['Membres d’équipe',s.team_total||0],['Automatisations actives',s.automations_live||0]
  ].map(function(x){return '<div class="app-row"><div class="r-main"><b>'+escapeHtml(x[0])+'</b><span>Valeur actuelle</span></div><strong>'+escapeHtml(String(x[1]))+'</strong></div>';}).join('');
  var acts=s.recent_activity||[];
  $('#suiviActivity').innerHTML=acts.length?acts.map(function(x){return '<div class="app-row"><div class="r-main"><b>'+escapeHtml(suiviLabel(x.action,x.entity_type))+'</b><span>'+timeAgo(x.created_at)+'</span></div></div>';}).join(''):'<div class="app-empty">Aucune activité enregistrée.</div>';
  var svg=$('#suiviChart'); if(!svg)return;
  var days=s.daily_activity||[];
  var max=Math.max.apply(null,days.map(function(x){return Number(x.count||0);}).concat([1]));
  var w=600/(days.length||1),out='';
  days.forEach(function(d,i){var n=Number(d.count||0),hh=Math.max(4,(n/max)*120);out+='<rect class="bar" x="'+(i*w+w*.2)+'" y="'+(140-hh)+'" width="'+(w*.6)+'" height="'+hh+'" rx="6"/><text x="'+(i*w+w/2)+'" y="160" text-anchor="middle">'+escapeHtml(String(d.label||''))+'</text>';if(n)out+='<text x="'+(i*w+w/2)+'" y="'+(134-hh)+'" text-anchor="middle" style="fill:var(--accent)">'+n+'</text>';});
  svg.innerHTML=out;
}

/* ---------------- 20. Rapports (graphique animé) ---------------- */
var repRange = 7;
$$('#rapportsRange button').forEach(function (b) {
  b.addEventListener('click', function () {
    $$('#rapportsRange button').forEach(function (x) { x.classList.remove('active'); });
    b.classList.add('active'); repRange = Number(b.getAttribute('data-range')); renderReports();
  });
});
function renderReports() {
  var svg = $('#repChart'); if (!svg) return;
  var since = Date.now() - repRange * 86400000;
  var inRange = state.tickets.filter(function (t) { return new Date(t.created_at).getTime() >= since; });
  $('#repTickets').textContent = inRange.filter(function (t) { return t.statut === 'Résolu' || t.statut === 'Fermé'; }).length;
  $('#repClients').textContent = state.crm.length;
  $('#repValeur').textContent = fcfa(state.crm.reduce(function (s, c) { return s + Number(c.valeur || 0); }, 0));
  $('#repMissions').textContent = state.terrain.length;
  var days = Math.min(repRange, 14), buckets = [], i;
  for (i = days - 1; i >= 0; i--) {
    var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    buckets.push({ label: d.getDate() + '/' + (d.getMonth() + 1), start: d.getTime(), n: 0 });
  }
  state.tickets.forEach(function (t) {
    var ts = new Date(t.created_at).getTime();
    buckets.forEach(function (b) { if (ts >= b.start && ts < b.start + 86400000) b.n++; });
  });
  var max = Math.max.apply(null, buckets.map(function (b) { return b.n; }).concat([1]));
  var w = 600 / buckets.length, out = '<defs><linearGradient id="repGrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FF7A00"/><stop offset="1" stop-color="#FFB45C"/></linearGradient></defs>';
  buckets.forEach(function (b, k) {
    var h = Math.max(4, (b.n / max) * 120);
    out += '<rect class="bar" style="animation-delay:' + (k * 45) + 'ms" x="' + (k * w + w * 0.2) + '" y="' + (130 - h) + '" width="' + (w * 0.6) + '" height="' + h + '" rx="6"/>';
    out += '<text x="' + (k * w + w / 2) + '" y="150" text-anchor="middle">' + b.label + '</text>';
    if (b.n) out += '<text x="' + (k * w + w / 2) + '" y="' + (124 - h) + '" text-anchor="middle" style="fill:var(--accent)">' + b.n + '</text>';
  });
  svg.innerHTML = out;
}

/* compteurs KPI animés */
var kpiSeen = {};
function animateKpis() {
  $$('.app-stat b').forEach(function (el) {
    var txt = el.textContent, num = parseFloat(txt.replace(/[^\d.]/g, ''));
    if (isNaN(num) || kpiSeen[el.id] === txt || txt.indexOf('€') !== -1) return;
    kpiSeen[el.id] = txt;
    var start = performance.now();
    (function tick(now) {
      var p = Math.min(1, (now - start) / 700), v = Math.round(num * (1 - Math.pow(1 - p, 3)));
      el.textContent = v; if (p < 1) requestAnimationFrame(tick); else el.textContent = txt;
    })(start);
  });
}

/* ---------------- 21. Assistant (règles sur vos vraies données) ---------------- */
function aiAnswer(q) {
  q = q.toLowerCase();
  var open = state.tickets.filter(function (t) { return t.statut !== 'Résolu' && t.statut !== 'Fermé'; });
  if (/ticket/.test(q) && /(ouvert|résum|resum|combien|urgent)/.test(q)) {
    if (!open.length) return "Tout est sous contrôle : aucun ticket ouvert.";
    var haute = open.filter(function (t) { return t.priorite === 'Haute'; });
    return open.length + " ticket(s) ouvert(s), dont " + haute.length + " en priorité haute. Les plus récents : " +
      open.slice(0, 3).map(function (t) { return '« ' + t.titre + ' »'; }).join(', ') + '.';
  }
  if (/(technicien|disponible|équipe|equipe)/.test(q)) {
    var dispo = state.equipes.filter(function (m) { return m.statut === 'Disponible'; });
    return dispo.length ? dispo.length + " membre(s) disponible(s) : " + dispo.map(function (m) { return m.nom + ' (' + m.charge + '% de charge)'; }).join(', ') + '.'
      : "Personne n'est marqué « Disponible » pour le moment.";
  }
  if (/(pipeline|crm|client|vente)/.test(q)) {
    var total = state.crm.reduce(function (s, c) { return s + Number(c.valeur || 0); }, 0);
    return state.crm.length + " client(s) pour " + fcfa(total) + " au total, dont " + state.crm.filter(function (c) { return c.statut === 'Négociation'; }).length + " en négociation.";
  }
  if (/(mission|terrain|intervention)/.test(q)) {
    return state.terrain.filter(function (t) { return t.statut === 'En cours'; }).length + " mission(s) en cours sur " + state.terrain.length + " au total.";
  }
  if (/(crée|creer|créer|nouveau).*ticket/.test(q)) { showPanel('tickets'); $('#tkAddBtn').click(); return "J'ouvre le formulaire de nouveau ticket."; }
  return "Je sais répondre sur vos tickets, clients, équipe et missions. Essayez : « Résume mes tickets ouverts ».";
}
function aiSay(text, who) {
  var log = $('#aiLog'), m = document.createElement('div');
  m.className = 'ai-msg ' + who; m.textContent = text; log.appendChild(m); log.scrollTop = log.scrollHeight; return m;
}
function aiAsk(q) {
  if (!q.trim()) return;
  aiSay(q, 'user');
  var t = document.createElement('div'); t.className = 'ai-msg bot'; t.innerHTML = '<span class="ai-typing"><i></i><i></i><i></i></span>';
  $('#aiLog').appendChild(t);
  setTimeout(function () { t.textContent = aiAnswer(q); $('#aiLog').scrollTop = 9999; }, 650);
}
$('#aiForm').addEventListener('submit', function (e) { e.preventDefault(); var i = $('#aiInput'); aiAsk(i.value); i.value = ''; });
$$('[data-ai-suggest]').forEach(function (b) { b.addEventListener('click', function () { aiAsk(b.getAttribute('data-ai-suggest')); }); });
aiSay("Bonjour ! Je peux résumer vos tickets, vos clients, votre équipe et vos missions.", 'bot');

/* ---------------- 22. Sécurité ---------------- */
$('#pwdForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var st = $('[data-status]', e.target), res = await sb.auth.updateUser({ password: $('#pwdNew').value });
  st.setAttribute('data-state', res.error ? 'err' : 'ok');
  st.textContent = res.error ? authErrorFr(res.error.message) : 'Mot de passe mis à jour.';
  if (!res.error) e.target.reset();
});
$('#logoutAllBtn').addEventListener('click', async function () { await sb.auth.signOut({ scope: 'global' }); location.reload(); });

/* ---------------- 23. Recherche globale ---------------- */
var searchModal = $('#searchModal');
function openSearch() { searchModal.classList.add('on'); setTimeout(function () { $('#searchInput').focus(); }, 60); renderSearch(''); }
function closeSearch() { searchModal.classList.remove('on'); }
$('#searchBtn').addEventListener('click', openSearch);
$$('[data-search-close]').forEach(function (el) { el.addEventListener('click', closeSearch); });
document.addEventListener('keydown', function (e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !$('#appShell').classList.contains('app-hidden')) { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape') closeSearch();
});
$('#searchInput').addEventListener('input', function (e) { renderSearch(e.target.value.trim().toLowerCase()); });
function renderSearch(q) {
  var groups = [
    ['Tickets', 'tickets', state.tickets.filter(function (t) { return !q || t.titre.toLowerCase().indexOf(q) !== -1; }), function (t) { return [t.titre, t.statut + ' · ' + t.priorite]; }],
    ['Clients', 'crm', state.crm.filter(function (c) { return !q || c.nom.toLowerCase().indexOf(q) !== -1; }), function (c) { return [c.nom, c.statut + ' · ' + fcfa(c.valeur)]; }],
    ['Équipe', 'equipes', state.equipes.filter(function (m) { return !q || m.nom.toLowerCase().indexOf(q) !== -1 || (m.role || '').toLowerCase().indexOf(q) !== -1; }), function (m) { return [m.nom, (m.role || '—') + ' · ' + m.statut]; }]
  ], html = '';
  groups.forEach(function (g) {
    if (!g[2].length) return;
    html += '<div class="sr-group">' + g[0] + '</div>' + g[2].slice(0, 5).map(function (it) {
      var d = g[3](it); return '<div class="sr-item" data-go="' + g[1] + '"><b>' + escapeHtml(d[0]) + '</b><span>' + escapeHtml(d[1]) + '</span></div>';
    }).join('');
  });
  $('#searchResults').innerHTML = html || '<div class="app-empty">Aucun résultat.</div>';
  $$('.sr-item', $('#searchResults')).forEach(function (el) { el.addEventListener('click', function () { closeSearch(); showPanel(el.getAttribute('data-go')); }); });
}

/* ---------------- 24. Connexion réseau ---------------- */
(function netState() {
  var pill = null;
  function show(ok, msg) {
    if (pill) pill.remove();
    pill = document.createElement('div'); pill.className = 'net-pill' + (ok ? ' ok' : ''); pill.textContent = msg; document.body.appendChild(pill);
    if (ok) setTimeout(function () { if (pill) { pill.remove(); pill = null; } }, 2200);
  }
  window.addEventListener('offline', function () { show(false, "Vous êtes hors connexion — synchronisation au retour du réseau."); });
  window.addEventListener('online', function () { show(true, 'Connexion rétablie'); });
})();

/* ---------------- 25. Mises à jour de l'application ---------------- */
var APP_VERSION = '1.0.0';
var PLATFORM = (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'android') ? 'android'
  : (navigator.userAgent.indexOf('Electron') !== -1 ? 'desktop' : 'web');
function cmpVer(a, b) {
  var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (var i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return 1; if ((x[i] || 0) < (y[i] || 0)) return -1; }
  return 0;
}
async function checkForUpdate(force) {
  try {
    var last = Number(localStorage.getItem('faxtrix-upd-check') || 0);
    if (!force && Date.now() - last < 6 * 3600 * 1000) return;           // pas de requêtes inutiles : 1 vérification / 6 h
    var res = await sb.from('app_versions').select('*').eq('platform', PLATFORM).maybeSingle();
    localStorage.setItem('faxtrix-upd-check', String(Date.now()));
    var v = res.data; if (!v || cmpVer(v.latest_version, APP_VERSION) <= 0) return;
    var mustUpdate = v.force_update || cmpVer(APP_VERSION, v.minimum_version) < 0;
    var snoozed = Number(localStorage.getItem('faxtrix-upd-snooze') || 0);
    if (!mustUpdate && Date.now() < snoozed) return;                      // « Plus tard » respecté 24 h
    $('#updateTitle').textContent = mustUpdate ? 'Mise à jour requise' : 'Une nouvelle version est prête';
    $('#updateBody').textContent = 'Version ' + APP_VERSION + ' → ' + v.latest_version + '. ' + (v.release_notes || 'Plus rapide, plus sûre et avec de nouvelles fonctionnalités.') +
      (mustUpdate ? ' Pour continuer à utiliser FAXTRIX, installez la dernière version.' : '');
    $('#updateLaterBtn').style.display = mustUpdate ? 'none' : '';
    var link = $('#updateNowBtn'); link.href = v.download_url || location.href;
    link.onclick = function (e) { if (!v.download_url || PLATFORM === 'web') { e.preventDefault(); navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(function (r) { r.forEach(function (x) { x.unregister(); }); }); caches && caches.keys().then(function (k) { k.forEach(function (n) { caches.delete(n); }); }); location.reload(true); } };
    $('#updateModal').classList.add('on');
  } catch (e) { /* hors ligne : on réessaiera */ }
}
$('#updateLaterBtn').addEventListener('click', function () { localStorage.setItem('faxtrix-upd-snooze', String(Date.now() + 24 * 3600 * 1000)); $('#updateModal').classList.remove('on'); });
document.addEventListener('visibilitychange', function () { if (!document.hidden && !$('#appShell').classList.contains('app-hidden')) checkForUpdate(false); });
setTimeout(function () { checkForUpdate(false); }, 2500);
var verEl = document.createElement('div'); verEl.className = 'profile-row'; verEl.innerHTML = '<span>Version</span><span>' + APP_VERSION + ' · ' + PLATFORM + '</span>';
var ps = $('#profCompanyName'); if (ps && ps.parentNode) ps.parentNode.parentNode.insertBefore(verEl, ps.parentNode.nextSibling);

})();
 },
  GBP: { label: '£', locale: 'en-GB', suffix: ' £' },
  CAD: { label: 'CAD', locale: 'fr-CA', suffix: ' CAD' },
  CHF: { label: 'CHF', locale: 'fr-CH', suffix: ' CHF' },
  MAD: { label: 'MAD', locale: 'fr-FR', suffix: ' MAD' },
  NGN: { label: '₦', locale: 'en-NG', suffix: ' ₦' },
  CNY: { label: 'CNY', locale: 'zh-CN', suffix: ' CNY' },
  JPY: { label: '¥', locale: 'ja-JP', suffix: ' ¥' }
};
var selectedCurrency = localStorage.getItem('faxtrix-currency') || 'XAF';
if (!CURRENCY_OPTIONS[selectedCurrency]) selectedCurrency = 'XAF';
function fcfa(n) {
  var c = CURRENCY_OPTIONS[selectedCurrency] || CURRENCY_OPTIONS.XAF;
  return Number(n || 0).toLocaleString(c.locale, { maximumFractionDigits: 2 }) + c.suffix;
}
function refreshCurrencyLabels() {
  var select = $('#currencySelect');
  if (select) select.value = selectedCurrency;
  $('.money-label').forEach(function (el) {
    el.textContent = CURRENCY_OPTIONS[selectedCurrency].label;
  });
}
var currencySelect = $('#currencySelect');
if (currencySelect) {
  currencySelect.addEventListener('change', function () {
    selectedCurrency = CURRENCY_OPTIONS[this.value] ? this.value : 'XAF';
    localStorage.setItem('faxtrix-currency', selectedCurrency);
    refreshCurrencyLabels();
    renderAll();
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function timeAgo(iso) {
  if (!iso) return '';
  var diff = Math.max(0, Date.now() - new Date(iso).getTime());
  var min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return "il y a " + min + " min";
  var h = Math.floor(min / 60);
  if (h < 24) return "il y a " + h + "h";
  return "il y a " + Math.floor(h / 24) + "j";
}
function fmtElapsed(ms) {
  var s = Math.floor(ms / 1000);
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return p(h) + ':' + p(m) + ':' + p(sec);
}
function authErrorFr(msg) {
  if (!msg) return 'Une erreur est survenue.';
  if (msg === 'Invalid login credentials') return 'E-mail ou mot de passe incorrect.';
  if (/email not confirmed/i.test(msg)) return "Votre e-mail n'est pas encore confirmé. Vérifiez votre boîte de réception (et les indésirables), puis cliquez sur le lien reçu.";
  if (/user already registered/i.test(msg)) return 'Un compte existe déjà avec cet e-mail. Connectez-vous plutôt.';
  return msg;
}

/* ---------------- 1. Client Supabase ---------------- */
var SUPABASE_URL = 'https://xtkcfhbsksoqbpnaciga.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0a2NmaGJza3NvcWJwbmFjaWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNDY4ODEsImV4cCI6MjEwNTkyMjg4MX0.Drrgf-6Axsdf3u1tHXhn3UoIhTC0Tu291ER0NAQQhTQ';
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storageKey: 'faxtrix-client-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

var state = {
  profile: { id: null, company_id: null, full_name: '', company_name: '', role: 'owner' },
  crm: [], tickets: [], terrain: [], equipes: [], automations: [], notifications: [], invitations: [], statistics: null
};

/* ---------------- 2. Porte d'entrée (connexion / inscription / mot de passe) ---------------- */
(function gate() {
  var gateEl = $('#gate'), shell = $('#appShell');
  var loginForm = $('#gateForm'), signupForm = $('#signupForm');
  var resetForm = $('#resetForm'), newPassForm = $('#newPassForm');

  $$('#gateTabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#gateTabs button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      var tab = b.getAttribute('data-gate-tab');
      loginForm.hidden = tab !== 'login';
      signupForm.hidden = tab !== 'signup';
      resetForm.hidden = true; newPassForm.hidden = true;
      $('#gateTitle').textContent = tab === 'login' ? 'Connexion' : 'Créer votre entreprise';
      $('#gateSub').textContent = tab === 'login' ? 'Accédez à votre espace FAXTRIX.' : 'Un espace FAXTRIX dédié et isolé pour votre entreprise.';
    });
  });

  $('#forgotLink').addEventListener('click', function (e) {
    e.preventDefault();
    loginForm.hidden = true; resetForm.hidden = false;
    $('#gateTitle').textContent = 'Mot de passe oublié';
    $('#gateSub').textContent = 'On vous envoie un lien pour le réinitialiser.';
  });
  $('#backToLoginLink').addEventListener('click', function (e) {
    e.preventDefault();
    resetForm.hidden = true; loginForm.hidden = false;
    $('#gateTitle').textContent = 'Connexion';
    $('#gateSub').textContent = 'Accédez à votre espace FAXTRIX.';
  });

  function setStatus(form, ok, msg) {
    var el = $('[data-status]', form);
    el.setAttribute('data-state', ok ? 'ok' : 'err');
    el.textContent = msg;
  }

  async function enter() {
    var ok = await loadAll();
    if (!ok) return;
    gateEl.classList.add('app-hidden');
    shell.classList.remove('app-hidden');
    boot();
  }

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = $('#gateEmail').value.trim();
    var pass = $('#gatePass').value;
    setStatus(loginForm, true, 'Connexion en cours…');
    var res = await sb.auth.signInWithPassword({ email: email, password: pass });
    if (res.error) { setStatus(loginForm, false, authErrorFr(res.error.message)); return; }
    setStatus(loginForm, true, 'Connecté.');
    enter();
  });

  /* ---- assistant d'inscription en 3 étapes ---- */
  var stepEl = 1, totalSteps = 3;
  var stepPrevBtn = $('#stepPrev'), stepNextBtn = $('#stepNext'), stepSubmitBtn = $('#stepSubmit');
  function showStep(n) {
    stepEl = n;
    $$('.gate-step-panel').forEach(function (p) { p.classList.toggle('active', Number(p.getAttribute('data-step')) === n); });
    $$('.gate-step[data-step-dot]').forEach(function (d) {
      var num = Number(d.getAttribute('data-step-dot'));
      d.classList.toggle('active', num === n);
      d.classList.toggle('done', num < n);
    });
    stepPrevBtn.hidden = n === 1;
    stepNextBtn.hidden = n === totalSteps;
    stepSubmitBtn.hidden = n !== totalSteps;
  }
  function validateStep(n) {
    var ids = n === 1 ? ['suName', 'suEmail'] : n === 2 ? ['suCompany'] : [];
    for (var i = 0; i < ids.length; i++) {
      var el = $('#' + ids[i]);
      if (!el.checkValidity()) { el.reportValidity(); return false; }
    }
    if (n === 3) {
      if (!$('#suPass').checkValidity()) { $('#suPass').reportValidity(); return false; }
      if ($('#suPass').value !== $('#suPass2').value) { setStatus(signupForm, false, 'Les deux mots de passe ne correspondent pas.'); return false; }
      if (!$('#suTerms').checked) { setStatus(signupForm, false, "Merci d'accepter les conditions d'utilisation."); return false; }
    }
    return true;
  }
  stepNextBtn.addEventListener('click', function () { if (validateStep(stepEl)) showStep(Math.min(totalSteps, stepEl + 1)); });
  stepPrevBtn.addEventListener('click', function () { showStep(Math.max(1, stepEl - 1)); });

  var pwdMeter = $('#pwdMeter'), pwdLabel = $('#pwdMeterLabel');
  $('#suPass').addEventListener('input', function (e) {
    var v = e.target.value, score = 0;
    if (v.length >= 6) score++;
    if (v.length >= 10) score++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
    if (/[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v)) score++;
    pwdMeter.className = 'pwd-meter ' + (v ? 'w' + Math.max(1, score) : '');
    pwdLabel.textContent = !v ? '\u00a0' : ['Faible', 'Faible', 'Moyen', 'Bon', 'Excellent'][score];
  });

  signupForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!validateStep(3)) return;
    var company = $('#suCompany').value.trim();
    var fullName = $('#suName').value.trim();
    var email = $('#suEmail').value.trim();
    var pass = $('#suPass').value;
    setStatus(signupForm, true, 'Création de votre espace…');
    var res = await sb.auth.signUp({
      email: email, password: pass,
      options: { data: {
        company_name: company, full_name: fullName,
        phone: $('#suPhone').value.trim(), sector: $('#suSector').value,
        company_size: $('#suSize').value, country: $('#suCountry').value.trim(), city: $('#suCity').value.trim()
      } }
    });
    if (res.error) { setStatus(signupForm, false, authErrorFr(res.error.message)); return; }
    if (!res.data.session) {
      setStatus(signupForm, true, 'Compte créé. Confirmez votre adresse via l\u2019e-mail que nous venons d\u2019envoyer, puis connectez-vous.');
      return;
    }
    setStatus(signupForm, true, 'Espace créé.');
    enter();
  });

  resetForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = $('#resetEmail').value.trim();
    setStatus(resetForm, true, 'Envoi en cours…');
    var res = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    if (res.error) { setStatus(resetForm, false, authErrorFr(res.error.message)); return; }
    setStatus(resetForm, true, 'E-mail envoyé, si ce compte existe. Suivez le lien reçu pour choisir un nouveau mot de passe.');
  });

  newPassForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var pass = $('#newPass').value;
    setStatus(newPassForm, true, 'Mise à jour…');
    var res = await sb.auth.updateUser({ password: pass });
    if (res.error) { setStatus(newPassForm, false, authErrorFr(res.error.message)); return; }
    setStatus(newPassForm, true, 'Mot de passe mis à jour. Connexion…');
    setTimeout(enter, 700);
  });

  // Lien de réinitialisation cliqué : Supabase ouvre une session "recovery" et déclenche cet évènement.
  sb.auth.onAuthStateChange(function (event) {
    if (event === 'PASSWORD_RECOVERY') {
      loginForm.hidden = true; signupForm.hidden = true; resetForm.hidden = true; newPassForm.hidden = false;
      $('#gateTitle').textContent = 'Nouveau mot de passe';
      $('#gateSub').textContent = 'Choisissez un nouveau mot de passe pour votre compte.';
    }
  });

  // Session déjà active (retour sur le site) ?
  sb.auth.getSession().then(function (res) {
    if (res.data.session && window.location.hash.indexOf('type=recovery') === -1) enter();
  });
})();

/* ---------------- 3. Chargement des données depuis Supabase ---------------- */
async function loadAll() {
  var userRes = await sb.auth.getUser();
  var user = userRes.data && userRes.data.user;
  if (!user) return false;

  var profRes = await sb.from('profiles').select('id, company_id, full_name, role, companies(name)').eq('id', user.id).single();
  if (profRes.error || !profRes.data) {
    toast("Impossible de charger votre profil.", 'crit');
    return false;
  }
  state.profile.id = profRes.data.id;
  state.profile.company_id = profRes.data.company_id;
  state.profile.full_name = profRes.data.full_name || user.email;
  state.profile.role = profRes.data.role;
  state.profile.company_name = (profRes.data.companies && profRes.data.companies.name) || '';

  var results = await Promise.all([
    sb.from('clients').select('*').order('created_at', { ascending: false }),
    sb.from('tickets').select('*').order('created_at', { ascending: false }),
    sb.from('terrain_missions').select('*').order('created_at', { ascending: false }),
    sb.from('team_members').select('*').order('created_at', { ascending: false }),
    sb.from('automation_rules').select('*').order('created_at', { ascending: false }),
    sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(40),
    state.profile.role === 'owner'
      ? sb.from('invitations').select('*').order('created_at', { ascending: false })
      : Promise.resolve({ data: [] })
  ]);
  state.crm = results[0].data || [];
  state.tickets = results[1].data || [];
  state.terrain = results[2].data || [];
  state.equipes = results[3].data || [];
  state.automations = results[4].data || [];
  state.notifications = results[5].data || [];
  state.invitations = results[6].data || [];
  var statsRes = await sb.rpc('my_company_statistics');
  state.statistics = statsRes.error ? null : (statsRes.data || null);
  return true;
}

function withCompany(obj) {
  obj.company_id = state.profile.company_id;
  return obj;
}

async function notify(msg, kind) {
  var res = await sb.from('notifications').insert(withCompany({ msg: msg, read: false })).select().single();
  if (!res.error) { state.notifications.unshift(res.data); renderNotifBadge(); }
  toast(msg, kind);
}
function toast(msg, kind) {
  var wrap = $('#toastWrap'); if (!wrap) return;
  var el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.innerHTML = '<i></i><span>' + escapeHtml(msg) + '</span>';
  wrap.appendChild(el);
  setTimeout(function () { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; el.style.transition = 'all .3s ease'; }, 3200);
  setTimeout(function () { wrap.removeChild(el); }, 3600);
}

/* ---------------- 4. Navigation entre panneaux ---------------- */
var panelTitles = {
  accueil: ['Bonjour', 'Voici un aperçu de votre espace FAXTRIX.'],
  services: ['Services', 'Support, interventions, CRM et outils de votre entreprise.'],
  crm: ['CRM', 'Prospects, opportunités et clients actifs.'],
  tickets: ['Tickets', 'Suivi des demandes de support.'],
  terrain: ['Terrain', 'Missions et interventions en cours.'],
  equipes: ['Équipes', "Charge de travail et disponibilité."],
  automatisation: ['Automatisation', 'Règles déclenchées par vos actions.'],
  intelligence: ['Business Brain', 'Analyse en direct de vos données.'],
  simulation: ['Decision Simulator', 'Testez une décision avant de la prendre.'],
  rapports: ['Rapports & Analyses', 'Vos indicateurs en temps réel.'],
  assistant: ['Assistant IA', 'Posez une question sur vos données.'],
  securite: ['Sécurité & accès', 'Mot de passe et sessions.'],
  parametres: ['Paramètres', 'Profil et session.']
};
function showPanel(name) {
  $$('.app-nav button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-panel') === name); });
  $$('.mobile-tabbar button[data-panel]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-panel') === name); });
  $$('.app-panel').forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-panel') === name); });
  var meta = panelTitles[name];
  if (meta) {
    var greetName = state.profile.full_name || 'Albert';
    $('#topTitle').textContent = name === 'accueil' ? ('Bonjour ' + greetName) : meta[0];
    $('#topSub').textContent = meta[1];
  }
  $('#appSide').classList.remove('open');
  var serviceSheet = $('#servicesSheet'); if (serviceSheet) serviceSheet.classList.remove('on');
  renderAll();
}
$$('.app-nav button').forEach(function (b) {
  b.addEventListener('click', function () { showPanel(b.getAttribute('data-panel')); });
});
$$('.mobile-tabbar button[data-panel]').forEach(function (b) {
  b.addEventListener('click', function () { showPanel(b.getAttribute('data-panel')); });
});
$$('[data-go]').forEach(function (b) {
  b.addEventListener('click', function () {
    var t = b.getAttribute('data-go');
    if (t === 'services-sheet') { $('#servicesSheet').classList.add('on'); return; }
    showPanel(t);
    if (b.hasAttribute('data-open-ticket')) setTimeout(function () { $('#tkAddBtn').click(); }, 250);
  });
});
var servicesTabBtn = $('#servicesTabBtn');
if (servicesTabBtn) servicesTabBtn.addEventListener('click', function () { $('#servicesSheet').classList.add('on'); });
$$('[data-services-close]').forEach(function (el) { el.addEventListener('click', function () { $('#servicesSheet').classList.remove('on'); }); });
var moreTabBtn = $('#moreTabBtn');
if (moreTabBtn) moreTabBtn.addEventListener('click', function () { $('#plusSheet').classList.add('on'); });
$$('[data-plus-close]').forEach(function (el) { el.addEventListener('click', function () { $('#plusSheet').classList.remove('on'); }); });
var plusLogoutBtn = $('#plusLogoutBtn');
if (plusLogoutBtn) plusLogoutBtn.addEventListener('click', function () { doLogout(); });

/* ---------------- 5. Tiroir générique (ajout / édition) ---------------- */
var drawer = $('#drawer');
var drawerForms = { crm: $('#crmForm'), tk: $('#tkForm'), te: $('#teForm'), eq: $('#eqForm'), auto: $('#autoForm') };
function openDrawer(kind, title) {
  $('#drawerTitle').textContent = title;
  Object.keys(drawerForms).forEach(function (k) { drawerForms[k].hidden = k !== kind; });
  drawer.classList.add('on');
}
function closeDrawer() { drawer.classList.remove('on'); }
$$('[data-drawer-close]').forEach(function (el) { el.addEventListener('click', closeDrawer); });

var notifDrawer = $('#notifDrawer');
$$('[data-drawer-close-notif]').forEach(function (el) { el.addEventListener('click', function () { notifDrawer.classList.remove('on'); }); });
$('#notifBtn').addEventListener('click', async function () {
  notifDrawer.classList.add('on');
  var unread = state.notifications.filter(function (n) { return !n.read; }).map(function (n) { return n.id; });
  state.notifications.forEach(function (n) { n.read = true; });
  renderNotifBadge();
  renderNotifList();
  if (unread.length) await sb.from('notifications').update({ read: true }).in('id', unread);
});

/* ---------------- 6. CRM ---------------- */
var crmFilter = 'Tous', crmQuery = '';
$('#crmAddBtn').addEventListener('click', function () {
  $('#crmForm').reset(); $('#crmId').value = '';
  openDrawer('crm', 'Nouveau client');
});
$$('#crmTabs button').forEach(function (b) {
  b.addEventListener('click', function () {
    $$('#crmTabs button').forEach(function (x) { x.classList.remove('active'); });
    b.classList.add('active'); crmFilter = b.getAttribute('data-filter'); renderCrm();
  });
});
$('#crmSearch').addEventListener('input', function (e) { crmQuery = e.target.value.trim().toLowerCase(); renderCrm(); });
$('#crmForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var id = $('#crmId').value;
  var data = { nom: $('#crmNom').value.trim(), statut: $('#crmStatut').value, valeur: Number($('#crmValeurInput').value || 0) };
  if (id) {
    var res = await sb.from('clients').update(data).eq('id', id).select().single();
    if (!res.error) { var item = state.crm.find(function (c) { return c.id === id; }); if (item) Object.assign(item, res.data); }
  } else {
    var res2 = await sb.from('clients').insert(withCompany(data)).select().single();
    if (!res2.error) { state.crm.unshift(res2.data); notify('Nouveau client ajouté : ' + data.nom, 'ok'); }
  }
  closeDrawer(); renderAll();
});
function editCrm(id) {
  var c = state.crm.find(function (x) { return x.id === id; }); if (!c) return;
  $('#crmId').value = c.id; $('#crmNom').value = c.nom; $('#crmStatut').value = c.statut; $('#crmValeurInput').value = c.valeur;
  openDrawer('crm', 'Modifier le client');
}
async function deleteCrm(id) {
  state.crm = state.crm.filter(function (x) { return x.id !== id; }); renderAll();
  await sb.from('clients').delete().eq('id', id);
}
function renderCrm() {
  var list = $('#crmList');
  var rows = state.crm.filter(function (c) {
    var okFilter = crmFilter === 'Tous' || c.statut === crmFilter;
    var okQuery = !crmQuery || c.nom.toLowerCase().indexOf(crmQuery) !== -1;
    return okFilter && okQuery;
  });
  list.innerHTML = rows.length ? rows.map(function (c) {
    var chipClass = c.statut === 'Actif' ? 'ok' : (c.statut === 'Négociation' ? 'mid' : (c.statut === 'Attente' ? 'crit' : ''));
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(c.nom) + '</b><span>' + fcfa(c.valeur) + '</span></div>' +
      '<span class="chip ' + chipClass + '">' + c.statut + '</span>' +
      '<div class="app-row-actions"><button class="row-btn" data-crm-edit="' + c.id + '">✎</button><button class="row-btn" data-crm-del="' + c.id + '">🗑</button></div></div>';
  }).join('') : '<div class="app-empty">Aucun client pour ce filtre.</div>';

  $('#crmTotal').textContent = state.crm.length;
  $('#crmValeur').textContent = fcfa(state.crm.reduce(function (s, c) { return s + Number(c.valeur || 0); }, 0));
  $('#crmActifs').textContent = state.crm.filter(function (c) { return c.statut === 'Actif'; }).length;
  $('#crmNego').textContent = state.crm.filter(function (c) { return c.statut === 'Négociation'; }).length;
}

/* ---------------- 7. Tickets ---------------- */
var tkFilter = 'Tous', tkQuery = '';
$('#tkAddBtn').addEventListener('click', function () {
  $('#tkForm').reset(); $('#tkId').value = '';
  openDrawer('tk', 'Nouveau ticket');
});
$$('#tkTabs button').forEach(function (b) {
  b.addEventListener('click', function () {
    $$('#tkTabs button').forEach(function (x) { x.classList.remove('active'); });
    b.classList.add('active'); tkFilter = b.getAttribute('data-filter'); renderTickets();
  });
});
$('#tkSearch').addEventListener('input', function (e) { tkQuery = e.target.value.trim().toLowerCase(); renderTickets(); });
$('#tkForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var id = $('#tkId').value;
  var data = { titre: $('#tkTitre').value.trim(), client: $('#tkClient').value.trim(), priorite: $('#tkPriorite').value, statut: $('#tkStatut').value };
  if (id) {
    var res = await sb.from('tickets').update(data).eq('id', id).select().single();
    if (!res.error) { var item = state.tickets.find(function (t) { return t.id === id; }); if (item) Object.assign(item, res.data); }
  } else {
    var res2 = await sb.from('tickets').insert(withCompany(data)).select().single();
    if (!res2.error) {
      state.tickets.unshift(res2.data);
      if (data.priorite === 'Haute') {
        var rule = state.automations.find(function (a) { return a.live; });
        notify('Automatisation : ticket « ' + data.titre + '» en priorité haute — ' + (rule ? rule.action_text.toLowerCase() : 'équipe notifiée') + '.', 'crit');
      } else {
        notify('Nouveau ticket : ' + data.titre, 'ok');
      }
    }
  }
  closeDrawer(); renderAll();
});
function editTk(id) {
  var t = state.tickets.find(function (x) { return x.id === id; }); if (!t) return;
  $('#tkId').value = t.id; $('#tkTitre').value = t.titre; $('#tkClient').value = t.client; $('#tkPriorite').value = t.priorite; $('#tkStatut').value = t.statut;
  openDrawer('tk', 'Modifier le ticket');
}
async function deleteTk(id) {
  state.tickets = state.tickets.filter(function (x) { return x.id !== id; }); renderAll();
  await sb.from('tickets').delete().eq('id', id);
}
function renderTickets() {
  var list = $('#tkList');
  var rows = state.tickets.filter(function (t) {
    var okFilter = tkFilter === 'Tous' || t.statut === tkFilter;
    var okQuery = !tkQuery || t.titre.toLowerCase().indexOf(tkQuery) !== -1;
    return okFilter && okQuery;
  });
  list.innerHTML = rows.length ? rows.map(function (t) {
    var pClass = t.priorite === 'Haute' ? 'crit' : (t.priorite === 'Moyenne' ? 'mid' : 'ok');
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(t.titre) + '</b><span>' + escapeHtml(t.client || '—') + ' · ' + timeAgo(t.created_at) + '</span></div>' +
      '<span class="chip ' + pClass + '">' + t.priorite + '</span><span class="chip">' + t.statut + '</span>' +
      '<div class="app-row-actions"><button class="row-btn" data-tk-edit="' + t.id + '">✎</button><button class="row-btn" data-tk-del="' + t.id + '">🗑</button></div></div>';
  }).join('') : '<div class="app-empty">Aucun ticket pour ce filtre.</div>';

  $('#tkTotal').textContent = state.tickets.length;
  $('#tkOuverts').textContent = state.tickets.filter(function (t) { return t.statut !== 'Résolu' && t.statut !== 'Fermé'; }).length;
  $('#tkHaute').textContent = state.tickets.filter(function (t) { return t.priorite === 'Haute'; }).length;
  $('#tkResolus').textContent = state.tickets.filter(function (t) { return t.statut === 'Résolu'; }).length;
}

/* ---------------- 8. Terrain ---------------- */
$('#teAddBtn').addEventListener('click', function () {
  $('#teForm').reset(); $('#teId').value = '';
  openDrawer('te', 'Nouvelle mission');
});
$('#teForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var id = $('#teId').value;
  var data = { tech: $('#teTech').value.trim(), client: $('#teClient').value.trim(), statut: $('#teStatut').value };
  if (id) {
    var res = await sb.from('terrain_missions').update(data).eq('id', id).select().single();
    if (!res.error) { var item = state.terrain.find(function (x) { return x.id === id; }); if (item) Object.assign(item, res.data); }
  } else {
    data.started_at = data.statut === 'En cours' ? new Date().toISOString() : null; data.elapsed_ms = 0;
    var res2 = await sb.from('terrain_missions').insert(withCompany(data)).select().single();
    if (!res2.error) { state.terrain.unshift(res2.data); notify('Nouvelle mission assignée à ' + data.tech, 'ok'); }
  }
  closeDrawer(); renderAll();
});
function editTe(id) {
  var t = state.terrain.find(function (x) { return x.id === id; }); if (!t) return;
  $('#teId').value = t.id; $('#teTech').value = t.tech; $('#teClient').value = t.client; $('#teStatut').value = t.statut;
  openDrawer('te', 'Modifier la mission');
}
async function deleteTe(id) {
  state.terrain = state.terrain.filter(function (x) { return x.id !== id; }); renderAll();
  await sb.from('terrain_missions').delete().eq('id', id);
}
async function startTe(id) {
  var t = state.terrain.find(function (x) { return x.id === id; }); if (!t) return;
  t.statut = 'En cours'; t.started_at = new Date().toISOString();
  renderAll();
  await sb.from('terrain_missions').update({ statut: t.statut, started_at: t.started_at }).eq('id', id);
}
async function stopTe(id) {
  var t = state.terrain.find(function (x) { return x.id === id; }); if (!t) return;
  if (t.started_at) { t.elapsed_ms = (t.elapsed_ms || 0) + (Date.now() - new Date(t.started_at).getTime()); }
  t.statut = 'Terminée'; t.started_at = null;
  renderAll();
  await sb.from('terrain_missions').update({ statut: t.statut, started_at: null, elapsed_ms: t.elapsed_ms }).eq('id', id);
  notify('Mission terminée — ' + t.tech + ' (' + fmtElapsed(t.elapsed_ms) + ')', 'ok');
}
function renderTerrain() {
  var list = $('#teList');
  list.innerHTML = state.terrain.length ? state.terrain.map(function (t) {
    var live = t.statut === 'En cours' && t.started_at;
    var elapsed = (t.elapsed_ms || 0) + (live ? (Date.now() - new Date(t.started_at).getTime()) : 0);
    var chipClass = t.statut === 'En cours' ? 'mid' : (t.statut === 'Terminée' ? 'ok' : '');
    var actions = '<div class="app-row-actions">';
    if (t.statut !== 'En cours' && t.statut !== 'Terminée') actions += '<button class="row-btn" data-te-start="' + t.id + '">▶</button>';
    if (t.statut === 'En cours') actions += '<button class="row-btn" data-te-stop="' + t.id + '">⏸</button>';
    actions += '<button class="row-btn" data-te-edit="' + t.id + '">✎</button><button class="row-btn" data-te-del="' + t.id + '">🗑</button></div>';
    return '<div class="app-row" data-te-row="' + t.id + '"><div class="r-main"><b>' + escapeHtml(t.tech) + '</b><span>' + escapeHtml(t.client || '—') + '</span></div>' +
      '<span class="mono" data-te-timer="' + t.id + '" style="min-width:70px;text-align:right;">' + fmtElapsed(elapsed) + '</span>' +
      '<span class="chip ' + chipClass + '">' + t.statut + '</span>' + actions + '</div>';
  }).join('') : '<div class="app-empty">Aucune mission enregistrée.</div>';

  $('#teTotal').textContent = state.terrain.length;
  $('#teCours').textContent = state.terrain.filter(function (t) { return t.statut === 'En cours'; }).length;
  $('#tePlanif').textContent = state.terrain.filter(function (t) { return t.statut === 'Planifiée'; }).length;
  $('#teTerm').textContent = state.terrain.filter(function (t) { return t.statut === 'Terminée'; }).length;
}
setInterval(function () {
  $$('[data-te-timer]').forEach(function (el) {
    var id = el.getAttribute('data-te-timer');
    var t = state.terrain.find(function (x) { return x.id === id; });
    if (!t || t.statut !== 'En cours' || !t.started_at) return;
    el.textContent = fmtElapsed((t.elapsed_ms || 0) + (Date.now() - new Date(t.started_at).getTime()));
  });
}, 1000);

/* ---------------- 9. Équipes ---------------- */
$('#eqAddBtn').addEventListener('click', function () {
  $('#eqForm').reset(); $('#eqId').value = '';
  openDrawer('eq', 'Nouveau membre');
});
$('#eqForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var id = $('#eqId').value;
  var data = { nom: $('#eqNom').value.trim(), role: $('#eqRole').value.trim(), statut: $('#eqStatut').value, charge: Number($('#eqCharge').value || 0), email: $('#eqEmail').value.trim(), telephone: $('#eqTel').value.trim(), specialites: $('#eqSpec').value.trim() };
  if (id) {
    var res = await sb.from('team_members').update(data).eq('id', id).select().single();
    if (!res.error) { var item = state.equipes.find(function (x) { return x.id === id; }); if (item) Object.assign(item, res.data); }
  } else {
    var res2 = await sb.from('team_members').insert(withCompany(data)).select().single();
    if (!res2.error) { state.equipes.unshift(res2.data); notify(data.nom + ' a rejoint l\u2019équipe', 'ok'); }
  }
  closeDrawer(); renderAll();
});
function editEq(id) {
  var m = state.equipes.find(function (x) { return x.id === id; }); if (!m) return;
  $('#eqId').value = m.id; $('#eqNom').value = m.nom; $('#eqRole').value = m.role; $('#eqStatut').value = m.statut; $('#eqCharge').value = m.charge; $('#eqEmail').value = m.email || ''; $('#eqTel').value = m.telephone || ''; $('#eqSpec').value = m.specialites || '';
  openDrawer('eq', 'Modifier le membre');
}
async function deleteEq(id) {
  state.equipes = state.equipes.filter(function (x) { return x.id !== id; }); renderAll();
  await sb.from('team_members').delete().eq('id', id);
}
function renderEquipes() {
  var list = $('#eqList');
  list.innerHTML = state.equipes.length ? state.equipes.map(function (m) {
    var chipClass = m.statut === 'Disponible' ? 'ok' : (m.statut === 'En mission' ? 'crit' : 'mid');
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(m.nom) + '</b><span>' + escapeHtml(m.role || '—') + '</span></div>' +
      '<span class="mono" style="min-width:40px;">' + m.charge + '%</span>' +
      '<span class="chip ' + chipClass + '">' + m.statut + '</span>' +
      '<div class="app-row-actions"><button class="row-btn" data-eq-edit="' + m.id + '">✎</button><button class="row-btn" data-eq-del="' + m.id + '">🗑</button></div></div>';
  }).join('') : '<div class="app-empty">Aucun membre enregistré.</div>';
}

/* ---------------- 10. Automatisation ---------------- */
$('#autoAddBtn').addEventListener('click', function () {
  $('#autoForm').reset();
  openDrawer('auto', 'Nouvelle règle');
});
$('#autoForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var data = { trigger_text: $('#autoTrigger').value.trim(), action_text: $('#autoAction').value.trim(), live: false };
  var res = await sb.from('automation_rules').insert(withCompany(data)).select().single();
  if (!res.error) { state.automations.unshift(res.data); notify('Règle ajoutée : ' + data.trigger_text, 'ok'); }
  closeDrawer(); renderAll();
});
async function deleteAuto(id) {
  state.automations = state.automations.filter(function (x) { return x.id !== id; }); renderAll();
  await sb.from('automation_rules').delete().eq('id', id);
}
function renderAuto() {
  var wrap = $('#autoList');
  wrap.innerHTML = state.automations.length ? state.automations.map(function (a) {
    return '<div class="rule-row"><em>SI</em>' + escapeHtml(a.trigger_text) + '<em>ALORS</em>' + escapeHtml(a.action_text) +
      (a.live ? '<span class="chip ok">Active</span>' : '') +
      '<button class="row-btn r-x" data-auto-del="' + a.id + '">🗑</button></div>';
  }).join('') : '<div class="app-empty">Aucune règle définie.</div>';
}

/* ---------------- 11. Business Brain (calculs en direct) ---------------- */
function renderBrain() {
  var wrap = $('#brainList');
  var ticketsHaute = state.tickets.filter(function (t) { return t.priorite === 'Haute' && t.statut !== 'Résolu' && t.statut !== 'Fermé'; });
  var valeurNego = state.crm.filter(function (c) { return c.statut === 'Négociation'; }).reduce(function (s, c) { return s + Number(c.valeur || 0); }, 0);
  var nbNego = state.crm.filter(function (c) { return c.statut === 'Négociation'; }).length;
  var surcharge = state.equipes.filter(function (m) { return Number(m.charge) >= 80; });
  var missionsCours = state.terrain.filter(function (t) { return t.statut === 'En cours'; });
  var items = [];
  items.push(ticketsHaute.length
    ? { t: ticketsHaute.length + ' ticket' + (ticketsHaute.length > 1 ? 's' : '') + ' en priorité haute encore ouvert' + (ticketsHaute.length > 1 ? 's' : '') + '.', c: 'crit' }
    : { t: 'Aucun ticket critique ouvert en ce moment.', c: 'ok' });
  items.push(nbNego
    ? { t: nbNego + ' client' + (nbNego > 1 ? 's' : '') + ' en négociation, représentant ' + fcfa(valeurNego) + ' de pipeline.', c: 'mid' }
    : { t: 'Aucune négociation en cours.', c: '' });
  items.push(surcharge.length
    ? { t: surcharge.length + ' membre' + (surcharge.length > 1 ? 's' : '') + " d'équipe à plus de 80% de charge : " + surcharge.map(function (m) { return m.nom; }).join(', ') + '.', c: 'crit' }
    : { t: "Aucune surcharge d'équipe détectée.", c: 'ok' });
  items.push(missionsCours.length
    ? { t: missionsCours.length + ' mission' + (missionsCours.length > 1 ? 's' : '') + ' terrain en cours actuellement.', c: 'mid' }
    : { t: 'Aucune mission terrain en cours.', c: '' });

  wrap.innerHTML = items.map(function (it) {
    return '<div class="app-row"><div class="r-main"><span>' + it.t + '</span></div>' + (it.c ? '<span class="chip ' + it.c + '">' + (it.c === 'crit' ? 'Attention' : it.c === 'ok' ? 'Sain' : 'À suivre') + '</span>' : '') + '</div>';
  }).join('');
}

/* ---------------- 12. Decision Simulator ---------------- */
function renderSim() {
  var tech = Number($('#simTech').value);
  var delay = Number($('#simDelay').value);
  $('#simTechVal').textContent = tech;
  $('#simDelayVal').textContent = delay + '%';
  var prod = tech * 6 + delay * 0.4;
  var cost = tech * 4 - delay * 0.2;
  var risk = -(tech * 2 + delay * 0.3);
  $('#simProd').textContent = (prod >= 0 ? '+' : '') + prod.toFixed(1) + '%';
  $('#simCost').textContent = (cost >= 0 ? '+' : '') + cost.toFixed(1) + '%';
  $('#simRisk').textContent = risk.toFixed(1) + '%';
}
$('#simTech').addEventListener('input', renderSim);
$('#simDelay').addEventListener('input', renderSim);

/* ---------------- 13. Accueil ---------------- */
function renderPerfChart() {
  var svg = $('#perfChart'); if (!svg) return;
  var n = 14, pts = [], i;
  for (i = 0; i < n; i++) {
    var base = state.crm.length + state.tickets.length + state.terrain.length;
    pts.push(6 + ((base * 7 + i * 13) % 23) + i * 1.4);
  }
  var max = Math.max.apply(null, pts), min = Math.min.apply(null, pts);
  var w = 600, h = 100, step = w / (n - 1);
  var d = pts.map(function (v, k) { var y = h - ((v - min) / (max - min || 1)) * h; return (k === 0 ? 'M' : 'L') + (k * step) + ',' + y.toFixed(1); }).join(' ');
  var last = h - ((pts[n - 1] - min) / (max - min || 1)) * h;
  svg.innerHTML = '<defs><linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF7A00" stop-opacity=".28"/><stop offset="1" stop-color="#FF7A00" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + d + ' L ' + w + ',' + h + ' L 0,' + h + ' Z" fill="url(#perfFill)"/>' +
    '<path d="' + d + '" fill="none" stroke="#FF7A00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + w + '" cy="' + last + '" r="4.5" fill="#FF7A00"/>';
}
function renderAccueil() {
  $('#statClients').textContent = state.crm.length;
  $('#statTickets').textContent = state.tickets.filter(function (t) { return t.statut !== 'Résolu' && t.statut !== 'Fermé'; }).length;
  $('#statEquipes').textContent = state.equipes.length;
  $('#statMissions').textContent = state.terrain.filter(function (t) { return t.statut === 'En cours'; }).length;

  var acts = [];
  state.tickets.slice(0, 3).forEach(function (t) { acts.push({ label: 'Ticket : ' + t.titre, time: t.created_at }); });
  state.crm.slice(0, 2).forEach(function (c) { acts.push({ label: 'Client : ' + c.nom + ' (' + c.statut + ')', time: null }); });
  $('#activityList').innerHTML = acts.length ? acts.map(function (a) {
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(a.label) + '</b>' + (a.time ? '<span>' + timeAgo(a.time) + '</span>' : '') + '</div></div>';
  }).join('') : '<div class="app-empty">Aucune activité pour le moment.</div>';

  var statuts = ['Prospect', 'Négociation', 'Actif', 'Attente'];
  var total = state.crm.length || 1;
  $('#pipelineMini').innerHTML = statuts.map(function (s) {
    var n = state.crm.filter(function (c) { return c.statut === s; }).length;
    var pct = Math.round((n / total) * 100);
    return '<div style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px;"><span>' + s + '</span><span>' + n + '</span></div>' +
      '<div class="loadbar" style="height:6px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;"><i style="display:block;height:100%;width:' + pct + '%;background:linear-gradient(90deg,var(--ion),var(--electric));"></i></div></div>';
  }).join('');
}

/* ---------------- 14. Notifications & profil ---------------- */
function renderNotifBadge() {
  var n = state.notifications.filter(function (x) { return !x.read; }).length;
  var badge = $('#notifBadge');
  badge.textContent = n;
  badge.classList.toggle('app-hidden', n === 0);
}
function renderNotifList() {
  var wrap = $('#notifList');
  wrap.innerHTML = state.notifications.length ? state.notifications.map(function (n) {
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(n.msg) + '</b><span>' + timeAgo(n.created_at) + '</span></div></div>';
  }).join('') : '<div class="app-empty">Aucune notification.</div>';
}
$('#userMenuBtn').addEventListener('click', function () { showPanel('parametres'); });
$('#profileForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var name = $('#profName').value.trim() || state.profile.full_name;
  state.profile.full_name = name;
  renderTopUser();
  await sb.from('profiles').update({ full_name: name }).eq('id', state.profile.id);
  toast('Profil mis à jour.', 'ok');
});
$('#inviteForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var email = $('#inviteEmail').value.trim();
  var form = $('#inviteForm');
  var statusEl = $('[data-status]', form);
  var res = await sb.from('invitations').insert({ company_id: state.profile.company_id, email: email }).select().single();
  if (res.error) {
    statusEl.setAttribute('data-state', 'err');
    statusEl.textContent = "Impossible d'inviter cette adresse.";
    return;
  }
  state.invitations.unshift(res.data);
  form.reset();
  statusEl.setAttribute('data-state', 'ok');
  statusEl.textContent = 'Invitation enregistrée — ' + email + ' rejoindra votre entreprise en s\u2019inscrivant avec cette adresse.';
  renderInvites();
});
async function cancelInvite(id) {
  state.invitations = state.invitations.filter(function (x) { return x.id !== id; }); renderInvites();
  await sb.from('invitations').delete().eq('id', id);
}
function renderInvites() {
  var card = $('#teamCard');
  card.hidden = state.profile.role !== 'owner';
  var wrap = $('#inviteList');
  var pending = state.invitations.filter(function (i) { return !i.accepted; });
  wrap.innerHTML = pending.length ? pending.map(function (i) {
    return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(i.email) + '</b><span>Invitation en attente · ' + timeAgo(i.created_at) + '</span></div>' +
      '<button class="row-btn" data-invite-del="' + i.id + '">🗑</button></div>';
  }).join('') : '<div class="app-empty">Aucune invitation en attente.</div>';
}
function renderTopUser() {
  var name = state.profile.full_name || 'Vous';
  $('#userName').textContent = name;
  $('#userAv').textContent = name.charAt(0).toUpperCase();
  $('#profName').value = name;
  var companyEl = $('#profCompanyName'); if (companyEl) companyEl.textContent = state.profile.company_name || '—';
  var bannerEl = $('#companyBannerName'); if (bannerEl) bannerEl.textContent = state.profile.company_name || 'Votre entreprise';
}
async function doLogout() {
  await sb.auth.signOut();
  location.reload();
}
$('#logoutBtn').addEventListener('click', doLogout);

/* ---------------- 15. Délégation des clics sur les lignes ---------------- */
document.addEventListener('click', function (e) {
  var t = e.target;
  var id;
  if ((id = t.getAttribute && t.getAttribute('data-crm-edit'))) editCrm(id);
  else if ((id = t.getAttribute && t.getAttribute('data-crm-del'))) deleteCrm(id);
  else if ((id = t.getAttribute && t.getAttribute('data-tk-edit'))) editTk(id);
  else if ((id = t.getAttribute && t.getAttribute('data-tk-del'))) deleteTk(id);
  else if ((id = t.getAttribute && t.getAttribute('data-te-edit'))) editTe(id);
  else if ((id = t.getAttribute && t.getAttribute('data-te-del'))) deleteTe(id);
  else if ((id = t.getAttribute && t.getAttribute('data-te-start'))) startTe(id);
  else if ((id = t.getAttribute && t.getAttribute('data-te-stop'))) stopTe(id);
  else if ((id = t.getAttribute && t.getAttribute('data-eq-edit'))) editEq(id);
  else if ((id = t.getAttribute && t.getAttribute('data-eq-del'))) deleteEq(id);
  else if ((id = t.getAttribute && t.getAttribute('data-auto-del'))) deleteAuto(id);
  else if ((id = t.getAttribute && t.getAttribute('data-invite-del'))) cancelInvite(id);
});

/* ---------------- 16. Menu mobile (barre latérale) ---------------- */
(function mobileSide() {
  var side = $('#appSide');
  var top = $('.app-top');
  if (!top) return;
  var toggle = document.createElement('button');
  toggle.className = 'row-btn';
  toggle.style.display = 'none';
  toggle.setAttribute('aria-label', 'Menu');
  toggle.innerHTML = '☰';
  top.insertBefore(toggle, top.firstChild);
  function sync() { toggle.style.display = window.innerWidth <= 900 ? 'grid' : 'none'; }
  sync();
  window.addEventListener('resize', sync);
  toggle.addEventListener('click', function () { side.classList.toggle('open'); });
})();

/* ---------------- 17. Rendu global & démarrage ---------------- */
function renderAll() {
  renderAccueil();
  renderCrm();
  renderTickets();
  renderTerrain();
  renderEquipes();
  renderAuto();
  renderBrain();
  renderSim();
  renderNotifBadge();
  renderNotifList();
  renderTopUser();
  renderInvites();
  renderReports();
  renderSuivi();
  renderPerfChart();
  animateKpis();
}
async function initPermissionsUI() {
  var roleEl = $('#permissionRole'), list = $('#permissionRequestsList'), form = $('#permissionRequestForm');
  if (!roleEl || !list || !form) return;
  roleEl.textContent = state.profile.role || '—';
  try {
    var p = await sb.rpc('my_permissions');
    var rights = (p.data || []).map(function(x){ return x.permission; });
    var opts = $('#permissionRight option');
    opts.forEach(function(o){ o.disabled = rights.indexOf(o.value) !== -1; });
    var r = await sb.rpc('my_permission_requests');
    if (r.error) { list.innerHTML = '<div class="app-empty">Impossible de charger les demandes.</div>'; return; }
    var rows = r.data || [];
    list.innerHTML = rows.length ? rows.map(function(x){
      var cls = x.status === 'approved' ? 'ok' : (x.status === 'denied' ? 'crit' : 'mid');
      return '<div class="app-row"><div class="r-main"><b>' + escapeHtml(x.requested_right) + '</b><span>' + escapeHtml(x.reason || 'Sans motif') + '</span></div><span class="chip ' + cls + '">' + escapeHtml(x.status) + '</span></div>';
    }).join('') : '<div class="app-empty">Aucune demande envoyée.</div>';
    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', async function(e){
        e.preventDefault();
        var status = $('#permissionStatus');
        status.textContent = 'Envoi…';
        var right = $('#permissionRight').value;
        var reason = $('#permissionReason').value.trim();
        var res = await sb.rpc('request_faxtrix_permission', {p_right:right,p_reason:reason});
        if (res.error) { status.setAttribute('data-state','err'); status.textContent = res.error.message || 'Demande impossible.'; return; }
        status.setAttribute('data-state','ok'); status.textContent = 'Demande envoyée à INFOTELCOM.';
        $('#permissionReason').value = '';
        await initPermissionsUI();
      });
    }
  } catch(e) {
    list.innerHTML = '<div class="app-empty">Les droits seront disponibles après activation de la sécurité.</div>';
  }
}
function boot() {
  renderAll();
  initPermissionsUI();
}

/* ---------------- 18. Installation PWA ---------------- */
(function installPrompt() {
  var deferred = null;
  var btn = $('#installBtn');
  var banners = $$('.inapp-banner');
  function showBanner(text) { banners.forEach(function (b) { b.hidden = false; b.textContent = text; }); }
  var ua = navigator.userAgent || '';
  var isInApp = /FBAN|FBAV|Instagram|Line\/|Messenger|; wv\)/i.test(ua) || (/Android/.test(ua) && /WhatsApp/i.test(ua));
  var isIOS = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (isStandalone) return; // déjà installée, rien à montrer

  if (isInApp) {
    showBanner("📲 Pour installer l'application, ouvre ce lien dans Chrome ou Safari : appuie sur ⋮ (ou sur l'icône navigateur) en haut de l'écran, puis « Ouvrir dans le navigateur ».");
    return;
  }
  if (isIOS) {
    showBanner("📲 Pour installer : appuie sur l'icône Partager (⬆️ dans Safari), puis « Sur l'écran d'accueil ».");
    return;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (btn) btn.hidden = false;
  });
  if (btn) {
    btn.addEventListener('click', async function () {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      btn.hidden = true;
    });
  }
  // Après quelques secondes, si Chrome n'a pas proposé l'installation automatique,
  // on donne quand même le chemin manuel plutôt que de laisser un bouton inactif.
  setTimeout(function () {
    if (!deferred) showBanner("📲 Pas de bouton d'installation automatique ? Ouvre le menu ⋮ du navigateur puis « Installer l'application » (ou « Ajouter à l'écran d'accueil »).");
  }, 4000);
  window.addEventListener('appinstalled', function () { if (btn) btn.hidden = true; banners.forEach(function (b) { b.hidden = true; }); });
})();

/* ---------------- 19. Thème clair / sombre / auto ---------------- */
(function themeSwitch() {
  var KEY = 'faxtrix-theme';
  var mql = window.matchMedia('(prefers-color-scheme: dark)');
  function apply(mode) {
    var dark = mode === 'dark' || (mode === 'auto' && mql.matches);
    document.body.setAttribute('data-theme', dark ? 'dark' : 'light');
    $$('#themeSwitch button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-theme-choice') === mode); });
  }
  var current = localStorage.getItem(KEY) || 'auto';
  apply(current);
  $$('#themeSwitch button').forEach(function (b) {
    b.addEventListener('click', function () {
      current = b.getAttribute('data-theme-choice');
      try { localStorage.setItem(KEY, current); } catch (e) {}
      apply(current);
    });
  });
  mql.addEventListener('change', function () { if (current === 'auto') apply('auto'); });
})();

/* ---------------- 20. Suivi & statistiques ---------------- */
function suiviLabel(action, entity) {
  var map = {created:'Création',updated:'Modification',deleted:'Suppression'};
  var em = {clients:'client',tickets:'ticket',terrain_missions:'mission terrain',team_members:'membre d’équipe',automation_rules:'règle d’automatisation'};
  return (map[action] || action || 'Action') + ' · ' + (em[entity] || entity || 'donnée');
}
function renderSuivi() {
  var s = state.statistics;
  if (!s) {
    ['#suiviClients','#suiviTickets','#suiviMissions','#suiviActions'].forEach(function(id){var e=$(id);if(e)e.textContent='—';});
    var k=$('#suiviKpis'); if(k)k.innerHTML='<div class="app-empty">Les statistiques de suivi ne sont pas encore disponibles.</div>';
    var ac=$('#suiviActivity'); if(ac)ac.innerHTML='<div class="app-empty">Aucune activité.</div>';
    return;
  }
  $('#suiviClients').textContent=s.clients_total||0;
  $('#suiviTickets').textContent=s.tickets_total||0;
  $('#suiviMissions').textContent=s.missions_total||0;
  $('#suiviActions').textContent=s.activity_total||0;
  $('#suiviKpis').innerHTML=[
    ['Tickets ouverts',s.tickets_open||0],['Tickets résolus',s.tickets_resolved||0],
    ['Clients actifs',s.clients_active||0],['Pipeline CRM',fcfa(s.pipeline_value||0)],
    ['Missions en cours',s.missions_active||0],['Missions terminées',s.missions_completed||0],
    ['Membres d’équipe',s.team_total||0],['Automatisations actives',s.automations_live||0]
  ].map(function(x){return '<div class="app-row"><div class="r-main"><b>'+escapeHtml(x[0])+'</b><span>Valeur actuelle</span></div><strong>'+escapeHtml(String(x[1]))+'</strong></div>';}).join('');
  var acts=s.recent_activity||[];
  $('#suiviActivity').innerHTML=acts.length?acts.map(function(x){return '<div class="app-row"><div class="r-main"><b>'+escapeHtml(suiviLabel(x.action,x.entity_type))+'</b><span>'+timeAgo(x.created_at)+'</span></div></div>';}).join(''):'<div class="app-empty">Aucune activité enregistrée.</div>';
  var svg=$('#suiviChart'); if(!svg)return;
  var days=s.daily_activity||[];
  var max=Math.max.apply(null,days.map(function(x){return Number(x.count||0);}).concat([1]));
  var w=600/(days.length||1),out='';
  days.forEach(function(d,i){var n=Number(d.count||0),hh=Math.max(4,(n/max)*120);out+='<rect class="bar" x="'+(i*w+w*.2)+'" y="'+(140-hh)+'" width="'+(w*.6)+'" height="'+hh+'" rx="6"/><text x="'+(i*w+w/2)+'" y="160" text-anchor="middle">'+escapeHtml(String(d.label||''))+'</text>';if(n)out+='<text x="'+(i*w+w/2)+'" y="'+(134-hh)+'" text-anchor="middle" style="fill:var(--accent)">'+n+'</text>';});
  svg.innerHTML=out;
}

/* ---------------- 20. Rapports (graphique animé) ---------------- */
var repRange = 7;
$$('#rapportsRange button').forEach(function (b) {
  b.addEventListener('click', function () {
    $$('#rapportsRange button').forEach(function (x) { x.classList.remove('active'); });
    b.classList.add('active'); repRange = Number(b.getAttribute('data-range')); renderReports();
  });
});
function renderReports() {
  var svg = $('#repChart'); if (!svg) return;
  var since = Date.now() - repRange * 86400000;
  var inRange = state.tickets.filter(function (t) { return new Date(t.created_at).getTime() >= since; });
  $('#repTickets').textContent = inRange.filter(function (t) { return t.statut === 'Résolu' || t.statut === 'Fermé'; }).length;
  $('#repClients').textContent = state.crm.length;
  $('#repValeur').textContent = fcfa(state.crm.reduce(function (s, c) { return s + Number(c.valeur || 0); }, 0));
  $('#repMissions').textContent = state.terrain.length;
  var days = Math.min(repRange, 14), buckets = [], i;
  for (i = days - 1; i >= 0; i--) {
    var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    buckets.push({ label: d.getDate() + '/' + (d.getMonth() + 1), start: d.getTime(), n: 0 });
  }
  state.tickets.forEach(function (t) {
    var ts = new Date(t.created_at).getTime();
    buckets.forEach(function (b) { if (ts >= b.start && ts < b.start + 86400000) b.n++; });
  });
  var max = Math.max.apply(null, buckets.map(function (b) { return b.n; }).concat([1]));
  var w = 600 / buckets.length, out = '<defs><linearGradient id="repGrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FF7A00"/><stop offset="1" stop-color="#FFB45C"/></linearGradient></defs>';
  buckets.forEach(function (b, k) {
    var h = Math.max(4, (b.n / max) * 120);
    out += '<rect class="bar" style="animation-delay:' + (k * 45) + 'ms" x="' + (k * w + w * 0.2) + '" y="' + (130 - h) + '" width="' + (w * 0.6) + '" height="' + h + '" rx="6"/>';
    out += '<text x="' + (k * w + w / 2) + '" y="150" text-anchor="middle">' + b.label + '</text>';
    if (b.n) out += '<text x="' + (k * w + w / 2) + '" y="' + (124 - h) + '" text-anchor="middle" style="fill:var(--accent)">' + b.n + '</text>';
  });
  svg.innerHTML = out;
}

/* compteurs KPI animés */
var kpiSeen = {};
function animateKpis() {
  $$('.app-stat b').forEach(function (el) {
    var txt = el.textContent, num = parseFloat(txt.replace(/[^\d.]/g, ''));
    if (isNaN(num) || kpiSeen[el.id] === txt || txt.indexOf('€') !== -1) return;
    kpiSeen[el.id] = txt;
    var start = performance.now();
    (function tick(now) {
      var p = Math.min(1, (now - start) / 700), v = Math.round(num * (1 - Math.pow(1 - p, 3)));
      el.textContent = v; if (p < 1) requestAnimationFrame(tick); else el.textContent = txt;
    })(start);
  });
}

/* ---------------- 21. Assistant (règles sur vos vraies données) ---------------- */
function aiAnswer(q) {
  q = q.toLowerCase();
  var open = state.tickets.filter(function (t) { return t.statut !== 'Résolu' && t.statut !== 'Fermé'; });
  if (/ticket/.test(q) && /(ouvert|résum|resum|combien|urgent)/.test(q)) {
    if (!open.length) return "Tout est sous contrôle : aucun ticket ouvert.";
    var haute = open.filter(function (t) { return t.priorite === 'Haute'; });
    return open.length + " ticket(s) ouvert(s), dont " + haute.length + " en priorité haute. Les plus récents : " +
      open.slice(0, 3).map(function (t) { return '« ' + t.titre + ' »'; }).join(', ') + '.';
  }
  if (/(technicien|disponible|équipe|equipe)/.test(q)) {
    var dispo = state.equipes.filter(function (m) { return m.statut === 'Disponible'; });
    return dispo.length ? dispo.length + " membre(s) disponible(s) : " + dispo.map(function (m) { return m.nom + ' (' + m.charge + '% de charge)'; }).join(', ') + '.'
      : "Personne n'est marqué « Disponible » pour le moment.";
  }
  if (/(pipeline|crm|client|vente)/.test(q)) {
    var total = state.crm.reduce(function (s, c) { return s + Number(c.valeur || 0); }, 0);
    return state.crm.length + " client(s) pour " + fcfa(total) + " au total, dont " + state.crm.filter(function (c) { return c.statut === 'Négociation'; }).length + " en négociation.";
  }
  if (/(mission|terrain|intervention)/.test(q)) {
    return state.terrain.filter(function (t) { return t.statut === 'En cours'; }).length + " mission(s) en cours sur " + state.terrain.length + " au total.";
  }
  if (/(crée|creer|créer|nouveau).*ticket/.test(q)) { showPanel('tickets'); $('#tkAddBtn').click(); return "J'ouvre le formulaire de nouveau ticket."; }
  return "Je sais répondre sur vos tickets, clients, équipe et missions. Essayez : « Résume mes tickets ouverts ».";
}
function aiSay(text, who) {
  var log = $('#aiLog'), m = document.createElement('div');
  m.className = 'ai-msg ' + who; m.textContent = text; log.appendChild(m); log.scrollTop = log.scrollHeight; return m;
}
function aiAsk(q) {
  if (!q.trim()) return;
  aiSay(q, 'user');
  var t = document.createElement('div'); t.className = 'ai-msg bot'; t.innerHTML = '<span class="ai-typing"><i></i><i></i><i></i></span>';
  $('#aiLog').appendChild(t);
  setTimeout(function () { t.textContent = aiAnswer(q); $('#aiLog').scrollTop = 9999; }, 650);
}
$('#aiForm').addEventListener('submit', function (e) { e.preventDefault(); var i = $('#aiInput'); aiAsk(i.value); i.value = ''; });
$$('[data-ai-suggest]').forEach(function (b) { b.addEventListener('click', function () { aiAsk(b.getAttribute('data-ai-suggest')); }); });
aiSay("Bonjour ! Je peux résumer vos tickets, vos clients, votre équipe et vos missions.", 'bot');

/* ---------------- 22. Sécurité ---------------- */
$('#pwdForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var st = $('[data-status]', e.target), res = await sb.auth.updateUser({ password: $('#pwdNew').value });
  st.setAttribute('data-state', res.error ? 'err' : 'ok');
  st.textContent = res.error ? authErrorFr(res.error.message) : 'Mot de passe mis à jour.';
  if (!res.error) e.target.reset();
});
$('#logoutAllBtn').addEventListener('click', async function () { await sb.auth.signOut({ scope: 'global' }); location.reload(); });

/* ---------------- 23. Recherche globale ---------------- */
var searchModal = $('#searchModal');
function openSearch() { searchModal.classList.add('on'); setTimeout(function () { $('#searchInput').focus(); }, 60); renderSearch(''); }
function closeSearch() { searchModal.classList.remove('on'); }
$('#searchBtn').addEventListener('click', openSearch);
$$('[data-search-close]').forEach(function (el) { el.addEventListener('click', closeSearch); });
document.addEventListener('keydown', function (e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !$('#appShell').classList.contains('app-hidden')) { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape') closeSearch();
});
$('#searchInput').addEventListener('input', function (e) { renderSearch(e.target.value.trim().toLowerCase()); });
function renderSearch(q) {
  var groups = [
    ['Tickets', 'tickets', state.tickets.filter(function (t) { return !q || t.titre.toLowerCase().indexOf(q) !== -1; }), function (t) { return [t.titre, t.statut + ' · ' + t.priorite]; }],
    ['Clients', 'crm', state.crm.filter(function (c) { return !q || c.nom.toLowerCase().indexOf(q) !== -1; }), function (c) { return [c.nom, c.statut + ' · ' + fcfa(c.valeur)]; }],
    ['Équipe', 'equipes', state.equipes.filter(function (m) { return !q || m.nom.toLowerCase().indexOf(q) !== -1 || (m.role || '').toLowerCase().indexOf(q) !== -1; }), function (m) { return [m.nom, (m.role || '—') + ' · ' + m.statut]; }]
  ], html = '';
  groups.forEach(function (g) {
    if (!g[2].length) return;
    html += '<div class="sr-group">' + g[0] + '</div>' + g[2].slice(0, 5).map(function (it) {
      var d = g[3](it); return '<div class="sr-item" data-go="' + g[1] + '"><b>' + escapeHtml(d[0]) + '</b><span>' + escapeHtml(d[1]) + '</span></div>';
    }).join('');
  });
  $('#searchResults').innerHTML = html || '<div class="app-empty">Aucun résultat.</div>';
  $$('.sr-item', $('#searchResults')).forEach(function (el) { el.addEventListener('click', function () { closeSearch(); showPanel(el.getAttribute('data-go')); }); });
}

/* ---------------- 24. Connexion réseau ---------------- */
(function netState() {
  var pill = null;
  function show(ok, msg) {
    if (pill) pill.remove();
    pill = document.createElement('div'); pill.className = 'net-pill' + (ok ? ' ok' : ''); pill.textContent = msg; document.body.appendChild(pill);
    if (ok) setTimeout(function () { if (pill) { pill.remove(); pill = null; } }, 2200);
  }
  window.addEventListener('offline', function () { show(false, "Vous êtes hors connexion — synchronisation au retour du réseau."); });
  window.addEventListener('online', function () { show(true, 'Connexion rétablie'); });
})();

/* ---------------- 25. Mises à jour de l'application ---------------- */
var APP_VERSION = '1.0.0';
var PLATFORM = (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'android') ? 'android'
  : (navigator.userAgent.indexOf('Electron') !== -1 ? 'desktop' : 'web');
function cmpVer(a, b) {
  var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (var i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return 1; if ((x[i] || 0) < (y[i] || 0)) return -1; }
  return 0;
}
async function checkForUpdate(force) {
  try {
    var last = Number(localStorage.getItem('faxtrix-upd-check') || 0);
    if (!force && Date.now() - last < 6 * 3600 * 1000) return;           // pas de requêtes inutiles : 1 vérification / 6 h
    var res = await sb.from('app_versions').select('*').eq('platform', PLATFORM).maybeSingle();
    localStorage.setItem('faxtrix-upd-check', String(Date.now()));
    var v = res.data; if (!v || cmpVer(v.latest_version, APP_VERSION) <= 0) return;
    var mustUpdate = v.force_update || cmpVer(APP_VERSION, v.minimum_version) < 0;
    var snoozed = Number(localStorage.getItem('faxtrix-upd-snooze') || 0);
    if (!mustUpdate && Date.now() < snoozed) return;                      // « Plus tard » respecté 24 h
    $('#updateTitle').textContent = mustUpdate ? 'Mise à jour requise' : 'Une nouvelle version est prête';
    $('#updateBody').textContent = 'Version ' + APP_VERSION + ' → ' + v.latest_version + '. ' + (v.release_notes || 'Plus rapide, plus sûre et avec de nouvelles fonctionnalités.') +
      (mustUpdate ? ' Pour continuer à utiliser FAXTRIX, installez la dernière version.' : '');
    $('#updateLaterBtn').style.display = mustUpdate ? 'none' : '';
    var link = $('#updateNowBtn'); link.href = v.download_url || location.href;
    link.onclick = function (e) { if (!v.download_url || PLATFORM === 'web') { e.preventDefault(); navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(function (r) { r.forEach(function (x) { x.unregister(); }); }); caches && caches.keys().then(function (k) { k.forEach(function (n) { caches.delete(n); }); }); location.reload(true); } };
    $('#updateModal').classList.add('on');
  } catch (e) { /* hors ligne : on réessaiera */ }
}
$('#updateLaterBtn').addEventListener('click', function () { localStorage.setItem('faxtrix-upd-snooze', String(Date.now() + 24 * 3600 * 1000)); $('#updateModal').classList.remove('on'); });
document.addEventListener('visibilitychange', function () { if (!document.hidden && !$('#appShell').classList.contains('app-hidden')) checkForUpdate(false); });
setTimeout(function () { checkForUpdate(false); }, 2500);
var verEl = document.createElement('div'); verEl.className = 'profile-row'; verEl.innerHTML = '<span>Version</span><span>' + APP_VERSION + ' · ' + PLATFORM + '</span>';
var ps = $('#profCompanyName'); if (ps && ps.parentNode) ps.parentNode.parentNode.insertBefore(verEl, ps.parentNode.nextSibling);

})();
