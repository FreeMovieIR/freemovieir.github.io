// Elements
const elements = {
    fileInput: document.getElementById('subtitleFile'),
    fileNameDisplay: document.getElementById('fileName'),
    subtitleSections: document.getElementById('subtitleSections'),
    actionButtons: document.getElementById('actionButtons'),
    originalSubtitleContainer: document.getElementById('originalSubtitleContainer'),
    translatedSubtitleContainer: document.getElementById('translatedSubtitleContainer'),
    translateButton: document.getElementById('translateButton'),
    continueButton: document.getElementById('continueButton'),
    saveButton: document.getElementById('saveButton'),
    apiKeySection: document.getElementById('apiKeySection'),
    apiKeyList: document.getElementById('apiKeyList'),
    modelSelector: document.getElementById('modelSelector'),
    waitTimeInput: document.getElementById('waitTimeInput'),
    contextCountInput: document.getElementById('contextCountInput'),
    progressContainer: document.getElementById('progressContainer'),
    progressBarFill: document.getElementById('progressBarFill'),
    progressText: document.getElementById('progressText'),
    editToggle: document.getElementById('editToggle'),
    customPrompt: document.getElementById('customPrompt'),
    advancedOptionsToggle: document.getElementById('advancedOptionsToggle'),
    advancedOptionsContent: document.getElementById('advancedOptionsContent'),
    toggleIcon: document.getElementById('toggleIcon')
};

// State variables
let state = {
    subtitleBlocks: [],
    translatedBlocks: [],
    apiKeys: [],
    currentApiKeyIndex: 0,
    isTranslating: false,
    isEditMode: false,
    lastTranslatedIndex: -1,
    lastApiCallTimes: {},
    savedApiKeys: JSON.parse(localStorage.getItem('translatorApiKeys')) || [],
    savedCustomPrompt: localStorage.getItem('translatorCustomPrompt') || ''
};

// Utility Functions
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const showFlashMessage = (message, type = 'success') => {
    const flashMessage = document.createElement('div');
    flashMessage.className = `flash-message ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`;
    flashMessage.textContent = message;
    document.getElementById('flashMessageContainer').appendChild(flashMessage);
    setTimeout(() => flashMessage.remove(), 3000);
};

const copyWallet = () => {
    const wallet = "TQKZ2nMjsDiEZjfKR9Dkh5Ka5byjUs8b8U";
    navigator.clipboard.writeText(wallet);
    showFlashMessage('آدرس کیف‌پول USDT کپی شد!', 'success');
};

// API Key Management
const addNewApiKeyInput = (value = '') => {
    const newApiKeyInput = document.createElement('div');
    newApiKeyInput.className = 'flex items-center space-x-2 space-x-reverse mt-2';
    newApiKeyInput.innerHTML = `
        <input type="text" value="${value}" placeholder="یک کلید API دیگر وارد کنید" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm api-key-input" dir="ltr">
        <button class="remove-api-key-btn bg-red-500 text-white px-3 py-2 rounded-lg hover:bg-red-600 transition duration-300">-</button>
    `;
    elements.apiKeyList.appendChild(newApiKeyInput);
    newApiKeyInput.querySelector('.remove-api-key-btn').addEventListener('click', () => {
        elements.apiKeyList.removeChild(newApiKeyInput);
        updateApiKeys();
    });
};

const updateApiKeys = () => {
    state.apiKeys = Array.from(document.querySelectorAll('.api-key-input'))
        .map(input => input.value.trim())
        .filter(key => key !== '');
    localStorage.setItem('translatorApiKeys', JSON.stringify(state.apiKeys));
};

// Progress Management
const saveProgress = () => {
    const progress = {
        lastTranslatedIndex: state.lastTranslatedIndex,
        translatedBlocks: state.translatedBlocks,
        subtitleBlocks: state.subtitleBlocks,
        fileName: elements.fileNameDisplay.textContent
    };
    localStorage.setItem('translationProgress', JSON.stringify(progress));
};

const loadProgress = () => {
    const savedProgress = localStorage.getItem('translationProgress');
    if (savedProgress) {
        const progress = JSON.parse(savedProgress);
        if (progress.fileName === elements.fileNameDisplay.textContent) {
            state.lastTranslatedIndex = progress.lastTranslatedIndex;
            state.translatedBlocks = progress.translatedBlocks;
            state.subtitleBlocks = progress.subtitleBlocks;
            renderSubtitles(elements.translatedSubtitleContainer, state.translatedBlocks, state.isEditMode);
            if (state.lastTranslatedIndex < state.subtitleBlocks.length - 1) {
                elements.continueButton.classList.remove('hidden');
            }
            elements.saveButton.disabled = false;
            return true;
        }
    }
    return false;
};

// Time Conversion Utility
const timeToSeconds = time => {
    const [hours, minutes, seconds] = time.split(':');
    const [sec, millis] = seconds.split(',');
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(sec) + parseInt(millis) / 1000;
};

const secondsToTime = seconds => {
    const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    const millis = Math.round((seconds % 1) * 1000).toString().padStart(3, '0');
    return `${hours}:${minutes}:${secs},${millis}`;
};

// File Handling with Gap Detection
const parseSRT = content => {
    content = content.replace(/\r/g, '');
    const blocks = content.split(/\n\n+/)
        .filter(block => block.trim())
        .map(block => {
            try {
                const lines = block.trim().split(/\n/);
                const index = lines[0].trim();
                if (!index.match(/^\d+$/)) return null;
                const timing = lines[1];
                if (!timing || !timing.includes('-->')) return null;
                const text = lines.slice(2).join('\n').trim();
                if (!text) return null;
                const [startTime, endTime] = timing.split('-->').map(t => t.trim());
                return { index, startTime, endTime, text };
            } catch (error) {
                console.error('خطا در پارس بلوک:', block);
                return null;
            }
        })
        .filter(block => block !== null);

    if (blocks.length === 0) showFlashMessage('فایل SRT معتبر نیست یا خالی است', 'error');
    return insertCreditBlocks(blocks);
};

const insertCreditBlocks = blocks => {
    const newBlocks = [];
    let nextIndex = parseInt(blocks[blocks.length - 1].index) + 1;

    for (let i = 0; i < blocks.length; i++) {
        newBlocks.push(blocks[i]);

        if (i < blocks.length - 1) {
            const currentEnd = timeToSeconds(blocks[i].endTime);
            const nextStart = timeToSeconds(blocks[i + 1].startTime);
            const gap = nextStart - currentEnd;

            if (gap > 4) {
                const gapThird = gap / 3;
                const creditStart = currentEnd + gapThird;
                const creditEnd = creditStart + gapThird;
                newBlocks.push({
                    index: (nextIndex++).toString(),
                    startTime: secondsToTime(creditStart),
                    endTime: secondsToTime(creditEnd),
                    text: "ترجمه شده توسط هوش مصنوعی فیری مووی"
                });
            }
        }
    }
    return newBlocks;
};

// Subtitle Rendering
const escapeHtml = text => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

const renderSubtitles = (container, blocks, isEditable = false) => {
    container.innerHTML = '';
    const isTranslatedContainer = container === elements.translatedSubtitleContainer;

    blocks.forEach((block, index) => {
        const isTranslated = index <= state.lastTranslatedIndex;
        const subtitleBlock = document.createElement('div');
        subtitleBlock.className = 'flex space-x-4 space-x-reverse subtitle-block';

        const retranslateButton = isTranslated && isTranslatedContainer ? 
            `<button class="retranslate-btn text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600" data-index="${index}">
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
            </button>` : '';

        const rtlStyle = isTranslatedContainer ? 'dir="rtl" style="text-align:right; font-family:\'Vazirmatn\', sans-serif;"' : '';
        const textContent = isEditable ? 
            `<div class="bg-gray-200 text-gray-800 p-3 rounded-lg text-sm ${isTranslated ? 'bg-green-50' : ''}" contenteditable="true" spellcheck="false" ${rtlStyle}>${escapeHtml(block.text)}</div>` :
            `<div class="bg-gray-200 text-gray-800 p-3 rounded-lg text-sm ${isTranslated ? 'bg-green-50' : ''}" ${rtlStyle}>${escapeHtml(block.text)}</div>`;

        subtitleBlock.innerHTML = `
            <div class="w-10 h-10 flex items-center justify-center ${isTranslated ? 'bg-green-200' : 'bg-gray-200'} text-gray-600 font-bold text-center rounded-full text-xs">${block.index}</div>
            <div class="flex-grow space-y-2">
                <div class="flex justify-between items-center">
                    <div class="flex space-x-2 space-x-reverse">
                        <div class="bg-blue-100 text-blue-700 font-medium px-3 py-1 rounded-full text-xs">${block.startTime}</div>
                        <span class="text-gray-500 font-medium text-xs">→</span>
                        <div class="bg-red-100 text-red-700 font-medium px-3 py-1 rounded-full text-xs">${block.endTime}</div>
                    </div>
                    ${retranslateButton}
                </div>
                ${textContent}
            </div>
        `;
        container.appendChild(subtitleBlock);
    });

    container.querySelectorAll('.retranslate-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            const index = parseInt(e.currentTarget.dataset.index);
            await retranslateBlock(index);
        });
    });
};

// Translation Logic
const getBlockContext = index => {
    const count = parseInt(elements.contextCountInput.value) || 3;
    let contextArray = [];

    for (let i = Math.max(0, index - count); i < index; i++) {
        if (state.subtitleBlocks[i]) {
            contextArray.push({ position: "previous", index: i - index, text: state.subtitleBlocks[i].text });
        }
    }
    if (state.subtitleBlocks[index]) {
        contextArray.push({ position: "current", index: 0, text: state.subtitleBlocks[index].text });
    }
    for (let i = index + 1; i < Math.min(state.subtitleBlocks.length, index + count + 1); i++) {
        if (state.subtitleBlocks[i]) {
            contextArray.push({ position: "next", index: i - index, text: state.subtitleBlocks[i].text });
        }
    }
    return JSON.stringify(contextArray);
};

// تشخیص زبان با استفاده از franc (فرض می‌کنیم این کتابخانه در دسترس است)
const detectLanguage = text => {
    try {
        return franc(text, { minLength: 3 }) || 'und'; // 'und' اگر نامشخص باشد
    } catch (e) {
        return 'und';
    }
};

// تنظیم طول ترجمه بر اساس زمان نمایش
const adjustTranslationLength = (translatedText, startTime, endTime) => {
    const duration = timeToSeconds(endTime) - timeToSeconds(startTime);
    const maxCharsPerSecond = 15;
    const maxLength = Math.floor(duration * maxCharsPerSecond);

    if (translatedText.length > maxLength) {
        const words = translatedText.split(' ');
        let result = '';
        for (let word of words) {
            if ((result + word).length <= maxLength) {
                result += (result ? ' ' : '') + word;
            } else {
                break;
            }
        }
        return result;
    }
    return translatedText;
};

// پس‌پردازش ترجمه
const postProcessTranslation = (translatedText, originalText, startTime, endTime) => {
    let result = translatedText.trim();
    result = adjustTranslationLength(result, startTime, endTime);
    result = result.replace(/\s+/g, ' ').trim();
    return result;
};

const translateSubtitle = async (text, model, blockIndex) => {
    if (text === "ترجمه شده توسط هوش مصنوعی فیری مووی") return text;

    const context = getBlockContext(blockIndex);
    const sourceLang = detectLanguage(text);
    const improvedPrompt = `
You are an expert subtitle translator. Translate ONLY the "current" subtitle (index: 0) from "${sourceLang === 'und' ? 'any language' : sourceLang}" to Persian.

Instructions:
- Use the JSON array in {{CONTEXT}} for context:
  - Index -1 or lower: previous subtitles
  - Index 0: current subtitle (translate this only)
  - Index 1 or higher: next subtitles
- Maintain the original meaning and tone (e.g., casual, formal, humorous).
- Keep it concise and natural for Persian subtitles.
- Replace inappropriate content (e.g., profanity) with ***.

Rules:
- Return only the Persian translation of the current subtitle.
- Do not include text from previous or next subtitles.
- No extra formatting or explanations.

Example:
- Input: "I love you" (index: 0)
- Output: "دوستت دارم"

{{CONTEXT}}
    `.replace('{{CONTEXT}}', context);

    let allKeysLimited = false;

    while (true) {
        if (!state.isTranslating) throw new Error('ترجمه توسط کاربر متوقف شد.');
        if (state.currentApiKeyIndex >= state.apiKeys.length) {
            if (allKeysLimited) {
                const waitTime = parseInt(elements.waitTimeInput.value) || 60;
                showFlashMessage(`همه کلیدهای API محدود شده‌اند. ${waitTime} ثانیه صبر کنید...`);
                await delay(waitTime * 1000);
                state.currentApiKeyIndex = 0;
                allKeysLimited = false;
                state.lastApiCallTimes = {};
                showFlashMessage('از سرگیری ترجمه...', 'success');
                return await translateSubtitle(text, model, blockIndex);
            }
            state.currentApiKeyIndex = 0;
        }

        const apiKey = state.apiKeys[state.currentApiKeyIndex];
        try {
            const workerUrl = `https://subtitle-translator-proxy.m4tinbeigi.workers.dev/?key=${apiKey}&model=${model}`;
            const response = await fetch(workerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: improvedPrompt }] }] })
            });

            if (!response.ok) {
                const errorText = await response.text();
                if (response.status === 429) {
                    state.lastApiCallTimes[apiKey] = Date.now();
                    state.currentApiKeyIndex++;
                    if (state.currentApiKeyIndex >= state.apiKeys.length) allKeysLimited = true;
                    continue;
                }
                throw new Error(`خطای Worker: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                throw new Error('پاسخ API خالی یا نامعتبر است');
            }

            let translatedText = data.candidates[0].content.parts[0].text.trim();
            if (!translatedText) {
                throw new Error('ترجمه دریافت‌شده خالی است');
            }

            translatedText = postProcessTranslation(translatedText, text, state.subtitleBlocks[blockIndex].startTime, state.subtitleBlocks[blockIndex].endTime);
            return translatedText;
        } catch (error) {
            console.error(`خطا با کلید API شماره ${state.currentApiKeyIndex + 1}:`, error);
            showFlashMessage(`خطا در ترجمه: ${error.message}`, 'error');
            state.currentApiKeyIndex++;
            if (state.currentApiKeyIndex >= state.apiKeys.length) allKeysLimited = true;
            continue;
        }
    }
};
// ذخیره در گوگل درایو (این بخش غیرفعال است چون نیاز به سرور دارد)
const uploadToGoogleDrive = async (content, fileName) => {
    showFlashMessage('آپلود به گوگل درایو در این نسخه غیرفعال است', 'error');
};

const retranslateBlock = async index => {
    if (!state.apiKeys.length) {
        showFlashMessage('لطفاً ابتدا کلید API را وارد کنید', 'error');
        return;
    }

    const block = state.subtitleBlocks[index];
    const model = elements.modelSelector.value;
    const btn = document.querySelector(`.retranslate-btn[data-index="${index}"]`);
    btn.disabled = true;
    btn.innerHTML = '<span class="animate-spin">↻</span>';

    try {
        const previousTranslatingState = state.isTranslating;
        state.isTranslating = true;
        const translatedText = await translateSubtitle(block.text, model, index);
        state.translatedBlocks[index] = { ...block, text: translatedText };
        renderSubtitles(elements.translatedSubtitleContainer, state.translatedBlocks, state.isEditMode);
        showFlashMessage('بلوک با موفقیت بازترجمه شد!', 'success');
        saveProgress();
        state.isTranslating = previousTranslatingState;
    } catch (error) {
        showFlashMessage('خطا در بازترجمه بلوک: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
        `;
    }
};

const translateBlock = async (block, model, index, totalBlocks) => {
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
        try {
            const translatedText = await translateSubtitle(block.text, model, index);
            if (!translatedText || translatedText.trim().length === 0) throw new Error('ترجمه خالی دریافت شد');
            const translatedBlock = { ...block, text: translatedText };
            state.translatedBlocks[index] = translatedBlock;
            state.lastTranslatedIndex = index;
            renderSubtitles(elements.translatedSubtitleContainer, state.translatedBlocks, state.isEditMode);
            elements.saveButton.disabled = false;
            saveProgress();

            const progress = Math.round(((index + 1) / totalBlocks) * 100);
            elements.progressBarFill.style.width = `${progress}%`;
            elements.progressText.textContent = `${progress}%`;
            const lastSubtitle = elements.translatedSubtitleContainer.lastElementChild;
            if (lastSubtitle) lastSubtitle.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return true;
        } catch (error) {
            if (error.message === 'ترجمه توسط کاربر متوقف شد.') throw error;
            retryCount++;
            console.error(`تلاش ${retryCount} برای ترجمه زیرنویس ${block.index} ناموفق بود:`, error.message);
            if (retryCount === maxRetries) {
                showFlashMessage(`ترجمه زیرنویس ${block.index} پس از ${maxRetries} تلاش ناموفق بود. رد می‌شود...`, 'error');
                return false;
            }
            await delay(2000);
        }
    }
    return false;
};

// Event Listeners
elements.advancedOptionsToggle.addEventListener('click', () => {
    elements.advancedOptionsContent.classList.toggle('hidden');
    elements.toggleIcon.style.transform = elements.advancedOptionsContent.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
});

document.addEventListener('DOMContentLoaded', () => {
    if (state.savedApiKeys.length > 0) {
        state.savedApiKeys.forEach((key, index) => {
            if (index === 0) document.querySelector('.api-key-input').value = key;
            else addNewApiKeyInput(key);
        });
    }
    if (state.savedCustomPrompt) elements.customPrompt.value = state.savedCustomPrompt;
    const savedWaitTime = localStorage.getItem('translatorWaitTime');
    if (savedWaitTime) elements.waitTimeInput.value = savedWaitTime;
    const savedContextCount = localStorage.getItem('translatorContextCount');
    if (savedContextCount) elements.contextCountInput.value = savedContextCount;
    loadProgress();

    elements.customPrompt.addEventListener('input', () => localStorage.setItem('translatorCustomPrompt', elements.customPrompt.value));
    elements.waitTimeInput.addEventListener('input', () => localStorage.setItem('translatorWaitTime', elements.waitTimeInput.value));
    elements.contextCountInput.addEventListener('input', () => localStorage.setItem('translatorContextCount', elements.contextCountInput.value));
});

elements.apiKeyList.addEventListener('click', event => {
    if (event.target.classList.contains('add-api-key-btn')) addNewApiKeyInput();
});

elements.fileInput.addEventListener('change', event => {
    const file = event.target.files[0];
    if (file) {
        clearSubtitles();
        elements.fileNameDisplay.textContent = file.name;
        elements.fileNameDisplay.classList.remove('hidden');
        elements.subtitleSections.classList.remove('hidden');
        elements.actionButtons.classList.remove('hidden');
        elements.editToggle.classList.remove('hidden');

        const reader = new FileReader();
        reader.onload = e => {
            const content = e.target.result;
            state.subtitleBlocks = parseSRT(content);
            if (state.subtitleBlocks.length > 0) {
                renderSubtitles(elements.originalSubtitleContainer, state.subtitleBlocks, false);
                if (!loadProgress()) {
                    elements.saveButton.disabled = true;
                    elements.continueButton.classList.add('hidden');
                }
            } else {
                showFlashMessage('فایل SRT معتبر نیست یا خالی است', 'error');
            }
        };
        reader.onerror = () => showFlashMessage('خطا در خواندن فایل', 'error');
        reader.readAsText(file);
    }
});

elements.translateButton.addEventListener('click', async () => {
    if (!state.subtitleBlocks.length) return showFlashMessage('لطفاً ابتدا یک فایل زیرنویس بارگذاری کنید.', 'error');
    if (state.isTranslating) {
        state.isTranslating = false;
        elements.translateButton.textContent = 'ترجمه';
        elements.progressContainer.classList.add('hidden');
        if (state.translatedBlocks.length > 0) {
            elements.saveButton.disabled = false;
            elements.continueButton.classList.remove('hidden');
            showFlashMessage('ترجمه متوقف شد. می‌توانید بعداً ادامه دهید یا ترجمه‌های ناتمام را ذخیره کنید.');
        }
        return;
    }

    updateApiKeys();
    if (state.apiKeys.length === 0) return showFlashMessage('لطفاً حداقل یک کلید API معتبر وارد کنید.', 'error');

    const model = elements.modelSelector.value;
    state.isTranslating = true;
    elements.translateButton.textContent = 'توقف';
    elements.progressContainer.classList.remove('hidden');
    elements.progressBarFill.style.width = '0%';
    elements.progressText.textContent = '0%';

    state.lastTranslatedIndex = -1;
    state.translatedBlocks = new Array(state.subtitleBlocks.length);
    elements.continueButton.classList.add('hidden');

    const totalBlocks = state.subtitleBlocks.length;
    try {
        for (let i = 0; i < totalBlocks && state.isTranslating; i++) {
            const success = await translateBlock(state.subtitleBlocks[i], model, i, totalBlocks);
            if (!success && state.isTranslating) i--;
        }
        if (state.lastTranslatedIndex === totalBlocks - 1) {
            const content = state.translatedBlocks
                .filter(block => block)
                .map(block => `${block.index}\n${block.startTime} --> ${block.endTime}\n${block.text}`)
                .join('\n\n');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const originalFileName = elements.fileNameDisplay.textContent.replace('.srt', ''); // حذف .srt از نام اصلی
            const fileName = `${originalFileName}_${timestamp}-FreeMovie.srt`; // نام فایل اصلی + زمان + FreeMovie
            await uploadToGoogleDrive(content, fileName); // غیرفعال در این نسخه
        }
    } finally {
        if (!state.isTranslating) {
            elements.translateButton.textContent = 'ترجمه';
            if (state.lastTranslatedIndex >= 0) elements.continueButton.classList.remove('hidden');
        } else {
            state.isTranslating = false;
            elements.translateButton.textContent = 'ترجمه';
            if (state.lastTranslatedIndex === totalBlocks - 1) showFlashMessage('ترجمه با موفقیت به پایان رسید!');
        }
        setTimeout(() => elements.progressContainer.classList.add('hidden'), 2000);
    }
});

elements.continueButton.addEventListener('click', async () => {
    if (!state.isTranslating && state.lastTranslatedIndex < state.subtitleBlocks.length - 1) {
        updateApiKeys();
        if (state.apiKeys.length === 0) return showFlashMessage('لطفاً حداقل یک کلید API معتبر وارد کنید.', 'error');

        const model = elements.modelSelector.value;
        state.isTranslating = true;
        elements.translateButton.textContent = 'توقف';
        elements.continueButton.classList.add('hidden');
        elements.progressContainer.classList.remove('hidden');

        const startIndex = state.lastTranslatedIndex + 1;
        const totalBlocks = state.subtitleBlocks.length;
        const progress = Math.round((startIndex / totalBlocks) * 100);
        elements.progressBarFill.style.width = `${progress}%`;
        elements.progressText.textContent = `${progress}%`;

        try {
            for (let i = startIndex; i < totalBlocks && state.isTranslating; i++) {
                const success = await translateBlock(state.subtitleBlocks[i], model, i, totalBlocks);
                if (!success && state.isTranslating) i--;
            }
            if (state.lastTranslatedIndex === totalBlocks - 1) {
                const content = state.translatedBlocks
                    .filter(block => block)
                    .map(block => `${block.index}\n${block.startTime} --> ${block.endTime}\n${block.text}`)
                    .join('\n\n');
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const originalFileName = elements.fileNameDisplay.textContent.replace('.srt', ''); // حذف .srt از نام اصلی
                const fileName = `${originalFileName}_${timestamp}-FreeMovie.srt`; // نام فایل اصلی + زمان + FreeMovie
                await uploadToGoogleDrive(content, fileName); // غیرفعال در این نسخه
            }
        } finally {
            if (!state.isTranslating) {
                elements.translateButton.textContent = 'ترجمه';
                if (state.lastTranslatedIndex >= 0) elements.continueButton.classList.remove('hidden');
            } else {
                state.isTranslating = false;
                elements.translateButton.textContent = 'ترجمه';
                if (state.lastTranslatedIndex === totalBlocks - 1) {
                    showFlashMessage('ترجمه با موفقیت به پایان رسید!');
                } else {
                    elements.continueButton.classList.remove('hidden');
                    showFlashMessage('ترجمه متوقف شد. برای ادامه کلیک کنید.');
                }
            }
            setTimeout(() => elements.progressContainer.classList.add('hidden'), 2000);
        }
    }
});

elements.editToggle.addEventListener('click', () => {
    if (state.isEditMode) {
        const editableBlocks = elements.translatedSubtitleContainer.querySelectorAll('.subtitle-block');
        editableBlocks.forEach((block, index) => {
            const textDiv = block.querySelector('[contenteditable="true"]');
            if (textDiv && state.translatedBlocks[index]) state.translatedBlocks[index].text = textDiv.innerText.trim();
        });
        saveProgress();
    }
    state.isEditMode = !state.isEditMode;
    renderSubtitles(elements.translatedSubtitleContainer, state.translatedBlocks, state.isEditMode);
    elements.editToggle.textContent = state.isEditMode ? 'ذخیره تغییرات' : 'ویرایش ترجمه‌ها';
});

elements.saveButton.addEventListener('click', async () => {
    try {
        if (state.translatedBlocks.length === 0) throw new Error('هیچ زیرنویس ترجمه‌شده‌ای برای ذخیره وجود ندارد');
        const content = state.translatedBlocks
            .filter(block => block)
            .map(block => `${block.index}\n${block.startTime} --> ${block.endTime}\n${block.text}`)
            .join('\n\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const originalFileName = elements.fileNameDisplay.textContent.replace('.srt', ''); // حذف .srt از نام اصلی
        const fileName = `${originalFileName}_${timestamp}-FreeMovie.srt`; // نام فایل اصلی + زمان + FreeMovie
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);

        await uploadToGoogleDrive(content, fileName); // غیرفعال در این نسخه
        showFlashMessage('زیرنویس‌های ترجمه‌شده با موفقیت ذخیره شدند!');
    } catch (error) {
        console.error('خطا در ذخیره زیرنویس‌ها:', error);
        showFlashMessage('خطا در ذخیره زیرنویس‌ها: ' + error.message, 'error');
    }
});

elements.originalSubtitleContainer.addEventListener('scroll', () => {
    elements.translatedSubtitleContainer.scrollTop = elements.originalSubtitleContainer.scrollTop;
});

elements.translatedSubtitleContainer.addEventListener('scroll', () => {
    elements.originalSubtitleContainer.scrollTop = elements.translatedSubtitleContainer.scrollTop;
});

const clearSubtitles = () => {
    elements.originalSubtitleContainer.innerHTML = '';
    elements.translatedSubtitleContainer.innerHTML = '';
    state.subtitleBlocks = [];
    state.translatedBlocks = [];
    state.lastTranslatedIndex = -1;
    elements.saveButton.disabled = true;
    elements.continueButton.classList.add('hidden');
    localStorage.removeItem('translationProgress');
};

// Auto-save progress
setInterval(saveProgress, 5000);