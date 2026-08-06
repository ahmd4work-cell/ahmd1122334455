// استدعاء إعدادات فايربيس من ملف الإعدادات المركزي الخاص بك
import { db, doc, getDoc, updateDoc } from './firebase-config.js';

let currentCustomer = null;
let currentCustomerId = null;

// التهيئة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentCustomerId = urlParams.get('id');
    
    await loadCustomerData();
    renderManagersTable();
    switchTab('orders');
});

// 1. جلب بيانات العميل وتعبئة البيانات العلوية من فايربيس
async function loadCustomerData() {
    if (!currentCustomerId) {
        document.getElementById('c-name').textContent = "لم يتم تحديد العميل";
        return;
    }

    try {
        const docRef = doc(db, 'asgate_customers', currentCustomerId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            currentCustomer = docSnap.data();
            currentCustomer.id = docSnap.id;
        } else {
            // بيانات فارغة افتراضية في حال لم يتم العثور على العميل
            currentCustomer = {
                name: "عميل غير متوفر", cr1: "", cr2: "", city: "", district: "", 
                address: "", source: "", owner: "", managers: [], orders: [], 
                visits: [], opportunities: [], sales: [], attachments: []
            };
        }

        // تعبئة البيانات في الشاشة
        document.getElementById('c-name').textContent = currentCustomer.name || 'بدون اسم';
        document.getElementById('c-cr1').textContent = currentCustomer.cr1 || '-';
        document.getElementById('c-cr2').textContent = currentCustomer.cr2 || '-';
        document.getElementById('c-location').textContent = `${currentCustomer.city || ''} / ${currentCustomer.district || ''}`;
        document.getElementById('c-addr').textContent = currentCustomer.address || '-';
        document.getElementById('c-source').textContent = currentCustomer.source || '-';
        document.getElementById('c-owner').textContent = currentCustomer.owner || '-';

    } catch (error) {
        console.error("Error loading customer data:", error);
    }
}

// 2. عرض جدول الأشخاص المسؤولين
function renderManagersTable() {
    const tbody = document.getElementById('managerTableBody');
    tbody.innerHTML = '';

    const managers = currentCustomer.managers || [];

    managers.forEach((mgr, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-center">
                <input type="radio" name="primaryManager" ${mgr.isPrimary ? 'checked' : ''} onchange="setPrimaryManager(${index})">
            </td>
            <td><input type="text" value="${mgr.name || ''}" onchange="updateManager(${index}, 'name', this.value)"></td>
            <td><input type="text" value="${mgr.phone || ''}" onchange="updateManager(${index}, 'phone', this.value)"></td>
            <td><input type="text" value="${mgr.altPhone || ''}" onchange="updateManager(${index}, 'altPhone', this.value)"></td>
            <td><input type="email" value="${mgr.email || ''}" onchange="updateManager(${index}, 'email', this.value)"></td>
            <td><input type="text" value="${mgr.jobTitle || ''}" onchange="updateManager(${index}, 'jobTitle', this.value)"></td>
            <td>${mgr.date || '-'}</td>
            <td class="text-center">
                <button class="btn-icon" onclick="deleteManagerRow(${index})" title="حذف"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 3. تحديد المسؤول الرئيسي وتحديث بيانات العميل لصفحة العملاء الرئيسية
async function setPrimaryManager(selectedIndex) {
    if(!currentCustomer.managers) return;
    
    currentCustomer.managers.forEach((mgr, idx) => {
        mgr.isPrimary = (idx === selectedIndex);
    });

    const selectedMgr = currentCustomer.managers[selectedIndex];
    
    // تحديث بيانات الشخص الرئيسي في كائن العميل
    currentCustomer.primaryContact = {
        name: selectedMgr.name,
        phone: selectedMgr.phone,
        email: selectedMgr.email
    };

    await saveToFirestore();
}

// إضافة صف مسؤول جديد
async function addNewManagerRow() {
    const today = new Date().toISOString().split('T')[0];
    if(!currentCustomer.managers) currentCustomer.managers = [];
    
    const newMgr = {
        id: Date.now(), name: "", phone: "", altPhone: "", email: "", jobTitle: "", 
        date: today, isPrimary: currentCustomer.managers.length === 0
    };
    
    currentCustomer.managers.push(newMgr);
    if(newMgr.isPrimary) {
        setPrimaryManager(currentCustomer.managers.length - 1);
    }
    
    renderManagersTable();
    await saveToFirestore();
}

// تحديث بيانات مسؤول عند التعديل في الحقول
async function updateManager(index, field, value) {
    currentCustomer.managers[index][field] = value;
    if (currentCustomer.managers[index].isPrimary && (field === 'name' || field === 'phone')) {
        currentCustomer.primaryContact = currentCustomer.primaryContact || {};
        currentCustomer.primaryContact[field] = value;
    }
    await saveToFirestore();
}

// حذف مسؤول
async function deleteManagerRow(index) {
    if (confirm("هل أنت متأكد من حذف هذا المسؤول؟")) {
        const isWasPrimary = currentCustomer.managers[index].isPrimary;
        currentCustomer.managers.splice(index, 1);
        
        if (isWasPrimary && currentCustomer.managers.length > 0) {
            currentCustomer.managers[0].isPrimary = true;
            await setPrimaryManager(0);
        } else {
            await saveToFirestore();
        }
        renderManagersTable();
    }
}

// 4. التحكم في التبويبات (الطلبات، الزيارات، الفرص البيعية، المبيعات، المرفقات)
function switchTab(tabName) {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    const activeBtn = document.getElementById(`btn-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');

    const thead = document.getElementById('tableHeadRow');
    const tbody = document.getElementById('contentBody');
    const title = document.getElementById('tab-title');

    tbody.innerHTML = '';

    if (tabName === 'orders') {
        title.textContent = '🛒 سجل الطلبات';
        thead.innerHTML = `<th>رقم الطلب</th><th>تفاصيل الطلب</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th>`;
        (currentCustomer.orders || []).forEach(item => {
            tbody.innerHTML += `<tr><td><b>${item.id}</b></td><td>${item.title}</td><td>${item.date}</td><td>${item.amount}</td><td><span class="status-badge active">${item.status}</span></td></tr>`;
        });
    } else if (tabName === 'visits') {
        title.textContent = '🚗 سجل الزيارات';
        thead.innerHTML = `<th>تاريخ الزيارة</th><th>الزائر (الموظف)</th><th>الهدف من الزيارة</th><th>النتيجة / الملاحظات</th>`;
        (currentCustomer.visits || []).forEach(item => {
            tbody.innerHTML += `<tr><td>${item.date}</td><td>${item.visitor}</td><td>${item.purpose}</td><td>${item.result}</td></tr>`;
        });
    } else if (tabName === 'opportunities') {
        title.textContent = '🎯 الفرص البيعية';
        thead.innerHTML = `<th>اسم الفرصة</th><th>القيمة التقديرية</th><th>المرحلة</th><th>نسبة النجاح</th>`;
        (currentCustomer.opportunities || []).forEach(item => {
            tbody.innerHTML += `<tr><td>${item.title}</td><td>${item.value}</td><td>${item.stage}</td><td>${item.probability}</td></tr>`;
        });
    } else if (tabName === 'sales') {
        title.textContent = '💰 سجل المبيعات والفواتير';
        thead.innerHTML = `<th>رقم الفاتورة</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th>`;
        (currentCustomer.sales || []).forEach(item => {
            tbody.innerHTML += `<tr><td><b>${item.invId}</b></td><td>${item.date}</td><td>${item.total}</td><td>${item.status}</td></tr>`;
        });
    } else if (tabName === 'attachments') {
        title.textContent = '📎 الملفات والمرفقات';
        thead.innerHTML = `<th>اسم الملف</th><th>تاريخ الإضافة</th><th>ملاحظات</th><th>حجم الملف</th>`;
        (currentCustomer.attachments || []).forEach(item => {
            tbody.innerHTML += `<tr><td>${item.name}</td><td>${item.date}</td><td>${item.note || '-'}</td><td>${item.size || 'تم الرفع سحابياً'}</td></tr>`;
        });
    }
}

// 5. حفظ البيانات في قاعدة البيانات Firestore
async function saveToFirestore() {
    if (!currentCustomerId || !currentCustomer) return;
    try {
        const docRef = doc(db, 'asgate_customers', currentCustomerId);
        await updateDoc(docRef, currentCustomer);
    } catch (error) {
        console.error("خطأ أثناء تحديث البيانات في السحابة:", error);
    }
}

// العودة للصفحة السابقة
function goBackAndFocus() {
    window.location.href = 'customers.html';
}

// 6. التعامل مع النافذة المنبثقة للأنشطة
function openNoteModal() { document.getElementById('noteModal').style.display = 'flex'; }
function closeNoteModal() { document.getElementById('noteModal').style.display = 'none'; }
function handleFileSelect(input) {
    const fileName = input.files[0] ? input.files[0].name : "لم يتم اختيار ملف";
    document.getElementById('fileName').textContent = fileName;
}

// حفظ النشاط سحابياً وربطه بالعميل
async function saveActivity() {
    const note = document.getElementById('activityNote').value;
    const fileInput = document.getElementById('fileUpload');
    
    if (note.trim() === '' && !fileInput.files.length) {
        return alert('يرجى كتابة ملاحظة أو اختيار ملف.');
    }
    
    const today = new Date().toISOString().split('T')[0];
    const newAttachment = {
        name: fileInput.files.length > 0 ? fileInput.files[0].name : 'ملاحظة نصية فقط',
        date: today,
        note: note
    };

    if(!currentCustomer.attachments) currentCustomer.attachments = [];
    currentCustomer.attachments.push(newAttachment);
    
    await saveToFirestore();
    
    alert('تم حفظ النشاط بنجاح في السحابة');
    document.getElementById('activityNote').value = '';
    document.getElementById('fileName').textContent = 'لم يتم اختيار ملف';
    fileInput.value = '';
    closeNoteModal();
    switchTab('attachments'); // تحديث جدول المرفقات ليظهر النشاط الجديد
}

// تمرير الوظائف للـ Window Object لكي تعمل من خلال أحداث onclick الموجودة في HTML (بسبب إعدادات Modules)
window.goBackAndFocus = goBackAndFocus;
window.switchTab = switchTab;
window.setPrimaryManager = setPrimaryManager;
window.addNewManagerRow = addNewManagerRow;
window.updateManager = updateManager;
window.deleteManagerRow = deleteManagerRow;
window.openNoteModal = openNoteModal;
window.closeNoteModal = closeNoteModal;
window.handleFileSelect = handleFileSelect;
window.saveActivity = saveActivity;