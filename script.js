// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ И АВТОРИЗАЦИЯ (FIREBASE)
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
let existingDuplicateId = null;

let activeSearchQuery = '';
let activeTagFilter = '';
let currentSortColumn = 'en';
let currentSortDirection = 'asc';

let lastEditedWordId = null;
let categoryVisibility = JSON.parse(localStorage.getItem('my_category_visibility')) || {};

let columnVisibility = JSON.parse(localStorage.getItem('my_column_visibility')) || {
    en: true, mainRu: true, extraRu: true, context: true, tags: true, actions: true
};

// Переключение Режима Вход / Регистрация
function toggleAuthMode(e) {
    if (e) e.preventDefault();
    isRegisterMode = !isRegisterMode;
    
    const title = document.getElementById('authTitle');
    const btn = document.getElementById('btnAuthAction');
    const text = document.getElementById('authToggleText');
    const link = document.getElementById('authToggleLink');
    const err = document.getElementById('authError');
    
    err.style.display = 'none';

    if (isRegisterMode) {
        title.innerText = '📝 Регистрация';
        btn.innerText = 'Создать аккаунт';
        text.innerText = 'Уже есть аккаунт?';
        link.innerText = 'Войти';
    } else {
        title.innerText = '🔑 Вход в словарь';
        btn.innerText = 'Войти';
        text.innerText = 'Нет аккаунта?';
        link.innerText = 'Зарегистрироваться';
    }
}

async function handleAuthSubmit() {
    const loginInput = document.getElementById('authLogin').value.trim().toLowerCase();
    const passwordInput = document.getElementById('authPassword').value.trim();
    const errEl = document.getElementById('authError');

    errEl.style.display = 'none';
    if (!loginInput || !passwordInput) {
        errEl.innerText = 'Заполните логин и пароль!';
        errEl.style.display = 'block';
        return;
    }

    const passwordHash = await hashPassword(passwordInput);
    const userRef = db.ref(`users_db/${loginInput}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();

    if (isRegisterMode) {
        if (userData) {
            errEl.innerText = 'Пользователь с таким логином уже существует!';
            errEl.style.display = 'block';
            return;
        }
        await userRef.set({ password: passwordHash, createdAt: Date.now() });
        setCurrentUser(loginInput);
    } else {
        if (!userData || userData.password !== passwordHash) {
            errEl.innerText = 'Неверный логин или пароль!';
            errEl.style.display = 'block';
            return;
        }
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

function logoutUser() {
    localStorage.removeItem('my_dict_user');
    currentUser = null;
    location.reload();
}

function attachUserListeners() {
    if (!currentUser) return;

    db.ref(`users_data/${currentUser}/dictionary`).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            dictionary = Array.isArray(data) ? data : Object.values(data);
            dictionary.sort((a, b) => b.id - a.id);
        } else {
            dictionary = [];
        }
        renderWords();
        populateGameTagFilters();
        renderSingleTagFilter();
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
        renderSingleTagFilter();
        renderCategoryVisibilityCheckboxes();
    });
}

function saveAndRender() {
    if (!currentUser) return;
    const dictObject = {};
    dictionary.forEach(item => {
        dictObject[item.id] = item;
    });
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
} else {
    document.getElementById('authModal').style.display = 'flex';
}

// ==========================================
// 2. НАВИГАЦИЯ И ФОРМА
// ==========================================

function renderCategoryVisibilityCheckboxes() {
    const bar = document.getElementById('categoryVisibilityBar');
    if (!bar) return;
    bar.innerHTML = '';

    categories.forEach(cat => {
        // По умолчанию все категории видны, если настройки еще нет
        if (categoryVisibility[cat.id] === undefined) {
            categoryVisibility[cat.id] = true;
        }

        const isChecked = categoryVisibility[cat.id];
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleCategoryVisibility(${cat.id}, this.checked)"> ${cat.name}`;
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

    if (card.style.display === 'none') {
        card.style.display = 'block';
        text.innerText = 'Свернуть форму добавления';
        icon.innerText = '➖';
    } else {
        card.style.display = 'none';
        text.innerText = 'Добавить новое слово';
        icon.innerText = '➕';
    }
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
        restoreGameSettings();
        exitGame();
    }
}

function restoreGameSettings() {
    const savedTag = localStorage.getItem('my_dict_last_tag');
    const savedSize = localStorage.getItem('my_dict_last_size');
    const savedDir = localStorage.getItem('my_dict_last_dir');

    if (savedTag) {
        const tagSelect = document.getElementById('gameTagFilter');
        if (tagSelect) tagSelect.value = savedTag;
    }
    if (savedSize) {
        const sizeSelect = document.getElementById('gameSizeSelect');
        if (sizeSelect) {
            sizeSelect.value = savedSize;
            toggleCustomGameSize(sizeSelect);
        }
    }
    if (savedDir) {
        const dirSelect = document.getElementById('gameDirection');
        if (dirSelect) dirSelect.value = savedDir;
    }
}

function speak(text, rate = 0.9) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = rate;
    const voices = window.speechSynthesis.getVoices();
    const ukVoice = voices.find(v => v.lang === 'en-GB' || v.lang.includes('GB') || v.lang.includes('en_GB'));
    if (ukVoice) utterance.voice = ukVoice;
    window.speechSynthesis.speak(utterance);
}

function speakRu(text) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU';
    window.speechSynthesis.speak(utterance);
}

// ==========================================
// 3. КАТЕГОРИИ И ТЕГИ
// ==========================================
function editCategoryName(catId) {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;
    const newName = prompt('Введите новое название категории:', cat.name);
    if (newName && newName.trim()) {
        cat.name = newName.trim();
        saveCategories();
    }
}

function addTagToCategory(catId) {
    const input = document.getElementById(`inputCatTag_${catId}`);
    const tag = input.value.trim().toLowerCase();
    if (!tag) return;
    const cat = categories.find(c => c.id === catId);
    if (cat && !cat.tags.includes(tag)) {
        cat.tags.push(tag);
        input.value = '';
        saveCategories();
    }
}

function removeTagFromCategory(catId, tag, event) {
    event.stopPropagation();
    const cat = categories.find(c => c.id === catId);
    if (cat) {
        cat.tags = cat.tags.filter(t => t !== tag);
        selectedFormTags = selectedFormTags.filter(t => t !== tag);
        dictionary = dictionary.map(word => {
            if (word.tags && word.tags.includes(tag)) {
                return { ...word, tags: word.tags.filter(t => t !== tag) };
            }
            return word;
        });
        saveAndRender();
        saveCategories();
        renderFormSelectedTags();
    }
}

function quickEditWordTags(wordId) {
    const word = dictionary.find(w => w.id === wordId);
    if (!word) return;
    const currentTagsStr = word.tags ? word.tags.join(', ') : '';
    const newTagsStr = prompt(`Редактирование тегов для "${word.en}":\n(вводите через запятую)`, currentTagsStr);
    if (newTagsStr !== null) {
        word.tags = newTagsStr.split(',').map(t => t.trim().toLowerCase().replace(/^#/, '')).filter(t => t !== '');
        saveAndRender();
    }
}

function toggleFormTag(tag) {
    if (selectedFormTags.includes(tag)) {
        selectedFormTags = selectedFormTags.filter(t => t !== tag);
    } else {
        selectedFormTags.push(tag);
    }
    renderCategoriesUI();
    renderFormSelectedTags();
}

function renderCategoriesUI() {
    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;
    grid.innerHTML = '';

    categories.forEach(cat => {
        const catBox = document.createElement('div');
        catBox.className = 'cat-box';
        let tagsHtml = cat.tags.map(tag => {
            const isSelected = selectedFormTags.includes(tag);
            return `
                <div class="tag-chip ${isSelected ? 'selected' : ''}" onclick="toggleFormTag('${tag}')">
                    #${tag}
                    <button type="button" class="tag-del-btn" onclick="removeTagFromCategory(${cat.id}, '${tag}', event)">✕</button>
                </div>
            `;
        }).join('');

        catBox.innerHTML = `
            <div class="cat-header">
                <div class="cat-title">${cat.name}</div>
                <button type="button" class="btn-edit-cat" onclick="editCategoryName(${cat.id})">✏ переименовать</button>
            </div>
            <div class="tags-selector">${tagsHtml}</div>
            <div class="add-tag-inline">
                <input type="text" id="inputCatTag_${cat.id}" placeholder="Новый тег">
                <button type="button" onclick="addTagToCategory(${cat.id})">+ Добавить</button>
            </div>
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
// 4. АВТОПЕРЕВОД И ВЫДЕЛЕНИЕ ТЕГОВ ПО ЧАСТЯМ РЕЧИ
// ==========================================
function cleanText(text) {
    return text.toLowerCase().replace(/^[a-я]\.\s*/gi, '').trim();
}

const posDictionary = {
    'noun': 'noun', 'существительное': 'noun',
    'verb': 'verb', 'глагол': 'verb',
    'adjective': 'adjective', 'прилагательное': 'adjective',
    'adverb': 'adverb', 'наречие': 'adverb',
    'preposition': 'preposition', 'предлог': 'preposition',
    'pronoun': 'pronoun', 'местоимение': 'pronoun',
    'conjunction': 'conjunction', 'союз': 'conjunction'
};

function refreshWordData() {
    autoTranslate(true);
}

async function fetchWordDetails(word) {
    try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&dt=bd&q=${encodeURIComponent(word)}`);
        if (!res.ok) return null;

        const data = await res.json();
        let variants = [];
        let detectedPosList = [];

        if (data[0] && data[0][0] && data[0][0][0]) {
            const mainTr = cleanText(data[0][0][0]);
            if (mainTr) variants.push(mainTr);
        }

        if (data[1] && Array.isArray(data[1])) {
            data[1].forEach(partOfSpeechBlock => {
                const rawPosStr = (partOfSpeechBlock[0] || '').toLowerCase().trim();
                for (let key in posDictionary) {
                    if (rawPosStr.includes(key)) {
                        const mappedTag = posDictionary[key];
                        if (!detectedPosList.includes(mappedTag)) {
                            detectedPosList.push(mappedTag);
                        }
                    }
                }

                if (partOfSpeechBlock[1] && Array.isArray(partOfSpeechBlock[1])) {
                    partOfSpeechBlock[1].forEach(translation => {
                        const cleanTr = cleanText(translation);
                        if (cleanTr && !variants.includes(cleanTr) && cleanTr.length < 30) {
                            variants.push(cleanTr);
                        }
                    });
                }
            });
        }

        return {
            mainRu: variants[0] || '',
            extraRu: variants.slice(1).join(', '),
            detectedPosList
        };
    } catch (e) {
        return null;
    }
}

function handleEnglishInput() {
    const word = document.getElementById('englishWord').value.trim().toLowerCase();
    const dupBox = document.getElementById('duplicateWarning');
    const dupDetails = document.getElementById('duplicateDetails');
    
    duplicateMode = 'none';
    existingDuplicateId = null;
    if (dupBox) dupBox.style.display = 'none';

    if (!word) {
        autoTranslate();
        return;
    }

    const editId = document.getElementById('editWordId').value;
    const existing = dictionary.find(item => item.en.toLowerCase() === word && item.id !== parseInt(editId));

    if (existing && dupBox && dupDetails) {
        existingDuplicateId = existing.id;
        const mainTr = existing.mainRu || existing.ru || 'без перевода';
        dupDetails.innerText = `Текущий перевод: «${mainTr}»`;
        dupBox.style.display = 'block';
    }

    autoTranslate();
}

function autoTranslate(forceRefresh = false) {
    if (document.getElementById('editWordId').value !== "" && !forceRefresh) return;

    clearTimeout(translateTimer);
    const word = document.getElementById('englishWord').value.trim();
    const status = document.getElementById('translateStatus');
    const sugBox = document.getElementById('suggestionsBox');
    
    if (!word) {
        document.getElementById('mainTranslation').value = '';
        document.getElementById('extraTranslations').value = '';
        if (status) status.innerText = '';
        if (sugBox) sugBox.innerHTML = '';
        currentVariants = [];
        return;
    }

    if (status) status.innerText = 'Запрашиваем варианты и части речи...';

    translateTimer = setTimeout(async () => {
        const details = await fetchWordDetails(word);
        if (!details) {
            if (status) status.innerText = 'Ошибка загрузки данных';
            return;
        }

        // Автоматически добавляем найденные части речи в выбранные теги формы
        details.detectedPosList.forEach(posTag => {
            if (!selectedFormTags.includes(posTag)) {
                selectedFormTags.push(posTag);
            }
        });

        renderCategoriesUI();
        renderFormSelectedTags();

        if (sugBox) sugBox.innerHTML = '';
        const allVars = [details.mainRu, ...details.extraRu.split(', ').filter(x => x)];
        currentVariants = allVars;

        if (allVars.length > 0) {
            if (forceRefresh || !document.getElementById('mainTranslation').value.trim()) {
                document.getElementById('mainTranslation').value = details.mainRu;
            }

            if (sugBox) {
                const btnAll = document.createElement('button');
                btnAll.type = 'button';
                btnAll.className = 'sug-btn-all';
                btnAll.innerText = '✨ Добавить все варианты в дополнительные';
                btnAll.onclick = selectAllVariantsToExtra;
                sugBox.appendChild(btnAll);

                allVars.forEach((variant, index) => {
                    const chip = document.createElement('div');
                    chip.className = index === 0 ? 'sug-chip' : 'sug-chip sug-chip-extra';
                    chip.innerText = index === 0 ? `главное: ${variant}` : `+ ${variant}`;
                    chip.onclick = () => addTranslationOption(variant, index === 0);
                    sugBox.appendChild(chip);
                });
            }

            if (status) {
                const posInfo = details.detectedPosList.length > 0 ? ` [Найдены роли: ${details.detectedPosList.join(', ')}]` : '';
                status.innerText = `Найдено вариантов: ${allVars.length}${posInfo}`;
            }
        } else {
            if (status) status.innerText = 'Перевод не найден';
        }
    }, 350);
}

function selectAllVariantsToExtra() {
    if (currentVariants.length > 1) {
        const extraInput = document.getElementById('extraTranslations');
        const extrasOnly = currentVariants.slice(1);
        extraInput.value = extrasOnly.join(', ');
    }
}

function addTranslationOption(text, isMain) {
    if (isMain) {
        document.getElementById('mainTranslation').value = text;
    } else {
        const extraInput = document.getElementById('extraTranslations');
        let current = extraInput.value.trim();
        if (!current) {
            extraInput.value = text;
        } else {
            const parts = current.split(',').map(p => p.trim());
            if (!parts.includes(text)) {
                extraInput.value = current + ', ' + text;
            }
        }
    }
}

function setDuplicateAction(action) {
    duplicateMode = action;
    const dupBox = document.getElementById('duplicateWarning');
    if (!dupBox) return;

    if (action === 'replace') {
        dupBox.style.background = '#d1e7dd';
        dupBox.style.borderColor = '#badbcc';
        dupBox.style.color = '#0f5132';
        dupBox.innerHTML = '✅ <strong>Режим замены:</strong> при сохранении текущие данные слова будут обновлены.';
    } else if (action === 'add_new') {
        dupBox.style.background = '#cff4fc';
        dupBox.style.borderColor = '#b6effb';
        dupBox.style.color = '#055160';
        dupBox.innerHTML = '➕ <strong>Режим дубликата:</strong> слово сохраняется как новая отдельная карточка.';
    }
}

// Генерация ИИ примеров
async function generateAIExamples() {
    const word = document.getElementById('englishWord').value.trim();
    if (!word) {
        alert('Сначала введите английское слово!');
        return;
    }

    const contextBox = document.getElementById('contextInput');
    const mainRu = document.getElementById('mainTranslation').value || word;
    contextBox.value = '🤖 ИИ генерирует 3 примера...';

    setTimeout(() => {
        contextBox.value = `1. I need to ${word} this right now. — Мне нужно ${mainRu} это прямо сейчас.\n2. This is a good way to ${word}. — Это хороший способ ${mainRu}.\n3. How can we ${word} it? — Как мы можем это ${mainRu}?`;
    }, 400);
}

// ==========================================
// 5. СОХРАНЕНИЕ И РЕДАКТИРОВАНИЕ СЛОВ
// ==========================================
function saveWord() {
    const idInput = document.getElementById('editWordId').value;
    const en = document.getElementById('englishWord').value.trim();
    const mainRu = document.getElementById('mainTranslation').value.trim();
    const extraRu = document.getElementById('extraTranslations').value.trim();
    const context = document.getElementById('contextInput').value.trim();

    if (!en || !mainRu) {
        alert('Заполните слово и основной перевод!');
        return;
    }

    const numericId = idInput ? parseInt(idInput) : null;
    let targetId = numericId;

    if (numericId) {
        dictionary = dictionary.map(item => {
            if (item.id === numericId) {
                return { ...item, en, mainRu, extraRu, context, tags: [...selectedFormTags] };
            }
            return item;
        });
    } else {
        targetId = Date.now();
        dictionary.unshift({
            id: targetId,
            en, mainRu, extraRu, context,
            tags: [...selectedFormTags],
            createdAt: new Date().toISOString(),
            reviewCount: 0,
            errorCount: 0
        });
    }

    lastEditedWordId = targetId; // 👈 Запоминаем ID сохраненного слова

    saveAndRender();
    resetForm();
    
    const formCard = document.getElementById('formCard');
    if (formCard) formCard.style.display = 'none';
    
    const textEl = document.getElementById('toggleFormText');
    if (textEl) textEl.innerText = 'Добавить новое слово';
    
    const iconEl = document.getElementById('toggleFormIcon');
    if (iconEl) iconEl.innerText = '➕';
}

function editWord(id) {
    lastEditedWordId = id; // 👈 Запоминаем ID редактируемого слова
    const item = dictionary.find(w => w.id === id);
    if (!item) return;

    const formCard = document.getElementById('formCard');
    if (formCard) formCard.style.display = 'block';

    const textEl = document.getElementById('toggleFormText');
    if (textEl) textEl.innerText = 'Свернуть форму редактирования';

    const iconEl = document.getElementById('toggleFormIcon');
    if (iconEl) iconEl.innerText = '➖';

    document.getElementById('editWordId').value = item.id;
    document.getElementById('englishWord').value = item.en;
    document.getElementById('mainTranslation').value = item.mainRu || item.ru || '';
    document.getElementById('extraTranslations').value = item.extraRu || '';
    document.getElementById('contextInput').value = item.context || '';
    selectedFormTags = item.tags ? [...item.tags] : [];

    const formTitle = document.getElementById('formTitle');
    if (formTitle) formTitle.innerText = 'Редактировать слово';
    
    const btnSubmit = document.getElementById('btnSubmit');
    if (btnSubmit) btnSubmit.innerText = 'Сохранить изменения';
    
    const btnCancel = document.getElementById('btnCancel');
    if (btnCancel) btnCancel.style.display = 'block';
    
    renderCategoriesUI();
    renderFormSelectedTags();
    if (formCard) formCard.scrollIntoView({ behavior: 'smooth' });
}

function deleteWord(id) {
    if (confirm('Удалить слово?')) {
        dictionary = dictionary.filter(item => item.id !== id);
        saveAndRender();
        resetForm();
    }
}

function resetForm() {
    document.getElementById('editWordId').value = '';
    document.getElementById('englishWord').value = '';
    document.getElementById('mainTranslation').value = '';
    document.getElementById('extraTranslations').value = '';
    document.getElementById('contextInput').value = '';
    
    const status = document.getElementById('translateStatus');
    if (status) status.innerText = '';

    const sugBox = document.getElementById('suggestionsBox');
    if (sugBox) sugBox.innerHTML = '';

    const dupBox = document.getElementById('duplicateWarning');
    if (dupBox) dupBox.style.display = 'none';

    duplicateMode = 'none';
    existingDuplicateId = null;
    selectedFormTags = [];

    const formTitle = document.getElementById('formTitle');
    if (formTitle) formTitle.innerText = 'Добавить новое слово';
    
    const btnSubmit = document.getElementById('btnSubmit');
    if (btnSubmit) btnSubmit.innerText = 'Добавить слово';
    
    const btnCancel = document.getElementById('btnCancel');
    if (btnCancel) btnCancel.style.display = 'none';
    
    renderCategoriesUI();
    renderFormSelectedTags();
}

// ==========================================
// 6. ТАБЛИЦА И ФИЛЬТРЫ СЛОВАРЯ
// ==========================================
function getFilteredWords() {
    return dictionary.filter(item => {
        const matchEn = (item.en || '').toLowerCase().includes(activeSearchQuery);
        const matchRuMain = (item.mainRu || item.ru || '').toLowerCase().includes(activeSearchQuery);
        const matchRuExtra = (item.extraRu || '').toLowerCase().includes(activeSearchQuery);
        const matchCtx = (item.context || '').toLowerCase().includes(activeSearchQuery);
        const matchText = matchEn || matchRuMain || matchRuExtra || matchCtx;

        let matchTag = true;
        if (activeTagFilter) {
            matchTag = item.tags && item.tags.includes(activeTagFilter);
        }

        return matchText && matchTag;
    }).sort((a, b) => {
        let valA = (a[currentSortColumn] || '').toString().toLowerCase();
        let valB = (b[currentSortColumn] || '').toString().toLowerCase();

        if (currentSortColumn === 'tags') {
            valA = a.tags ? a.tags.length : 0;
            valB = b.tags ? b.tags.length : 0;
        }

        if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
        return 0;
    });
}

function renderTableHeaders() {
    const tr = document.getElementById('tableHeaderRow');
    if (!tr) return;

    function getSortIcon(col) {
        if (currentSortColumn !== col) return '<span class="sort-icon">⇅</span>';
        return currentSortDirection === 'asc' ? '<span class="sort-icon" style="color:#10b981;">▲</span>' : '<span class="sort-icon" style="color:#10b981;">▼</span>';
    }

    let html = `<th style="width: 30px;"></th>`;
    html += `<th class="th-sortable" onclick="sortBy('en')">Слово (EN) ${getSortIcon('en')}</th>`;
    html += `<th class="th-sortable" onclick="sortBy('mainRu')">Основной перевод ${getSortIcon('mainRu')}</th>`;

    if (columnVisibility.extraRu) {
        html += `<th class="th-sortable" onclick="sortBy('extraRu')">Доп. переводы ${getSortIcon('extraRu')}</th>`;
    }
    if (columnVisibility.context) {
        html += `<th class="th-sortable" onclick="sortBy('context')">Примеры / Контекст ${getSortIcon('context')}</th>`;
    }
    if (columnVisibility.tags) {
        html += `<th class="th-sortable" onclick="sortBy('tags')">Теги ${getSortIcon('tags')}</th>`;
    }
    if (columnVisibility.actions) {
        html += `<th class="th-sortable" onclick="sortBy('id')">Изменено ${getSortIcon('id')}</th>`;
        html += `<th>Действия</th>`;
    }

    tr.innerHTML = html;
}

function renderSingleTagFilter() {
    const filterSelect = document.getElementById('singleTagFilter');
    if (!filterSelect) return;
    const currentVal = filterSelect.value;
    filterSelect.innerHTML = '<option value="">-- Все теги --</option>';

    const tagCounts = {};
    dictionary.forEach(item => {
        if (item.tags && Array.isArray(item.tags)) {
            item.tags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        }
    });

    let orderedTags = [];
    categories.forEach(cat => {
        if (cat.tags && Array.isArray(cat.tags)) {
            cat.tags.forEach(tag => {
                if (!orderedTags.includes(tag)) orderedTags.push(tag);
            });
        }
    });

    Object.keys(tagCounts).forEach(tag => {
        if (!orderedTags.includes(tag)) orderedTags.push(tag);
    });

    orderedTags.forEach(tag => {
        const count = tagCounts[tag] || 0;
        const opt = document.createElement('option');
        opt.value = tag;
        opt.innerText = `#${tag} (${count})`;
        if (tag === currentVal) opt.selected = true;
        filterSelect.appendChild(opt);
    });
}

function applyFilters() {
    const searchInput = document.getElementById('searchInput');
    const filterSelect = document.getElementById('singleTagFilter');
    activeSearchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
    activeTagFilter = filterSelect ? filterSelect.value : '';
    renderWords();
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('singleTagFilter').value = '';
    activeSearchQuery = '';
    activeTagFilter = '';
    renderWords();
}

function sortBy(column) {
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }
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

function toggleSecretText(el) {
    el.classList.toggle('revealed');
}

function updateBulkUI() {
    const countLabel = document.getElementById('selectedCount');
    const actionsBox = document.getElementById('bulkActionsBox');
    if (countLabel) countLabel.innerText = selectedWordIds.length;
    if (actionsBox) actionsBox.style.display = selectedWordIds.length > 0 ? 'flex' : 'none';
}

function toggleSelectWord(id) {
    if (selectedWordIds.includes(id)) {
        selectedWordIds = selectedWordIds.filter(i => i !== id);
    } else {
        selectedWordIds.push(id);
    }
    updateBulkUI();
}

function renderWords() {
    const currentScrollY = window.scrollY;
    renderTableHeaders();

    const tbody = document.getElementById('dictTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const filtered = getFilteredWords();

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#888; padding: 20px;">Слов не найдено</td></tr>';
        updateBulkUI();
        return;
    }
    

    filtered.forEach(item => {
        if (item.reviewCount === undefined) item.reviewCount = 0;
        if (item.errorCount === undefined) item.errorCount = 0;

        const isChecked = selectedWordIds.includes(item.id);
        let tagsHtml = '';
if (item.tags && Array.isArray(item.tags)) {
    // Фильтруем теги: оставляем только те, которые принадлежат видимым категориям
    const visibleTags = item.tags.filter(tag => {
        // Находим, к какой категории принадлежит этот тег
        const parentCat = categories.find(cat => cat.tags && cat.tags.includes(tag));
        // Если категория не найдена или её чекбокс включен — показываем тег
        if (!parentCat) return true;
        return categoryVisibility[parentCat.id] !== false;
    });
    tagsHtml = visibleTags.map(t => `<span class="tag">#${t}</span>`).join('');
}
        const mainText = item.mainRu || item.ru || '';

        const tr = document.createElement('tr');
        tr.id = `word-row-${item.id}`;
        
        let rowHtml = `<td><input type="checkbox" class="word-checkbox" ${isChecked ? 'checked' : ''} onchange="toggleSelectWord(${item.id})"></td>`;

        if (columnVisibility.en) {
            rowHtml += `
                <td>
                    <strong>${item.en}</strong>
                    <button class="btn-audio" onclick="event.stopPropagation(); speak('${item.en.replace(/'/g, "\\'")}')">🔊</button>
                </td>
            `;
        } else {
            rowHtml += `
                <td>
                    <span class="cell-hidden-text" onclick="toggleSecretText(this)">
                        <strong>${item.en}</strong>
                    </span>
                    <button class="btn-audio" onclick="event.stopPropagation(); speak('${item.en.replace(/'/g, "\\'")}')">🔊</button>
                </td>
            `;
        }

        if (columnVisibility.mainRu) {
            rowHtml += `<td style="color:#27ae60; font-weight:600;">${mainText}</td>`;
        } else {
            rowHtml += `
                <td>
                    <span class="cell-hidden-text" onclick="toggleSecretText(this)">
                        <strong style="color:#27ae60;">${mainText}</strong>
                    </span>
                </td>
            `;
        }

        if (columnVisibility.extraRu) {
            rowHtml += `<td style="color:#64748b;"><div class="cell-scrollable">${item.extraRu || ''}</div></td>`;
        }

        if (columnVisibility.context) {
            rowHtml += `<td style="white-space:pre-line; color:#555;"><div class="cell-scrollable">${item.context || ''}</div></td>`;
        }

        if (columnVisibility.tags) {
            rowHtml += `
                <td>
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                        <div class="tags">${tagsHtml}</div>
                        <button type="button" class="btn-edit-cat" onclick="quickEditWordTags(${item.id})" title="Изменить теги">✏</button>
                    </div>
                </td>
            `;
        }

        if (columnVisibility.actions) {
            rowHtml += `
                <td>
                    <div class="actions">
                        <button class="btn-action btn-edit" onclick="editWord(${item.id})">✏</button>
                        <button class="btn-action btn-delete" onclick="deleteWord(${item.id})">🗑️</button>
                    </div>
                </td>
            `;
        }

        tr.innerHTML = rowHtml;
        tbody.appendChild(tr);
    });

    updateBulkUI();

    window.scrollTo({
        top: currentScrollY,
        behavior: 'instant'
    });

    // 👈 Возврат к отредактированному слову и его мягкая подсветка
    if (lastEditedWordId) {
        const rowEl = document.getElementById(`word-row-${lastEditedWordId}`);
        if (rowEl) {
            rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            rowEl.style.transition = 'background-color 0.5s';
            rowEl.style.backgroundColor = '#d1fae5'; // Зеленоватая подсветка
            setTimeout(() => {
                rowEl.style.backgroundColor = '';
            }, 1500);
        }
        lastEditedWordId = null;
    }
}

// ==========================================
// 7. БЕЗОПАСНОСТЬ И ПАРОЛИ
// ==========================================
async function hashPassword(password) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function openChangePasswordModal() {
    document.getElementById('oldPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('changePassError').style.display = 'none';
    document.getElementById('changePassSuccess').style.display = 'none';
    document.getElementById('changePasswordModal').style.display = 'flex';
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'none';
}

async function submitChangePassword() {
    const oldPass = document.getElementById('oldPasswordInput').value.trim();
    const newPass = document.getElementById('newPasswordInput').value.trim();
    const errEl = document.getElementById('changePassError');
    const succEl = document.getElementById('changePassSuccess');

    errEl.style.display = 'none';
    succEl.style.display = 'none';

    if (!oldPass || !newPass) {
        errEl.innerText = 'Заполните оба поля!';
        errEl.style.display = 'block';
        return;
    }

    if (newPass.length < 4) {
        errEl.innerText = 'Новый пароль слишком короткий (минимум 4 символа)!';
        errEl.style.display = 'block';
        return;
    }

    if (!currentUser) return;

    const oldPassHash = await hashPassword(oldPass);
    const userRef = db.ref(`users_db/${currentUser}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();

    if (!userData || userData.password !== oldPassHash) {
        errEl.innerText = 'Неверный старый пароль!';
        errEl.style.display = 'block';
        return;
    }

    const newPassHash = await hashPassword(newPass);
    await userRef.update({ password: newPassHash });

    succEl.innerText = 'Пароль успешно изменен!';
    succEl.style.display = 'block';

    setTimeout(() => {
        closeChangePasswordModal();
    }, 1500);
}

// ==========================================
// 8. ВЫПАДАЮЩИЙ СПИСОК ЧЕКБОКСОВ СЛОВ
// ==========================================
function toggleWordChecklistDropdown() {
    const box = document.getElementById('wordChecklistDropdown');
    if (!box) return;
    const isHidden = box.style.display === 'none' || box.style.display === '';
    box.style.display = isHidden ? 'block' : 'none';
    if (isHidden) renderWordChecklistUI();
}

function renderWordChecklistUI() {
    const container = document.getElementById('wordChecklistContainer');
    const tagFilterEl = document.getElementById('gameTagFilter');
    const tagFilter = tagFilterEl ? tagFilterEl.value : 'all';
    
    if (!container) return;

    let pool = (tagFilter === 'all') 
        ? [...dictionary] 
        : dictionary.filter(w => w.tags && w.tags.includes(tagFilter));

    if (pool.length === 0) {
        container.innerHTML = '<em style="color:#888; font-size:12px;">Нет слов по выбранному тегу</em>';
        updateSelectedChecklistCount();
        return;
    }

    if (!window.activeChecklistIds) {
        window.activeChecklistIds = pool.map(w => w.id);
    }

    let html = '';
    pool.forEach(word => {
        const isChecked = window.activeChecklistIds.includes(word.id);
        html += `
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; background: #fff; padding: 6px 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
                <input type="checkbox" class="trainer-word-checkbox" value="${word.id}" ${isChecked ? 'checked' : ''} onchange="updateSelectedChecklistCount()">
                <strong>${word.en}</strong> — <span style="color: #27ae60;">${word.mainRu || word.ru || ''}</span>
            </label>
        `;
    });

    container.innerHTML = html;
    updateSelectedChecklistCount();
}

function setAllChecklistWords(select) {
    document.querySelectorAll('.trainer-word-checkbox').forEach(cb => {
        cb.checked = select;
    });
    updateSelectedChecklistCount();
}

function updateSelectedChecklistCount() {
    const checkboxes = document.querySelectorAll('.trainer-word-checkbox');
    let selectedCount = 0;
    window.activeChecklistIds = [];

    checkboxes.forEach(cb => {
        if (cb.checked) {
            selectedCount++;
            window.activeChecklistIds.push(parseInt(cb.value));
        }
    });

    const label = document.getElementById('selectedWordsCountLabel');
    if (label) {
        label.innerText = `${selectedCount} из ${checkboxes.length}`;
    }
}

// ==========================================
// 9. ИГРОВОЙ ДВИЖОК И РЕЖИМЫ ТРЕНИРОВОК
// ==========================================
let activeGame = {
    mode: '', words: [], currentIndex: 0, direction: 'both',
    errors: [], correctWords: [], tagFilter: '', selectedLeft: null, selectedRight: null, matchedCount: 0
};

function populateGameTagFilters() {
    const select = document.getElementById('gameTagFilter');
    if (!select) return;

    const tagCounts = {};
    dictionary.forEach(word => {
        if (word.tags) {
            word.tags.forEach(t => {
                tagCounts[t] = (tagCounts[t] || 0) + 1;
            });
        }
    });

    select.innerHTML = `<option value="all">Все слова (${dictionary.length})</option>`;
    Object.keys(tagCounts).sort().forEach(tag => {
        select.innerHTML += `<option value="${tag}">#${tag} (${tagCounts[tag]})</option>`;
    });
}

function toggleCustomGameSize(select) {
    const customInput = document.getElementById('gameCustomSize');
    if (select.value === 'custom') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
    }
}

function startGame(mode) {
    const tagFilter = document.getElementById('gameTagFilter').value;
    const sizeVal = document.getElementById('gameSizeSelect').value;
    const direction = document.getElementById('gameDirection').value;

    localStorage.setItem('my_dict_last_tag', tagFilter);
    localStorage.setItem('my_dict_last_size', sizeVal);
    localStorage.setItem('my_dict_last_dir', direction);

    let pool = (tagFilter === 'all') 
        ? [...dictionary] 
        : dictionary.filter(w => w.tags && w.tags.includes(tagFilter));

    if (window.activeChecklistIds && window.activeChecklistIds.length > 0) {
        pool = pool.filter(w => window.activeChecklistIds.includes(w.id));
    }

    if (pool.length === 0) {
        alert('Нет слов, соответствующих выбранному тегу или чекбоксам!');
        return;
    }

    let targetCount = pool.length;
    if (sizeVal === 'custom') {
        const val = parseInt(document.getElementById('gameCustomSize').value);
        if (isNaN(val) || val <= 0) {
            alert('Введите корректное количество слов!');
            return;
        }
        targetCount = val;
    } else if (sizeVal !== 'all') {
        targetCount = parseInt(sizeVal);
    }

    pool.sort(() => Math.random() - 0.5);
    const selectedWords = pool.slice(0, Math.min(targetCount, pool.length));

    activeGame = {
        mode,
        words: selectedWords,
        currentIndex: 0,
        direction,
        errors: [],
        correctWords: [],
        tagFilter,
        selectedLeft: null,
        selectedRight: null,
        matchedCount: 0
    };

    const setupCard = document.getElementById('gameSetupCard');
    const playArea = document.getElementById('gamePlayArea');
    if (setupCard) setupCard.style.display = 'none';
    if (playArea) playArea.style.display = 'block';

    renderGameStep();
}

function exitGame() {
    if (window.audioStreamTimeoutId) clearTimeout(window.audioStreamTimeoutId);
    window.speechSynthesis.cancel();
    
    const setupCard = document.getElementById('gameSetupCard');
    const playArea = document.getElementById('gamePlayArea');
    if (setupCard) setupCard.style.display = 'block';
    if (playArea) playArea.style.display = 'none';
}

function renderGameStep() {
    const container = document.getElementById('activeGameContainer');
    if (!container) return;
    container.innerHTML = '';

    const total = activeGame.words.length;
    const current = activeGame.currentIndex;

    const progText = document.getElementById('gameProgressText');
    const progFill = document.getElementById('gameProgressFill');
    if (progText) progText.innerText = `${current + 1} / ${total}`;
    if (progFill) progFill.style.width = `${((current + 1) / total) * 100}%`;

    if (current >= total && activeGame.mode !== 'matching') {
        showGameSummary();
        return;
    }

    if (activeGame.mode === 'flashcards') {
        renderFlashcardsMode();
    } else if (activeGame.mode === 'written') {
        renderWrittenMode();
    } else if (activeGame.mode === 'matching') {
        renderMatchingMode();
    } else if (activeGame.mode === 'audio_stream') {
        renderAudioStreamMode();
    } else if (activeGame.mode === 'audio_dictation') {
        renderAudioDictationMode();
    } else if (activeGame.mode === 'voice_check') {
        renderVoiceCheckMode();
    }
}

// 1. Флеш-карточки
let isCardFlipped = false;
function renderFlashcardsMode() {
    const container = document.getElementById('activeGameContainer');
    const item = activeGame.words[activeGame.currentIndex];
    isCardFlipped = false;

    container.innerHTML = `
        <div class="trainer-card" id="gameFlashCard" onclick="flipGameCard()">
            <div id="gameCardFront">
                <div class="trainer-word">${item.en}</div>
                <button class="btn-audio" onclick="event.stopPropagation(); speak('${item.en.replace(/'/g, "\\'")}')">🔊</button>
                <div class="trainer-hint">нажмите, чтобы перевернуть 🔄</div>
            </div>
            <div id="gameCardBack" style="display: none;">
                <div class="translation" style="font-size: 22px; font-weight: bold; color: #27ae60;">${item.mainRu || item.ru || ''}</div>
                ${item.extraRu ? `<div style="font-size: 15px; color: #64748b; margin-top: 4px;">Доп: ${item.extraRu}</div>` : ''}
                ${item.context ? `<div class="context" style="margin-top: 10px; font-size: 13px; color: #555;">💡 ${item.context}</div>` : ''}
            </div>
        </div>
        <div class="trainer-controls">
            <button class="btn-dontknow" onclick="nextGameCard(false)">❌ Не знаю</button>
            <button class="btn-know" onclick="nextGameCard(true)">✅ Знаю</button>
        </div>
    `;
}

function flipGameCard() {
    isCardFlipped = !isCardFlipped;
    const front = document.getElementById('gameCardFront');
    const back = document.getElementById('gameCardBack');
    if (front) front.style.display = isCardFlipped ? 'none' : 'block';
    if (back) back.style.display = isCardFlipped ? 'block' : 'none';
}

function nextGameCard(known) {
    const currentItem = activeGame.words[activeGame.currentIndex];
    if (known) {
        if (!activeGame.correctWords.some(w => w.id === currentItem.id)) activeGame.correctWords.push(currentItem);
    } else {
        if (!activeGame.errors.some(w => w.id === currentItem.id)) activeGame.errors.push(currentItem);
    }
    activeGame.currentIndex++;
    renderGameStep();
}

// 2. Письменный перевод (с проверкой основных и доп. переводов)
function renderWrittenMode() {
    const container = document.getElementById('activeGameContainer');
    const item = activeGame.words[activeGame.currentIndex];

    let isEnToRu = true;
    if (activeGame.direction === 'en-ru') isEnToRu = true;
    else if (activeGame.direction === 'ru-en') isEnToRu = false;
    else isEnToRu = Math.random() > 0.5;

    const promptText = isEnToRu ? item.en : (item.mainRu || item.ru || '');
    const label = isEnToRu ? 'Переведите на русский:' : 'Переведите на английский:';

    container.innerHTML = `
        <div style="text-align: center; max-width: 500px; margin: 0 auto;" class="card">
            <div style="color: #64748b; font-weight: 600; font-size: 14px;">${label}</div>
            <div style="font-size: 28px; font-weight: bold; color: #2c3e50; margin: 15px 0;">
                ${promptText}
                ${isEnToRu ? `<button class="btn-audio" onclick="speak('${item.en.replace(/'/g, "\\'")}')">🔊</button>` : ''}
            </div>
            <input type="text" id="gameWrittenInput" placeholder="Введите перевод..." style="text-align: center; font-size: 18px; padding: 12px; margin-bottom: 12px;" autocomplete="off">
            <button class="btn-main" onclick="checkWrittenGameAnswer(${item.id})">Проверить</button>
            <div id="gameWrittenFeedback" style="display: none; margin-top: 15px; padding: 10px; border-radius: 8px; font-weight: bold;"></div>
        </div>
    `;

    const input = document.getElementById('gameWrittenInput');
    if (input) {
        input.focus();
        input.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') checkWrittenGameAnswer(item.id);
        });
    }
}

function checkWrittenGameAnswer(wordId) {
    const input = document.getElementById('gameWrittenInput');
    const feedback = document.getElementById('gameWrittenFeedback');
    if (!input || !feedback) return;

    const userVal = input.value.trim().toLowerCase();
    if (!userVal) return;

    const currentItem = activeGame.words.find(w => w.id === wordId);
    if (!currentItem) return;

    const correctEn = (currentItem.en || '').trim().toLowerCase();
    const correctMainRu = (currentItem.mainRu || currentItem.ru || '').trim().toLowerCase();
    let extraRuList = [];
    if (currentItem.extraRu) {
        extraRuList = currentItem.extraRu.split(',').map(s => s.trim().toLowerCase());
    }

    const allowedAnswers = [correctEn, correctMainRu, ...extraRuList].filter(ans => ans.length > 0);
    const isCorrect = allowedAnswers.some(ans => userVal === ans);

    if (isCorrect) {
        feedback.style.background = '#d1fae5';
        feedback.style.color = '#065f46';
        feedback.innerText = '✨ Отлично! Правильно!';
        feedback.style.display = 'block';
        if (!activeGame.correctWords.some(w => w.id === wordId)) activeGame.correctWords.push(currentItem);
    } else {
        feedback.style.background = '#fee2e2';
        feedback.style.color = '#991b1b';
        feedback.innerText = `❌ Ошибка. Правильный ответ: "${currentItem.mainRu || currentItem.ru}" (или синонимы)`;
        feedback.style.display = 'block';
        if (!activeGame.errors.some(w => w.id === wordId)) activeGame.errors.push(currentItem);
    }

    setTimeout(() => {
        activeGame.currentIndex++;
        renderGameStep();
    }, 1200);
}

// 3. Сопоставление пар
function renderMatchingMode() {
    const container = document.getElementById('activeGameContainer');
    if (!container) return;
    const words = activeGame.words;

    const leftList = [...words].sort(() => Math.random() - 0.5);
    const rightList = [...words].sort(() => Math.random() - 0.5);

    let html = '<div class="matching-grid">';
    html += '<div class="matching-column">';
    leftList.forEach(w => {
        html += `<button class="matching-btn" data-type="en" data-id="${w.id}" onclick="handleMatchingGameClick(this)">${w.en}</button>`;
    });
    html += '</div>';

    html += '<div class="matching-column">';
    rightList.forEach(w => {
        html += `<button class="matching-btn" data-type="ru" data-id="${w.id}" onclick="handleMatchingGameClick(this)">${w.mainRu || w.ru || ''}</button>`;
    });
    html += '</div>';
    html += '</div>';
    container.innerHTML = html;
}

function handleMatchingGameClick(btn) {
    if (btn.classList.contains('correct')) return;
    const type = btn.getAttribute('data-type');

    if (type === 'en') {
        document.querySelectorAll('.matching-btn[data-type="en"]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        activeGame.selectedLeft = btn;
    } else {
        document.querySelectorAll('.matching-btn[data-type="ru"]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        activeGame.selectedRight = btn;
    }

    if (activeGame.selectedLeft && activeGame.selectedRight) {
        const idLeft = parseInt(activeGame.selectedLeft.getAttribute('data-id'));
        const idRight = parseInt(activeGame.selectedRight.getAttribute('data-id'));
        const wordObj = activeGame.words.find(w => w.id === idLeft);

        if (idLeft === idRight) {
            activeGame.selectedLeft.className = 'matching-btn correct';
            activeGame.selectedRight.className = 'matching-btn correct';
            activeGame.selectedLeft = null;
            activeGame.selectedRight = null;
            activeGame.matchedCount++;

            if (wordObj && !activeGame.correctWords.some(w => w.id === idLeft)) {
                activeGame.correctWords.push(wordObj);
            }

            if (activeGame.matchedCount === activeGame.words.length) {
                setTimeout(showGameSummary, 400);
            }
        } else {
            const btn1 = activeGame.selectedLeft;
            const btn2 = activeGame.selectedRight;
            btn1.classList.add('wrong');
            btn2.classList.add('wrong');

            if (wordObj && !activeGame.errors.some(w => w.id === idLeft)) {
                activeGame.errors.push(wordObj);
                activeGame.correctWords = activeGame.correctWords.filter(w => w.id !== idLeft);
            }

            setTimeout(() => {
                btn1.classList.remove('selected', 'wrong');
                btn2.classList.remove('selected', 'wrong');
            }, 500);

            activeGame.selectedLeft = null;
            activeGame.selectedRight = null;
        }
    }
}

// 4. Аудио-погружение
let audioStreamState = { isRunning: false, timeoutId: null, totalLoops: 5, currentLoop: 1, wordIndex: 0 };
function renderAudioStreamMode() {
    const container = document.getElementById('activeGameContainer');
    if (!container) return;
    
    container.innerHTML = `
        <div class="card" style="text-align: center; max-width: 500px; margin: 0 auto; padding: 30px;">
            <div style="font-size: 13px; color: #64748b; margin-bottom: 5px;">🎧 Аудио-погружение</div>
            <div id="audioStreamLoopInfo" style="font-size: 12px; font-weight: bold; color: #0284c7; margin-bottom: 15px;">Круг 1 из 5</div>
            <div id="audioStreamWordEn" style="font-size: 32px; font-weight: bold; color: #2c3e50; margin-bottom: 10px;">—</div>
            <div id="audioStreamWordRu" style="font-size: 20px; color: #10b981; margin-bottom: 20px;">—</div>
            <div id="audioStatusText" style="font-size: 14px; color: #64748b; font-weight: bold; margin-bottom: 25px;">Подготовка...</div>
            <button id="audioPlayPauseBtn" class="btn-main" style="background: #e11d48; max-width: 200px; margin: 0 auto;" onclick="toggleAudioStreamPause()">⏸ Пауза</button>
        </div>
    `;
    startAudioStreamSession();
}

function startAudioStreamSession() {
    audioStreamState.isRunning = true;
    audioStreamState.currentLoop = 1;
    audioStreamState.wordIndex = 0;
    playNextAudioStreamWord();
}

function playNextAudioStreamWord() {
    if (!audioStreamState.isRunning) return;
    if (audioStreamState.currentLoop > audioStreamState.totalLoops) {
        document.getElementById('audioStatusText').innerText = '🎉 Все круги прослушаны!';
        return;
    }

    const words = activeGame.words;
    if (!words || words.length === 0) return;

    if (audioStreamState.wordIndex >= words.length) {
        audioStreamState.wordIndex = 0;
        audioStreamState.currentLoop++;
    }

    if (audioStreamState.currentLoop > audioStreamState.totalLoops) {
        playNextAudioStreamWord();
        return;
    }

    const item = words[audioStreamState.wordIndex];
    document.getElementById('audioStreamWordEn').innerText = item.en;
    document.getElementById('audioStreamWordRu').innerText = item.mainRu || item.ru || '';
    document.getElementById('audioStreamLoopInfo').innerText = `Круг ${audioStreamState.currentLoop} из ${audioStreamState.totalLoops}`;

    speak(item.en);
    audioStreamState.timeoutId = setTimeout(() => {
        if (!audioStreamState.isRunning) return;
        speakRu(item.mainRu || item.ru);
        audioStreamState.timeoutId = setTimeout(() => {
            if (!audioStreamState.isRunning) return;
            speak(item.en);
            audioStreamState.timeoutId = setTimeout(() => {
                if (!audioStreamState.isRunning) return;
                audioStreamState.wordIndex++;
                playNextAudioStreamWord();
            }, 2500);
        }, 2000);
    }, 2000);
}

function toggleAudioStreamPause() {
    audioStreamState.isRunning = !audioStreamState.isRunning;
    const btn = document.getElementById('audioPlayPauseBtn');
    if (audioStreamState.isRunning) {
        btn.innerText = '⏸ Пауза';
        playNextAudioStreamWord();
    } else {
        btn.innerText = '▶ Продолжить';
        clearTimeout(audioStreamState.timeoutId);
        window.speechSynthesis.cancel();
    }
}

// 5. Аудио-диктант
function renderAudioDictationMode() {
    const container = document.getElementById('activeGameContainer');
    const item = activeGame.words[activeGame.currentIndex];

    container.innerHTML = `
        <div class="card" style="text-align: center; max-width: 500px; margin: 0 auto; padding: 25px;">
            <div style="font-size: 13px; color: #64748b; margin-bottom: 10px;">🔊 Аудио-диктант</div>
            <button class="btn-main" style="font-size: 24px; padding: 15px; border-radius: 50px; width: 80px; height: 80px; margin: 15px auto;" onclick="speak('${item.en.replace(/'/g, "\\'")}')">🔊</button>
            <input type="text" id="audioDictInput" placeholder="Введите перевод или слово..." style="text-align: center; font-size: 18px; padding: 12px; margin-bottom: 12px;" autocomplete="off">
            <button class="btn-main" onclick="checkAudioDictAnswer(${item.id})">Проверить</button>
            <div id="audioDictFeedback" style="display: none; margin-top: 15px; padding: 10px; border-radius: 8px; font-weight: bold;"></div>
        </div>
    `;

    setTimeout(() => speak(item.en), 300);
    const input = document.getElementById('audioDictInput');
    if (input) {
        input.focus();
        input.addEventListener('keyup', (e) => { if (e.key === 'Enter') checkAudioDictAnswer(item.id); });
    }
}

function checkAudioDictAnswer(wordId) {
    const input = document.getElementById('audioDictInput');
    const feedback = document.getElementById('audioDictFeedback');
    if (!input || !feedback) return;

    const userVal = input.value.trim().toLowerCase();
    const currentItem = activeGame.words.find(w => w.id === wordId);
    if (!currentItem || !userVal) return;

    const correctEn = (currentItem.en || '').trim().toLowerCase();
    const correctMainRu = (currentItem.mainRu || currentItem.ru || '').trim().toLowerCase();
    let extraRuList = currentItem.extraRu ? currentItem.extraRu.split(',').map(s => s.trim().toLowerCase()) : [];

    const allowedAnswers = [correctEn, correctMainRu, ...extraRuList].filter(ans => ans.length > 0);
    const isCorrect = allowedAnswers.some(ans => userVal === ans);

    if (isCorrect) {
        feedback.style.background = '#d1fae5';
        feedback.style.color = '#065f46';
        feedback.innerText = '✨ Верно!';
        feedback.style.display = 'block';
        if (!activeGame.correctWords.some(w => w.id === wordId)) activeGame.correctWords.push(currentItem);
    } else {
        feedback.style.background = '#fee2e2';
        feedback.style.color = '#991b1b';
        feedback.innerText = `❌ Ошибка. Верно: "${currentItem.mainRu || currentItem.ru}"`;
        feedback.style.display = 'block';
        if (!activeGame.errors.some(w => w.id === wordId)) activeGame.errors.push(currentItem);
    }

    setTimeout(() => {
        activeGame.currentIndex++;
        renderGameStep();
    }, 1400);
}

// 6. Произношение (Микрофон)
// Глобальная переменная для хранения последней аудио-записи/текста пользователя в сессии
let lastRecognizedSpeechText = "";
let currentVoiceRecognitionObj = null;

function renderVoiceCheckMode() {
    const container = document.getElementById('activeGameContainer');
    if (!container) return;
    const item = activeGame.words[activeGame.currentIndex];
    lastRecognizedSpeechText = "";

    container.innerHTML = `
        <div class="card" style="text-align: center; max-width: 500px; margin: 0 auto; padding: 25px;">
            <div style="font-size: 13px; color: #64748b; margin-bottom: 5px;">🎙️ Произношение (UK Accent)</div>
            <div style="font-size: 28px; font-weight: bold; color: #2c3e50; margin: 10px 0;">${item.en}</div>
            <div style="font-size: 16px; color: #10b981; margin-bottom: 15px;">${item.mainRu || item.ru || ''}</div>

            <!-- Кнопки прослушивания -->
            <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px; flex-wrap: wrap;">
                <button class="btn-main" style="background: #0284c7; flex: 1; min-width: 160px;" onclick="speak('${item.en.replace(/'/g, "\\'")}')">🔊 Слушать эталон</button>
                <button id="listenMyVoiceBtn" class="btn-main" style="background: #6366f1; flex: 1; min-width: 160px; display: none;" onclick="speakUserVoice()">🗣️ Прослушать мой голос</button>
            </div>
            
            <!-- Панель управления микрофоном (Запись / Стоп) -->
            <div style="margin: 15px 0; display: flex; gap: 10px; justify-content: center;">
                <button id="micRecordBtn" class="btn-main" style="background: #ef4444; font-size: 16px; padding: 12px 20px; border-radius: 30px; flex: 2;" onclick="toggleVoiceRecording('${item.en.replace(/'/g, "\\'")}')">🎙️ Говорить</button>
                <button id="micStopBtn" class="btn-main" style="background: #64748b; font-size: 16px; padding: 12px 15px; border-radius: 30px; flex: 1; display: none;" onclick="stopVoiceRecording()">⏹ Стоп</button>
            </div>

            <!-- Результат распознавания -->
            <div id="voiceResultBox" style="display: none; margin-top: 15px; padding: 12px; border-radius: 8px; background: #f8fafc; border: 1px solid #cbd5e1; font-size: 14px;">
                <div>Вы сказали: <strong id="recognizedText" style="color: #0284c7;">—</strong></div>
                <div style="margin-top: 6px; font-weight: bold;" id="matchScoreText">—</div>
            </div>

            <!-- Кнопки перехода к следующему слову -->
            <div style="margin-top: 25px; display: flex; justify-content: space-between; gap: 10px;">
                <button type="button" class="btn-action" style="background: #ef4444; flex: 1; padding: 12px;" onclick="nextVoiceStep(false)">❌ Ошибка / Повторить</button>
                <button type="button" class="btn-action" style="background: #10b981; flex: 1; padding: 12px;" onclick="nextVoiceStep(true)">✅ Засчитать и далее</button>
            </div>
        </div>
    `;

    // Автоматически озвучиваем эталон при открытии слова
    setTimeout(() => speak(item.en), 300);
}

function toggleVoiceRecording(targetWord) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('Ваш браузер не поддерживает распознавание речи. Попробуйте Google Chrome.');
        return;
    }

    const recordBtn = document.getElementById('micRecordBtn');
    const stopBtn = document.getElementById('micStopBtn');

    // Если уже идет запись — останавливаем
    if (currentVoiceRecognitionObj) {
        stopVoiceRecording();
        return;
    }

    const recognition = new SpeechRecognition();
    currentVoiceRecognitionObj = recognition;
    recognition.lang = 'en-GB';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    if (recordBtn) {
        recordBtn.innerText = '🔴 Слушаю... Говорите!';
        recordBtn.style.background = '#dc2626';
    }
    if (stopBtn) {
        stopBtn.style.display = 'block';
    }

    recognition.onresult = (event) => {
        const speechResult = event.results[0][0].transcript.trim().toLowerCase();
        lastRecognizedSpeechText = speechResult;
        
        resetMicUI();

        const cleanTarget = targetWord.toLowerCase().replace(/[^a-z\s]/g, '');
        const cleanSpoken = speechResult.replace(/[^a-z\s]/g, '');

        let matchPercent = 0;
        if (cleanSpoken === cleanTarget) {
            matchPercent = 100;
        } else if (cleanSpoken.includes(cleanTarget) || cleanTarget.includes(cleanSpoken)) {
            matchPercent = 80;
        } else {
            matchPercent = 40;
        }

        const resBox = document.getElementById('voiceResultBox');
        const recTextEl = document.getElementById('recognizedText');
        const scoreEl = document.getElementById('matchScoreText');
        const listenMyVoiceBtn = document.getElementById('listenMyVoiceBtn');

        if (resBox) resBox.style.display = 'block';
        if (recTextEl) recTextEl.innerText = `"${speechResult}"`;
        if (scoreEl) scoreEl.innerHTML = `Совпадение: <span style="color: ${matchPercent >= 80 ? '#10b981' : '#f59e0b'};">${matchPercent}%</span>`;
        if (listenMyVoiceBtn) listenMyVoiceBtn.style.display = 'block';

        // Предварительно фиксируем результат в статистике игры
        const currentItem = activeGame.words[activeGame.currentIndex];
        if (matchPercent >= 80) {
            if (!activeGame.correctWords.some(w => w.id === currentItem.id)) {
                activeGame.correctWords.push(currentItem);
                activeGame.errors = activeGame.errors.filter(w => w.id !== currentItem.id);
            }
        } else {
            if (!activeGame.errors.some(w => w.id === currentItem.id)) {
                activeGame.errors.push(currentItem);
                activeGame.correctWords = activeGame.correctWords.filter(w => w.id !== currentItem.id);
            }
        }
    };

    recognition.onerror = () => {
        resetMicUI();
        alert('Не удалось распознать речь. Попробуйте еще раз.');
    };

    recognition.onend = () => {
        resetMicUI();
    };

    recognition.start();
}

function stopVoiceRecording() {
    if (currentVoiceRecognitionObj) {
        try {
            currentVoiceRecognitionObj.stop();
        } catch(e) {}
        currentVoiceRecognitionObj = null;
    }
    resetMicUI();
}

function resetMicUI() {
    const recordBtn = document.getElementById('micRecordBtn');
    const stopBtn = document.getElementById('micStopBtn');
    if (recordBtn) {
        recordBtn.innerText = '🎙️ Говорить снова';
        recordBtn.style.background = '#ef4444';
    }
    if (stopBtn) {
        stopBtn.style.display = 'none';
    }
    currentVoiceRecognitionObj = null;
}

// Генерация / озвучивание того, что распознал микрофон
function speakUserVoice() {
    if (!lastRecognizedSpeechText) return;
    const utterance = new SpeechSynthesisUtterance(lastRecognizedSpeechText);
    utterance.lang = 'en-GB';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
}

function nextVoiceStep(passed) {
    stopVoiceRecording();
    const currentItem = activeGame.words[activeGame.currentIndex];
    
    if (passed) {
        if (!activeGame.correctWords.some(w => w.id === currentItem.id)) {
            activeGame.correctWords.push(currentItem);
            activeGame.errors = activeGame.errors.filter(w => w.id !== currentItem.id);
        }
    } else {
        if (!activeGame.errors.some(w => w.id === currentItem.id)) {
            activeGame.errors.push(currentItem);
            activeGame.correctWords = activeGame.correctWords.filter(w => w.id !== currentItem.id);
        }
    }

    activeGame.currentIndex++;
    renderGameStep();
}

// Итоги тренировки (сначала ошибки, потом правильные с кнопками тегов)
function showGameSummary() {
    const container = document.getElementById('activeGameContainer');
    if (!container) return;

    const total = activeGame.words.length;
    const errorsCount = activeGame.errors.length;
    const correctCount = total - errorsCount;
    const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;

    let html = `
        <div class="card" style="padding: 20px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #2c3e50; margin-bottom: 6px;">🎉 Тренировка окончена!</h2>
                <div style="font-size: 32px; font-weight: bold; color: ${percentage >= 80 ? '#10b981' : '#f59e0b'};">Результат: ${percentage}%</div>
                <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Всего: <strong>${total}</strong> | Угадано: <strong style="color:#10b981;">${correctCount}</strong> | Ошибок: <strong style="color:#ef4444;">${errorsCount}</strong></p>
            </div>
    `;

    if (activeGame.errors.length > 0) {
        html += `<div style="margin-bottom: 20px;"><h4 style="color: #ef4444; margin-bottom: 8px;">❌ Ошибки (${activeGame.errors.length}):</h4><div style="display: flex; flex-direction: column; gap: 6px;">`;
        activeGame.errors.forEach(item => {
            const currentTags = item.tags ? item.tags.map(t => `#${t}`).join(' ') : 'нет тегов';
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; background: #fee2e2; border: 1px solid #fca5a5; padding: 8px 12px; border-radius: 8px; font-size: 13px;">
                    <div><strong style="color: #991b1b;">${item.en}</strong> — ${item.mainRu || item.ru} <span style="color: #64748b; font-size: 11px; margin-left: 8px;">(${currentTags})</span></div>
                    <button type="button" class="btn-action" style="background:#0284c7; padding: 4px 8px; font-size: 11px;" onclick="quickEditWordTags(${item.id})">✏ теги</button>
                </div>`;
        });
        html += `</div></div>`;
    }

    if (activeGame.correctWords.length > 0) {
        html += `<div style="margin-bottom: 20px;"><h4 style="color: #10b981; margin-bottom: 8px;">✅ Правильные слова (${activeGame.correctWords.length}):</h4><div style="display: flex; flex-direction: column; gap: 6px;">`;
        activeGame.correctWords.forEach(item => {
            const currentTags = item.tags ? item.tags.map(t => `#${t}`).join(' ') : 'нет тегов';
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; background: #d1fae5; border: 1px solid #6ee7b7; padding: 8px 12px; border-radius: 8px; font-size: 13px;">
                    <div><strong style="color: #065f46;">${item.en}</strong> — ${item.mainRu || item.ru} <span style="color: #64748b; font-size: 11px; margin-left: 8px;">(${currentTags})</span></div>
                    <button type="button" class="btn-action" style="background:#0284c7; padding: 4px 8px; font-size: 11px;" onclick="quickEditWordTags(${item.id})">✏ теги</button>
                </div>`;
        });
        html += `</div></div>`;
    }

    html += `
        <div style="margin-top: 25px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button class="btn-main" style="max-width: 200px; background: #10b981;" onclick="restartCurrentGame()">🔄 Повторить</button>
            <button class="btn-main" style="max-width: 200px; background: #64748b;" onclick="exitGame()">К настройкам</button>
        </div>
    </div>`;
    container.innerHTML = html;
}

function restartCurrentGame() {
    if (!activeGame.words || activeGame.words.length === 0) { exitGame(); return; }
    const mode = activeGame.mode;
    const words = [...activeGame.words];
    const direction = activeGame.direction;
    const tagFilter = activeGame.tagFilter;
    activeGame = { mode, words, currentIndex: 0, direction, errors: [], correctWords: [], tagFilter, selectedLeft: null, selectedRight: null, matchedCount: 0 };
    renderGameStep();
}

// Инициализация интерфейса колонок
updateColumnCheckboxes();

// ==========================================
// 10. ЭКСПОРТ И ИМПОРТ EXCEL (.xlsx)
// ==========================================
function exportToExcel() {
    if (dictionary.length === 0) {
        alert('Словарь пуст! Добавьте слова перед экспортом.');
        return;
    }

    const data = dictionary.map(item => ({
        'Слово (EN)': item.en,
        'Основной перевод': item.mainRu || item.ru || '',
        'Доп. переводы': item.extraRu || '',
        'Примеры / Контекст': item.context || '',
        'Теги': item.tags ? item.tags.join(', ') : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Словарь');

    XLSX.writeFile(workbook, 'My_English_Dictionary.xlsx');
}

function importFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonRows = XLSX.utils.sheet_to_json(firstSheet);

            let newWordsList = [];
            let duplicateMatches = [];

            jsonRows.forEach(row => {
                const en = (row['Слово (EN)'] || row['Word'] || row['word'] || '').toString().trim();
                const mainRu = (row['Основной перевод'] || row['Translation'] || row['translation'] || '').toString().trim();
                const extraRu = (row['Доп. переводы'] || row['Extra'] || '').toString().trim();
                const context = (row['Примеры / Контекст'] || row['Context'] || '').toString().trim();
                const tagsRaw = (row['Теги'] || row['Tags'] || '').toString();

                if (en && mainRu) {
                    const tags = tagsRaw.split(',').map(t => t.trim().toLowerCase().replace(/^#/, '')).filter(t => t);
                    const parsedItem = { en, mainRu, extraRu, context, tags };

                    const existsIndex = dictionary.findIndex(item => item.en.toLowerCase() === en.toLowerCase());
                    if (existsIndex !== -1) {
                        duplicateMatches.push({ index: existsIndex, newItem: parsedItem });
                    } else {
                        newWordsList.push(parsedItem);
                    }
                }
            });

            let importStrategy = 'ask';
            if (duplicateMatches.length > 0) {
                const choice = prompt(
                    `Найдено ${duplicateMatches.length} совпадений слов из файла со словарём!\n\n` +
                    `Введите цифру варианта:\n` +
                    `1 — Обновить существующие\n` +
                    `2 — Пропустить совпадения\n` +
                    `3 — Залить всё как дубликаты`,
                    '1'
                );

                if (choice === '1') importStrategy = 'update';
                else if (choice === '2') importStrategy = 'skip';
                else if (choice === '3') importStrategy = 'duplicate_all';
                else {
                    alert('Импорт отменен.');
                    event.target.value = '';
                    return;
                }
            }

            let addedCount = 0;
            let updatedCount = 0;

            if (importStrategy === 'update') {
                duplicateMatches.forEach(match => {
                    const existing = dictionary[match.index];
                    const incoming = match.newItem;
                    const mergedTags = Array.from(new Set([...(existing.tags || []), ...(incoming.tags || [])]));

                    dictionary[match.index] = {
                        ...existing,
                        mainRu: incoming.mainRu || existing.mainRu,
                        extraRu: incoming.extraRu || existing.extraRu,
                        context: incoming.context || existing.context,
                        tags: mergedTags
                    };
                    updatedCount++;
                });
            } else if (importStrategy === 'duplicate_all') {
                duplicateMatches.forEach(match => {
                    newWordsList.push(match.newItem);
                });
            }

            newWordsList.forEach((item, idx) => {
                dictionary.unshift({
                    id: Date.now() + idx,
                    ...item,
                    reviewCount: 0,
                    errorCount: 0
                });
                addedCount++;
            });

            saveAndRender();
            renderSingleTagFilter();
            alert(`Импорт успешно завершён!\n• Добавлено новых слов: ${addedCount}\n• Обновлено существующих: ${updatedCount}`);
            event.target.value = '';
        } catch (err) {
            alert('Ошибка чтения Excel файла.');
        }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// 11. МАССОВОЕ ДОБАВЛЕНИЕ СЛОВ
// ==========================================
function openBulkAddModal() {
    const modal = document.getElementById('bulkAddModal');
    if (modal) modal.style.display = 'flex';
    const textarea = document.getElementById('bulkWordsTextarea');
    if (textarea) textarea.value = '';
    const progress = document.getElementById('bulkAddProgress');
    if (progress) progress.style.display = 'none';
}

function closeBulkAddModal() {
    const modal = document.getElementById('bulkAddModal');
    if (modal) modal.style.display = 'none';
}

async function processBulkWordsAdd() {
    const rawText = document.getElementById('bulkWordsTextarea').value;
    if (!rawText.trim()) {
        alert('Введите слова для добавления!');
        return;
    }

    const words = rawText
        .split(/[\n,]+/)
        .map(w => w.trim().toLowerCase())
        .filter(w => w.length > 0);

    if (words.length === 0) return;

    const btnRun = document.getElementById('btnRunBulkAdd');
    const progressBox = document.getElementById('bulkAddProgress');
    const progressText = document.getElementById('bulkAddProgressText');

    if (btnRun) btnRun.disabled = true;
    if (progressBox) progressBox.style.display = 'block';

    let addedCount = 0;
    let total = words.length;

    for (let i = 0; i < total; i++) {
        const en = words[i];
        if (progressText) progressText.innerText = `${i + 1}/${total}`;

        const details = await fetchWordDetails(en);
        const mainRu = details ? details.mainRu : '';
        const extraRu = details ? details.extraRu : '';

        let tags = ['new'];
        if (details && details.detectedPosList) {
            details.detectedPosList.forEach(pos => {
                if (!tags.includes(pos)) tags.push(pos);
            });
        }

        const context = `1. I need to ${en} this right now. — Мне нужно ${mainRu || en} это прямо сейчас.`;

        dictionary.unshift({
            id: Date.now() + i,
            en, mainRu, extraRu, context, tags,
            reviewCount: 0,
            errorCount: 0
        });

        addedCount++;
        await new Promise(r => setTimeout(r, 120));
    }

    if (btnRun) btnRun.disabled = false;
    if (progressBox) progressBox.style.display = 'none';
    closeBulkAddModal();

    saveAndRender();
    renderSingleTagFilter();
    alert(`Успешно добавлено слов: ${addedCount}. Им присвоен тег #new!`);
}

// ==========================================
// 12. МАССОВЫЕ ДЕЙСТВИЯ В ТАБЛИЦЕ (ВЫБОР, ТЕГИ, УДАЛЕНИЕ)
// ==========================================
function toggleSelectAll(checked) {
    const filtered = getFilteredWords();
    if (checked) {
        selectedWordIds = filtered.map(w => w.id);
    } else {
        selectedWordIds = [];
    }
    renderWords();
}

function renderBulkTagSelect() {
    const select = document.getElementById('bulkTagSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- Выберите тег --</option>';
    
    let allTags = [];
    categories.forEach(cat => {
        cat.tags.forEach(t => {
            if (!allTags.includes(t)) allTags.push(t);
        });
    });

    allTags.forEach(tag => {
        select.innerHTML += `<option value="${tag}">#${tag}</option>`;
    });
}

function applyBulkTag(action) {
    const tagSelect = document.getElementById('bulkTagSelect');
    if (!tagSelect) return;
    const tag = tagSelect.value;
    if (!tag) {
        alert('Выберите тег из списка!');
        return;
    }

    if (selectedWordIds.length === 0) return;

    dictionary = dictionary.map(item => {
        if (selectedWordIds.includes(item.id)) {
            let tags = item.tags ? [...item.tags] : [];
            if (action === 'add') {
                if (!tags.includes(tag)) tags.push(tag);
            } else if (action === 'remove') {
                tags = tags.filter(t => t !== tag);
            }
            return { ...item, tags };
        }
        return item;
    });

    saveAndRender();
    renderWords();
    renderSingleTagFilter();
    alert('Теги успешно обновлены для выбранных слов!');
}

function applyBulkDelete() {
    if (selectedWordIds.length === 0) return;
    if (!confirm(`Удалить выбранные слова (${selectedWordIds.length} шт.)?`)) return;

    dictionary = dictionary.filter(item => !selectedWordIds.includes(item.id));
    selectedWordIds = [];
    const selectAllCb = document.getElementById('selectAllCheckbox');
    if (selectAllCb) selectAllCb.checked = false;

    saveAndRender();
    renderWords();
    renderSingleTagFilter();
}

async function bulkAutoTranslate() {
    if (selectedWordIds.length === 0) return;
    if (!confirm(`Обновить переводы и части речи для выбранных слов (${selectedWordIds.length} шт.)?`)) return;

    const btn = document.getElementById('btnBulkAuto');
    const originalText = btn ? btn.innerText : '🔄 Обновить';
    if (btn) btn.disabled = true;

    let total = selectedWordIds.length;
    let completed = 0;

    for (let id of selectedWordIds) {
        completed++;
        if (btn) btn.innerText = `⏳ ${completed}/${total}`;

        const index = dictionary.findIndex(item => item.id === id);
        if (index !== -1) {
            const item = dictionary[index];
            const details = await fetchWordDetails(item.en);

            if (details) {
                if (details.mainRu) item.mainRu = details.mainRu;
                if (details.extraRu) item.extraRu = details.extraRu;
                let tags = item.tags ? [...item.tags] : [];
                details.detectedPosList.forEach(pos => {
                    if (!tags.includes(pos)) tags.push(pos);
                });
                item.tags = tags;
            }
        }
        await new Promise(r => setTimeout(r, 150));
    }

    if (btn) {
        btn.disabled = false;
        btn.innerText = originalText;
    }
    saveAndRender();
    renderWords();
    alert(`Успешно обновлено слов: ${total}`);
}