export type RuleStep = {
    type: 'waitFor';
    selector: string;
    timeoutMs?: number;
    optional?: boolean;
} | {
    type: 'click';
    selector: string;
    timeoutMs?: number;
    optional?: boolean;
} | {
    type: 'scroll';
    deltaY?: number;
    repeat?: number;
    waitMs?: number;
} | {
    type: 'wait';
    waitMs: number;
};
export interface RulePackConfig {
    matches: string[];
    initScriptPath?: string;
    /** Required when initScriptPath is set. */
    initScriptSha256?: string;
    steps?: RuleStep[];
}
export interface ResolvedRulePack extends RulePackConfig {
    id: string;
    steps: RuleStep[];
}
export declare function resolveRulePack(packs: Record<string, RulePackConfig>, id: string | undefined, targetUrl: string): ResolvedRulePack | undefined;
export declare function applyRuleSteps(page: any, pack: ResolvedRulePack | undefined): Promise<void>;
