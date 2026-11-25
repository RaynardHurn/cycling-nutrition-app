(() => {
  'use strict';
  const KEYS=['raynardCyclingSettingsV5AutoWatts','raynardTrainingCalendarV1','raynardMealCompletedRidesV1'];
  const OLD=['raynardCyclingSettingsV4Pct','raynardCyclingSettingsV3','raynardCyclingSettingsV2'];
  const $=id=>document.getElementById(id);
  const conf=window.CYCLING_CLOUD_CONFIG||{};
  const cover=document.createElement('section');
  cover.id='cloud-auth-cover';
  cover.innerHTML=`<div id="cloud-auth-card"><h2>CYCLING NUTRITION</h2><p>Sign in to securely sync your workouts, settings and completed rides across your devices.</p>
    <label for="cloud-email">Email</label><input autocomplete="email" type="email" id="cloud-email" placeholder="you@example.com">
    <label for="cloud-password">Password</label><input autocomplete="current-password" type="password" id="cloud-password" placeholder="At least 8 characters">
    <button id="cloud-signin">Sign in</button><button class="secondary" id="cloud-signup">Create account</button>
    <button class="link" id="cloud-reset">Forgot password?</button><div id="cloud-auth-status" role="status" aria-live="polite"></div>
  </div>`;
  document.body.prepend(cover);
  const status=msg=>{$('cloud-auth-status').textContent=msg};
  const ready=!!(conf.url && conf.publishableKey && !conf.url.includes('PASTE_') && !conf.publishableKey.includes('PASTE_'));
  if(!ready){status('Cloud login is not configured yet. Open cloud-config.js and add your Supabase Project URL and publishable key. See SETUP.txt. Your current GitHub Pages app is unaffected until you publish this version.');return}
  if(!window.supabase?.createClient){status('Cannot load the authentication library. Check your internet connection.');return}
  const client=window.supabase.createClient(conf.url,conf.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  let user=null, active=false, saveTimer=null, writing=false;
  function snapshot(){const o={};KEYS.forEach(k=>{const v=localStorage.getItem(k);if(v!==null)o[k]=JSON.parse(v)});return o}
  function clearUserData(){[...KEYS,...OLD].forEach(k=>localStorage.removeItem(k))}
  function restore(data){clearUserData();KEYS.forEach(k=>{if(Object.hasOwn(data,k))localStorage.setItem(k,JSON.stringify(data[k]))})}
  const marker='cycling-cloud-loaded';
  async function loadForUser(u){
    status('Loading your saved data...');
    // Never expose a previous account's cached data before checking cloud state.
    const {data,error}=await client.from('user_app_state').select('payload').eq('user_id',u.id).maybeSingle();
    if(error)throw error;
    const wasLoaded=sessionStorage.getItem(marker)===u.id;
    if(!wasLoaded){
      if(data?.payload){restore(data.payload)}
      else {
        const owner=localStorage.getItem('cycling-cloud-owner');
        const found=KEYS.some(k=>localStorage.getItem(k)!==null);
        if(found && !owner && confirm('Import the existing workouts and settings saved on THIS browser into your new cloud account? Select Cancel for a new blank account.')) {
          const payload=snapshot();
          const result=await client.from('user_app_state').upsert({user_id:u.id,payload},{onConflict:'user_id'});
          if(result.error)throw result.error;
        } else clearUserData();
      }
      localStorage.setItem('cycling-cloud-owner',u.id);
      sessionStorage.setItem(marker,u.id);
      location.reload();
      return;
    }
    user=u;
    active=true;
    document.documentElement.classList.add('cloud-ready');
    const bar=document.createElement('div');
    bar.id='cloud-userbar';
    const label=document.createElement('span');label.textContent='Signed in: '+(u.email||'account');
    const logout=document.createElement('button');logout.textContent='Log out';
    logout.onclick=async()=>{active=false;window.appCloudSave=undefined;clearTimeout(saveTimer);await flush();await client.auth.signOut();clearUserData();localStorage.removeItem('cycling-cloud-owner');sessionStorage.removeItem(marker);location.reload()};
    bar.append(label,logout);
    const nav=document.querySelector('nav.main-nav');
    if(nav)nav.before(bar);else document.body.prepend(bar);
    status('');
    // Uploads are triggered only by app save actions; existing local data restored on login.
    window.appCloudSave=()=>{if(!active)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>flush().catch(console.error),800)};
  }
  async function flush(){
    if(!user||writing)return;
    writing=true;
    try{
      const {error}=await client.from('user_app_state').upsert({user_id:user.id,payload:snapshot()},{onConflict:'user_id'});
      if(error){console.error('Cloud save failed',error);alert('Cloud save failed. Your latest changes remain on this device; check your connection before switching phones.')}
    }finally{writing=false}
  }
  async function signIn(){
    const email=$('cloud-email').value.trim(),password=$('cloud-password').value;
    if(!email||!password){status('Enter your email and password.');return}
    status('Signing in...');
    const {error}=await client.auth.signInWithPassword({email,password});
    if(error){status(error.message);return}
    location.reload();
  }
  async function signUp(){
    const email=$('cloud-email').value.trim(),password=$('cloud-password').value;
    if(!email||password.length<8){status('Enter an email and a password with at least 8 characters.');return}
    status('Creating account...');
    const {error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});
    status(error?error.message:'Check your email to confirm your account, then return here to sign in.');
  }
  async function reset(){
    const email=$('cloud-email').value.trim();
    if(!email){status('Enter your email address first.');return}
    const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
    status(error?error.message:'If the address is registered, a reset email will be sent.');
  }
  $('cloud-signin').onclick=()=>signIn().catch(e=>status(e.message));
  $('cloud-signup').onclick=()=>signUp().catch(e=>status(e.message));
  $('cloud-reset').onclick=()=>reset().catch(e=>status(e.message));
  client.auth.onAuthStateChange((event)=>{
    if(event==='PASSWORD_RECOVERY'){
      const newPassword=prompt('Enter your new password (at least 8 characters):');
      if(!newPassword || newPassword.length<8){status('Password was not changed. Enter at least 8 characters.');return}
      client.auth.updateUser({password:newPassword}).then(({error})=>{
        status(error?'Password reset failed: '+error.message:'Password updated. You can now sign in.');
      }).catch(e=>status('Password reset failed: '+e.message));
    }
  });
  (async()=>{
    status('Checking your account...');
    const {data,error}=await client.auth.getUser();
    if(error && !data?.user){status('Sign in or create an account.');return}
    if(data?.user)await loadForUser(data.user);
    else status('Sign in or create an account.');
  })().catch(e=>status('Could not load cloud data: '+e.message));
})();
