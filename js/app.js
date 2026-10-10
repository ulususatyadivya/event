import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, query, where,
  orderBy, serverTimestamp, runTransaction, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
const state = { mode: "login", user: null, profile: null, events: [], students: [], registrations: [], isAdmin: false };
const palettes = [
  ["#33275c","#9264be","bi-stars"],["#1d4d54","#58a6a6","bi-lightbulb"],["#65334d","#d37aa1","bi-music-note-beamed"],
  ["#604122","#d6a35b","bi-trophy"],["#29476d","#6a9ad0","bi-code-slash"],["#4e385e","#b18ad1","bi-palette"]
];
const safe = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const prettyDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}) : "Date to be announced";
const dateTime = event => `${prettyDate(event.date)}${event.time ? " · " + safe(event.time) : ""}`;
function toast(message, error=false) { const el=document.createElement("div"); el.className="toast-message"+(error?" error":""); el.textContent=message; $("toastHost").append(el); setTimeout(()=>el.remove(),4200); }
function showError(id,message){const el=$(id);el.textContent=message;el.classList.remove("d-none");}
function clearError(id){$(id).textContent="";$(id).classList.add("d-none");}
function friendlyError(error){
  const code=error?.code||"";
  const map={
    "auth/email-already-in-use":"That email already has an account. Try logging in.",
    "auth/invalid-email":"Enter a valid email address.",
    "auth/weak-password":"Use a password with at least 6 characters.",
    "auth/invalid-credential":"Email or password is incorrect.",
    "auth/user-not-found":"No account found. Check your email or sign up.",
    "auth/wrong-password":"Email or password is incorrect.",
    "auth/too-many-requests":"Too many attempts. Please wait and try again.",
    "permission-denied":"Firebase denied this action. Check Firestore rules in README.md.",
    "unavailable":"Firebase is temporarily unavailable. Check your connection."
  };
  return map[code] || error?.message || "Something went wrong. Please try again.";
}
function setBusy(button,busy,label){button.disabled=busy;if(busy){button.dataset.old=button.innerHTML;button.textContent=label||"Please wait…";}else if(button.dataset.old){button.innerHTML=button.dataset.old;delete button.dataset.old;}}
function switchMode(mode){
  state.mode=mode;const signup=mode==="signup";
  $("signupFields").classList.toggle("d-none",!signup);
  $("loginTab").classList.toggle("active",!signup);$("signupTab").classList.toggle("active",signup);
  $("authTitle").textContent=signup?"Find your people.":"Welcome back.";
  $("authSubtitle").textContent=signup?"Create your student account to join in.":"Sign in to see what’s happening.";
  $("authSubmit").innerHTML=signup?'Create student account <i class="bi bi-arrow-up-right"></i>':'Log in <i class="bi bi-arrow-up-right"></i>';
  $("password").autocomplete=signup?"new-password":"current-password";
  ["studentName","rollNumber","department"].forEach(id=>$(id).required=signup);
  clearError("authError");
}
$("loginTab").addEventListener("click",()=>switchMode("login"));
$("signupTab").addEventListener("click",()=>switchMode("signup"));
$("togglePassword").addEventListener("click",()=>{const input=$("password");input.type=input.type==="password"?"text":"password";$("togglePassword").innerHTML=input.type==="password"?'<i class="bi bi-eye"></i>':'<i class="bi bi-eye-slash"></i>';});
$("authForm").addEventListener("submit",async e=>{
  e.preventDefault();clearError("authError");
  const email=$("email").value.trim().toLowerCase(), password=$("password").value;
  const button=$("authSubmit");setBusy(button,true,state.mode==="signup"?"Creating account…":"Signing in…");
  try{
    if(!email||!password)throw new Error("Enter your email and password.");
    if(state.mode==="signup"){
      const name=$("studentName").value.trim(), roll=$("rollNumber").value.trim().toUpperCase(), department=$("department").value.trim().toUpperCase();
      if(name.length<2)throw new Error("Enter your full name.");
      if(!/^[A-Z0-9][A-Z0-9-]{2,19}$/.test(roll))throw new Error("Roll number must be 3–20 letters, numbers or hyphens.");
      if(!department)throw new Error("Enter your department.");
      if(password.length<6)throw new Error("Password must be at least 6 characters.");
      // Reserve email + roll number transactionally before creating the Auth account.
      // The email key is a normalized email hash-like key, not a second Auth account.
      const emailKey=encodeURIComponent(email).replace(/\./g,"%2E");
      const rollKey=roll.replace(/\//g,"_");
      const emailRef=doc(db,"uniqueEmails",emailKey), rollRef=doc(db,"uniqueRollNumbers",rollKey);
      await runTransaction(db,async tx=>{
        const [em,ro]=await Promise.all([tx.get(emailRef),tx.get(rollRef)]);
        if(em.exists())throw new Error("This email is already registered. Please log in.");
        if(ro.exists())throw new Error("This roll number is already registered. Check it or contact your administrator.");
        tx.set(emailRef,{email,createdAt:serverTimestamp()});
        tx.set(rollRef,{rollNumber:roll,createdAt:serverTimestamp()});
      });
      let credential;
      try{credential=await createUserWithEmailAndPassword(auth,email,password);await updateProfile(credential.user,{displayName:name});
        await setDoc(doc(db,"users",credential.user.uid),{uid:credential.user.uid,name,rollNumber:roll,department,email,role:"student",createdAt:serverTimestamp()});
      }catch(err){
        // Best-effort rollback of reserved unique fields if account creation fails.
        await Promise.allSettled([deleteDoc(emailRef),deleteDoc(rollRef)]);
        throw err;
      }
      toast("Welcome to Gatherly! Your account is ready.");
    }else{
      await signInWithEmailAndPassword(auth,email,password);
    }
  }catch(error){showError("authError",friendlyError(error));}
  finally{setBusy(button,false);}
});

$("logoutBtn").addEventListener("click",()=>signOut(auth).catch(e=>toast(friendlyError(e),true)));
$("eventSearch").addEventListener("input",renderEvents);
$("eventForm").addEventListener("submit",async e=>{
  e.preventDefault();clearError("eventError");
  if(!state.isAdmin){showError("eventError","Only administrators can create events.");return;}
  const event={title:$("eventName").value.trim(),description:$("eventDescription").value.trim(),date:$("eventDate").value,time:$("eventTime").value,venue:$("eventVenue").value.trim(),category:$("eventCategory").value,capacity:Number($("eventCapacity").value),createdBy:state.user.uid,createdAt:serverTimestamp(),registrationCount:0};
  if(!event.title||!event.description||!event.date||!event.time||!event.venue||!Number.isInteger(event.capacity)||event.capacity<1){showError("eventError","Please complete every field with valid values.");return;}
  if(event.date<new Date().toISOString().slice(0,10)){showError("eventError","Choose today or a future date.");return;}
  const button=$("eventSubmit");setBusy(button,true,"Publishing…");
  try{await addDoc(collection(db,"events"),event);bootstrap.Modal.getOrCreateInstance($("eventModal")).hide();$("eventForm").reset();$("eventCapacity").value=100;toast("Your event is live.");await loadDashboardData();}
  catch(err){showError("eventError",friendlyError(err));}
  finally{setBusy(button,false);}
});

onAuthStateChanged(auth,async user=>{
  state.user=user;
  $("connectionStatus").classList.remove("online","offline");
  if(!user){state.profile=null;state.isAdmin=false;showAuth();return;}
  try{
    const snap=await getDoc(doc(db,"users",user.uid));
    if(!snap.exists()){
      // Admin accounts are created manually in Firebase Authentication and assigned via Firestore.
      state.profile={uid:user.uid,name:user.displayName||user.email.split("@")[0],email:user.email,role:"student",rollNumber:"—",department:"—"};
      // No implicit admin privilege: only the Firestore role field can grant it.
      toast("Your profile is not set up. Ask your administrator to verify your account.",true);
      await signOut(auth);return;
    }
    state.profile={uid:user.uid,...snap.data()};state.isAdmin=state.profile.role==="admin";
    showDashboard();await loadDashboardData();
  }catch(err){toast(friendlyError(err),true);}
});
function showAuth(){$("authView").classList.remove("d-none");$("dashboardView").classList.add("d-none");$("logoutBtn").classList.add("d-none");}
function showDashboard(){
  $("authView").classList.add("d-none");$("dashboardView").classList.remove("d-none");$("logoutBtn").classList.remove("d-none");
  $("todayLabel").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"});
  $("dashboardTitle").textContent=state.isAdmin?"Your campus, at a glance.":`Hey, ${state.profile.name.split(" ")[0]}.`;
  $("dashboardSubtitle").textContent=state.isAdmin?"A clearer view of your campus community.":"Good things happen when you show up.";
  $("dashEyebrow").textContent=state.isAdmin?"ADMIN WORKSPACE":"YOUR SPACE";
  $("adminAnalytics").classList.toggle("d-none",!state.isAdmin);$("adminTools").classList.toggle("d-none",!state.isAdmin);
  $("studentRegistrations").classList.toggle("d-none",state.isAdmin);
  $("eventsEyebrow").textContent=state.isAdmin?"EVENT INVENTORY":"THE LINEUP";
  $("eventsTitle").textContent=state.isAdmin?"All campus events.":"Find your next thing.";
}
async function loadDashboardData(){
  try{
    const eventSnap=await getDocs(query(collection(db,"events"),orderBy("date","asc")));
    state.events=eventSnap.docs.map(d=>({id:d.id,...d.data()}));
    if(state.isAdmin){
      const [studentSnap,regSnap]=await Promise.all([getDocs(query(collection(db,"users"),where("role","==","student"))),getDocs(collection(db,"registrations"))]);
      state.students=studentSnap.docs.map(d=>({id:d.id,...d.data()}));state.registrations=regSnap.docs.map(d=>({id:d.id,...d.data()}));
      renderAnalytics();renderStudents();renderActivity();
    }else{
      const mine=await getDocs(query(collection(db,"registrations"),where("studentId","==",state.user.uid)));
      state.registrations=mine.docs.map(d=>({id:d.id,...d.data()}));renderMyRegistrations();
    }
    renderEvents();
    $("connectionStatus").innerHTML="<span></span> Connected";$("connectionStatus").classList.add("online");
  }catch(err){$("connectionStatus").innerHTML="<span></span> Setup needed";$("connectionStatus").classList.add("offline");toast(friendlyError(err),true);}
}
function renderAnalytics(){
  const upcoming=state.events.filter(e=>e.date>=new Date().toISOString().slice(0,10)).length;
  $("metricStudents").textContent=state.students.length;$("metricEvents").textContent=state.events.length;$("metricRegistrations").textContent=state.registrations.length;$("metricUpcoming").textContent=upcoming;
}
function renderStudents(){
  const tbody=$("studentsTable");
  if(!state.students.length){tbody.innerHTML='<tr><td colspan="4" class="empty-state">No student accounts yet.</td></tr>';return;}
  tbody.innerHTML=state.students.sort((a,b)=>(a.name||"").localeCompare(b.name||"")).map(s=>`<tr><td><span class="student-name">${safe(s.name||"Student")}</span><br><span class="student-email">${safe(s.email||"")}</span></td><td><span class="roll-pill">${safe(s.rollNumber||"—")}</span></td><td>${safe(s.department||"—")}</td><td>${safe(s.email||"—")}</td></tr>`).join("");
}
function renderActivity(){
  const host=$("recentRegistrations");
  const recent=[...state.registrations].sort((a,b)=>timestamp(b.createdAt)-timestamp(a.createdAt)).slice(0,8);
  if(!recent.length){host.innerHTML='<div class="empty-state">No registrations yet. Activity will appear here.</div>';return;}
  host.innerHTML=recent.map(r=>{const student=state.students.find(s=>s.uid===r.studentId)||{};const event=state.events.find(ev=>ev.id===r.eventId)||{};const name=student.name||r.studentName||"A student";return `<div class="activity-item"><div class="activity-avatar">${safe(name.slice(0,1).toUpperCase())}</div><div class="activity-main"><b>${safe(name)}</b><span>Registered for ${safe(event.title||r.eventTitle||"an event")}</span></div><span class="activity-date">${relativeTime(r.createdAt)}</span></div>`}).join("");
}
function timestamp(v){return v?.toMillis?v.toMillis():v?.seconds?v.seconds*1000:0}
function relativeTime(v){const t=timestamp(v);if(!t)return "Just now";const mins=Math.max(0,Math.floor((Date.now()-t)/60000));return mins<60?`${mins}m ago`:mins<1440?`${Math.floor(mins/60)}h ago`:`${Math.floor(mins/1440)}d ago`;}
function renderEvents(){
  const host=$("eventsGrid"), search=($("eventSearch").value||"").trim().toLowerCase();
  const filtered=state.events.filter(e=>[e.title,e.description,e.category,e.venue].some(x=>String(x||"").toLowerCase().includes(search)));
  if(!filtered.length){host.innerHTML=`<div class="col-12"><div class="empty-state panel-card">${search?"No events match your search.":"No events published yet. Check back soon."}</div></div>`;return;}
  host.innerHTML=filtered.map((e,i)=>{
    const palette=palettes[i%palettes.length],count=state.registrations.filter(r=>r.eventId===e.id).length,capacity=Number(e.capacity)||0,full=capacity>0&&count>=capacity;
    const registered=state.registrations.some(r=>r.eventId===e.id&&r.studentId===state.user?.uid);
    const isPast=e.date<new Date().toISOString().slice(0,10);
    return `<div class="col-md-6 col-xl-4"><article class="event-card"><div class="event-art" style="background:linear-gradient(130deg,${palette[0]},${palette[1]})"><span class="category-tag">${safe(e.category||"Campus event")}</span><i class="art-symbol bi ${palette[2]}"></i></div><div class="event-body"><h3>${safe(e.title)}</h3><p class="event-description">${safe(e.description)}</p><div class="event-meta"><i class="bi bi-calendar3"></i><span>${dateTime(e)}</span></div><div class="event-meta"><i class="bi bi-geo-alt"></i><span>${safe(e.venue||"Venue to be announced")}</span></div><div class="event-bottom"><span class="spots">${capacity?`<strong>${Math.max(0,capacity-count)}</strong> spots left`:`${count} registered`}</span>${state.isAdmin?`<span class="${isPast?"tag-full":"tag-open"}">${isPast?"Past event":"Admin view"}</span>`:registered?'<button class="btn btn-outline-light" disabled><i class="bi bi-check2"></i> Registered</button>':isPast?'<span class="tag-full">Ended</span>':full?'<span class="tag-full">Full</span>':`<button class="btn btn-primary main-cta register-btn" data-event="${safe(e.id)}">Register <i class="bi bi-arrow-up-right"></i></button>`}</div></div></article></div>`;
  }).join("");
  host.querySelectorAll(".register-btn").forEach(btn=>btn.addEventListener("click",()=>registerForEvent(btn.dataset.event,btn)));
}
async function registerForEvent(eventId,button){
  if(!state.user||state.isAdmin)return;const event=state.events.find(e=>e.id===eventId);if(!event)return;
  setBusy(button,true,"Registering…");
  try{
    const regId=`${state.user.uid}_${eventId}`,regRef=doc(db,"registrations",regId),eventRef=doc(db,"events",eventId);
    await runTransaction(db,async tx=>{
      const [regSnap,eventSnap]=await Promise.all([tx.get(regRef),tx.get(eventRef)]);
      if(regSnap.exists())throw new Error("You are already registered for this event.");
      if(!eventSnap.exists())throw new Error("This event is no longer available.");
      const data=eventSnap.data(),count=Number(data.registrationCount)||0,capacity=Number(data.capacity)||0;
      if(data.date<new Date().toISOString().slice(0,10))throw new Error("Registration for this event has ended.");
      if(capacity&&count>=capacity)throw new Error("Sorry, this event is full.");
      tx.set(regRef,{studentId:state.user.uid,eventId,studentName:state.profile.name,eventTitle:data.title,rollNumber:state.profile.rollNumber,createdAt:serverTimestamp()});
      tx.update(eventRef,{registrationCount:count+1});
    });
    toast("You're on the list. See you there!");await loadDashboardData();
  }catch(err){toast(friendlyError(err),true);setBusy(button,false);}
}
function renderMyRegistrations(){
  const host=$("myRegistrations"),mine=state.registrations;
  if(!mine.length){host.innerHTML='<div class="col-12"><div class="empty-state panel-card">No registrations yet. Find an event above and save your spot.</div></div>';return;}
  host.innerHTML=mine.map(r=>{const e=state.events.find(ev=>ev.id===r.eventId);if(!e)return "";return `<div class="col-md-6 col-xl-4"><div class="my-event"><div class="my-event-icon"><i class="bi bi-ticket-perforated"></i></div><div><h3>${safe(e.title)}</h3><p>${dateTime(e)} · ${safe(e.venue||"Venue TBA")}</p></div><span class="tag-open ms-auto">Going</span></div></div>`}).join("")||'<div class="col-12"><div class="empty-state panel-card">Your registered events will appear here.</div></div>';
}

// Connection status is useful even if Firestore rules have not yet been configured.
$("eventDate").min=new Date().toISOString().slice(0,10);
switchMode("login");
setTimeout(()=>{if(!$("connectionStatus").classList.contains("online")){$("connectionStatus").innerHTML="<span></span> Check setup";}},9000);