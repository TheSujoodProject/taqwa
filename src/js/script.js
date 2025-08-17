class ApiCache {
    constructor(ttl = 600000) {
        this.cache = new Map();
        this.ttl = ttl;
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() - item.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }
        return item.data;
    }

    set(key, data) {
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    cleanup() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.ttl) {
                this.cache.delete(key);
            }
        }
    }

    clear() {
        this.cache.clear();
    }
}

class Storage {
    static get(key, fallback = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : fallback;
        } catch {
            return fallback;
        }
    }

    static set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }

    static remove(key) {
        localStorage.removeItem(key);
    }

    static clear() {
        localStorage.clear();
    }
}

class NotificationManager {
    static show(message, type = 'error', duration = 3000) {
        const existing = document.querySelector(`.${type}-notification`);
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `${type}-notification`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), duration);
    }
}

class ApiService {
    constructor() {
        this.cache = new ApiCache();
        this.baseUrl = 'https://api.alquran.cloud/v1';
        
        setInterval(() => this.cache.cleanup(), 300000); 
    }

    async request(endpoint, retries = 2) {
        const url = `${this.baseUrl}/${endpoint}`;
        const cached = this.cache.get(url);
        if (cached) return cached;

        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url);
                
                if (response.status === 429) {
                    await this.delay(500 * (i + 1));
                    continue;
                }

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.json();
                this.cache.set(url, data);
                return data;
            } catch (error) {
                if (i === retries - 1) throw error;
                await this.delay(300);
            }
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getAyah(surah, ayah, edition) {
        return this.request(`ayah/${surah}:${ayah}/${edition}`);
    }

    async getSurah(surah) {
        return this.request(`surah/${surah}`);
    }
}

class VerseManager {
    constructor() {
        this.ayahCounts = [
            7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
            112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53,
            89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12,
            12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26,
            30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6
        ];
        this.pool = [];
        this.recentVerses = new Set();
        this.maxRecent = 75; 
        this.initPool();
    }

    getRandomValue() {
        if (window.crypto && window.crypto.getRandomValues) {
            const array = new Uint32Array(1);
            window.crypto.getRandomValues(array);
            return array[0] / 4294967295;
        }
        return Math.random();
    }

    generateSeed() {
        const now = Date.now();
        const performanceNow = performance.now();
        return now ^ (performanceNow * 1000);
    }

    shuffle(array) {
        const seed = this.generateSeed();
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.getRandomValue() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    initPool() {
        const verses = [];
        for (let s = 1; s <= 114; s++) {
            for (let a = 1; a <= this.ayahCounts[s - 1]; a++) {
                verses.push(`${s}:${a}`);
            }
        }

        this.pool = verses;
        for (let i = 0; i < 3; i++) {
            this.pool = this.shuffle(this.pool);
        }
    }

    getRandom() {
        if (this.pool.length < this.maxRecent) {
            this.initPool(); 
            this.recentVerses.clear(); 
        }

        let verse;
        let attempts = 0;
        const maxAttempts = 10;

        do {
            const index = Math.floor(this.getRandomValue() * this.pool.length);
            verse = this.pool[index];
            attempts++;
            if (!this.recentVerses.has(verse) || attempts >= maxAttempts) {
                this.pool.splice(index, 1); 
                break;
            }
        } while (this.pool.length > 0);

        if (!verse) {
            this.initPool();
            verse = this.pool.pop();
        }

        this.recentVerses.add(verse);
        if (this.recentVerses.size > this.maxRecent) {
            const iterator = this.recentVerses.values();
            this.recentVerses.delete(iterator.next().value); 
        }

        const [surah, ayah] = verse.split(':').map(Number);
        return { surah, ayah, key: verse };
    }
}

class Taqwa {
    constructor() {
        this.api = new ApiService();
        this.verseManager = new VerseManager();
        this.surahCache = new Map();
        this.currentVerse = null;
        this.isLoading = false;
        
        this.settings = Storage.get('appSettings', {
            recitation: 'ar.alafasy',
            script: 'ar.uthmani',
            translation: 'en.sahih'
        });
        
        this.history = Storage.get('verseHistory', []);
        this.favorites = Storage.get('verseFavorites', []);
        
        this.bindElements();
        this.init();
    }

    bindElements() {
        this.dom = {};
        const elements = [
            'verse-text', 'verse-translation', 'verse-reference', 'generate-btn',
            'theme-toggle', 'loader', 'history-list', 'history-toggle', 
            'history-section', 'favorites-list', 'favorites-section', 
            'favorites-toggle', 'favorite-btn', 'verse-audio', 'play-btn',
            'progress-bar', 'current-time', 'volume-slider', 'settings-btn',
            'settings-modal', 'close-settings', 'save-settings'
        ];
        
        elements.forEach(id => {
            this.dom[id.replace('-', '')] = document.getElementById(id);
        });
    }

    init() {
        this.loadTheme();
        this.bindEvents();
        this.applySettings();
        this.loadNewVerse();
        this.renderHistory();
        this.renderFavorites();
        
        if (this.favorites.length > 0) {
            this.dom.favoritessection.classList.add('visible');
        }
    }

    bindEvents() {
        this.dom.generatebtn.onclick = () => this.loadNewVerse();
        this.dom.themetoggle.onclick = () => this.toggleTheme();
        this.dom.historytoggle.onclick = () => this.toggleHistory();
        this.dom.favoritestoggle.onclick = () => this.toggleFavorites();
        this.dom.favoritebtn.onclick = () => this.toggleFavorite();
        
        this.dom.playbtn.onclick = () => this.toggleAudio();
        this.dom.verseaudio.ontimeupdate = () => this.updateProgress();
        this.dom.verseaudio.onended = () => this.resetPlayButton();
        this.dom.progressbar.parentElement.onclick = (e) => this.seekAudio(e);
        this.dom.volumeslider.oninput = (e) => this.dom.verseaudio.volume = e.target.value;
        
        this.dom.settingsbtn.onclick = () => this.openSettings();
        this.dom.closesettings.onclick = () => this.closeSettings();
        this.dom.savesettings.onclick = () => this.saveSettings();
        
        document.querySelectorAll('.tab').forEach(tab => {
            tab.onclick = () => this.switchTab(tab);
        });
        
        document.querySelectorAll('.option-card').forEach(card => {
            card.onclick = () => this.selectOption(card);
        });
    }

    async loadNewVerse() {
        if (this.isLoading) return;
        
        try {
            this.isLoading = true;
            this.toggleLoader(true);
            
            const { surah, ayah, key } = this.verseManager.getRandom();
            
            let surahName = this.surahCache.get(surah);
            if (!surahName) {
                const surahData = await this.api.getSurah(surah);
                surahName = surahData?.data?.englishName || `Surah ${surah}`;
                this.surahCache.set(surah, surahName);
            }
            
            const [verseData, translationData] = await Promise.all([
                this.api.getAyah(surah, ayah, this.settings.script),
                this.api.getAyah(surah, ayah, this.settings.translation)
            ]);
            
            if (!verseData || !translationData) {
                throw new Error('Failed to load verse data');
            }
            
            let audioUrl = null;
            try {
                const audioData = await this.api.getAyah(surah, ayah, this.settings.recitation);
                audioUrl = audioData?.data?.audio;
            } catch {
               
            }
            
            this.currentVerse = {
                arabic: verseData.data.text,
                translation: translationData.data.text,
                reference: `${surahName} (${ayah})`,
                surahNumber: surah,
                ayahNumber: ayah,
                key,
                audio: audioUrl
            };
            
            this.updateUI();
            this.addToHistory();
            this.updateFavoriteButton();
            
        } catch (error) {
            this.handleError(error, 'Loading verse');
            setTimeout(() => this.loadNewVerse(), 2000);
        } finally {
            this.isLoading = false;
            this.toggleLoader(false);
        }
    }

    updateUI() {
        if (!this.currentVerse) return;
        
        const { arabic, translation, reference, audio } = this.currentVerse;
        
        this.dom.versetext.textContent = arabic;
        this.dom.versetranslation.textContent = translation;
        this.dom.versereference.textContent = reference;
        
        if (audio && audio.startsWith('http')) {
            this.dom.verseaudio.src = audio;
            this.dom.verseaudio.load();
            this.dom.playbtn.disabled = false;
        } else {
            this.dom.verseaudio.src = '';
            this.dom.playbtn.disabled = true;
            this.resetPlayButton();
        }
    }

    addToHistory() {
        if (!this.currentVerse) return;
        this.history = this.history.filter(v => v.key !== this.currentVerse.key);
        
        this.history.unshift({
            ...this.currentVerse,
            timestamp: new Date().toISOString()
        });
        
        if (this.history.length > 20) this.history.pop();
        
        Storage.set('verseHistory', this.history);
        this.renderHistory();
    }

    toggleFavorite() {
        if (!this.currentVerse) return;
        
        const exists = this.favorites.some(v => v.key === this.currentVerse.key);
        
        if (exists) {
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
        
        Storage.set('verseFavorites', this.favorites);
        this.updateFavoriteButton();
        this.renderFavorites();
        
        if (!this.dom.favoritessection.classList.contains('visible')) {
            this.dom.favoritessection.classList.add('visible');
        }
        
        NotificationManager.show('Added to favorites', 'success');
    }

    removeFavorite() {
        if (!this.currentVerse) return;
        
        this.favorites = this.favorites.filter(v => v.key !== this.currentVerse.key);
        Storage.set('verseFavorites', this.favorites);
        this.updateFavoriteButton();
        this.renderFavorites();
        
        if (this.favorites.length === 0) {
            this.dom.favoritessection.classList.remove('visible');
        }
        
        NotificationManager.show('Removed from favorites', 'success');
    }

    updateFavoriteButton() {
        if (!this.currentVerse) return;
        
        const isFavorite = this.favorites.some(v => v.key === this.currentVerse.key);
        const icon = this.dom.favoritebtn.querySelector('i');
        
        if (isFavorite) {
            icon.className = 'fas fa-heart';
            this.dom.favoritebtn.classList.add('active');
        } else {
            icon.className = 'far fa-heart';
            this.dom.favoritebtn.classList.remove('active');
        }
    }

    renderHistory() {
        const items = this.history.slice(0, 10).map((item, i) => 
            `<div class="history-item">
                <div class="history-header">
                    <span class="history-index">${i + 1}.</span>
                    <span class="history-reference">${item.reference}</span>
                </div>
                <div class="history-arabic">${item.arabic}</div>
                <div class="history-translation">${item.translation || 'Translation not available'}</div>
            </div>`
        ).join('');
        
        this.dom.historylist.innerHTML = items;
    }

    renderFavorites() {
        const items = this.favorites.slice(0, 10).map((item, i) => 
            `<div class="favorite-item">
                <div class="favorite-header">
                    <span class="favorite-index">${i + 1}.</span>
                    <span class="favorite-reference">${item.reference}</span>
                </div>
                <div class="favorite-arabic">${item.arabic}</div>
                <div class="favorite-translation">${item.translation || 'Translation not available'}</div>
                <div class="favorite-actions">
                    <button class="favorite-play" data-key="${item.key}">
                        <i class="fas fa-play"></i> Play
                    </button>
                    <button class="favorite-remove" data-key="${item.key}">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </div>
            </div>`
        ).join('');
        
        this.dom.favoriteslist.innerHTML = items;
        
        document.querySelectorAll('.favorite-play').forEach(btn => {
            btn.onclick = (e) => this.playFavorite(e.target.dataset.key);
        });
        
        document.querySelectorAll('.favorite-remove').forEach(btn => {
            btn.onclick = (e) => this.removeFavoriteByKey(e.target.dataset.key);
        });
    }

    playFavorite(key) {
        const verse = this.favorites.find(v => v.key === key);
        if (!verse) return;
        
        this.currentVerse = { ...verse };
        this.updateUI();
        this.updateFavoriteButton();
        
        if (verse.audio) {
            this.toggleAudio();
        } else {
            NotificationManager.show('Audio not available for this verse');
        }
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    removeFavoriteByKey(key) {
        this.favorites = this.favorites.filter(v => v.key !== key);
        Storage.set('verseFavorites', this.favorites);
        this.renderFavorites();
        
        if (this.currentVerse?.key === key) {
            this.updateFavoriteButton();
        }
        
        if (this.favorites.length === 0) {
            this.dom.favoritessection.classList.remove('visible');
        }
        
        NotificationManager.show('Removed from favorites', 'success');
    }

    openSettings() {
        this.dom.settingsmodal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        document.querySelectorAll('.option-card').forEach(card => {
            const value = card.dataset.value;
            const isSelected = Object.values(this.settings).includes(value);
            card.classList.toggle('selected', isSelected);
        });
        
        this.updateScriptPreview();
    }

    closeSettings() {
        this.dom.settingsmodal.classList.remove('active');
        document.body.style.overflow = '';
    }

    saveSettings() {
        const recitation = document.querySelector('#recitation-tab .option-card.selected')?.dataset.value;
        const script = document.querySelector('#script-tab .option-card.selected')?.dataset.value;
        const translation = document.querySelector('#translation-tab .option-card.selected')?.dataset.value;
        
        if (recitation && script && translation) {
            this.settings = { recitation, script, translation };
            Storage.set('appSettings', this.settings);
            this.closeSettings();
            this.applySettings();
            this.loadNewVerse();
            NotificationManager.show('Settings applied successfully', 'success');
        } else {
            NotificationManager.show('Please select all options');
        }
    }

    switchTab(tab) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
    }

    selectOption(card) {
        const group = card.closest('.setting-options');
        group.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        
        if (card.closest('#script-tab')) {
            this.updateScriptPreview();
        }
    }

    updateScriptPreview() {
        const selected = document.querySelector('#script-tab .option-card.selected');
        if (!selected) return;
        
        const preview = document.getElementById('arabic-preview');
        preview.className = 'arabic-preview';
        
        const script = selected.dataset.value;
        if (script === 'ar.uthmani') preview.classList.add('uthmani');
        else if (script === 'ar.simple') preview.classList.add('simple');
        else if (script === 'ar.indopak') preview.classList.add('indopak');
    }

    applySettings() {
        this.dom.versetext.className = 'arabic-text';
        
        const { script } = this.settings;
        if (script === 'ar.uthmani') this.dom.versetext.classList.add('uthmani');
        else if (script === 'ar.simple') this.dom.versetext.classList.add('simple');
        else if (script === 'ar.indopak') this.dom.versetext.classList.add('indopak');
    }

    toggleAudio() {
        const audio = this.dom.verseaudio;
        
        if (audio.paused) {
            audio.play().catch(() => {
                NotificationManager.show('Unable to play audio');
            });
            this.dom.playbtn.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            audio.pause();
            this.resetPlayButton();
        }
    }

    resetPlayButton() {
        this.dom.playbtn.innerHTML = '<i class="fas fa-play"></i>';
    }

    updateProgress() {
        const { currentTime, duration } = this.dom.verseaudio;
        if (!duration) return;
        
        const percent = (currentTime / duration) * 100;
        this.dom.progressbar.style.width = `${percent}%`;
        
        const formatTime = (s) => {
            const mins = Math.floor(s / 60);
            const secs = Math.floor(s % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };
        
        this.dom.currenttime.textContent = formatTime(currentTime);
    }

    seekAudio(e) {
        const container = e.currentTarget;
        const rect = container.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percent = clickX / container.offsetWidth;
        
        this.dom.verseaudio.currentTime = percent * this.dom.verseaudio.duration;
    }

    toggleHistory() {
        const section = this.dom.historysection;
        const button = this.dom.historytoggle;
        
        section.classList.toggle('visible');
        button.textContent = section.classList.contains('visible') ? 'Hide History' : 'Show History';
    }

    toggleFavorites() {
        this.dom.favoritessection.classList.toggle('visible');
    }

    toggleLoader(show) {
        this.dom.loader.style.display = show ? 'flex' : 'none';
    }

    loadTheme() {
        const theme = Storage.get('theme', 'dark');
        document.documentElement.setAttribute('data-theme', theme);
    }

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        Storage.set('theme', newTheme);
    }

    handleError(error, context = 'Operation') {
        console.error(`${context} error:`, error);
        NotificationManager.show(`${context} failed. Please try again.`);
    }
}

const checkArabicFont = () => {
    const test1 = document.createElement('span');
    const test2 = document.createElement('span');
    
    test1.style.cssText = 'position:absolute;visibility:hidden;font-family:"Noto Naskh Arabic"';
    test2.style.cssText = 'position:absolute;visibility:hidden;font-family:monospace';
    
    test1.textContent = test2.textContent = 'اللّه';
    
    document.body.append(test1, test2);
    
    setTimeout(() => {
        if (test1.offsetWidth === test2.offsetWidth) {
            console.warn('Arabic font failed to load');
        }
        test1.remove();
        test2.remove();
    }, 1000);
};

window.addEventListener('load', () => {
    checkArabicFont();
    document.fonts.ready.then(() => new Taqwa());
});
