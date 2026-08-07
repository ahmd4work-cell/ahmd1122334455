// ==========================================
// 1. إعدادات سحابة Firebase Cloud Firestore
// ==========================================
import { db } from './firebase-config.js';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let currentActiveNoteRowId = null;
let searchTimeout;
const openSubTables = new Set();

// ==========================================
// 2. الاستماع اللحظي وبناء الفواصل الشهرية
// ==========================================
function listenToVisits() {
    const visitsRef = collection(db, "visits");
    onSnapshot(visitsRef, (snapshot) => {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        
        if (document.activeElement && document.activeElement.tagName === 'INPUT') {
            return;
        }

        tbody.innerHTML = '';
        
        if (!snapshot.empty) {
            const visits = [];
            snapshot.forEach((docSnapshot) => {
                const data = docSnapshot.data();
                data.id = docSnapshot.id;
                visits.push(data);
            });

            visits.sort((a, b) => {
                const dateA = a.visitDate || '';
                const dateB = b.visitDate || '';
                return dateB.localeCompare(dateA); 
            });

            let currentMonth = null;

            visits.forEach((data) => {
                const visitMonthStr = formatMonthYear(data.visitDate);
                
                if (visitMonthStr !== currentMonth) {
                    currentMonth = visitMonthStr;
                    renderMonthSeparator(currentMonth);
                }
                renderRow(data, false);
            });
        }
        updateStats();
    }, (error) => {
        console.error("خطأ في استقبال البيانات السحابية:", error);
    });
}

function formatMonthYear(dateString) {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length < 2) return dateString;
    const year = parts[0];
    const monthIndex = parseInt(parts[1], 10) - 1;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[monthIndex]}-${year}`;
}

function renderMonthSeparator(monthText) {
    const tbody = document.getElementById('tableBody');
    const sepRow = document.createElement('tr');
    sepRow.className = 'month-separator';
    sepRow.innerHTML = `
        <td colspan="14" style="padding: 25px 15px 10px 0; border: none; background: transparent; text-align: right;">
            <div style="display: inline-block; background-color: #3b82f6; color: white; padding: 6px 22px; border-radius: 20px; font-weight: 700; font-size: 13.5px; box-shadow: 0 2px 4px rgba(59,130,246,0.3);">
                <i class="fas fa-calendar-alt" style="margin-left: 6px;"></i> ${monthText}
            </div>
        </td>
    `;
    tbody.appendChild(sepRow);
}

// ==========================================
// 3. بناء وتصيير الصفوف والتفاصيل الفرعية
// ==========================================
function renderRow(v = {}, animate = true) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    const rowId = v.id || 'visit_' + Date.now();
    const today = getTodayDate();
    const visitDate = v.visitDate || today;

    const mainRow = document.createElement('tr');
    mainRow.className = 'main-row';
    mainRow.id = rowId;
    if (animate) mainRow.classList.add('fade-in');

    const subRow = document.createElement('tr');
    subRow.className = 'sub-table-row';
    subRow.id = 'sub-' + rowId;

    const isSubOpen = openSubTables.has(rowId);
    subRow.style.display = isSubOpen ? 'table-row' : 'none';
    const arrowIconClass = isSubOpen ? 'fas fa-caret-down' : 'fas fa-caret-left';

    // معالجة رابط الواتساب الأولي
    let initialWaNum = v.mob ? v.mob.replace(/[^0-9]/g, '') : '';
    if (initialWaNum.startsWith('0')) {
        initialWaNum = '966' + initialWaNum.substring(1);
    } else if (initialWaNum.length > 0 && !initialWaNum.startsWith('966')) {
        initialWaNum = '966' + initialWaNum;
    }
    const waOpacity = initialWaNum.length >= 9 ? '1' : '0.5';
    const waPointer = initialWaNum.length >= 9 ? 'auto' : 'none';
    const waHref = initialWaNum.length >= 9 ? `https://wa.me/${initialWaNum}` : '#';

    mainRow.innerHTML = `
        <td class="col-select">
            <input type="checkbox" class="select-check row-select">
            <span class="toggle-arrow" onclick="toggleSubTable('${rowId}')"><i class="${arrowIconClass}"></i></span>
        </td>
        <td class="col-company"><input type="text" class="excel-input comp-input" value="${v.comp || ''}"></td>
        <td class="col-address"><input type="text" class="excel-input address-input" value="${v.address || ''}"></td>
        <td class="col-manager"><input type="text" class="excel-input mgr-input" value="${v.mgr || ''}"></td>
        <td class="col-mobile">
            <div class="phone-cell-container">
                <input type="text" class="excel-input mob-input" value="${v.mob || ''}" oninput="this.value = this.value.replace(/[^0-9]/g, ''); updateWhatsAppLink(this)">
                <a href="${waHref}" target="_blank" class="whatsapp-icon-btn" style="opacity:${waOpacity}; pointer-events:${waPointer};"><i class="fab fa-whatsapp"></i></a>
            </div>
        </td>
        <td class="col-email"><input type="text" class="excel-input email-input" value="${v.email || ''}"></td>
        <td class="col-record">
            <input type="text" class="excel-input record-input" value="${v.record || ''}" oninput="this.value = this.value.replace(/[^0-9]/g, '');">
        </td>
        <td class="col-date">
            <input type="date" class="excel-input visit-date-val" value="${visitDate}" readonly style="pointer-events: none; color: #475569; background-color: transparent;">
        </td>
        <td class="col-service"><input type="text" class="excel-input service-input" value="${v.curServ || ''}"></td>
        <td class="col-val"><input type="number" class="excel-input opp-val readonly-input" value="${v.oppValue || ''}" readonly style="color:var(--accent-blue); font-weight:800;"></td>
        <td class="col-notes">
            <div class="notes-preview" onclick="openNotesModal('${rowId}')" data-full-notes="${v.notes || ''}">
                ${v.notes ? v.notes : 'إضافة ملاحظة...'}
            </div>
        </td>
        <td class="col-status">
            <select class="excel-input status-select ${getStatusClass(v.status)}" onchange="handleStatusChange(this, '${rowId}')">
                <option value="جديدة" ${v.status === 'جديدة' ? 'selected' : ''}>جديدة</option>
                <option value="تأهيل لفرصة" ${v.status === 'تأهيل لفرصة' ? 'selected' : ''}>تأهيل لفرصة</option>
                <option value="متابعة" ${v.status === 'متابعة' ? 'selected' : ''}>متابعة</option>
                <option value="عرض سعر" ${v.status === 'عرض سعر' ? 'selected' : ''}>عرض سعر</option>
                <option value="غير مهتم" ${v.status === 'غير مهتم' ? 'selected' : ''}>غير مهتم</option>
                <option value="فقدان" ${v.status === 'فقدان' ? 'selected' : ''}>فقدان</option>
            </select>
        </td>
        <td class="col-edit">
            <input type="date" class="excel-input edit-date-val" value="${v.editDate || visitDate}" readonly style="pointer-events: none; color: #475569; background-color: transparent;">
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

    if (v.products && v.products.length > 0) {
        v.products.forEach(p => addProductRow(rowId, p));
    } else {
        addProductRow(rowId);
    }

    mainRow.querySelectorAll('input, select').forEach(input => {
        // نستثني حقل الجوال والحالة والسجل لتجنب تكرار الحفظ المعقد، حيث يتم حفظها عبر دوال أخرى أو onchange
        if(!input.classList.contains('status-select')) {
            input.addEventListener('change', () => saveSingleRow(rowId));
        }
    });
}

// دالة تحديث رابط الواتساب ديناميكياً
function updateWhatsAppLink(input) {
    let val = input.value.replace(/[^0-9]/g, '');
    let waNum = val;
    if (waNum.startsWith('0')) {
        waNum = '966' + waNum.substring(1);
    } else if (waNum.length > 0 && !waNum.startsWith('966')) {
        waNum = '966' + waNum;
    }
    
    const container = input.closest('.phone-cell-container');
    const link = container.querySelector('.whatsapp-icon-btn');
    if (link) {
        if (waNum.length >= 9) {
            link.href = `https://wa.me/${waNum}`;
            link.style.opacity = '1';
            link.style.pointerEvents = 'auto';
        } else {
            link.href = '#';
            link.style.opacity = '0.5';
            link.style.pointerEvents = 'none';
        }
    }
}

// ==========================================
// 4. دوال جدول التفاصيل الفرعية والمنتجات
// ==========================================
function toggleSubTable(rowId) {
    const sub = document.getElementById('sub-' + rowId);
    const arrowIcon = document.querySelector(`#${rowId} .toggle-arrow i`);
    if (!sub) return;
    
    const isOpen = sub.style.display === 'table-row';
    if (isOpen) {
        sub.style.display = 'none';
        openSubTables.delete(rowId);
        if (arrowIcon) arrowIcon.className = 'fas fa-caret-left';
    } else {
        sub.style.display = 'table-row';
        openSubTables.add(rowId);
        if (arrowIcon) arrowIcon.className = 'fas fa-caret-down';
    }
}

function addProductRow(rowId, data = {}) {
    const subRow = document.getElementById('sub-' + rowId);
    if (!subRow) return;
    const tbody = subRow.querySelector('.product-body');
    const row = tbody.insertRow();

    row.innerHTML = `
        <td>
            <select onchange="calculateMainVisitValue('${rowId}')">
                <option value="">-</option>
                <option value="جوال" ${data.type === 'جوال' ? 'selected' : ''}>جوال</option>
                <option value="بيانات" ${data.type === 'بيانات' ? 'selected' : ''}>بيانات</option>
                <option value="هاتف" ${data.type === 'هاتف' ? 'selected' : ''}>هاتف</option>
                <option value="فايبر نت" ${data.type === 'فايبر نت' ? 'selected' : ''}>فايبر نت</option>
                <option value="DIA" ${data.type === 'DIA' ? 'selected' : ''}>DIA</option>
                <option value="IPVPN" ${data.type === 'IPVPN' ? 'selected' : ''}>IPVPN</option>
                <option value="SIP" ${data.type === 'SIP' ? 'selected' : ''}>SIP</option>
            </select>
        </td>
        <td><input type="text" value="${data.desc || ''}" onchange="saveSingleRow('${rowId}')"></td>
        <td><input type="number" class="prod-qty" min="0" value="${data.qty || ''}" oninput="calculateMainVisitValue('${rowId}')"></td>
        <td><input type="number" class="prod-sub" min="0" value="${data.sub || ''}" oninput="calculateMainVisitValue('${rowId}')"></td>
        <td><input type="number" class="prod-total readonly-input" value="${data.total || ''}" readonly style="color:var(--text-muted); font-weight:700;"></td>
        <td>
            <div style="display:flex; justify-content:center;">
                <button class="sub-action-btn" title="حذف" onclick="removeProductRow(this, '${rowId}')"><i class="fas fa-trash-alt" style="font-size:10px;"></i></button>
            </div>
        </td>
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
        if (oppVal) {
            oppVal.value = grandTotal > 0 ? grandTotal : '0';
        }
    }

    saveSingleRow(rowId);
    // استدعاء دالة تحديث الإحصاءات مباشرة لتعكس التغيرات لو كانت الحالة عرض سعر
    updateStats();
}

function getProductsData(rowId) {
    const subRow = document.getElementById('sub-' + rowId);
    if (!subRow) return [];
    const products = [];
    subRow.querySelectorAll('.product-body tr').forEach(pRow => {
        const inputs = pRow.querySelectorAll('input, select');
        if (inputs.length >= 5) {
            products.push({
                type: inputs[0].value || '',
                desc: inputs[1].value || '',
                qty: inputs[2].value || '',
                sub: inputs[3].value || '',
                total: inputs[4].value || ''
            });
        }
    });
    return products;
}

// ==========================================
// 5. حفظ وتعديل ونقل الزيارات و سجل النشاط
// ==========================================
function addActivityLog(message) {
    const list = document.getElementById('activityList');
    if (!list) return;
    const item = document.createElement('div');
    item.style.cssText = "padding: 8px 10px; border-bottom: 1px solid #f1f5f9; font-size: 11.5px; color: #475569; display: flex; align-items: center; gap: 8px;";
    item.innerHTML = `<i class="fas fa-check-circle" style="color: var(--accent-blue);"></i> <span>[${new Date().toLocaleTimeString('ar-SA')}] ${message}</span>`;
    list.prepend(item);
}

async function saveSingleRow(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;

    const today = getTodayDate();
    const editDateInput = row.querySelector('.edit-date-val');
    if (editDateInput && editDateInput.value !== today) {
        editDateInput.value = today;
    }

    const visitData = {
        comp: row.querySelector('.comp-input').value,
        address: row.querySelector('.address-input').value,
        mgr: row.querySelector('.mgr-input').value,
        mob: row.querySelector('.mob-input').value,
        email: row.querySelector('.email-input').value,
        record: row.querySelector('.record-input').value,
        visitDate: row.querySelector('.visit-date-val').value,
        curServ: row.querySelector('.service-input').value,
        oppValue: row.querySelector('.opp-val').value,
        notes: row.querySelector('.notes-preview').getAttribute('data-full-notes') || '',
        status: row.querySelector('.status-select').value,
        editDate: today,
        owner: row.querySelector('.owner-input').value,
        products: getProductsData(rowId)
    };

    try {
        await setDoc(doc(db, "visits", rowId), visitData, { merge: true });
        updateStats();
    } catch (e) {
        console.error("خطأ بالحفظ السحابي:", e);
    }
}

async function insertNewRow() {
    const newId = 'visit_' + Date.now();
    const newVisit = {
        comp: '',
        address: '',
        mgr: '',
        mob: '',
        email: '',
        record: '',
        visitDate: getTodayDate(),
        curServ: '',
        oppValue: '0',
        notes: '',
        status: 'جديدة',
        editDate: getTodayDate(),
        owner: '',
        products: []
    };

    try {
        await setDoc(doc(db, "visits", newId), newVisit);
        addActivityLog("تم إضافة زيارة جديدة للقائمة.");
    } catch (error) {
        console.error("خطأ في إضافة صف جديد سحابياً:", error);
    }
}

async function handleStatusChange(selectElem, rowId) {
    const newStatus = selectElem.value;
    selectElem.className = `excel-input status-select ${getStatusClass(newStatus)}`;
    const row = document.getElementById(rowId);

    if (newStatus === 'تأهيل لفرصة') {
        try {
            const today = getTodayDate();
            
            // جمع جميع بيانات الصف والمنتجات بشكل دقيق
            const visitData = {
                comp: row.querySelector('.comp-input').value,
                address: row.querySelector('.address-input').value,
                mgr: row.querySelector('.mgr-input').value,
                mob: row.querySelector('.mob-input').value,
                email: row.querySelector('.email-input').value,
                record: row.querySelector('.record-input').value,
                visitDate: row.querySelector('.visit-date-val').value,
                curServ: row.querySelector('.service-input').value,
                oppValue: row.querySelector('.opp-val').value,
                notes: row.querySelector('.notes-preview').getAttribute('data-full-notes') || '',
                status: 'تأهيل لفرصة',
                editDate: today,
                owner: row.querySelector('.owner-input').value,
                products: getProductsData(rowId)
            };

            // ترحيل السجل للفرص البيعية
            await setDoc(doc(db, "opportunities", rowId), visitData);
            
            // حذفه من سجل الزيارات
            await deleteDoc(doc(db, "visits", rowId));

            addActivityLog(`تم تأهيل الشركة (${visitData.comp || 'بدون اسم'}) لفرصة بيعية ونقلها بنجاح.`);

            Swal.fire({
                icon: 'success',
                title: 'تم النقل!',
                text: 'تم نقل الزيارة إلى الفرص البيعية بنجاح بجميع بياناتها.',
                timer: 2500,
                showConfirmButton: false
            });
            
        } catch (error) {
            console.error("خطأ في نقل الزيارة:", error);
            Swal.fire('خطأ', 'حدث خطأ أثناء النقل للفرص البيعية', 'error');
        }
    } else {
        saveSingleRow(rowId);
        
        let compName = row.querySelector('.comp-input').value || 'بدون اسم';
        addActivityLog(`تم تغيير حالة الزيارة لشركة (${compName}) إلى: ${newStatus}`);
        
        // تحديث الإحصائيات مباشرة لأن حالة "عرض سعر" ستؤثر على المجموع
        updateStats(); 
    }
}

// ==========================================
// 6. الملاحظات والبحث والعمليات العامة
// ==========================================
function getStatusClass(status) {
    if (status === 'عرض سعر' || status === 'تأهيل لفرصة') return 'status-yellow';
    if (status === 'متابعة') return 'status-blue';
    if (status === 'فقدان' || status === 'غير مهتم') return 'status-red';
    return '';
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

function openNotesModal(rowId) {
    currentActiveNoteRowId = rowId;
    const row = document.getElementById(rowId);
    if (!row) return;

    const preview = row.querySelector('.notes-preview');
    const currentNotes = preview.getAttribute('data-full-notes') || '';
    
    document.getElementById('modalTextArea').value = currentNotes;
    document.getElementById('historyLog').innerText = currentNotes ? `الملاحظات الحالية:\n${currentNotes}` : 'لا توجد ملاحظات سابقة.';
    document.getElementById('noteModal').style.display = 'flex';
}

function closeNote() {
    document.getElementById('noteModal').style.display = 'none';
    currentActiveNoteRowId = null;
}

function saveNote() {
    if (!currentActiveNoteRowId) return;
    const row = document.getElementById(currentActiveNoteRowId);
    const newText = document.getElementById('modalTextArea').value;
    
    if (row) {
        const preview = row.querySelector('.notes-preview');
        preview.setAttribute('data-full-notes', newText);
        preview.innerText = newText ? newText : 'إضافة ملاحظة...';
        saveSingleRow(currentActiveNoteRowId);
        addActivityLog("تم تحديث الملاحظات لزيارة محددة.");
    }
    closeNote();
}

function updateStats() {
    const rows = document.querySelectorAll('#tableBody .main-row');
    let totalCount = rows.length;
    let todayCount = 0;
    let monthCount = 0;
    
    // المبالغ
    let totalVal = 0;
    let monthVal = 0;

    const todayStr = getTodayDate();
    const currentMonthStr = todayStr.substring(0, 7);

    rows.forEach(row => {
        const dateVal = row.querySelector('.visit-date-val')?.value || '';
        const val = parseFloat(row.querySelector('.opp-val')?.value) || 0;
        const statusSelect = row.querySelector('.status-select');
        const status = statusSelect ? statusSelect.value : '';

        // المبالغ تُجمع فقط في حال كانت الحالة "عرض سعر" كما هو مطلوب
        if (status === 'عرض سعر') {
            totalVal += val;
            if (dateVal.startsWith(currentMonthStr)) {
                monthVal += val;
            }
        }

        // عدادات الزيارات تحسب للجميع
        if (dateVal === todayStr) todayCount++;
        if (dateVal.startsWith(currentMonthStr)) {
            monthCount++;
        }
    });

    if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = totalCount;
    if (document.getElementById('stat-month')) document.getElementById('stat-month').innerText = monthCount;
    if (document.getElementById('stat-today')) document.getElementById('stat-today').innerText = todayCount;
    if (document.getElementById('stat-value-total')) document.getElementById('stat-value-total').innerText = totalVal.toLocaleString('en-US') + ' ر.س';
    if (document.getElementById('stat-value-month')) document.getElementById('stat-value-month').innerText = monthVal.toLocaleString('en-US') + ' ر.س';
}

function toggleAllCheckboxes(master) {
    document.querySelectorAll('.row-select').forEach(cb => cb.checked = master.checked);
}

function toggleDropdown(event, btn) {
    event.stopPropagation();
    const menu = btn.nextElementSibling;
    menu.classList.toggle('show');
}

window.onclick = function() {
    document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.remove('show'));
};

async function handleBulkAction(action) {
    const selectedRows = document.querySelectorAll('.row-select:checked');
    if (selectedRows.length === 0) {
        Swal.fire('تنبيه', 'يرجى تحديد عنصر واحد على الأقل', 'warning');
        return;
    }

    if (action === 'حذف') {
        const result = await Swal.fire({
            title: 'هل أنت متأكد؟',
            text: `سيتم حذف ${selectedRows.length} من العناصر المحددة نهائياً من السحابة`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'نعم، احذف',
            cancelButtonText: 'إلغاء'
        });

        if (result.isConfirmed) {
            for (let cb of selectedRows) {
                const tr = cb.closest('tr');
                if (tr && tr.id) {
                    await deleteDoc(doc(db, "visits", tr.id));
                }
            }
            Swal.fire('تم الحذف!', 'تم حذف الزيارات بنجاح.', 'success');
            addActivityLog(`تم حذف (${selectedRows.length}) زيارات بشكل جماعي.`);
        }
    } else {
        Swal.fire('إشعار', `تم تطبيق إجراء (${action}) على ${selectedRows.length} سجل.`, 'info');
        addActivityLog(`تم تطبيق إجراء (${action}) على عدد ${selectedRows.length} سجل.`);
    }
}

function toggleLogExpansion() {
    const section = document.getElementById('activityLogSection');
    if (section) section.classList.toggle('expanded');
}

function debouncedFilterTable() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const q = document.getElementById('searchInput').value.toLowerCase().trim();
        const allRows = document.getElementById('tableBody').children;
        
        document.querySelectorAll('.main-row').forEach(row => {
            const text = Array.from(row.cells).map(c => c.querySelector('input')?.value.toLowerCase() || '').join(' ');
            const subRow = document.getElementById('sub-' + row.id);
            if (text.includes(q)) {
                row.style.display = 'table-row';
            } else {
                row.style.display = 'none';
                if (subRow) subRow.style.display = 'none';
            }
        });

        let currentSep = null;
        let visibleCount = 0;
        
        for (let i = 0; i < allRows.length; i++) {
            const tr = allRows[i];
            if (tr.classList.contains('month-separator')) {
                if (currentSep) {
                    currentSep.style.display = visibleCount > 0 ? 'table-row' : 'none';
                }
                currentSep = tr;
                visibleCount = 0;
            } else if (tr.classList.contains('main-row')) {
                if (tr.style.display !== 'none') {
                    visibleCount++;
                }
            }
        }
        if (currentSep) {
            currentSep.style.display = visibleCount > 0 ? 'table-row' : 'none';
        }
        
    }, 300);
}

// جعل الدوال متاحة للإستخدام من ملف HTML
window.insertNewRow = insertNewRow;
window.toggleSubTable = toggleSubTable;
window.addProductRow = addProductRow;
window.removeProductRow = removeProductRow;
window.calculateMainVisitValue = calculateMainVisitValue;
window.openNotesModal = openNotesModal;
window.closeNote = closeNote;
window.saveNote = saveNote;
window.handleStatusChange = handleStatusChange;
window.toggleAllCheckboxes = toggleAllCheckboxes;
window.toggleDropdown = toggleDropdown;
window.handleBulkAction = handleBulkAction;
window.toggleLogExpansion = toggleLogExpansion;
window.debouncedFilterTable = debouncedFilterTable;
window.updateWhatsAppLink = updateWhatsAppLink;
window.addActivityLog = addActivityLog;

document.addEventListener('DOMContentLoaded', () => {
    listenToVisits();
});