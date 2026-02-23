const jsonUrl = "about.json";

async function fetchAndDisplayAboutContent() {
    try {
        const response = await fetch(jsonUrl);
        if (!response.ok) throw new Error(`Server Error: ${response.status}`);
        const data = await response.json();

        // Update content sections
        const aboutTitle = document.getElementById("about-title");
        if (aboutTitle) aboutTitle.textContent = data.title || "درباره فیری مووی";

        const aboutDescription = document.getElementById("about-description");
        if (aboutDescription) {
            aboutDescription.innerHTML = data.description || "فیری مووی پروژه‌ای است با هدف ارتقای تجربه تماشای سینمای جهان برای فارسی‌زبانان.";
        }

        const missionTitle = document.getElementById("mission-title");
        if (missionTitle) missionTitle.textContent = data.mission_title || "ماموریت ما";

        const missionDescription = document.getElementById("mission-description");
        if (missionDescription) {
            missionDescription.innerHTML = data.mission_description || "دسترسی آزاد، سریع و با کیفیت به جدیدترین محصولات سینمایی و تکنولوژی‌های روز وب.";
        }

        const teamTitle = document.getElementById("team-title");
        if (teamTitle) teamTitle.textContent = data.team_title || "تیم توسعه";

        const teamDescription = document.getElementById("team-description");
        if (teamDescription) {
            teamDescription.innerHTML = data.team_description || "گروهی از علاقه‌مندان به سینما و برنامه‌نویسان خلاق که برای بهبود این پلتفرم تلاش می‌کنند.";
        }

        const siteLink = document.getElementById("site-link");
        if (siteLink && data.site_url) siteLink.setAttribute("href", data.site_url);

    } catch (error) {
        console.error("Error fetching about info:", error);
    }
}

document.addEventListener("DOMContentLoaded", fetchAndDisplayAboutContent);