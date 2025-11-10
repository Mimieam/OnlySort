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
        )()
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

    pipeToast: (message = "✅") => {
        const toast = DOM.get('toast');
        if (!toast.classList.contains('show')) {
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 1500);
        }
        return message; 
    }
};

/* ===================================================================
 * EVENT HANDLERS
 * ================================================================= */
const Handlers = {
    sortAllTabs: async () => await asyncPipe(
        () => console.time('sortAllTabs'),
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
        () => UI.pipeToast()
    )(),

    sortTabsInThiswindow: async () => await asyncPipe(
        () => console.time('sortTabsInThiswindow'),
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
        () => UI.pipeToast()
    )()
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
    )(),
};

/* ===================================================================
 * Initializer
 * ================================================================= */
document.addEventListener('DOMContentLoaded', App.init());
console.log("Popup.mjs - loaded")