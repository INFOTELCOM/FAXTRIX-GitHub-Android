(function(){'use strict';
const URL='https://xtkcfhbsksoqbpnaciga.supabase.co',KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0a2NmaGJza3NvcWJwbmFjaWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNDY4ODEsImV4cCI6MjEwNTkyMjg4MX0.Drrgf-6Axsdf3u1tHXhn3UoIhTC0Tu291ER0NAQQhTQ';
const sb=supabase.createClient(URL,KEY,{auth:{storageKey:'faxtrix-admin-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}); let data={companies:[],users:[],requests:[],audit:[],invitations:[]};
const $=s=>document.querySelector(s); const escapeAttribute=s=>String(s??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function msg(t){$('#loginMsg').textContent=t||''}
async function boot(){const r=await sb.rpc('infotelcom_admin_bootstrap');if(r.error){document.body.classList.remove('admin-authenticated');$('#login').hidden=false;$('#login').style.setProperty('display','grid','important');$('#app').hidden=true;$('#app').style.setProperty('display','none','important');msg('Accès refusé ou administration non initialisée.');return false} data=r.data||{};const inv=await sb.from('invitations').select('email,full_name,role,company_id,created_at').eq('accepted',false).order('created_at',{ascending:false});data.invitations=inv.error?[]:(inv.data||[]);document.body.classList.add('admin-authenticated');$('#login').hidden=true;$('#login').style.setProperty('display','none','important');$('#app').hidden=false;$('#app').style.removeProperty('display');$('#adminName').textContent=data.profile?.full_name||'INFOTELCOM';render();fillCreateUserCompanies();loadPlatformStats();return true}
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();msg('Connexion…');const r=await sb.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#pass').value});if(r.error){msg('Connexion impossible.');return}await boot()});
$('#logout').onclick=async()=>{await sb.auth.signOut();location.reload()};
$('#refresh').onclick=boot;
$('#refreshPlatform').onclick=loadPlatformStats;
setInterval(function(){if(document.visibilityState==='visible'&&document.body.classList.contains('admin-authenticated'))loadPlatformStats();},30000);
async function loadPlatformStats(){
  const box=$('#platformStats'); if(!box)return;
  box.innerHTML='<div class="empty">Actualisation…</div>';
  const r=await sb.rpc('infotelcom_platform_statistics');
  if(r.error){box.innerHTML='<div class="empty">Statistiques indisponibles : '+esc(r.error.message)+'</div>';return;}
  const x=r.data||{};
  box.innerHTML=[
    ['Clients',x.clients],['Tickets',x.tickets],['Missions',x.missions],['Équipe',x.team_members],
    ['Automatisations',x.automations],['Conversations',x.conversations],['Messages',x.messages],['Actions',x.activity_events]
  ].map(function(v){return '<div><b>'+Number(v[1]||0)+'</b><span>'+esc(v[0].toUpperCase())+'</span></div>';}).join('');
  var modules=$('#platformModules'); if(modules) modules.innerHTML=[
    ['CRM','Données clients et pipeline'],['Tickets','Suivi et clôture des interventions'],['Terrain','Missions et temps d’intervention'],['Équipes','Membres et compétences'],['Messagerie','Conversations, fichiers et appels'],['Assistant IA','Glossaire + données FAXTRIX + recherche web'],['Recherche Google','Sources web via Google Custom Search'],['IA polyvalente','Synthèse via OpenRouter'],['Suivi & statistiques','Indicateurs et activité'],['Administration INFOTELCOM','Entreprises, utilisateurs, droits et audit']
  ].map(function(v){return '<div><b>✓</b><span>'+esc(v[0].toUpperCase())+'<small style="display:block;margin-top:4px;font-size:10px;opacity:.7;text-transform:none;letter-spacing:0;">'+esc(v[1])+'</small></span></div>';}).join('');
}
async function adminUserAction(payload){
  const msgEl=$('#createUserMsg');
  if(msgEl) msgEl.textContent='Traitement…';
  const r=await sb.functions.invoke('infotelcom-user-admin',{body:payload});
  if(r.error) throw new Error(r.error.message||'Service de gestion des utilisateurs indisponible.');
  if(r.data&&r.data.error) throw new Error(r.data.error);
  return r.data||{};
}
function fillCreateUserCompanies(){
  const el=$('#createUserCompany'); if(!el)return;
  el.innerHTML='<option value="">Sélectionner</option>'+(data.companies||[]).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
  const selected=$('#companySelect')?.value;
  if(selected) el.value=selected;
}
function render(){const c=data.companies||[],u=data.users||[],r=data.requests||[],a=data.audit||[],inv=data.invitations||[];$('#sCompanies').textContent=c.length;$('#sUsers').textContent=u.length;$('#sPending').textContent=r.filter(x=>x.status==='pending').length;$('#sAudit').textContent=a.length;$('#companySelect').innerHTML='<option value="">Sélectionner une entreprise</option>'+c.map(x=>'<option value="'+x.id+'">'+esc(x.name)+' · '+x.users_count+' utilisateur(s)</option>').join('');$('#requests').innerHTML=r.length?r.map(x=>'<div class="item"><div><b>'+esc(x.requested_right)+'</b><small>'+esc(x.requester_name||'Utilisateur')+' · '+esc(x.company_name||'')+'</small><small>'+esc(x.reason||'Aucun motif')+'</small></div><div><span class="chip">'+esc(x.status)+'</span> '+(x.status==='pending'?'<span class="actions"><button class="approve" data-ok="'+x.id+'">Accorder</button><button class="deny" data-no="'+x.id+'">Refuser</button></span>':'')+'</div></div>').join(''):'<div class="empty">Aucune demande.</div>';$('#users').innerHTML=u.length?u.map(x=>{const self=x.id===data.profile?.id;return '<div class="user-row"><div><b>'+esc(x.full_name||'Utilisateur')+'</b><small class="muted">'+esc(x.company_name||'')+'</small></div><div class="muted">'+esc(x.id)+(self?' · <span class="chip">Compte administrateur actuel</span>':'')+'</div><select data-role="'+x.id+'" '+(self?'disabled title="Votre propre rôle INFOTELCOM ne peut pas être modifié ici."':'')+'><option '+(x.role==='owner'?'selected':'')+'>owner</option><option '+(x.role==='manager'?'selected':'')+'>manager</option><option '+(x.role==='commercial'?'selected':'')+'>commercial</option><option '+(x.role==='technicien'?'selected':'')+'>technicien</option><option '+(x.role==='lecture_seule'?'selected':'')+'>lecture_seule</option><option '+(x.role==='infotelcom_admin'?'selected':'')+'>infotelcom_admin</option></select></div>'}).join(''):'<div class="empty">Aucun utilisateur.</div>';$('#audit').innerHTML=a.length?a.map(x=>'<div class="item"><div><b>'+esc(x.action)+'</b><small>'+esc(x.admin_name||'Admin')+' · '+new Date(x.created_at).toLocaleString('fr-FR')+'</small></div><span class="chip">'+esc(x.target_type||'')+'</span></div>').join(''):'<div class="empty">Aucun événement.</div>';const pi=$('#pendingInvites');if(pi)pi.innerHTML=inv.length?inv.map(x=>'<div class="item"><div><b>'+esc(x.full_name||'Utilisateur')+'</b><small>'+esc(x.email)+' · '+esc(x.role||'member')+'</small></div><div><span class="chip">En attente</span> <button type="button" class="btn btn-ghost" data-regenerate-invite="'+esc(x.email)+'" data-regenerate-company="'+esc(x.company_id||'')+'">Générer le lien</button></div></div>').join(''):'<div class="empty">Aucun accès en attente.</div>'}
document.addEventListener('click',async e=>{const ok=e.target.closest('[data-ok]'),no=e.target.closest('[data-no]');if(ok||no){const id=(ok||no).dataset.ok||(ok||no).dataset.no;const decision=ok?'approved':'denied';const note=prompt(decision==='approved'?'Note facultative pour cette attribution :':'Motif du refus :')||'';const r=await sb.rpc('infotelcom_review_permission',{p_request_id:id,p_decision:decision,p_note:note});if(r.error){alert(r.error.message);return}await boot()}});
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-regenerate-invite]'); if(!b)return;
  b.disabled=true;b.textContent='Génération…';
  try{
    const out=await adminUserAction({action:'set_password',email:b.dataset.regenerateInvite,company_id:b.dataset.regenerateCompany});
    if(out.temporary_password){navigator.clipboard?.writeText(out.temporary_password).catch(()=>{}); alert('Mot de passe initial pour '+(out.full_name||b.dataset.regenerateInvite)+' :\n\n'+out.temporary_password+'\n\nLe mot de passe a aussi été copié si le navigateur l’autorise.');}
  }catch(err){alert(err.message||'Impossible de générer le lien.');}
  finally{b.disabled=false;b.textContent='Générer le lien';}
});
document.addEventListener('click',function(e){
  const b=e.target.closest('[data-copy-password]');
  if(!b)return;
  const pwd=b.getAttribute('data-copy-password')||'';
  navigator.clipboard?.writeText(pwd).then(function(){b.textContent='Copié ✓';setTimeout(function(){b.textContent='Copier';},1500);}).catch(function(){alert('Mot de passe : '+pwd);});
});
document.addEventListener('change',async e=>{const id=e.target.dataset.role;if(!id)return;const r=await sb.rpc('infotelcom_set_user_role',{p_user_id:id,p_role:e.target.value});if(r.error)alert(r.error.message);else await boot()});
$('#createUserForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  try{
    const out=await adminUserAction({
      action:'create_user',
      company_id:$('#createUserCompany').value,
      full_name:$('#createUserName').value.trim(),
      email:$('#createUserEmail').value.trim(),
      role:$('#createUserRole').value,
      redirect_to:location.origin+location.pathname.replace(/admin\.html$/,'index.html')
    });
    $('#createUserMsg').textContent=out.message||'Compte créé.';
    if(out.temporary_password){
      var box=$('#demoCredentials');
      if(box){box.hidden=false;box.innerHTML='<b>Accès créé</b><small>Transmettez ce mot de passe initial à l’utilisateur. Il pourra ensuite le remplacer dans Sécurité.</small><div class="credential-grid"><div><b>'+esc(out.full_name)+'</b><span>'+esc(out.email)+' · '+esc(out.role||'membre')+'</span><code style="display:block;margin-top:8px;font-size:16px;letter-spacing:.04em;">'+esc(out.temporary_password)+'</code><button type="button" class="btn btn-ghost" data-copy-password="'+escapeAttribute(out.temporary_password)+'" style="margin-top:8px">Copier le mot de passe</button></div></div>';} }
    e.target.reset();
    fillCreateUserCompanies();
    await boot();
  }catch(err){ if($('#createUserMsg')) $('#createUserMsg').textContent=err.message||'Invitation impossible.'; }
});
$('#seedDemoUsers')?.addEventListener('click',async()=>{
  const companyId=$('#createUserCompany').value||$('#companySelect').value;
  if(!companyId){alert('Sélectionnez d’abord une entreprise.');return;}
  const btn=$('#seedDemoUsers'); btn.disabled=true; btn.textContent='Création…';
  try{
    const out=await adminUserAction({action:'seed_demo',company_id:companyId,redirect_to:location.origin+location.pathname.replace('admin.html','index.html')});
    const box=$('#demoCredentials');
    if(box){
      box.hidden=false;
      box.innerHTML='<b>10 comptes de démonstration</b><small>Les comptes sont maintenant actifs dans Supabase Auth. Chaque personne reçoit un mot de passe initial à transmettre de façon sécurisée, puis peut le remplacer dans Sécurité.</small><div class="credential-grid">'+(out.users||[]).map(x=>'<div><b>'+esc(x.full_name)+'</b><span>'+esc(x.email)+' · '+esc(x.role||'membre')+'</span>'+(x.temporary_password?'<code style="display:block;margin-top:8px;font-size:15px;letter-spacing:.04em">'+esc(x.temporary_password)+'</code><button type="button" class="btn btn-ghost" data-copy-password="'+escapeAttribute(x.temporary_password)+'" style="margin-top:8px">Copier</button>':'<code>Non créé</code>')+(x.error?'<small style="color:#ff8d8d">'+esc(x.error)+'</small>':'')+'</div>').join('')+'</div>';
    }
    await boot();
  }catch(err){alert(err.message||'Création impossible.');}
  finally{btn.disabled=false;btn.textContent='Créer / réinitialiser 10 utilisateurs de test';}
});
function renderCompanyStats(s){const box=$('#companyStats'),act=$('#companyActivity');if(!box||!act)return;if(!s){box.innerHTML='<div class="empty">Sélectionnez une entreprise.</div>';act.innerHTML='';return}box.innerHTML='<div><b>'+Number(s.clients_total||0)+'</b><span>CLIENTS</span></div><div><b>'+Number(s.tickets_total||0)+'</b><span>TICKETS</span></div><div><b>'+Number(s.missions_total||0)+'</b><span>MISSIONS</span></div><div><b>'+Number(s.activity_total||0)+'</b><span>ACTIONS</span></div>';const rows=s.recent_activity||[];act.innerHTML=rows.length?rows.map(x=>'<div class="item"><div><b>'+esc(x.action||'Action')+' · '+esc(x.entity_type||'donnée')+'</b><small>'+new Date(x.created_at).toLocaleString('fr-FR')+'</small></div><span class="chip">lecture seule</span></div>').join(''):'<div class="empty">Aucune activité enregistrée.</div>'}
$('#companySelect').onchange=async()=>{fillCreateUserCompanies(); const id=$('#companySelect').value;if(!id){$('#companyInfo').textContent='';renderCompanyStats(null);return}const c=data.companies.find(x=>x.id===id);$('#companyInfo').innerHTML='<b>'+esc(c?.name||'')+'</b><div class="muted">'+(c?.users_count||0)+' utilisateur(s)</div>';const r=await sb.rpc('infotelcom_company_statistics',{p_company_id:id});if(r.error){renderCompanyStats(null);alert(r.error.message);return}renderCompanyStats(r.data||null)};
function csvValue(v){if(v===null||v===undefined)return '';if(typeof v==='object')v=JSON.stringify(v);return '"'+String(v).replace(/"/g,'""')+'"'}
function downloadCsv(name,rows){if(!rows||!rows.length)rows=[{}];const keys=Array.from(new Set(rows.flatMap(x=>Object.keys(x))));const csv=[keys.map(csvValue).join(','),...rows.map(x=>keys.map(k=>csvValue(x[k])).join(','))].join('\r\n');const blob=new Blob(['\\ufeff'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
$('#exportSelected').onclick=async()=>{const id=$('#companySelect').value;if(!id){alert('Sélectionnez une entreprise.');return}const r=await sb.rpc('infotelcom_export_company',{p_company_id:id});if(r.error){alert(r.error.message);return}const d=r.data||{};const base='faxtrix-'+id;const files=['company','profiles','clients','tickets','terrain_missions','team_members','automation_rules','chat_conversations','chat_members','chat_messages'];files.forEach(k=>downloadCsv(base+'-'+k,d[k]||[]));};
sb.auth.getSession().then(async x=>{if(x.data.session){const ok=await boot();if(ok)loadPlatformStats();}});

})();