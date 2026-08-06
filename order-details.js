import { db, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from "./firebase-config.js";

const urlParams = new URLSearchParams(window.location.search);
let currentOrderId = urlParams.get('id') || urlParams.get('orderId') || urlParams.get('code') || localStorage.getItem('current_order_id') || "0000";

const statusOptions = ["مكتمل", "معلق", "جديد", "مرتجع", "فقدان"];
const statusOrder = { "مكتمل": 1, "معلق": 2, "جديد": 3, "مرتجع": 4, "فقدان": 5 };

let currentStatusFilterValue = "all";
let cachedProducts = [];
let cachedLogs = [];
let cachedGlobalNotes = "";

window.formatNumberWithOneDecimal = function(num) {
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

window.toggleLogExpansion = function() {
    const section = document.getElementById('activityLogSection');
    const btn = document.getElementById('toggleExpandBtn');
    if (section.classList.contains('expanded')) {
        section.classList.remove('expanded');
        document.body.classList.remove('log-expanded');
        btn.innerHTML = '<i class="fas fa-expand-alt"></i>';
    } else {
        section.classList.add('expanded');
        document.body.classList.add('log-expanded');
        btn.innerHTML = '<i class="fas fa-compress-alt"></i>';
    }
};

function getTodayFormatted() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function generateStyledHeaderForNotes() {
    const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const d = new Date();
    const timeFormatted = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `<span class="log-badge-user"><i class="fas fa-user"></i> أحمد</span>
            <span class="log-divider">|</span>
            <span class="log-timestamp"><i class="fas fa-calendar-alt"></i> ${days[d.getDay()]} ${getTodayFormatted()} <i class="fas fa-clock" style="margin-right:3px;"></i> ${timeFormatted}</span>`;
}

function generateInlineHeaderHTML() {
    const d = new Date();
    const timeFormatted = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `<span class="log-badge-user"><i class="fas fa-user"></i> أحمد</span>
            <span class="log-divider">|</span>
            <span class="log-timestamp"><i class="fas fa-calendar-alt"></i> ${getTodayFormatted()} <i class="fas fa-clock" style="margin-right:3px;"></i> ${timeFormatted}</span>`;
}

window.addToActivityLog = async function(fieldName, oldVal, newVal, productIdentifier) {
    const allowedFields = ["تفاصيل المنتج", "العدد", "الاشتراك", "رقم السريال", "رقم الخدمة", "هوية المستخدم", "سجل المتابعة", "الحالة", "إضافة منتج جديد", "زر إجراء"];
    if (!allowedFields.includes(fieldName)) return; 

    if (oldVal === newVal && fieldName !== "إضافة منتج جديد" && fieldName !== "زر إجراء") return;
    const headerHTML = generateInlineHeaderHTML();
    
    let actionText = "";
    if (fieldName === "إضافة منتج جديد") {
        const cleanId = (productIdentifier && String(productIdentifier).trim() !== "") ? productIdentifier : "بدون رقم";
        actionText = `إضافة منتج جديد: ${newVal} للمنتج (${cleanId})`;
    } else if (fieldName === "زر إجراء") {
        actionText = `تم تنفيذ إجراء: [${newVal}] على الطلب الحالي`;
    } else {
        const cleanId = (productIdentifier && String(productIdentifier).trim() !== "") ? productIdentifier : "بدون رقم";
        const val1 = (oldVal && String(oldVal).trim() !== "") ? oldVal : "فارغ";
        const val2 = (newVal && String(newVal).trim() !== "") ? newVal : "فارغ";
        actionText = `تغيير ${fieldName} من [${val1}] إلى [${val2}] للمنتج (${cleanId})`;
    }
    
    const fullLogHTML = `<div class="log-entry">${headerHTML} <span class="log-divider">|</span> <span class="log-action">${actionText}</span></div>`;
    
    cachedLogs.unshift(fullLogHTML);
    if (cachedLogs.length > 100) cachedLogs = cachedLogs.slice(0, 100);
    
    renderActivityLog();
    try {
        await setDoc(doc(db, "order_logs", currentOrderId), { logs: cachedLogs });
    } catch (e) { console.error("خطأ حفظ سجل النشاط:", e); }
};

window.triggerActionLog = function(actionType) {
    if (actionType === 'تعديل البيانات الأساسية للطلب') {
        alert('تعديل البيانات الأساسية للطلب');
        window.addToActivityLog('زر إجراء', '', 'تعديل البيانات الأساسية للطلب', '');
    } else if (actionType === 'تصدير Excel') {
        exportToExcel();
        window.addToActivityLog('زر إجراء', '', 'تصدير لملف Excel', '');
    } else if (actionType === 'طباعة') {
        window.addToActivityLog('زر إجراء', '', 'طباعة الصفحة', '');
        window.print();
    } else if (actionType === 'حذف المختار') {
        deleteSelected();
    }
};

function renderActivityLog() {
    const list = document.getElementById('activityList');
    if (list) list.innerHTML = cachedLogs.join(''); 
}

window.loadOrderDetails = async function() {
    document.getElementById('orderId').innerText = '#' + currentOrderId;

    try {
        let orderData = null;
        const orderDoc = await getDoc(doc(db, "sales", currentOrderId));
        if (orderDoc.exists()) {
            orderData = orderDoc.data();
        } else {
            const q1 = query(collection(db, "sales"), where("id", "==", currentOrderId));
            const snap1 = await getDocs(q1);
            if (!snap1.empty) {
                orderData = snap1.docs[0].data();
            }
        }

        if (orderData) {
            document.getElementById('orderId').innerText = '#' + (orderData.id || currentOrderId);
            document.getElementById('orderType').innerText = orderData.type || orderData.name || '-';
            document.getElementById('orderComp').innerText = orderData.comp || orderData.company || '-';
            document.getElementById('orderCr').innerText = orderData.cr || orderData.commercialRecord || '-';
            document.getElementById('orderStatus').innerText = orderData.status || '-';
        }

        const prodDoc = await getDoc(doc(db, "order_products", currentOrderId));
        cachedProducts = prodDoc.exists() ? (prodDoc.data().items || []) : [];

        const logDoc = await getDoc(doc(db, "order_logs", currentOrderId));
        cachedLogs = logDoc.exists() ? (logDoc.data().logs || []) : [];

        const notesDoc = await getDoc(doc(db, "order_global_notes", currentOrderId));
        cachedGlobalNotes = notesDoc.exists() ? (notesDoc.data().notes || '') : '';

    } catch (e) {
        console.error("خطأ جلب البيانات من Firebase:", e);
    }

    renderProducts();
    renderActivityLog();
};

window.validateNumberInput = function(el, isFloat = false) {
    let originalText = el.innerText;
    let cleanedText = isFloat ? originalText.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1') : originalText.replace(/[^0-9]/g, '');
    
    if (originalText !== cleanedText) {
        el.innerText = cleanedText;
        let range = document.createRange();
        let sel = window.getSelection();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }
};

window.renderProducts = function(filtered = null) {
    let baseItems = [...cachedProducts];
    baseItems.forEach(p => { if (!statusOptions.includes(p.status)) p.status = "جديد"; });
    if (currentStatusFilterValue !== "all") baseItems = baseItems.filter(p => p.status === currentStatusFilterValue);
    
    let items = (filtered || baseItems).map((p, i) => ({...p, originalIndex: cachedProducts.indexOf(p)}));
    
    items.sort((a, b) => {
        let weightA = statusOrder[a.status] || 99;
        let weightB = statusOrder[b.status] || 99;
        if (weightA !== weightB) return weightA - weightB;
        return (a.serial || "").localeCompare(b.serial || "", undefined, {numeric: true, sensitivity: 'base'});
    });
    
    updateTableHeaders(items.length > 0 ? items[0].type : "جوال");
    const tbody = document.getElementById('productsBody');
    tbody.innerHTML = '';
    
    items.forEach((p) => {
        const subVal = parseFloat(p.sub) || 0;
        const totalVal = (parseInt(p.qty) || 0) * subVal;
        
        let completedVal = (p.status === "مكتمل") ? totalVal : 0;
        let pendingVal = (p.status === "معلق") ? totalVal : 0;

        let sClass = "";
        if (p.status === "مكتمل") sClass = "status-mektamel";
        else if (p.status === "معلق") sClass = "status-moallaq";
        else if (p.status === "مرتجع") sClass = "status-mortaja";
        else if (p.status === "فقدان") sClass = "status-faqd";

        const isLocked = ["مكتمل", "معلق"].includes(p.status);
        const pIden = p.mobile || p.serial || p.name;
        const rNote = p.rowNote || '';

        let dynamic = (p.type === "جوال" || p.type === "بيانات") ? `
            <td contenteditable="${!isLocked}" data-old="${p.serial||''}" onfocus="this.setAttribute('data-old', this.innerText)" oninput="validateNumberInput(this, false)" onblur="if(this.getAttribute('data-old')!=this.innerText){ addToActivityLog('رقم السريال', this.getAttribute('data-old'), this.innerText, '${pIden}'); updateField(${p.originalIndex},'serial',this.innerText); }">${p.serial||''}</td>
            <td contenteditable="${!isLocked}" data-old="${p.mobile||''}" onfocus="this.setAttribute('data-old', this.innerText)" oninput="validateNumberInput(this, false)" onblur="if(this.getAttribute('data-old')!=this.innerText){ addToActivityLog('رقم الخدمة', this.getAttribute('data-old'), this.innerText, '${pIden}'); updateField(${p.originalIndex},'mobile',this.innerText); }">${p.mobile||''}</td>
            <td contenteditable="${!isLocked}" data-old="${p.user||''}" onfocus="this.setAttribute('data-old', this.innerText)" oninput="validateNumberInput(this, false)" onblur="if(this.getAttribute('data-old')!=this.innerText){ addToActivityLog('هوية المستخدم', this.getAttribute('data-old'), this.innerText, '${pIden}'); updateField(${p.originalIndex},'user',this.innerText); }">${p.user||''}</td>` : `
            <td contenteditable="${!isLocked}" data-old="${p.sai||''}" onfocus="this.setAttribute('data-old', this.innerText)" onblur="if(this.getAttribute('data-old')!=this.innerText){ updateField(${p.originalIndex},'sai',this.innerText); }">${p.sai||''}</td>
            <td contenteditable="${!isLocked}" data-old="${p.coords||''}" onfocus="this.setAttribute('data-old', this.innerText)" onblur="if(this.getAttribute('data-old')!=this.innerText){ updateField(${p.originalIndex},'coords',this.innerText); }">${p.coords||''}</td>
            <td contenteditable="${!isLocked}" data-old="${p.city||''}" onfocus="this.setAttribute('data-old', this.innerText)" onblur="if(this.getAttribute('data-old')!=this.innerText){ updateField(${p.originalIndex},'city',this.innerText); }">${p.city||''}</td>`;

        tbody.innerHTML += `<tr class="${isLocked ? 'row-locked' : ''}">
            <td class="not-locked"><input type="checkbox" class="row-checkbox" data-index="${p.originalIndex}" data-locked="${isLocked}" onchange="calculateTotals()"></td>
            <td>${p.type}</td>
            <td contenteditable="${!isLocked}" data-old="${p.name}" onfocus="this.setAttribute('data-old', this.innerText)" onblur="if(this.getAttribute('data-old')!=this.innerText){ addToActivityLog('تفاصيل المنتج', this.getAttribute('data-old'), this.innerText, '${pIden}'); updateField(${p.originalIndex},'name',this.innerText); }">${p.name}</td>
            <td contenteditable="${!isLocked}" data-old="${p.qty}" onfocus="this.setAttribute('data-old', this.innerText)" oninput="validateNumberInput(this, false)" onblur="if(this.getAttribute('data-old')!=this.innerText){ addToActivityLog('العدد', this.getAttribute('data-old'), this.innerText, '${pIden}'); updateField(${p.originalIndex},'qty',this.innerText); }">${p.qty}</td>
            <td contenteditable="${!isLocked}" data-old="${subVal.toFixed(1)}" onfocus="this.setAttribute('data-old', this.innerText)" oninput="validateNumberInput(this, true)" onblur="if(this.getAttribute('data-old')!=this.innerText){ addToActivityLog('الاشتراك', this.getAttribute('data-old'), this.innerText, '${pIden}'); updateField(${p.originalIndex},'sub',this.innerText); }">${formatNumberWithOneDecimal(subVal)}</td>
            <td style="color:var(--header-green);font-weight:800;">${formatNumberWithOneDecimal(totalVal)}</td>
            <td style="color:var(--header-green);font-weight:800;">${formatNumberWithOneDecimal(completedVal)}</td>
            <td style="color:#b45309;font-weight:800;">${formatNumberWithOneDecimal(pendingVal)}</td>
            ${dynamic}
            <td class="not-locked"><select class="status-select ${sClass}" data-old="${p.status}" onfocus="this.setAttribute('data-old', this.value)" onchange="changeStatus(${p.originalIndex},this.value)">
                ${statusOptions.map(s=>`<option value="${s}" ${p.status===s?'selected':''}>${s}</option>`).join('')}</select></td>
            <td style="font-size:10px">${p.date}</td>
            <td contenteditable="${!isLocked}" data-old="${rNote}" onfocus="this.setAttribute('data-old', this.innerText)" onblur="if(this.getAttribute('data-old')!=this.innerText){ addToActivityLog('سجل المتابعة', this.getAttribute('data-old'), this.innerText, '${pIden}'); updateField(${p.originalIndex},'rowNote',this.innerText); }">${rNote}</td>
            </tr>`;
    });
    
    tbody.innerHTML += `<tr class="filler-row"><td colspan="14" style="height: 100%; border: none; background: transparent; pointer-events: none; padding: 0;"></td></tr>`;
    calculateTotals();
    updateStatsBox();
};

function updateTableHeaders(type) {
    const header = document.getElementById('dynamicHeader');
    let dynamic = (type === "جوال" || type === "بيانات") ? `<th>رقم السريال</th><th>رقم الخدمة</th><th>هوية المستخدم</th>` : `<th>رقم الكبينة</th><th>الإحداثيات</th><th>المدينة</th>`;
    header.innerHTML = `<th style="width: 30px;"><input type="checkbox" id="checkAllBox" onclick="toggleAll(this)"></th><th style="width:100px;">نوع المنتج</th><th>تفاصيل المنتج</th><th style="width:50px;">العدد</th><th style="width:80px;">الاشتراك</th><th style="width:80px;">الإجمالي</th><th style="width:80px; background-color:#166534;">مكتمل</th><th style="width:80px; background-color:#854d0e;">معلق</th>${dynamic}<th style="width:110px;">الحالة <select id="colStatusFilter" class="status-header-filter" onchange="triggerStatusColumnFilter(this.value)"><option value="all" ${currentStatusFilterValue==='all'?'selected':''}>الكل</option>${statusOptions.map(opt=>`<option value="${opt}" ${currentStatusFilterValue===opt?'selected':''}>${opt}</option>`).join('')}</select></th><th style="width:80px;">تاريخ الحالة</th><th>سجل المتابعة</th>`;
}

window.triggerStatusColumnFilter = function(val) { currentStatusFilterValue = val; applyFilters(); };

function updateStatsBox() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    let totalOkAmount = 0, totalWaitAmount = 0, monthOkAmount = 0, monthWaitAmount = 0;
    cachedProducts.forEach(p => {
        const productTotal = (parseInt(p.qty) || 0) * (parseFloat(p.sub) || 0);
        if (p.status === "مكتمل") totalOkAmount += productTotal;
        if (p.status === "معلق") totalWaitAmount += productTotal;
        
        const parts = (p.date || "").split('/');
        if (parts.length === 3 && parseInt(parts[1]) === currentMonth && parseInt(parts[2]) === currentYear) {
            if (p.status === "مكتمل") monthOkAmount += productTotal;
            if (p.status === "معلق") monthWaitAmount += productTotal;
        }
    });

    document.getElementById('stat_total_ok').innerText = formatNumberWithOneDecimal(totalOkAmount);
    document.getElementById('stat_total_wait').innerText = formatNumberWithOneDecimal(totalWaitAmount);
    document.getElementById('stat_month_ok').innerText = formatNumberWithOneDecimal(monthOkAmount);
    document.getElementById('stat_month_wait').innerText = formatNumberWithOneDecimal(monthWaitAmount);

    updateSalesSummary(totalOkAmount, totalWaitAmount);
}

async function updateSalesSummary(totalOk, totalWait) {
    try {
        await updateDoc(doc(db, "sales", currentOrderId), { completedSum: totalOk, pendingSum: totalWait });
    } catch (e) { console.error("خطأ تحديث المبيعات:", e); }
}

window.updateField = async function(idx, f, v) {
    cachedProducts[idx][f] = v.trim(); 
    cachedProducts[idx].updatedAt = Date.now(); 
    await saveProductsToFirebase();
    if(['qty','sub'].includes(f)) syncSumsToSales();
    renderProducts();
};

window.changeStatus = async function(idx, s) {
    let item = cachedProducts[idx];
    const oldS = item.status;
    const pIden = item.mobile || item.serial || item.name;
    await addToActivityLog('الحالة', oldS, s, pIden);
    item.status = s; 
    item.updatedAt = Date.now(); 
    item.date = new Date().toLocaleDateString('en-GB');
    await saveProductsToFirebase();
    syncSumsToSales(); 
    renderProducts(); 
};

window.deleteSelected = async function() {
    const chks = document.querySelectorAll('.row-checkbox:checked');
    if(chks.length===0) return;
    const validIdxs = Array.from(chks).filter(c => c.dataset.locked === "false").map(c => parseInt(c.dataset.index));
    if (validIdxs.length === 0) { alert("لا يمكن حذف الصفوف المغلقة"); return; }
    if(!confirm(`حذف (${validIdxs.length}) منتجات؟`)) return;
    
    for (let originalIdx of validIdxs) {
        const item = cachedProducts[originalIdx];
        const pIden = item.mobile || item.serial || item.name;
        await addToActivityLog('زر إجراء', '', `حذف المنتج: ${item.name} (${pIden})`, pIden);
    }

    cachedProducts = cachedProducts.filter((_, i) => !validIdxs.includes(i));
    await saveProductsToFirebase();
    syncSumsToSales(); 
    renderProducts();
};

async function saveProductsToFirebase() {
    try {
        await setDoc(doc(db, "order_products", currentOrderId), { items: cachedProducts });
    } catch (e) { console.error("Error saving products:", e); }
}

function syncSumsToSales() {
    let tot = cachedProducts.reduce((acc, p) => acc + (p.qty * p.sub), 0);
    document.getElementById('orderTotalSum').innerText = formatNumberWithOneDecimal(tot) + " ر.س";
}

window.calculateTotals = function() {
    let q=0, s=0, t=0, cTot=0, pTot=0; 
    cachedProducts.forEach(p=>{ 
        const qtyVal = parseInt(p.qty)||0;
        const subVal = parseFloat(p.sub)||0;
        const itemTotal = qtyVal * subVal;
        q += qtyVal; s += subVal; t += itemTotal; 
        if (p.status === "مكتمل") cTot += itemTotal;
        if (p.status === "معلق") pTot += itemTotal;
    });
    document.getElementById('f_selection').innerText = document.querySelectorAll('.row-checkbox:checked').length;
    document.getElementById('f_count').innerText = cachedProducts.length; 
    document.getElementById('f_qty').innerText = q; 
    document.getElementById('f_sub').innerText = formatNumberWithOneDecimal(s); 
    document.getElementById('f_total').innerText = formatNumberWithOneDecimal(t);
    document.getElementById('f_completed').innerText = formatNumberWithOneDecimal(cTot);
    document.getElementById('f_pending').innerText = formatNumberWithOneDecimal(pTot);
};

window.saveProduct = async function() {
    const type = document.getElementById('p_type').value, name = document.getElementById('p_name').value || "بدون تفاصيل", qty = parseInt(document.getElementById('p_qty').value) || 1, sub = parseFloat(document.getElementById('p_sub').value) || 0;
    let serial = document.getElementById('p_serial').value || "", isAuto = document.getElementById('auto_serial').checked;
    const baseTime = Date.now();
    
    if(isAuto && ["جوال", "بيانات"].includes(type) && serial !== "") {
        for(let i=0; i<qty; i++){ 
            cachedProducts.push({ id: baseTime + i, type, name, qty:1, sub, serial, status:"جديد", date:new Date().toLocaleDateString('en-GB'), updatedAt: baseTime - i, rowNote: "" });
            await addToActivityLog('إضافة منتج جديد', '', `${name} (باقة: ${type})`, serial);
            serial = serial.replace(/(\d+)(?!.*\d)/, n => (BigInt(n)+1n).toString().padStart(n.length, '0')); 
        }
    } else { 
        const newItem = { id: baseTime, type, name, qty, sub, serial:(["جوال", "بيانات"].includes(type)?serial:""), status:"جديد", date:new Date().toLocaleDateString('en-GB'), updatedAt: baseTime, rowNote: "" };
        cachedProducts.push(newItem); 
        await addToActivityLog('إضافة منتج جديد', '', `${name} (باقة: ${type})`, newItem.serial || newItem.name);
    }
    await saveProductsToFirebase();
    syncSumsToSales(); 
    renderProducts(); 
    closeModal();
};

window.applyFilters = function() {
    const q = document.getElementById('liveSearch').value.toLowerCase().trim();
    const searchFiltered = cachedProducts.filter(p => {
        const matchesSearch = (p.serial || '').toLowerCase().includes(q) || (p.mobile || '').toLowerCase().includes(q) || (p.user || '').toLowerCase().includes(q);
        const matchesColumnStatus = (currentStatusFilterValue === "all" || p.status === currentStatusFilterValue);
        return matchesSearch && matchesColumnStatus;
    });
    renderProducts(searchFiltered);
};

window.toggleAll = function(s) { document.querySelectorAll('.row-checkbox').forEach(c => c.checked = s.checked); calculateTotals(); };

window.openModal = function() { 
    document.getElementById('productModal').style.display = 'flex'; 
    document.getElementById('p_qty').value = "1";
    document.getElementById('p_sub').value = "";
    document.getElementById('p_serial').value = "";
    handleTypeChange(); 
};
window.closeModal = function() { document.getElementById('productModal').style.display = 'none'; };
window.handleTypeChange = function() {
    const type = document.getElementById('p_type').value;
    const isMobile = (type === "جوال" || type === "بيانات");
    document.getElementById('p_serial').disabled = !isMobile;
    document.getElementById('auto_serial').disabled = !isMobile;
};

function exportToExcel() {
    const ws = XLSX.utils.json_to_sheet(cachedProducts);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Details");
    XLSX.writeFile(wb, `Order_${currentOrderId}.xlsx`);
}

function renderGlobalNotes(notesText) {
    const logDiv = document.getElementById('historyLog');
    if (!notesText) {
        logDiv.innerHTML = '<div style="color:#94a3b8; text-align:center; padding-top:20px;">لا توجد ملاحظات سابقة لهذا الطلب.</div>';
        return;
    }
    logDiv.innerHTML = notesText.split('\n--------------------\n').filter(e=>e.trim()!=="").map(e => `<div class="log-entry">${e}</div>`).join('');
    logDiv.scrollTop = logDiv.scrollHeight;
}

window.openGlobalNote = function() {
    renderGlobalNotes(cachedGlobalNotes);
    document.getElementById('noteModal').style.display = "flex";
};

window.closeGlobalNote = function() {
    document.getElementById('noteModal').style.display = "none";
    document.getElementById('modalTextArea').value = "";
};

window.saveGlobalNote = async function() {
    const newText = document.getElementById('modalTextArea').value.trim();
    if (newText) {
        let newEntry = `<div style="width: 100%; display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                            ${generateStyledHeaderForNotes()}
                        </div>
                        <div class="log-action" style="width: 100%; display: block; white-space: pre-wrap; font-size: 13px; color: var(--text-dark); padding-right: 5px;">${newText}</div>`;
        
        let updatedFullNotes = cachedGlobalNotes === "" ? newEntry : cachedGlobalNotes + "\n--------------------\n" + newEntry;
        cachedGlobalNotes = updatedFullNotes;
        renderGlobalNotes(updatedFullNotes);
        document.getElementById('modalTextArea').value = "";
        try {
            await setDoc(doc(db, "order_global_notes", currentOrderId), { notes: cachedGlobalNotes });
        } catch (e) { console.error("Error saving global notes:", e); }
    }
};

window.handleFileUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    let fileName = prompt("أدخل اسم للمرفق لحفظه في السجل:", file.name);
    if (fileName === null) { event.target.value = ''; return; }
    if (fileName.trim() === "") fileName = file.name;

    let newEntry = `<div style="width: 100%; display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                        ${generateStyledHeaderForNotes()}
                    </div>
                    <div class="log-action" style="width: 100%; display: block; color: var(--accent-blue); padding-right: 5px;">
                        <i class="fas fa-file-alt"></i> تم إرفاق ملف: ${fileName}
                    </div>`;
                    
    let updatedFullNotes = cachedGlobalNotes === "" ? newEntry : cachedGlobalNotes + "\n--------------------\n" + newEntry;
    cachedGlobalNotes = updatedFullNotes;
    renderGlobalNotes(updatedFullNotes);
    event.target.value = ''; 
    try {
        await setDoc(doc(db, "order_global_notes", currentOrderId), { notes: cachedGlobalNotes });
    } catch (e) { console.error("Error saving file note:", e); }
};

window.addEventListener('DOMContentLoaded', () => {
    window.loadOrderDetails();
});