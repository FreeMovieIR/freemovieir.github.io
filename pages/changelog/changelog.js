const changelogData = [
    {
        version: "2.1.0",
        date: "۱۴۰۲/۱۲/۰۵",
        type: "major",
        changes: [
            { feature: "بازطراحی انقلابی هدر سایت با تم Glassmorphism 2.0 و افکت‌های نوری", contributor: "Antigravity" },
            { feature: "ارتقای دکمه گزارش باگ به منوی شناور (FAB) حرفه‌ای و تعاملی", contributor: "Antigravity" },
            { feature: "نمایش هوشمند عناوین دوگانه (فارسی/انگلیسی) و سال تولید در تمامی بخش‌ها", contributor: "Antigravity" },
            { feature: "بازطراحی کامل صفحه تيم با کارت‌های مدرن و لینک‌های شبکه‌های اجتماعی", contributor: "Antigravity" },
            { feature: "رفع باگ بحرانی عدم نمایش تصاویر در بخش جستجو", contributor: "Antigravity" },
            { feature: "بهینه‌سازی سئو و متاتگ‌های داینامیک برای بهبود رتبه در موتورهای جستجو", contributor: "Antigravity" }
        ]
    },
    {
        version: "2.0.0",
        date: "۱۴۰۲/۱۲/۰۴",
        type: "major",
        changes: [
            { feature: "بازطراحی کامل رابط کاربری به سبک Glassmorphism", contributor: "Antigravity" },
            { feature: "یکپارچه‌سازی سیستم اعلان‌های هوشمند (Toast)", contributor: "Antigravity" },
            { feature: "بهبود سیستم جستجوی هوشمند و فیلترهای پیشرفته", contributor: "Antigravity" },
            { feature: "مهاجرت کامل به ساختار SPA برای تجربه کاربری سریع‌تر", contributor: "Antigravity" }
        ]
    },
    {
        version: "1.3.0",
        date: "۱۴۰۲/۰۱/۰۷",
        type: "feature",
        changes: [
            { feature: "اضافه شدن نوار پیشرفت بارگذاری", contributor: "ریک سانچز" },
            { feature: "بهبود کش تصاویر برای سرعت بیشتر", contributor: "علی رضایی" },
            { feature: "رفع باگ نمایش فیلم‌های تکراری", contributor: "سارا محمدی" }
        ]
    },
    {
        version: "1.2.0",
        date: "۱۴۰۱/۱۲/۱۵",
        type: "fix",
        changes: [
            { feature: "اضافه شدن پاپ‌آپ حمایت", contributor: "ریک سانچز" },
            { feature: "پشتیبانی از تم روشن", contributor: "ارمین جوان" }
        ]
    }
];

function displayChangelog() {
    const container = document.getElementById('changelog-container');
    if (!container) return;

    container.innerHTML = '';

    changelogData.forEach((entry) => {
        const entryHtml = `
            <div class="relative pr-16 group">
                <!-- Timeline Dot -->
                <div class="absolute right-0 top-6 w-[64px] h-[64px] flex items-center justify-center">
                    <div class="w-4 h-4 bg-amber-500 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.5)] group-hover:scale-125 transition-transform z-10"></div>
                    <div class="absolute inset-0 bg-amber-500/10 rounded-full animate-pulse"></div>
                </div>

                <div class="glass-card-premium p-8 rounded-3xl border border-white/10 hover:border-amber-500/30 transition-all duration-500">
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div>
                            <span class="text-xs font-black text-amber-500 uppercase tracking-widest bg-amber-500/10 px-3 py-1 rounded-full mb-2 inline-block">
                                ${entry.type === 'major' ? 'آپدیت بزرگ' : (entry.type === 'feature' ? 'قابلیت جدید' : 'بهبود')}
                            </span>
                            <h2 class="text-2xl font-black text-white">نسخه ${entry.version}</h2>
                        </div>
                        <div class="text-gray-500 text-sm font-bold flex items-center gap-2">
                            <i class="far fa-calendar-alt"></i>
                            ${entry.date}
                        </div>
                    </div>

                    <ul class="space-y-4">
                        ${entry.changes.map(change => `
                            <li class="flex items-start gap-3 bg-white/5 p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                                <i class="fas fa-check-circle text-amber-500 mt-1"></i>
                                <div class="flex-1">
                                    <p class="text-sm text-gray-200 font-bold mb-1">${change.feature}</p>
                                    <p class="text-[10px] text-gray-500 uppercase tracking-tighter">توسط: ${change.contributor}</p>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', entryHtml);
    });
}

document.addEventListener('DOMContentLoaded', displayChangelog);