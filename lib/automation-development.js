/** Model-facing draft development core, independent of Harness tool transport. */
import { convertV1ToV2Draft } from "./automation-convert.js";
import { buildDraftFromJournal } from "./automation-journal.js";
export class AutomationDevelopmentService {
    store;
    policy;
    writesBySession = new Map();
    constructor(store, policy) {
        this.store = store;
        this.policy = policy;
    }
    get(id) {
        this.assertEnabled();
        const asset = this.store.get(id);
        if (!asset)
            throw new Error('automation asset not found');
        return asset;
    }
    validate(id) {
        this.assertEnabled();
        return this.store.validate(id);
    }
    save(input, sessionId) {
        this.assertEnabled();
        const writes = this.writesBySession.get(sessionId) ?? 0;
        if (writes >= this.policy.maxModelDraftWritesPerSession)
            throw new Error('model draft write limit reached for this session');
        const asset = this.store.saveDraft(input);
        this.writesBySession.set(sessionId, writes + 1);
        if (this.writesBySession.size > 200)
            this.writesBySession.delete(this.writesBySession.keys().next().value ?? '');
        return asset;
    }
    /**
     * Build a v2 draft from a slice of the session's exploration journal and save it (one draft write; pass `id` to
     * replace a draft from an earlier call). The report says what became a step, what was left out and why.
     */
    draftFromJournal(journal, args, sessionId) {
        this.assertEnabled();
        const { id, ...rest } = args;
        const { draft, report } = buildDraftFromJournal(journal, rest);
        const asset = this.save({ ...draft, ...id ? { id } : {} }, sessionId);
        return { asset, report };
    }
    /**
     * Convert a v1 recipe asset (any status) into a NEW v2 draft. The source is only read: its revision,
     * status, and content stay as they were. Counts as one draft write for the session.
     */
    convert(id, sessionId) {
        this.assertEnabled();
        const source = this.store.get(id);
        if (!source)
            throw new Error('automation asset not found');
        const conversion = convertV1ToV2Draft(source);
        const writes = this.writesBySession.get(sessionId) ?? 0;
        if (writes >= this.policy.maxModelDraftWritesPerSession)
            throw new Error('model draft write limit reached for this session');
        const draft = this.store.saveDraft(conversion.draft);
        this.writesBySession.set(sessionId, writes + 1);
        if (this.writesBySession.size > 200)
            this.writesBySession.delete(this.writesBySession.keys().next().value ?? '');
        return { draft, conversion };
    }
    /**
     * Copy an asset (typically an active one that stopped working) into a new draft that records its source.
     * Counts as one draft write for the session. The source keeps running until the copy replaces it on activation.
     */
    fork(id, sessionId) {
        this.assertEnabled();
        const writes = this.writesBySession.get(sessionId) ?? 0;
        if (writes >= this.policy.maxModelDraftWritesPerSession)
            throw new Error('model draft write limit reached for this session');
        const draft = this.store.fork(id);
        this.writesBySession.set(sessionId, writes + 1);
        if (this.writesBySession.size > 200)
            this.writesBySession.delete(this.writesBySession.keys().next().value ?? '');
        return draft;
    }
    assertEnabled() {
        if (!this.policy.modelDevelopmentEnabled)
            throw new Error('model automation development is disabled');
    }
}
//# sourceMappingURL=automation-development.js.map