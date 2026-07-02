import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, setDoc, updateDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const COMPANY_ID = "green_garden_market";

const DEFAULT_DEFAULT_BRANCHES = ["Green Garden Market","Cahaya Maju","Nibong Tebal","Simpang Ampat","Alma","Sungai Bakap"];
const DEFAULT_PAYMENT_METHODS = ["Bank Transfer","Cash","Cheque","DuitNow","Other"];
const DEFAULT_CATEGORIES = ["General","Vegetables","Fruits","Chicken/Meat","Seafood","Groceries","Dry Goods","Utilities","Other"];

let currentUser = null;
let data = { invoices: [], payments: [], auditLogs: [], userProfiles: [], branches: [], paymentMethods: [], categories: [] };
let viewMonth = new Date().getMonth();
let viewYear = new Date().getFullYear();
let unsub = [];

const colPath = (name) => collection(db, "companies", COMPANY_ID, name);
const docPath = (name, id) => doc(db, "companies", COMPANY_ID, name, id);

const activeBranches = () => { const saved=data.branches.filter(b=>b.status!=="Inactive").map(b=>b.name).filter(Boolean); return saved.length?saved:DEFAULT_activeBranches(); };
const activePaymentMethods = () => { const saved=data.paymentMethods.filter(m=>m.status!=="Inactive").map(m=>m.name).filter(Boolean); return saved.length?saved:DEFAULT_PAYMENT_METHODS; };
const activeCategories = () => { const saved=data.categories.filter(c=>c.status!=="Inactive").map(c=>c.name).filter(Boolean); return saved.length?saved:DEFAULT_CATEGORIES; };

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

function setToday(){document.getElementById("todayDate").textContent = new Date().toLocaleDateString("en-MY",{weekday:"short",year:"numeric",month:"short",day:"numeric"});}
function fillSelect(el, items, includeAll=false){
  if(!el) return;
  const current = el.value || (includeAll ? "All" : items[0]);
  el.innerHTML = (includeAll ? '<option value="All">All Branches</option>' : '') + items.map(x=>`<option value="${x}">${x}</option>`).join("");
  el.value = [...el.options].some(o=>o.value===current) ? current : (includeAll ? "All" : items[0]);
}
function populateControls(){
  fillSelect(document.getElementById("branch"), activeBranches());
  fillSelect(document.getElementById("globalBranchFilter"), activeBranches(), true);
  fillSelect(document.getElementById("invoiceBranchFilter"), activeBranches(), true);
  fillSelect(document.getElementById("category"), activeCategories());
  fillSelect(document.getElementById("payMethod"), activePaymentMethods());
  fillSelect(document.getElementById("profileBranch"), ["All Branches",...activeBranches()]);
}
setToday(); populateControls();

onAuthStateChanged(auth, user => {
  if(user){
    currentUser=user;
    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("appScreen").classList.remove("hidden");
    document.getElementById("userName").textContent=user.email.split("@")[0];
    document.getElementById("userEmail").textContent=user.email;
    const h=new Date().getHours(); const g=h<12?"Good Morning":h<18?"Good Afternoon":"Good Evening";
    document.getElementById("welcomeText").textContent=`${g}, ${user.email.split("@")[0]} 👋`;
    listenData();
  } else {
    currentUser=null; unsub.forEach(u=>u&&u()); unsub=[];
    document.getElementById("loginScreen").classList.remove("hidden");
    document.getElementById("appScreen").classList.add("hidden");
  }
});

window.login=async function(){
  const err=document.getElementById("loginError");
  if(err) err.textContent="";
  try{
    await signInWithEmailAndPassword(auth,document.getElementById("loginEmail").value.trim(),document.getElementById("loginPassword").value);
  }catch(e){
    if(err) err.textContent=e.message;
    console.error(e);
  }
}
window.logout=async function(){await signOut(auth)}
window.comingSoon=function(name){alert(name+" module will be built after Supplier Payment and System Administration are approved.")}

function listenData(){
  unsub.forEach(u=>u&&u()); unsub=[];
  const listen=(name,order,assign)=>unsub.push(onSnapshot(query(colPath(name),orderBy(order,"asc")),snap=>{data[assign]=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>!x.deleted);renderAll()},err=>alert(name+" access error: "+err.message)));
  listen("invoices","dueDate","invoices");
  listen("payments","date","payments");
  listen("userProfiles","name","userProfiles");
  listen("branches","name","branches");
  listen("paymentMethods","name","paymentMethods");
  listen("categories","name","categories");
  unsub.push(onSnapshot(query(colPath("auditLogs"),orderBy("createdAt","desc")),snap=>{data.auditLogs=snap.docs.map(d=>({id:d.id,...d.data()}));renderAll()},err=>console.log(err.message)));
}
async function audit(action,details){try{await addDoc(colPath("auditLogs"),{action,details,userEmail:currentUser?.email||"unknown",createdAt:serverTimestamp(),createdAtLocal:new Date().toISOString()})}catch(e){}}

window.showPage=function(id,btn){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".nav button").forEach(x=>x.classList.remove("active"));document.getElementById(id).classList.add("active");if(btn)btn.classList.add("active");renderAll()}
window.showPageById=function(id){const ids=["dashboard","invoiceEntry","invoices","paymentHistory","calendarTab","summary","methodSummary","audit","users","branchAdmin","settings"];document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".nav button").forEach(x=>x.classList.remove("active"));document.getElementById(id).classList.add("active");const idx=ids.indexOf(id);if(idx>=0)document.querySelectorAll(".nav button")[idx].classList.add("active");renderAll()}

function selectedBranch(){return document.getElementById("globalBranchFilter")?.value||"All"}
function branchMatch(r,b){return b==="All"||(r.branch||"Unassigned")===b}
function filteredInvoices(){return data.invoices.filter(i=>branchMatch(i,selectedBranch()))}
function filteredPayments(){return data.payments.filter(p=>branchMatch(p,selectedBranch()))}

window.saveInvoice=async function(){
 const id=document.getElementById("invoiceId").value;
 const inv={supplier:document.getElementById("supplier").value.trim(),invoiceNo:document.getElementById("invoiceNo").value.trim(),invoiceDate:document.getElementById("invoiceDate").value,dueDate:document.getElementById("dueDate").value,amount:Number(document.getElementById("amount").value||0),branch:document.getElementById("branch").value,category:document.getElementById("category").value,remarks:document.getElementById("remarks").value.trim(),updatedBy:currentUser.email,updatedAt:serverTimestamp()};
 if(!inv.supplier||!inv.invoiceNo||!inv.invoiceDate||!inv.dueDate||!inv.amount){alert("Please fill supplier, invoice no, dates and amount.");return}
 if(id){await setDoc(docPath("invoices",id),inv,{merge:true});await audit("Edit Invoice",`${inv.branch} / ${inv.supplier} / ${inv.invoiceNo}`)}
 else{await addDoc(colPath("invoices"),{...inv,createdBy:currentUser.email,createdAt:serverTimestamp(),deleted:false});await audit("Create Invoice",`${inv.branch} / ${inv.supplier} / ${inv.invoiceNo}`)}
 resetInvoiceForm(); alert("Invoice saved.");
}
window.resetInvoiceForm=function(){document.getElementById("invoiceForm").reset();document.getElementById("invoiceId").value="";populateControls()}
window.editInvoice=function(id){const i=data.invoices.find(x=>x.id===id);if(!i)return;["supplier","invoiceNo","invoiceDate","dueDate","amount","branch","category","remarks"].forEach(k=>{const el=document.getElementById(k); if(el) el.value=i[k]||""});document.getElementById("invoiceId").value=i.id;showPageById("invoiceEntry")}
window.deleteInvoice=async function(id){if(!confirm("Delete invoice and its payments?"))return;const i=data.invoices.find(x=>x.id===id);await updateDoc(docPath("invoices",id),{deleted:true,deletedBy:currentUser.email,deletedAt:serverTimestamp()});for(const p of data.payments.filter(x=>x.invoiceId===id))await updateDoc(docPath("payments",p.id),{deleted:true});await audit("Delete Invoice",i?`${i.branch} / ${i.supplier} / ${i.invoiceNo}`:id)}

window.openPaymentModal=function(id){const i=data.invoices.find(x=>x.id===id);if(!i)return;populateControls();document.getElementById("payInvoiceId").value=id;document.getElementById("payDate").value=todayISO();document.getElementById("payAmount").value=outstanding(i).toFixed(2);document.getElementById("payRef").value="";document.getElementById("payRemarks").value="";document.getElementById("paymentInvoiceInfo").innerHTML=`<b>${i.supplier}</b><br>Branch: ${i.branch||"-"}<br>Invoice: ${i.invoiceNo}<br>Invoice Amount: ${money(i.amount)}<br>Paid: ${money(paidForInvoice(i.id))}<br><b>Outstanding: ${money(outstanding(i))}</b>`;document.getElementById("paymentModal").style.display="flex"}
window.closePaymentModal=function(){document.getElementById("paymentModal").style.display="none"}
window.savePayment=async function(){const id=document.getElementById("payInvoiceId").value;const i=data.invoices.find(x=>x.id===id);if(!i)return;const amount=Number(document.getElementById("payAmount").value||0);if(amount<=0){alert("Enter valid amount.");return}const p={invoiceId:id,supplier:i.supplier,invoiceNo:i.invoiceNo,branch:i.branch||"Unassigned",date:document.getElementById("payDate").value,amount,method:document.getElementById("payMethod").value,ref:document.getElementById("payRef").value.trim(),remarks:document.getElementById("payRemarks").value.trim(),createdBy:currentUser.email,createdAt:serverTimestamp(),deleted:false};await addDoc(colPath("payments"),p);await audit("Record Payment",`${p.branch} / ${p.supplier} / ${money(amount)}`);closePaymentModal();alert("Payment recorded.")}
window.deletePayment=async function(id){if(!confirm("Delete payment?"))return;const p=data.payments.find(x=>x.id===id);await updateDoc(docPath("payments",id),{deleted:true,deletedBy:currentUser.email,deletedAt:serverTimestamp()});await audit("Delete Payment",p?`${p.branch} / ${p.supplier} / ${money(p.amount)}`:id)}

async function saveMaster(col,id,body,action){if(id){await setDoc(docPath(col,id),body,{merge:true});await audit("Edit "+action,body.name||body.email)}else{await addDoc(colPath(col),{...body,createdBy:currentUser.email,createdAt:serverTimestamp()});await audit("Create "+action,body.name||body.email)}}
window.saveBranch=async function(){const id=document.getElementById("branchId").value;const b={name:document.getElementById("branchName").value.trim(),code:document.getElementById("branchCode").value.trim().toUpperCase(),status:document.getElementById("branchStatus").value,manager:document.getElementById("branchManager").value.trim(),address:document.getElementById("branchAddress").value.trim(),updatedBy:currentUser.email,updatedAt:serverTimestamp()};if(!b.name){alert("Enter branch name.");return}await saveMaster("branches",id,b,"Branch");resetBranchForm();alert("Branch saved.")}
window.resetBranchForm=function(){document.getElementById("branchForm").reset();document.getElementById("branchId").value=""}
window.editBranch=function(id){const b=data.branches.find(x=>x.id===id);if(!b)return;["branchName","branchCode","branchStatus","branchManager","branchAddress"].forEach((k,idx)=>{const fields=["name","code","status","manager","address"];document.getElementById(k).value=b[fields[idx]]||""});document.getElementById("branchId").value=id;showPageById("branchAdmin")}
window.savePaymentMethod=async function(){const id=document.getElementById("paymentMethodId").value;const m={name:document.getElementById("paymentMethodName").value.trim(),status:document.getElementById("paymentMethodStatus").value,updatedBy:currentUser.email,updatedAt:serverTimestamp()};if(!m.name){alert("Enter payment method.");return}await saveMaster("paymentMethods",id,m,"Payment Method");resetPaymentMethodForm();alert("Payment method saved.")}
window.resetPaymentMethodForm=function(){document.getElementById("paymentMethodForm").reset();document.getElementById("paymentMethodId").value=""}
window.editPaymentMethod=function(id){const m=data.paymentMethods.find(x=>x.id===id);if(!m)return;document.getElementById("paymentMethodId").value=id;document.getElementById("paymentMethodName").value=m.name||"";document.getElementById("paymentMethodStatus").value=m.status||"Active"}
window.saveCategory=async function(){const id=document.getElementById("categoryId").value;const c={name:document.getElementById("categoryName").value.trim(),status:document.getElementById("categoryStatus").value,updatedBy:currentUser.email,updatedAt:serverTimestamp()};if(!c.name){alert("Enter category.");return}await saveMaster("categories",id,c,"Category");resetCategoryForm();alert("Category saved.")}
window.resetCategoryForm=function(){document.getElementById("categoryForm").reset();document.getElementById("categoryId").value=""}
window.editCategory=function(id){const c=data.categories.find(x=>x.id===id);if(!c)return;document.getElementById("categoryId").value=id;document.getElementById("categoryName").value=c.name||"";document.getElementById("categoryStatus").value=c.status||"Active"}
window.saveUserProfile=async function(){const id=document.getElementById("userProfileId").value;const u={name:document.getElementById("profileName").value.trim(),email:document.getElementById("profileEmail").value.trim().toLowerCase(),role:document.getElementById("profileRole").value,branchAccess:document.getElementById("profileBranch").value,status:document.getElementById("profileStatus").value,updatedBy:currentUser.email,updatedAt:serverTimestamp()};if(!u.name||!u.email){alert("Enter name and email.");return}await saveMaster("userProfiles",id,u,"User Profile");resetUserForm();alert("User profile saved.")}
window.resetUserForm=function(){document.getElementById("userForm").reset();document.getElementById("userProfileId").value="";populateControls()}
window.editUserProfile=function(id){const u=data.userProfiles.find(x=>x.id===id);if(!u)return;document.getElementById("userProfileId").value=id;document.getElementById("profileName").value=u.name||"";document.getElementById("profileEmail").value=u.email||"";document.getElementById("profileRole").value=u.role||"Viewer";document.getElementById("profileBranch").value=u.branchAccess||"All Branches";document.getElementById("profileStatus").value=u.status||"Active";showPageById("users")}

function renderDashboard(){const inv=filteredInvoices(),pay=filteredPayments();const today=todayISO(),thisMonth=today.slice(0,7);const totalOut=inv.reduce((s,i)=>s+outstanding(i),0);const due=inv.filter(i=>i.dueDate===today&&status(i)!=="Paid");const overdue=inv.filter(isOverdue);document.getElementById("mOutstanding").textContent=money(totalOut);document.getElementById("mDueToday").textContent=money(due.reduce((s,i)=>s+outstanding(i),0));document.getElementById("mDueTodayCount").textContent=`${due.length} invoices`;document.getElementById("mOverdue").textContent=money(overdue.reduce((s,i)=>s+outstanding(i),0));document.getElementById("mOverdueCount").textContent=`${overdue.length} invoices`;document.getElementById("mPaidMonth").textContent=money(pay.filter(p=>monthKey(p.date)===thisMonth).reduce((s,p)=>s+Number(p.amount||0),0));const next=new Date(today+"T00:00:00");next.setDate(next.getDate()+7);document.getElementById("dueToday").innerHTML=listMini(due);document.getElementById("upcoming").innerHTML=listMini(inv.filter(i=>i.dueDate>today&&i.dueDate<=next.toISOString().slice(0,10)&&status(i)!=="Paid"),true)}
function listMini(list,showDate=false){return list.length?list.map(i=>`<div class="payment-chip ${isOverdue(i)?"overdue":status(i)==="Partial"?"partial":""}"><b>${showDate?formatDate(i.dueDate)+" — ":""}${i.supplier}</b><br>${i.branch||"-"} | ${i.invoiceNo} | <b>${money(outstanding(i))}</b></div>`).join(""):'<p class="muted">No payments found.</p>'}
function updateMonthFilter(){const el=document.getElementById("monthFilter");if(!el)return;const cur=el.value||"All";const months=[...new Set(filteredInvoices().map(i=>monthKey(i.dueDate)).filter(Boolean))].sort();el.innerHTML='<option value="All">All Due Months</option>'+months.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join("");el.value=months.includes(cur)?cur:"All"}
function getFilteredInvoices(){const q=(document.getElementById("invoiceSearch")?.value||"").toLowerCase(),bf=document.getElementById("invoiceBranchFilter")?.value||"All",sf=document.getElementById("statusFilter")?.value||"All",mf=document.getElementById("monthFilter")?.value||"All";let rows=filteredInvoices().filter(i=>(i.supplier||"").toLowerCase().includes(q)||(i.invoiceNo||"").toLowerCase().includes(q));if(bf!=="All")rows=rows.filter(i=>i.branch===bf);if(sf!=="All")rows=rows.filter(i=>sf==="Overdue"?isOverdue(i):status(i)===sf);if(mf!=="All")rows=rows.filter(i=>monthKey(i.dueDate)===mf);return rows}
function renderInvoices(){updateMonthFilter();let rows=getFilteredInvoices();let html='<table><thead><tr><th>Due</th><th>Supplier</th><th>Invoice</th><th>Invoice Date</th><th>Branch</th><th>Category</th><th>Amount</th><th>Paid</th><th>Outstanding</th><th>Status</th><th>Action</th></tr></thead><tbody>';if(!rows.length)html+='<tr><td colspan="11" class="muted">No invoices found.</td></tr>';rows.forEach(i=>html+=`<tr><td>${formatDate(i.dueDate)}</td><td>${i.supplier}</td><td>${i.invoiceNo}</td><td>${formatDate(i.invoiceDate)}</td><td>${i.branch||"-"}</td><td>${i.category||"-"}</td><td>${money(i.amount)}</td><td>${money(paidForInvoice(i.id))}</td><td><b>${money(outstanding(i))}</b></td><td class="${statusClass(i)}">${statusLabel(i)}</td><td><button onclick="openPaymentModal('${i.id}')">Record Payment</button> <button class="secondary" onclick="editInvoice('${i.id}')">Edit</button> <button class="danger" onclick="deleteInvoice('${i.id}')">Delete</button></td></tr>`);document.getElementById("invoiceTable").innerHTML=html+"</tbody></table>"}
function renderPayments(){const q=(document.getElementById("paymentSearch")?.value||"").toLowerCase();let rows=filteredPayments().filter(p=>(p.supplier||"").toLowerCase().includes(q)||(p.invoiceNo||"").toLowerCase().includes(q)||(p.ref||"").toLowerCase().includes(q));let html='<table><thead><tr><th>Date</th><th>Supplier</th><th>Invoice</th><th>Branch</th><th>Paid</th><th>Method</th><th>Ref</th><th>Created By</th><th>Remarks</th><th>Action</th></tr></thead><tbody>';if(!rows.length)html+='<tr><td colspan="10" class="muted">No payments recorded yet.</td></tr>';rows.forEach(p=>html+=`<tr><td>${formatDate(p.date)}</td><td>${p.supplier}</td><td>${p.invoiceNo}</td><td>${p.branch||"-"}</td><td>${money(p.amount)}</td><td>${p.method}</td><td>${p.ref||"-"}</td><td>${p.createdBy||"-"}</td><td>${p.remarks||"-"}</td><td><button class="danger" onclick="deletePayment('${p.id}')">Delete</button></td></tr>`);document.getElementById("paymentsTable").innerHTML=html+"</tbody></table>"}
window.changeMonth=function(d){viewMonth+=d;if(viewMonth<0){viewMonth=11;viewYear--}if(viewMonth>11){viewMonth=0;viewYear++}renderCalendar()}
function renderCalendar(){const cal=document.getElementById("calendar");document.getElementById("calendarTitle").textContent=new Date(viewYear,viewMonth,1).toLocaleDateString("en-MY",{month:"long",year:"numeric"});cal.innerHTML=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>`<div class="day-name">${d}</div>`).join("");const first=new Date(viewYear,viewMonth,1).getDay(),days=new Date(viewYear,viewMonth+1,0).getDate();for(let i=0;i<first;i++)cal.innerHTML+="<div></div>";for(let day=1;day<=days;day++){const iso=`${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;const inv=filteredInvoices().filter(i=>i.dueDate===iso&&status(i)!=="Paid");cal.innerHTML+=`<div class="date-cell"><div class="date-num">${day}</div>${inv.length?`<div class="muted"><b>Total: ${money(inv.reduce((s,i)=>s+outstanding(i),0))}</b></div>`:""}${inv.map(i=>`<div class="payment-chip"><b>${i.supplier}</b><br>${i.branch||"-"}<br>${money(outstanding(i))}</div>`).join("")}</div>`}}
function renderSummary(){const m={};filteredInvoices().forEach(i=>{if(!m[i.supplier])m[i.supplier]={supplier:i.supplier,count:0,invoice:0,paid:0,out:0,overdue:0};m[i.supplier].count++;m[i.supplier].invoice+=Number(i.amount||0);m[i.supplier].paid+=paidForInvoice(i.id);m[i.supplier].out+=outstanding(i);if(isOverdue(i))m[i.supplier].overdue+=outstanding(i)});table("summaryTable",["Supplier","Invoices","Total Invoice","Paid","Outstanding","Overdue"],Object.values(m).map(r=>[r.supplier,r.count,money(r.invoice),money(r.paid),money(r.out),money(r.overdue)]))}
function renderMethodSummary(){const m={};filteredPayments().forEach(p=>{const mo=monthKey(p.date);if(!mo)return;if(!m[mo])m[mo]={month:mo,total:0};m[mo][p.method]=(m[mo][p.method]||0)+Number(p.amount||0);m[mo].total+=Number(p.amount||0)});const methods=activePaymentMethods();table("methodSummaryTable",["Month",...methods,"Total"],Object.values(m).map(r=>[monthLabel(r.month),...methods.map(x=>money(r[x]||0)),money(r.total)]))}
function renderAudit(){table("auditTable",["Date/Time","User","Action","Details"],data.auditLogs.slice(0,100).map(r=>[r.createdAtLocal?new Date(r.createdAtLocal).toLocaleString("en-MY"):"-",r.userEmail||"-",r.action||"-",r.details||"-"]))}
function renderUsers(){table("usersTable",["Name","Email","Role","Branch Access","Status","Action"],data.userProfiles.map(u=>[u.name,u.email,u.role,u.branchAccess,u.status,`<button class="secondary" onclick="editUserProfile('${u.id}')">Edit</button>`]))}
function renderBranches(){const rows=(data.branches.length?data.branches:DEFAULT_activeBranches().map((name,i)=>({id:"d"+i,name,status:"Active",code:"",manager:"",address:""}))).map(b=>[b.name,b.code||"-",b.status||"Active",b.manager||"-",b.address||"-",String(b.id).startsWith("d")?'<span class="muted">Default</span>':`<button class="secondary" onclick="editBranch('${b.id}')">Edit</button>`]);table("branchTable",["Branch","Code","Status","Manager","Address / Notes","Action"],rows)}
function renderPaymentMethods(){table("paymentMethodTable",["Method","Status","Action"],(data.paymentMethods.length?data.paymentMethods:DEFAULT_PAYMENT_METHODS.map((name,i)=>({id:"d"+i,name,status:"Active"}))).map(m=>[m.name,m.status||"Active",String(m.id).startsWith("d")?'<span class="muted">Default</span>':`<button class="secondary" onclick="editPaymentMethod('${m.id}')">Edit</button>`]))}
function renderCategories(){table("categoryTable",["Category","Status","Action"],(data.categories.length?data.categories:DEFAULT_CATEGORIES.map((name,i)=>({id:"d"+i,name,status:"Active"}))).map(c=>[c.name,c.status||"Active",String(c.id).startsWith("d")?'<span class="muted">Default</span>':`<button class="secondary" onclick="editCategory('${c.id}')">Edit</button>`]))}
function table(id,headers,rows){const el=document.getElementById(id);if(!el)return;let html="<table><thead><tr>"+headers.map(h=>`<th>${h}</th>`).join("")+"</tr></thead><tbody>";if(!rows.length)html+=`<tr><td colspan="${headers.length}" class="muted">No data yet.</td></tr>`;rows.forEach(r=>html+="<tr>"+r.map(c=>`<td>${c??"-"}</td>`).join("")+"</tr>");el.innerHTML=html+"</tbody></table>"}

function csv(filename,headers,rows){const out=[headers,...rows].map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([out],{type:"text/csv"}));a.download=filename;a.click()}
window.exportDashboardCSV=()=>csv("dashboard_summary.csv",["Branch","Metric","Value"],[[selectedBranch(),"Outstanding",filteredInvoices().reduce((s,i)=>s+outstanding(i),0)]])
window.exportInvoicesCSV=()=>csv("invoices.csv",["Due","Supplier","Invoice","Branch","Amount","Paid","Outstanding","Status"],getFilteredInvoices().map(i=>[formatDate(i.dueDate),i.supplier,i.invoiceNo,i.branch,i.amount,paidForInvoice(i.id),outstanding(i),statusLabel(i)]))
window.exportPaymentsCSV=()=>csv("payments.csv",["Date","Supplier","Invoice","Branch","Amount","Method"],filteredPayments().map(p=>[formatDate(p.date),p.supplier,p.invoiceNo,p.branch,p.amount,p.method]))
window.exportCalendarCSV=()=>csv("calendar.csv",["Due","Supplier","Invoice","Branch","Outstanding"],filteredInvoices().filter(i=>monthKey(i.dueDate)===`${viewYear}-${String(viewMonth+1).padStart(2,"0")}`).map(i=>[formatDate(i.dueDate),i.supplier,i.invoiceNo,i.branch,outstanding(i)]))
window.exportSupplierSummaryCSV=()=>csv("supplier_summary.csv",["Supplier","Outstanding"],Object.values(filteredInvoices().reduce((m,i)=>{m[i.supplier]=(m[i.supplier]||0)+outstanding(i);return m},{})).map((v,i)=>[Object.keys(filteredInvoices().reduce((m,i)=>{m[i.supplier]=1;return m},{}))[i],v]))
window.exportMethodSummaryCSV=()=>csv("payment_method_summary.csv",["Date","Method","Amount"],filteredPayments().map(p=>[formatDate(p.date),p.method,p.amount]))

function renderAll(){if(document.getElementById("appScreen").classList.contains("hidden"))return;populateControls();renderDashboard();renderInvoices();renderPayments();renderCalendar();renderSummary();renderMethodSummary();renderAudit();renderUsers();renderBranches();renderPaymentMethods();renderCategories();}
if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.log));}
