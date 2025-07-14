class QuranApp {
    constructor() {
        this.history = JSON.parse(localStorage.getItem('verseHistory')) || [];
        this.favorites = JSON.parse(localStorage.getItem('verseFavorites')) || [];
        this.availableVerses = this.initializeVersePool();
        this.currentVerse = null;

        this.dom = {
            verseText: document.getElementById('verse-text'),
            verseTranslation: document.getElementById('verse-translation'),
            verseReference: document.getElementById('verse-reference'),
            generateBtn: document.getElementById('generate-btn'),
            themeToggle: document.getElementById('theme-toggle'),
            loader: document.getElementById('loader'),
            historyList: document.getElementById('history-list'),
            historyToggle: document.getElementById('history-toggle'),
            historySection: document.getElementById('history-section'),
            favoritesList: document.getElementById('favorites-list'),
            favoritesSection: document.getElementById('favorites-section'),
            favoritesToggle: document.getElementById('favorites-toggle'),
            favoriteBtn: document.getElementById('favorite-btn'),
            verseAudio: document.getElementById('verse-audio'),
            playBtn: document.getElementById('play-btn'),
            progressBar: document.getElementById('progress-bar'),
            currentTime: document.getElementById('current-time'),
            volumeSlider: document.getElementById('volume-slider')
        };

        this.init();
    }

    init() {
        this.loadTheme();
        this.initEventListeners();
        this.loadNewVerse();
        this.renderHistory();
        this.renderFavorites();

        if (this.favorites.length > 0) {
            this.dom.favoritesSection.classList.add('visible');
        }
    }

    initEventListeners() {
        this.dom.generateBtn.addEventListener('click', () => this.loadNewVerse());
        this.dom.themeToggle.addEventListener('click', () => this.toggleTheme());
        this.dom.historyToggle.addEventListener('click', () => this.toggleHistory());
        this.dom.favoritesToggle.addEventListener('click', () => this.toggleFavorites());
        this.dom.favoriteBtn.addEventListener('click', () => this.toggleFavorite());

        this.dom.playBtn.addEventListener('click', () => this.toggleAudioPlayback());
        this.dom.verseAudio.addEventListener('timeupdate', () => this.updateProgressBar());
        this.dom.verseAudio.addEventListener('ended', () => {
            this.dom.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        });
        this.dom.progressBar.addEventListener('click', (e) => this.seekAudio(e));
        this.dom.volumeSlider.addEventListener('input', () => {
            this.dom.verseAudio.volume = this.dom.volumeSlider.value;
        });
    }

    getMaxAyahs(surah) {
        const ayahCounts = [
            7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
            123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
            112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
            34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
            54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
            60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
            14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
            28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
            29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
            15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
            11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
            5, 4, 5, 6
        ];
        return ayahCounts[surah - 1];
    }

    initializeVersePool() {
        const verses = [];
        for (let surah = 1; surah <= 114; surah++) {
            const maxAyah = this.getMaxAyahs(surah);
            for (let ayah = 1; ayah <= maxAyah; ayah++) {
                verses.push(`${surah}:${ayah}`);
            }
        }
        // Fisher-Yates shuffle
        for (let i = verses.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [verses[i], verses[j]] = [verses[j], verses[i]];
        }
        return verses;
    }

    getRandomVerse() {
        if (this.availableVerses.length < 100) {
            // Rebuild and shuffle when pool is running low
            this.availableVerses = this.initializeVersePool();
        }

        // Take a verse from the shuffled pool
        const verseKey = this.availableVerses.pop();
        const [surah, ayah] = verseKey.split(':').map(Number);
        return [surah, ayah, verseKey];
    }

    async loadNewVerse() {
        try {
            this.toggleLoader(true);
            const [surah, ayah, verseKey] = this.getRandomVerse();

            const [verseData, translationData, surahData, audioData] = await Promise.all([
                fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/ar.alafasy?cache=${Date.now()}`),
                fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/en.sahih?cache=${Date.now()}`),
                fetch(`https://api.alquran.cloud/v1/surah/${surah}?cache=${Date.now()}`),
                fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/ar.alafasy?cache=${Date.now()}`)
            ]);

            if (!verseData.ok || !translationData.ok || !surahData.ok || !audioData.ok) {
                throw new Error('Failed to fetch data');
            }

            const verse = await verseData.json();
            const translation = await translationData.json();
            const surahName = (await surahData.json()).data.englishName;
            const audio = await audioData.json();

            this.currentVerse = {
                arabic: verse.data.text,
                translation: translation.data.text,
                reference: `${surahName} (${ayah})`,
                surahNumber: surah,
                ayahNumber: ayah,
                key: verseKey,
                audio: audio.data.audio || `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${verse.data.number}.mp3`
            };

            this.updateUI();
            this.addToHistory();
            this.updateFavoriteButton();
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred while loading the verse.');
            setTimeout(() => this.loadNewVerse(), 2000);
        } finally {
            this.toggleLoader(false);
        }
    }

    showErrorNotification() {
        const errorEl = document.createElement('div');
        errorEl.className = 'error-notification';
        errorEl.textContent = 'Connection issue - retrying...';
        document.body.appendChild(errorEl);

        setTimeout(() => errorEl.remove(), 3000);
    }

    showSuccessNotification(message) {
        const successEl = document.createElement('div');
        successEl.className = 'success-notification';
        successEl.textContent = message;
        document.body.appendChild(successEl);

        setTimeout(() => successEl.remove(), 3000);
    }

    updateUI() {
        if (!this.currentVerse) return;
        
        this.dom.verseText.textContent = this.currentVerse.arabic;
        this.dom.verseTranslation.textContent = this.currentVerse.translation;
        this.dom.verseReference.textContent = this.currentVerse.reference;
        
        if (this.currentVerse.audio && this.currentVerse.audio.startsWith('http')) {
            this.dom.verseAudio.src = this.currentVerse.audio;
            this.dom.verseAudio.load();
            this.dom.playBtn.disabled = false;
        } else {
            this.dom.verseAudio.src = '';
            this.dom.playBtn.disabled = true;
        }
        
        this.dom.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        this.dom.progressBar.style.width = '0%';
        this.dom.currentTime.textContent = '0:00';
    }

    addToHistory() {
        if (!this.currentVerse) return;

        const existingIndex = this.history.findIndex(v => v.key === this.currentVerse.key);

        if (existingIndex !== -1) {
            this.history.splice(existingIndex, 1);
        }

        this.history.unshift({
            ...this.currentVerse,
            timestamp: new Date().toISOString()
        });

        if (this.history.length > 20) this.history.pop();

        localStorage.setItem('verseHistory', JSON.stringify(this.history));
        this.renderHistory();
    }

    toggleFavorite() {
        if (!this.currentVerse) return;

        const isFavorite = this.favorites.some(v => v.key === this.currentVerse.key);

        if (isFavorite) {
            this.removeFavorite();
        } else {
            this.addFavorite();
        }
    }

    addFavorite() {
        if (!this.currentVerse) return;

        if (this.favorites.some(v => v.key === this.currentVerse.key)) return;

        this.favorites.unshift({
            ...this.currentVerse,
            timestamp: new Date().toISOString()
        });

        localStorage.setItem('verseFavorites', JSON.stringify(this.favorites));
        this.updateFavoriteButton();
        this.renderFavorites();

        if (!this.dom.favoritesSection.classList.contains('visible')) {
            this.dom.favoritesSection.classList.add('visible');
        }

        this.showSuccessNotification('Added to favorites');
    }

    removeFavorite() {
        if (!this.currentVerse) return;

        this.favorites = this.favorites.filter(v => v.key !== this.currentVerse.key);
        localStorage.setItem('verseFavorites', JSON.stringify(this.favorites));
        this.updateFavoriteButton();
        this.renderFavorites();

        if (this.favorites.length === 0) {
            this.dom.favoritesSection.classList.remove('visible');
        }

        this.showSuccessNotification('Removed from favorites');
    }

    updateFavoriteButton() {
        if (!this.currentVerse) return;

        const isFavorite = this.favorites.some(v => v.key === this.currentVerse.key);
        const icon = this.dom.favoriteBtn.querySelector('i');

        if (isFavorite) {
            icon.className = 'fas fa-heart';
            this.dom.favoriteBtn.classList.add('active');
        } else {
            icon.className = 'far fa-heart';
            this.dom.favoriteBtn.classList.remove('active');
        }
    }

    renderHistory() {
        this.dom.historyList.innerHTML = this.history
            .slice(0, 5)
            .map((item, index) => `
                <div class="history-item">
                    <div class="history-header">
                        <span class="history-index">${index + 1}.</span>
                        <span class="history-reference">${item.reference}</span>
                    </div>
                    <div class="history-arabic">${item.arabic}</div>
                    <div class="history-translation">${item.translation}</div>
                </div>
            `).join('');
    }

    renderFavorites() {
        this.dom.favoritesList.innerHTML = this.favorites
            .slice(0, 10)
            .map((item, index) => `
                <div class="favorite-item">
                    <div class="favorite-header">
                        <span class="favorite-index">${index + 1}.</span>
                        <span class="favorite-reference">${item.reference}</span>
                    </div>
                    <div class="favorite-arabic">${item.arabic}</div>
                    <div class="favorite-translation">${item.translation}</div>
                    <div class="favorite-actions">
                        <button class="favorite-play" data-key="${item.key}">
                            <i class="fas fa-play"></i> Play
                        </button>
                        <button class="favorite-remove" data-key="${item.key}">
                            <i class="fas fa-trash"></i> Remove
                        </button>
                    </div>
                </div>
            `).join('');

        document.querySelectorAll('.favorite-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const key = e.currentTarget.dataset.key;
                this.playFavorite(key);
            });
        });

        document.querySelectorAll('.favorite-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const key = e.currentTarget.dataset.key;
                this.removeFavoriteByKey(key);
            });
        });
    }

    playFavorite(key) {
        const verse = this.favorites.find(v => v.key === key);
        if (!verse) return;
        this.currentVerse = verse;
        this.updateUI();
        if (verse.audio && verse.audio.startsWith('http')) {
            this.toggleAudioPlayback();
        } else {
            console.error('Audio not available for this verse');
            alert('Audio is not available for this verse.');
        }
        this.updateFavoriteButton();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    removeFavoriteByKey(key) {
        this.favorites = this.favorites.filter(v => v.key !== key);
        localStorage.setItem('verseFavorites', JSON.stringify(this.favorites));
        this.renderFavorites();

        if (this.currentVerse && this.currentVerse.key === key) {
            this.updateFavoriteButton();
        }

        if (this.favorites.length === 0) {
            this.dom.favoritesSection.classList.remove('visible');
        }

        this.showSuccessNotification('Removed from favorites');
    }

    toggleHistory() {
        this.dom.historySection.classList.toggle('visible');
        this.dom.historyToggle.textContent =
            this.dom.historySection.classList.contains('visible')
            ? 'Hide History'
            : 'Show History';
    }

    toggleFavorites() {
        this.dom.favoritesSection.classList.toggle('visible');
    }

    toggleLoader(show) {
        this.dom.loader.style.display = show ? 'flex' : 'none';
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
    }

    toggleTheme() {
        const newTheme = document.documentElement.getAttribute('data-theme') === 'dark'
            ? 'light'
            : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }

    toggleAudioPlayback() {
        if (this.dom.verseAudio.paused) {
            this.dom.verseAudio.play();
            this.dom.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            this.dom.verseAudio.pause();
            this.dom.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        }
    }

    updateProgressBar() {
        const { currentTime, duration } = this.dom.verseAudio;
        const progressPercent = (currentTime / duration) * 100;
        this.dom.progressBar.style.width = `${progressPercent}%`;

        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        };

        this.dom.currentTime.textContent = formatTime(currentTime);
    }

    seekAudio(e) {
        const progressContainer = this.dom.progressBar.parentElement;
        const width = progressContainer.clientWidth;
        const clickX = e.offsetX;
        const duration = this.dom.verseAudio.duration;

        this.dom.verseAudio.currentTime = (clickX / width) * duration;
    }
}

const checkMobileFont = () => {
    const testText = 'اللّه';
    const fontFamily = 'Noto Naskh Arabic';
    const fallbackFont = 'monospace';

    const testElement1 = document.createElement('span');
    testElement1.style.fontFamily = fontFamily;
    testElement1.style.position = 'absolute';
    testElement1.style.visibility = 'hidden';
    testElement1.innerHTML = testText;

    const testElement2 = document.createElement('span');
    testElement2.style.fontFamily = fallbackFont;
    testElement2.style.position = 'absolute';
    testElement2.style.visibility = 'hidden';
    testElement2.innerHTML = testText;

    document.body.appendChild(testElement1);
    document.body.appendChild(testElement2);

    setTimeout(() => {
        const width1 = testElement1.offsetWidth;
        const width2 = testElement2.offsetWidth;
        if (width1 === width2) {
            console.warn('Arabic font failed to load, using system fallback');
        }
        testElement1.remove();
        testElement2.remove();
    }, 1000);
};

window.addEventListener('load', () => {
    checkMobileFont();
    document.fonts.ready.then(() => new QuranApp());
});
