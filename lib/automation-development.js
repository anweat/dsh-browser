/** Model-facing draft development core, independent of Harness tool transport. */
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
    assertEnabled() {
        if (!this.policy.modelDevelopmentEnabled)
            throw new Error('model automation development is disabled');
    }
}
//# sourceMappingURL=automation-development.js.map