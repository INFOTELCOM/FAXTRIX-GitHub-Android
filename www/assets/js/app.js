(function () {
"use strict";

/* ---------------- 0. Aides ---------------- */
function $(sel, ctx) { return (ctx || document).querySelector(sel); }
function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
var FAXTRIX_CURRENCY_DEFAULT = 'XAF';
function currentCurrency() {
  try { return localStorage.getItem('faxtrix-currency') || FAXTRIX_CURRENCY_DEFAULT; } catch(e) { return FAXTRIX_CURRENCY_DEFAULT; }
}
function money(n) {
  var code = currentCurrency();
  try {
    return new Intl.NumberFormat('fr-FR', { style:'currency', currency:code, maximumFractionDigits:2 }).format(Number(n||0));
  } catch(e) {
    return Number(n||0).toLocaleString('fr-FR') + ' ' + code;
  }
}
function euros(n) { return money(n); }
function initCurrencySelector() {
  var el = $('#currencySelect'); if (!el) return;
  var common = ['XAF','XOF','EUR','USD','GBP','CAD','CHF','MAD','NGN','GHS','ZAR','KES','ETB','EGP','AED','SAR','QAR','INR','CNY','JPY','KRW','AUD','NZD','SGD','HKD','BRL','MXN','ARS','CLP','COP','PEN','TRY','PLN','SEK','NOK','DKK','CZK','HUF','RON','UAH','ISK'];
  var all = [];
  try { all = Intl.supportedValuesOf('currency'); } catch(e) { all = common.slice(); }
  var codes = common.concat(all.filter(function(x){return common.indexOf(x)===-1;}));
  var current = currentCurrency();
  var names;
  try { names = new Intl.DisplayNames(['fr-FR'], {type:'currency'}); } catch(e) { names = null; }
  el.innerHTML = codes.map(function(code){
    var label = names ? (names.of(code)||code) : code;
    return '<option value="'+code+'">'+code+' — '+escapeHtml(label)+'</option>';
  }).join('');
  el.value = codes.indexOf(current)>=0 ? current : FAXTRIX_CURRENCY_DEFAULT;
  el.addEventListener('change', function(){
    localStorage.setItem('faxtrix-currency', this.value);
    renderAll();
    renderReports();
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

initCurrencySelector();

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

  var companyId = state.profile.company_id;
  var results = await Promise.all([
    sb.from('clients').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    sb.from('tickets').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    sb.from('terrain_missions').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    sb.from('team_members').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    sb.from('automation_rules').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    sb.from('notifications').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(40),
    state.profile.role === 'owner'
      ? sb.from('invitations').select('*').order('created_at', { ascending: false })
      : Promise.resolve({ data: [] })
  ]);
  var labels = ['clients','tickets','missions terrain','équipe','automatisations','notifications'];
  results.forEach(function(r,i){ if(r.error) console.error('FAXTRIX '+labels[i]+' :', r.error); });
  state.crm = results[0].error ? [] : (results[0].data || []);
  state.tickets = results[1].error ? [] : (results[1].data || []);
  state.terrain = results[2].error ? [] : (results[2].data || []);
  state.equipes = results[3].error ? [] : (results[3].data || []);
  state.automations = results[4].error ? [] : (results[4].data || []);
  state.notifications = results[5].error ? [] : (results[5].data || []);
  if(results[1].error) toast('Les tickets ne peuvent pas être chargés : '+results[1].error.message,'crit');
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
  var plusSheet = $('#plusSheet'); if (plusSheet) plusSheet.classList.remove('on');
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
$$('[data-plus-open]').forEach(function (el) {
  el.addEventListener('click', function (e) {
    e.preventDefault();
    $('#plusSheet').classList.add('on');
    if (state.profile) {
      $('#plusUserName').textContent = state.profile.full_name || 'Votre espace FAXTRIX';
      $('#plusUserRole').textContent = (state.profile.company_name || 'Votre entreprise') + ' · ' + (state.profile.role || 'membre');
    }
  });
});
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
    return '<div class="app-row" data-record-view="crm:'+c.id+'"><div class="r-main"><b>' + escapeHtml(c.nom) + '</b><span>' + euros(c.valeur) + ' · Enregistré : ' + escapeHtml(fmtDateTime(c.created_at)) + ' · Modifié : ' + escapeHtml(fmtDateTime(c.updated_at)) + '</span></div>' +
      '<span class="chip ' + chipClass + '">' + c.statut + '</span>' +
      '<div class="app-row-actions"><button class="row-btn" data-record-open="crm:'+c.id+'">◉</button><button class="row-btn" data-crm-edit="' + c.id + '">✎</button><button class="row-btn" data-crm-del="' + c.id + '">🗑</button></div></div>';
  }).join('') : '<div class="app-empty">Aucun client pour ce filtre.</div>';

  $('#crmTotal').textContent = state.crm.length;
  $('#crmValeur').textContent = euros(state.crm.reduce(function (s, c) { return s + Number(c.valeur || 0); }, 0));
  $('#crmActifs').textContent = state.crm.filter(function (c) { return c.statut === 'Actif'; }).length;
  $('#crmNego').textContent = state.crm.filter(function (c) { return c.statut === 'Négociation'; }).length;
}

/* ---------------- 7. Tickets ---------------- */
var tkFilter = 'Tous', tkQuery = '', tkAutosaveTimer = null;

function fmtDateTime(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
}
function ticketWorkElapsed(t) {
  if (!t || !t.work_started_at) return 0;
  var end = t.work_closed_at ? new Date(t.work_closed_at).getTime() : Date.now();
  return Math.max(0, (t.work_duration_seconds || 0) * 1000 || end - new Date(t.work_started_at).getTime());
}
function fillTicketForm(t) {
  $('#tkId').value = t.id || '';
  $('#tkNumero').textContent = t.numero || 'Attribution automatique';
  $('#tkOpenedAt').textContent = fmtDateTime(t.opened_at || t.created_at);
  $('#tkWorkStartedAt').textContent = fmtDateTime(t.work_started_at);
  $('#tkWorkClosedAt').textContent = fmtDateTime(t.work_closed_at);
  $('#tkLastModifiedAt').textContent = fmtDateTime(t.last_modified_at || t.updated_at);
  $('#tkTitre').value = t.titre || '';
  $('#tkClient').value = t.client || '';
  $('#tkCategorie').value = t.categorie || 'Général';
  $('#tkPriorite').value = t.priorite || 'Moyenne';
  $('#tkStatut').value = t.statut || 'Nouveau';
  $('#tkAssigned').value = t.assigned_to || '';
  $('#tkDue').value = t.due_at ? new Date(t.due_at).toISOString().slice(0,16) : '';
  $('#tkProblem').value = t.problem || '';
  $('#tkTasks').value = t.tasks || '';
  $('#tkRecommendations').value = t.recommendations || '';
  $('#tkResolution').value = t.resolution || '';
  $('#tkDescription').value = t.description || '';
  updateTicketSessionUI(t);
}
function updateTicketSessionUI(t) {
  var active = !!(t && t.work_started_at && !t.work_closed_at);
  $('#tkWorkSessionLabel').textContent = active ? 'Session de travail en cours' : (t && t.work_closed_at ? 'Session de travail fermée' : 'Session de travail non démarrée');
  $('#tkWorkDuration').textContent = t && t.work_started_at ? 'Durée : ' + fmtElapsed(ticketWorkElapsed(t)) : 'Le temps de travail sera calculé automatiquement.';
  $('#tkStartSessionBtn').disabled = !t || !t.id || active || !!(t && t.work_closed_at);
  $('#tkEndSessionBtn').disabled = !active;
}
setInterval(function(){
  var id=$('#tkId')&&$('#tkId').value;
  if(!id)return;
  var t=state.tickets.find(function(x){return x.id===id;});
  if(t && t.work_started_at && !t.work_closed_at){
    $('#tkWorkDuration').textContent='Durée : '+fmtElapsed(ticketWorkElapsed(t));
  }
},1000);
async function loadTicketHistory(id) {
  var box = $('#tkHistory'), list = $('#tkHistoryList');
  if (!id) { box.style.display='none'; return; }
  box.style.display='block'; list.textContent='Chargement…';
  var res = await sb.from('ticket_edit_history').select('id,editor_id,action,changed_at,before_data,after_data').eq('ticket_id',id).order('changed_at',{ascending:false}).limit(15);
  if (res.error) { list.textContent='Historique indisponible pour le moment.'; return; }
  if (!res.data.length) { list.textContent='Aucune modification enregistrée.'; return; }
  list.innerHTML=res.data.map(function(h){
    var after=h.after_data||{};
    var who=h.editor_id===state.profile.id?'Vous':'Utilisateur';
    return '<div style="padding:7px 0;border-bottom:1px solid var(--line-soft);"><b>'+escapeHtml(who)+'</b> · '+escapeHtml(h.action)+'<br><span>'+escapeHtml(fmtDateTime(h.changed_at))+'</span> · '+escapeHtml(after.titre||'Ticket')+'</div>';
  }).join('');
}
function ticketFormData() {
  return {
    titre: $('#tkTitre').value.trim(),
    client: $('#tkClient').value.trim(),
    categorie: $('#tkCategorie').value,
    priorite: $('#tkPriorite').value,
    statut: $('#tkStatut').value,
    assigned_to: $('#tkAssigned').value.trim(),
    due_at: $('#tkDue').value ? new Date($('#tkDue').value).toISOString() : null,
    problem: $('#tkProblem').value.trim(),
    tasks: $('#tkTasks').value.trim(),
    recommendations: $('#tkRecommendations').value.trim(),
    resolution: $('#tkResolution').value.trim(),
    description: $('#tkDescription').value.trim()
  };
}
async function saveTicket(id, data, silent) {
  var res=await sb.from('tickets').update(data).eq('id',id).select().single();
  if(res.error){ if(!silent) toast('Impossible d’enregistrer le ticket : '+res.error.message,'crit'); return null; }
  var item=state.tickets.find(function(t){return t.id===id;});
  if(item) Object.assign(item,res.data);
  if(!silent) toast('Ticket enregistré.','ok');
  renderAll();
  return res.data;
}
$('#tkAddBtn').addEventListener('click', function () {
  $('#tkForm').reset(); $('#tkId').value='';
  $('#tkNumero').textContent='Attribution automatique';
  $('#tkOpenedAt').textContent=fmtDateTime(new Date().toISOString());
  $('#tkWorkStartedAt').textContent='—'; $('#tkWorkClosedAt').textContent='—'; $('#tkLastModifiedAt').textContent='—';
  $('#tkHistory').style.display='none'; $('#tkAutosaveStatus').textContent='Les modifications seront sauvegardées après création du ticket.';
  updateTicketSessionUI(null);
  openDrawer('tk','Nouveau ticket');
});
$$('#tkTabs button').forEach(function(b){
  b.addEventListener('click',function(){
    $$('#tkTabs button').forEach(function(x){x.classList.remove('active');});
    b.classList.add('active'); tkFilter=b.getAttribute('data-filter'); renderTickets();
  });
});
$('#tkSearch').addEventListener('input',function(e){tkQuery=e.target.value.trim().toLowerCase();renderTickets();});

$('#tkForm').addEventListener('submit', async function(e){
  e.preventDefault();
  var id=$('#tkId').value, data=ticketFormData();
  $('#tkAutosaveStatus').textContent='Enregistrement…';
  if(id){
    var saved=await saveTicket(id,data,true);
    if(saved){ $('#tkAutosaveStatus').textContent='Enregistré à '+fmtDateTime(saved.last_autosaved_at||saved.last_modified_at||new Date().toISOString()); loadTicketHistory(id); }
  } else {
    var payload=withCompany(data);
    payload.opened_at=new Date().toISOString();
    payload.opened_by=state.profile.id;
    var res=await sb.from('tickets').insert(payload).select().single();
    if(res.error){ $('#tkAutosaveStatus').textContent='Erreur : '+res.error.message; toast('Création du ticket impossible.','crit'); return; }
    state.tickets.unshift(res.data);
    localStorage.removeItem('faxtrix-ticket-draft-'+state.profile.id);
    notify('Nouveau ticket : '+data.titre,'ok');
    closeDrawer(); renderAll(); return;
  }
  closeDrawer(); renderAll();
});

function scheduleTicketAutosave(){
  var id=$('#tkId').value;
  if(!id) {
    try { localStorage.setItem('faxtrix-ticket-draft-'+state.profile.id,JSON.stringify(ticketFormData())); $('#tkAutosaveStatus').textContent='Brouillon sauvegardé sur cet appareil.'; } catch(e){}
    return;
  }
  clearTimeout(tkAutosaveTimer);
  $('#tkAutosaveStatus').textContent='Sauvegarde automatique…';
  tkAutosaveTimer=setTimeout(async function(){
    var saved=await saveTicket(id,ticketFormData(),true);
    if(saved) $('#tkAutosaveStatus').textContent='Sauvegardé automatiquement à '+fmtDateTime(saved.last_autosaved_at||saved.last_modified_at||new Date().toISOString());
  },900);
}
['tkTitre','tkClient','tkCategorie','tkPriorite','tkStatut','tkAssigned','tkDue','tkProblem','tkTasks','tkRecommendations','tkResolution','tkDescription'].forEach(function(id){
  var el=$('#'+id); if(el) el.addEventListener('input',scheduleTicketAutosave);
  if(el && el.tagName==='SELECT') el.addEventListener('change',scheduleTicketAutosave);
});

$('#tkStartSessionBtn').addEventListener('click',async function(){
  var id=$('#tkId').value;
  if(!id){toast('Enregistrez d’abord le ticket.','crit');return;}
  var now=new Date().toISOString();
  var saved=await saveTicket(id,{work_started_at:now,work_closed_at:null,work_duration_seconds:0,statut:'En cours'},false);
  if(saved){fillTicketForm(saved);$('#tkAutosaveStatus').textContent='Session démarrée à '+fmtDateTime(now);}
});
$('#tkEndSessionBtn').addEventListener('click',async function(){
  var id=$('#tkId').value, t=state.tickets.find(function(x){return x.id===id;});
  if(!id||!t||!t.work_started_at)return;
  var now=new Date().toISOString(), seconds=Math.max(0,Math.floor((new Date(now).getTime()-new Date(t.work_started_at).getTime())/1000));
  var saved=await saveTicket(id,{work_closed_at:now,work_duration_seconds:seconds,closed_at:now},false);
  if(saved){fillTicketForm(saved);$('#tkAutosaveStatus').textContent='Session fermée à '+fmtDateTime(now);}
});
$('#tkCloseBtn').addEventListener('click',async function(){
  var id=$('#tkId').value;
  if(!id){toast('Enregistrez d’abord le ticket.','crit');return;}
  var t=state.tickets.find(function(x){return x.id===id;})||{};
  var now=new Date().toISOString(), data={statut:'Fermé',closed_at:now};
  if(t.work_started_at&&!t.work_closed_at){data.work_closed_at=now;data.work_duration_seconds=Math.max(0,Math.floor((new Date(now).getTime()-new Date(t.work_started_at).getTime())/1000));}
  var saved=await saveTicket(id,data,false);
  if(saved){fillTicketForm(saved);toast('Ticket fermé à '+fmtDateTime(now),'ok');}
});
function editTk(id){
  var t=state.tickets.find(function(x){return x.id===id;}); if(!t)return;
  fillTicketForm(t); loadTicketHistory(id); openDrawer('tk','Ticket '+(t.numero||''));
}
async function deleteTk(id){
  state.tickets=state.tickets.filter(function(x){return x.id!==id;});renderAll();
  var res=await sb.from('tickets').delete().eq('id',id);
  if(res.error) toast('Suppression refusée : '+res.error.message,'crit');
}
function renderTickets(){
  var list=$('#tkList');
  var rows=state.tickets.filter(function(t){
    var okFilter=tkFilter==='Tous'||t.statut===tkFilter;
    var hay=((t.titre||'')+' '+(t.client||'')+' '+(t.numero||'')).toLowerCase();
    return okFilter&&(!tkQuery||hay.indexOf(tkQuery)!==-1);
  });
  list.innerHTML=rows.length?rows.map(function(t){
    var pClass=t.priorite==='Haute'?'crit':(t.priorite==='Moyenne'?'mid':'ok');
    var opened=fmtDateTime(t.opened_at||t.created_at), closed=fmtDateTime(t.closed_at);
    var work=t.work_started_at?'Travail '+fmtDateTime(t.work_started_at)+(t.work_closed_at?' → '+fmtDateTime(t.work_closed_at):' → en cours'):'Session non démarrée';
    return '<div class="app-row" data-record-view="ticket:'+t.id+'"><div class="r-main"><b>'+escapeHtml(t.numero||'Ticket')+' · '+escapeHtml(t.titre)+'</b><span>'+escapeHtml(t.client||'—')+' · Ouvert : '+escapeHtml(opened)+' · Fermé : '+escapeHtml(closed)+'<br>'+escapeHtml(work)+'</span></div>'+
      '<span class="chip '+pClass+'">'+escapeHtml(t.priorite)+'</span><span class="chip">'+escapeHtml(t.statut)+'</span>'+
      '<div class="app-row-actions"><button class="row-btn" data-record-open="ticket:'+t.id+'">◉</button><button class="row-btn" data-tk-edit="'+t.id+'">✎</button><button class="row-btn" data-tk-del="'+t.id+'">🗑</button></div></div>';
  }).join(''):'<div class="app-empty">Aucun ticket pour ce filtre.</div>';
  $('#tkTotal').textContent=state.tickets.length;
  $('#tkOuverts').textContent=state.tickets.filter(function(t){return t.statut!=='Résolu'&&t.statut!=='Fermé';}).length;
  $('#tkHaute').textContent=state.tickets.filter(function(t){return t.priorite==='Haute';}).length;
  $('#tkResolus').textContent=state.tickets.filter(function(t){return t.statut==='Résolu'||t.statut==='Fermé';}).length;
}
/* ---------------- 8. Terrain ---------------- */
function fillTerrainForm(t){
  $('#teId').value=t.id||'';
  $('#teTech').value=t.tech||'';
  $('#teClient').value=t.client||'';
  $('#teAdresse').value=t.adresse||'';
  $('#teStatut').value=t.statut||'Planifiée';
  $('#teNotes').value=t.notes||'';
  $('#teCompteRendu').value=t.compte_rendu||'';
  $('#teStartedAt').textContent=fmtDateTime(t.started_at);
  $('#teCompletedAt').textContent=fmtDateTime(t.completed_at);
  $('#teDuration').textContent=fmtElapsed((t.elapsed_ms||0)+(t.statut==='En cours'&&t.started_at?(Date.now()-new Date(t.started_at).getTime()):0));
  $('#teModifiedAt').textContent=fmtDateTime(t.updated_at);
}
$('#teAddBtn').addEventListener('click',function(){
  $('#teForm').reset(); $('#teId').value='';
  $('#teStartedAt').textContent='—'; $('#teCompletedAt').textContent='—'; $('#teDuration').textContent='00:00:00'; $('#teModifiedAt').textContent='—';
  openDrawer('te','Nouvelle mission');
});
$('#teForm').addEventListener('submit',async function(e){
  e.preventDefault();
  var id=$('#teId').value;
  var data={tech:$('#teTech').value.trim(),client:$('#teClient').value.trim(),adresse:$('#teAdresse').value.trim(),statut:$('#teStatut').value,notes:$('#teNotes').value.trim(),compte_rendu:$('#teCompteRendu').value.trim()};
  var current=id?state.terrain.find(function(x){return x.id===id;}):null;
  var now=new Date().toISOString();
  if(id && current){
    if(data.statut==='En cours' && !current.started_at){ data.started_at=now; data.completed_at=null; }
    if(data.statut==='Terminée' && current.statut!=='Terminée'){
      data.completed_at=now;
      data.started_at=current.started_at||now;
      data.elapsed_ms=Math.max(current.elapsed_ms||0,Math.floor(new Date(now).getTime()-new Date(data.started_at).getTime()));
    }
    if(data.statut!=='Terminée' && current.statut==='Terminée'){ data.completed_at=null; }
    var res=await sb.from('terrain_missions').update(data).eq('id',id).select().single();
    if(res.error){toast('Impossible d’enregistrer la mission : '+res.error.message,'crit');return;}
    var item=state.terrain.find(function(x){return x.id===id;}); if(item)Object.assign(item,res.data);
  }else{
    data.started_at=data.statut==='En cours'?new Date().toISOString():null;
    data.elapsed_ms=0;
    data.completed_at=data.statut==='Terminée'?new Date().toISOString():null;
    var res2=await sb.from('terrain_missions').insert(withCompany(data)).select().single();
    if(res2.error){toast('Création de la mission impossible : '+res2.error.message,'crit');return;}
    state.terrain.unshift(res2.data); notify('Nouvelle mission assignée à '+data.tech,'ok');
  }
  closeDrawer();renderAll();
});
function editTe(id){
  var t=state.terrain.find(function(x){return x.id===id;}); if(!t)return;
  fillTerrainForm(t); openDrawer('te','Modifier la mission');
}
async function deleteTe(id){
  state.terrain=state.terrain.filter(function(x){return x.id!==id;});renderAll();
  var res=await sb.from('terrain_missions').delete().eq('id',id);
  if(res.error)toast('Suppression refusée : '+res.error.message,'crit');
}
async function startTe(id){
  var t=state.terrain.find(function(x){return x.id===id;});if(!t)return;
  var now=new Date().toISOString();
  var res=await sb.from('terrain_missions').update({statut:'En cours',started_at:now,completed_at:null}).eq('id',id).select().single();
  if(res.error){toast('Démarrage impossible : '+res.error.message,'crit');return;}
  Object.assign(t,res.data);renderAll();notify('Intervention démarrée à '+fmtDateTime(now),'ok');
}
async function stopTe(id){
  var t=state.terrain.find(function(x){return x.id===id;});if(!t)return;
  var now=new Date().toISOString(), elapsed=t.elapsed_ms||0;
  if(t.started_at)elapsed=Math.max(elapsed,Math.floor(new Date(now).getTime()-new Date(t.started_at).getTime()));
  var res=await sb.from('terrain_missions').update({statut:'Terminée',completed_at:now,started_at:t.started_at,elapsed_ms:elapsed}).eq('id',id).select().single();
  if(res.error){toast('Fermeture impossible : '+res.error.message,'crit');return;}
  Object.assign(t,res.data);renderAll();notify('Intervention terminée à '+fmtDateTime(now)+' — durée '+fmtElapsed(elapsed),'ok');
}
function renderTerrain(){
  var list=$('#teList');
  list.innerHTML=state.terrain.length?state.terrain.map(function(t){
    var live=t.statut==='En cours'&&t.started_at;
    var elapsed=(t.elapsed_ms||0)+(live?(Date.now()-new Date(t.started_at).getTime()):0);
    var chipClass=t.statut==='En cours'?'mid':(t.statut==='Terminée'?'ok':'');
    var actions='<div class="app-row-actions">';
    if(t.statut!=='En cours'&&t.statut!=='Terminée')actions+='<button class="row-btn" data-te-start="'+t.id+'">▶</button>';
    if(t.statut==='En cours')actions+='<button class="row-btn" data-te-stop="'+t.id+'">■</button>';
    actions+='<button class="row-btn" data-record-open="terrain:'+t.id+'">◉</button><button class="row-btn" data-te-edit="'+t.id+'">✎</button><button class="row-btn" data-te-del="'+t.id+'">🗑</button></div>';
    return '<div class="app-row" data-te-row="'+t.id+'" data-record-view="terrain:'+t.id+'"><div class="r-main"><b>'+escapeHtml(t.tech)+'</b><span>'+escapeHtml(t.client||'—')+' · Début : '+escapeHtml(fmtDateTime(t.started_at))+' · Fin : '+escapeHtml(fmtDateTime(t.completed_at))+' · Durée : '+escapeHtml(fmtElapsed(elapsed))+'</span></div>'+
      '<span class="mono" data-te-timer="'+t.id+'" style="min-width:70px;text-align:right;">'+fmtElapsed(elapsed)+'</span><span class="chip '+chipClass+'">'+escapeHtml(t.statut)+'</span>'+actions+'</div>';
  }).join(''):'<div class="app-empty">Aucune mission enregistrée.</div>';
  $('#teTotal').textContent=state.terrain.length;
  $('#teCours').textContent=state.terrain.filter(function(t){return t.statut==='En cours';}).length;
  $('#tePlanif').textContent=state.terrain.filter(function(t){return t.statut==='Planifiée';}).length;
  $('#teTerm').textContent=state.terrain.filter(function(t){return t.statut==='Terminée';}).length;
}
setInterval(function(){
  $$('[data-te-timer]').forEach(function(el){
    var id=el.getAttribute('data-te-timer'),t=state.terrain.find(function(x){return x.id===id;});
    if(!t||t.statut!=='En cours'||!t.started_at)return;
    var elapsed=(t.elapsed_ms||0)+(Date.now()-new Date(t.started_at).getTime());
    el.textContent=fmtElapsed(elapsed);
  });
},1000);
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
    return '<div class="app-row" data-record-view="team:'+m.id+'"><div class="r-main"><b>' + escapeHtml(m.nom) + '</b><span>' + escapeHtml(m.role || '—') + ' · Enregistré : ' + escapeHtml(fmtDateTime(m.created_at)) + ' · Modifié : ' + escapeHtml(fmtDateTime(m.updated_at)) + '</span></div>' +
      '<span class="mono" style="min-width:40px;">' + m.charge + '%</span>' +
      '<span class="chip ' + chipClass + '">' + m.statut + '</span>' +
      '<div class="app-row-actions"><button class="row-btn" data-record-open="team:'+m.id+'">◉</button><button class="row-btn" data-eq-edit="' + m.id + '">✎</button><button class="row-btn" data-eq-del="' + m.id + '">🗑</button></div></div>';
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
    return '<div class="rule-row" data-record-view="auto:'+a.id+'"><button class="row-btn" data-record-open="auto:'+a.id+'">◉</button><em>SI</em>' + escapeHtml(a.trigger_text) + '<em>ALORS</em>' + escapeHtml(a.action_text) + '<small style="opacity:.72;margin-left:8px;">Enregistré : ' + escapeHtml(fmtDateTime(a.created_at)) + ' · Modifié : ' + escapeHtml(fmtDateTime(a.updated_at)) + '</small>' +
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
    ? { t: nbNego + ' client' + (nbNego > 1 ? 's' : '') + ' en négociation, représentant ' + euros(valeurNego) + ' de pipeline.', c: 'mid' }
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
    var opts = $$('#permissionRight option');
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
    ['Clients actifs',s.clients_active||0],['Pipeline CRM',euros(s.pipeline_value||0)],
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
function exportReportsCsv() {
  var rows = [['Type','ID','Nom / titre','Statut','Date création','Date modification','Valeur / durée','Détails']];
  state.crm.forEach(function(x){ rows.push(['Client',x.id,x.nom,x.statut,fmtDateTime(x.created_at),fmtDateTime(x.updated_at),x.valeur||0,'']); });
  state.tickets.forEach(function(x){ rows.push(['Ticket',x.id,x.titre||x.numero,x.statut,fmtDateTime(x.created_at),fmtDateTime(x.updated_at),x.work_duration_seconds ? fmtElapsed(Number(x.work_duration_seconds)*1000) : '',x.problem||'']); });
  state.terrain.forEach(function(x){ rows.push(['Terrain',x.id,x.client,x.statut,fmtDateTime(x.created_at),fmtDateTime(x.updated_at),x.elapsed_ms ? fmtElapsed(Number(x.elapsed_ms)) : '',x.adresse||'']); });
  state.equipes.forEach(function(x){ rows.push(['Équipe',x.id,x.nom,x.statut,fmtDateTime(x.created_at),fmtDateTime(x.updated_at),x.charge||0,x.role||'']); });
  state.automations.forEach(function(x){ rows.push(['Automatisation',x.id,x.trigger_text,x.live?'Active':'Inactive',fmtDateTime(x.created_at),fmtDateTime(x.updated_at),'',x.action_text||'']); });
  function csvCell(v){ return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'; }
  var csv='\ufeff'+rows.map(function(r){return r.map(csvCell).join(';');}).join('\r\n');
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='FAXTRIX-rapport-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
}
$('#exportReportBtn')&&$('#exportReportBtn').addEventListener('click',exportReportsCsv);

function renderReports() {
  var svg = $('#repChart'); if (!svg) return;
  var since = Date.now() - repRange * 86400000;
  var inRange = state.tickets.filter(function (t) { return new Date(t.created_at).getTime() >= since; });
  $('#repTickets').textContent = inRange.filter(function (t) { return t.statut === 'Résolu' || t.statut === 'Fermé'; }).length;
  $('#repClients').textContent = state.crm.length;
  $('#repValeur').textContent = euros(state.crm.reduce(function (s, c) { return s + Number(c.valeur || 0); }, 0));
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
const FAXTRIX_GLOSSARY = {
  "ia":"IA signifie Intelligence Artificielle : des techniques permettant à un logiciel d'analyser des informations, produire des réponses ou automatiser certaines tâches.",
  "ai":"AI signifie Artificial Intelligence, l'équivalent anglais de l'IA.",
  "api":"API signifie Application Programming Interface : une interface qui permet à des logiciels ou services de communiquer entre eux.",
  "crm":"CRM signifie Customer Relationship Management : gestion de la relation client. Dans FAXTRIX, il concerne notamment les clients et leurs informations.",
  "sql":"SQL signifie Structured Query Language : langage utilisé pour interroger et manipuler des bases de données relationnelles.",
  "rls":"RLS signifie Row Level Security : mécanisme de sécurité de PostgreSQL/Supabase qui contrôle quelles lignes de données un utilisateur peut lire ou modifier.",
  "rpc":"RPC signifie Remote Procedure Call : appel d'une fonction exécutée côté serveur, par exemple une fonction PostgreSQL appelée depuis FAXTRIX.",
  "uuid":"UUID signifie Universally Unique Identifier : identifiant unique utilisé notamment pour identifier des utilisateurs, conversations et enregistrements.",
  "jwt":"JWT signifie JSON Web Token : format de jeton utilisé notamment pour transmettre des informations d'authentification de manière signée.",
  "url":"URL signifie Uniform Resource Locator : l'adresse d'une ressource sur Internet.",
  "ui":"UI signifie User Interface : l'interface visible avec laquelle l'utilisateur interagit.",
  "ux":"UX signifie User Experience : l'expérience globale vécue par l'utilisateur lorsqu'il utilise une application.",
  "db":"DB signifie Database, c'est-à-dire base de données.",
  "bdd":"BDD signifie Base De Données.",
  "http":"HTTP signifie HyperText Transfer Protocol : protocole utilisé pour les échanges entre navigateur et serveur.",
  "https":"HTTPS est la version sécurisée de HTTP, avec chiffrement TLS des communications.",
  "html":"HTML signifie HyperText Markup Language : langage de structure des pages web.",
  "css":"CSS signifie Cascading Style Sheets : langage utilisé pour mettre en forme l'interface web.",
  "js":"JS signifie JavaScript : langage qui fait fonctionner la logique et les interactions de l'application web.",
  "javascript":"JavaScript est le langage utilisé par FAXTRIX côté interface web pour gérer les formulaires, données, interactions et appels aux services.",
  "json":"JSON signifie JavaScript Object Notation : format texte couramment utilisé pour échanger des données entre applications.",
  "cdn":"CDN signifie Content Delivery Network : réseau de serveurs permettant de distribuer rapidement des ressources comme des bibliothèques JavaScript.",
  "rest":"REST désigne un style d'architecture très utilisé pour les API web, notamment avec des requêtes HTTP.",
  "crud":"CRUD regroupe Create, Read, Update, Delete : les quatre opérations classiques de gestion des données.",
  "auth":"Auth signifie Authentication : mécanisme permettant de vérifier l'identité d'un utilisateur.",
  "rbac":"RBAC signifie Role-Based Access Control : contrôle des accès en fonction du rôle de l'utilisateur.",
  "realtime":"Realtime signifie temps réel : les changements peuvent être transmis aux utilisateurs sans recharger manuellement la page.",
  "webrtc":"WebRTC signifie Web Real-Time Communication : technologies web permettant notamment les appels audio et vidéo entre navigateurs.",
  "turn":"TURN signifie Traversal Using Relays around NAT : serveur relais utilisé lorsqu'une connexion WebRTC directe entre deux appareils ne fonctionne pas.",
  "stun":"STUN signifie Session Traversal Utilities for NAT : service permettant à un appareil de découvrir son adresse réseau publique pour faciliter une connexion WebRTC.",
  "nat":"NAT signifie Network Address Translation : mécanisme qui traduit des adresses réseau privées et publiques.",
  "tcp":"TCP signifie Transmission Control Protocol : protocole réseau orienté connexion et fiable.",
  "udp":"UDP signifie User Datagram Protocol : protocole réseau plus léger, souvent utilisé lorsqu'une faible latence est importante.",
  "tls":"TLS signifie Transport Layer Security : protocole de chiffrement utilisé notamment par HTTPS.",
  "smtp":"SMTP signifie Simple Mail Transfer Protocol : protocole utilisé pour l'envoi des e-mails.",
  "git":"Git est un système de gestion de versions qui permet de suivre les modifications du code.",
  "github":"GitHub est une plateforme permettant notamment d'héberger des dépôts Git et de collaborer sur du code.",
  "supabase":"Supabase est la plateforme utilisée par FAXTRIX pour plusieurs services backend, notamment PostgreSQL, authentification, stockage et temps réel.",
  "postgresql":"PostgreSQL est le système de gestion de base de données relationnelle utilisé par Supabase.",
  "storage":"Storage désigne le stockage de fichiers. FAXTRIX l'utilise notamment pour les pièces jointes et certaines photos.",
  "sw":"SW signifie Service Worker : script web pouvant notamment gérer le cache et certaines fonctions en arrière-plan.",
  "pwa":"PWA signifie Progressive Web App : application web pouvant offrir une expérience proche d'une application installée.",
  "apk":"APK signifie Android Package Kit : format de paquet utilisé pour installer une application Android.",
  "android":"Android est le système d'exploitation mobile utilisé pour la version Android de FAXTRIX.",
  "frontend":"Frontend désigne la partie de l'application exécutée et visible côté utilisateur.",
  "backend":"Backend désigne la partie serveur qui traite les données, la logique et les accès sécurisés.",
  "web":"Web désigne l'ensemble des technologies et services permettant de consulter et utiliser des applications via Internet.",
  "email":"E-mail signifie courrier électronique.",
  "csv":"CSV signifie Comma-Separated Values : format de fichier tabulaire utilisé notamment pour exporter des données.",
  "kpi":"KPI signifie Key Performance Indicator : indicateur clé utilisé pour suivre une activité ou une performance.",
  "soc":"SOC signifie Security Operations Center : centre chargé de surveiller et traiter les événements de cybersécurité.",
  "rgpd":"RGPD signifie Règlement Général sur la Protection des Données.",
  "qa":"QA signifie Quality Assurance : ensemble des pratiques de vérification de la qualité d'un logiciel."
};
function aiGlossaryAnswer(q) {
  var s=String(q||'').toLowerCase().trim();
  var m=s.match(/(?:c[’']est quoi|c'est quoi|que signifie|signifie|définis|définition de|explique|expliquer)\s+(?:le|la|les|un|une|l[’'])?\s*([a-z0-9._-]+)/i);
  if(!m) return null;
  var key=m[1].toLowerCase().replace(/[’']/g,'');
  if(FAXTRIX_GLOSSARY[key]) return '<strong>'+key.toUpperCase()+'</strong> — '+FAXTRIX_GLOSSARY[key];
  var normalized=s.replace(/[’']/g,'');
  for(var k in FAXTRIX_GLOSSARY){
    if(normalized.indexOf(k)>=0) return '<strong>'+k.toUpperCase()+'</strong> — '+FAXTRIX_GLOSSARY[k];
  }
  return null;
}
function aiProgramTermsAnswer(q) {
  var s=String(q||'').toLowerCase();
  if(!/(mot.?cl[eé]|terme|acronyme|abr[eé]viation|vocabulaire|technolog|code|programme|dans faxtrix|dans le programme)/i.test(s)) return null;
  return '<strong>Je peux expliquer le vocabulaire technique de FAXTRIX.</strong><br><br>Exemples : IA, API, CRM, SQL, RLS, RPC, UUID, JWT, URL, UI, UX, HTML, CSS, JavaScript, JSON, CRUD, WebRTC, TURN, STUN, Git, GitHub, Supabase, PostgreSQL, Realtime, PWA, APK, CSV, KPI, RGPD et QA.<br><br>Demandez par exemple : « Que signifie RLS ? », « C’est quoi WebRTC ? », « Explique-moi CRUD » ou « Quels sont les acronymes du programme ? »';
}
function aiAnswer(q) {
  q = q.toLowerCase();
  var glossary = aiGlossaryAnswer(q);
  if (glossary) return glossary;
  var programTerms = aiProgramTermsAnswer(q);
  if (programTerms) return programTerms;
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
    return state.crm.length + " client(s) pour " + euros(total) + " au total, dont " + state.crm.filter(function (c) { return c.statut === 'Négociation'; }).length + " en négociation.";
  }
  if (/(mission|terrain|intervention)/.test(q)) {
    return state.terrain.filter(function (t) { return t.statut === 'En cours'; }).length + " mission(s) en cours sur " + state.terrain.length + " au total.";
  }
  if (/(crée|creer|créer|nouveau).*ticket/.test(q)) { showPanel('tickets'); $('#tkAddBtn').click(); return "J'ouvre le formulaire de nouveau ticket."; }
  if (/(faxtrix|infotelcom|entreprise|éditeur|createur|créateur|contact|téléphone|telephone|email|gmail)/.test(q)) {
    return "INFOTELCOM est l'entreprise à l'origine de FAXTRIX. Elle accompagne les entreprises dans leurs projets numériques, informatiques et de transformation digitale. Site officiel : https://infotelcom-congo-brazzaville.netlify.app/. FAXTRIX propose notamment CRM, tickets, interventions terrain, équipes, automatisation, statistiques, messagerie interne et assistance. Support : contact.infotelcom@gmail.com · +242 06 849 8792 · +242 06 866 0821 · WhatsApp +33 6 52 86 11 59.";
  }
  if (/(devise|prix|monnaie|euro|dollar|fcfa|xaf|usd|eur)/.test(q)) {
    return "Les montants FAXTRIX sont affichés dans la devise choisie dans Paramètres. La sélection accepte les codes de devises internationaux pris en charge par votre navigateur.";
  }
  return "Je peux répondre sur FAXTRIX, INFOTELCOM, vos tickets, clients, équipe, missions, statistiques, rapports et messagerie. Exemple : « Que fait FAXTRIX ? »";
}
function aiSay(text, who) {
  var log = $('#aiLog'), m = document.createElement('div');
  m.className = 'ai-msg ' + who; if (who === 'bot' && /<strong>|<br>|<a /i.test(text)) m.innerHTML = text; else m.textContent = text; log.appendChild(m); log.scrollTop = log.scrollHeight; return m;
}
function aiAsk(q) {
  if (!q.trim()) return;
  aiSay(q, 'user');
  var t = document.createElement('div'); t.className = 'ai-msg bot'; t.innerHTML = '<span class="ai-typing"><i></i><i></i><i></i></span>';
  $('#aiLog').appendChild(t);
  setTimeout(function () {
    var answer = aiAnswer(q);
    t.innerHTML = escapeHtml(answer).replace(
      /https:\/\/infotelcom-congo-brazzaville\.netlify\.app\//g,
      '<a href="https://infotelcom-congo-brazzaville.netlify.app/" target="_blank" rel="noopener noreferrer" class="ai-link">Visiter le site INFOTELCOM ↗</a>'
    );
    $('#aiLog').scrollTop = 9999;
  }, 650);
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
    ['Clients', 'crm', state.crm.filter(function (c) { return !q || c.nom.toLowerCase().indexOf(q) !== -1; }), function (c) { return [c.nom, c.statut + ' · ' + euros(c.valeur)]; }],
    ['Équipe', 'equipes', state.equipes.filter(function (m) { return !q || m.nom.toLowerCase().indexOf(q) !== -1 || (m.role || '').toLowerCase().indexOf(q) !== -1; }), function (m) { return [m.nom, (m.role || '—') + ' · ' + m.statut]; }]
  ], html = '';
  groups.forEach(function (g) {
    if (!g[2].length) return;
    html += '<div class="sr-group">' + g[0] + '</div>' + g[2].slice(0, 5).map(function (it) {
      var d = g[3](it); return '<div class="sr-item" data-go="' + g[1] + '"><b>' + escapeHtml(d[0]) + '</b><span>' + escapeHtml(d[1]) + '</span></div>';
    }).join('');
  });
  $('#searchResults').innerHTML = html || '<div class="app-empty">Aucun résultat.</div>';
  $('.sr-item', $('#searchResults')).forEach(function (el) { el.addEventListener('click', function () { closeSearch(); showPanel(el.getAttribute('data-go')); }); });
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


/* ---------------- 24. Inventaire détaillé des enregistrements ---------------- */
function detailItem(label,value,full){
  return '<div class="record-detail-item'+(full?' full':'')+'"><small>'+escapeHtml(label)+'</small><b>'+escapeHtml(value==null||value===''?'—':String(value))+'</b></div>';
}
function openRecordDetail(kind,id){
  var data, title, sub, html='';
  if(kind==='crm') data=state.crm.find(function(x){return x.id===id;});
  if(kind==='ticket') data=state.tickets.find(function(x){return x.id===id;});
  if(kind==='terrain') data=state.terrain.find(function(x){return x.id===id;});
  if(kind==='team') data=state.equipes.find(function(x){return x.id===id;});
  if(kind==='auto') data=state.automations.find(function(x){return x.id===id;});
  if(!data)return;
  if(kind==='crm'){
    title=data.nom||'Client'; sub='Fiche client complète';
    html=detailItem('Statut',data.statut)+detailItem('Valeur',euros(data.valeur))+detailItem('Enregistré le',fmtDateTime(data.created_at))+detailItem('Dernière modification',fmtDateTime(data.updated_at))+detailItem('Identifiant',data.id,true);
  }else if(kind==='ticket'){
    title=(data.numero||'Ticket')+' · '+(data.titre||''); sub='Fiche ticket et temps de travail';
    html=detailItem('Client',data.client)+detailItem('Statut',data.statut)+detailItem('Priorité',data.priorite)+detailItem('Catégorie',data.categorie)+detailItem('Assigné à',data.assigned_to)+detailItem('Ouverture',fmtDateTime(data.opened_at||data.created_at))+detailItem('Début du travail',fmtDateTime(data.work_started_at))+detailItem('Fin du travail',fmtDateTime(data.work_closed_at))+detailItem('Fermeture',fmtDateTime(data.closed_at))+detailItem('Dernière modification',fmtDateTime(data.last_modified_at||data.updated_at))+detailItem('Durée de travail',data.work_started_at?fmtElapsed(ticketWorkElapsed(data)):'—')+detailItem('Échéance',fmtDateTime(data.due_at))+detailItem('Problème',data.problem,true)+detailItem('Tâches à effectuer',data.tasks,true)+detailItem('Recommandations',data.recommendations,true)+detailItem('Travail effectué',data.resolution,true)+detailItem('Description',data.description,true);
  }else if(kind==='terrain'){
    title='Mission · '+(data.client||'Terrain'); sub='Fiche intervention complète';
    var elapsed=(data.elapsed_ms||0)+(data.statut==='En cours'&&data.started_at?(Date.now()-new Date(data.started_at).getTime()):0);
    html=detailItem('Technicien',data.tech)+detailItem('Client',data.client)+detailItem('Statut',data.statut)+detailItem('Adresse',data.adresse)+detailItem('Ouverture / début',fmtDateTime(data.started_at))+detailItem('Fermeture / fin',fmtDateTime(data.completed_at))+detailItem('Durée',fmtElapsed(elapsed))+detailItem('Enregistré le',fmtDateTime(data.created_at))+detailItem('Dernière modification',fmtDateTime(data.updated_at))+detailItem('Notes',data.notes,true)+detailItem('Compte rendu',data.compte_rendu,true);
  }else if(kind==='team'){
    title=data.nom||'Membre'; sub='Fiche membre de l’équipe';
    html=detailItem('Fonction',data.role)+detailItem('Statut',data.statut)+detailItem('Charge',String(data.charge||0)+' %')+detailItem('E-mail',data.email)+detailItem('Téléphone',data.telephone)+detailItem('Compétence',data.specialites)+detailItem('Enregistré le',fmtDateTime(data.created_at))+detailItem('Dernière modification',fmtDateTime(data.updated_at));
  }else{
    title='Règle d’automatisation'; sub='Fiche règle';
    html=detailItem('Déclencheur',data.trigger_text,true)+detailItem('Action',data.action_text,true)+detailItem('Active',data.live?'Oui':'Non')+detailItem('Enregistrée le',fmtDateTime(data.created_at))+detailItem('Dernière modification',fmtDateTime(data.updated_at));
  }
  $('#recordDetailTitle').textContent=title; $('#recordDetailSub').textContent=sub; $('#recordDetailBody').innerHTML=html; $('#recordDetail').hidden=false;
}
function closeRecordDetail(){ $('#recordDetail').hidden=true; }

/* ---------------- 25. Messagerie FAXTRIX ---------------- */
var chatState={profiles:[],conversations:[],members:{},messages:[],current:null,channel:null,callChannel:null,attachment:null};
function chatInitial(name){return (name||'?').trim().split(/\s+/).slice(0,2).map(function(x){return x.charAt(0).toUpperCase();}).join('')||'?';}
function chatAvatarHtml(profile,size){
  if(profile&&profile.avatar_url)return '<img src="'+escapeHtml(profile.avatar_url)+'" alt="">';
  return escapeHtml(chatInitial(profile&&profile.full_name));
}
async function loadChatProfiles(){
  if(!state.profile||!state.profile.company_id){toast('Profil entreprise introuvable pour la messagerie.','crit');return;}
  var r=await sb.from('profiles').select('id,full_name,role,avatar_url,avatar_path').eq('company_id',state.profile.company_id).order('full_name');
  if(r.error){
    console.error('FAXTRIX profils messagerie:',r.error);
    toast('Impossible de charger les membres : '+r.error.message,'crit');
    chatState.profiles=[];
    return;
  }
  chatState.profiles=r.data||[];
}
async function loadChatConversations(){
  var r=await sb.from('chat_conversations').select('*').eq('company_id',state.profile.company_id).order('updated_at',{ascending:false});
  if(r.error){console.error('FAXTRIX messagerie conversations:',r.error);toast('Messagerie indisponible : '+r.error.message,'crit');chatState.conversations=[];chatState.members={};return;}
  chatState.conversations=r.data||[];
  chatState.members={};
  if(chatState.conversations.length){
    var ids=chatState.conversations.map(function(x){return x.id;});
    var m=await sb.from('chat_members').select('conversation_id,user_id,role,last_read_at').in('conversation_id',ids);
    (m.data||[]).forEach(function(x){(chatState.members[x.conversation_id]||(chatState.members[x.conversation_id]=[])).push(x);});
  }
  renderChatConversationList();
}
function chatOtherProfiles(con){
  return (chatState.members[con.id]||[]).map(function(m){return chatState.profiles.find(function(p){return p.id===m.user_id;});}).filter(Boolean);
}
function chatConversationLabel(con){
  if(con.title)return con.title;
  var names=chatOtherProfiles(con).filter(function(p){return p.id!==state.profile.id;}).map(function(p){return p.full_name;});
  return names.join(', ')||'Conversation';
}
function renderChatConversationList(){
  var q=($('#chatSearch')&&$('#chatSearch').value||'').trim().toLowerCase();
  var list=$('#chatConversationList'); if(!list)return;
  var rows=chatState.conversations.filter(function(c){return !q||chatConversationLabel(c).toLowerCase().indexOf(q)!==-1;});
  list.innerHTML=rows.length?rows.map(function(c){
    var people=chatOtherProfiles(c), first=people[0]||state.profile;
    return '<button type="button" class="chat-conv '+(chatState.current===c.id?'active':'')+'" data-chat-open="'+c.id+'"><div class="chat-avatar">'+chatAvatarHtml(first,38)+'</div><div class="chat-conv-text"><b>'+escapeHtml(chatConversationLabel(c))+'</b><span>'+escapeHtml(c.is_group?(people.length+1)+' membres':'Conversation privée')+'</span></div></button>';
  }).join(''):'<div class="app-empty">Aucune conversation.</div>';
}
async function openChatConversation(id){
  chatState.current=id; renderChatConversationList();
  var con=chatState.conversations.find(function(x){return x.id===id;}); if(!con)return;
  $('#chatEmpty').hidden=true; $('#chatConversation').hidden=false;
  var people=chatOtherProfiles(con), first=people[0]||state.profile;
  $('#chatTitle').textContent=chatConversationLabel(con);
  $('#chatMembersLabel').textContent=con.is_group?((people.length+1)+' membres'):(first.full_name||'Conversation privée');
  $('#chatAvatar').innerHTML=chatAvatarHtml(first,38);
  var r=await sb.from('chat_messages').select('*').eq('conversation_id',id).is('deleted_at',null).order('created_at',{ascending:true});
  if(r.error){toast('Impossible de charger la conversation.','crit');return;}
  chatState.messages=r.data||[]; renderChatMessages();
  if(chatState.channel)await sb.removeChannel(chatState.channel);
  chatState.channel=sb.channel('faxtrix-chat-'+id).on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages',filter:'conversation_id=eq.'+id},function(payload){
    if(!chatState.messages.some(function(x){return x.id===payload.new.id;})){chatState.messages.push(payload.new);renderChatMessages();}
  }).subscribe(function(status){
    chatState.realtimeStatus=status;
    if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
      console.warn('FAXTRIX messagerie Realtime:',status);
      toast('Synchronisation instantanée indisponible : FAXTRIX utilise la synchronisation automatique.','crit');
    }
  });
}
async function renderChatMessages(){
  var box=$('#chatMessages'); if(!box)return;
  box.innerHTML=chatState.messages.map(function(m){
    var mine=m.sender_id===state.profile.id;
    var body='';
    if(m.message_type==='file'){
      body='<div class="chat-file"><span>📎</span><b>'+escapeHtml(m.file_name||'Fichier')+'</b></div>';
    }else if(m.message_type==='image'){
      body='<div class="chat-file"><span>🖼️</span><b>'+escapeHtml(m.file_name||'Image')+'</b></div>';
    }else body=escapeHtml(m.body||'').replace(/\n/g,'<br>');
    return '<div class="chat-bubble '+(mine?'mine':'')+'" data-message-id="'+m.id+'">'+body+'<div class="chat-meta">'+(mine?'Vous':'Membre')+' · '+escapeHtml(fmtDateTime(m.created_at))+'</div></div>';
  }).join('');
  box.scrollTop=box.scrollHeight;
  for(const m of chatState.messages.filter(function(x){return x.file_path;})){
    try{
      var sr=await sb.storage.from('faxtrix-chat').createSignedUrl(m.file_path,3600);
      var el=box.querySelector('[data-message-id="'+m.id+'"] .chat-file');
      if(sr.data&&sr.data.signedUrl&&el)el.style.cursor='pointer',el.onclick=function(){window.open(sr.data.signedUrl,'_blank','noopener');};
    }catch(e){}
  }
}
async function createChatConversation(){
  if(!state.profile||!state.profile.company_id){toast('Profil entreprise introuvable.','crit');return;}
  if(!chatState.profiles.length) await loadChatProfiles();
  var opts=chatState.profiles.filter(function(p){return p.id!==state.profile.id;});
  if(!opts.length){
    $('#recordDetailTitle').textContent='Nouvelle conversation';
    $('#recordDetailSub').textContent='Aucun autre membre disponible';
    $('#recordDetailBody').innerHTML='<div class="app-empty" style="padding:24px;">Aucun autre utilisateur de votre entreprise n’est actuellement disponible pour démarrer une conversation.</div><button type="button" class="btn btn-ghost" id="chatCreateClose">Fermer</button>';
    $('#recordDetail').hidden=false;
    $('#chatCreateClose').onclick=closeRecordDetail;
    return;
  }
  var html='<div class="chat-new-list">'+opts.map(function(p){return '<label class="chat-member-option"><input type="checkbox" value="'+p.id+'"> <div class="chat-avatar" style="width:30px;height:30px;min-width:30px;">'+chatAvatarHtml(p,30)+'</div><span>'+escapeHtml(p.full_name||'Utilisateur')+'</span></label>';}).join('')+'</div><label>Nom du groupe (facultatif)<input id="chatGroupName" type="text" placeholder="Ex. Équipe technique"></label><button type="button" class="btn btn-primary" id="chatCreateConfirm">Créer la conversation</button>';
  $('#recordDetailTitle').textContent='Nouvelle conversation'; $('#recordDetailSub').textContent='Choisissez les membres de votre entreprise'; $('#recordDetailBody').innerHTML=html; $('#recordDetail').hidden=false;
  $('#chatCreateConfirm').onclick=async function(){
    var ids=$$('.chat-member-option input:checked').map(function(x){return x.value;});
    if(!ids.length){toast('Sélectionnez au moins une personne.','crit');return;}
    var selected=ids.map(function(id){return chatState.profiles.find(function(p){return p.id===id;});}).filter(Boolean);
    var group=ids.length>1, name=$('#chatGroupName').value.trim();
    var conversationId=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(ch){var r=Math.random()*16|0,v=ch==='x'?r:(r&3|8);return v.toString(16);}));
    var conversation={
      id:conversationId,
      company_id:state.profile.company_id,
      created_by:state.profile.id,
      title:group?(name||selected.map(function(p){return p.full_name;}).join(', ')):null,
      is_group:group,
      created_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    };
    var cr=await sb.from('chat_conversations').insert(conversation);
    if(cr.error){toast('Création impossible : '+cr.error.message,'crit');return;}
    var members=[{conversation_id:conversationId,user_id:state.profile.id,company_id:state.profile.company_id,role:'admin'}].concat(ids.map(function(id){return {conversation_id:conversationId,user_id:id,company_id:state.profile.company_id,role:'member'};}));
    var mr=await sb.from('chat_members').insert(members);
    if(mr.error){await sb.from('chat_conversations').delete().eq('id',conversationId);toast('Impossible d’ajouter les membres : '+mr.error.message,'crit');return;}
    chatState.conversations.unshift(conversation);
    chatState.members[conversationId]=members;
    closeRecordDetail(); renderChatConversationList(); await openChatConversation(conversationId); toast('Conversation créée.','ok');
  };
}
async function sendChatMessage(e){
  e.preventDefault(); if(!chatState.current)return;
  var input=$('#chatInput'), body=input.value.trim(), file=chatState.attachment;
  if(!body&&!file)return;
  var data={conversation_id:chatState.current,company_id:state.profile.company_id,sender_id:state.profile.id,body:body||null,message_type:'text'};
  if(file){
    var safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'), path=state.profile.company_id+'/'+chatState.current+'/'+state.profile.id+'-'+Date.now()+'-'+safe;
    var up=await sb.storage.from('faxtrix-chat').upload(path,file,{upsert:false});
    if(up.error){toast('Envoi du fichier impossible : '+up.error.message,'crit');return;}
    data.file_path=path; data.file_name=file.name; data.file_size=file.size; data.mime_type=file.type||'application/octet-stream'; data.message_type=(file.type||'').indexOf('image/')===0?'image':'file';
  }
  var messageId=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(ch){var r=Math.random()*16|0,v=ch==='x'?r:(r&3|8);return v.toString(16);}));
  data.id=messageId;
  data.created_at=new Date().toISOString();
  var r=await sb.from('chat_messages').insert(data);
  if(r.error){toast('Message impossible à envoyer : '+r.error.message,'crit');return;}
  var sent=Object.assign({},data);
  input.value=''; chatState.attachment=null; $('#chatAttachment').hidden=true; $('#chatFile').value='';
  await sb.from('chat_conversations').update({updated_at:sent.created_at}).eq('id',chatState.current);
  chatState.messages.push(sent); renderChatMessages(); await loadChatConversations();
}
async function uploadChatAvatar(file){
  if(!file)return;
  var safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=state.profile.id+'/'+Date.now()+'-'+safe;
  var up=await sb.storage.from('faxtrix-avatars').upload(path,file,{upsert:true});
  if(up.error){toast('Photo impossible à enregistrer : '+up.error.message,'crit');return;}
  var signed=await sb.storage.from('faxtrix-avatars').createSignedUrl(path,31536000);
  if(!signed.data||!signed.data.signedUrl){toast('Photo enregistrée mais URL indisponible.','crit');return;}
  var url=signed.data.signedUrl;
  var pr=await sb.from('profiles').update({avatar_url:url,avatar_path:path}).eq('id',state.profile.id);
  if(pr.error){toast('Impossible de mettre à jour la photo : '+pr.error.message,'crit');return;}
  state.profile.avatar_url=url; var me=chatState.profiles.find(function(p){return p.id===state.profile.id;}); if(me)me.avatar_url=url;
  renderChatConversationList(); if(chatState.current)openChatConversation(chatState.current); toast('Photo de profil mise à jour.','ok');
}

/* Appels WebRTC de base via Supabase Realtime broadcast. */
var callState={pc:null,stream:null,remote:null,active:false,type:'video',peer:null};
async function getFaxtrixIceServers(){
  try{
    var session=(await sb.auth.getSession()).data.session;
    var res=await fetch(SUPABASE_URL+'/functions/v1/turn-ice-servers',{
      method:'POST',
      headers:{'Authorization':'Bearer '+(session?session.access_token:SUPABASE_ANON_KEY),'apikey':SUPABASE_ANON_KEY,'Content-Type':'application/json'},
      body:'{}'
    });
    var data=await res.json();
    if(data&&Array.isArray(data.iceServers)&&data.iceServers.length)return data.iceServers;
  }catch(e){}
  return [{urls:['stun:stun.cloudflare.com:3478']}];
}
async function setupCall(type,peerId,initiator){
  if(!chatState.callChannel)chatState.callChannel=sb.channel('faxtrix-call-'+state.profile.company_id).on('broadcast',{event:'call-signal'},async function(ctx){
    var p=ctx.payload||{}; if(p.to!==state.profile.id||p.conversation_id!==chatState.current)return;
    if(p.type==='offer'){
      await setupCall(p.callType,p.from,false); $('#callStatus').textContent='Appel entrant…';
      await callState.pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
      var answer=await callState.pc.createAnswer(); await callState.pc.setLocalDescription(answer);
      chatState.callChannel.send({type:'broadcast',event:'call-signal',payload:{type:'answer',from:state.profile.id,to:p.from,conversation_id:chatState.current,callType:p.callType,sdp:answer}});
    }else if(p.type==='answer'&&callState.pc){
      await callState.pc.setRemoteDescription(new RTCSessionDescription(p.sdp)); $('#callStatus').textContent='Connecté';
    }else if(p.type==='candidate'&&callState.pc){try{await callState.pc.addIceCandidate(new RTCIceCandidate(p.candidate));}catch(e){}}
    else if(p.type==='hangup'){endCall(false);}
  }).subscribe();
  if(callState.active&&callState.peer===peerId)return;
  callState.type=type;callState.peer=peerId;callState.active=true;
  $('#callTitle').textContent=type==='video'?'Appel vidéo':'Appel audio'; $('#callModal').hidden=false; $('#callStatus').textContent=initiator?'Appel en cours…':'Appel entrant…';
  callState.stream=await navigator.mediaDevices.getUserMedia({audio:true,video:type==='video'});
  $('#callLocalVideo').srcObject=callState.stream; $('#callLocalVideo').style.display=type==='video'?'block':'none';
  var iceServers=await getFaxtrixIceServers();
  callState.pc=new RTCPeerConnection({iceServers:iceServers,iceTransportPolicy:'all'});
  callState.pc.onicecandidate=function(e){if(e.candidate)chatState.callChannel.send({type:'broadcast',event:'call-signal',payload:{type:'candidate',from:state.profile.id,to:peerId,conversation_id:chatState.current,candidate:e.candidate}});};
  callState.pc.ontrack=function(e){$('#callRemoteVideo').srcObject=e.streams[0];};
  callState.stream.getTracks().forEach(function(track){callState.pc.addTrack(track,callState.stream);});
  if(initiator){var offer=await callState.pc.createOffer();await callState.pc.setLocalDescription(offer);await chatState.callChannel.send({type:'broadcast',event:'call-signal',payload:{type:'offer',from:state.profile.id,to:peerId,conversation_id:chatState.current,callType:type,sdp:offer}});}
}
function endCall(send){
  if(send&&chatState.callChannel&&callState.peer)chatState.callChannel.send({type:'broadcast',event:'call-signal',payload:{type:'hangup',from:state.profile.id,to:callState.peer,conversation_id:chatState.current}});
  if(callState.pc)callState.pc.close(); if(callState.stream)callState.stream.getTracks().forEach(function(t){t.stop();});
  callState={pc:null,stream:null,remote:null,active:false,type:'video',peer:null}; $('#callModal').hidden=true; $('#callRemoteVideo').srcObject=null; $('#callLocalVideo').srcObject=null;
}
function startCurrentCall(type){
  if(!chatState.current)return;
  var people=chatOtherProfiles(chatState.conversations.find(function(c){return c.id===chatState.current;}));
  var peer=people.find(function(p){return p.id!==state.profile.id;});
  if(!peer){toast('Sélectionnez une conversation avec un membre à appeler.','crit');return;}
  setupCall(type,peer.id,true).catch(function(e){toast('Appel impossible : '+(e.message||'autorisation micro/caméra requise'),'crit');endCall(false);});
}
/* La messagerie peut être initialisée après le rendu de l'application : délégation robuste du bouton. */
document.addEventListener('click',function(e){
  var btn=e.target.closest&&e.target.closest('#chatNewBtn');
  if(btn){
    e.preventDefault();
    createChatConversation().catch(function(err){
      console.error('FAXTRIX nouvelle conversation:',err);
      toast('Impossible d’ouvrir la nouvelle conversation : '+(err.message||err),'crit');
    });
  }
});
$('#chatSearch')&&$('#chatSearch').addEventListener('input',renderChatConversationList);
$('#chatForm')&&$('#chatForm').addEventListener('submit',sendChatMessage);
$('#chatFileBtn')&&$('#chatFileBtn').addEventListener('click',function(){$('#chatFile').click();});
$('#chatFile')&&$('#chatFile').addEventListener('change',function(e){chatState.attachment=e.target.files[0]||null;$('#chatAttachment').hidden=!chatState.attachment;if(chatState.attachment)$('#chatAttachmentName').textContent=chatState.attachment.name;});
$('#chatAttachmentRemove')&&$('#chatAttachmentRemove').addEventListener('click',function(){chatState.attachment=null;$('#chatFile').value='';$('#chatAttachment').hidden=true;});
var chatAvatarFile=$('#chatAvatarFile');
if($('#chatAvatar')&&chatAvatarFile)$('#chatAvatar').addEventListener('click',function(){chatAvatarFile.click();});
if(chatAvatarFile)chatAvatarFile.addEventListener('change',function(e){uploadChatAvatar(e.target.files[0]);});
$('#chatAudioBtn')&&$('#chatAudioBtn').addEventListener('click',function(){startCurrentCall('audio');});
$('#chatVideoBtn')&&$('#chatVideoBtn').addEventListener('click',function(){startCurrentCall('video');});
$('#callHangupBtn')&&$('#callHangupBtn').addEventListener('click',function(){endCall(true);});
$('#callMuteBtn')&&$('#callMuteBtn').addEventListener('click',function(){if(callState.stream){var t=callState.stream.getAudioTracks()[0];if(t){t.enabled=!t.enabled;this.textContent=t.enabled?'🎙️ Muet':'🔇 Activer le micro';}}});
$('#callCameraBtn')&&$('#callCameraBtn').addEventListener('click',function(){if(callState.stream){var t=callState.stream.getVideoTracks()[0];if(t){t.enabled=!t.enabled;this.textContent=t.enabled?'📷 Caméra':'🚫 Caméra';}}});
$$('[data-record-close]').forEach(function(x){x.addEventListener('click',closeRecordDetail);});
$$('[data-call-close]').forEach(function(x){x.addEventListener('click',function(){endCall(true);});});
document.addEventListener('click',function(e){
  var t=e.target,id;
  if((id=t.getAttribute&&t.getAttribute('data-chat-open'))){openChatConversation(id);return;}
  if((id=t.getAttribute&&t.getAttribute('data-record-open'))){var a=id.split(':');openRecordDetail(a[0],a.slice(1).join(':'));return;}
  var row=t.closest&&t.closest('[data-record-view]');
  if(row&&!t.closest('button')){var a2=row.getAttribute('data-record-view').split(':');openRecordDetail(a2[0],a2.slice(1).join(':'));return;}
});
(function initChat(){
  var panel=$('[data-panel="messagerie"]'); if(!panel)return;
  var loaded=false, pollTimer=null, listTimer=null;
  async function refreshCurrentChat(){
    if(!chatState.current)return;
    var r=await sb.from('chat_messages').select('*').eq('conversation_id',chatState.current).is('deleted_at',null).order('created_at',{ascending:true});
    if(r.error){console.error('FAXTRIX messages:',r.error);return;}
    var incoming=r.data||[];
    var changed=incoming.length!==chatState.messages.length || incoming.some(function(m,i){return !chatState.messages[i]||chatState.messages[i].id!==m.id;});
    if(changed){chatState.messages=incoming;await renderChatMessages();}
  }
  async function refreshChat(){
    try{
      await loadChatProfiles();
      await loadChatConversations();
      await refreshCurrentChat();
    }catch(e){
      console.error('FAXTRIX messagerie:',e);
      toast('Messagerie indisponible : '+(e.message||e),'crit');
    }
  }
  function startPolling(){
    if(pollTimer)return;
    pollTimer=setInterval(function(){if(!document.hidden&&panel.classList.contains('active'))refreshCurrentChat();},3000);
    listTimer=setInterval(function(){if(!document.hidden&&panel.classList.contains('active'))loadChatConversations();},5000);
  }
  function ensureLoaded(){
    if(!panel.classList.contains('active'))return;
    if(!loaded){loaded=true;refreshChat();}
    startPolling();
  }
  var observer=new MutationObserver(ensureLoaded);
  observer.observe(panel,{attributes:true,attributeFilter:['class']});
  if(panel.classList.contains('active'))ensureLoaded();
})();

/* faxtrix-chat-loader */
document.addEventListener('click',function(e){
  var b=e.target.closest&&e.target.closest('[data-panel="messagerie"]');
  if(b){
    setTimeout(function(){loadChatProfiles().then(loadChatConversations).catch(function(err){toast('Messagerie indisponible : '+(err.message||err),'crit');});},80);
  }
});