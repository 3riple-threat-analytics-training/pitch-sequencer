// ── Firebase Helper Functions ──
// Auth helpers
async function fbSignUp(email,password){
  try{
    const cred=await window._fbFns.createUserWithEmailAndPassword(
      window._fbAuth,email,password);
    return {success:true,user:cred.user};
  }catch(e){
    return {success:false,error:e.message};
  }
}

async function fbSignIn(email,password){
  try{
    const cred=await window._fbFns.signInWithEmailAndPassword(
      window._fbAuth,email,password);
    return {success:true,user:cred.user};
  }catch(e){
    return {success:false,error:e.message};
  }
}

async function fbSignOut(){
  try{
    await window._fbFns.signOut(window._fbAuth);
    return {success:true};
  }catch(e){
    return {success:false,error:e.message};
  }
}

function fbCurrentUser(){
  return window._fbUser||null;
}

// Firestore helpers
async function fbSaveProfile(profile){
  const user=fbCurrentUser();
  if(!user) return {success:false,error:'Not signed in'};
  try{
    const ref=window._fbFns.doc(window._fbDb,'users',user.uid,'data','profile');
    await window._fbFns.setDoc(ref,profile);
    return {success:true};
  }catch(e){
    return {success:false,error:e.message};
  }
}

async function fbLoadProfile(){
  const user=fbCurrentUser();
  if(!user) return {success:false,error:'Not signed in'};
  try{
    const ref=window._fbFns.doc(window._fbDb,'users',user.uid,'data','profile');
    const snap=await window._fbFns.getDoc(ref);
    if(snap.exists()) return {success:true,data:snap.data()};
    return {success:false,error:'No profile found'};
  }catch(e){
    return {success:false,error:e.message};
  }
}

async function fbSavePlans(plans){
  const user=fbCurrentUser();
  if(!user) return {success:false,error:'Not signed in'};
  try{
    const ref=window._fbFns.doc(window._fbDb,'users',user.uid,'data','plans');
    await window._fbFns.setDoc(ref,{plans:JSON.stringify(plans)});
    return {success:true};
  }catch(e){
    return {success:false,error:e.message};
  }
}

async function fbLoadPlans(){
  const user=fbCurrentUser();
  if(!user) return {success:false,error:'Not signed in'};
  try{
    const ref=window._fbFns.doc(window._fbDb,'users',user.uid,'data','plans');
    const snap=await window._fbFns.getDoc(ref);
    if(snap.exists()){
      const data=snap.data();
      return {success:true,data:JSON.parse(data.plans||'[]')};
    }
    return {success:true,data:[]};
  }catch(e){
    return {success:false,error:e.message};
  }
}

async function fbSaveGameHistory(game){
  const user=fbCurrentUser();
  if(!user) return {success:false,error:'Not signed in'};
  try{
    const col=window._fbFns.collection(
      window._fbDb,'users',user.uid,'gameHistory');
    await window._fbFns.addDoc(col,{
      ...game,
      savedAt:Date.now()
    });
    return {success:true};
  }catch(e){
    return {success:false,error:e.message};
  }
}

async function fbLoadGameHistory(){
  const user=fbCurrentUser();
  if(!user) return {success:false,error:'Not signed in'};
  try{
    const col=window._fbFns.collection(
      window._fbDb,'users',user.uid,'gameHistory');
    const q=window._fbFns.query(col,window._fbFns.orderBy('savedAt','asc'));
    const snap=await window._fbFns.getDocs(q);
    const games=[];
    snap.forEach(function(d){games.push(d.data());});
    return {success:true,data:games};
  }catch(e){
    return {success:false,error:e.message};
  }
}

async function fbSaveRoster(roster){
  const user=fbCurrentUser();
  if(!user) return {success:false,error:'Not signed in'};
  try{
    const ref=window._fbFns.doc(window._fbDb,'users',user.uid,'data','roster');
    await window._fbFns.setDoc(ref,{roster:JSON.stringify(roster)});
    return {success:true};
  }catch(e){
    return {success:false,error:e.message};
  }
}

async function fbLoadRoster(){
  const user=fbCurrentUser();
  if(!user) return {success:false,error:'Not signed in'};
  try{
    const ref=window._fbFns.doc(window._fbDb,'users',user.uid,'data','roster');
    const snap=await window._fbFns.getDoc(ref);
    if(snap.exists()){
      const data=snap.data();
      return {success:true,data:JSON.parse(data.roster||'[]')};
    }
    return {success:true,data:[]};
  }catch(e){
    return {success:false,error:e.message};
  }
}

// Migrate localStorage data to Firestore
async function fbLoadGamesByAgeGroup(ageGroup){
  const user=fbCurrentUser();
  if(!user) return {success:false,error:'Not signed in'};
  try{
    const col=window._fbFns.collection(
      window._fbDb,'users',user.uid,'gameHistory');
    const q=window._fbFns.query(col,window._fbFns.orderBy('savedAt','asc'));
    const snap=await window._fbFns.getDocs(q);
    const games=[];
    snap.forEach(function(d){
      const game=d.data();
      if(!ageGroup||game.ageGroup===ageGroup) games.push(game);
    });
    return {success:true,data:games};
  }catch(e){
    return {success:false,error:e.message};
  }
}
async function fbMigrateFromLocalStorage(){
  const user=fbCurrentUser();
  if(!user) return {success:false,error:'Not signed in'};
  try{
    // Migrate profile
    const profile=typeof getProfile==='function'?getProfile():null;
    if(profile) await fbSaveProfile(profile);
    // Migrate plans
    const plans=typeof getSavedPlans==='function'?getSavedPlans():[];
    if(plans.length) await fbSavePlans(plans);
    // Migrate roster
    const roster=typeof getRoster==='function'?getRoster():[];
    if(roster.length) await fbSaveRoster(roster);
    // Migrate game history
    const raw=localStorage.getItem('pitchseq-game-history');
    const history=raw?JSON.parse(raw):[];
    for(let i=0;i<history.length;i++){
      await fbSaveGameHistory(history[i]);
    }
    return {success:true,migrated:{
      profile:!!profile,
      plans:plans.length,
      roster:roster.length,
      games:history.length
    }};
  }catch(e){
    return {success:false,error:e.message};
  }
}
