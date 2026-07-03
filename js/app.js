import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, setDoc, updateDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const COMPANY_ID = "green_garden_market";
const BRANCHES = ["Green Garden Market","Cahaya Maju","Nibong Tebal","Simpang Ampat","Alma","Sungai Bakap"];
function activeBranches(){
  const saved = data.branches.filter(b => b.status !== "Inactive").map(b => b.name).filter(Boolean);
  return saved.length ? saved : BRANCHES;
}

function currentProfile(){
  const email = (currentUser?.email || "").toLowerCase();
  const profile = data.userProfiles.find(u => (u.email || "").toLowerCase() === email && u.status !== "Inactive");
  if(profile) return profile;
  if(email === "thinagariy.pearanpan@gmail.com"){
    return {name:"Thinagariy", email, role:"Super Admin", branchAccess:"All Branches", status:"Active"};
  }
  return {name:email.split("@")[0] || "User", email, role:"Viewer", branchAccess:"__NO_ACCESS__", status:"Active"};
}
function userRole(){ return currentProfile().role || "Viewer"; }
function userBranchAccess(){ return currentProfile().branchAccess || "__NO_ACCESS__"; }
function hasAllBranchAccess(){
  const role = userRole();
  return ["Super Admin","Director","Finance"].includes(role) || userBranchAccess() === "All Branches";
}
function allowedBranches(){
  if(hasAllBranchAccess()) return activeBranches();
  const branch = userBranchAccess();
  return activeBranches().includes(branch) ? [branch] : [];
}
function canManageSystem(){ return ["Super Admin","Director"].includes(userRole()); }
function canEditRecords(){ return ["Super Admin","Director","Finance","Branch Admin"].includes(userRole()); }
function canViewAudit(){ return ["Super Admin","Director","Finance"].includes(userRole()); }
function enforceMenuPermissions(){
  const buttons = Array.from(document.querySelectorAll(".nav button"));
  buttons.forEach(btn => {
    const txt = btn.textContent || "";
    if(txt.includes("User Management") || txt.includes("Branch Management")){
      btn.style.display = canManageSystem() ? "" : "none";
    }
    if(txt.includes("Audit Logs")){
      btn.style.display = canViewAudit() ? "" : "none";
    }
  });
}
function updateUserRoleDisplay(){
  const profile = currentProfile();
  const roleEl = document.getElementById("userRoleDisplay");
  const branchEl = document.getElementById("userBranchDisplay");
  if(roleEl) roleEl.textContent = profile.role || "Viewer";
  if(branchEl) branchEl.textContent = "Access: " + (profile.branchAccess || "No branch");
}


let currentUser = null;
let data = { invoices: [], payments: [], auditLogs: [], userProfiles: [], branches: [] };
let viewMonth = new Date().getMonth();
let viewYear = new Date().getFullYear();
let unsub = [];

const colPath = (name) => collection(db, "companies", COMPANY_ID, name);
const docPath = (name, id) => doc(db, "companies", COMPANY_ID, name, id);

function setToday(){
  const today = new Date();
  document.getElementById("todayDate").textContent = today.toLocaleDateString("en-MY",{weekday:"short",year:"numeric",month:"short",day:"numeric"});
}
function populateBranchControls(){
  const branchList = allowedBranches();
  const selects = ["branch","globalBranchFilter","invoiceBranchFilter"];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    const current = el.value || (id === "branch" ? branchList[0] : "All");
    if(id === "branch"){
      el.innerHTML = branchList.map(b => `<option value="${b}">${b}</option>`).join("");
    } else {
      if(hasAllBranchAccess()){
        el.innerHTML = '<option value="All">All Branches</option>' + branchList.map(b => `<option value="${b}">${b}</option>`).join("");
      } else {
        el.innerHTML = branchList.map(b => `<option value="${b}">${b}</option>`).join("");
      }
    }
    if([...el.options].some(o => o.value === current)){
      el.value = current;
    } else {
      el.value = hasAllBranchAccess() && id !== "branch" ? "All" : (branchList[0] || "");
    }
    el.disabled = (!hasAllBranchAccess() && (id === "globalBranchFilter" || id === "invoiceBranchFilter" || id === "branch"));
  });

  const profileBranch = document.getElementById("profileBranch");
  if(profileBranch){
    const branchSource = activeBranches();
    const current = profileBranch.value || "All Branches";
    profileBranch.innerHTML = '<option>All Branches</option>' + branchSource.map(b => `<option>${b}</option>`).join("");
    profileBranch.value = [...profileBranch.options].some(o => o.value === current) ? current : "All Branches";
  }
}
setToday();
populateBranchControls();

onAuthStateChanged(auth, user => {
  if (user) {
    currentUser = user;
    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("appScreen").classList.remove("hidden");
    document.getElementById("userName").textContent = user.email.split("@")[0];
    document.getElementById("userEmail").textContent = user.email;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";
    document.getElementById("welcomeText").textContent = `${greeting}, ${user.email.split("@")[0]} 👋`;
    listenData();
    updateUserRoleDisplay();
    enforceMenuPermissions();
  } else {
    currentUser = null;
    unsub.forEach(u => u && u());
    unsub = [];
    document.getElementById("loginScreen").classList.remove("hidden");
    document.getElementById("appScreen").classList.add("hidden");
  }
});

window.login = async function(){
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  document.getElementById("loginError").textContent = "";
  try { await signInWithEmailAndPassword(auth, email, password); }
  catch(e){ document.getElementById("loginError").textContent = e.message; }
}
window.logout = async function(){ await signOut(auth); }
window.comingSoon = function(name){ alert(name + " module will be built after Supplier Payment is approved."); }

function listenData(){
  unsub.forEach(u => u && u());
  unsub = [];
  unsub.push(onSnapshot(query(colPath("invoices"), orderBy("dueDate","asc")), snap => {
    data.invoices = snap.docs.map(d => ({id:d.id, ...d.data()})).filter(x => !x.deleted);
    renderAll();
  }, err => alert("Firestore invoice access error: " + err.message)));
  unsub.push(onSnapshot(query(colPath("payments"), orderBy("date","desc")), snap => {
    data.payments = snap.docs.map(d => ({id:d.id, ...d.data()})).filter(x => !x.deleted);
    renderAll();
  }, err => alert("Firestore payment access error: " + err.message)));
  unsub.push(onSnapshot(query(colPath("auditLogs"), orderBy("createdAt","desc")), snap => {
    data.auditLogs = snap.docs.map(d => ({id:d.id, ...d.data()}));
    renderAll();
  }, err => console.log(err.message)));
  unsub.push(onSnapshot(query(colPath("userProfiles"), orderBy("name","asc")), snap => {
    data.userProfiles = snap.docs.map(d => ({id:d.id, ...d.data()}));
    renderAll();
  }, err => console.log(err.message)));
  unsub.push(onSnapshot(query(colPath("branches"), orderBy("name","asc")), snap => {
    data.branches = snap.docs.map(d => ({id:d.id, ...d.data()}));
    renderAll();
  }, err => console.log(err.message)));
}

async function audit(action, details){
  try {
    await addDoc(colPath("auditLogs"), {
      action, details,
      userEmail: currentUser?.email || "unknown",
      createdAt: serverTimestamp(),
      createdAtLocal: new Date().toISOString()
    });
  } catch(e) { console.log("Audit log failed", e.message); }
}

function money(n){return "RM"+Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2})}
function todayISO(){const d=new Date();const o=d.getTimezoneOffset()*60000;return new Date(d-o).toISOString().slice(0,10)}
function formatDate(d){if(!d)return "";return new Date(d+"T00:00:00").toLocaleDateString("en-MY",{day:"2-digit",month:"2-digit",year:"numeric"})}
function monthKey(d){return d ? d.slice(0,7) : ""}
function monthLabel(key){if(!key)return "";const [y,m]=key.split("-");return new Date(Number(y),Number(m)-1,1).toLocaleDateString("en-MY",{month:"long",year:"numeric"})}
function paidForInvoice(id){return data.payments.filter(p=>p.invoiceId===id).reduce((s,p)=>s+Number(p.amount||0),0)}
function outstanding(inv){return Math.max(Number(inv.amount||0)-paidForInvoice(inv.id),0)}
function status(inv){const bal=outstanding(inv), paid=paidForInvoice(inv.id); if(bal<=0) return "Paid"; if(paid>0) return "Partial"; return "Unpaid"}
function isOverdue(inv){return status(inv)!=="Paid" && inv.dueDate<todayISO()}
function statusLabel(inv){return isOverdue(inv) ? "Overdue" : status(inv)}
function statusClass(inv){const s=status(inv); if(isOverdue(inv)) return "status-overdue"; if(s==="Paid") return "status-paid"; if(s==="Partial") return "status-partial"; return "status-unpaid"}
function selectedBranch(){
  const selected = document.getElementById("globalBranchFilter")?.value || "All";
  if(!hasAllBranchAccess()){
    return allowedBranches()[0] || "__NO_ACCESS__";
  }
  return selected;
}
function branchMatches(record, branch){
  const permitted = allowedBranches();
  if(!permitted.length) return false;
  if(!hasAllBranchAccess()){
    return permitted.includes(record.branch || "Unassigned");
  }
  return branch === "All" || (record.branch || "Unassigned") === branch;
}
function filteredInvoicesByBranch(){
  const b = selectedBranch();
  return data.invoices.filter(i => branchMatches(i,b));
}
function filteredPaymentsByBranch(){
  const b = selectedBranch();
  return data.payments.filter(p => branchMatches(p,b));
}

window.showPage = function(id,btn){
 document.querySelectorAll(".page").forEach(t=>t.classList.remove("active"));
 document.querySelectorAll(".nav button").forEach(b=>b.classList.remove("active"));
 document.getElementById(id).classList.add("active");
 if(btn) btn.classList.add("active");
 renderAll();
}
window.showPageById = function(id){
 const ids=["dashboard","invoiceEntry","invoices","paymentHistory","calendarTab","summary","methodSummary","audit","users","branchAdmin"];
 const navButtons=document.querySelectorAll(".nav button");
 document.querySelectorAll(".page").forEach(t=>t.classList.remove("active"));
 navButtons.forEach(b=>b.classList.remove("active"));
 document.getElementById(id).classList.add("active");
 const idx=ids.indexOf(id); if(idx>=0) navButtons[idx].classList.add("active");
 renderAll();
}

window.saveInvoice = async function(){
 if(!canEditRecords()){ alert('You do not have permission to save invoices.'); return; }
 const id=document.getElementById("invoiceId").value;
 const inv={
   supplier:document.getElementById("supplier").value.trim(),
   invoiceNo:document.getElementById("invoiceNo").value.trim(),
   invoiceDate:document.getElementById("invoiceDate").value,
   dueDate:document.getElementById("dueDate").value,
   amount:Number(document.getElementById("amount").value||0),
   branch:document.getElementById("branch").value,
   category:document.getElementById("category").value,
   remarks:document.getElementById("remarks").value.trim(),
   updatedBy:currentUser.email,
   updatedAt:serverTimestamp()
 };
 if(!inv.supplier||!inv.invoiceNo||!inv.invoiceDate||!inv.dueDate||!inv.amount){alert("Please fill supplier, invoice no, invoice date, due date and amount.");return}
 try {
   if(id){
     await setDoc(docPath("invoices",id), inv, {merge:true});
     await audit("Edit Invoice", `${inv.branch} / ${inv.supplier} / ${inv.invoiceNo}`);
   } else {
     await addDoc(colPath("invoices"), {...inv, createdBy:currentUser.email, createdAt:serverTimestamp(), deleted:false});
     await audit("Create Invoice", `${inv.branch} / ${inv.supplier} / ${inv.invoiceNo}`);
   }
   resetInvoiceForm(); alert("Invoice saved.");
 } catch(e){ alert("Save failed: " + e.message); }
}
window.resetInvoiceForm=function(){document.getElementById("invoiceForm").reset();document.getElementById("invoiceId").value="";populateBranchControls();}
window.editInvoice=function(id){
 const inv=data.invoices.find(x=>x.id===id); if(!inv)return;
 document.getElementById("invoiceId").value=inv.id;
 document.getElementById("supplier").value=inv.supplier;
 document.getElementById("invoiceNo").value=inv.invoiceNo;
 document.getElementById("invoiceDate").value=inv.invoiceDate;
 document.getElementById("dueDate").value=inv.dueDate;
 document.getElementById("amount").value=inv.amount;
 document.getElementById("branch").value=inv.branch||BRANCHES[0];
 document.getElementById("category").value=inv.category||"General";
 document.getElementById("remarks").value=inv.remarks||"";
 showPageById("invoiceEntry");
}
window.deleteInvoice=async function(id){
 if(!canEditRecords()){ alert('You do not have permission to delete invoices.'); return; }
 if(!confirm("Delete this invoice and its payment history?"))return;
 const inv=data.invoices.find(x=>x.id===id);
 await updateDoc(docPath("invoices",id), {deleted:true, deletedBy:currentUser.email, deletedAt:serverTimestamp()});
 for (const p of data.payments.filter(x=>x.invoiceId===id)) {
   await updateDoc(docPath("payments",p.id), {deleted:true, deletedBy:currentUser.email, deletedAt:serverTimestamp()});
 }
 await audit("Delete Invoice", inv ? `${inv.branch||"-"} / ${inv.supplier} / ${inv.invoiceNo}` : id);
}

window.openPaymentModal=function(id){
 const inv=data.invoices.find(x=>x.id===id); if(!inv)return;
 document.getElementById("payInvoiceId").value=id;
 document.getElementById("payDate").value=todayISO();
 document.getElementById("payAmount").value=outstanding(inv).toFixed(2);
 document.getElementById("payRef").value="";
 document.getElementById("payRemarks").value="";
 document.getElementById("paymentInvoiceInfo").innerHTML=`<b>${inv.supplier}</b><br>Branch: ${inv.branch||"-"}<br>Invoice: ${inv.invoiceNo}<br>Invoice Amount: ${money(inv.amount)}<br>Paid: ${money(paidForInvoice(inv.id))}<br><b>Outstanding: ${money(outstanding(inv))}</b>`;
 document.getElementById("paymentModal").style.display="flex";
}
window.closePaymentModal=function(){document.getElementById("paymentModal").style.display="none"}
window.savePayment=async function(){
 if(!canEditRecords()){ alert('You do not have permission to record payments.'); return; }
 const invoiceId=document.getElementById("payInvoiceId").value;
 const inv=data.invoices.find(x=>x.id===invoiceId); if(!inv)return;
 const amount=Number(document.getElementById("payAmount").value||0);
 if(!document.getElementById("payDate").value||amount<=0){alert("Please key in payment date and valid amount.");return}
 if(amount>outstanding(inv)+0.001 && !confirm("Payment amount is more than outstanding. Continue?"))return;
 const pay={invoiceId,supplier:inv.supplier,invoiceNo:inv.invoiceNo,branch:inv.branch||"Unassigned",date:document.getElementById("payDate").value,amount,method:document.getElementById("payMethod").value,ref:document.getElementById("payRef").value.trim(),remarks:document.getElementById("payRemarks").value.trim(),createdBy:currentUser.email,createdAt:serverTimestamp(),deleted:false};
 try {
   await addDoc(colPath("payments"), pay);
   await audit("Record Payment", `${pay.branch} / ${inv.supplier} / ${inv.invoiceNo} / ${money(amount)} / ${pay.method}`);
   closePaymentModal(); alert("Payment recorded.");
 } catch(e){ alert("Payment save failed: " + e.message); }
}
window.deletePayment=async function(id){
 if(!canEditRecords()){ alert('You do not have permission to delete payments.'); return; }
 if(!confirm("Delete this payment record?"))return;
 const p=data.payments.find(x=>x.id===id);
 await updateDoc(docPath("payments",id), {deleted:true, deletedBy:currentUser.email, deletedAt:serverTimestamp()});
 await audit("Delete Payment", p ? `${p.branch||"-"} / ${p.supplier} / ${p.invoiceNo} / ${money(p.amount)}` : id);
}

window.saveUserProfile = async function(){
 if(!canManageSystem()){ alert('You do not have permission to manage users.'); return; }
  const id=document.getElementById("userProfileId").value;
  const profile={
    name:document.getElementById("profileName").value.trim(),
    email:document.getElementById("profileEmail").value.trim().toLowerCase(),
    role:document.getElementById("profileRole").value,
    branchAccess:document.getElementById("profileBranch").value,
    status:document.getElementById("profileStatus").value,
    updatedBy:currentUser.email,
    updatedAt:serverTimestamp()
  };
  if(!profile.name || !profile.email){ alert("Please enter name and email."); return; }
  try{
    if(id){
      await setDoc(docPath("userProfiles",id), profile, {merge:true});
      await audit("Edit User Profile", `${profile.name} / ${profile.email}`);
    } else {
      await addDoc(colPath("userProfiles"), {...profile, createdBy:currentUser.email, createdAt:serverTimestamp()});
      await audit("Create User Profile", `${profile.name} / ${profile.email}`);
    }
    resetUserForm(); alert("User profile saved.");
  }catch(e){ alert("User profile save failed: " + e.message); }
}
window.resetUserForm=function(){
  const form=document.getElementById("userForm"); if(form) form.reset();
  const id=document.getElementById("userProfileId"); if(id) id.value="";
}
window.editUserProfile=function(id){
  const p=data.userProfiles.find(x=>x.id===id); if(!p)return;
  document.getElementById("userProfileId").value=p.id;
  document.getElementById("profileName").value=p.name||"";
  document.getElementById("profileEmail").value=p.email||"";
  document.getElementById("profileRole").value=p.role||"Viewer";
  document.getElementById("profileBranch").value=p.branchAccess||"All Branches";
  document.getElementById("profileStatus").value=p.status||"Active";
  showPageById("users");
}

function renderDashboard(){
 const invoices = filteredInvoicesByBranch(), payments = filteredPaymentsByBranch();
 const totalOut=invoices.reduce((s,i)=>s+outstanding(i),0);
 const today=todayISO();
 const dueTodayList=invoices.filter(i=>i.dueDate===today&&status(i)!=="Paid");
 const dueToday=dueTodayList.reduce((s,i)=>s+outstanding(i),0);
 const overdueList=invoices.filter(isOverdue);
 const overdue=overdueList.reduce((s,i)=>s+outstanding(i),0);
 const thisMonth=today.slice(0,7);
 const paidMonth=payments.filter(p=>monthKey(p.date)===thisMonth).reduce((s,p)=>s+Number(p.amount||0),0);
 document.getElementById("mOutstanding").textContent=money(totalOut);
 document.getElementById("mDueToday").textContent=money(dueToday);
 document.getElementById("mDueTodayCount").textContent=`${dueTodayList.length} invoices`;
 document.getElementById("mOverdue").textContent=money(overdue);
 document.getElementById("mOverdueCount").textContent=`${overdueList.length} invoices`;
 document.getElementById("mPaidMonth").textContent=money(paidMonth);
 document.getElementById("dueToday").innerHTML=listMini(dueTodayList);
 const next=new Date(today+"T00:00:00");next.setDate(next.getDate()+7);const nextISO=next.toISOString().slice(0,10);
 document.getElementById("upcoming").innerHTML=listMini(invoices.filter(i=>i.dueDate>today&&i.dueDate<=nextISO&&status(i)!=="Paid").sort((a,b)=>a.dueDate.localeCompare(b.dueDate)),true);
}
function listMini(list,showDate=false){if(!list.length)return'<p class="muted">No payments found.</p>';return list.map(i=>`<div class="payment-chip ${isOverdue(i)?"overdue":status(i)==="Partial"?"partial":""}"><b>${showDate?formatDate(i.dueDate)+" — ":""}${i.supplier}</b><br>${i.branch||"-"} | ${i.invoiceNo} | Outstanding: <b>${money(outstanding(i))}</b></div>`).join("")}

function updateMonthFilter(){const select=document.getElementById("monthFilter");if(!select)return;const current=select.value||"All";const months=[...new Set(filteredInvoicesByBranch().map(i=>monthKey(i.dueDate)).filter(Boolean))].sort();select.innerHTML='<option value="All">All Due Months</option>'+months.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join("");select.value=months.includes(current)?current:"All"}
function getFilteredInvoices(){const q=(document.getElementById("invoiceSearch")?.value||"").toLowerCase(),f=document.getElementById("statusFilter")?.value||"All",mf=document.getElementById("monthFilter")?.value||"All";let rows=filteredInvoicesByBranch().filter(i=>(i.supplier||"").toLowerCase().includes(q)||(i.invoiceNo||"").toLowerCase().includes(q));const ibf=document.getElementById("invoiceBranchFilter")?.value||"All";if(ibf!=="All")rows=rows.filter(i=>(i.branch||"Unassigned")===ibf);if(f!=="All")rows=rows.filter(i=>f==="Overdue"?isOverdue(i):status(i)===f);if(mf!=="All")rows=rows.filter(i=>monthKey(i.dueDate)===mf);return rows.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.supplier.localeCompare(b.supplier))}
function actionButton(html){
  return canEditRecords() ? html : '<span class="muted">View only</span>';
}
function renderInvoices(){updateMonthFilter();const rows=getFilteredInvoices();let html='<table><thead><tr><th>Due Date</th><th>Supplier</th><th>Invoice No</th><th>Invoice Date</th><th>Branch</th><th>Category</th><th>Invoice Amount</th><th>Paid</th><th>Outstanding</th><th>Status</th><th>Action</th></tr></thead><tbody>';if(!rows.length)html+='<tr><td colspan="11" class="muted">No invoices found.</td></tr>';rows.forEach(i=>{html+=`<tr><td>${formatDate(i.dueDate)}</td><td>${i.supplier}</td><td>${i.invoiceNo}</td><td>${formatDate(i.invoiceDate)}</td><td>${i.branch||"-"}</td><td>${i.category||"-"}</td><td>${money(i.amount)}</td><td>${money(paidForInvoice(i.id))}</td><td><b>${money(outstanding(i))}</b></td><td class="${statusClass(i)}">${statusLabel(i)}</td><td>${actionButton(`<button onclick="openPaymentModal('${i.id}')">Record Payment</button> <button class="secondary" onclick="editInvoice('${i.id}')">Edit</button> <button class="danger" onclick="deleteInvoice('${i.id}')">Delete</button>`)}</td></tr>`});html+='</tbody></table>';document.getElementById("invoiceTable").innerHTML=html}
function renderPayments(){const q=(document.getElementById("paymentSearch")?.value||"").toLowerCase();let rows=filteredPaymentsByBranch().filter(p=>(p.supplier||"").toLowerCase().includes(q)||(p.invoiceNo||"").toLowerCase().includes(q)||(p.ref||"").toLowerCase().includes(q)).sort((a,b)=>(b.date||"").localeCompare(a.date||""));let html='<table><thead><tr><th>Payment Date</th><th>Supplier</th><th>Invoice No</th><th>Branch</th><th>Amount Paid</th><th>Method</th><th>Reference</th><th>Created By</th><th>Remarks</th><th>Action</th></tr></thead><tbody>';if(!rows.length)html+='<tr><td colspan="10" class="muted">No payments recorded yet.</td></tr>';rows.forEach(p=>html+=`<tr><td>${formatDate(p.date)}</td><td>${p.supplier}</td><td>${p.invoiceNo}</td><td>${p.branch||"-"}</td><td>${money(p.amount)}</td><td>${p.method}</td><td>${p.ref||"-"}</td><td>${p.createdBy||"-"}</td><td>${p.remarks||"-"}</td><td>${actionButton(`<button class="danger" onclick="deletePayment('${p.id}')">Delete</button>`)}</td></tr>`);html+='</tbody></table>';document.getElementById("paymentsTable").innerHTML=html}
window.changeMonth=function(delta){viewMonth+=delta;if(viewMonth<0){viewMonth=11;viewYear--}if(viewMonth>11){viewMonth=0;viewYear++}renderCalendar()}
function renderCalendar(){const cal=document.getElementById("calendar");document.getElementById("calendarTitle").textContent=new Date(viewYear,viewMonth,1).toLocaleDateString("en-MY",{month:"long",year:"numeric"});const names=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];cal.innerHTML=names.map(d=>`<div class="day-name">${d}</div>`).join("");const first=new Date(viewYear,viewMonth,1).getDay(),days=new Date(viewYear,viewMonth+1,0).getDate();for(let i=0;i<first;i++)cal.innerHTML+="<div></div>";for(let day=1;day<=days;day++){const iso=`${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;const invs=filteredInvoicesByBranch().filter(i=>i.dueDate===iso&&status(i)!=="Paid");const total=invs.reduce((s,i)=>s+outstanding(i),0);let chips=invs.map(i=>`<div class="payment-chip ${isOverdue(i)?"overdue":status(i)==="Partial"?"partial":""}"><b>${i.supplier}</b><br>${i.branch||"-"}<br>${i.invoiceNo}<br>${money(outstanding(i))}</div>`).join("");if(invs.length)chips=`<div class="muted"><b>Total: ${money(total)}</b></div>`+chips;cal.innerHTML+=`<div class="date-cell"><div class="date-num">${day}</div>${chips}</div>`}}
function renderSummary(){const map={};filteredInvoicesByBranch().forEach(i=>{if(!map[i.supplier])map[i.supplier]={supplier:i.supplier,invoice:0,paid:0,out:0,overdue:0,count:0};map[i.supplier].invoice+=Number(i.amount||0);map[i.supplier].paid+=paidForInvoice(i.id);map[i.supplier].out+=outstanding(i);if(isOverdue(i))map[i.supplier].overdue+=outstanding(i);map[i.supplier].count++});const rows=Object.values(map).sort((a,b)=>b.out-a.out);let html='<table><thead><tr><th>Supplier</th><th>No. of Invoices</th><th>Total Invoice</th><th>Total Paid</th><th>Total Outstanding</th><th>Overdue</th></tr></thead><tbody>';if(!rows.length)html+='<tr><td colspan="6" class="muted">No data yet.</td></tr>';rows.forEach(r=>html+=`<tr><td>${r.supplier}</td><td>${r.count}</td><td>${money(r.invoice)}</td><td>${money(r.paid)}</td><td><b>${money(r.out)}</b></td><td>${money(r.overdue)}</td></tr>`);html+='</tbody></table>';document.getElementById("summaryTable").innerHTML=html}
function renderMethodSummary(){const monthMap={};filteredPaymentsByBranch().forEach(p=>{const m=monthKey(p.date);if(!m)return;const method=p.method||"Other";if(!monthMap[m])monthMap[m]={month:m,total:0,Cash:0,"Bank Transfer":0,Cheque:0,DuitNow:0,Other:0};const amt=Number(p.amount||0);monthMap[m].total+=amt;if(method==="Cash")monthMap[m].Cash+=amt;else if(method==="Bank Transfer")monthMap[m]["Bank Transfer"]+=amt;else if(method==="Cheque")monthMap[m].Cheque+=amt;else if(method==="DuitNow")monthMap[m].DuitNow+=amt;else monthMap[m].Other+=amt});const rows=Object.values(monthMap).sort((a,b)=>b.month.localeCompare(a.month));let html='<table><thead><tr><th>Month</th><th>Cash</th><th>Bank Transfer / Online</th><th>Cheque</th><th>DuitNow</th><th>Other</th><th>Total Paid</th></tr></thead><tbody>';if(!rows.length)html+='<tr><td colspan="7" class="muted">No payment records yet.</td></tr>';rows.forEach(r=>html+=`<tr><td><b>${monthLabel(r.month)}</b></td><td>${money(r.Cash)}</td><td>${money(r["Bank Transfer"])}</td><td>${money(r.Cheque)}</td><td>${money(r.DuitNow)}</td><td>${money(r.Other)}</td><td><b>${money(r.total)}</b></td></tr>`);html+='</tbody></table>';document.getElementById("methodSummaryTable").innerHTML=html}
function renderAudit(){let rows=[...data.auditLogs].slice(0,100);let html='<table><thead><tr><th>Date/Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead><tbody>';if(!rows.length)html+='<tr><td colspan="4" class="muted">No audit logs yet.</td></tr>';rows.forEach(r=>html+=`<tr><td>${r.createdAtLocal?new Date(r.createdAtLocal).toLocaleString("en-MY"):"-"}</td><td>${r.userEmail||"-"}</td><td>${r.action||"-"}</td><td>${r.details||"-"}</td></tr>`);html+='</tbody></table>';document.getElementById("auditTable").innerHTML=html}
function renderUsers(){const el=document.getElementById("usersTable");if(!el)return;let html='<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branch Access</th><th>Status</th><th>Action</th></tr></thead><tbody>';if(!data.userProfiles.length)html+='<tr><td colspan="6" class="muted">No user profiles yet. Add your first user profile here.</td></tr>';data.userProfiles.forEach(u=>{html+=`<tr><td>${u.name||"-"}</td><td>${u.email||"-"}</td><td>${u.role||"-"}</td><td>${u.branchAccess||"-"}</td><td>${u.status||"-"}</td><td><button class="secondary" onclick="editUserProfile('${u.id}')">Edit</button></td></tr>`});html+='</tbody></table>';el.innerHTML=html;}

function downloadCSV(filename, headers, rows){const csv=[headers,...rows].map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;a.click()}
window.exportDashboardCSV=function(){const invs=filteredInvoicesByBranch();const totalOut=invs.reduce((s,i)=>s+outstanding(i),0),overdue=invs.filter(isOverdue).reduce((s,i)=>s+outstanding(i),0);downloadCSV("dashboard_summary.csv",["Branch Filter","Metric","Value"],[[selectedBranch(),"Total Outstanding",totalOut],[selectedBranch(),"Overdue Amount",overdue]])}
window.exportInvoicesCSV=function(){downloadCSV("invoices_outstanding.csv",["Due Date","Supplier","Invoice No","Invoice Date","Branch","Category","Invoice Amount","Paid","Outstanding","Status","Remarks"],getFilteredInvoices().map(i=>[formatDate(i.dueDate),i.supplier,i.invoiceNo,formatDate(i.invoiceDate),i.branch||"",i.category||"",i.amount,paidForInvoice(i.id),outstanding(i),statusLabel(i),i.remarks||""]))}
window.exportPaymentsCSV=function(){const q=(document.getElementById("paymentSearch")?.value||"").toLowerCase();downloadCSV("payment_history.csv",["Payment Date","Supplier","Invoice No","Branch","Amount Paid","Method","Reference","Created By","Remarks"],filteredPaymentsByBranch().filter(p=>(p.supplier||"").toLowerCase().includes(q)||(p.invoiceNo||"").toLowerCase().includes(q)||(p.ref||"").toLowerCase().includes(q)).map(p=>[formatDate(p.date),p.supplier,p.invoiceNo,p.branch||"",p.amount,p.method,p.ref||"",p.createdBy||"",p.remarks||""]))}
window.exportCalendarCSV=function(){const month=`${viewYear}-${String(viewMonth+1).padStart(2,"0")}`;downloadCSV(`payment_calendar_${month}.csv`,["Due Date","Supplier","Invoice No","Branch","Outstanding","Status"],filteredInvoicesByBranch().filter(i=>monthKey(i.dueDate)===month&&status(i)!=="Paid").map(i=>[formatDate(i.dueDate),i.supplier,i.invoiceNo,i.branch||"",outstanding(i),statusLabel(i)]))}
window.exportSupplierSummaryCSV=function(){const map={};filteredInvoicesByBranch().forEach(i=>{if(!map[i.supplier])map[i.supplier]={supplier:i.supplier,invoice:0,paid:0,out:0,overdue:0,count:0};map[i.supplier].invoice+=Number(i.amount||0);map[i.supplier].paid+=paidForInvoice(i.id);map[i.supplier].out+=outstanding(i);if(isOverdue(i))map[i.supplier].overdue+=outstanding(i);map[i.supplier].count++});downloadCSV("supplier_summary.csv",["Branch Filter","Supplier","No. of Invoices","Total Invoice","Total Paid","Total Outstanding","Overdue"],Object.values(map).map(r=>[selectedBranch(),r.supplier,r.count,r.invoice,r.paid,r.out,r.overdue]))}
window.exportMethodSummaryCSV=function(){const monthMap={};filteredPaymentsByBranch().forEach(p=>{const m=monthKey(p.date);if(!m)return;const method=p.method||"Other";if(!monthMap[m])monthMap[m]={month:m,total:0,Cash:0,"Bank Transfer":0,Cheque:0,DuitNow:0,Other:0};const amt=Number(p.amount||0);monthMap[m].total+=amt;if(method==="Cash")monthMap[m].Cash+=amt;else if(method==="Bank Transfer")monthMap[m]["Bank Transfer"]+=amt;else if(method==="Cheque")monthMap[m].Cheque+=amt;else if(method==="DuitNow")monthMap[m].DuitNow+=amt;else monthMap[m].Other+=amt});downloadCSV("monthly_payment_method_summary.csv",["Branch Filter","Month","Cash","Bank Transfer / Online","Cheque","DuitNow","Other","Total Paid"],Object.values(monthMap).map(r=>[selectedBranch(),monthLabel(r.month),r.Cash,r["Bank Transfer"],r.Cheque,r.DuitNow,r.Other,r.total]))}


window.saveBranch = async function(){
 if(!canManageSystem()){ alert('You do not have permission to manage branches.'); return; }
  const id = document.getElementById("branchId").value;
  const branch = {
    name: document.getElementById("branchName").value.trim(),
    code: document.getElementById("branchCode").value.trim().toUpperCase(),
    status: document.getElementById("branchStatus").value,
    manager: document.getElementById("branchManager").value.trim(),
    address: document.getElementById("branchAddress").value.trim(),
    updatedBy: currentUser.email,
    updatedAt: serverTimestamp()
  };
  if(!branch.name){ alert("Please enter branch name."); return; }
  try{
    if(id){
      await setDoc(docPath("branches", id), branch, {merge:true});
      await audit("Edit Branch", `${branch.name} / ${branch.code || "-"}`);
    } else {
      await addDoc(colPath("branches"), {...branch, createdBy: currentUser.email, createdAt: serverTimestamp()});
      await audit("Create Branch", `${branch.name} / ${branch.code || "-"}`);
    }
    resetBranchForm();
    alert("Branch saved.");
  }catch(e){ alert("Branch save failed: " + e.message); }
}

window.resetBranchForm = function(){
  const form = document.getElementById("branchForm");
  if(form) form.reset();
  const id = document.getElementById("branchId");
  if(id) id.value = "";
}

window.editBranch = function(id){
  const b = data.branches.find(x => x.id === id);
  if(!b) return;
  document.getElementById("branchId").value = b.id;
  document.getElementById("branchName").value = b.name || "";
  document.getElementById("branchCode").value = b.code || "";
  document.getElementById("branchStatus").value = b.status || "Active";
  document.getElementById("branchManager").value = b.manager || "";
  document.getElementById("branchAddress").value = b.address || "";
  showPageById("branchAdmin");
}

function renderBranches(){
  const el = document.getElementById("branchTable");
  if(!el) return;
  const source = data.branches.length ? data.branches : BRANCHES.map((name, i) => ({
    id: "default_" + i, name, code: "", status: "Active", manager: "", address: ""
  }));
  let html = '<table><thead><tr><th>Branch Name</th><th>Code</th><th>Status</th><th>Manager</th><th>Address / Notes</th><th>Action</th></tr></thead><tbody>';
  source.forEach(b => {
    const action = String(b.id).startsWith("default_") ? '<span class="muted">Default branch</span>' : `<button class="secondary" onclick="editBranch('${b.id}')">Edit</button>`;
    html += `<tr><td>${b.name || "-"}</td><td>${b.code || "-"}</td><td>${b.status || "Active"}</td><td>${b.manager || "-"}</td><td>${b.address || "-"}</td><td>${action}</td></tr>`;
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function renderAll(){if(document.getElementById("appScreen").classList.contains("hidden"))return;updateUserRoleDisplay();enforceMenuPermissions();populateBranchControls();renderDashboard();renderInvoices();renderPayments();renderCalendar();renderSummary();renderMethodSummary();renderAudit();renderUsers();renderBranches();}
if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.log));}
