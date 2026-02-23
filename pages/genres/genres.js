const tmdbApiKey = window.CONFIG ? window.CONFIG.TMDB_DEFAULT_KEY : '1dc4cbf81f0accf4fa108820d551dafc';

async function fetchGenres() {
    const container = document.getElementById('genre-list');
    const tmdbKey = localStorage.getItem('userTmdbToken') || tmdbApiKey;
    const tmdbBase = window.CONFIG ? window.CONFIG.API.TMDB : 'https://api.themoviedb.org/3';
    const apiUrl = `${tmdbBase}/genre/movie/list?api_key=${tmdbKey}&language=fa-IR`;
    const proxiedUrl = window.proxify ? window.proxify(apiUrl) : apiUrl;

    try {
        const response = await fetch(proxiedUrl);
        if (!response.ok) throw new Error(`Server Error: ${response.status}`);
        const data = await response.json();
        const genres = data.genres || [];

        container.innerHTML = '';

        genres.forEach(genre => {
            const card = `
                <a href="/pages/finder/index.html?genreId=${genre.id}" class="group glass-card-premium p-8 rounded-3xl border border-white/10 flex flex-col items-center justify-center gap-4 transition-all duration-300 hover:scale-[1.05] hover:border-amber-500/50 hover:shadow-2xl hover:shadow-amber-500/10">
                    <div class="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-black transition-all">
                        <i class="fas ${getIconForGenre(genre.id)} text-xl"></i>
                    </div>
                    <h3 class="text-sm font-black group-hover:text-amber-500 transition-all">${genre.name}</h3>
                </a>
            `;
            container.insertAdjacentHTML('beforeend', card);
        });
    } catch (error) {
        console.error('Error fetching genres:', error);
        container.innerHTML = '<p class="text-center text-red-500 col-span-full font-bold">خطا در بارگذاری ژانرها!</p>';
    }
}

function getIconForGenre(id) {
    const icons = {
        28: 'fa-fire', // Action
        12: 'fa-mountain', // Adventure
        16: 'fa-child', // Animation
        35: 'fa-laugh', // Comedy
        80: 'fa-mask', // Crime
        99: 'fa-camera', // Documentary
        18: 'fa-theater-masks', // Drama
        10751: 'fa-users', // Family
        14: 'fa-wand-magic-sparkles', // Fantasy
        36: 'fa-landmark', // History
        27: 'fa-ghost', // Horror
        10402: 'fa-music', // Music
        9648: 'fa-clue', // Mystery
        10749: 'fa-heart', // Romance
        878: 'fa-flask', // Science Fiction
        10770: 'fa-tv', // TV Movie
        53: 'fa-user-ninja', // Thriller
        10752: 'fa-gun', // War
        37: 'fa-hat-cowboy' // Western
    };
    return icons[id] || 'fa-film';
}

document.addEventListener('DOMContentLoaded', fetchGenres);