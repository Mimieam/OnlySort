/* ===================================================================
 * FN UTILS
 * ================================================================= */
const pipe = (...fns) => (value) => fns.reduce((acc, fn) => fn(acc), value);
const asyncPipe = (...fns) => (value) => fns.reduce((acc, fn) => acc.then(fn), Promise.resolve(value));
const curry = (fn) => (...args) => args.length >= fn.length ? fn(...args) : curry(fn.bind(null, ...args));
const pipeLog = (label) => (v, fnName) => (console.log(label ?? fnName ?? "", v), v);

/* ===================================================================
 * URL UTILS
 * ================================================================= */
const parseHost = (url) => {
    try {
        const { hostname } = new URL(url);
        const parts = hostname.split(".");
        if (parts.length <= 2) return { domain: hostname, subdomain: "" };
        return {
            domain: parts.slice(-2).join("."),
            subdomain: parts.slice(0, -2).join("."),
        };
    } catch {
        return { domain: "", subdomain: "" };
    }
};

/* ===================================================================
 * STORAGE UTILS
 * ================================================================= */
const Storage = {
    ext: {
        get: curry(async (key, defaultValue = null) => (await globalThis.chrome.storage.local?.get(key))[key] ?? defaultValue),
        set: curry((key, value) => globalThis.chrome.storage.local?.set({[key]: value})),
        incrementStat: (key) => asyncPipe(
            () => Storage.ext.get(key, 0),
            Number,
            (n) => n + 1,
            (newValue) => Storage.ext.set(key, newValue)
        )(),
        state: {
            // Updated to snapshot current window/tab config
            snapshot: (type) => asyncPipe(
                () => chrome.windows.getAll({ populate: true }),
                (windows) => windows.map(w => ({ id: w.id, tabs: w.tabs.map(t => t.id) })),
                (snapshot) => Storage.ext.state.push({ type, snapshot })
            )(),

            push: (data, key = "ext.windowStates") => asyncPipe(
                () => Storage.ext.get(key, []),
                (stack) => (stack.push(data), stack),
                (newStack) => Storage.ext.set(key, newStack)
            )(),

            pop: (key = "ext.windowStates") => asyncPipe(
                () => Storage.ext.get(key, []),
                (stack) => ({ item: stack.pop(), stack }),
                ({ item, stack }) => Storage.ext.set(key, stack).then(() => item)
            )(),
        },
    },
};

/* ===================================================================
 * SORT UTILS
 * ================================================================= */

export const sortBy = (accessor, { caseInsensitive = false } = {}) => (a, b) => {
    let x = accessor(a) ?? '';
    let y = accessor(b) ?? '';

    if (typeof x === 'string' && typeof y === 'string') {
        if (caseInsensitive) {
            x = x.toLowerCase();
            y = y.toLowerCase();
        }
        return x.localeCompare(y);
    }

    return x > y ? 1 : x < y ? -1 : 0;
};

export const sortByTitle = sortBy(t => t.title, { caseInsensitive: true });
export const sortByUrl = sortBy(t => t.url, { caseInsensitive: true });
export const sortByDomain = sortBy((t) => parseHost(t.url).domain, { caseInsensitive: true });
export const sortBySubdomain = sortBy((t) => parseHost(t.url).subdomain, { caseInsensitive: true });
const chainSorts = (comparators) => (a, b) => comparators.reduce((res, cmp) => (res !== 0 ? res : cmp(a, b)), 0);


/* ===================================================================
 * UNDO/RESTORE UTILS
 * ================================================================= */
const Restore = {
    filterLiveTabs: async (tabIds) => {
        const liveTabs = await chrome.tabs.query({});
        const liveSet = new Set(liveTabs.map(t => t.id));
        return tabIds.filter(id => liveSet.has(id));
    },

    toOriginalWindow: (liveWindowIds) => async (savedWindow) => {
        const validTabs = await Restore.filterLiveTabs(savedWindow.tabs);
        if (validTabs.length === 0) return;

        return liveWindowIds.has(savedWindow.id)
            ? chrome.tabs.move(validTabs, { windowId: savedWindow.id, index: -1 })
            : chrome.windows.create({ focused: false }).then(newWin =>
                chrome.tabs.move(validTabs, { windowId: newWin.id, index: -1 }));
    }
};

/* ===================================================================
 * DOM UTILS
 * ================================================================= */
const DOM = {
    // why lol.. this is silly but i love it!
    get: (str) => document.querySelector(`${str}`) ?? document.querySelector(`#${str}`) ?? document.querySelector(`.${str}`),
    setStyle: curry((property, value, element) => element && (element.style[property] = value)),
}

/* ===================================================================
 * UI UTILITIES
 * ================================================================= */
const UI = {
    typeMap: {
        // Mapping utility to convert stored type to display text - this probably doesn't belong in this utils but meh.. :D
        'All': '[All windows]',
        'Current': '[Current Window]'
    },
    pipeToast: (message = "✅") => {
        const toast = DOM.get('toast');
        if (!toast.classList.contains('show')) {
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 1500);
        }
        return message;
    },
    renderUndoBtn: () => asyncPipe(
        () => Storage.ext.get("ext.windowStates", []),
        // (stack) => DOM.setStyle('display', stack.length > 0 ? 'block' : 'none', DOM.get('undo-last-sort')),
        // () => DOM.get('undo-last-sort')?.addEventListener('click', Handlers.undoLastSort)
        (stack) => {
            const btn = DOM.get('undo-last-sort');
            if (!btn) return;

            const count = stack.length;
            const lastAction = stack[count - 1] || {};
            const actionText = UI.typeMap[lastAction.type] || '[Unknown Scope]';
            const displayText = `Undo Last Sort on ${ actionText } -- (${ count })`;

            btn.textContent = displayText;
            DOM.setStyle('display', stack.length ? 'block' : 'none', btn);
            DOM.setStyle('font-size', 'inherit', btn);

            !btn.dataset.bound && (
                btn.addEventListener('click', Handlers.undoLastSort),
                btn.dataset.bound = "true"
            );
        }
    )()
};

/* ===================================================================
 * EVENT HANDLERS
 * ================================================================= */
const Handlers = {
    sortAllTabs: async () => await asyncPipe(
        () => console.time('sortAllTabs'),
        () => Storage.ext.state.snapshot("All"),
        () => chrome.windows.getAll({ populate: true }),
        async (allWindows) => allWindows.map(w => [
            w.id,
            w.tabs.sort(
                pipe(
                    () => [sortByDomain, sortBySubdomain, sortByTitle],
                    (comparators) => chainSorts(comparators)
                )()
            ).map(t=>t.id)]
        ),
        async (formattedWindows) => {
            formattedWindows.map(([wId, tabIds])=> chrome.tabs.move(tabIds, {index:-1, windowId: wId}))
        },
        () => console.timeEnd('sortAllTabs'),
        () => Storage.ext.incrementStat("ext.stats.sortAllTabs"),
        () => UI.pipeToast(),
        () => UI.renderUndoBtn(),
    )(),

    sortTabsInThiswindow: async () => await asyncPipe(
        () => console.time('sortTabsInThiswindow'),
        () => Storage.ext.state.snapshot("Current"),
        () => chrome.windows.getCurrent({populate: true}), // this seems more expensive than getAll...
        // pipeLog(),
        async (w) =>[
            w.id,
            w.tabs.sort(
                pipe(
                    () => [sortByDomain, sortBySubdomain, sortByTitle],
                    (comparators) => chainSorts(comparators)
                )()
            ).map(t => t.id)
        ],
        // pipeLog(),

        async ([wId, tabIds]) => chrome.tabs.move(tabIds, { index: -1, windowId: wId }),
        () => console.timeEnd('sortTabsInThiswindow'),
        () => Storage.ext.incrementStat("ext.stats.sortTabsInThiswindow"),
        () => UI.pipeToast(),
        () => UI.renderUndoBtn(),
    )(),

    undoLastSort: async () => await asyncPipe(
        () => console.time('undoLastSort'),
        () => Storage.ext.state.pop(), // Returns { type, snapshot: [...] }
        (state) => state?.snapshot ? state.snapshot : Promise.reject("Stack Empty"),

        // Parallel execution - this was annoying to figure out..
        async (lastState) => {
            const currentWindows = await chrome.windows.getAll();
            const liveWinIds = new Set(currentWindows.map(w => w.id));

            return Promise.all(
                lastState.map(Restore.toOriginalWindow(liveWinIds))
            );
        },

        () => console.timeEnd('undoLastSort'),
        () => UI.pipeToast("↺ Undo Complete"),
        () => UI.renderUndoBtn(),
    )().catch(err => console.warn("Undo aborted:", err)),
}

/* ===================================================================
 * EVENT BINDING
 * ================================================================= */
const Events = {
    bindUI: () => {
        DOM.get('sort-all-tabs').addEventListener('click', Handlers.sortAllTabs);
        DOM.get('sort-tabs-in-this-window')?.addEventListener('click', Handlers.sortTabsInThiswindow);
        // DOM.get('undo-last-sort')?.addEventListener('click', Handlers.undoLastSort);
        console.log(`Event.bindUI ✅`)
    },
    bindBrowser: ()=>{
        asyncPipe(
            () => chrome.windows.getAll({ populate: true }),
            (allWindows) => Storage.ext.set("all_windows", allWindows),
            () => console.log(`Event.bindBrowser ✅`)
        )();
    }
};

/* ===================================================================
 * APP wrapper
 * ================================================================= */
const App = {
    init: () => pipe(
        Events.bindUI,
        Events.bindBrowser,
        UI.renderUndoBtn,
    )(),
};

/* ===================================================================
 * Initializer
 * ================================================================= */
document.addEventListener('DOMContentLoaded', App.init());
console.log("Popup.mjs - loaded")