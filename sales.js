import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// إعدادات فايربيس
const firebaseConfig = {
    apiKey: "AIzaSyDpH2obY_UOwSDen64Q0HvX4q4BJIKwVMI",
    authDomain: "ahmd4erb-8c507.firebaseapp.com",
    projectId: "ahmd4erb-8c507",
    storageBucket: "ahmd4erb-8c507.firebasestorage.app",
    messagingSenderId: "815193144806",
    appId: "1:815193144806:web:cdc9e67059a8e3acb6ea27",
    measurementId: "G-9JFE9P25RR"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// أسماء المجموعات (Collections) في فايربيس
const SALES_COLLECTION = 'asgate_sales_cloud';
const CUSTOMERS_COLLECTION = 'asgate_customers_cloud';
const LOGS_DOC = 'asgate_sales_logs';

let cachedCustomersCloud = [];
let salesDataCloud = [];
let customersLoaded = false;
let currentActivePreview = null;
let pendingAttachment = null;
let saveTimeout;

// ----------------------------------------------------
// دوال التاريخ والوقت
// ----------------------------------------------------
function getTodayFormatted() { return new Date().toISOString().split('T')[0]; }
function getTimeFormatted() { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ":" + String(d.getMinutes()).padStart(2, '0'); }
function getArabicDayName(dateString) {
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const d = dateString ? new Date(dateString) : new Date();
    return days[d.getDay()];
}

// ----------------------------------------------------
// دوال التهيئة وجلب البيانات
// ----------------------------------------------------
async function initPage() {
    initStatsVisibility();
    await Promise.all([loadCustomersCloud(), loadSalesFromCloud()]);
    renderGeneralLog();
}

async function loadCustomersCloud() {
    try {
        const snap = await getDocs(collection(db, CUSTOMERS_COLLECTION));
        cachedCustomersCloud = [];
        snap.forEach(d => { cachedCustomersCloud.push({ id: d.id, ...d.data() }); });
        customersLoaded = true;
    } catch (e) {
        console.error("خطأ في جلب العملاء:", e);
    }
}

async function loadSalesFromCloud() {
    try {
        const snap = await getDocs(collection(db, SALES_COLLECTION));
        salesDataCloud = [];
        snap.forEach(d => { salesDataCloud.push({ id: d.id, ...d.data() }); });
        
        // الترتيب الأحدث أولاً
        salesDataCloud.sort((a, b) => (b.id || "").localeCompare(a.id || ""));
        
        const tbody = document.getElementById('salesBody');
        if (tbody) {
            tbody.innerHTML = '';
            salesDataCloud.forEach(obj => renderTableRow(obj));
        }
        updateHeaderStats();
    } catch (e) {
        console.error("خطأ في جلب المبيعات:", e);
    }
}

// ----------------------------------------------------
// دوال الإحصائيات والأرقام
// ----------------------------------------------------
function initStatsVisibility() {
    const isHidden = localStorage.getItem('asgate_sales_stats_hidden') === 'true';
    const cont = document.getElementById('statsContainer');
    const btn = document.getElementById('eyeToggleBtn');
    if(!cont || !btn) return;
    if (isHidden) {
        cont.classList.add('blur-active');
        btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    }
}

function toggleStatsVisibility() {
    const container = document.getElementById('statsContainer');
    const btn = document.getElementById('eyeToggleBtn');
    if(!container || !btn) return;
    const isHidden = container.classList.toggle('blur-active');
    if (isHidden) {
        btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        localStorage.setItem('asgate_sales_stats_hidden', 'true');
    } else {
        btn.innerHTML = '<i class="fas fa-eye"></i>';
        localStorage.setItem('asgate_sales_stats_hidden', 'false');
    }
}

function updateHeaderStats() {
    const currentMonthStr = getTodayFormatted().substring(0, 7);
    let totalComp = 0, totalPend = 0, monthCount = 0, monthComp = 0, monthPend = 0;
    
    salesDataCloud.forEach(item => {
        const sums = calculateOrderSums(item.id);
        totalComp += sums.completed; totalPend += sums.pending;
        if (item.date && item.date.startsWith(currentMonthStr)) {
            monthCount++; monthComp += sums.completed; monthPend += sums.pending;
        }
    });
    
    const set = (id,v) => { const el = document.getElementById(id); if(el) el.innerText = v; };
    set('count-total', salesDataCloud.length);
    set('month-count', monthCount);
    set('sum-completed', totalComp.toLocaleString('en-US', {minimumFractionDigits: 2}));
    set('sum-pending', totalPend.toLocaleString('en-US', {minimumFractionDigits: 2}));
    set('month-completed', monthComp.toLocaleString('en-US', {minimumFractionDigits: 2}));
    set('month-pending', monthPend.toLocaleString('en-US', {minimumFractionDigits: 2}));
}

function calculateOrderSums(orderId) {
    // حساب المبالغ لا يزال يقرأ من لوكال ستوريج لأن جدول المنتجات غير مرفق
    const productsDb = JSON.parse(localStorage.getItem('asgate_products_db') || '{}');
    const products = productsDb[orderId] || [];
    let completed = 0, pending = 0;
    products.forEach(p => {
        const lineTotal = (parseFloat(p.qty) || 0) * (parseFloat(String(p.sub).replace(/[^\d.]/g, '')) || 0);
        if (p.status === "مكتمل") completed += lineTotal;
        if (p.status === "معلق") pending += lineTotal;
    });
    return { completed, pending };
}

// ----------------------------------------------------
// واجهة المستخدم وبناء الجدول
// ----------------------------------------------------
function renderTableRow(obj) {
    const tbody = document.getElementById('salesBody');
    if(!tbody) return;
    const sums = calculateOrderSums(obj.id);
    const row = tbody.insertRow(-1);
    row.className = 'main-row';
    row.id = `row-${obj.id}`;
    if (obj.status === "فقدان") row.classList.add('lost-row');
    
    const statusClass = obj.status === 'مكتمل' ? 'status-complete' : obj.status === 'معلق' ? 'status-pending' : 'status-lost-badge';
    const cleanNotes = (obj.notes || '[]').replace(/'/g, "&apos;");

    row.innerHTML = `
        <td><input type="checkbox" class="select-check"></td>
        <td><a href="./order-details.html?id=${obj.id}" class="order-link" title="فتح التفاصيل">#${obj.id}</a></td>
        <td><input type="text" class="excel-input" value="${obj.type || ''}" data-old="${obj.type || ''}" onfocus="this.dataset.old=this.value" onkeyup="updateDateField(this); debouncedSave();" onblur="logEdit('اسم الطلب', this, '${obj.comp}', '${obj.id}')"></td>
        <td><input type="text" class="excel-input readonly-input" value="${obj.date}" readonly style="color:var(--text-muted); font-weight:700;"></td>
        <td><input type="text" class="excel-input" value="${obj.comp || ''}" data-old="${obj.comp || ''}" onfocus="this.dataset.old=this.value" onkeyup="updateDateField(this); debouncedSave();" onblur="logEdit('الشركة', this, '${obj.comp}', '${obj.id}')"></td>
        <td><input type="text" class="excel-input" value="${obj.cr || ''}" data-old="${obj.cr || ''}" onfocus="this.dataset.old=this.value" onkeyup="updateDateField(this); debouncedSave();" onblur="logEdit('السجل', this, '${obj.comp}', '${obj.id}')"></td>
        <td>
            <select class="excel-input status-select ${statusClass}" data-old="${obj.status || 'معلق'}" onchange="handleStatusChange(this, '${obj.id}', '${obj.comp}')">
                <option value="معلق" ${obj.status === 'معلق' ? 'selected' : ''}>معلق</option>
                <option value="مكتمل" ${obj.status === 'مكتمل' ? 'selected' : ''}>مكتمل</option>
                <option value="فقدان" ${obj.status === 'فقدان' ? 'selected' : ''}>فقدان</option>
            </select>
        </td>
        <td style="color:#16a34a; font-weight:800;">${sums.completed.toFixed(2)}</td>
        <td style="color:#ea580c; font-weight:800;">${sums.pending.toFixed(2)}</td>
        <td><div class="notes-preview" data-full-notes='${cleanNotes}' onclick="openNoteModal(this)">${getLastNoteOnly(obj.notes || "[]")}</div></td>
        <td><input type="text" class="excel-input readonly-input last-mod-field" value="${obj.lastModifiedDate || obj.date}" readonly style="color:var(--text-muted);"></td>
        <td><input type="text" class="excel-input" value="${obj.owner || ''}" data-old="${obj.owner || ''}" onfocus="this.dataset.old=this.value" onkeyup="updateDateField(this); debouncedSave()" onblur="logEdit('المالك', this, '${obj.comp}', '${obj.id}')"></td>
    `;
}

// ----------------------------------------------------
// الحفظ الآلي إلى السحابة
// ----------------------------------------------------
function debouncedSave() { 
    clearTimeout(saveTimeout); 
    saveTimeout = setTimeout(() => autoSaveCloud(), 800); 
}

async function autoSaveCloud() {
    const tbody = document.getElementById('salesBody');
    if(!tbody) return;
    const rows = tbody.querySelectorAll('.main-row');
    
    rows.forEach(async (row) => {
        const id = row.id.replace('row-','');
        const cells = row.cells;
        if(!cells || cells.length < 12) return;
        
        const orderData = {
            type: cells[2].querySelector('input').value || '',
            date: cells[3].querySelector('input').value || getTodayFormatted(),
            comp: cells[4].querySelector('input').value || '',
            cr: cells[5].querySelector('input').value || '',
            status: cells[6].querySelector('select').value || 'معلق',
            notes: cells[9].querySelector('.notes-preview').getAttribute('data-full-notes') || '[]',
            lastModifiedDate: cells[10].querySelector('input').value || getTodayFormatted(),
            owner: cells[11].querySelector('input').value || ''
        };

        try {
            await setDoc(doc(db, SALES_COLLECTION, id), orderData, { merge: true });
        } catch (e) {
            console.error("خطأ في تحديث البيانات:", e);
        }
    });
    
    // تحديث المصفوفة المحلية لتعكس الإحصائيات
    const currentRows = Array.from(rows).map(row => ({
        id: row.id.replace('row-',''),
        type: row.cells[2].querySelector('input').value,
        date: row.cells[3].querySelector('input').value,
        comp: row.cells[4].querySelector('input').value,
        cr: row.cells[5].querySelector('input').value,
        status: row.cells[6].querySelector('select').value,
        notes: row.cells[9].querySelector('.notes-preview').getAttribute('data-full-notes') || '[]',
        lastModifiedDate: row.cells[10].querySelector('input').value,
        owner: row.cells[11].querySelector('input').value
    }));
    salesDataCloud = currentRows;
    updateHeaderStats();
}

// ----------------------------------------------------
// تسجيل الأحداث وسجل النشاطات (سحابي)
// ----------------------------------------------------
async function addGeneralLog(action) {
    try {
        const logDocRef = doc(db, "asgate_system_data", LOGS_DOC);
        const docSnap = await getDoc(logDocRef);
        
        let logs = [];
        if (docSnap.exists()) logs = docSnap.data().logs || [];

        const now = new Date();
        const timeStr = String(now.getHours()).padStart(2,'0') + ":" + String(now.getMinutes()).padStart(2,'0');
        const dateStr = getTodayFormatted();
        
        logs.unshift({
            user: "المستخدم",
            day: getArabicDayName(),
            date: dateStr,
            time: timeStr,
            action: action
        });
        
        if (logs.length > 50) logs.pop();
        
        await setDoc(logDocRef, { logs });
        renderGeneralLog(logs);
    } catch(e) {
        console.error("خطأ في تسجيل النشاط:", e);
    }
}

async function renderGeneralLog(providedLogs = null) {
    const cont = document.getElementById('activityLogs');
    if(!cont) return;
    
    let logs = providedLogs;
    if (!logs) {
        try {
            const docSnap = await getDoc(doc(db, "asgate_system_data", LOGS_DOC));
            if (docSnap.exists()) logs = docSnap.data().logs || [];
            else logs = [];
        } catch(e) { logs = []; }
    }

    if(!logs.length) { 
        cont.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8; font-size:11px;">لا يوجد سجل بعد</div>'; 
        return; 
    }
    
    cont.innerHTML = logs.map(l => `
        <div class="log-entry">
            <span class="log-badge-user"><i class="fas fa-user"></i> ${l.user||'المستخدم'}</span>
            <span class="log-divider">|</span>
            <span class="log-timestamp"><i class="far fa-clock"></i> ${l.day||''} ${l.date||''} ${l.time||''}</span>
            <span class="log-divider">|</span>
            <span class="log-action">${l.action||''}</span>
        </div>
    `).join('');
}

function toggleGeneralLogHeight() {
    const section = document.getElementById('generalActivityLogSection');
    const btn = document.getElementById('toggleGeneralLogBtn');
    if(!section) return;
    if (section.classList.contains('expanded')) {
        section.classList.remove('expanded');
        if(btn) btn.innerHTML = '<i class="fas fa-expand-alt"></i>';
    } else {
        section.classList.add('expanded');
        if(btn) btn.innerHTML = '<i class="fas fa-compress-alt"></i>';
    }
}

// ----------------------------------------------------
// معالجة التعديلات في الحقول
// ----------------------------------------------------
function updateDateField(el) {
    const row = el.closest('tr');
    if(!row) return;
    const modField = row.querySelector('.last-mod-field');
    if (modField) modField.value = getTodayFormatted();
}

function logEdit(field, el, comp, id) {
    const oldVal = el.dataset.old || '';
    const newVal = el.value;
    if(oldVal === newVal) return;
    el.dataset.old = newVal;
    addGeneralLog(`تعديل ${field} للطلب #${id} للعميل (${comp}) من [${oldVal || 'فارغ'}] إلى [${newVal}]`);
    debouncedSave();
}

function handleStatusChange(el, id, comp) {
    const val = el.value; 
    const oldVal = el.dataset.old;
    
    el.className = 'excel-input status-select ' + (val==='مكتمل' ? 'status-complete' : val==='معلق' ? 'status-pending' : 'status-lost-badge');
    const row = document.getElementById(`row-${id}`);
    if(row) { 
        if(val==='فقدان') row.classList.add('lost-row'); 
        else row.classList.remove('lost-row'); 
    }
    
    addGeneralLog(`تعديل حالة الطلب #${id} للعميل (${comp}) من [${oldVal}] إلى [${val}]`);
    updateDateField(el);
    el.dataset.old = val;
    debouncedSave();
}

// ----------------------------------------------------
// النافذة المنبثقة: إنشاء طلب مبيعات جديد
// ----------------------------------------------------
function generateCustomOrderId() {
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2); 
    const month = String(now.getMonth() + 1).padStart(2, '0'); 
    const prefix = year + month; 
    
    let maxSequence = 0;
    salesDataCloud.forEach(item => {
        const idStr = String(item.id);
        if (idStr.startsWith(prefix) && idStr.length === 8) {
            const seq = parseInt(idStr.slice(4), 10);
            if (seq > maxSequence) maxSequence = seq;
        }
    });
    return prefix + String(maxSequence + 1).padStart(4, '0');
}

function openOrderModal() {
    const modal = document.getElementById('orderModal');
    if(modal) modal.style.display = 'flex';
    const sf = document.getElementById('mSearchField');
    if(sf) sf.focus();
    if(!customersLoaded) loadCustomersCloud();
}

function closeOrderModal() {
    const modal = document.getElementById('orderModal');
    if(modal) modal.style.display = 'none';
    const fields = ['mSearchField','mType','mComp','mCr'];
    fields.forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    const res = document.getElementById('mResults');
    if(res) { res.style.display='none'; res.innerHTML=''; }
}

function searchCustomerInModal(input) {
    const query = String(input.value || '').toLowerCase().trim();
    const resDiv = document.getElementById('mResults');
    if(!resDiv) return;
    if (!query) { resDiv.style.display='none'; resDiv.innerHTML=''; return; }

    let filtered = cachedCustomersCloud.filter(c => {
        const code = String(c.code || '').toLowerCase();
        const comp = String(c.comp || '').toLowerCase();
        const cr = String(c.cr || c.cr1 || '').toLowerCase();
        const cr2 = String(c.cr2 || '').toLowerCase();
        return code.includes(query) || comp.includes(query) || cr.includes(query) || cr2.includes(query);
    }).slice(0, 15);

    if(filtered.length === 0){
        resDiv.innerHTML = `<div style="color:#94a3b8; cursor:default;"><i class="fas fa-search"></i> لا توجد نتائج</div>`;
        resDiv.style.display='block';
        return;
    }

    resDiv.innerHTML = filtered.map(c => {
        const displayCr = c.cr || c.cr1 || c.cr2 || 'بدون سجل';
        const safeComp = String(c.comp||'').replace(/'/g, "\\'");
        const safeCr = String(displayCr).replace(/'/g, "\\'");
        return `<div onclick="selectCustomer('${safeComp}', '${safeCr}')">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <span><i class="far fa-building"></i> <strong>${c.comp || 'بدون اسم'}</strong> <span style="color:#64748b;">(${c.code||''})</span></span>
                <span style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:10px;">${displayCr}</span>
            </div>
        </div>`;
    }).join('');
    resDiv.style.display = 'block';
}

function selectCustomer(comp, record) {
    document.getElementById('mComp').value = comp;
    document.getElementById('mCr').value = record;
    document.getElementById('mSearchField').value = comp;
    document.getElementById('mResults').style.display = 'none';
}

async function addOrderRow() {
    const comp = document.getElementById('mComp').value.trim();
    const cr = document.getElementById('mCr').value.trim();
    const type = document.getElementById('mType').value.trim();
    
    if (!comp) {
        Swal.fire({icon: 'warning', title: 'تنبيه', text: 'يرجى اختيار شركة من نتائج البحث', confirmButtonColor: '#3b82f6'});
        return;
    }
    
    const newId = generateCustomOrderId();
    const newOrder = {
        type: type || 'طلب جديد',
        date: getTodayFormatted(),
        comp: comp,
        cr: cr,
        status: "معلق",
        notes: "[]",
        lastModifiedDate: getTodayFormatted(),
        owner: "المستخدم"
    };

    try {
        await setDoc(doc(db, SALES_COLLECTION, newId), newOrder);
        addGeneralLog(`إنشاء طلب مبيعات جديد برقم #${newId} للعميل ( ${comp} )`);
        closeOrderModal();
        Swal.fire({icon: 'success', title: 'تمت الإضافة بنجاح', showConfirmButton: false, timer: 1500});
        loadSalesFromCloud();
    } catch(e) {
        console.error("خطأ في إضافة الطلب:", e);
        Swal.fire({icon: 'error', title: 'خطأ', text: 'حدث خطأ أثناء الحفظ في السحابة'});
    }
}

// ----------------------------------------------------
// النافذة المنبثقة: الملاحظات
// ----------------------------------------------------
function openNoteModal(el) {
    currentActivePreview = el;
    pendingAttachment = null;
    document.getElementById('filePreviewContainer').style.display = 'none';
    
    const modal = document.getElementById('noteModal');
    if(!modal) return;
    
    let arr = [];
    try { arr = JSON.parse(el.getAttribute('data-full-notes') || "[]"); } catch(e){}
    
    const historyLog = document.getElementById('historyLog');
    if(historyLog){
        historyLog.innerHTML = arr.map(msg=>{
            const attachHtml = msg.attachment ? `<br><a href="${msg.attachment.data}" download="${msg.attachment.name}" style="color:var(--accent-blue); font-size:10.5px; font-weight:800; text-decoration:none;"><i class="fas fa-download"></i> ${msg.attachment.name}</a>` : '';
            return `<div class="chat-msg-block"><div class="chat-msg-header"><span><i class="fas fa-user-circle"></i> ${msg.user||'المستخدم'}</span><span style="color:#94a3b8;"><i class="fas fa-clock"></i> ${msg.date} ${msg.time||''}</span></div><div class="chat-msg-text">${msg.text||''}${attachHtml}</div></div>`;
        }).join('') || '<div style="color:#64748b; text-align:center; font-size:10px; padding:20px; font-weight:700;">لا توجد ملاحظات سابقة</div>';
    }
    
    modal.style.display = "flex";
    const ta = document.getElementById('modalTextArea');
    if(ta){ ta.value=""; ta.focus(); }
}

function closeNote() {
    const m = document.getElementById('noteModal');
    if(m) m.style.display = "none";
    pendingAttachment = null;
    const fp = document.getElementById('filePreviewContainer');
    if(fp) fp.style.display='none';
}

function handleFileSelect(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            pendingAttachment = { name: file.name, data: e.target.result };
            document.getElementById('fileNameDisplay').innerText = file.name;
            document.getElementById('filePreviewContainer').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

function removeAttachment() {
    pendingAttachment = null;
    document.getElementById('modalFileAttachment').value = '';
    document.getElementById('filePreviewContainer').style.display = 'none';
}

function saveNote() {
    const ta = document.getElementById('modalTextArea');
    const txt = ta ? ta.value.trim() : '';
    
    if ((txt || pendingAttachment) && currentActivePreview) {
        let arr = [];
        try { arr = JSON.parse(currentActivePreview.getAttribute('data-full-notes') || "[]"); } catch(e){}
        
        const newNote = { user: "المستخدم", date: getTodayFormatted(), time: getTimeFormatted(), text: txt };
        if(pendingAttachment) { newNote.attachment = pendingAttachment; }
        
        arr.push(newNote);
        currentActivePreview.setAttribute('data-full-notes', JSON.stringify(arr));
        currentActivePreview.innerText = txt ? txt : "مرفق";
        
        const row = currentActivePreview.closest('tr');
        if(row){
            const comp = row.cells[4].querySelector('input').value;
            addGeneralLog(`إضافة ملاحظة على الطلب للعميل ( ${comp} )`);
            updateDateField(currentActivePreview);
        }
        debouncedSave();
    }
    closeNote();
}

function getLastNoteOnly(jsonStr) {
    try { 
        const arr = JSON.parse(jsonStr); 
        if(arr.length>0){ const last=arr[arr.length-1]; return last.text ? last.text : "مرفق"; } 
        return "أضف ملاحظة..."; 
    } catch(e){ return "أضف ملاحظة..."; }
}

// ----------------------------------------------------
// أدوات الجدول والفلاتر
// ----------------------------------------------------
function filterSalesTable() {
    const q = (document.getElementById('globalSearch').value||'').toLowerCase().trim();
    const rows = document.querySelectorAll('#salesBody .main-row');
    rows.forEach(r => {
        const txt = r.innerText.toLowerCase();
        r.style.display = txt.includes(q) ? '' : 'none';
    });
}

function toggleDropdown(event, el) {
    event.stopPropagation();
    const menu = el.nextElementSibling;
    document.querySelectorAll('.dropdown-menu').forEach(m => { if(m !== menu) m.classList.remove('show'); });
    if(menu) menu.classList.toggle('show');
}

document.addEventListener('click', (e) => {
    if (!e.target.matches('.btn-bulk-trigger') && !e.target.matches('.fa-chevron-down')) {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
    }
});

function toggleAllCheckboxes(source) {
    const checkboxes = document.querySelectorAll('.select-check');
    checkboxes.forEach(cb => cb.checked = source.checked);
}

function handleBulkAction(action) {
    const selected = document.querySelectorAll('.select-check:checked');
    if(!selected.length && action!=='') {
        Swal.fire({icon: 'info', text: 'يرجى تحديد صف واحد على الأقل', confirmButtonColor: '#3b82f6'});
        return;
    }
    
    if(action==='حذف'){
        Swal.fire({ title:'هل أنت متأكد؟', text:'سيتم حذف الطلبات المحددة نهائياً من السحابة!', icon:'warning', showCancelButton:true, confirmButtonColor: '#ef4444', cancelButtonColor: '#94a3b8', confirmButtonText:'نعم، احذف', cancelButtonText:'إلغاء' }).then(async (res)=>{
            if(res.isConfirmed){
                for (let cb of selected) {
                    const row = cb.closest('tr');
                    const id = row.id.replace('row-', '');
                    const comp = row.cells[4].querySelector('input').value;
                    
                    try {
                        // مسح من فايربيس (يتطلب إضافة دالة deleteDoc إن أردتها أو تفريغ الـ doc، حالياً سيتم تفريغ واجهة المستخدم وسيتم تحديثها باللود)
                        // لتبسيط الأمر سنقوم بحذف المستند
                        const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
                        await deleteDoc(doc(db, SALES_COLLECTION, id));
                        addGeneralLog(`تم حذف الطلب #${id} للعميل ( ${comp} )`);
                    } catch(e) { console.error("Error deleting doc", e); }
                }
                Swal.fire('تم','تم الحذف بنجاح','success');
                loadSalesFromCloud(); // إعادة التحميل لضمان التزامن
            }
        });
    } else {
        Swal.fire('معلومة', `إجراء ${action} قيد التطوير.`, 'info');
    }
}

// ----------------------------------------------------
// تعيين الدوال على Window لتعمل داخل HTML (لأن الملف Module)
// ----------------------------------------------------
window.initPage = initPage;
window.toggleStatsVisibility = toggleStatsVisibility;
window.toggleGeneralLogHeight = toggleGeneralLogHeight;
window.filterSalesTable = filterSalesTable;
window.toggleDropdown = toggleDropdown;
window.toggleAllCheckboxes = toggleAllCheckboxes;
window.handleBulkAction = handleBulkAction;
window.openOrderModal = openOrderModal;
window.closeOrderModal = closeOrderModal;
window.searchCustomerInModal = searchCustomerInModal;
window.selectCustomer = selectCustomer;
window.addOrderRow = addOrderRow;
window.openNoteModal = openNoteModal;
window.closeNote = closeNote;
window.saveNote = saveNote;
window.handleFileSelect = handleFileSelect;
window.removeAttachment = removeAttachment;
window.debouncedSave = debouncedSave;
window.updateDateField = updateDateField;
window.logEdit = logEdit;
window.handleStatusChange = handleStatusChange;