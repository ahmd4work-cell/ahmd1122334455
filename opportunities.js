// ==========================================
// إعدادات واستيراد Firebase 
// ==========================================
import { db } from './firebase-config.js';
import { collection, onSnapshot, setDoc, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let currentActiveNoteRowId = null;
let searchTimeout;
const openSubTables = new Set();
const LOGS_KEY = 'asgate_opportunities_logs_v1';

// ==========================================
// الاستماع اللحظي للفرص 
// ==========================================
function listenToOpportunities() {
    const oppsRef = collection(db, "opportunities");
    onSnapshot(oppsRef, (snapshot) => {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        
        let activeId = null;
        let activeClass = null;
        let selectionStart = 0;
        if (document.activeElement && document.activeElement.tagName === 'INPUT') {
            const tr = document.activeElement.closest('tr');
            if (tr) {
                activeId = tr.id;
                activeClass = document.activeElement.className;
                try { selectionStart = document.activeElement.selectionStart; } catch(e){}
            }
        }

        tbody.innerHTML = '';
        
        if (!snapshot.empty) {
            const opps = [];
            snapshot.forEach((docSnapshot) => {
                const data = docSnapshot.data();
                data.id = docSnapshot.id;
                opps.push(data);
            });

            // ترتيب حسب تاريخ الفرصة تنازلياً
            opps.sort((a, b) => {
                const dateA = a.oppDate || a.visitDate || '';
                const dateB = b.oppDate || b.visitDate || '';
                return dateB.localeCompare(dateA);
            });

            opps.forEach(data => renderRow(data));
        }
        
        updateStats();
        renderActivityLog();

        // استعادة التركيز
        if (activeId && activeClass) {
            const activeRow = document.getElementById(activeId);
            if (activeRow) {
                const inputToFocus = activeRow.querySelector(`[class="${activeClass}"]`);
                if (inputToFocus) {
                    inputToFocus.focus();
                    try { inputToFocus.setSelectionRange(selectionStart, selectionStart); } catch(e){}
                }
            }
        }
    });
}

function getTodayFormatted() { return new Date().toISOString().split('T')[0]; }

function getLastNoteOnlyFromJSON(jsonStr) {
    try {
        let arr = JSON.parse(jsonStr || "[]");
        if (Array.isArray(arr) && arr.length > 0) return arr[arr.length - 1].text;
    } catch(e) {}
    return "إضافة ملاحظة...";
}

// ==========================================
// بناء وتصيير الصفوف والتفاصيل الفرعية
// ==========================================
function renderRow(v = {}) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    
    const rowId = v.id || ('row-' + Date.now());
    const mainRow = document.createElement('tr');
    mainRow.className = 'main-row fade-in';
    mainRow.id = rowId;
    
    const subRow = document.createElement('tr');
    subRow.className = 'sub-table-row';
    subRow.id = 'sub-' + rowId;

    const isSubOpen = openSubTables.has(rowId);
    subRow.style.display = isSubOpen ? 'table-row' : 'none';
    const arrowIconClass = isSubOpen ? 'fas fa-caret-down' : 'fas fa-caret-left';

    const oppDate = v.oppDate || v.visitDate || getTodayFormatted(); 
    const notesJson = v.notes || "[]";
    const lastNoteText = getLastNoteOnlyFromJSON(notesJson);

    let initialWaNum = v.mob ? v.mob.replace(/[^0-9]/g, '') : '';
    if (initialWaNum.startsWith('0')) initialWaNum = '966' + initialWaNum.substring(1);
    else if (initialWaNum.length > 0 && !initialWaNum.startsWith('966')) initialWaNum = '966' + initialWaNum;
    const waOpacity = initialWaNum.length >= 9 ? '1' : '0.5';
    const waHref = initialWaNum.length >= 9 ? `https://wa.me/${initialWaNum}` : '#';

    mainRow.innerHTML = `
        <td class="col-select">
            <input type="checkbox" class="select-check row-select">
            <span class="toggle-arrow" onclick="toggleSubTable('${rowId}')"><i class="${arrowIconClass}"></i></span>
        </td>
        <td class="col-company"><input type="text" class="excel-input comp-input" value="${v.comp || ''}" data-old="${v.comp || ''}"></td>
        <td class="col-address"><input type="text" class="excel-input address-input" value="${v.address || ''}" data-old="${v.address || ''}"></td>
        <td class="col-manager"><input type="text" class="excel-input mgr-input" value="${v.mgr || ''}" data-old="${v.mgr || ''}"></td>
        <td class="col-mobile">
            <div class="phone-cell-container">
                <input type="text" class="excel-input mob-input" value="${v.mob || ''}" oninput="this.value = this.value.replace(/[^0-9]/g, ''); updateWhatsAppLink(this)">
                <a href="${waHref}" target="_blank" class="whatsapp-icon-btn" style="opacity:${waOpacity};"><i class="fa-brands fa-whatsapp"></i></a>
            </div>
        </td>
        <td class="col-email"><input type="text" class="excel-input email-input" value="${v.email || ''}"></td>
        <td class="col-record"><input type="text" class="excel-input record-input" value="${v.record || ''}" oninput="this.value = this.value.replace(/[^0-9]/g, '');"></td>
        <td class="col-date">
            <input type="date" class="excel-input opp-date-val" value="${oppDate}" readonly style="pointer-events: none; color: #475569; background-color: transparent;">
        </td>
        <td class="col-service"><input type="text" class="excel-input service-input" value="${v.curServ || ''}"></td>
        <td class="col-val"><input type="number" class="excel-input opp-val readonly-input" value="${v.oppValue || ''}" readonly style="color:var(--accent-blue); font-weight:800;"></td>
        <td class="col-notes">
            <div class="notes-preview" onclick="openNotesModal('${rowId}')" data-full-notes='${notesJson.replace(/'/g, "&apos;")}' id="preview-${rowId}">
                ${lastNoteText}
            </div>
        </td>
        <td class="col-status">
            <select class="excel-input status-select ${getStatusClass(v.status)}" onchange="handleStatusChange(this, '${rowId}')">
                <option value="تأهيل لفرصة" ${v.status === 'تأهيل لفرصة' || !v.status ? 'selected' : ''}>تأهيل لفرصة</option>
                <option value="متابعة" ${v.status === 'متابعة' ? 'selected' : ''}>متابعة</option>
                <option value="عرض سعر" ${v.status === 'عرض سعر' ? 'selected' : ''}>عرض سعر</option>
                <option value="مهتم" ${v.status === 'مهتم' ? 'selected' : ''}>مهتم</option>
                <option value="رابح" ${v.status === 'رابح' ? 'selected' : ''}>رابح</option>
                <option value="فقدان" ${v.status === 'فقدان' ? 'selected' : ''}>فقدان</option>
            </select>
        </td>
        <td class="col-edit">
            <input type="date" class="excel-input exp-date-input" value="${v.expDate || ''}">
            <input type="hidden" class="edit-date-val" value="${v.editDate || ''}">
        </td>
        <td class="col-owner"><input type="text" class="excel-input owner-input" value="${v.owner || ''}"></td>
    `;

    subRow.innerHTML = `
        <td colspan="14" style="padding:15px 10px; background:#f8fafc; box-shadow: inset 0 2px 4px rgba(0,0,0,.02);">
            <div style="display: flex; gap: 15px; align-items: stretch;">
                <div class="sub-table-container" style="flex: 0 0 60%; padding: 0;">
                    <table class="inner-table" style="width: 100%;">
                        <thead>
                            <tr>
                                <th>المنتج</th><th>التفاصيل</th><th>العدد</th><th>الاشتراك</th><th>الإجمالي</th>
                                <th style="width:50px"><button class="header-plus-btn" onclick="addProductRow('${rowId}')" title="إضافة منتج"><i class="fas fa-plus"></i></button></th>
                            </tr>
                        </thead>
                        <tbody class="product-body"></tbody>
                    </table>
                </div>
            </div>
        </td>
    `;

    tbody.appendChild(mainRow);
    tbody.appendChild(subRow);

    if (v.products && v.products.length > 0) v.products.forEach(p => addProductRow(rowId, p));
    else addProductRow(rowId);

    // إضافة مستمعات التغيير بدلاً من onkeyup لتوفير استهلاك البيانات وعدم التضارب
    mainRow.querySelectorAll('input, select').forEach(input => {
        if(!input.classList.contains('status-select') && !input.classList.contains('select-check')) {
            input.addEventListener('change', () => saveSingleRow(rowId));
        }
    });
}

function updateWhatsAppLink(input) {
    let val = input.value.replace(/[^0-9]/g, '');
    let waNum = val;
    if (waNum.startsWith('0')) waNum = '966' + waNum.substring(1);
    else if (waNum.length > 0 && !waNum.startsWith('966')) waNum = '966' + waNum;
    
    const link = input.closest('.phone-cell-container').querySelector('.whatsapp-icon-btn');
    if (link) {
        if (waNum.length >= 9) {
            link.href = `https://wa.me/${waNum}`;
            link.style.opacity = '1'; link.style.pointerEvents = 'auto';
        } else {
            link.href = '#';
            link.style.opacity = '0.5'; link.style.pointerEvents = 'none';
        }
    }
}

function toggleSubTable(rowId) {
    const sub = document.getElementById('sub-' + rowId);
    const arrowIcon = document.querySelector(`#${rowId} .toggle-arrow i`);
    if (!sub) return;
    if (sub.style.display === 'table-row') {
        sub.style.display = 'none'; openSubTables.delete(rowId);
        if (arrowIcon) arrowIcon.className = 'fas fa-caret-left';
    } else {
        sub.style.display = 'table-row'; openSubTables.add(rowId);
        if (arrowIcon) arrowIcon.className = 'fas fa-caret-down';
    }
}

function addProductRow(rowId, data = {}) {
    const subRow = document.getElementById('sub-' + rowId);
    if (!subRow) return;
    const tbody = subRow.querySelector('.product-body');
    const row = tbody.insertRow();
    row.innerHTML = `
        <td><select onchange="calculateMainVisitValue('${rowId}')"><option value="">-</option><option value="جوال" ${data.type === 'جوال' ? 'selected' : ''}>جوال</option><option value="بيانات" ${data.type === 'بيانات' ? 'selected' : ''}>بيانات</option><option value="هاتف" ${data.type === 'هاتف' ? 'selected' : ''}>هاتف</option><option value="فايبر نت" ${data.type === 'فايبر نت' ? 'selected' : ''}>فايبر نت</option><option value="DIA" ${data.type === 'DIA' ? 'selected' : ''}>DIA</option><option value="IPVPN" ${data.type === 'IPVPN' ? 'selected' : ''}>IPVPN</option><option value="SIP" ${data.type === 'SIP' ? 'selected' : ''}>SIP</option></select></td>
        <td><input type="text" value="${data.desc || ''}" onchange="saveSingleRow('${rowId}')"></td>
        <td><input type="number" class="prod-qty" min="0" value="${data.qty || ''}" oninput="calculateMainVisitValue('${rowId}')"></td>
        <td><input type="number" class="prod-sub" min="0" value="${data.sub || ''}" oninput="calculateMainVisitValue('${rowId}')"></td>
        <td><input type="number" class="prod-total readonly-input" value="${data.total || ''}" readonly></td>
        <td><div style="display:flex; justify-content:center;"><button class="sub-action-btn" title="حذف" onclick="removeProductRow(this, '${rowId}')"><i class="fas fa-trash-alt" style="font-size:10px;"></i></button></div></td>
    `;
}

function removeProductRow(btn, rowId) {
    const tbody = btn.closest('tbody');
    if (tbody.rows.length > 1) {
        btn.closest('tr').remove();
        calculateMainVisitValue(rowId);
    }
}

function calculateMainVisitValue(rowId) {
    const subRow = document.getElementById('sub-' + rowId);
    if (!subRow) return;
    let grandTotal = 0;
    subRow.querySelectorAll('.product-body tr').forEach(pRow => {
        const qty = parseFloat(pRow.querySelector('.prod-qty')?.value) || 0;
        const sub = parseFloat(pRow.querySelector('.prod-sub')?.value) || 0;
        const totalInput = pRow.querySelector('.prod-total');
        const rowTotal = qty * sub;
        if (totalInput) totalInput.value = rowTotal > 0 ? rowTotal : '';
        grandTotal += rowTotal;
    });
    const mainRow = document.getElementById(rowId);
    if (mainRow) {
        const oppVal = mainRow.querySelector('.opp-val');
        if (oppVal) oppVal.value = grandTotal > 0 ? grandTotal : '0';
    }
    saveSingleRow(rowId);
}

function getProductsData(rowId) {
    const subRow = document.getElementById('sub-' + rowId);
    if (!subRow) return [];
    const products = [];
    subRow.querySelectorAll('.product-body tr').forEach(pRow => {
        const inputs = pRow.querySelectorAll('input, select');
        if (inputs.length >= 5) {
            products.push({ type: inputs[0].value || '', desc: inputs[1].value || '', qty: inputs[2].value || '', sub: inputs[3].value || '', total: inputs[4].value || '' });
        }
    });
    return products;
}

async function saveSingleRow(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;

    const today = getTodayFormatted();
    const editDateInput = row.querySelector('.edit-date-val');
    if (editDateInput && editDateInput.value !== today) editDateInput.value = today;

    const oppData = {
        comp: row.querySelector('.comp-input').value,
        address: row.querySelector('.address-input').value,
        mgr: row.querySelector('.mgr-input').value,
        mob: row.querySelector('.mob-input').value,
        email: row.querySelector('.email-input').value,
        record: row.querySelector('.record-input').value,
        oppDate: row.querySelector('.opp-date-val').value,
        curServ: row.querySelector('.service-input').value,
        oppValue: row.querySelector('.opp-val').value,
        notes: row.querySelector('.notes-preview').getAttribute('data-full-notes') || '[]',
        status: row.querySelector('.status-select').value,
        expDate: row.querySelector('.exp-date-input').value,
        editDate: today,
        owner: row.querySelector('.owner-input').value,
        products: getProductsData(rowId)
    };

    try {
        await setDoc(doc(db, "opportunities", rowId), oppData, { merge: true });
        updateStats();
    } catch (e) { console.error("خطأ بالحفظ السحابي:", e); }
}

async function handleStatusChange(selectElem, rowId) {
    const newStatus = selectElem.value;
    selectElem.className = `excel-input status-select ${getStatusClass(newStatus)}`;
    const row = document.getElementById(rowId);
    let compName = row.querySelector('.comp-input').value || 'بدون اسم';

    saveSingleRow(rowId);
    addToActivityLog('الحالة', '', newStatus, compName);
}

function getStatusClass(status) {
    if (status === 'عرض سعر' || status === 'تأهيل لفرصة' || status === 'مهتم') return 'status-yellow';
    if (status === 'متابعة') return 'status-blue';
    if (status === 'رابح') return 'status-green';
    if (status === 'فقدان') return 'status-red';
    return '';
}

function openNotesModal(rowId) {
    currentActiveNoteRowId = rowId;
    const row = document.getElementById(rowId);
    if (!row) return;

    const preview = row.querySelector('.notes-preview');
    let arr = []; 
    try { arr = JSON.parse(preview.getAttribute('data-full-notes') || "[]"); } catch(e) {}
    
    const historyLog = document.getElementById('historyLog');
    if (historyLog) {
        historyLog.innerHTML = arr.map(msg => `
            <div class="log-entry" style="display: block; line-height: 1.6;">
                <div style="margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                    <span class="log-badge-user"><i class="fas fa-user-circle"></i> ${msg.user || "المستخدم"}</span>
                    <span class="log-timestamp"><i class="fas fa-clock"></i> ${msg.date} ${msg.time}</span>
                </div>
                <div class="log-action" style="color: #0f172a; font-size: 11px; font-weight: 700;">${msg.text}</div>
            </div>
        `).join('') || '<div style="color:#64748b; text-align:center; padding:20px; font-weight:700;">لا توجد ملاحظات سابقة</div>';
    }
    document.getElementById('noteModal').style.display = 'flex';
    document.getElementById('modalTextArea').value = "";
    document.getElementById('modalTextArea').focus();
}

function closeNote() { document.getElementById('noteModal').style.display = 'none'; currentActiveNoteRowId = null; }
function saveNote() {
    if (!currentActiveNoteRowId) return;
    const row = document.getElementById(currentActiveNoteRowId);
    const txt = document.getElementById('modalTextArea').value.trim();
    if (row && txt) {
        const preview = row.querySelector('.notes-preview');
        let arr = []; try { arr = JSON.parse(preview.getAttribute('data-full-notes') || "[]"); } catch(e) {}
        
        let username = row.querySelector('.owner-input')?.value.trim() || "المستخدم";
        const today = new Date();
        arr.push({ user: username, date: today.toISOString().split('T')[0], time: today.toLocaleTimeString('ar-SA'), text: txt });
        
        preview.setAttribute('data-full-notes', JSON.stringify(arr));
        preview.innerText = txt;
        
        saveSingleRow(currentActiveNoteRowId);
        addToActivityLog('الملاحظات', 'تمت إضافة ملاحظة جديدة', '', row.querySelector('.comp-input').value);
    }
    closeNote();
}

function addToActivityLog(actionField, oldVal, newVal, compName) {
    if (oldVal === newVal && actionField !== 'الحالة' && actionField !== 'الملاحظات') return;
    let logs = []; try { logs = JSON.parse(localStorage.getItem(LOGS_KEY) || "[]"); } catch(e) {}
    
    let message = oldVal && newVal ? `تعديل ${actionField} لشركة (${compName}) إلى "${newVal}"` : `تحديث ${actionField} لشركة (${compName})`;
    logs.unshift({ date: getTodayFormatted(), time: new Date().toLocaleTimeString('ar-SA'), text: message });
    if (logs.length > 50) logs.pop(); 
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
    renderActivityLog();
}

function renderActivityLog() {
    const list = document.getElementById('activityList');
    if (!list) return;
    let logs = []; try { logs = JSON.parse(localStorage.getItem(LOGS_KEY) || "[]"); } catch(e) {}
    list.innerHTML = logs.map(l => `
        <div class="log-entry" style="padding: 8px 10px; border-bottom: 1px dashed #e2e8f0; font-size: 11.5px; display: flex; gap: 8px;">
            <i class="fas fa-check-circle" style="color: var(--accent-blue);"></i><span class="log-timestamp">[${l.time}]</span><span class="log-action">${l.text}</span>
        </div>
    `).join('') || '<div style="padding:10px; text-align:center; color:#94a3b8;">لا نشاط مسجل</div>';
}

function updateStats() {
    const rows = document.querySelectorAll('#tableBody .main-row');
    let totalCount = rows.length, todayCount = 0, monthCount = 0, totalVal = 0, monthVal = 0;
    const currentMonthStr = getTodayFormatted().substring(0, 7);

    rows.forEach(row => {
        const dateVal = row.querySelector('.opp-date-val')?.value || '';
        const val = parseFloat(row.querySelector('.opp-val')?.value) || 0;
        
        totalVal += val;
        if (dateVal.startsWith(currentMonthStr)) monthVal += val;
        if (dateVal === getTodayFormatted()) todayCount++;
        if (dateVal.startsWith(currentMonthStr)) monthCount++;
    });

    if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = totalCount;
    if (document.getElementById('stat-month')) document.getElementById('stat-month').innerText = monthCount;
    if (document.getElementById('stat-today')) document.getElementById('stat-today').innerText = todayCount;
    if (document.getElementById('stat-value-total')) document.getElementById('stat-value-total').innerText = totalVal.toLocaleString('en-US') + ' ر.س';
    if (document.getElementById('stat-value-month')) document.getElementById('stat-value-month').innerText = monthVal.toLocaleString('en-US') + ' ر.س';
}

function toggleAllCheckboxes(master) { document.querySelectorAll('.row-select').forEach(cb => cb.checked = master.checked); }
function toggleDropdown(event, btn) { event.stopPropagation(); btn.nextElementSibling.classList.toggle('show'); }
window.onclick = function() { document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.remove('show')); };
function toggleLogExpansion() { document.getElementById('activityLogSection')?.classList.toggle('expanded'); }

async function handleBulkAction(action) {
    const selectedRows = document.querySelectorAll('.row-select:checked');
    if (selectedRows.length === 0) return Swal.fire('تنبيه', 'يرجى تحديد عنصر', 'warning');
    if (action === 'حذف') {
        const result = await Swal.fire({ title: 'هل أنت متأكد؟', icon: 'warning', showCancelButton: true, confirmButtonText: 'نعم', cancelButtonText: 'إلغاء' });
        if (result.isConfirmed) {
            for (let cb of selectedRows) await deleteDoc(doc(db, "opportunities", cb.closest('tr').id));
            Swal.fire('نجاح', 'تم الحذف', 'success');
        }
    }
}

function debouncedFilterTable() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const q = document.getElementById('searchInput').value.toLowerCase().trim();
        document.querySelectorAll('.main-row').forEach(row => {
            const text = Array.from(row.cells).map(c => c.querySelector('input, select')?.value.toLowerCase() || '').join(' ');
            const subRow = document.getElementById('sub-' + row.id);
            row.style.display = text.includes(q) ? 'table-row' : 'none';
            if (subRow && !text.includes(q)) subRow.style.display = 'none';
        });
    }, 300);
}

Object.assign(window, { toggleSubTable, addProductRow, removeProductRow, calculateMainVisitValue, openNotesModal, closeNote, saveNote, handleStatusChange, toggleAllCheckboxes, toggleDropdown, handleBulkAction, toggleLogExpansion, debouncedFilterTable, updateWhatsAppLink });

document.addEventListener('DOMContentLoaded', listenToOpportunities);