// URL of the JSON file (assumed to be hosted at this location; adjust as needed)
const jsonUrl = "about.json";

// Function to fetch and display about page content
async function fetchAndDisplayAboutContent() {
    try {
        const response = await fetch(jsonUrl);
        if (!response.ok) {
            throw new Error(`خطای سرور: ${response.status}`);
        }

        const data = await response.json();

        // Update page title and meta tags
        document.title = data.title || "درباره فیری مووی";
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) metaDescription.setAttribute("content", data.meta_description || "درباره فیری مووی - اطلاعات بیشتر درباره پلتفرم ما");

        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) ogTitle.setAttribute("content", data.title || "درباره فیری مووی");

        const ogDescription = document.querySelector('meta[property="og:description"]');
        if (ogDescription) ogDescription.setAttribute("content", data.meta_description || "درباره فیری مووی - اطلاعات بیشتر درباره پلتفرم ما");

        const twitterTitle = document.querySelector('meta[name="twitter:title"]');
        if (twitterTitle) twitterTitle.setAttribute("content", data.title || "درباره فیری مووی");

        const twitterDescription = document.querySelector('meta[name="twitter:description"]');
        if (twitterDescription) twitterDescription.setAttribute("content", data.meta_description || "درباره فیری مووی - اطلاعات بیشتر درباره پلتفرم ما");

        // Update content sections
        const aboutTitle = document.getElementById("about-title");
        if (aboutTitle) aboutTitle.textContent = data.title || "درباره فیری مووی";

        const aboutDescription = document.getElementById("about-description");
        if (aboutDescription) aboutDescription.innerHTML = data.description || "توضیحات در دسترس نیست.";

        const missionTitle = document.getElementById("mission-title");
        if (missionTitle) missionTitle.textContent = data.mission_title || "ماموریت ما";

        const missionDescription = document.getElementById("mission-description");
        if (missionDescription) missionDescription.innerHTML = data.mission_description || "توضیحات در دسترس نیست.";

        const teamTitle = document.getElementById("team-title");
        if (teamTitle) teamTitle.textContent = data.team_title || "تیم ما";

        const teamDescription = document.getElementById("team-description");
        if (teamDescription) teamDescription.innerHTML = data.team_description || "توضیحات در دسترس نیست.";

        const siteLink = document.getElementById("site-link");
        if (siteLink && data.site_url) siteLink.setAttribute("href", data.site_url);

    } catch (error) {
        console.error("خطا در دریافت اطلاعات:", error);
        const sections = ["about-description", "mission-description", "team-description"];
        sections.forEach(section => {
            const element = document.getElementById(section);
            if (element) element.innerHTML = `<p class="text-red-500">خطا در بارگذاری اطلاعات: ${error.message}</p>`;
        });
    }
}

// Load content when the page is ready
document.addEventListener("DOMContentLoaded", fetchAndDisplayAboutContent);