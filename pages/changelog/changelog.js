// changelog.js
// داده‌های نمونه برای تغییرات (می‌توانید این را به صورت دستی یا از یک API پر کنید)
const changelogData = [
    {
        version: "1.3.0",
        date: "1404/01/07",
        changes: [
            { feature: "اضافه شدن نوار پیشرفت بارگذاری", contributor: "ریک سانچز" },
            { feature: "بهبود کش تصاویر برای سرعت بیشتر", contributor: "علی رضایی" },
            { feature: "رفع باگ نمایش فیلم‌های تکراری", contributor: "سارا محمدی" }
        ]
    },
    {
        version: "1.2.0",
        date: "1403/12/15",
        changes: [
            { feature: "اضافه شدن پاپ‌آپ حمایت", contributor: "ریک سانچز" },
            { feature: "پشتیبانی از تم روشن", contributor: "ارمین جوان" }
        ]
    },
    {
        version: "1.1.0",
        date: "1403/11/01",
        changes: [
            { feature: "اضافه شدن بخش جستجو", contributor: "ارمین جوان" },
            { feature: "بهینه‌سازی رابط کاربری", contributor: "ریک سانچز" }
        ]
    }
];

// توابع مدیریت نوار پیشرفت
function startLoadingBar() {
    const loadingBar = document.getElementById('loading-bar');
    if (loadingBar) {
        loadingBar.style.width = '0';
        setTimeout(() => {
            loadingBar.style.width = '30%';
        }, 100);
    }
}

function finishLoadingBar() {
    const loadingBar = document.getElementById('loading-bar');
    if (loadingBar) {
        loadingBar.style.width = '100%';
        setTimeout(() => {
            loadingBar.style.width = '0';
        }, 300);
    }
}

// تابع برای نمایش تغییرات
function displayChangelog() {
    const container = document.getElementById('changelog-container');
    if (!container) {
        console.error('عنصر changelog-container یافت نشد');
        return;
    }

    startLoadingBar();

    container.innerHTML = ''; // پاکسازی محتوای قبلی

    changelogData.forEach((entry) => {
        const versionCard = `
            <div class="version-card bg-gray-800 p-6 rounded-lg shadow-md">
                <h2 class="text-xl font-bold text-yellow-400 mb-2">نسخه ${entry.version}</h2>
                <p class="text-sm text-gray-400 mb-4">تاریخ انتشار: ${entry.date}</p>
                <ul class="space-y-2">
                    ${entry.changes.map(change => `
                        <li class="flex items-center">
                            <i class="fas fa-check text-green-500 ml-2"></i>
                            <span>${change.feature} - <span class="text-gray-300">اضافه شده توسط: ${change.contributor}</span></span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
        container.innerHTML += versionCard;
    });

    finishLoadingBar();
}

// اجرای تابع پس از بارگذاری صفحه
document.addEventListener('DOMContentLoaded', () => {
    console.log('صفحه تغییرات بارگذاری شد');
    displayChangelog();
});