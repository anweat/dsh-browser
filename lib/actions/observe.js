/** `observe` group: read the page, take screenshots. @module dsh-browser/actions/observe */
import { ActionArgError } from "./types.js";
import { TARGET_PARAMS } from "./schema.js";
import { targetOf } from "./shared.js";
import { ObserveArgError, OBSERVE_SECTIONS } from "../observe.js";
const OBSERVE_TOPICS = {
    controls: {
        summary: 'fields of a controls record',
        text: [
            'One record per control: input, select, textarea, button, summary, contenteditable, ARIA widget (role=button, checkbox, ...). Radio inputs sharing a name are ONE record with role radiogroup and options. Open shadow DOM and same-origin iframes are searched.',
            'Use a record directly: browser_call({action:"act.fill",args:{locator:<record.locator>,text:"..."}}).',
            'A field that is absent was not observed or does not apply; false always means observed and not so.',
            '  role, name, type - accessible role and name; type: input type, select-one, select-multiple, textarea, contenteditable.',
            '  locator - verified on the live page to match this element only; has framePath inside an iframe.',
            '  ambiguous:true - no unique locator exists. If locator is present it matches `matches` elements and this one is the nth (0-based): add index:nth plus an indexReason, or narrow with observe.read locator.',
            '  actions - act.* names that can work now; [] when hidden, disabled, or readonly.',
            '  visible, disabled, readonly, checked (true|false|"mixed"), expanded - states the control has.',
            '  hasValue - not empty. value appears only with includeValues:true, and never for password, hidden, file, or token-like fields (those carry sensitive:true).',
            '  options - select: [{value,label,selected,disabled?}], [] means no options; radiogroup: [{label,value,checked,disabled?,locator}].',
            '  constraints - as declared: required, min, max, step, pattern, minlength, maxlength, accept, multiple.',
            '  validity - {valid, flags?, validationMessage?} from the browser\'s own constraint validation.',
            '  source - dom (native element state) or aria (role and aria-* attributes).',
            'frames lists each iframe searched; a cross-origin or sandboxed one has crossOrigin:true and its content is not observed (act.* can still use its framePath). Closed shadow roots cannot be read.',
        ].join('\n'),
    },
    links: {
        summary: 'fields of a links record',
        text: [
            'One record per a[href] / area[href]: {text, href, locator, visible, target?}. href is absolute. locator is verified unique (role link + name, else the href, id, or testId); same-text links get distinct locators or ambiguous:true as for controls (browser_index({action:"observe.read.controls"})). A secret-looking query value (token, secret, password, session, ...) shows as [redacted] and the link gets no href locator.',
        ].join('\n'),
    },
    tables: {
        summary: 'fields of a tables record and coverage',
        text: [
            'One record per table, or role=table/grid/treegrid element: {name?, locator, headers, rows, totalRows, coverage, reason?, declaredRows?}. rows holds the first maxItems rows as cell text; totalRows is how many rows the DOM holds.',
            'An empty body is rows:[] and totalRows:0 with its headers: a real empty result, not "not found" (that would be no table record, counts.tables 0).',
            'coverage:"partial" means the page has more rows than the DOM shows, and reason says why: a virtualized list (aria-rowcount larger than the rendered rows, declaredRows is the declared count) or pagination controls next to the table. Scroll or use the pager (act.*), then observe again. complete only says no such sign was found.',
        ].join('\n'),
    },
    truncation: {
        summary: 'limits, truncation, and sensitive values',
        text: [
            'maxItems caps each section and each table\'s rows; maxBytes caps the whole result (2000-90000). The result is always valid JSON: whole items or rows are dropped from the end, text is cut at a character.',
            'truncation:{omittedBySection, reason} appears when anything is missing: content counts characters, tableRows counts rows, controls/links/tables count items. counts has how many the page had. No truncation key means nothing was cut.',
            'To get the rest: raise maxItems/maxBytes, ask for one section, or scope with locator (a form, a table) or region.',
            'limits (if present) lists what was not covered, such as cross-origin iframes. generation is the page generation at the start of the scan: pass it as expectGeneration to the next act.*.',
        ].join('\n'),
    },
};
export const OBSERVE_ACTIONS = [
    {
        name: 'observe.read',
        group: 'observe',
        summary: 'Read the current page: URL, title, readable text; with sections also its controls, links, and tables.',
        notes: 'Always returns url, title, targetId, generation. Default sections [content] adds text. controls/links/tables give records whose locator you can pass to act.*; a locator is checked unique on the live page. Results are cut at item boundaries to fit maxBytes (truncation lists what is missing).',
        topics: OBSERVE_TOPICS,
        params: {
            sections: { type: 'array', items: { type: 'string', enum: OBSERVE_SECTIONS }, description: 'Any of content (default), controls, links, tables.' },
            ...TARGET_PARAMS,
            region: { type: 'object', additionalProperties: false, description: 'Only items that touch this viewport rectangle.', properties: { x: { type: 'number', required: true }, y: { type: 'number', required: true }, width: { type: 'number', required: true }, height: { type: 'number', required: true } } },
            maxItems: { type: 'number', description: 'Per section, 1-500. Default 50.' },
            maxBytes: { type: 'number', description: 'Whole result, 2000-90000. Default 24000. Cut at item boundaries; truncation says what is missing.' },
            includeValues: { type: 'boolean', description: 'Return control values. Never for password, hidden, or token-like fields (hasValue only).' },
            timeoutMs: { type: 'number', description: 'Wait for the locator, 1-30000 ms.' },
        },
        approval: 'none', readOnly: true, mutating: false, concurrencySafe: false, timeoutMs: 30_000,
        examples: [{ args: {} }, { args: { sections: ['controls'], locator: { role: 'form' } }, note: 'fields of one form' }],
        async execute(args, ctx) {
            const plain = ['sections', 'selector', 'locator', 'region', 'maxItems', 'maxBytes', 'includeValues', 'timeoutMs'].every(key => args[key] === undefined);
            if (plain)
                return ctx.service.read({ session: ctx.session });
            try {
                return await ctx.service.observe({
                    ...args.sections ? { sections: args.sections } : {},
                    ...targetOf(args, false) !== undefined ? { target: targetOf(args, false) } : {},
                    ...args.region ? { region: args.region } : {},
                    ...args.maxItems !== undefined ? { maxItems: args.maxItems } : {},
                    ...args.maxBytes !== undefined ? { maxBytes: args.maxBytes } : {},
                    ...args.includeValues !== undefined ? { includeValues: args.includeValues } : {},
                    ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {},
                    session: ctx.session,
                });
            }
            catch (error) {
                if (error instanceof ObserveArgError)
                    throw new ActionArgError(error.message);
                throw error;
            }
        },
    },
    {
        name: 'observe.screenshot',
        group: 'observe',
        summary: 'Capture the page, a clip region, or one element. Files land inside the configured snapshotDir.',
        params: {
            ...TARGET_PARAMS,
            clip: { type: 'object', additionalProperties: false, properties: {
                    x: { type: 'number', required: true }, y: { type: 'number', required: true }, width: { type: 'number', required: true }, height: { type: 'number', required: true },
                } },
            fullPage: { type: 'boolean', description: 'Capture the full scrollable page. Defaults to true for page screenshots; incompatible with selector/locator.' },
            format: { type: 'string', enum: ['png', 'jpeg'], description: 'Image format. Defaults from filename or png.' },
            quality: { type: 'number', description: 'JPEG quality 0-100.' },
            filename: { type: 'string', description: 'Plain filename ending in .png, .jpg, or .jpeg. Directory traversal and absolute paths are rejected.' },
        },
        approval: 'none', readOnly: true, mutating: false, concurrencySafe: false, timeoutMs: 30_000,
        examples: [{ args: {} }, { args: { locator: { role: 'heading', name: 'Pricing' } }, note: 'element screenshot' }],
        async execute(args, ctx) {
            const target = targetOf(args, false);
            return ctx.service.screenshot({
                ...target ? { target } : {},
                ...args.clip ? { clip: args.clip } : {},
                ...args.fullPage !== undefined ? { fullPage: args.fullPage } : {},
                ...args.format ? { format: args.format } : {},
                ...args.quality !== undefined ? { quality: args.quality } : {},
                ...args.filename ? { filename: args.filename } : {},
                session: ctx.session,
            });
        },
    },
];
//# sourceMappingURL=observe.js.map