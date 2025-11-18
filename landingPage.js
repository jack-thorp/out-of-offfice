// create map functionality exists on page (if they don't exists yet)
window.__activityFocusQueue = window.__activityFocusQueue || [];
window.__mapActionQueue = window.__mapActionQueue || [];
window.appMap = window.appMap || {};

function queueMapCommand(method, args) {
    window.__mapActionQueue.push({ method, args });
}

if (typeof window.appMap.focusOnEntry !== 'function') {
    window.appMap.focusOnEntry = (entry) => {
        // if new entry, add to list
        if (entry) {
            window.__activityFocusQueue.push(entry);
        }
    };
}

// check to see if functions are created for handling map
if (typeof window.appMap.setCapturedEntries !== 'function') {
    window.appMap.setCapturedEntries = (...args) => {
        queueMapCommand('setCapturedEntries', args);
    };
}
if (typeof window.appMap.showAllEntries !== 'function') {
    window.appMap.showAllEntries = (...args) => {
        queueMapCommand('showAllEntries', args);
    };
}

// Modal open/close logic
(function () {
    // grab modal from page
    const body = document.body;
    const modal = document.getElementById('new-entry-modal');
    const openButton = document.querySelector('[data-action="open-modal"]');
    if (!modal || !openButton) {
        return;
    }

    const closeElements = modal.querySelectorAll('[data-modal-close]');
    const form = modal.querySelector('form');

    // show modal (and lock page behind it)
    function openModal() {
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        body.classList.add('modal-open');
    }
    // hide modal and reset forms inside (so they're not populated if you press New Entry again)
    function closeModal() {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        body.classList.remove('modal-open');
        if (form) {
            form.reset();
        }
    }
    // add modal show when New Entry clicked
    openButton.addEventListener('click', openModal);
    closeElements.forEach((el) => el.addEventListener('click', closeModal));

    // if I press 'ESC' key, it'll close the modal (if open)
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.hidden === false) {
            closeModal();
        }
    });
}());

// Rating star display updater
(function () {
    // get modal for new entry
    const modal = document.getElementById('new-entry-modal');
    if (!modal) {
        return;
    }
    // grab elements for rating selection
    const ratingInputs = modal.querySelectorAll('input[name="rating"]');
    const display = modal.querySelector('[data-rating-display]');
    const errorEl = modal.querySelector('[data-rating-error]');
    const starGroup = modal.querySelector('.StarRating');

    // updates visable rating when selected
    const updateValue = () => {
        const checked = modal.querySelector('input[name="rating"]:checked');
        display.textContent = checked ? checked.value : '0';
        if (checked) {
            setInvalidState(false);
        }
    };

    // whenever the star rating changes, update the value displayed
    ratingInputs.forEach((input) => {
        input.addEventListener('change', updateValue);
        input.addEventListener('input', updateValue);
    });

    // prevent save
    const form = modal.querySelector('form');
    if (form) {
        form.addEventListener('submit', (event) => {
            const checked = modal.querySelector('input[name="rating"]:checked');
            if (!checked) {
                event.preventDefault();
                setInvalidState(true);
                if (ratingInputs.length) {
                    ratingInputs[ratingInputs.length - 1].focus();
                }
            } else {
                setInvalidState(false);
            }
        });

        form.addEventListener('reset', () => {
            requestAnimationFrame(() => {
                updateValue();
                setInvalidState(false);
            });
        });
    }

    setInvalidState(false);
    updateValue();
}());

// Activity panel logic
(function () {
    const activityListEl = document.querySelector('[data-activity-list]');
    const filterButtons = Array.from(document.querySelectorAll('.ActivityFilter[data-filter]'));

    if (!activityListEl || !filterButtons.length) {
        return;
    }

    const mapBridge = window.appMap || (window.appMap = {});
    const modal = document.getElementById('new-entry-modal');
    const form = modal ? modal.querySelector('form') : null;
    const body = document.body;

    const summaryEl = document.querySelector('[data-activity-summary]');
    const summaryPlaceholder = summaryEl ? summaryEl.querySelector('[data-summary-placeholder]') : null;
    const summaryContent = summaryEl ? summaryEl.querySelector('[data-summary-content]') : null;
    const summaryTitle = summaryEl ? summaryEl.querySelector('[data-summary-title]') : null;
    const summaryLocation = summaryEl ? summaryEl.querySelector('[data-summary-location]') : null;
    const summaryRating = summaryEl ? summaryEl.querySelector('[data-summary-rating]') : null;
    const summaryCount = summaryEl ? summaryEl.querySelector('[data-summary-count]') : null;
    const summaryRecent = summaryEl ? summaryEl.querySelector('[data-summary-recent]') : null;
    const summaryChart = summaryEl ? summaryEl.querySelector('[data-summary-chart]') : null;
    const hasSummaryUI = Boolean(
        summaryEl &&
        summaryPlaceholder &&
        summaryContent &&
        summaryTitle &&
        summaryLocation &&
        summaryRating &&
        summaryCount &&
        summaryRecent &&
        summaryChart
    );
    const activityConsole = document.querySelector('[data-activity-console]');
    const viewToggleButtons = activityConsole ? Array.from(activityConsole.querySelectorAll('[data-view-target]')) : [];
    const listFace = activityConsole ? activityConsole.querySelector('.ActivityConsole__face--list') : null;
    const summaryFace = activityConsole ? activityConsole.querySelector('.ActivityConsole__face--summary') : null;

    const emptyStateTemplate = activityListEl.querySelector('[data-empty-state]');
    if (emptyStateTemplate) {
        emptyStateTemplate.remove();
    }

    const VIBE_COLORS = {
        'Lock In (Deep Focus)': '#10C1FF',
        'Creative Coding Environment': '#5f80ff',
        'Social Brainstorm Jam': '#ff87d7',
        'Unproductive': '#ffb347',
    };
    const VIBE_ORDER = [
        'Lock In (Deep Focus)',
        'Creative Coding Environment',
        'Social Brainstorm Jam',
        'Unproductive',
    ];

    const FILTER_SORTERS = {
        recent: (a, b) => b.createdAt - a.createdAt,
        top: (a, b) => {
            if (b.rating === a.rating) {
                return b.createdAt - a.createdAt;
            }
            return b.rating - a.rating;
        },
        visited: (a, b) => {
            if (b.visits === a.visits) {
                return b.createdAt - a.createdAt;
            }
            return b.visits - a.visits;
        },
    };

    const activityState = {
        entries: [],
        selectedId: null,
        filter: 'recent',
        view: 'list',
    };
    const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

    function syncMapEntries() {
        if (typeof mapBridge.setCapturedEntries === 'function') {
            mapBridge.setCapturedEntries(activityState.entries);
        }
    }

    function resetMapToAllEntries() {
        if (typeof mapBridge.showAllEntries === 'function') {
            mapBridge.showAllEntries();
        }
    }

    function normalizeKey(value) {
        return (value || '').toString().trim().toLowerCase();
    }

    function formatRating(value) {
        return Number(value || 0).toFixed(1).replace(/\.0$/, '');
    }

    function formatDate(value) {
        if (!value) {
            return '';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        return dateFormatter.format(date);
    }

    function truncate(text, maxLength = 120) {
        if (!text) {
            return '';
        }
        if (text.length <= maxLength) {
            return text;
        }
        return `${text.slice(0, maxLength - 3).trim()}...`;
    }

    function resolveView(nextView) {
        if (nextView === 'summary' && !hasSummaryUI) {
            return 'list';
        }
        return nextView === 'summary' ? 'summary' : 'list';
    }

    function syncViewToggle() {
        if (!activityConsole) {
            return;
        }
        const currentView = resolveView(activityState.view);
        activityState.view = currentView;
        activityConsole.dataset.view = currentView;
        viewToggleButtons.forEach((button) => {
            const isActive = button.dataset.viewTarget === currentView;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
            button.tabIndex = isActive ? 0 : -1;
        });
        if (listFace) {
            listFace.setAttribute('aria-hidden', currentView === 'summary' ? 'true' : 'false');
        }
        if (summaryFace) {
            summaryFace.setAttribute('aria-hidden', currentView === 'summary' ? 'false' : 'true');
        }
    }

    function setConsoleView(nextView) {
        const resolved = resolveView(nextView);
        const previousView = activityState.view;
        if (previousView !== resolved) {
            activityState.view = resolved;
        }
        syncViewToggle();
        if (resolved === 'list' && previousView !== 'list') {
            resetMapToAllEntries();
        }
    }

    function hydrateViewToggle() {
        if (!activityConsole || !viewToggleButtons.length) {
            return;
        }
        viewToggleButtons.forEach((button) => {
            button.addEventListener('click', () => {
                setConsoleView(button.dataset.viewTarget || 'list');
            });
            button.addEventListener('keydown', (event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
                    return;
                }
                event.preventDefault();
                const targetView = event.key === 'ArrowLeft' ? 'list' : 'summary';
                setConsoleView(targetView);
                const focusTarget = viewToggleButtons.find((el) => el.dataset.viewTarget === activityState.view);
                if (focusTarget) {
                    focusTarget.focus();
                }
            });
        });
        syncViewToggle();
    }

    function clearLocationDatasets() {
        if (!form) {
            return;
        }
        const locationInput = form.querySelector('input[name="location"]');
        if (locationInput) {
            delete locationInput.dataset.lat;
            delete locationInput.dataset.lon;
            delete locationInput.dataset.displayName;
            delete locationInput.dataset.placeName;
        }
    }

    function buildEntryFromForm() {
        if (!form) {
            return null;
        }

        const formData = new FormData(form);
        const locationInput = form.querySelector('input[name="location"]');
        const ratingInput = form.querySelector('input[name="rating"]:checked');

        const nameValue = (formData.get('name') || '').toString().trim();
        const vibeValue = (formData.get('vibeCategory') || '').toString().trim();
        const celebValue = (formData.get('celeb') || '').toString().trim();
        const commentsValue = (formData.get('comments') || '').toString().trim();
        const locationValue = (formData.get('location') || '').toString().trim();
        const ratingValue = ratingInput ? Number(ratingInput.value) : 0;
        const datasetPlace = locationInput?.dataset.placeName || '';
        const datasetDisplay = locationInput?.dataset.displayName || '';

        const place = (datasetPlace || locationValue || 'Untitled Spot').trim();
        const locationDisplay = (datasetDisplay || locationValue || place || 'Location TBD').trim();

        return {
            id: `entry-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            place,
            placeKey: normalizeKey(place),
            name: nameValue,
            vibe: vibeValue,
            celeb: celebValue,
            comments: commentsValue,
            locationDisplay: locationDisplay || 'Location TBD',
            rating: ratingValue,
            coordinates: locationInput?.dataset.lat && locationInput?.dataset.lon
                ? {
                    lat: Number(locationInput.dataset.lat),
                    lon: Number(locationInput.dataset.lon),
                }
                : null,
            createdAt: Date.now(),
            visits: 1,
        };
    }

    function getEntriesForFilter() {
        if (activityState.filter === 'recent') {
            return activityState.entries;
        }
        const latestByPlace = new Map();
        activityState.entries.forEach((entry) => {
            const key = entry.placeKey || normalizeKey(entry.place);
            if (!key) {
                return;
            }
            const current = latestByPlace.get(key);
            if (!current || entry.createdAt > current.createdAt) {
                latestByPlace.set(key, entry);
            }
        });
        return Array.from(latestByPlace.values());
    }

    function getSortedEntries() {
        const baseEntries = getEntriesForFilter();
        const sorter = FILTER_SORTERS[activityState.filter] || FILTER_SORTERS.recent;
        return [...baseEntries].sort(sorter);
    }

    function getEntriesForPlace(entryOrKey) {
        const key =
            typeof entryOrKey === 'string'
                ? normalizeKey(entryOrKey)
                : normalizeKey(entryOrKey?.placeKey ? entryOrKey.placeKey : entryOrKey?.place);
        if (!key) {
            return [];
        }
        return activityState.entries.filter((item) => item.placeKey === key);
    }

    function renderList() {
        const entries = getSortedEntries();
        activityListEl.innerHTML = '';

        if (!entries.length) {
            if (emptyStateTemplate) {
                emptyStateTemplate.removeAttribute('hidden');
                activityListEl.appendChild(emptyStateTemplate);
            }
            activityState.selectedId = null;
            if (hasSummaryUI) {
                renderSummary(null);
            }
            return;
        }

        if (emptyStateTemplate) {
            emptyStateTemplate.setAttribute('hidden', 'true');
        }

        entries.forEach((entry) => {
            const listItem = document.createElement('li');
            listItem.className = 'ActivityCard';
            listItem.dataset.entryId = entry.id;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ActivityCard__button';

            const flip = document.createElement('div');
            flip.className = 'ActivityCard__flip';

            const front = document.createElement('div');
            front.className = 'ActivityCard__face ActivityCard__face--front';

            const placeEl = document.createElement('span');
            placeEl.className = 'ActivityCard__place';
            placeEl.textContent = entry.place;

            const metaEl = document.createElement('div');
            metaEl.className = 'ActivityCard__meta';

            const personEl = document.createElement('span');
            personEl.className = 'ActivityCard__person';

            const nameEl = document.createElement('span');
            nameEl.textContent = entry.name;

            const ratingEl = document.createElement('span');
            ratingEl.className = 'ActivityCard__rating';
            ratingEl.textContent = formatRating(entry.rating);

            personEl.append(nameEl, ratingEl);

            const dateEl = document.createElement('time');
            dateEl.className = 'ActivityCard__date';
            const formattedDate = formatDate(entry.createdAt);
            dateEl.textContent = formattedDate || 'Just now';
            if (entry.createdAt) {
                dateEl.dateTime = new Date(entry.createdAt).toISOString();
            }

            metaEl.append(personEl, dateEl);

            const vibeChip = document.createElement('span');
            vibeChip.className = 'ActivityCard__vibe';
            vibeChip.textContent = entry.vibe;

            front.append(placeEl, metaEl, vibeChip);

            const back = document.createElement('div');
            back.className = 'ActivityCard__face ActivityCard__face--back';

            const backLabel = document.createElement('span');
            backLabel.className = 'ActivityCard__backLabel';
            backLabel.textContent = 'Latest thought';

            const backComment = document.createElement('p');
            backComment.className = 'ActivityCard__comment';
            backComment.textContent = truncate(entry.comments || 'No comments added yet.', 120);

            const backRating = document.createElement('div');
            backRating.className = 'ActivityCard__backRating';
            backRating.textContent = formatRating(entry.rating);
            const backRatingSuffix = document.createElement('span');
            backRatingSuffix.textContent = '/5';
            backRating.appendChild(backRatingSuffix);

            back.append(backLabel, backRating, backComment, vibeChip.cloneNode(true));

            flip.append(front, back);
            button.append(flip);
            button.addEventListener('click', () => {
                selectEntry(entry.id, { showSummary: true });
            });

            listItem.appendChild(button);
            activityListEl.appendChild(listItem);

            if (entry.id === activityState.selectedId) {
                listItem.classList.add('is-active');
            }
        });
    }

    function renderRecentActivity(entriesForPlace) {
        if (!summaryRecent) {
            return;
        }
        summaryRecent.innerHTML = '';

        if (!entriesForPlace.length) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'ActivitySummary__recentEmpty';
            emptyItem.textContent = 'No sessions logged yet.';
            summaryRecent.appendChild(emptyItem);
            return;
        }

        const recent = [...entriesForPlace]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 3);
        recent.forEach((item) => {
            const li = document.createElement('li');
            li.className = 'ActivitySummary__recentItem';

            const topRow = document.createElement('div');
            topRow.className = 'ActivitySummary__recentTop';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = item.name;
            const ratingSpan = document.createElement('span');
            ratingSpan.className = 'ActivitySummary__recentRating';
            ratingSpan.textContent = `★ ${formatRating(item.rating)}`;
            topRow.append(nameSpan, ratingSpan);

            const dateEl = document.createElement('time');
            dateEl.className = 'ActivitySummary__recentDate';
            const recentDate = formatDate(item.createdAt);
            dateEl.textContent = recentDate || 'Just now';
            if (item.createdAt) {
                dateEl.dateTime = new Date(item.createdAt).toISOString();
            }

            const meta = document.createElement('div');
            meta.className = 'ActivitySummary__recentMeta';
            meta.textContent = item.vibe || 'Vibe TBD';

            const comment = document.createElement('p');
            comment.className = 'ActivitySummary__recentComment';
            comment.textContent = item.comments ? truncate(item.comments, 140) : 'No comments yet.';

            li.append(topRow, dateEl, meta, comment);
            summaryRecent.appendChild(li);
        });
    }

    function renderVibeChart(entriesForPlace) {
        if (!summaryChart) {
            return;
        }
        summaryChart.innerHTML = '';

        if (!entriesForPlace.length) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'ActivitySummary__chartEmpty';
            emptyMessage.textContent = 'Add another entry to unlock the vibe breakdown.';
            summaryChart.appendChild(emptyMessage);
            return;
        }

        const counts = new Map();
        entriesForPlace.forEach((entry) => {
            const key = entry.vibe || 'Vibe TBD';
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        const total = entriesForPlace.length || 1;

        const vibesToRender = [
            ...VIBE_ORDER,
            ...Array.from(counts.keys()).filter((key) => !VIBE_ORDER.includes(key)),
        ];

        vibesToRender.forEach((vibe) => {
            const value = counts.get(vibe) || 0;
            if (value === 0) {
                return;
            }
            const percentage = Math.round((value / total) * 100);

            const row = document.createElement('div');
            row.className = 'ActivitySummary__chartRow';

            const label = document.createElement('span');
            label.className = 'ActivitySummary__chartLabel';
            label.textContent = vibe;

            const bar = document.createElement('div');
            bar.className = 'ActivitySummary__chartBar';

            const fill = document.createElement('div');
            fill.className = 'ActivitySummary__chartFill';
            fill.style.width = `${percentage}%`;
            fill.style.background = VIBE_COLORS[vibe] || '#10C1FF';

            bar.appendChild(fill);
            row.append(label, bar);
            summaryChart.appendChild(row);
        });

        if (!summaryChart.children.length) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'ActivitySummary__chartEmpty';
            emptyMessage.textContent = 'No vibe data yet.';
            summaryChart.appendChild(emptyMessage);
        }
    }

    function renderSummary(entry) {
        if (!hasSummaryUI) {
            return;
        }
        if (!entry) {
            summaryPlaceholder.hidden = false;
            summaryContent.hidden = true;
            return;
        }

        summaryPlaceholder.hidden = true;
        summaryContent.hidden = false;

        summaryTitle.textContent = entry.place;
        summaryLocation.textContent = entry.locationDisplay || 'Location TBD';

        const related = getEntriesForPlace(entry);
        const ratingTotal = related.reduce((sum, item) => sum + (Number(item.rating) || 0), 0);
        const average = related.length ? ratingTotal / related.length : entry.rating || 0;

        summaryRating.textContent = `${formatRating(average)}/5`;
        summaryCount.textContent = related.length.toString();

        renderRecentActivity(related);
        renderVibeChart(related);
    }

    function focusMapOnEntry(entry) {
        if (!entry || typeof mapBridge.focusOnEntry !== 'function') {
            return;
        }
        mapBridge.focusOnEntry(entry);
    }

    function selectEntry(entryId, options = {}) {
        const entry = activityState.entries.find((item) => item.id === entryId);
        if (!entry) {
            return;
        }

        if (options.incrementVisit !== false) {
            entry.visits += 1;
        }

        activityState.selectedId = entryId;
        renderList();
        renderSummary(entry);
        if (options.showSummary) {
            setConsoleView('summary');
        }
        if (options.focusMap !== false) {
            focusMapOnEntry(entry);
        }
    }

    function syncFilterButtons() {
        filterButtons.forEach((button) => {
            const isActive = button.dataset.filter === activityState.filter;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    function syncSelectedIdForFilter(entries) {
        if (!entries.length) {
            activityState.selectedId = null;
            return;
        }
        if (!activityState.selectedId) {
            activityState.selectedId = entries[0].id;
            return;
        }
        const hasSelected = entries.some((entry) => entry.id === activityState.selectedId);
        if (hasSelected) {
            return;
        }
        const activeEntry = activityState.entries.find((item) => item.id === activityState.selectedId);
        if (activeEntry) {
            const replacement = entries.find((entry) => entry.placeKey === activeEntry.placeKey);
            if (replacement) {
                activityState.selectedId = replacement.id;
                return;
            }
        }
        activityState.selectedId = entries[0].id;
    }

    function applyFilter(nextFilter, options = {}) {
        if (!nextFilter || nextFilter === activityState.filter) {
            return;
        }
        const shouldFocusMap = options.focusMap !== false;
        activityState.filter = nextFilter;
        syncFilterButtons();

        const sorted = getSortedEntries();
        syncSelectedIdForFilter(sorted);

        renderList();
        if (activityState.selectedId) {
            const selectedEntry = activityState.entries.find((item) => item.id === activityState.selectedId);
            renderSummary(selectedEntry || null);
            if (shouldFocusMap && selectedEntry) {
                focusMapOnEntry(selectedEntry);
            } else if (!shouldFocusMap) {
                resetMapToAllEntries();
            }
        } else {
            renderSummary(null);
            if (!shouldFocusMap) {
                resetMapToAllEntries();
            }
        }
    }

    function hydrateFilters() {
        filterButtons.forEach((button) => {
            button.addEventListener('click', () => {
                applyFilter(button.dataset.filter, { focusMap: false });
            });
        });
        syncFilterButtons();
    }

    function closeModalIfOpen() {
        if (!modal || modal.hidden === true) {
            return;
        }
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        body.classList.remove('modal-open');
    }

    function handleFormSubmit(event) {
        if (event.defaultPrevented) {
            return;
        }
        event.preventDefault();
        const nextEntry = buildEntryFromForm();
        if (!nextEntry) {
            return;
        }
        activityState.entries.push(nextEntry);
        syncMapEntries();
        selectEntry(nextEntry.id, { incrementVisit: false });
        form.reset();
        clearLocationDatasets();
        closeModalIfOpen();
    }

    function seedEntries() {
        const now = Date.now();
        const presets = [
            {
                id: 'seed-methodical',
                place: 'Methodical Coffee (Camperdown)',
                name: 'Sam T.',
                vibe: 'Lock In (Deep Focus)',
                comments: 'Good Coffee! Love being in downtown. Upstairs can be packed if you do not get there at the right time',
                locationDisplay: 'Methodical Coffee, 101, North Main Street, Downtown, Greenville, Greenville County, South Carolina, 29601, United States',
                rating: 4,
                createdAt: now - 1000 * 60 * 60 * 4,
                visits: 5,
            },
            {
                id: 'seed-commons',
                place: 'The Commons Riverwalk',
                name: 'Jack T.',
                vibe: 'Social Brainstorm Jam',
                comments: 'chill vibe grabbing a beer and sitting outside',
                locationDisplay: 'The Commons, 147 Welborn St Suite B1, Greenville, SC 29601, United States',
                rating: 3,
                createdAt: now - 1000 * 60 * 60 * 26,
                visits: 8,
            },
            {
                id: 'seed-grateful',
                place: 'Grateful Brew',
                name: 'Jack T.',
                vibe: 'Creative Coding Environment',
                comments: 'fun to get a coffee and beer at!',
                locationDisplay: 'Grateful Brew, 501 South Pleasantburg Drive, Cavalier Heights, Greenville, Greenville County, South Carolina, 29607, United States',
                rating: 4,
                createdAt: now - 1000 * 60 * 60 * 72,
                visits: 6,
            },
        ];

        presets.forEach((entry) => {
            activityState.entries.push({
                ...entry,
                placeKey: normalizeKey(entry.place),
            });
        });
    }

    hydrateViewToggle();
    hydrateFilters();
    seedEntries();
    syncMapEntries();

    if (activityState.entries.length) {
        const initial = getSortedEntries();
        if (initial.length) {
            selectEntry(initial[0].id, { incrementVisit: false, focusMap: false });
        }
    } else {
        renderList();
        renderSummary(null);
    }
    resetMapToAllEntries();

    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    function handleMapEntrySelection(event) {
        const entryId = event?.detail?.entryId;
        if (!entryId) {
            return;
        }
        const entryExists = activityState.entries.some((item) => item.id === entryId);
        if (!entryExists) {
            return;
        }
        selectEntry(entryId, { incrementVisit: false, showSummary: true, focusMap: false });
    }

    window.addEventListener('activity:select-entry', handleMapEntrySelection);
}());

// Map + search logic
(function () {
    const mapBridge = window.appMap || (window.appMap = {});
    const activityFocusQueue = window.__activityFocusQueue || [];
    const mapActionQueue = window.__mapActionQueue || [];

    function flushQueuedMapCommands() {
        if (!mapActionQueue.length) {
            return;
        }
        while (mapActionQueue.length) {
            const action = mapActionQueue.shift();
            if (action && typeof mapBridge[action.method] === 'function') {
                mapBridge[action.method](...(action.args || []));
            }
        }
    }

    if (typeof L === 'undefined') {
        console.warn('Leaflet failed to load; map cannot be initialised.');
        mapBridge.focusOnEntry = () => {};
        mapBridge.setCapturedEntries = () => {};
        mapBridge.showAllEntries = () => {};
        flushQueuedMapCommands();
        return;
    }

    function initializeMap() {
        const mapContainer = document.getElementById('map');
        if (!mapContainer) {
            mapBridge.focusOnEntry = () => {};
            mapBridge.setCapturedEntries = () => {};
            mapBridge.showAllEntries = () => {};
            flushQueuedMapCommands();
            return;
        }

        const statusEl = document.getElementById('status');
        const GREENVILLE_CENTER = [34.8526, -82.3940];
        const DEFAULT_PLACE = {
            display_name: 'Greenville, SC',
            lat: String(GREENVILLE_CENTER[0]),
            lon: String(GREENVILLE_CENTER[1]),
        };
        const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
        const NOMINATIM_VIEWBOX = '-82.6,35.1,-82.1,34.6';
        const HTML_ESCAPE_LOOKUP = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        };

        async function fetchPlaces(query, options = {}) {
            const {
                limit = 5,
                minLength = 3,
                enforceMinLength = true,
            } = options;

            const trimmed = (query ?? '').trim();
            if (!trimmed) {
                return [];
            }

            if (enforceMinLength && trimmed.length < minLength) {
                return [];
            }

            const params = new URLSearchParams({
                format: 'json',
                limit: String(limit),
                bounded: '1',
                viewbox: NOMINATIM_VIEWBOX,
                q: trimmed,
            });

            const response = await fetch(`${NOMINATIM_BASE_URL}?${params.toString()}`);
            if (!response.ok) {
                throw new Error('Suggestion request failed');
            }

            const results = await response.json();
            return Array.isArray(results) ? results : [];
        }

        function escapeHtml(value) {
            const raw = value == null ? '' : String(value);
            return raw.replace(/[&<>"']/g, (char) => HTML_ESCAPE_LOOKUP[char]);
        }

        function parseDisplayName(value) {
            const displayName =
                typeof value === 'string'
                    ? value
                    : value && typeof value.display_name === 'string'
                        ? value.display_name
                        : '';
            const trimmed = displayName.trim();
            if (!trimmed) {
                return { displayName: '', name: '', address: '' };
            }

            const parts = trimmed.split(',');
            const firstPart = parts.shift() || '';
            const name = firstPart.trim() || trimmed;
            const address = parts.join(',').trim();

            return { displayName: trimmed, name, address };
        }

        function buildNameAddressHtml(value, variantClass) {
            const { displayName, name, address } = parseDisplayName(value);
            if (!displayName) {
                return '';
            }

            const classes = ['PopupContent'];
            if (variantClass) {
                classes.push(variantClass);
            }

            const nameHtml = escapeHtml(name);

            if (!address) {
                return `<div class="${classes.join(' ')}"><div class="PopupContent__name">${nameHtml}</div></div>`;
            }

            const addressHtml = escapeHtml(address);
            return `<div class="${classes.join(' ')}"><div class="PopupContent__name">${nameHtml}</div><div class="PopupContent__address">${addressHtml}</div></div>`;
        }

        function buildPopupContent(place) {
            const html = buildNameAddressHtml(place, 'PopupContent--popup');
            if (html) {
                return html;
            }

            return '<div class="PopupContent PopupContent--popup"><div class="PopupContent__name">Selected location</div></div>';
        }

        function buildSuggestionMarkup(place) {
            const html = buildNameAddressHtml(place, 'PopupContent--suggestion');
            if (html) {
                return html;
            }

            const parsed = parseDisplayName(place);
            const fallbackName = escapeHtml(parsed.name || parsed.displayName || 'Selected location');
            return `<div class="PopupContent PopupContent--suggestion"><div class="PopupContent__name">${fallbackName}</div></div>`;
        }

        function buildPreviewMarkup(value) {
            return buildNameAddressHtml(value, 'PopupContent--preview');
        }

        const map = L.map(mapContainer);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        let mapReady = false;
        const coordinateCache = new Map();
        const pendingCoordinateLookups = new Map();
        let currentMarker = null;
        let activityMarker = null;
        const entryPinsLayer = L.layerGroup().addTo(map);
        const userLocationLayer = L.layerGroup().addTo(map);
        let userLocationMarker = null;
        let userLocationCircle = null;
        let capturedEntries = [];
        let pendingPinsRefresh = false;
        let pinsRenderPromise = null;
        let pinsBounds = null;
        let pendingShowAll = false;

        map.setView(GREENVILLE_CENTER, 13);
        map.whenReady(() => {
            mapReady = true;
            map.invalidateSize();
            flushQueuedFocusRequests();
            if (pendingPinsRefresh && !pinsRenderPromise) {
                attemptPinsRefresh();
            } else if (pinsRenderPromise && pendingShowAll) {
                pinsRenderPromise.finally(() => {
                    runPendingShowAll();
                });
            } else if (pendingShowAll) {
                runPendingShowAll();
            }
            requestUserLocation();
        });

        if (statusEl) {
            statusEl.textContent = 'Centered on ' + DEFAULT_PLACE.display_name;
        }

        function hasCoordinates(coords) {
            return (
                coords &&
                typeof coords.lat === 'number' &&
                Number.isFinite(coords.lat) &&
                typeof coords.lon === 'number' &&
                Number.isFinite(coords.lon)
            );
        }

        function clearActivityMarker() {
            if (activityMarker) {
                map.removeLayer(activityMarker);
                activityMarker = null;
            }
        }

        function renderUserLocation(lat, lon) {
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                return;
            }
            const point = [lat, lon];
            const icon = L.divIcon({
                className: 'UserLocationIcon',
                html: '<div class="UserLocationMarker"><span class="UserLocationMarker__label">Your current location</span><span class="UserLocationMarker__dot"></span></div>',
                iconSize: [170, 80],
                iconAnchor: [85, 80],
            });
            if (userLocationMarker) {
                userLocationLayer.removeLayer(userLocationMarker);
            }
            userLocationMarker = L.marker(point, { icon, interactive: false }).addTo(userLocationLayer);
            if (userLocationCircle) {
                userLocationLayer.removeLayer(userLocationCircle);
            }
            userLocationCircle = L.circle(point, {
                radius: 150,
                color: '#ff3b30',
                weight: 1,
                fillColor: '#ff3b30',
                fillOpacity: 0.08,
                opacity: 0.6,
            }).addTo(userLocationLayer);
        }

        function requestUserLocation() {
            if (typeof navigator === 'undefined' || !navigator.geolocation) {
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    renderUserLocation(position.coords.latitude, position.coords.longitude);
                },
                (error) => {
                    console.warn('Unable to retrieve user location', error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 300000,
                }
            );
        }

        function focusAtCoordinates(lat, lon, label) {
            const point = [lat, lon];
            map.flyTo(point, 15, { duration: 0.8 });
            if (!activityMarker) {
                activityMarker = L.marker(point, { riseOnHover: true }).addTo(map);
            } else {
                activityMarker.setLatLng(point);
            }

            const safeLabel = escapeHtml(label || 'Selected spot');
            activityMarker.bindPopup(
                `<div class="PopupContent PopupContent--popup"><div class="PopupContent__name">${safeLabel}</div></div>`
            );
            activityMarker.openPopup();

            if (statusEl) {
                statusEl.textContent = 'Showing: ' + (label || 'Selected spot');
            }
        }

        function normalizeQuery(value) {
            return value
                .replace(/\u00A0/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function stripParenthetical(value) {
            return value.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
        }

        function buildQueryVariants(value) {
            const variants = [];
            if (!value) {
                return variants;
            }
            const trimmed = normalizeQuery(String(value));
            if (!trimmed) {
                return variants;
            }
            variants.push(trimmed);
            const withoutParens = stripParenthetical(trimmed);
            if (withoutParens && withoutParens !== trimmed) {
                variants.push(withoutParens);
            }
            const parsed = parseDisplayName(trimmed);
            if (parsed.displayName && parsed.displayName !== trimmed) {
                variants.push(parsed.displayName);
            }
            if (parsed.name) {
                variants.push(parsed.name);
            }
            if (parsed.address) {
                variants.push(parsed.address);
                if (parsed.name) {
                    variants.push(`${parsed.name}, ${parsed.address}`);
                }
            }
            return variants;
        }

        function collectEntryQueries(entry) {
            const candidates = new Set();
            buildQueryVariants(entry?.locationDisplay).forEach((variant) => candidates.add(variant));
            buildQueryVariants(entry?.place).forEach((variant) => candidates.add(variant));
            return Array.from(candidates).filter(Boolean);
        }

        async function resolveCoordinatesForQuery(rawQuery) {
            const query = (rawQuery || '').trim();
            if (!query) {
                return null;
            }
            const cacheKey = query.toLowerCase();
            if (coordinateCache.has(cacheKey)) {
                return coordinateCache.get(cacheKey);
            }
            if (pendingCoordinateLookups.has(cacheKey)) {
                return pendingCoordinateLookups.get(cacheKey);
            }
            const lookupPromise = (async () => {
                try {
                    const [match] = await fetchPlaces(query, {
                        limit: 1,
                        minLength: 1,
                        enforceMinLength: false,
                    });
                    if (!match) {
                        return null;
                    }
                    const lat = Number(match.lat);
                    const lon = Number(match.lon);
                    if (Number.isNaN(lat) || Number.isNaN(lon)) {
                        return null;
                    }
                    const coords = { lat, lon };
                    coordinateCache.set(cacheKey, coords);
                    return coords;
                } catch (err) {
                    console.error('Failed to resolve entry location', err);
                    return null;
                } finally {
                    pendingCoordinateLookups.delete(cacheKey);
                }
            })();
            pendingCoordinateLookups.set(cacheKey, lookupPromise);
            return lookupPromise;
        }

        async function ensureEntryCoordinates(entry) {
            if (!entry) {
                return null;
            }

            if (hasCoordinates(entry.coordinates)) {
                return entry.coordinates;
            }

            const queries = collectEntryQueries(entry);

            for (const query of queries) {
                const coords = await resolveCoordinatesForQuery(query);
                if (coords) {
                    entry.coordinates = coords;
                    return coords;
                }
            }

            return null;
        }

        async function resolveAndFocusEntry(entry) {
            if (!entry) {
                return;
            }

            const coords = await ensureEntryCoordinates(entry);
            if (!coords) {
                return;
            }
            focusAtCoordinates(coords.lat, coords.lon, entry.place || entry.locationDisplay);
        }

        function flushQueuedFocusRequests() {
            if (!activityFocusQueue.length) {
                return;
            }
            while (activityFocusQueue.length) {
                const queued = activityFocusQueue.shift();
                resolveAndFocusEntry(queued);
            }
        }

        function attemptPinsRefresh() {
            if (!mapReady) {
                pendingPinsRefresh = true;
                return;
            }
            if (pinsRenderPromise) {
                pendingPinsRefresh = true;
                return;
            }

            const entriesSnapshot = Array.isArray(capturedEntries) ? capturedEntries.slice() : [];
            if (!entriesSnapshot.length) {
                entryPinsLayer.clearLayers();
                pinsBounds = null;
                if (pendingShowAll) {
                    runPendingShowAll();
                }
                pendingPinsRefresh = false;
                return;
            }

            pendingPinsRefresh = false;
            pinsRenderPromise = (async () => {
                entryPinsLayer.clearLayers();
                pinsBounds = null;
                const markers = [];
                const coordsList = await Promise.all(entriesSnapshot.map((entry) => ensureEntryCoordinates(entry)));
                coordsList.forEach((coords, index) => {
                    if (!coords) {
                        return;
                    }
                    const entry = entriesSnapshot[index];
                    const safeLabel = escapeHtml(entry.place || entry.locationDisplay || 'Captured spot');
                    const marker = L.circleMarker([coords.lat, coords.lon], {
                        radius: 7,
                        color: '#10C1FF',
                        weight: 2,
                        fillColor: '#ffffff',
                        fillOpacity: 1,
                        bubblingMouseEvents: false,
                    });
                    marker.bindPopup(
                        `<div class="PopupContent PopupContent--popup"><div class="PopupContent__name">${safeLabel}</div></div>`
                    );
                    marker.on('click', () => {
                        window.dispatchEvent(
                            new CustomEvent('activity:select-entry', {
                                detail: { entryId: entry.id, source: 'map-pin' },
                            })
                        );
                    });
                    entryPinsLayer.addLayer(marker);
                    markers.push(marker);
                });
                if (markers.length) {
                    pinsBounds = L.featureGroup(markers).getBounds();
                } else {
                    pinsBounds = null;
                }
            })().catch((error) => {
                console.error('Failed to render captured spots on the map', error);
            }).finally(() => {
                pinsRenderPromise = null;
                if (pendingPinsRefresh) {
                    attemptPinsRefresh();
                    return;
                }
                if (pendingShowAll) {
                    runPendingShowAll();
                }
            });
        }

        function runPendingShowAll() {
            if (!pendingShowAll || !mapReady || pinsRenderPromise) {
                return;
            }
            pendingShowAll = false;
            clearActivityMarker();
            if (pinsBounds) {
                map.fitBounds(pinsBounds.pad(0.2), { maxZoom: 16 });
                if (statusEl) {
                    statusEl.textContent = 'Showing: all captured spots';
                }
            } else {
                map.setView(GREENVILLE_CENTER, 13);
                if (statusEl) {
                    statusEl.textContent = 'Centered on ' + DEFAULT_PLACE.display_name;
                }
            }
        }

        mapBridge.focusOnEntry = (entry) => {
            if (!entry) {
                return;
            }
            if (!mapReady) {
                activityFocusQueue.push(entry);
                return;
            }
            resolveAndFocusEntry(entry);
        };

        mapBridge.setCapturedEntries = (entries = []) => {
            capturedEntries = Array.isArray(entries) ? entries : [];
            pendingPinsRefresh = true;
            if (mapReady && !pinsRenderPromise) {
                attemptPinsRefresh();
            }
        };

        mapBridge.showAllEntries = () => {
            pendingShowAll = true;
            if (!mapReady) {
                return;
            }
            if (pendingPinsRefresh) {
                attemptPinsRefresh();
                return;
            }
            if (pinsRenderPromise) {
                return;
            }
            runPendingShowAll();
        };

        flushQueuedMapCommands();

        const searchForm = document.querySelector('.TopBar_Search');
        const inputEl = searchForm ? searchForm.querySelector('input[type="search"]') : null;
        const suggestionsEl = document.getElementById('suggestions');
        const searchFormattedEl = document.getElementById('search-formatted');

        if (!searchForm || !inputEl || !suggestionsEl) {
            return;
        }

        if (!suggestionsEl.getAttribute('role')) {
            suggestionsEl.setAttribute('role', 'listbox');
        }
        suggestionsEl.setAttribute('aria-expanded', 'false');

        let suggestTimeout = null;

        function setSearchPreviewContent(html) {
            if (!searchFormattedEl) {
                return;
            }

            const fieldEl = searchFormattedEl.closest('.TopBar_SearchField');
            if (!html) {
                searchFormattedEl.innerHTML = '';
                searchFormattedEl.hidden = true;
                if (fieldEl) {
                    fieldEl.style.setProperty('--search-preview-height', '0px');
                }
                return;
            }

            searchFormattedEl.innerHTML = html;
            searchFormattedEl.hidden = false;

            const height = searchFormattedEl.offsetHeight;
            if (fieldEl) {
                fieldEl.style.setProperty('--search-preview-height', `${height}px`);
            }
        }

        function updateSearchPreview(value) {
            const html = buildPreviewMarkup(value);
            setSearchPreviewContent(html);
        }

        function clearSearchPreview() {
            setSearchPreviewContent('');
        }

        function applyPlaceToInput(place) {
            const parsed = parseDisplayName(place);
            const value = parsed.name || parsed.displayName || '';
            if (inputEl) {
                inputEl.value = value;
            }
            clearSearchPreview();
        }

        function clearSuggestions() {
            suggestionsEl.style.display = 'none';
            suggestionsEl.setAttribute('aria-expanded', 'false');
            suggestionsEl.innerHTML = '';
        }

        updateSearchPreview(inputEl.value);

        function goToPlace(place) {
            const lat = parseFloat(place.lat);
            const lon = parseFloat(place.lon);

            if (Number.isNaN(lat) || Number.isNaN(lon)) {
                return;
            }

            map.setView([lat, lon], 15);

            if (currentMarker) {
                map.removeLayer(currentMarker);
            }

            currentMarker = L.marker([lat, lon]).addTo(map);
            currentMarker.bindPopup(buildPopupContent(place)).openPopup();

            if (statusEl) {
                const label = place && place.display_name ? place.display_name : 'Selected location';
                statusEl.textContent = 'Showing: ' + label;
            }

            applyPlaceToInput(place);
        }

        async function searchLocation(query) {
            if (!query) {
                updateSearchPreview('');
                return;
            }

            const submitButton = searchForm.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
            }
            if (statusEl) {
                statusEl.textContent = 'Searching...';
            }
            updateSearchPreview(query);

            try {
                const results = await fetchPlaces(query, {
                    limit: 1,
                    minLength: 1,
                    enforceMinLength: false,
                });

                if (!results || results.length === 0) {
                    if (statusEl) {
                        statusEl.textContent = 'No results found for: ' + query;
                    }
                    return;
                }

                const place = results[0];
                goToPlace(place);
            } catch (err) {
                console.error(err);
                if (statusEl) {
                    statusEl.textContent = 'Something went wrong while searching. Try again.';
                }
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                }
            }
        }

        async function fetchSuggestions(query) {
            if (!query || query.length < 3) {
                clearSuggestions();
                return;
            }

            try {
                const results = await fetchPlaces(query, { limit: 5 });

                if (!results || results.length === 0) {
                    clearSuggestions();
                    return;
                }

                suggestionsEl.innerHTML = '';
                suggestionsEl.scrollTop = 0;
                results.forEach((place) => {
                    const li = document.createElement('li');
                    li.innerHTML = buildSuggestionMarkup(place);
                    li.tabIndex = 0;
                    li.setAttribute('role', 'option');
                    li.addEventListener('click', () => {
                        clearSuggestions();
                        goToPlace(place);
                    });
                    li.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            li.click();
                        }
                    });
                    suggestionsEl.appendChild(li);
                });

                suggestionsEl.style.display = 'block';
                suggestionsEl.setAttribute('aria-expanded', 'true');
            } catch (err) {
                console.error(err);
                clearSuggestions();
            }
        }

        function setupModalLocationAutocomplete() {
            const modalLocationInput = document.querySelector('#new-entry-modal input[name="location"]');
            const modalSuggestionsEl = document.getElementById('modal-location-suggestions');
            const locationWrapper = document.querySelector('.LocationAutocomplete');

            if (!modalLocationInput || !modalSuggestionsEl || !locationWrapper) {
                return;
            }

            let modalSuggestTimeout = null;

            if (!modalSuggestionsEl.getAttribute('role')) {
                modalSuggestionsEl.setAttribute('role', 'listbox');
            }
            modalSuggestionsEl.setAttribute('aria-expanded', 'false');

            function clearModalSuggestions() {
                modalSuggestionsEl.style.display = 'none';
                modalSuggestionsEl.setAttribute('aria-expanded', 'false');
                modalSuggestionsEl.innerHTML = '';
            }

            async function populateModalSuggestions(query) {
                if (!query || query.length < 3) {
                    clearModalSuggestions();
                    return;
                }

                try {
                    const results = await fetchPlaces(query, { limit: 5 });

                    if (!results || results.length === 0) {
                        clearModalSuggestions();
                        return;
                    }

                    modalSuggestionsEl.innerHTML = '';
                    results.forEach((place) => {
                        const li = document.createElement('li');
                        li.innerHTML = buildSuggestionMarkup(place);
                        li.tabIndex = 0;
                        li.setAttribute('role', 'option');
                        li.addEventListener('click', () => {
                            const { name } = parseDisplayName(place);
                            modalLocationInput.value = name || place.display_name || '';
                            modalLocationInput.dataset.lat = place.lat;
                            modalLocationInput.dataset.lon = place.lon;
                            modalLocationInput.dataset.displayName = place.display_name;
                            modalLocationInput.dataset.placeName = modalLocationInput.value;
                            clearModalSuggestions();
                        });
                        li.addEventListener('keydown', (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                li.click();
                            }
                        });
                        modalSuggestionsEl.appendChild(li);
                    });

                    modalSuggestionsEl.style.display = 'block';
                    modalSuggestionsEl.setAttribute('aria-expanded', 'true');
                } catch (err) {
                    console.error(err);
                    clearModalSuggestions();
                }
            }

            modalLocationInput.addEventListener('input', () => {
                delete modalLocationInput.dataset.lat;
                delete modalLocationInput.dataset.lon;
                delete modalLocationInput.dataset.displayName;
                delete modalLocationInput.dataset.placeName;

                const query = modalLocationInput.value.trim();

                if (modalSuggestTimeout) {
                    clearTimeout(modalSuggestTimeout);
                }

                modalSuggestTimeout = setTimeout(() => {
                    populateModalSuggestions(query);
                }, 300);
            });

            document.addEventListener('click', (event) => {
                if (!event.target.closest('.LocationAutocomplete')) {
                    clearModalSuggestions();
                }
            });
        }

        searchForm.addEventListener('submit', (event) => {
            event.preventDefault();
            clearSuggestions();
            searchLocation(inputEl.value.trim());
        });

        inputEl.addEventListener('input', () => {
            updateSearchPreview(inputEl.value);
            const query = inputEl.value.trim();

            if (suggestTimeout) {
                clearTimeout(suggestTimeout);
            }

            suggestTimeout = setTimeout(() => {
                fetchSuggestions(query);
            }, 300);
        });

        document.addEventListener('click', (event) => {
            if (!event.target.closest('.TopBar_Search')) {
                clearSuggestions();
            }
        });

        setupModalLocationAutocomplete();
    }

    if (document.readyState === 'complete') {
        initializeMap();
    } else {
        window.addEventListener('load', initializeMap, { once: true });
    }
}());
