// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ И FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyD0-Rjbm8_eMx9wWaDu2NJQA1M_WX06Hnw",
  authDomain: "my-dictionary-24f0b.firebaseapp.com",
  databaseURL: "https://my-dictionary-24f0b-default-rtdb.firebaseio.com",
  projectId: "my-dictionary-24f0b",
  storageBucket: "my-dictionary-24f0b.firebasestorage.app",
  messagingSenderId: "233923444556",
  appId: "1:233923444556:web:b2497d99e5e375b26f59e9",
  measurementId: "G-10GY4QSFX3"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentUser = localStorage.getItem('my_dict_user') || null;
let isRegisterMode = false;

let dictionary = [];
let categories = [];
let selectedFormTags = [];
let selectedWordIds = [];
let translateTimer = null;
let currentVariants = [];

let duplicateMode = 'none';
let activeSearchQuery = '';
let showOnlyDuplicates = false;

let currentSortColumn = 'id';
let currentSortDirection = 'desc';

let lastEditedWordId = null;
let categoryVisibility = JSON.parse(localStorage.getItem('my_category_visibility')) || {};

let currentPage = 1;
let pageSize = 20;

let columnVisibility = JSON.parse(localStorage.getItem('my_column_visibility')) || {
    en: true, mainRu: true, extraRu: true, context: true, tags: true, actions: true
};

function togglePopBlock(blockId) {
    const block = document.getElementById(blockId);
    if (!block) return;
    const isHidden = block.style.display === 'none' || block.style.display === '';
    block.style.display = isHidden ? 'block' : 'none';
}

function toggleAuthMode(e) {
    if (e) e.preventDefault();
    isRegisterMode = !isRegisterMode;
    const title = document.getElementById('authTitle');
    const btn = document.getElementById('btnAuthAction');
    const text = document.getElementById('authToggleText');
    const link = document.getElementById('authToggleLink');
    if (isRegisterMode) {
        title.innerText = '📝 Регистрация'; btn.innerText = 'Создать аккаунт'; text.innerText = 'Уже есть аккаунт?'; link.innerText = 'Войти';
    } else {
        title.innerText = '🔑 Вход в словарь'; btn.innerText = 'Войти'; text.innerText = 'Нет аккаунта?'; link.innerText = 'Зарегистрироваться';
    }
}

async function handleAuthSubmit() {
    const loginInput = document.getElementById('authLogin').value.trim().toLowerCase();
    const passwordInput = document.getElementById('authPassword').value.trim();
    const errEl = document.getElementById('authError');
    if (!loginInput || !passwordInput) { errEl.innerText = 'Заполните логин и пароль!'; errEl.style.display = 'block'; return; }
    
    const passwordHash = await hashPassword(passwordInput);
    const userRef = db.ref(`users_db/${loginInput}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();

    if (isRegisterMode) {
        if (userData) { errEl.innerText = 'Пользователь уже существует!'; errEl.style.display = 'block'; return; }
        await userRef.set({ password: passwordHash, createdAt: Date.now() });
        setCurrentUser(loginInput);
    } else {
        if (!userData || userData.password !== passwordHash) { errEl.innerText = 'Неверный логин или пароль!'; errEl.style.display = 'block'; return; }
        setCurrentUser(loginInput);
    }
}

function setCurrentUser(username) {
    currentUser = username;
    localStorage.setItem('my_dict_user', username);
    document.getElementById('authModal').style.display = 'none';
    document.getElementById('currentUserLabel').innerText = username;
    attachUserListeners();
}

function logoutUser() { localStorage.removeItem('my_dict_user'); currentUser = null; location.reload(); }

function attachUserListeners() {
    if (!currentUser) return;
    db.ref(`users_data/${currentUser}/dictionary`).on('value', (snapshot) => {
        const data = snapshot.val();
        dictionary = data ? (Array.isArray(data) ? data : Object.values(data)) : [];
        dictionary.sort((a, b) => b.id - a.id);
        renderWords();
        populateGameTagFilters();
        renderDictionaryTagFilters();
        renderBulkTagSelect();
        renderAlphabetBar();
    });

    db.ref(`users_data/${currentUser}/categories`).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            categories = data;
        } else {
            categories = [
                { id: 1, name: 'Уровень', tags: ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'] },
                { id: 2, name: 'Часть речи', tags: ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'pronoun', 'conjunction'] },
                { id: 3, name: 'Тематика', tags: ['работа', 'путешествия', 'разговорное', 'it'] },
                { id: 4, name: 'Статус', tags: ['учу', 'знаю', 'на повторении'] },
                { id: 5, name: 'Категория 5', tags: ['new'] }
            ];
            db.ref(`users_data/${currentUser}/categories`).set(categories);
        }
        renderCategoriesUI();
        renderDictionaryTagFilters();
        renderCategoryVisibilityCheckboxes();
        renderBulkTagSelect();
        populateGameTagFilters();
    });
}

function saveAndRender() {
    if (!currentUser) return;
    const dictObject = {};
    dictionary.forEach(item => { dictObject[item.id] = item; });
    db.ref(`users_data/${currentUser}/dictionary`).set(dictObject);
}

function saveCategories() {
    if (!currentUser) return;
    db.ref(`users_data/${currentUser}/categories`).set(categories);
}

if (currentUser) {
    document.getElementById('authModal').style.display = 'none';
    document.getElementById('currentUserLabel').innerText = currentUser;
    attachUserListeners();
}

// ==========================================
// 2. НАВИГАЦИЯ И ПАГИНАЦИЯ
// ==========================================
function renderCategoryVisibilityCheckboxes() {
    const bar = document.getElementById('categoryVisibilityBar');
    if (!bar) return;
    bar.innerHTML = '';
    categories.forEach(cat => {
        if (categoryVisibility[cat.id] === undefined) categoryVisibility[cat.id] = true;
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" ${categoryVisibility[cat.id] ? 'checked' : ''} onchange="toggleCategoryVisibility(${cat.id}, this.checked)"> ${cat.name}`;
        bar.appendChild(label);
    });
}

function toggleCategoryVisibility(catId, isVisible) {
    categoryVisibility[catId] = isVisible;
    localStorage.setItem('my_category_visibility', JSON.stringify(categoryVisibility));
    renderWords();
}

function toggleFormCard() {
    const card = document.getElementById('formCard');
    const text = document.getElementById('toggleFormText');
    const icon = document.getElementById('toggleFormIcon');
    const isHidden = card.style.display === 'none';
    card.style.display = isHidden ? 'block' : 'none';
    if (text) text.innerText = isHidden ? 'Свернуть форму' : 'Добавить слово';
    if (icon) icon.innerText = isHidden ? '➖' : '➕';
}

function switchTab(tab) {
    if (tab === 'dictionary') {
        document.getElementById('viewDictionary').style.display = 'block';
        document.getElementById('viewTrainer').style.display = 'none';
        document.getElementById('tabDict').classList.add('active');
        document.getElementById('tabTrain').classList.remove('active');
        renderWords();
    } else {
        document.getElementById('viewDictionary').style.display = 'none';
        document.getElementById('viewTrainer').style.display = 'block';
        document.getElementById('tabTrain').classList.add('active');
        document.getElementById('tabDict').classList.remove('active');
        populateGameTagFilters();
    }
}

function changePageSize(select) {
    const customInp = document.getElementById('customPageSizeInput');
    if (select.value === 'custom') {
        customInp.style.display = 'inline-block';
        customInp.focus();
    } else {
        customInp.style.display = 'none';
        pageSize = select.value === 'all' ? dictionary.length : parseInt(select.value);
        currentPage = 1;
        renderWords();
    }
}

function applyCustomPageSize(input) {
    const val = parseInt(input.value);
    if (!isNaN(val) && val > 0) { pageSize = val; currentPage = 1; renderWords(); }
}

function goToPage(page) {
    const total = getTotalPages();
    if (page < 1) page = 1;
    if (page > total) page = total;
    currentPage = page;
    renderWords();
}

function jumpToManualPage() {
    const input = document.getElementById('manualPageInput');
    if (!input) return;
    const pageNum = parseInt(input.value);
    if (!isNaN(pageNum)) { goToPage(pageNum); input.value = ''; }
}

function getTotalPages() {
    const filtered = getFilteredWords();
    if (pageSize === 'all' || pageSize >= filtered.length) return 1;
    return Math.ceil(filtered.length / pageSize);
}

function renderAlphabetBar() {
    const bar = document.getElementById('alphabetBar');
    if (!bar) return;
    bar.innerHTML = '';
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    letters.forEach(char => {
        const btn = document.createElement('button');
        btn.className = 'alphabet-btn';
        btn.innerText = char;
        btn.onclick = () => scrollToLetter(char);
        bar.appendChild(btn);
    });
}

function scrollToLetter(letter) {
    const filtered = getFilteredWords();
    const index = filtered.findIndex(w => (w.en || '').toUpperCase().startsWith(letter));
    if (index !== -1) {
        currentPage = Math.floor(index / (pageSize === 'all' ? filtered.length : pageSize)) + 1;
        renderWords();
        setTimeout(() => {
            const row = document.getElementById(`word-row-${filtered[index].id}`);
            if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }
}

function speak(text, rate = 0.9) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
}

function speakRu(text) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU';
    window.speechSynthesis.speak(utterance);
}

// ==========================================
// 3. БЫСТРОЕ РЕДАКТИРОВАНИЕ ТЕГОВ
// ==========================================
let editingWordIdForTags = null;
let currentEditingWordTags = [];

function openQuickTagModal(wordId) {
    const item = dictionary.find(w => w.id === wordId);
    if (!item) return;
    editingWordIdForTags = wordId;
    currentEditingWordTags = item.tags ? [...item.tags] : [];

    document.getElementById('quickTagWordTitle').innerText = `${item.en} — ${item.mainRu || item.ru || ''}`;
    document.getElementById('quickTagModal').style.display = 'flex';
    renderQuickTagCategoriesUI();
}

function closeQuickTagModal() {
    document.getElementById('quickTagModal').style.display = 'none';
    editingWordIdForTags = null;
}

function renderQuickTagCategoriesUI() {
    const container = document.getElementById('quickTagCategoriesContainer');
    if (!container) return;
    container.innerHTML = '';

    categories.forEach(cat => {
        const box = document.createElement('div');
        box.style.marginBottom = '6px';
        box.innerHTML = `<strong style="font-size: 11px; color: #1e293b;">${cat.name}:</strong>`;
        const chipsWrap = document.createElement('div');
        chipsWrap.className = 'tags-selector';

        cat.tags.forEach(tag => {
            const isSelected = currentEditingWordTags.includes(tag);
            const chip = document.createElement('div');
            chip.className = `tag-chip ${isSelected ? 'selected' : ''}`;
            chip.innerText = `#${tag}`;
            chip.onclick = () => {
                if (currentEditingWordTags.includes(tag)) {
                    currentEditingWordTags = currentEditingWordTags.filter(t => t !== tag);
                } else {
                    currentEditingWordTags.push(tag);
                }
                renderQuickTagCategoriesUI();
            };
            chipsWrap.appendChild(chip);
        });
        box.appendChild(chipsWrap);
        container.appendChild(box);
    });
}

function saveQuickTagChanges() {
    if (!editingWordIdForTags) return;
    dictionary = dictionary.map(w => {
        if (w.id === editingWordIdForTags) {
            return { ...w, tags: [...currentEditingWordTags] };
        }
        return w;
    });
    saveAndRender();
    closeQuickTagModal();
    renderWords();
}

// ==========================================
// 4. ТЕГИ В ФОРМЕ СЛОВАРЯ (С ЗАЩИТОЙ УДАЛЕНИЯ)
// ==========================================
function editCategoryName(catId) {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;
    const newName = prompt('Новое название категории:', cat.name);
    if (newName && newName.trim()) { cat.name = newName.trim(); saveCategories(); }
}

function addTagToCategory(catId, customTag = null) {
    const input = document.getElementById(`inputCatTag_${catId}`);
    const tag = (customTag || (input ? input.value : '')).trim().toLowerCase().replace(/^#/, '');
    if (!tag) return;
    const cat = categories.find(c => c.id === catId);
    if (cat && !cat.tags.includes(tag)) {
        cat.tags.push(tag);
        if (input) input.value = '';
        saveCategories(); renderCategoriesUI(); renderBulkCategoriesUI(); populateGameTagFilters(); renderDictionaryTagFilters();
    }
}

function removeTagFromCategory(catId, tag, event) {
    if (event) event.stopPropagation();
    if (!confirm(`Вы действительно хотите удалить тег #${tag}? Это действие затронет категории.`)) return;
    const cat = categories.find(c => c.id === catId);
    if (cat) {
        cat.tags = cat.tags.filter(t => t !== tag);
        selectedFormTags = selectedFormTags.filter(t => t !== tag);
        saveAndRender(); saveCategories(); renderFormSelectedTags(); populateGameTagFilters(); renderDictionaryTagFilters();
    }
}

function toggleFormTag(tag) {
    if (selectedFormTags.includes(tag)) selectedFormTags = selectedFormTags.filter(t => t !== tag);
    else selectedFormTags.push(tag);
    renderCategoriesUI(); renderFormSelectedTags();
}

function renderCategoriesUI() {
    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    categories.forEach(cat => {
        const catBox = document.createElement('div');
        catBox.className = 'cat-box';
        let tagsHtml = cat.tags.map(tag => `
            <div class="tag-chip ${selectedFormTags.includes(tag) ? 'selected' : ''}" onclick="toggleFormTag('${tag}')">
                #${tag} <button type="button" class="tag-del-btn" onclick="removeTagFromCategory(${cat.id}, '${tag}', event)">✕</button>
            </div>
        `).join('');

        catBox.innerHTML = `
            <div class="cat-header">
                <div class="cat-title">${cat.name}</div>
                <button type="button" class="btn-edit-cat" onclick="editCategoryName(${cat.id})">✏</button>
            </div>
            <div class="tags-selector">${tagsHtml}</div>
            <div class="add-tag-inline"><input type="text" id="inputCatTag_${cat.id}" placeholder="Тег"><button type="button" onclick="addTagToCategory(${cat.id})">+</button></div>
        `;
        grid.appendChild(catBox);
    });
}

function renderFormSelectedTags() {
    const container = document.getElementById('selectedWordTags');
    if (!container) return;
    container.innerHTML = '';
    selectedFormTags.forEach(tag => {
        const chip = document.createElement('div');
        chip.className = 'tag-chip selected';
        chip.innerText = `#${tag} ✕`;
        chip.onclick = () => toggleFormTag(tag);
        container.appendChild(chip);
    });
}

// ==========================================
// 5. АВТОПЕРЕВОД, АВТОПОДБОР ЧАСТИ РЕЧИ И КНОПКА ДОБАВИТЬ ВСЕ
// ==========================================
let lastFetchedData = null;

function cleanText(text) { return text.toLowerCase().replace(/^[a-я]\.\s*/gi, '').trim(); }

async function fetchWordDetails(word) {
    try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&dt=bd&q=${encodeURIComponent(word)}`);
        if (!res.ok) return null;
        const data = await res.json();
        let variants = [];
        let detectedPos = '';
        
        if (data[1] && Array.isArray(data[1])) {
            // Надежное извлечение части речи (noun, verb, adjective и т.д.) из словаря Google Translate
            data[1].forEach(block => {
                if (block[0]) {
                    const posStr = block[0].toLowerCase();
                    if (posStr.includes('noun') || posStr.includes('существительное')) detectedPos = 'noun';
                    else if (posStr.includes('verb') || posStr.includes('глагол')) detectedPos = 'verb';
                    else if (posStr.includes('adjective') || posStr.includes('прилагательное')) detectedPos = 'adjective';
                    else if (posStr.includes('adverb') || posStr.includes('наречие')) detectedPos = 'adverb';
                    else if (posStr.includes('pronoun') || posStr.includes('местоимение')) detectedPos = 'pronoun';
                    else if (posStr.includes('preposition') || posStr.includes('предлог')) detectedPos = 'preposition';
                    else if (posStr.includes('conjunction') || posStr.includes('союз')) detectedPos = 'conjunction';
                }
                if (block[1]) block[1].forEach(t => { const tr = cleanText(t); if (tr && !variants.includes(tr)) variants.push(tr); });
            });
        }
        if (data[0] && data[0][0] && data[0][0][0] && variants.length === 0) {
            variants.push(cleanText(data[0][0][0]));
        }
        return { mainRu: variants[0] || '', extraRu: variants.slice(1).join(', '), pos: detectedPos, allVariants: variants };
    } catch (e) { return null; }
}

function refreshWordData() { autoTranslate(true); }

function handleEnglishInput() {
    const word = document.getElementById('englishWord').value.trim().toLowerCase();
    const dupBox = document.getElementById('duplicateWarning');
    const dupDetails = document.getElementById('duplicateDetails');
    if (dupBox) dupBox.style.display = 'none';
    if (!word) { autoTranslate(); return; }

    const editId = document.getElementById('editWordId').value;
    const existing = dictionary.find(item => item.en.toLowerCase() === word && item.id !== parseInt(editId));
    if (existing && dupBox && dupDetails) {
        dupDetails.innerText = `Перевод: «${existing.mainRu || existing.ru}»`;
        dupBox.style.display = 'block';
    }
    autoTranslate();
}

function autoTranslate(forceRefresh = false) {
    if (document.getElementById('editWordId').value !== "" && !forceRefresh) return;
    clearTimeout(translateTimer);
    const word = document.getElementById('englishWord').value.trim();
    const sugBox = document.getElementById('suggestionsBox');
    if (!word) return;

    translateTimer = setTimeout(async () => {
        const details = await fetchWordDetails(word);
        if (!details) return;
        lastFetchedData = details;
        currentVariants = details.allVariants;

        if (sugBox) {
            sugBox.innerHTML = '';
            currentVariants.forEach((v, i) => {
                const chip = document.createElement('div');
                chip.className = i === 0 ? 'sug-chip' : 'sug-chip sug-chip-extra';
                chip.innerText = v;
                chip.onclick = () => addTranslationOption(v, i === 0);
                sugBox.appendChild(chip);
            });
        }

        if (forceRefresh || !document.getElementById('mainTranslation').value.trim()) {
            document.getElementById('mainTranslation').value = details.mainRu;
        }

        // Автоматический выбор части речи в тегах формы
        if (details.pos) {
            categories.forEach(cat => {
                if (cat.name.toLowerCase().includes('часть речи')) {
                    cat.tags.forEach(t => {
                        if (details.pos === t && !selectedFormTags.includes(t)) {
                            selectedFormTags.push(t);
                        }
                    });
                }
            });
            renderCategoriesUI();
            renderFormSelectedTags();
        }
    }, 350);
}

function addTranslationOption(text, isMain) {
    if (isMain) document.getElementById('mainTranslation').value = text;
    else {
        const extra = document.getElementById('extraTranslations');
        extra.value = extra.value ? extra.value + ', ' + text : text;
    }
}

function addAllExtraTranslations() {
    if (!lastFetchedData || !lastFetchedData.allVariants) return;
    const extras = lastFetchedData.allVariants.slice(1);
    const extraField = document.getElementById('extraTranslations');
    if (extras.length > 0) {
        extraField.value = extras.join(', ');
    }
}

function setDuplicateAction(action) { if (action === 'replace') alert('Режим замены выбран.'); }

async function generateAIExamples() {
    const word = document.getElementById('englishWord').value.trim();
    const mainRu = document.getElementById('mainTranslation').value || word;
    if (!word) return;
    document.getElementById('contextInput').value = `1. I need to ${word}. — Мне нужно ${mainRu}.\n2. It is a good ${word}. — Это хороший ${mainRu}.`;
}

function saveWord() {
    const idInput = document.getElementById('editWordId').value;
    const en = document.getElementById('englishWord').value.trim();
    const mainRu = document.getElementById('mainTranslation').value.trim();
    const extraRu = document.getElementById('extraTranslations').value.trim();
    const context = document.getElementById('contextInput').value.trim();

    if (!en || !mainRu) { alert('Заполните слово и перевод!'); return; }

    const numericId = idInput ? parseInt(idInput) : Date.now();
    if (idInput) {
        dictionary = dictionary.map(item => item.id === numericId ? { ...item, en, mainRu, extraRu, context, tags: [...selectedFormTags] } : item);
    } else {
        dictionary.unshift({ id: numericId, en, mainRu, extraRu, context, tags: [...selectedFormTags] });
    }

    lastEditedWordId = numericId;
    saveAndRender(); resetForm();
    document.getElementById('formCard').style.display = 'none';
}

function editWord(id) {
    lastEditedWordId = id;
    const item = dictionary.find(w => w.id === id);
    if (!item) return;
    document.getElementById('formCard').style.display = 'block';
    document.getElementById('editWordId').value = item.id;
    document.getElementById('englishWord').value = item.en;
    document.getElementById('mainTranslation').value = item.mainRu || item.ru || '';
    document.getElementById('extraTranslations').value = item.extraRu || '';
    document.getElementById('contextInput').value = item.context || '';
    selectedFormTags = item.tags ? [...item.tags] : [];
    renderCategoriesUI(); renderFormSelectedTags();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteWord(id) {
    if (confirm('Удалить слово?')) { dictionary = dictionary.filter(item => item.id !== id); saveAndRender(); }
}

function resetForm() {
    document.getElementById('editWordId').value = '';
    document.getElementById('englishWord').value = '';
    document.getElementById('mainTranslation').value = '';
    document.getElementById('extraTranslations').value = '';
    document.getElementById('contextInput').value = '';
    selectedFormTags = [];
    renderCategoriesUI(); renderFormSelectedTags();
}

// ==========================================
// 6. ТАБЛИЦА СЛОВАРЯ (С 3 ФИЛЬТРАМИ И ОБНОВЛЕНИЕМ ВЫБРАННЫХ)
// ==========================================
function toggleDuplicateFilter() {
    showOnlyDuplicates = !showOnlyDuplicates;
    const btn = document.getElementById('btnDuplicateFilter');
    if (showOnlyDuplicates) { btn.style.background = '#ef4444'; btn.style.color = '#fff'; }
    else { btn.style.background = ''; btn.style.color = ''; }
    currentPage = 1; renderWords();
}

function getFilteredWords() {
    const t1 = document.getElementById('singleTagFilter1') ? document.getElementById('singleTagFilter1').value : '';
    const t2 = document.getElementById('singleTagFilter2') ? document.getElementById('singleTagFilter2').value : '';
    const t3 = document.getElementById('singleTagFilter3') ? document.getElementById('singleTagFilter3').value : '';

    let result = dictionary.filter(item => {
        const matchEn = (item.en || '').toLowerCase().includes(activeSearchQuery);
        const matchRu = (item.mainRu || item.ru || '').toLowerCase().includes(activeSearchQuery);
        const matchText = matchEn || matchRu;
        
        const tags = item.tags || [];
        const m1 = (!t1 || tags.includes(t1));
        const m2 = (!t2 || tags.includes(t2));
        const m3 = (!t3 || tags.includes(t3));

        return matchText && m1 && m2 && m3;
    });

    if (showOnlyDuplicates) {
        const enCounts = {};
        dictionary.forEach(w => {
            const cleanEn = (w.en || '').toLowerCase().trim();
            enCounts[cleanEn] = (enCounts[cleanEn] || 0) + 1;
        });
        result = result.filter(w => enCounts[(w.en || '').toLowerCase().trim()] > 1);
    }

    return result.sort((a, b) => {
        let valA, valB;
        if (currentSortColumn === 'tags') {
            valA = (a.tags || []).join(', ').toLowerCase();
            valB = (b.tags || []).join(', ').toLowerCase();
        } else {
            valA = (a[currentSortColumn] || '').toString().toLowerCase();
            valB = (b[currentSortColumn] || '').toString().toLowerCase();
        }
        if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
        return 0;
    });
}

function renderTableHeaders() {
    const tr = document.getElementById('tableHeaderRow');
    if (!tr) return;
    let html = `<th style="width: 30px;"></th>`;
    html += `<th class="th-sortable" onclick="sortBy('en')">Слово (EN)</th>`;
    html += `<th class="th-sortable" onclick="sortBy('mainRu')">Перевод</th>`;
    if (columnVisibility.extraRu) html += `<th>Доп. переводы</th>`;
    if (columnVisibility.context) html += `<th>Контекст</th>`;
    if (columnVisibility.tags) html += `<th class="th-sortable" onclick="sortBy('tags')">Теги</th>`;
    if (columnVisibility.actions) html += `<th class="th-sortable" onclick="sortBy('id')">Действия</th>`;
    tr.innerHTML = html;
}

function renderDictionaryTagFilters() {
    ['singleTagFilter1', 'singleTagFilter2', 'singleTagFilter3'].forEach((selId, index) => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        let tags = new Set();
        dictionary.forEach(w => { if (w.tags) w.tags.forEach(t => tags.add(t)); });
        const defaultText = index === 0 ? '-- Все теги --' : '-- Не выбран --';
        sel.innerHTML = `<option value="">${defaultText}</option>`;
        tags.forEach(t => { sel.innerHTML += `<option value="${t}">#${t}</option>`; });
    });
}

function applyFilters() {
    activeSearchQuery = document.getElementById('searchInput').value.toLowerCase().trim();
    currentPage = 1; renderWords();
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    if (document.getElementById('singleTagFilter1')) document.getElementById('singleTagFilter1').value = '';
    if (document.getElementById('singleTagFilter2')) document.getElementById('singleTagFilter2').value = '';
    if (document.getElementById('singleTagFilter3')) document.getElementById('singleTagFilter3').value = '';
    activeSearchQuery = ''; showOnlyDuplicates = false;
    document.getElementById('btnDuplicateFilter').style.background = '';
    currentPage = 1; renderWords();
}

function sortBy(column) {
    if (currentSortColumn === column) currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    else { currentSortColumn = column; currentSortDirection = 'asc'; }
    renderWords();
}

function toggleColumnVisibility() {
    for (let key in columnVisibility) {
        const cb = document.getElementById(`col_${key}`);
        if (cb) columnVisibility[key] = cb.checked;
    }
    localStorage.setItem('my_column_visibility', JSON.stringify(columnVisibility));
    renderWords();
}

function updateColumnCheckboxes() {
    for (let key in columnVisibility) {
        const cb = document.getElementById(`col_${key}`);
        if (cb) cb.checked = columnVisibility[key];
    }
}

function toggleSelectAll(checked) {
    const filtered = getFilteredWords();
    selectedWordIds = checked ? filtered.map(w => w.id) : [];
    renderWords();
}

function toggleSelectWord(id) {
    if (selectedWordIds.includes(id)) selectedWordIds = selectedWordIds.filter(i => i !== id);
    else selectedWordIds.push(id);
    updateBulkUI();
}

function updateBulkUI() {
    document.getElementById('selectedCount').innerText = selectedWordIds.length;
    document.getElementById('bulkActionsBox').style.display = selectedWordIds.length > 0 ? 'flex' : 'none';
}

function renderWords() {
    renderTableHeaders();
    const tbody = document.getElementById('dictTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const filtered = getFilteredWords();
    const totalPages = getTotalPages();
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const start = (currentPage - 1) * (pageSize === 'all' ? filtered.length : pageSize);
    const end = pageSize === 'all' ? filtered.length : start + pageSize;
    const pageItems = filtered.slice(start, end);

    document.getElementById('pageInfoLabel').innerText = `Стр. ${currentPage} из ${totalPages || 1} (Всего: ${filtered.length})`;

    if (pageItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#888; padding:20px;">Слов не найдено</td></tr>';
        return;
    }

    pageItems.forEach(item => {
        const isChecked = selectedWordIds.includes(item.id);
        let tagsHtml = '';
        if (item.tags) {
            tagsHtml = item.tags.filter(t => {
                const cat = categories.find(c => c.tags && c.tags.includes(t));
                return !cat || categoryVisibility[cat.id] !== false;
            }).map(t => `<span class="tag">#${t}</span>`).join('');
        }

        const tr = document.createElement('tr');
        tr.id = `word-row-${item.id}`;
        let html = `<td><input type="checkbox" class="word-checkbox" ${isChecked ? 'checked' : ''} onchange="toggleSelectWord(${item.id})"></td>`;
        
        if (columnVisibility.en) html += `<td><strong>${item.en}</strong> <button class="btn-audio" onclick="speak('${item.en}')">🔊</button></td>`;
        if (columnVisibility.mainRu) html += `<td style="color:#27ae60; font-weight:600;">${item.mainRu || item.ru || ''}</td>`;
        if (columnVisibility.extraRu) html += `<td><div class="cell-scrollable">${item.extraRu || ''}</div></td>`;
        if (columnVisibility.context) html += `<td><div class="cell-scrollable">${item.context || ''}</div></td>`;
        if (columnVisibility.tags) html += `<td><div class="tags">${tagsHtml}</div></td>`;
        if (columnVisibility.actions) html += `<td><div class="actions"><button class="btn-action" style="background:#0284c7;" onclick="openQuickTagModal(${item.id})">✏</button><button class="btn-action btn-edit" onclick="editWord(${item.id})">⚙️</button><button class="btn-action btn-delete" onclick="deleteWord(${item.id})">🗑️</button></div></td>`;

        tr.innerHTML = html;
        tbody.appendChild(tr);
    });
    updateBulkUI();
}

// ==========================================
// ФУНКЦИЯ МАССОВОГО ОБНОВЛЕНИЯ ВЫБРАННЫХ СЛОВ
// ==========================================
async function refreshSelectedWords() {
    if (selectedWordIds.length === 0) {
        alert('Выберите галочками хотя бы одно слово в таблице!');
        return;
    }
    if (!confirm(`Обновить переводы и автоматически определить части речи для ${selectedWordIds.length} слов(а)?`)) return;

    let updatedCount = 0;
    for (let id of selectedWordIds) {
        const item = dictionary.find(w => w.id === id);
        if (!item || !item.en) continue;

        const details = await fetchWordDetails(item.en);
        if (details && details.mainRu) {
            item.mainRu = details.mainRu;
            item.extraRu = details.extraRu;

            // Добавляем тег части речи, если он определился и его еще нет
            if (details.pos) {
                if (!item.tags) item.tags = [];
                categories.forEach(cat => {
                    if (cat.name.toLowerCase().includes('часть речи')) {
                        cat.tags.forEach(t => {
                            if (details.pos === t && !item.tags.includes(t)) {
                                item.tags.push(t);
                            }
                        });
                    }
                });
            }
            updatedCount++;
        }
        await new Promise(r => setTimeout(r, 100));
    }

    saveAndRender();
    renderWords();
    alert(`Успешно обновлено слов: ${updatedCount}`);
}

// ==========================================
// 7. МАССОВОЕ ДОБАВЛЕНИЕ И ЭКСПОРТ/ИМПОРТ
// ==========================================
let bulkSelectedTags = ['new'];

function openBulkAddModal() {
    document.getElementById('bulkAddModal').style.display = 'flex';
    document.getElementById('bulkWordsTextarea').value = '';
    document.getElementById('bulkAddProgress').style.display = 'none';
    bulkSelectedTags = ['new'];
    renderBulkCategoriesUI();
}

function closeBulkAddModal() { document.getElementById('bulkAddModal').style.display = 'none'; }

function renderBulkCategoriesUI() {
    const container = document.getElementById('bulkCategoriesContainer');
    if (!container) return;
    container.innerHTML = '';

    categories.forEach(cat => {
        const box = document.createElement('div');
        box.style.marginBottom = '8px';
        box.innerHTML = `<strong style="font-size: 12px; color: #1e293b;">${cat.name}:</strong>`;
        
        const chipsWrap = document.createElement('div');
        chipsWrap.className = 'tags-selector';

        cat.tags.forEach(tag => {
            const isSelected = bulkSelectedTags.includes(tag);
            const chip = document.createElement('div');
            chip.className = `tag-chip ${isSelected ? 'selected' : ''}`;
            chip.innerText = `#${tag}`;
            chip.onclick = () => {
                if (bulkSelectedTags.includes(tag)) bulkSelectedTags = bulkSelectedTags.filter(t => t !== tag);
                else bulkSelectedTags.push(tag);
                renderBulkCategoriesUI();
            };
            chipsWrap.appendChild(chip);
        });

        const customTagInputRow = document.createElement('div');
        customTagInputRow.className = 'add-tag-inline';
        customTagInputRow.style.marginTop = '4px';
        customTagInputRow.innerHTML = `
            <input type="text" id="bulkCustomTag_${cat.id}" placeholder="+ Свой тег в ${cat.name}">
            <button type="button" onclick="addCustomBulkTag(${cat.id})">+</button>
        `;

        box.appendChild(chipsWrap);
        box.appendChild(customTagInputRow);
        container.appendChild(box);
    });

    const preview = document.getElementById('bulkSelectedTagsPreview');
    if (preview) {
        preview.innerHTML = bulkSelectedTags.map(t => `<span class="tag-chip selected">#${t}</span>`).join('');
    }
}

function addCustomBulkTag(catId) {
    const input = document.getElementById(`bulkCustomTag_${catId}`);
    if (!input) return;
    const tag = input.value.trim().toLowerCase().replace(/^#/, '');
    if (!tag) return;
    addTagToCategory(catId, tag);
    if (!bulkSelectedTags.includes(tag)) bulkSelectedTags.push(tag);
    renderBulkCategoriesUI();
}

async function processBulkWordsAdd() {
    const raw = document.getElementById('bulkWordsTextarea').value;
    if (!raw.trim()) { alert('Введите слова!'); return; }
    const words = raw.split(/[\n,]+/).map(w => w.trim().toLowerCase()).filter(w => w);
    if (words.length === 0) return;

    const progBox = document.getElementById('bulkAddProgress');
    const progText = document.getElementById('bulkAddProgressText');
    progBox.style.display = 'block';

    for (let i = 0; i < words.length; i++) {
        progText.innerText = `${i + 1}/${words.length}`;
        const en = words[i];
        const details = await fetchWordDetails(en);
        const mainRu = details ? details.mainRu : '';
        const extraRu = details ? details.extraRu : '';
        const context = `1. I need to ${en}. — Мне нужно ${mainRu || en}.`;

        let wordTags = [...bulkSelectedTags];
        if (details && details.pos) {
            categories.forEach(cat => {
                if (cat.name.toLowerCase().includes('часть речи')) {
                    cat.tags.forEach(t => {
                        if (details.pos === t && !wordTags.includes(t)) wordTags.push(t);
                    });
                }
            });
        }

        dictionary.unshift({ id: Date.now() + i, en, mainRu, extraRu, context, tags: wordTags });
        await new Promise(r => setTimeout(r, 100));
    }

    progBox.style.display = 'none';
    closeBulkAddModal();
    saveAndRender();
    alert('Массовое добавление завершено!');
}

function applyBulkTag(action) {
    const tag = document.getElementById('bulkTagSelect').value;
    if (!tag || selectedWordIds.length === 0) return;
    dictionary = dictionary.map(item => {
        if (selectedWordIds.includes(item.id)) {
            let tags = item.tags ? [...item.tags] : [];
            if (action === 'add' && !tags.includes(tag)) tags.push(tag);
            if (action === 'remove') tags = tags.filter(t => t !== tag);
            return { ...item, tags };
        }
        return item;
    });
    saveAndRender(); renderWords();
}

function applyBulkDelete() {
    if (selectedWordIds.length === 0 || !confirm('Удалить выбранные?')) return;
    dictionary = dictionary.filter(item => !selectedWordIds.includes(item.id));
    selectedWordIds = [];
    saveAndRender(); renderWords();
}

function renderBulkTagSelect() {
    const sel = document.getElementById('bulkTagSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Тег --</option>';
    let tags = new Set();
    categories.forEach(c => c.tags.forEach(t => tags.add(t)));
    tags.forEach(t => sel.innerHTML += `<option value="${t}">#${t}</option>`);
}

function exportToExcel() {
    if (dictionary.length === 0) { alert('Словарь пуст!'); return; }
    const data = dictionary.map(item => ({
        'Слово (EN)': item.en,
        'Основной перевод': item.mainRu || item.ru || '',
        'Доп. переводы': item.extraRu || '',
        'Примеры / Контекст': item.context || '',
        'Теги': item.tags ? item.tags.join(', ') : ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Словарь');
    XLSX.writeFile(wb, 'My_Dictionary.xlsx');
}

function importFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const jsonRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            let count = 0;
            jsonRows.forEach((row, idx) => {
                const en = (row['Слово (EN)'] || row['Word'] || '').toString().trim();
                const mainRu = (row['Основной перевод'] || row['Translation'] || '').toString().trim();
                if (en && mainRu) {
                    const tagsRaw = (row['Теги'] || '').toString();
                    const tags = tagsRaw.split(',').map(t => t.trim().toLowerCase().replace(/^#/, '')).filter(t => t);
                    dictionary.unshift({ id: Date.now() + idx, en, mainRu, extraRu: row['Доп. переводы'] || '', context: row['Примеры / Контекст'] || '', tags });
                    count++;
                }
            });
            saveAndRender();
            alert(`Импортировано слов: ${count}`);
        } catch(err) { alert('Ошибка чтения файла Excel.'); }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// 8. ТРЕНАЖЕР И ИГРЫ
// ==========================================
let activeGame = { mode: '', words: [], currentIndex: 0, errors: [], correctWords: [], repeatWords: [], direction: 'both', sprintTimer: null, timeLeft: 60, score: 0 };
let trainerPoolWords = [];
let trainerSelectedIds = [];
let gameSelectedWordIds = [];
let audioStreamTimeoutId = null;
let isTrainerSetupCollapsed = false;

function populateGameTagFilters() {
    ['gameTagFilter1', 'gameTagFilter2', 'gameTagFilter3'].forEach((selId, index) => {
        const sel = document.getElementById(selId);
        if (!sel) return;

        const tagCounts = {};
        dictionary.forEach(w => {
            if (w.tags) w.tags.forEach(t => tagCounts[t] = (tagCounts[t] || 0) + 1);
        });

        const defaultText = index === 0 ? 'Все слова словаря' : '-- Не выбран --';
        sel.innerHTML = `<option value="all">${defaultText}</option>`;
        Object.keys(tagCounts).sort().forEach(t => {
            sel.innerHTML += `<option value="${t}">#${t} (${tagCounts[t]} шт.)</option>`;
        });
    });

    onGameTagChanged();
}

function onGameTagChanged() {
    const t1 = document.getElementById('gameTagFilter1').value;
    const t2 = document.getElementById('gameTagFilter2').value;
    const t3 = document.getElementById('gameTagFilter3').value;

    trainerPoolWords = dictionary.filter(w => {
        const tags = w.tags || [];
        const m1 = (t1 === 'all' || tags.includes(t1));
        const m2 = (t2 === 'all' || tags.includes(t2));
        const m3 = (t3 === 'all' || tags.includes(t3));
        return m1 && m2 && m3;
    });

    trainerSelectedIds = trainerPoolWords.map(w => w.id);
    renderTrainerChecklist();
}

function toggleTrainerSetupCollapse() {
    isTrainerSetupCollapsed = !isTrainerSetupCollapsed;
    const content = document.getElementById('trainerSetupContent');
    const btn = document.getElementById('btnToggleSetupCollapse');
    if (content) content.style.display = isTrainerSetupCollapsed ? 'none' : 'grid';
    if (btn) btn.innerText = isTrainerSetupCollapsed ? '◀ Развернуть настройки' : '🔽 Свернуть настройки';
}

function renderTrainerChecklist() {
    const container = document.getElementById('trainerWordChecklist');
    const selectedLabel = document.getElementById('trainerSelectedCountLabel');
    const totalLabel = document.getElementById('trainerTotalCountLabel');
    if (!container) return;

    const showSelected = document.getElementById('chkShowSelected').checked;
    const showUnselected = document.getElementById('chkShowUnselected').checked;

    let filteredPool = trainerPoolWords.filter(w => {
        const isSel = trainerSelectedIds.includes(w.id);
        if (isSel && !showSelected) return false;
        if (!isSel && !showUnselected) return false;
        return true;
    });

    if (selectedLabel) selectedLabel.innerText = trainerSelectedIds.length;
    if (totalLabel) totalLabel.innerText = trainerPoolWords.length;

    if (filteredPool.length === 0) {
        container.innerHTML = '<em style="font-size:11px; color:#888;">Нет слов по фильтру</em>';
        return;
    }

    container.innerHTML = filteredPool.map((w, idx) => {
        const isChecked = trainerSelectedIds.includes(w.id);
        return `
            <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; background: #fff; padding: 4px 6px; border-radius: 4px; border: 1px solid #e2e8f0; cursor: pointer;">
                <input type="checkbox" value="${w.id}" ${isChecked ? 'checked' : ''} onchange="toggleTrainerWordSelection(${w.id}, this.checked)">
                <strong>${w.en}</strong> — <span style="color: #27ae60;">${w.mainRu || w.ru || ''}</span>
            </label>
        `;
    }).join('');
}

function toggleTrainerWordSelection(id, checked) {
    if (checked) {
        if (!trainerSelectedIds.includes(id)) trainerSelectedIds.push(id);
    } else {
        trainerSelectedIds = trainerSelectedIds.filter(i => i !== id);
    }
    const label = document.getElementById('trainerSelectedCountLabel');
    if (label) label.innerText = trainerSelectedIds.length;
}

function selectAllTrainerWords(select) {
    trainerSelectedIds = select ? trainerPoolWords.map(w => w.id) : [];
    renderTrainerChecklist();
}

function autoSelectTrainerWords(mode, count = 10) {
    if (trainerPoolWords.length === 0) return;
    if (mode === 'first') {
        trainerSelectedIds = trainerPoolWords.slice(0, count).map(w => w.id);
    } else if (mode === 'random') {
        const shuffled = [...trainerPoolWords].sort(() => Math.random() - 0.5);
        trainerSelectedIds = shuffled.slice(0, count).map(w => w.id);
    } else if (mode === 'from_index') {
        const start = parseInt(document.getElementById('trainerStartIndex').value) - 1 || 0;
        const batch = parseInt(document.getElementById('trainerBatchSize').value) || 10;
        trainerSelectedIds = trainerPoolWords.slice(start, start + batch).map(w => w.id);
    }
    renderTrainerChecklist();
}

function startGame(mode) {
    if (trainerSelectedIds.length === 0) {
        alert('Отметьте хотя бы одно слово для тренировки!');
        return;
    }

    const selectedWords = trainerPoolWords.filter(w => trainerSelectedIds.includes(w.id));
    selectedWords.sort(() => Math.random() - 0.5);

    const direction = document.getElementById('gameDirection').value;

    activeGame = {
        mode,
        words: selectedWords,
        currentIndex: 0,
        errors: [],
        correctWords: [],
        repeatWords: [],
        direction,
        sprintTimer: null,
        timeLeft: 60,
        score: 0
    };

    document.getElementById('gameSetupCard').style.display = 'none';
    document.getElementById('gamePlayArea').style.display = 'block';
    renderGameStep();
}

function exitGame() {
    if (audioStreamTimeoutId) clearTimeout(audioStreamTimeoutId);
    if (activeGame.sprintTimer) clearInterval(activeGame.sprintTimer);
    if (micAudioStream) { micAudioStream.getTracks().forEach(track => track.stop()); micAudioStream = null; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    document.getElementById('gameSetupCard').style.display = 'block';
    document.getElementById('gamePlayArea').style.display = 'none';
}

function stopGameAndShowSummary() {
    if (audioStreamTimeoutId) clearTimeout(audioStreamTimeoutId);
    if (activeGame.sprintTimer) clearInterval(activeGame.sprintTimer);
    if (micAudioStream) { micAudioStream.getTracks().forEach(track => track.stop()); micAudioStream = null; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    showGameSummary();
}

function renderGameStep() {
    const container = document.getElementById('activeGameContainer');
    if (!container) return;

    const total = activeGame.words.length;
    const current = activeGame.currentIndex;

    const fill = document.getElementById('gameProgressFill');
    if (fill) fill.style.width = `${(current / total) * 100}%`;

    if (current >= total && !['matching', 'matching_extra', 'sprint'].includes(activeGame.mode)) {
        showGameSummary();
        return;
    }

    if (activeGame.mode === 'flashcards') renderFlashcardsMode();
    else if (activeGame.mode === 'written') renderWrittenMode();
    else if (activeGame.mode === 'matching') renderMatchingMode(false);
    else if (activeGame.mode === 'matching_extra') renderMatchingMode(true);
    else if (activeGame.mode === 'audio_stream') renderAudioStreamMode();
    else if (activeGame.mode === 'audio_dictation') renderAudioDictationMode();
    else if (activeGame.mode === 'voice_check') renderVoiceCheckMode();
    else if (activeGame.mode === 'test_choice') renderTestChoiceMode();
    else if (activeGame.mode === 'test_fill') renderTestFillMode();
    else if (activeGame.mode === 'srs') renderSrsMode();
    else if (activeGame.mode === 'scramble') renderScrambleMode();
    else if (activeGame.mode === 'sprint') renderSprintMode();
}

// 1. Флеш-карточки
let isFlipped = false;
function renderFlashcardsMode() {
    const container = document.getElementById('activeGameContainer');
    const item = activeGame.words[activeGame.currentIndex];
    isFlipped = false;

    container.innerHTML = `
        <div class="trainer-card" onclick="isFlipped=!isFlipped; this.querySelector('#cardBack').style.display=isFlipped?'block':'none'; this.querySelector('#cardFront').style.display=isFlipped?'none':'block';">
            <div id="cardFront">
                <div class="trainer-word">${item.en}</div>
                <button class="btn-audio" onclick="event.stopPropagation(); speak('${item.en}')">🔊</button>
                <div class="trainer-hint">нажмите, чтобы перевернуть 🔄</div>
            </div>
            <div id="cardBack" style="display: none;">
                <div style="font-size: 22px; font-weight: bold; color: #27ae60;">${item.mainRu || item.ru || ''}</div>
                ${item.extraRu ? `<div style="font-size: 13px; color: #64748b; margin-top:4px;">${item.extraRu}</div>` : ''}
                ${item.context ? `<div style="font-size: 12px; color: #555; margin-top:8px;">💡 ${item.context}</div>` : ''}
            </div>
        </div>
        <div class="trainer-controls" style="max-width: 450px; margin: 12px auto 0 auto; display: flex; gap: 8px;">
            <button class="btn-dontknow" style="flex:1;" onclick="nextGameCard('error')">❌ Не знаю</button>
            <button class="btn-main" style="background:#f59e0b; flex:1; font-size:13px;" onclick="nextGameCard('repeat')">🔄 Повторить</button>
            <button class="btn-know" style="flex:1;" onclick="nextGameCard('know')">✅ Знаю</button>
        </div>
    `;
}

function nextGameCard(status) {
    const item = activeGame.words[activeGame.currentIndex];
    if (status === 'know') activeGame.correctWords.push(item);
    else if (status === 'repeat') activeGame.repeatWords.push(item);
    else activeGame.errors.push(item);

    activeGame.currentIndex++;
    renderGameStep();
}

// 2. Письменный перевод
function renderWrittenMode() {
    const container = document.getElementById('activeGameContainer');
    const item = activeGame.words[activeGame.currentIndex];

    let isEnToRu = activeGame.direction === 'en-ru' ? true : (activeGame.direction === 'ru-en' ? false : Math.random() > 0.5);
    const promptText = isEnToRu ? item.en : (item.mainRu || item.ru || '');

    container.innerHTML = `
        <div class="card" style="text-align: center; max-width: 450px; margin: 0 auto;">
            <div style="color: #64748b; font-size: 13px;">${isEnToRu ? 'Переведите на русский:' : 'Переведите на английский:'}</div>
            <div style="font-size: 26px; font-weight: bold; color: #2c3e50; margin: 12px 0;">
                ${promptText}
                ${isEnToRu ? `<button class="btn-audio" onclick="speak('${item.en}')">🔊</button>` : ''}
            </div>
            <input type="text" id="writtenAnswerInput" placeholder="Введите перевод..." style="font-size: 16px; text-align: center; margin-bottom: 12px;" autocomplete="off" onkeyup="if(event.key==='Enter') checkWrittenAnswer()">
            <button class="btn-main" onclick="checkWrittenAnswer()">Проверить</button>
            <div id="writtenFeedback" style="display:none; margin-top:12px; padding:8px; border-radius:6px; font-weight:bold;"></div>
        </div>
    `;
    setTimeout(() => { const inp = document.getElementById('writtenAnswerInput'); if(inp) inp.focus(); }, 100);
}

function checkWrittenAnswer() {
    const inp = document.getElementById('writtenAnswerInput');
    const fb = document.getElementById('writtenFeedback');
    if (!inp || !fb) return;

    const userVal = inp.value.trim().toLowerCase();
    const item = activeGame.words[activeGame.currentIndex];
    const allowed = [item.en, item.mainRu, item.ru, ...(item.extraRu ? item.extraRu.split(',') : [])].map(s => (s||'').trim().toLowerCase());

    if (allowed.includes(userVal)) {
        fb.style.background = '#d1fae5'; fb.style.color = '#065f46'; fb.innerText = '✨ Верно!';
        activeGame.correctWords.push(item);
    } else {
        fb.style.background = '#fee2e2'; fb.style.color = '#991b1b'; fb.innerText = `❌ Ошибка! Ответ: "${item.mainRu || item.ru}"`;
        activeGame.errors.push(item);
    }
    fb.style.display = 'block';

    setTimeout(() => { activeGame.currentIndex++; renderGameStep(); }, 1200);
}

// 3 & 4. Сопоставление пар
function renderMatchingMode(isExtra = false) {
    const container = document.getElementById('activeGameContainer');
    const words = activeGame.words;
    const leftList = [...words].sort(() => Math.random() - 0.5);
    const rightList = [...words].sort(() => Math.random() - 0.5);

    let html = `<div style="text-align:center; font-weight:bold; color:#0284c7; margin-bottom:8px;">${isExtra ? '🧩 Сопоставление (Дополнительные переводы)' : '🧩 Сопоставление (Основной перевод)'}</div>`;
    html += '<div class="matching-grid"><div class="matching-column">';
    
    leftList.forEach(w => html += `<button class="matching-btn" data-type="en" data-id="${w.id}" onclick="handleMatchingClick(this)">${w.en}</button>`);
    html += '</div><div class="matching-column">';
    
    rightList.forEach(w => {
        let textToShow = isExtra ? (w.extraRu || w.mainRu || w.ru) : (w.mainRu || w.ru);
        html += `<button class="matching-btn" data-type="ru" data-id="${w.id}" onclick="handleMatchingClick(this)">${textToShow}</button>`;
    });
    
    html += '</div></div>';
    container.innerHTML = html;
}

let selectedLeftBtn = null;
let selectedRightBtn = null;
function handleMatchingClick(btn) {
    if (btn.classList.contains('correct')) return;
    const type = btn.getAttribute('data-type');

    if (type === 'en') {
        document.querySelectorAll('.matching-btn[data-type="en"]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected'); selectedLeftBtn = btn;
    } else {
        document.querySelectorAll('.matching-btn[data-type="ru"]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected'); selectedRightBtn = btn;
    }

    if (selectedLeftBtn && selectedRightBtn) {
        const idLeft = parseInt(selectedLeftBtn.getAttribute('data-id'));
        const idRight = parseInt(selectedRightBtn.getAttribute('data-id'));
        const wordObj = activeGame.words.find(w => w.id === idLeft);

        if (idLeft === idRight) {
            selectedLeftBtn.className = 'matching-btn correct';
            selectedRightBtn.className = 'matching-btn correct';
            if (wordObj && !activeGame.correctWords.includes(wordObj)) activeGame.correctWords.push(wordObj);
            selectedLeftBtn = null; selectedRightBtn = null;
            if (document.querySelectorAll('.matching-btn.correct').length === activeGame.words.length * 2) {
                setTimeout(showGameSummary, 500);
            }
        } else {
            selectedLeftBtn.classList.add('wrong'); selectedRightBtn.classList.add('wrong');
            if (wordObj && !activeGame.errors.includes(wordObj)) activeGame.errors.push(wordObj);
            setTimeout(() => {
                if (selectedLeftBtn) selectedLeftBtn.classList.remove('selected', 'wrong');
                if (selectedRightBtn) selectedRightBtn.classList.remove('selected', 'wrong');
                selectedLeftBtn = null; selectedRightBtn = null;
            }, 500);
        }
    }
}

// 5. Аудио-погружение
function renderAudioStreamMode() {
    const container = document.getElementById('activeGameContainer');
    const item = activeGame.words[activeGame.currentIndex];

    container.innerHTML = `
        <div class="card" style="text-align: center; max-width: 450px; margin: 0 auto; padding: 25px;">
            <div style="font-size: 13px; color: #64748b;">🎧 Аудио-погружение</div>
            <div style="font-size: 30px; font-weight: bold; color: #2c3e50; margin: 15px 0;">${item.en}</div>
            <div style="font-size: 20px; color: #10b981; margin-bottom: 20px;">${item.mainRu || item.ru}</div>
            <div id="audioStreamStatus" style="font-size: 13px; color: #0284c7; font-weight: bold;">Слушаем произношение...</div>
        </div>
    `;

    speak(item.en);
    audioStreamTimeoutId = setTimeout(() => {
        speakRu(item.mainRu || item.ru);
        audioStreamTimeoutId = setTimeout(() => {
            speak(item.en);
            audioStreamTimeoutId = setTimeout(() => {
                if (!activeGame.correctWords.some(w => w.id === item.id)) activeGame.correctWords.push(item);
                activeGame.currentIndex++;
                renderGameStep();
            }, 2000);
        }, 1800);
    }, 1800);
}

// 6. Аудио-диктант
function renderAudioDictationMode() {
    const container = document.getElementById('activeGameContainer');
    const item = activeGame.words[activeGame.currentIndex];

    container.innerHTML = `
        <div class="card" style="text-align: center; max-width: 450px; margin: 0 auto; padding: 20px;">
            <div style="font-size: 13px; color: #64748b; margin-bottom: 10px;">🔊 Аудио-диктант</div>
            <button class="btn-main" style="width: 70px; height: 70px; border-radius: 50%; font-size: 24px; margin: 10px auto;" onclick="speak('${item.en}')">🔊</button>
            <input type="text" id="dictationInput" placeholder="Введите слово или перевод..." style="font-size: 16px; text-align: center; margin: 15px 0;" autocomplete="off" onkeyup="if(event.key==='Enter') checkDictationAnswer()">
            <button class="btn-main" onclick="checkDictationAnswer()">Проверить</button>
            <div id="dictationFeedback" style="display:none; margin-top:12px; padding:8px; border-radius:6px; font-weight:bold;"></div>
        </div>
    `;
    setTimeout(() => { speak(item.en); const inp = document.getElementById('dictationInput'); if (inp) inp.focus(); }, 300);
}

function checkDictationAnswer() {
    const inp = document.getElementById('dictationInput');
    const fb = document.getElementById('dictationFeedback');
    if (!inp || !fb) return;

    const userVal = inp.value.trim().toLowerCase();
    const item = activeGame.words[activeGame.currentIndex];
    const allowed = [item.en, item.mainRu, item.ru, ...(item.extraRu ? item.extraRu.split(',') : [])].map(s => (s||'').trim().toLowerCase());

    if (allowed.includes(userVal)) {
        fb.style.background = '#d1fae5'; fb.style.color = '#065f46'; fb.innerText = '✨ Отлично!';
        activeGame.correctWords.push(item);
    } else {
        fb.style.background = '#fee2e2'; fb.style.color = '#991b1b'; fb.innerText = `❌ Слово было: "${item.en}" (${item.mainRu || item.ru})`;
        activeGame.errors.push(item);
    }
    fb.style.display = 'block';

    setTimeout(() => { activeGame.currentIndex++; renderGameStep(); }, 1400);
}

// 7. Произношение
let micAudioStream = null;
let audioContext = null;
let micAnalyser = null;
let micCheckInterval = null;

function renderVoiceCheckMode() {
    const container = document.getElementById('activeGameContainer');
    const item = activeGame.words[activeGame.currentIndex];

    container.innerHTML = `
        <div class="card" style="text-align: center; max-width: 450px; margin: 0 auto; padding: 20px;">
            <div style="font-size: 13px; color: #64748b;">🎙️ Произношение (UK)</div>
            <div style="font-size: 26px; font-weight: bold; color: #2c3e50; margin: 10px 0;">${item.en}</div>
            <button class="btn-main" style="background:#0284c7; margin-bottom:15px;" onclick="speak('${item.en}')">🔊 Эталон UK</button>

            <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #cbd5e1; margin-bottom:15px;">
                <div id="micStatus" style="font-size:12px; color:#64748b; font-weight:bold; margin-bottom:8px;">Нажмите кнопку "Начать запись"</div>
                <div style="display:flex; gap:6px;">
                    <button id="btnRecToggle" class="btn-main" style="background:#ef4444; flex:1;" onclick="toggleMicRecording()">🎙️ Начать запись</button>
                </div>
            </div>

            <div style="display:flex; gap:10px;">
                <button class="btn-main" style="background:#ef4444;" onclick="recordVoiceStep(false)">❌ Повторить</button>
                <button class="btn-main" style="background:#10b981;" onclick="recordVoiceStep(true)">✅ Засчитать</button>
            </div>
        </div>
    `;
    setTimeout(() => speak(item.en), 300);
}

async function toggleMicRecording() {
    const btn = document.getElementById('btnRecToggle');
    const status = document.getElementById('micStatus');

    if (micAudioStream) {
        micAudioStream.getTracks().forEach(track => track.stop());
        micAudioStream = null;
        if (micCheckInterval) clearInterval(micCheckInterval);
        if (btn) { btn.innerText = '🎙️ Начать запись'; btn.style.background = '#ef4444'; }
        if (status) status.innerText = '✅ Запись остановлена. Оцените результат выше.';
        return;
    }

    try {
        micAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        micAnalyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(micAudioStream);
        source.connect(micAnalyser);
        micAnalyser.fftSize = 256;
        const dataArray = new Uint8Array(micAnalyser.frequencyBinCount);

        if (btn) { btn.innerText = '⏹ Остановить запись'; btn.style.background = '#dc2626'; }
        
        micCheckInterval = setInterval(() => {
            micAnalyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            let average = sum / dataArray.length;
            if (status) {
                if (average > 10) {
                    status.innerHTML = `<span style="color:#ef4444; font-weight:bold;">🔴 Запись... [Голос обнаружен! 🎙️]</span>`;
                } else {
                    status.innerHTML = `<span style="color:#0284c7;">🎙️ Говорите в микрофон...</span>`;
                }
            }
        }, 200);

    } catch (err) {
        alert('Ошибка доступа к микрофону! Убедитесь, что разрешили доступ в настройках браузера.');
    }
}

function recordVoiceStep(passed) {
    if (micAudioStream) { micAudioStream.getTracks().forEach(track => track.stop()); micAudioStream = null; }
    if (micCheckInterval) clearInterval(micCheckInterval);

    const item = activeGame.words[activeGame.currentIndex];
    if (passed) activeGame.correctWords.push(item);
    else activeGame.errors.push(item);
    activeGame.currentIndex++;
    renderGameStep();
}

// 8. Тест: Выбор 1 из 4
function renderTestChoiceMode() {
    const container = document.getElementById('activeGameContainer');
    const item = activeGame.words[activeGame.currentIndex];
    const correctTr = item.mainRu || item.ru || '';

    let distractors = dictionary.filter(w => w.id !== item.id && (w.mainRu || w.ru)).sort(() => Math.random() - 0.5).slice(0, 3);
    let options = [correctTr, ...distractors.map(d => d.mainRu || d.ru)].sort(() => Math.random() - 0.5);

    container.innerHTML = `
        <div class="card" style="text-align: center; max-width: 450px; margin: 0 auto; padding: 20px;">
            <div style="font-size: 13px; color: #64748b; margin-bottom: 5px;">🧠 Тест: выберите верный перевод</div>
            <div style="font-size: 26px; font-weight: bold; color: #2c3e50; margin: 15px 0;">
                ${item.en} <button class="btn-audio" onclick="speak('${item.en}')">🔊</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 15px;">
                ${options.map(opt => `<button type="button" class="test-option-btn" onclick="checkTestChoiceAnswer('${opt.replace(/'/g, "\\'")}', '${correctTr.replace(/'/g, "\\'")}')">${opt}</button>`).join('')}
            </div>
            <div id="testFeedback" style="display:none; padding:8px; border-radius:6px; font-weight:bold;"></div>
        </div>
    `;
}

function checkTestChoiceAnswer(selected, correct) {
    const item = activeGame.words[activeGame.currentIndex];
    const fb = document.getElementById('testFeedback');
    if (!fb) return;

    if (selected === correct) {
        fb.style.background = '#d1fae5'; fb.style.color = '#065f46'; fb.innerText = '✨ Верно!';
        activeGame.correctWords.push(item);
    } else {
        fb.style.background = '#fee2e2'; fb.style.color = '#991b1b'; fb.innerText = `❌ Ошибка! Правильно: "${correct}"`;
        activeGame.errors.push(item);
    }
    fb.style.display = 'block';

    setTimeout(() => { activeGame.currentIndex++; renderGameStep(); }, 1200);
}

// 9. Тест: Заполнение пропусков
function renderTestFillMode() {
    const container = document.getElementById('activeGameContainer');
    const item = activeGame.words[activeGame.currentIndex];
    const correctEn = item.en.toLowerCase();

    let maskedSentence = '';
    if (item.context && item.context.toLowerCase().includes(correctEn)) {
        let rawCtx = item.context.replace(/^\d+\.\s*/, '').split('—')[0].trim();
        maskedSentence = rawCtx.replace(new RegExp(correctEn, 'gi'), '_____');
    } else {
        maskedSentence = `Could you please tell me how to _____ this correctly?`;
    }

    let distractors = dictionary.filter(w => w.id !== item.id && w.en && w.en.length > 2).sort(() => Math.random() - 0.5).slice(0, 3);
    let options = [item.en, ...distractors.map(d => d.en)].sort(() => Math.random() - 0.5);

    container.innerHTML = `
        <div class="card" style="text-align: center; max-width: 480px; margin: 0 auto; padding: 20px;">
            <div style="font-size: 13px; color: #64748b; margin-bottom: 5px;">📝 Тест: вставьте пропущенное слово</div>
            <div style="font-size: 17px; font-weight: bold; color: #1e293b; margin: 15px 0; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1;">
                "${maskedSentence}"
            </div>
            <div style="font-size: 13px; color: #10b981; margin-bottom: 12px;">Подсказка (перевод): <strong>${item.mainRu || item.ru}</strong></div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px;">
                ${options.map(opt => `<button type="button" class="test-option-btn" onclick="checkTestFillAnswer('${opt.replace(/'/g, "\\'")}', '${item.en.replace(/'/g, "\\'")}')">${opt}</button>`).join('')}
            </div>
            <div id="testFillFeedback" style="display:none; padding:8px; border-radius:6px; font-weight:bold;"></div>
        </div>
    `;
}

function checkTestFillAnswer(selected, correct) {
    const item = activeGame.words[activeGame.currentIndex];
    const fb = document.getElementById('testFillFeedback');
    if (!fb) return;

    if (selected.toLowerCase() === correct.toLowerCase()) {
        fb.style.background = '#d1fae5'; fb.style.color = '#065f46'; fb.innerText = '✨ Отлично!';
        activeGame.correctWords.push(item);
    } else {
        fb.style.background = '#fee2e2'; fb.style.color = '#991b1b'; fb.innerText = `❌ Правильно: "${correct}"`;
        activeGame.errors.push(item);
    }
    fb.style.display = 'block';

    setTimeout(() => { activeGame.currentIndex++; renderGameStep(); }, 1200);
}

// 10. SRS Интервальное повторение
function renderSrsMode() { renderWrittenMode(); }

// 11. Конструктор слов
let scrambledUserLetters = [];
function renderScrambleMode() {
    const container = document.getElementById('activeGameContainer');
    const item = activeGame.words[activeGame.currentIndex];
    const letters = item.en.toLowerCase().split('').sort(() => Math.random() - 0.5);
    scrambledUserLetters = [];

    container.innerHTML = `
        <div class="card" style="text-align: center; max-width: 450px; margin: 0 auto; padding: 20px;">
            <div style="font-size: 13px; color: #64748b;">🔤 Конструктор слов: соберите слово по буквам</div>
            <div style="font-size: 20px; font-weight: bold; color: #27ae60; margin: 10px 0;">${item.mainRu || item.ru}</div>
            
            <div id="scrambleAnswerBox" style="min-height: 40px; border-bottom: 2px solid #0284c7; font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #1e293b; margin-bottom: 15px; display: flex; justify-content: center; gap: 4px;"></div>
            
            <div id="scrambleLettersBox" style="display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; margin-bottom: 15px;">
                ${letters.map((char, idx) => `<button type="button" class="btn-sm" style="font-size:16px; padding:6px 12px;" onclick="addScrambleLetter('${char}', this)">${char}</button>`).join('')}
            </div>

            <div style="display: flex; gap: 8px;">
                <button type="button" class="btn-main" style="background:#64748b;" onclick="resetScramble()">🔄 Сброс</button>
                <button type="button" class="btn-main" onclick="checkScrambleAnswer('${item.en.replace(/'/g, "\\'")}')">Проверить</button>
            </div>
            <div id="scrambleFeedback" style="display:none; margin-top:12px; padding:8px; border-radius:6px; font-weight:bold;"></div>
        </div>
    `;
}

function addScrambleLetter(char, btn) {
    scrambledUserLetters.push(char);
    btn.disabled = true;
    document.getElementById('scrambleAnswerBox').innerText = scrambledUserLetters.join('').toUpperCase();
}

function resetScramble() {
    scrambledUserLetters = [];
    document.getElementById('scrambleAnswerBox').innerText = '';
    document.querySelectorAll('#scrambleLettersBox button').forEach(b => b.disabled = false);
}

function checkScrambleAnswer(correct) {
    const item = activeGame.words[activeGame.currentIndex];
    const fb = document.getElementById('scrambleFeedback');
    const userStr = scrambledUserLetters.join('').toLowerCase();

    if (userStr === correct.toLowerCase()) {
        fb.style.background = '#d1fae5'; fb.style.color = '#065f46'; fb.innerText = '✨ Верно!';
        activeGame.correctWords.push(item);
    } else {
        fb.style.background = '#fee2e2'; fb.style.color = '#991b1b'; fb.innerText = `❌ Слово: "${correct}"`;
        activeGame.errors.push(item);
    }
    fb.style.display = 'block';
    setTimeout(() => { activeGame.currentIndex++; renderGameStep(); }, 1200);
}

// 12. Словарный спринт
function renderSprintMode() {
    const container = document.getElementById('activeGameContainer');
    if (!activeGame.sprintTimer) {
        activeGame.sprintTimer = setInterval(() => {
            activeGame.timeLeft--;
            const timerEl = document.getElementById('sprintTimeLabel');
            if (timerEl) timerEl.innerText = activeGame.timeLeft;
            if (activeGame.timeLeft <= 0) {
                clearInterval(activeGame.sprintTimer);
                showGameSummary();
            }
        }, 1000);
    }

    const item = activeGame.words[activeGame.currentIndex % activeGame.words.length];
    const isCorrectPair = Math.random() > 0.5;
    let shownTranslation = isCorrectPair ? (item.mainRu || item.ru) : (dictionary[Math.floor(Math.random() * dictionary.length)].mainRu || 'дерево');

    container.innerHTML = `
        <div class="card" style="text-align: center; max-width: 450px; margin: 0 auto; padding: 20px;">
            <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; color: #64748b; margin-bottom: 10px;">
                <span>⏱️ Время: <strong id="sprintTimeLabel" style="color:#ef4444;">${activeGame.timeLeft}</strong> с</span>
                <span>⭐ Очки: <strong style="color:#10b981;">${activeGame.score}</strong></span>
            </div>
            
            <div style="font-size: 28px; font-weight: bold; color: #1e293b; margin: 10px 0;">${item.en}</div>
            <div style="font-size: 20px; font-weight: 600; color: #0284c7; margin-bottom: 20px;">= ${shownTranslation}?</div>

            <div style="display: flex; gap: 10px;">
                <button type="button" class="btn-main" style="background:#ef4444;" onclick="answerSprint(${!isCorrectPair})">❌ Неверно</button>
                <button type="button" class="btn-main" style="background:#10b981;" onclick="answerSprint(${isCorrectPair})">✅ Верно</button>
            </div>
        </div>
    `;
}

function answerSprint(isRight) {
    const item = activeGame.words[activeGame.currentIndex % activeGame.words.length];
    if (isRight) {
        activeGame.score += 10;
        activeGame.correctWords.push(item);
    } else {
        activeGame.errors.push(item);
    }
    activeGame.currentIndex++;
    renderGameStep();
}

// ==========================================
// 9. ИТОГОВЫЙ ЭКРАН
// ==========================================
function showGameSummary() {
    const container = document.getElementById('activeGameContainer');
    if (!container) return;

    const totalSelected = activeGame.words.length;
    const passedCount = activeGame.currentIndex;
    const correctCount = activeGame.correctWords.length;
    const errorsCount = activeGame.errors.length;
    const repeatCount = activeGame.repeatWords ? activeGame.repeatWords.length : 0;
    const untouchedWords = activeGame.words.slice(activeGame.currentIndex);

    let tagOptionsHtml = '';
    categories.forEach(c => c.tags.forEach(t => tagOptionsHtml += `<option value="${t}">#${t}</option>`));

    let html = `
        <div class="card" style="padding: 20px;">
            <h2 style="text-align: center; color: #2c3e50; margin-bottom: 6px;">📊 Итоги тренировки</h2>
            <div style="text-align: center; font-size: 13px; color: #475569; margin-bottom: 15px; background: #f8fafc; padding: 10px; border-radius: 8px;">
                Всего в сессии: <strong>${totalSelected}</strong> | Пройдено: <strong>${passedCount}</strong> | 
                Верно: <strong style="color:#10b981;">${correctCount}</strong> | 
                Ошибок: <strong style="color:#ef4444;">${errorsCount}</strong> 
                ${repeatCount > 0 ? `| Повторить: <strong style="color:#f59e0b;">${repeatCount}</strong>` : ''}
                | Не участвовало: <strong style="color:#64748b;">${untouchedWords.length}</strong>
            </div>
            
            <div class="bulk-panel" style="margin-bottom: 15px; border-radius: 8px;">
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <strong>Массовое изменение тегов (<span id="gameSelectedCount">0</span> слов):</strong>
                    <select id="gameBulkTagSelect" style="padding: 4px; border-radius: 4px; font-size: 12px;">
                        <option value="">-- Выберите тег --</option>
                        ${tagOptionsHtml}
                    </select>
                    <button class="btn-action" style="background:#2ecc71;" onclick="applyGameBulkTag('add')">+ Тег</button>
                    <button class="btn-action" style="background:#e67e22;" onclick="applyGameBulkTag('remove')">- Тег</button>
                </div>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 8px;">
    `;

    if (activeGame.errors.length > 0) {
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                <span style="font-weight:bold; font-size:13px; color:#ef4444;">❌ Ошибки (${activeGame.errors.length}):</span>
                <button type="button" class="btn-sm" onclick="toggleBlockSelection('group_errors')">☑ Выбрать весь блок</button>
            </div>
        `;
        activeGame.errors.forEach(item => html += generateSummaryWordRow(item, '#fee2e2', '#fca5a5', '❌', 'group_errors'));
    }

    if (activeGame.repeatWords && activeGame.repeatWords.length > 0) {
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <span style="font-weight:bold; font-size:13px; color:#f59e0b;">🔄 Нужно повторить (${activeGame.repeatWords.length}):</span>
                <button type="button" class="btn-sm" onclick="toggleBlockSelection('group_repeat')">☑ Выбрать весь блок</button>
            </div>
        `;
        activeGame.repeatWords.forEach(item => html += generateSummaryWordRow(item, '#fef3c7', '#fcd34d', '🔄', 'group_repeat'));
    }

    if (activeGame.correctWords.length > 0) {
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <span style="font-weight:bold; font-size:13px; color:#10b981;">✅ Правильные (${activeGame.correctWords.length}):</span>
                <button type="button" class="btn-sm" onclick="toggleBlockSelection('group_correct')">☑ Выбрать весь блок</button>
            </div>
        `;
        activeGame.correctWords.forEach(item => html += generateSummaryWordRow(item, '#d1fae5', '#6ee7b7', '✅', 'group_correct'));
    }

    if (untouchedWords.length > 0) {
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <span style="font-weight:bold; font-size:13px; color:#64748b;">⏳ Не участвовали в уроке (${untouchedWords.length}):</span>
                <button type="button" class="btn-sm" onclick="toggleBlockSelection('group_untouched')">☑ Выбрать весь блок</button>
            </div>
        `;
        untouchedWords.forEach(item => html += generateSummaryWordRow(item, '#f1f5f9', '#cbd5e1', '⏳', 'group_untouched'));
    }

    html += `
            </div>
            <button class="btn-main" style="margin-top: 20px;" onclick="exitGame()">К настройкам</button>
        </div>
    `;
    container.innerHTML = html;
}

function generateSummaryWordRow(item, bg, border, icon, groupClass) {
    const tagsStr = item.tags ? item.tags.map(t => `#${t}`).join(' ') : '';
    const isChecked = gameSelectedWordIds.includes(item.id);
    return `
        <div style="display: flex; align-items: center; gap: 10px; background: ${bg}; border: 1px solid ${border}; padding: 8px 12px; border-radius: 6px;">
            <input type="checkbox" class="word-checkbox ${groupClass}" value="${item.id}" ${isChecked ? 'checked' : ''} onchange="toggleGameSelectWord(${item.id})">
            <div style="flex: 1;">
                <strong>${item.en}</strong> — ${item.mainRu || item.ru} 
                <span style="font-size: 11px; color: #64748b; margin-left: 6px;">(${tagsStr})</span>
            </div>
            <button type="button" class="btn-action" style="background:#0284c7;" onclick="openQuickTagModal(${item.id})">✏ теги</button>
            <span>${icon}</span>
        </div>
    `;
}

function toggleBlockSelection(groupClass) {
    const checkboxes = document.querySelectorAll(`.${groupClass}`);
    let allChecked = true;
    checkboxes.forEach(cb => { if (!cb.checked) allChecked = false; });

    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
        const id = parseInt(cb.value);
        if (!allChecked) {
            if (!gameSelectedWordIds.includes(id)) gameSelectedWordIds.push(id);
        } else {
            gameSelectedWordIds = gameSelectedWordIds.filter(i => i !== id);
        }
    });

    const label = document.getElementById('gameSelectedCount');
    if (label) label.innerText = gameSelectedWordIds.length;
}

function toggleGameSelectWord(id) {
    if (gameSelectedWordIds.includes(id)) gameSelectedWordIds = gameSelectedWordIds.filter(i => i !== id);
    else gameSelectedWordIds.push(id);
    const label = document.getElementById('gameSelectedCount');
    if (label) label.innerText = gameSelectedWordIds.length;
}

function applyGameBulkTag(action) {
    const sel = document.getElementById('gameBulkTagSelect');
    if (!sel || !sel.value) { alert('Выберите тег!'); return; }
    if (gameSelectedWordIds.length === 0) { alert('Отметьте галочками хотя бы одно слово!'); return; }

    const tag = sel.value;
    dictionary = dictionary.map(item => {
        if (gameSelectedWordIds.includes(item.id)) {
            let tags = item.tags ? [...item.tags] : [];
            if (action === 'add' && !tags.includes(tag)) tags.push(tag);
            if (action === 'remove') tags = tags.filter(t => t !== tag);
            return { ...item, tags };
        }
        return item;
    });

    saveAndRender(); showGameSummary();
    alert('Теги обновлены!');
}

async function hashPassword(p) {
    const msg = new TextEncoder().encode(p);
    const hash = await crypto.subtle.digest('SHA-256', msg);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function openChangePasswordModal() { document.getElementById('changePasswordModal').style.display = 'flex'; }
function closeChangePasswordModal() { document.getElementById('changePasswordModal').style.display = 'none'; }
async function submitChangePassword() {
    const oldP = document.getElementById('oldPasswordInput').value;
    const newP = document.getElementById('newPasswordInput').value;
    if (!oldP || !newP) return;
    const hash = await hashPassword(newP);
    await db.ref(`users_db/${currentUser}`).update({ password: hash });
    alert('Пароль изменен!');
    closeChangePasswordModal();
}

updateColumnCheckboxes();