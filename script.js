// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ И ХРАНИЛИЩЕ ДАННЫХ (FIREBASE)
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

let columnVisibility = JSON.parse(localStorage.getItem('my_column_visibility')) || {
    en: true, mainRu: true, extraRu: true, context: true, tags: true, actions: true
};

// Слушатель Firebase для словаря
db.ref('dictionary').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
        dictionary = Array.isArray(data) ? data : Object.values(data);
        dictionary.sort((a, b) => b.id - a.id);
    } else {
        dictionary = [];
    }
    renderWords();
    populateGameTagFilters();
});

// Слушатель Firebase для категорий
db.ref('categories').on('value', (snapshot) => {
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
        db.ref('categories').set(categories);
    }
    renderCategoriesUI();
    renderSingleTagFilter();
    renderBulkTagSelect();
});

function saveAndRender() {
    const dictObject = {};
    dictionary.forEach(item => {
        dictObject[item.id] = item;
    });
    db.ref('dictionary').set(dictObject);
}

function saveCategories() {
    db.ref('categories').set(categories);
}

// ==========================================
// 2. СВОРАЧИВАНИЕ ФОРМЫ И НАВИГАЦИЯ
// ==========================================
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
        exitGame();
    }
}

function speak(text) {
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
}

function getAllTags() {
    let all = [];
    categories.forEach(cat => {
        cat.tags.forEach(t => {
            if (!all.includes(t)) all.push(t);
        });
    });
    return all;
}

// ==========================================
// 3. УПРАВЛЕНИЕ КАТЕГОРИЯМИ И ТЕГАМИ
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
        const newTags = newTagsStr
            .split(',')
            .map(t => t.trim().toLowerCase().replace(/^#/, ''))
            .filter(t => t !== '');

        word.tags = newTags;
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
// 4. ПРОВЕРКА ДУБЛИКАТОВ И АВТОПЕРЕВОД
// ==========================================
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

// ==========================================
// 5. МАССОВОЕ ДОБАВЛЕНИЕ СЛОВ
// ==========================================
function openBulkAddModal() {
    document.getElementById('bulkAddModal').style.display = 'flex';
    document.getElementById('bulkWordsTextarea').value = '';
    document.getElementById('bulkAddProgress').style.display = 'none';
}

function closeBulkAddModal() {
    document.getElementById('bulkAddModal').style.display = 'none';
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

    btnRun.disabled = true;
    progressBox.style.display = 'block';

    let addedCount = 0;
    let total = words.length;

    for (let i = 0; i < total; i++) {
        const en = words[i];
        progressText.innerText = `${i + 1}/${total}`;

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
            en, mainRu, extraRu, context, tags
        });

        addedCount++;
        await new Promise(r => setTimeout(r, 120));
    }

    btnRun.disabled = false;
    progressBox.style.display = 'none';
    closeBulkAddModal();

    saveAndRender();
    renderSingleTagFilter();
    alert(`Успешно добавлено слов: ${addedCount}. Им присвоен тег #new!`);
}

async function bulkAutoTranslate() {
    if (selectedWordIds.length === 0) return;

    if (!confirm(`Вы действительно хотите обновить переводы и части речи для выбранных слов (${selectedWordIds.length} шт.)?`)) {
        return;
    }

    const btn = document.getElementById('btnBulkAuto');
    const originalText = btn.innerText;
    btn.disabled = true;

    let total = selectedWordIds.length;
    let completed = 0;

    for (let id of selectedWordIds) {
        completed++;
        btn.innerText = `⏳ ${completed}/${total}`;

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

    btn.disabled = false;
    btn.innerText = originalText;
    saveAndRender();
    alert(`Успешно обновлено слов: ${total}`);
}

// ==========================================
// 6. ИИ ПРИМЕРЫ
// ==========================================
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
// 7. НАСТРОЙКА ВИДИМОСТИ И СОРТИРОВКИ
// ==========================================
function updateColumnCheckboxes() {
    for (let key in columnVisibility) {
        const cb = document.getElementById(`col_${key}`);
        if (cb) cb.checked = columnVisibility[key];
    }
}

function toggleColumnVisibility() {
    for (let key in columnVisibility) {
        const cb = document.getElementById(`col_${key}`);
        if (cb) columnVisibility[key] = cb.checked;
    }
    localStorage.setItem('my_column_visibility', JSON.stringify(columnVisibility));
    renderWords();
}

function toggleSecretText(el) {
    el.classList.toggle('revealed');
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

// ==========================================
// 8. МАССОВЫЕ ДЕЙСТВИЯ
// ==========================================
function renderSingleTagFilter() {
    const filterSelect = document.getElementById('singleTagFilter');
    if (!filterSelect) return;
    const currentVal = filterSelect.value;
    filterSelect.innerHTML = '<option value="">-- Все теги --</option>';

    const allTags = getAllTags();
    allTags.forEach(tag => {
        const opt = document.createElement('option');
        opt.value = tag;
        opt.innerText = `#${tag}`;
        if (tag === currentVal) opt.selected = true;
        filterSelect.appendChild(opt);
    });
}

function renderBulkTagSelect() {
    const bulkSelect = document.getElementById('bulkTagSelect');
    if (!bulkSelect) return;
    bulkSelect.innerHTML = '<option value="">-- Выберите тег --</option>';

    const allTags = getAllTags();
    allTags.forEach(tag => {
        const opt = document.createElement('option');
        opt.value = tag;
        opt.innerText = `#${tag}`;
        bulkSelect.appendChild(opt);
    });
}

function toggleSelectWord(id) {
    if (selectedWordIds.includes(id)) {
        selectedWordIds = selectedWordIds.filter(i => i !== id);
    } else {
        selectedWordIds.push(id);
    }
    updateBulkUI();
}

function toggleSelectAll(isChecked) {
    const currentFiltered = getFilteredWords();
    if (isChecked) {
        selectedWordIds = currentFiltered.map(w => w.id);
    } else {
        selectedWordIds = [];
    }
    renderWords();
}

function updateBulkUI() {
    const countEl = document.getElementById('selectedCount');
    if (countEl) countEl.innerText = selectedWordIds.length;
    
    const actionsBox = document.getElementById('bulkActionsBox');
    if (actionsBox) {
        actionsBox.style.display = selectedWordIds.length > 0 ? 'flex' : 'none';
    }
}

function applyBulkTag(action) {
    const tag = document.getElementById('bulkTagSelect').value;
    if (!tag) {
        alert('Выберите тег из списка!');
        return;
    }

    dictionary = dictionary.map(item => {
        if (selectedWordIds.includes(item.id)) {
            let tags = item.tags ? [...item.tags] : [];
            if (action === 'add' && !tags.includes(tag)) {
                tags.push(tag);
            } else if (action === 'remove') {
                tags = tags.filter(t => t !== tag);
            }
            return { ...item, tags };
        }
        return item;
    });

    saveAndRender();
}

function applyBulkDelete() {
    if (confirm(`Вы действительно хотите безвозвратно удалить выбранные слова (${selectedWordIds.length} шт.)?`)) {
        dictionary = dictionary.filter(item => !selectedWordIds.includes(item.id));
        selectedWordIds = [];
        saveAndRender();
    }
}

// ==========================================
// 9. СОХРАНЕНИЕ И РЕДАКТИРОВАНИЕ СЛОВ
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

    if (numericId) {
        dictionary = dictionary.map(item => {
            if (item.id === numericId) {
                return { ...item, en, mainRu, extraRu, context, tags: [...selectedFormTags] };
            }
            return item;
        });
    } else if (existingDuplicateId && duplicateMode === 'replace') {
        dictionary = dictionary.map(item => {
            if (item.id === existingDuplicateId) {
                return { ...item, en, mainRu, extraRu, context, tags: [...selectedFormTags] };
            }
            return item;
        });
    } else {
        dictionary.unshift({
            id: Date.now(),
            en, mainRu, extraRu, context,
            tags: [...selectedFormTags]
        });
    }

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

    document.getElementById('formTitle').innerText = 'Редактировать слово';
    document.getElementById('btnSubmit').innerText = 'Сохранить изменения';
    document.getElementById('btnCancel').style.display = 'block';
    
    renderCategoriesUI();
    renderFormSelectedTags();
    if (formCard) formCard.scrollIntoView({ behavior: 'smooth' });
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

    document.getElementById('formTitle').innerText = 'Добавить новое слово';
    document.getElementById('btnSubmit').innerText = 'Добавить слово';
    document.getElementById('btnCancel').style.display = 'none';
    
    renderCategoriesUI();
    renderFormSelectedTags();
}

function deleteWord(id) {
    if (confirm('Удалить слово?')) {
        dictionary = dictionary.filter(item => item.id !== id);
        saveAndRender();
        resetForm();
    }
}

function getFilteredWords() {
    return dictionary.filter(item => {
        const matchEn = item.en.toLowerCase().includes(activeSearchQuery);
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
        html += `<th>Действия</th>`;
    }

    tr.innerHTML = html;
}

function renderWords() {
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
        const isChecked = selectedWordIds.includes(item.id);
        const tagsHtml = item.tags ? item.tags.map(t => `<span class="tag">#${t}</span>`).join('') : '';
        const mainText = item.mainRu || item.ru || '';

        const tr = document.createElement('tr');
        
        let rowHtml = `<td><input type="checkbox" class="word-checkbox" ${isChecked ? 'checked' : ''} onchange="toggleSelectWord(${item.id})"></td>`;

        if (columnVisibility.en) {
            rowHtml += `
                <td>
                    <strong>${item.en}</strong>
                    <button class="btn-audio" onclick="event.stopPropagation(); speak('${item.en}')">🔊</button>
                </td>
            `;
        } else {
            rowHtml += `
                <td>
                    <span class="cell-hidden-text" onclick="toggleSecretText(this)">
                        <strong>${item.en}</strong>
                    </span>
                    <button class="btn-audio" onclick="event.stopPropagation(); speak('${item.en}')">🔊</button>
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
                        <button type="button" class="btn-edit-cat" onclick="quickEditWordTags(${item.id})" title="Быстро изменять теги">✏</button>
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
}

// ==========================================
// 10. ИГРОВОЙ ДВИЖОК
// ==========================================
let activeGame = {
    mode: '', words: [], currentIndex: 0, direction: 'both',
    errors: [], selectedLeft: null, selectedRight: null, matchedCount: 0
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

    let pool = (tagFilter === 'all') 
        ? [...dictionary] 
        : dictionary.filter(w => w.tags && w.tags.includes(tagFilter));

    if (pool.length === 0) {
        alert('Нет слов, соответствующих выбранному тегу!');
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
        mode, words: selectedWords, currentIndex: 0, direction,
        errors: [], selectedLeft: null, selectedRight: null, matchedCount: 0
    };

    document.getElementById('gameSetupCard').style.display = 'none';
    document.getElementById('gamePlayArea').style.display = 'block';

    renderGameStep();
}

function exitGame() {
    document.getElementById('gameSetupCard').style.display = 'block';
    document.getElementById('gamePlayArea').style.display = 'none';
}

function renderGameStep() {
    const container = document.getElementById('activeGameContainer');
    container.innerHTML = '';

    const total = activeGame.words.length;
    const current = activeGame.currentIndex;

    document.getElementById('gameProgressText').innerText = `${current} / ${total}`;
    document.getElementById('gameProgressFill').style.width = `${(current / total) * 100}%`;

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
    }
}

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
    document.getElementById('gameCardFront').style.display = isCardFlipped ? 'none' : 'block';
    document.getElementById('gameCardBack').style.display = isCardFlipped ? 'block' : 'none';
}

function nextGameCard(known) {
    if (!known) {
        const currentItem = activeGame.words[activeGame.currentIndex];
        if (!activeGame.errors.some(w => w.id === currentItem.id)) {
            activeGame.errors.push(currentItem);
        }
    }
    activeGame.currentIndex++;
    renderGameStep();
}

function renderWrittenMode() {
    const container = document.getElementById('activeGameContainer');
    const item = activeGame.words[activeGame.currentIndex];

    let isEnToRu = true;
    if (activeGame.direction === 'en-ru') isEnToRu = true;
    else if (activeGame.direction === 'ru-en') isEnToRu = false;
    else isEnToRu = Math.random() > 0.5;

    const promptText = isEnToRu ? item.en : (item.mainRu || item.ru || '');
    const targetText = isEnToRu ? (item.mainRu || item.ru || '') : item.en;
    const label = isEnToRu ? 'Переведите на русский:' : 'Переведите на английский:';

    container.innerHTML = `
        <div style="text-align: center; max-width: 500px; margin: 0 auto;" class="card">
            <div style="color: #64748b; font-weight: 600; font-size: 14px;">${label}</div>
            <div style="font-size: 28px; font-weight: bold; color: #2c3e50; margin: 15px 0;">
                ${promptText}
                ${isEnToRu ? `<button class="btn-audio" onclick="speak('${item.en.replace(/'/g, "\\'")}')">🔊</button>` : ''}
            </div>

            <input type="text" id="gameWrittenInput" placeholder="Введите перевод..." style="text-align: center; font-size: 18px; padding: 12px; margin-bottom: 12px;" autocomplete="off">
            <button class="btn-main" onclick="checkWrittenGameAnswer('${targetText.replace(/'/g, "\\'")}', ${item.id})">Проверить</button>

            <div id="gameWrittenFeedback" style="display: none; margin-top: 15px; padding: 10px; border-radius: 8px; font-weight: bold;"></div>
        </div>
    `;

    const input = document.getElementById('gameWrittenInput');
    input.focus();
    input.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') checkWrittenGameAnswer(targetText, item.id);
    });
}

function checkWrittenGameAnswer(correctText, wordId) {
    const input = document.getElementById('gameWrittenInput');
    const feedback = document.getElementById('gameWrittenFeedback');
    const userVal = input.value.trim().toLowerCase();
    const correctVal = correctText.trim().toLowerCase();

    if (!userVal) return;

    if (userVal === correctVal) {
        feedback.style.background = '#d1fae5';
        feedback.style.color = '#065f46';
        feedback.innerText = '✨ Отлично! Правильно!';
        feedback.style.display = 'block';
    } else {
        feedback.style.background = '#fee2e2';
        feedback.style.color = '#991b1b';
        feedback.innerText = `❌ Ошибка. Правильный ответ: "${correctText}"`;
        feedback.style.display = 'block';

        if (!activeGame.errors.some(w => w.id === wordId)) {
            const errItem = dictionary.find(w => w.id === wordId);
            if (errItem) activeGame.errors.push(errItem);
        }
    }

    setTimeout(() => {
        activeGame.currentIndex++;
        renderGameStep();
    }, 1200);
}

function renderMatchingMode() {
    const container = document.getElementById('activeGameContainer');
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
        const idLeft = activeGame.selectedLeft.getAttribute('data-id');
        const idRight = activeGame.selectedRight.getAttribute('data-id');

        if (idLeft === idRight) {
            activeGame.selectedLeft.className = 'matching-btn correct';
            activeGame.selectedRight.className = 'matching-btn correct';
            activeGame.selectedLeft = null;
            activeGame.selectedRight = null;
            activeGame.matchedCount++;

            if (activeGame.matchedCount === activeGame.words.length) {
                setTimeout(showGameSummary, 400);
            }
        } else {
            const btn1 = activeGame.selectedLeft;
            const btn2 = activeGame.selectedRight;

            btn1.classList.add('wrong');
            btn2.classList.add('wrong');

            if (navigator.vibrate) navigator.vibrate(200);

            setTimeout(() => {
                btn1.classList.remove('selected', 'wrong');
                btn2.classList.remove('selected', 'wrong');
            }, 500);

            activeGame.selectedLeft = null;
            activeGame.selectedRight = null;
        }
    }
}

function showGameSummary() {
    const container = document.getElementById('activeGameContainer');
    document.getElementById('gameProgressFill').style.width = '100%';
    document.getElementById('gameProgressText').innerText = 'Завершено!';

    const hasErrors = activeGame.errors.length > 0;

    let html = `
        <div class="card" style="text-align: center; padding: 30px;">
            <h2 style="color: #2c3e50;">🎉 Тренировка окончена!</h2>
            <p style="margin: 15px 0; font-size: 16px;">Пройдено слов: <strong>${activeGame.words.length}</strong></p>
    `;

    if (hasErrors) {
        html += `
            <div style="background: #fee2e2; color: #991b1b; padding: 12px; border-radius: 8px; font-weight: bold; margin-bottom: 20px;">
                Слов с ошибками: ${activeGame.errors.length}. Повторите их на следующей тренировке.
            </div>
        `;
    } else {
        html += `
            <div style="background: #d1fae5; color: #065f46; padding: 12px; border-radius: 8px; font-weight: bold; margin-bottom: 20px;">
                🌟 Отличный результат! 100% правильных ответов!
            </div>
        `;
    }

    html += `<button class="btn-main" style="max-width: 250px;" onclick="exitGame()">К настройкам</button></div>`;
    container.innerHTML = html;
}

// ==========================================
// 11. ИМПОРТ И ЭКСПОРТ EXCEL
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
                    `1 — Обновить существующие (Файл главный: обновит переводы/контекст, добавив новые теги к текущим)\n` +
                    `2 — Сохранить словарь (Словарь главный: пропустить совпадения, залить только новые слова)\n` +
                    `3 — Залить всё как дубликаты (Создать копии карточек)`,
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
                    ...item
                });
                addedCount++;
            });

            saveAndRender();
            alert(`Импорт успешно завершён!\n• Добавлено новых слов: ${addedCount}\n• Обновлено существующих: ${updatedCount}`);
            event.target.value = '';
        } catch (err) {
            alert('Ошибка чтения Excel файла.');
        }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// 12. ИНИЦИАЛИЗАЦИЯ
// ==========================================
updateColumnCheckboxes();
