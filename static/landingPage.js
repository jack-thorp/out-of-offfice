//current standard place and placekey are both a locations address
//displayName is the real name of the location
//probably needs to be cleaned up

// Creating arrays to store items during site run
window.__activityFocusQueue = window.__activityFocusQueue || [];
window.__mapActionQueue = window.__mapActionQueue || [];
window.appMap = window.appMap || {};
var map;

// queueMapCommand holds map requests until the map script is ready to run them.
function queueMapCommand(method, args) {
    window.__mapActionQueue.push({ method, args });
}
if (typeof window.appMap.focusOnEntry !== 'function') {
    window.appMap.focusOnEntry = (entry) => {
        // if given an entry, add to list of entires to add to list
        if (entry) {
            window.__activityFocusQueue.push(entry);
        }
    };
}
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

//constants
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
    "'": '&#39;'
}



const VIBES = {
    'Lock In (Deep Focus)': '#10C1FF',
    'Creative Coding Environment': '#5f80ff',
    'Social Brainstorm Jam': '#ff87d7',
    'Unproductive': '#ffb347',
    'Relaxing/Zen (Quiet)': '#4cd33dff',
    'High Energy (Noisy)': '#f72428ff'
};

//populat vibes into drop down 
var select = document.querySelector('select[name="vibeCategory"]');
Object.keys(VIBES).forEach(function (label) {
    var opt = document.createElement("option");
    opt.value = label;
    opt.textContent = label;
    select.appendChild(opt);
});



var currentMarker = null;
var activityMarker;
var mapContainer = null;
var statusEl = null;

var body = document.body;
var modal = document.getElementById('new-entry-modal');
var openButton = document.querySelector('[data-action="open-modal"]');
var closeElements = modal.querySelectorAll('[data-modal-close]');
var form = modal.querySelector('form');

//FILL THIS IN WHEN WE CAN GET USER NAME
function getName() {
    return 'My Name';
}

// opens the new entry modal
function openModal(formDefs = false) {



    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    body.classList.add('modal-open');
    //fill in values automatically
    if (formDefs) {
        //form.querySelector('input[name="name"]').value = formDefs.name;
        let loc = form.querySelector('input[name="location"]');
        loc.value = formDefs.location;
        loc.dataset.address = formDefs.address;
        loc.dataset.displayName = formDefs.location;
        loc.dataset.lat = formDefs.lat;
        loc.dataset.lon = formDefs.lon;
    }
    form.querySelector('input[name="name"]').placeholder = getName();
}

// closes new entry modal
function closeModal() {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    body.classList.remove('modal-open');
    if (form) {
        form.reset();
    }
}

//changed to prevent default args from flowing
openButton.addEventListener('click', () => openModal());

closeElements.forEach((el) => el.addEventListener('click', closeModal));

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.hidden === false) {
        closeModal();
    }
});




// Rating star display updater
(function () {
    // get new entry popup modal
    var modal = document.getElementById('new-entry-modal');
    if (!modal) {
        return;
    }

    var ratingInputs = modal.querySelectorAll('input[name="rating"]');
    var display = modal.querySelector('[data-rating-display]');
    var errorEl = modal.querySelector('[data-rating-error]');
    var starGroup = modal.querySelector('.StarRating');

    // display warning if no rating is selected
    var setInvalidState = (isInvalid) => {
        if (errorEl) {
            errorEl.hidden = !isInvalid;
        }
        if (starGroup) {
            starGroup.classList.toggle('StarRating--invalid', isInvalid);
            starGroup.setAttribute('aria-invalid', isInvalid ? 'true' : 'false');
        }
    };

    // display the number rating next to stars (x/5)
    var updateValue = () => {
        var checked = modal.querySelector('input[name="rating"]:checked');
        display.textContent = checked ? checked.value : '0';
        if (checked) {
            setInvalidState(false);
        }
    };

    // handles whenever change to stars, ensure the x/5 updated appropriately
    ratingInputs.forEach((input) => {
        input.addEventListener('change', updateValue);
        input.addEventListener('input', updateValue);
    });

    var form = modal.querySelector('form');
    if (form) {
        form.addEventListener('submit', (event) => {
            var checked = modal.querySelector('input[name="rating"]:checked');
            if (!checked) {
                // handle requiring star selection!
                event.preventDefault();
                setInvalidState(true);
                if (ratingInputs.length) {
                    ratingInputs[ratingInputs.length - 1].focus();
                }
            } else {
                setInvalidState(false);
            }
        });
        // when the form is reset, clear display to "normal" state
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
    // grab activity container in DOM
    var activityListEl = document.querySelector('[data-activity-list]');
    var filterButtons = Array.from(document.querySelectorAll('.ActivityFilter[data-filter]'));

    var mapBridge = window.appMap || (window.appMap = {});
    var modal = document.getElementById('new-entry-modal');
    var form = modal ? modal.querySelector('form') : null;
    var body = document.body;

    // -------- Spot Summary panel --------
    var summaryEl = document.querySelector('[data-activity-summary]');
    var summaryPlaceholder = summaryEl ? summaryEl.querySelector('[data-summary-placeholder]') : null;
    var summaryContent = summaryEl ? summaryEl.querySelector('[data-summary-content]') : null;
    var summaryTitle = summaryEl ? summaryEl.querySelector('[data-summary-title]') : null;
    var summaryLocation = summaryEl ? summaryEl.querySelector('[data-summary-location]') : null;
    var summaryRating = summaryEl ? summaryEl.querySelector('[data-summary-rating]') : null;
    var summaryCount = summaryEl ? summaryEl.querySelector('[data-summary-count]') : null;
    var summaryRecent = summaryEl ? summaryEl.querySelector('[data-summary-recent]') : null;
    var summaryChart = summaryEl ? summaryEl.querySelector('[data-summary-chart]') : null;
    // double checking everything is in UI (used later before function logic)
    var hasSummaryUI = Boolean(
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
    // -------- Activity List panel --------
    var activityConsole = document.querySelector('[data-activity-console]');
    var viewToggleButtons = activityConsole ? Array.from(activityConsole.querySelectorAll('[data-view-target]')) : [];
    var listFace = activityConsole ? activityConsole.querySelector('.ActivityConsole__face--list') : null;
    var summaryFace = activityConsole ? activityConsole.querySelector('.ActivityConsole__face--summary') : null;

    // handle if no records in DB
    var emptyStateTemplate = activityListEl.querySelector('[data-empty-state]');
    if (emptyStateTemplate) {
        emptyStateTemplate.remove();
    }



    // Defining Sorting Rules Based on Selected View
    var FILTER_SORTERS = {
        // Recent Activity
        recent: (a, b) => b.createdAt - a.createdAt,
        // Top Ranked
        top: (a, b) => {
            if (b.rating === a.rating) {
                return b.createdAt - a.createdAt;
            }
            return b.rating - a.rating;
        },
        // Most Visited
        visited: (a, b) => {
            if (b.visits === a.visits) {
                return b.createdAt - a.createdAt;
            }
            return b.visits - a.visits;
        },
    };

    // Hold all activities and UI selection(s)
    var activityState = {
        entries: [],
        selectedId: null,
        filter: 'recent',
        view: 'list',
    };
    var dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

    // syncMapEntries shares our current entries with the map widget.
    function syncMapEntries() {
        if (typeof mapBridge.setCapturedEntries === 'function') {
            mapBridge.setCapturedEntries(activityState.entries);
        }
    }

    // resetMapToAllEntries tells the map to zoom back out to everything
    function resetMapToAllEntries() {
        if (typeof mapBridge.showAllEntries === 'function') {
            mapBridge.showAllEntries();
        }
    }

    // normalizeKey builds a simple lowercase key so duplicates match up
    function normalizeKey(value) {
        return (value || '').toString().trim().toLowerCase();
    }

    // formatRating keeps the rating text tidy (no “4.0” style tails)
    function formatRating(value) {
        return Number(value || 0).toFixed(1).replace(/\.0$/, '');
    }

    // formatDate turns timestamps into the "Nov 8” labels on the cards
    function formatDate(value) {
        if (!value) {
            return '';
        }
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        return dateFormatter.format(date);
    }

    // truncate long strings so they don’t overflow the layout
    function truncate(text, maxLength = 1000) {
        if (!text) {
            return '';
        }
        if (text.length <= maxLength) {
            return text;
        }
        return `${text.slice(0, maxLength - 3).trim()}...`;
    }

    // keep the UI from switching to a summary view that doesn’t exist
    function resolveView(nextView) {
        if (nextView === 'summary' && !hasSummaryUI) {
            return 'list';
        }
        return nextView === 'summary' ? 'summary' : 'list';
    }

    // keep the toggle buttons in sync
    function syncViewToggle() {
        if (!activityConsole) {
            return;
        }
        var currentView = resolveView(activityState.view);
        activityState.view = currentView;
        activityConsole.dataset.view = currentView;
        viewToggleButtons.forEach((button) => {
            var isActive = button.dataset.viewTarget === currentView;
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
        var resolved = resolveView(nextView);
        var previousView = activityState.view;
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
                var targetView = event.key === 'ArrowLeft' ? 'list' : 'summary';
                setConsoleView(targetView);
                var focusTarget = viewToggleButtons.find((el) => el.dataset.viewTarget === activityState.view);
                if (focusTarget) {
                    focusTarget.focus();
                }
            });
        });
        syncViewToggle();
    }

    // clearLocationDatasets erases any caches latitude and longitude
    function clearLocationDatasets() {
        if (!form) {
            return;
        }
        var locationInput = form.querySelector('input[name="location"]');
        if (locationInput) {
            delete locationInput.dataset.lat;
            delete locationInput.dataset.lon;
            delete locationInput.dataset.displayName;
            delete locationInput.dataset.address;
        }
    }

    // helps form new entry
    function buildEntryFromForm() {
        if (!form) {
            return null;
        }

        var formData = new FormData(form);
        var locationInput = form.querySelector('input[name="location"]');
        var ratingInput = form.querySelector('input[name="rating"]:checked');

        var nameValue = (formData.get('name') || '').toString().trim();
        var vibeValue = (formData.get('vibeCategory') || '').toString().trim();
        var commentsValue = (formData.get('comments') || '').toString().trim();
        var locationValue = (formData.get('location') || '').toString().trim();
        var ratingValue = ratingInput ? Number(ratingInput.value) : 0;
        var datasetPlace = locationInput?.dataset.displayName || '';
        var datasetAddress = locationInput?.dataset.address || '';
        var placea = (datasetAddress || 'Untitled Spot').trim();
        var locationDisplay = (locationValue || 'Location TBD').trim();

        return {
            id: `entry-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            place: placea,
            placeKey: normalizeKey(placea),
            name: nameValue,
            vibe: vibeValue,
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

    // getEntriesForFilter figures out which entries should appear
    function getEntriesForFilter() {
        if (activityState.filter === 'recent') {
            return activityState.entries;
        }
        var byPlace = new Map();
        activityState.entries.forEach((entry) => {
            var key = entry.placeKey;
            if (!key) return;

            let stats = byPlace.get(key);
            if (!stats) {
                stats = {
                    latestEntry: null,
                    totalVisits: 0,
                    totalRating: 0,
                    entryCount: 0
                };
                byPlace.set(key, stats);
            }
            var visits = Number(entry.visits) || 0;
            stats.totalVisits += visits;
            var rating = Number(entry.rating) || 0;
            stats.totalRating += rating;
            stats.entryCount += 1;
            if (!stats.latestEntry || entry.createdAt > stats.latestEntry.createdAt) {
                stats.latestEntry = entry;
            }
        });

        var rolledUp = [];
        byPlace.forEach((stats, key) => {
            var base = stats.latestEntry;
            var avgRating =
                stats.entryCount > 0 ? stats.totalRating / stats.entryCount : 0;
            rolledUp.push({
                ...base,
                placeKey: key,
                rating: avgRating,
                visits: stats.totalVisits,
                entryCount: stats.entryCount,
                avgRating: avgRating
            });
        });

        return rolledUp;
    }


    // getSortedEntries applies sorting rules
    function getSortedEntries() {
        var baseEntries = getEntriesForFilter();
        var sorter = FILTER_SORTERS[activityState.filter] || FILTER_SORTERS.recent;
        return [...baseEntries].sort(sorter);
    }

    // grabs places in view
    function getEntriesForPlace(entryOrKey) {
        var key =
            typeof entryOrKey === 'string'
                ? normalizeKey(entryOrKey)
                : normalizeKey(entryOrKey?.placeKey ? entryOrKey.placeKey : entryOrKey?.place);
        if (!key) {
            return [];
        }
        return activityState.entries.filter((item) => item.placeKey === key);
    }

    // rebuilds left panel UI for what data we got
    function renderList() {
        var entries = getSortedEntries();
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
            var listItem = document.createElement('li');
            listItem.className = 'ActivityCard';
            listItem.dataset.entryId = entry.id;

            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'ActivityCard__button';

            var flip = document.createElement('div');
            flip.className = 'ActivityCard__flip';

            var front = document.createElement('div');
            front.className = 'ActivityCard__face ActivityCard__face--front';

            var placeEl = document.createElement('span');
            placeEl.className = 'ActivityCard__place';
            placeEl.textContent = entry.locationDisplay;

            var metaEl = document.createElement('div');
            metaEl.className = 'ActivityCard__meta';

            //hi jack doubling this as total visits on other tabs
            var personEl = document.createElement('span');
            personEl.className = 'ActivityCard__person';
            var nameEl = document.createElement('span');
            if (activityState.filter === 'recent') {
                nameEl.textContent = entry.name;
            } else {
                nameEl.textContent = 'Visits: ' + entry.visits;
            }



            var ratingEl = document.createElement('span');
            ratingEl.className = 'ActivityCard__rating';
            ratingEl.textContent = formatRating(entry.rating);

            personEl.append(nameEl, ratingEl);

            var dateEl = document.createElement('time');
            dateEl.className = 'ActivityCard__date';
            var formattedDate = formatDate(entry.createdAt);
            dateEl.textContent = formattedDate || 'Just now';
            if (entry.createdAt) {
                dateEl.dateTime = new Date(entry.createdAt).toISOString();
            }

            metaEl.append(personEl, dateEl);

            var vibeChip = document.createElement('span');
            vibeChip.className = 'ActivityCard__vibe';
            vibeChip.textContent = entry.vibe;

            front.append(placeEl, metaEl, vibeChip);

            var back = document.createElement('div');
            back.className = 'ActivityCard__face ActivityCard__face--back';

            var backLabel = document.createElement('span');
            backLabel.className = 'ActivityCard__backLabel';
            backLabel.textContent = 'Latest thought';

            var backComment = document.createElement('p');
            backComment.className = 'ActivityCard__comment';
            backComment.textContent = truncate(entry.comments || 'No comments added yet.', 120);

            var backRating = document.createElement('div');
            backRating.className = 'ActivityCard__backRating';
            backRating.textContent = formatRating(entry.rating);
            var backRatingSuffix = document.createElement('span');
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
            var emptyItem = document.createElement('li');
            emptyItem.className = 'ActivitySummary__recentEmpty';
            emptyItem.textContent = 'No sessions logged yet.';
            summaryRecent.appendChild(emptyItem);
            return;
        }

        var recent = [...entriesForPlace]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 3);
        recent.forEach((item) => {
            var li = document.createElement('li');
            li.className = 'ActivitySummary__recentItem';

            var topRow = document.createElement('div');
            topRow.className = 'ActivitySummary__recentTop';
            var nameSpan = document.createElement('span');
            nameSpan.textContent = item.name;
            var ratingSpan = document.createElement('span');
            ratingSpan.className = 'ActivitySummary__recentRating';
            ratingSpan.textContent = `★ ${formatRating(item.rating)}`;
            topRow.append(nameSpan, ratingSpan);

            var dateEl = document.createElement('time');
            dateEl.className = 'ActivitySummary__recentDate';
            var recentDate = formatDate(item.createdAt);
            dateEl.textContent = recentDate || 'Just now';
            if (item.createdAt) {
                dateEl.dateTime = new Date(item.createdAt).toISOString();
            }

            var meta = document.createElement('div');
            meta.className = 'ActivitySummary__recentMeta';
            meta.textContent = item.vibe || 'Vibe TBD';

            var comment = document.createElement('p');
            comment.className = 'ActivitySummary__recentComment';
            comment.textContent = item.comments ? truncate(item.comments, 1000) : 'No comments yet.';

            li.append(topRow, dateEl, meta, comment);
            summaryRecent.appendChild(li);
        });
    }

    // Builds Vibe Breakdown Chart
    function renderVibeChart(entriesForPlace) {
        if (!summaryChart) {
            return;
        }

        // clear anything previously
        summaryChart.innerHTML = '';

        if (!entriesForPlace.length) {
            var emptyMessage = document.createElement('p');
            emptyMessage.className = 'ActivitySummary__chartEmpty';
            emptyMessage.textContent = 'Add another entry to unlock the vibe breakdown.';
            summaryChart.appendChild(emptyMessage);
            return;
        }
        // count how many times each vibe shows up
        var counts = new Map();
        entriesForPlace.forEach((entry) => {
            var key = entry.vibe || 'Vibe TBD';
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        var total = entriesForPlace.length || 1;



        var vibesToRender = Object.keys(VIBES);

        vibesToRender.forEach((vibe) => {
            var value = counts.get(vibe) || 0;
            if (value === 0) {
                return;
            }
            var percentage = Math.round((value / total) * 100);

            var row = document.createElement('div');
            row.className = 'ActivitySummary__chartRow';

            var label = document.createElement('span');
            label.className = 'ActivitySummary__chartLabel';
            label.textContent = vibe;

            var bar = document.createElement('div');
            bar.className = 'ActivitySummary__chartBar';

            var fill = document.createElement('div');
            fill.className = 'ActivitySummary__chartFill';
            fill.style.width = `${percentage}%`;
            fill.style.background = VIBES[vibe] || '#10C1FF';

            bar.appendChild(fill);
            row.append(label, bar);
            summaryChart.appendChild(row);
        });

        if (!summaryChart.children.length) {
            var emptyMessage = document.createElement('p');
            emptyMessage.className = 'ActivitySummary__chartEmpty';
            emptyMessage.textContent = 'No vibe data yet.';
            summaryChart.appendChild(emptyMessage);
        }
    }

    // renderSummary fills the right column card (or shows the empty state) for a spot.
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

        summaryTitle.textContent = entry.locationDisplay;
        summaryLocation.textContent = entry.place || 'Location TBD';

        let related = getEntriesForPlace(entry);
        // get avg. rating for spot
        let ratingTotal = related.reduce((sum, item) => sum + (Number(item.rating) || 0), 0);
        let average = related.length ? ratingTotal / related.length : entry.rating || 0;

        summaryRating.textContent = `${formatRating(average)}/5`;
        summaryCount.textContent = related.length.toString();

        renderRecentActivity(related);
        renderVibeChart(related);
    }

    // focusMapOnEntry forwards the selected item to the Leaflet map.
    function focusMapOnEntry(entry) {
        if (!entry || typeof mapBridge.focusOnEntry !== 'function') {
            return;
        }
        mapBridge.focusOnEntry(entry);
    }

    // selectEntry is our shared handler for picking a card, whether from list or map.
    function selectEntry(entryId, options = {}) {
        debugger;
        var entry = activityState.entries.find((item) => item.id === entryId);
        if (!entry) {
            return;
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

    // highlights whatever filter we have selected
    function syncFilterButtons() {
        filterButtons.forEach((button) => {
            var isActive = button.dataset.filter === activityState.filter;
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
        var hasSelected = entries.some((entry) => entry.id === activityState.selectedId);
        if (hasSelected) {
            return;
        }
        var activeEntry = activityState.entries.find((item) => item.id === activityState.selectedId);
        if (activeEntry) {
            var replacement = entries.find((entry) => entry.placeKey === activeEntry.placeKey);
            if (replacement) {
                activityState.selectedId = replacement.id;
                return;
            }
        }
        activityState.selectedId = entries[0].id;
    }

    // applyFilter flips the active filter tab
    function applyFilter(nextFilter, options = {}) {
        if (!nextFilter || nextFilter === activityState.filter) {
            return;
        }
        let shouldFocusMap = options.focusMap !== false;
        activityState.filter = nextFilter;
        syncFilterButtons();
        // get entry before sorting
        let sorted = getSortedEntries();
        syncSelectedIdForFilter(sorted);

        // rebuild the left-hand
        renderList();
        if (activityState.selectedId) {
            let selectedEntry = activityState.entries.find((item) => item.id === activityState.selectedId);
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

    // hydrateFilters hooks up the filter buttons to the applyFilter helper.
    function hydrateFilters() {
        filterButtons.forEach((button) => {
            button.addEventListener('click', () => {
                applyFilter(button.dataset.filter, { focusMap: false });
            });
        });
        syncFilterButtons();
    }

    // hide's modal if open
    function closeModalIfOpen() {
        debugger;
        if (!modal || modal.hidden === true) {
            return;
        }
        closeModal();
    }


    function handleFormSubmit(event) {
        if (event.defaultPrevented) {
            return;
        }
        event.preventDefault();
        debugger;
        var nextEntry = buildEntryFromForm();
        var payload = {
            ent_userid: nextEntry.name,
            ent_details: nextEntry.comments,
            ent_location: nextEntry.locationDisplay,
            ent_rating: nextEntry.rating,
            ent_vibe: nextEntry.vibe,
            ent_address: nextEntry.place,
            ent_lat: nextEntry.coordinates.lat,
            ent_long: nextEntry.coordinates.lon
        };

        var xhr = new XMLHttpRequest();
        xhr.open("POST", "/addEntry", false);
        xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        xhr.send(JSON.stringify(payload));
        let npk = JSON.parse(xhr.response).pk;

        debugger;

        //activityState.entries.push(nextEntry);
        seedEntries();
        syncMapEntries();
        selectEntry(npk, { incrementVisit: false });
        form.reset();
        clearLocationDatasets();
        closeModalIfOpen();
        map.removeLayer(currentMarker);
    }

    function seedEntries() {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "/getEntries", false);
        xhr.send(null);
        var data = JSON.parse(xhr.responseText) || [];;
        activityState.entries = [];
        data.forEach(function (db) {
            activityState.entries.push({
                id: db.ent_pk,
                place: db.ent_address,
                placeKey: normalizeKey(db.ent_address),
                name: db.ent_userid,
                vibe: db.ent_vibe,
                comments: db.ent_details,
                locationDisplay: db.ent_location,
                rating: db.ent_rating,
                createdAt: db.ent_date * 1000,
                visits: 1,
                coordinates: { lat: db.ent_lat, lon: db.ent_long }
            });
        });
    }

    hydrateViewToggle();
    hydrateFilters();
    seedEntries();
    syncMapEntries();

    if (activityState.entries.length) {
        var initial = getSortedEntries();
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
        debugger;
        //jack add a button here that says "add visit" for when someone visits an existing location?
        var entryId = event?.detail?.entryId;
        if (!entryId) {
            return;
        }
        var entryExists = activityState.entries.some((item) => item.id === entryId);
        if (!entryExists) {
            return;
        }
        selectEntry(entryId, { incrementVisit: false, showSummary: true, focusMap: true });
    }

    window.addEventListener('activity:select-entry', handleMapEntrySelection);
}());

// Map + search logic
(function () {
    var mapBridge = window.appMap || (window.appMap = {});
    var activityFocusQueue = window.__activityFocusQueue || [];
    var mapActionQueue = window.__mapActionQueue || [];

    function flushQueuedMapCommands() {
        if (!mapActionQueue.length) {
            return;
        }
        while (mapActionQueue.length) {
            var action = mapActionQueue.shift();
            if (action && typeof mapBridge[action.method] === 'function') {
                mapBridge[action.method](...(action.args || []));
            }
        }
    }

    if (typeof L === 'undefined') {
        console.warn('Leaflet failed to load; map cannot be initialised.');
        mapBridge.focusOnEntry = () => { };
        mapBridge.setCapturedEntries = () => { };
        mapBridge.showAllEntries = () => { };
        flushQueuedMapCommands();
        return;
    }

    // initializeMap boots Leaflet, wires up helpers, and starts loading tiles.
    function initializeMap() {
        currentMarker = null;
        mapContainer = document.getElementById('map');
        if (!mapContainer) {
            mapBridge.focusOnEntry = () => { };
            mapBridge.setCapturedEntries = () => { };
            mapBridge.showAllEntries = () => { };
            flushQueuedMapCommands();
            return;
        }

        statusEl = document.getElementById('status');


        async function fetchPlaces(query, options = {}) {
            let {
                limit = 5,
                minLength = 3,
                enforceMinLength = true,
            } = options;

            let trimmed = (query ?? '').trim();
            if (!trimmed) {
                return [];
            }

            if (enforceMinLength && trimmed.length < minLength) {
                return [];
            }

            let params = new URLSearchParams({
                format: 'json',
                limit: String(limit),
                bounded: '1',
                viewbox: NOMINATIM_VIEWBOX,
                q: trimmed,
            });

            let response = await fetch(`${NOMINATIM_BASE_URL}?${params.toString()}`);
            if (!response.ok) {
                throw new Error('Suggestion request failed');
            }

            let results = await response.json();
            return Array.isArray(results) ? results : [];
        }

        function escapeHtml(value) {
            let raw = value == null ? '' : String(value);
            return raw.replace(/[&<>"']/g, (char) => HTML_ESCAPE_LOOKUP[char]);
        }

        function parseDisplayName(value) {
            let displayName =
                typeof value === 'string'
                    ? value
                    : value && typeof value.display_name === 'string'
                        ? value.display_name
                        : '';
            let trimmed = displayName.trim();
            if (!trimmed) {
                return { displayName: '', name: '', address: '' };
            }

            let parts = trimmed.split(',');
            let firstPart = parts.shift() || '';
            let name = firstPart.trim() || trimmed;
            let address = parts.join(',').trim();

            return { displayName: trimmed, name, address };
        }


        function buildNameAddressHtml(value, variantClass, withAddBtn = false) {
            let { displayName, name, address } = parseDisplayName(value);
            if (!displayName) {
                return withAddBtn ? null : '';
            }

            var classes = ['PopupContent'];
            if (variantClass) {
                classes.push(variantClass);
            }

            if (!withAddBtn) {
                var nameHtml = escapeHtml(name);
                var addressHtml = escapeHtml(address);

                if (!address) {
                    return `<div class="${classes.join(' ')}">
                        <div class="PopupContent__name">${nameHtml}</div>
                    </div>`;
                }

                return `<div class="${classes.join(' ')}">
                    <div class="PopupContent__name">${nameHtml}</div>
                    <div class="PopupContent__address">${addressHtml}</div>
                </div>`;
            }

            var container = document.createElement('div');
            container.className = classes.join(' ');

            var nameDiv = document.createElement('div');
            nameDiv.className = 'PopupContent__name';
            nameDiv.textContent = name;
            container.appendChild(nameDiv);

            if (address) {
                var addressDiv = document.createElement('div');
                addressDiv.className = 'PopupContent__address';
                addressDiv.textContent = address;
                container.appendChild(addressDiv);
            }

            var btn = document.createElement('button');
            btn.textContent = 'Add';
            btn.classList.add('TopBar_NewEntry');

            if (!address) {

                btn.addEventListener('click', function () {
                    openModal();
                });
            } else {
                btn.addEventListener('click', function () {
                    var usrn = getName();
                    var lat = value && value.lat;
                    var lon = value && value.lon;

                    if (currentMarker && currentMarker._popup) {
                        currentMarker._popup.close();
                    }

                    openModal({
                        lat: String(lat),
                        lon: String(lon),
                        name: usrn,
                        location: name,
                        address: displayName
                    });
                });
            }

            container.appendChild(btn);
            return container;
        }




        function buildPopupContent(place, addable = false) {
            let html = buildNameAddressHtml(place, 'PopupContent--popup', addable);
            if (html) {
                return html;
            }

            return '<div class="PopupContent PopupContent--popup"><div class="PopupContent__name">Selected location</div></div>';
        }

        function buildSuggestionMarkup(place) {
            let html = buildNameAddressHtml(place, 'PopupContent--suggestion', false);
            if (html) {
                return html;
            }

            let parsed = parseDisplayName(place);
            let fallbackName = escapeHtml(parsed.name || parsed.displayName || 'Selected location');
            return `<div class="PopupContent PopupContent--suggestion"><div class="PopupContent__name">${fallbackName}</div></div>`;
        }

        function buildPreviewMarkup(value) {
            return buildNameAddressHtml(value, 'PopupContent--preview', false);
        }

        map = L.map(mapContainer);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);




        //stx dbg test
        // debugger;
        // map.on('click', function (e) {
        //     currentMarker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(map);
        //     currentMarker.bindPopup(buildPopupContent(place, true)).openPopup();
        // });


        var mapReady = false;
        var coordinateCache = new Map();
        var pendingCoordinateLookups = new Map();

        activityMarker = null;
        var entryPinsLayer = L.layerGroup().addTo(map);
        var userLocationLayer = L.layerGroup().addTo(map);
        var userLocationMarker = null;
        var capturedEntries = [];
        var pendingPinsRefresh = false;
        var pinsRenderPromise = null;
        var pinsBounds = null;
        var pendingShowAll = false;

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
            var point = [lat, lon];
            var icon = L.divIcon({
                className: 'UserLocationIcon',
                html: '<div class="UserLocationMarker"><span class="UserLocationMarker__label">Your current location</span><span class="UserLocationMarker__dot"></span></div>',
                iconSize: [170, 80],
                iconAnchor: [85, 80],
            });
            if (userLocationMarker) {
                userLocationLayer.removeLayer(userLocationMarker);
            }
            userLocationMarker = L.marker(point, { icon, interactive: false }).addTo(userLocationLayer);
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

        function focusAtCoordinates(lat, lon, label, address) {
            var point = [lat, lon];
            map.flyTo(point, 15, { duration: 0.8 });

            if (!activityMarker) {
                activityMarker = L.marker(point, { riseOnHover: true }).addTo(map);
            } else {
                activityMarker.setLatLng(point);
            }


            const safeLabel = escapeHtml(label || 'Selected spot');
            const safeAddr = escapeHtml(address || '');

            const container = document.createElement('div');
            container.innerHTML = `<div class="PopupContent__name">${safeLabel}</div><div class="PopupContent__address">${safeAddr}</div>`;

            const btn = document.createElement('button');
            btn.textContent = "Add Visit";
            btn.classList.add('TopBar_NewEntry');

            btn.addEventListener('click', function () {
                activityMarker._popup.close();
                openModal({
                    lat: lat,
                    lon: lon,
                    name: getName(),
                    location: label,
                    address: address
                });
            });

            container.appendChild(btn);

            activityMarker.bindPopup(container);

            activityMarker.openPopup();

            if (statusEl) {
                statusEl.textContent = 'Showing: ' + (label || 'Selected spot');
            }
        }


        function buildGeocodeQueries(entry) {
            var queries = [];
            var pushQuery = (value) => {
                var trimmed = (value || '').toString().trim();
                if (trimmed && !queries.includes(trimmed)) {
                    queries.push(trimmed);
                }
            };

            pushQuery(entry?.locationQuery);
            pushQuery(entry?.locationDisplay);
            pushQuery(entry?.place);

            var parsed = parseDisplayName(entry?.locationDisplay || entry?.place || '');
            pushQuery(parsed.displayName);
            if (parsed.name && parsed.address) {
                pushQuery(`${parsed.name}, ${parsed.address}`);
            }
            pushQuery(parsed.address);
            pushQuery(parsed.name);

            return queries;
        }

        async function ensureEntryCoordinates(entry) {
            if (!entry) {
                return null;
            }

            if (hasCoordinates(entry.coordinates)) {
                return entry.coordinates;
            }

            var queries = buildGeocodeQueries(entry);
            for (var query of queries) {
                var cacheKey = query.toLowerCase();
                if (coordinateCache.has(cacheKey)) {
                    var cached = coordinateCache.get(cacheKey);
                    entry.coordinates = cached;
                    return cached;
                }
                if (pendingCoordinateLookups.has(cacheKey)) {
                    var pending = pendingCoordinateLookups.get(cacheKey);
                    var resolvedPending = await pending;
                    if (resolvedPending) {
                        entry.coordinates = resolvedPending;
                        return resolvedPending;
                    }
                    continue;
                }
                var lookupPromise = (async () => {
                    try {
                        var [match] = await fetchPlaces(query, {
                            limit: 1,
                            minLength: 1,
                            enforceMinLength: false,
                        });
                        if (!match) {
                            return null;
                        }
                        var lat = Number(match.lat);
                        var lon = Number(match.lon);
                        if (Number.isNaN(lat) || Number.isNaN(lon)) {
                            return null;
                        }
                        var coords = { lat, lon };
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
                var resolved = await lookupPromise;
                if (resolved) {
                    entry.coordinates = resolved;
                    return resolved;
                }
            }

            if (hasCoordinates(entry.coordinates)) {
                return entry.coordinates;
            }
            return null;
        }

        async function resolveAndFocusEntry(entry) {
            if (!entry) {
                return;
            }

            var coords = await ensureEntryCoordinates(entry);
            if (!coords) {
                return;
            }
            debugger;
            focusAtCoordinates(coords.lat, coords.lon, entry.locationDisplay, entry.place);
        }

        function flushQueuedFocusRequests() {
            if (!activityFocusQueue.length) {
                return;
            }
            while (activityFocusQueue.length) {
                var queued = activityFocusQueue.shift();
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

            var entriesSnapshot = Array.isArray(capturedEntries) ? capturedEntries.slice() : [];
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
                var markers = [];
                var coordsList = await Promise.all(entriesSnapshot.map((entry) => ensureEntryCoordinates(entry)));
                coordsList.forEach((coords, index) => {
                    if (!coords) {
                        return;
                    }
                    var entry = entriesSnapshot[index];
                    var safeLabel = escapeHtml(entry.locationDisplay || 'Captured spot');
                    var marker = L.circleMarker([coords.lat, coords.lon], {
                        radius: 7,
                        color: '#10C1FF',
                        weight: 2,
                        fillColor: '#ffffff',
                        fillOpacity: 1,
                        bubblingMouseEvents: false,
                    });

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

        var searchForm = document.querySelector('.TopBar_Search');
        var inputEl = searchForm ? searchForm.querySelector('input[type="search"]') : null;
        var suggestionsEl = document.getElementById('suggestions');
        var searchFormattedEl = document.getElementById('search-formatted');

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

            var fieldEl = searchFormattedEl.closest('.TopBar_SearchField');
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

            var height = searchFormattedEl.offsetHeight;
            if (fieldEl) {
                fieldEl.style.setProperty('--search-preview-height', `${height}px`);
            }
        }

        // rebuilds the preview based on the current input text
        function updateSearchPreview(value) {
            var html = buildPreviewMarkup(value);
            setSearchPreviewContent(html);
        }

        // wipes the preview block entirely
        function clearSearchPreview() {
            setSearchPreviewContent('');
        }

        // fills the search field with the nicely formatted place name
        function applyPlaceToInput(place) {
            var parsed = parseDisplayName(place);
            var value = parsed.name || parsed.displayName || '';
            if (inputEl) {
                inputEl.value = value;
            }
            clearSearchPreview();
        }

        // hides the dropdown list and clears out old results
        function clearSuggestions() {
            suggestionsEl.style.display = 'none';
            suggestionsEl.setAttribute('aria-expanded', 'false');
            suggestionsEl.innerHTML = '';
        }

        updateSearchPreview(inputEl.value);

        // centers the map on a search result and drops a marker
        function goToPlace(place) {
            var lat = parseFloat(place.lat);
            var lon = parseFloat(place.lon);

            if (Number.isNaN(lat) || Number.isNaN(lon)) {
                return;
            }

            map.setView([lat, lon], 15);

            if (currentMarker) {
                map.removeLayer(currentMarker);
            }

            currentMarker = L.marker([lat, lon]).addTo(map);
            currentMarker.bindPopup(buildPopupContent(place, true)).openPopup();

            //stx dbg test
            currentMarker.on('click', function (e) {
                let latlng = e.latlng;

            });


            if (statusEl) {
                var label = place && place.display_name ? place.display_name : 'Selected location';
                statusEl.textContent = 'Showing: ' + label;
            }

            applyPlaceToInput(place);
        }

        // handles the submit action for the top search form
        async function searchLocation(query) {
            if (!query) {
                updateSearchPreview('');
                return;
            }

            var submitButton = searchForm.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
            }
            if (statusEl) {
                statusEl.textContent = 'Searching...';
            }
            updateSearchPreview(query);

            try {
                var results = await fetchPlaces(query, {
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

                var place = results[0];
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

        // live search dropdown as you type
        async function fetchSuggestions(query) {
            if (!query || query.length < 3) {
                clearSuggestions();
                return;
            }

            try {
                var results = await fetchPlaces(query, { limit: 5 });

                if (!results || results.length === 0) {
                    clearSuggestions();
                    return;
                }

                suggestionsEl.innerHTML = '';
                suggestionsEl.scrollTop = 0;
                results.forEach((place) => {
                    var li = document.createElement('li');
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
            var modalLocationInput = document.querySelector('#new-entry-modal input[name="location"]');
            var modalSuggestionsEl = document.getElementById('modal-location-suggestions');
            var locationWrapper = document.querySelector('.LocationAutocomplete');

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
                    var results = await fetchPlaces(query, { limit: 5 });

                    if (!results || results.length === 0) {
                        clearModalSuggestions();
                        return;
                    }

                    modalSuggestionsEl.innerHTML = '';
                    results.forEach((place) => {
                        var li = document.createElement('li');
                        li.innerHTML = buildSuggestionMarkup(place);
                        li.tabIndex = 0;
                        li.setAttribute('role', 'option');
                        li.addEventListener('click', () => {
                            var { name } = parseDisplayName(place);
                            modalLocationInput.value = name || place.display_name || '';
                            modalLocationInput.dataset.lat = place.lat;
                            modalLocationInput.dataset.lon = place.lon;
                            modalLocationInput.dataset.address = place.display_name;
                            modalLocationInput.dataset.displayName = modalLocationInput.value;
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
                delete modalLocationInput.dataset.address;

                var query = modalLocationInput.value.trim();

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
            var query = inputEl.value.trim();

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
