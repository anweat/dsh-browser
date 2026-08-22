/**
 * Bounded, auditable Playwright recipes for model-generated browser flows.
 * Recipes deliberately expose named operations instead of arbitrary JavaScript.
 * @module dsh-browser/automation
 */
export type BrowserRecipeStep = {
    type: 'wait';
    condition: 'selector' | 'text' | 'load' | 'time';
    value?: string;
    waitMs?: number;
    timeoutMs?: number;
} | {
    type: 'click';
    selector: string;
    timeoutMs?: number;
} | {
    type: 'fill';
    selector: string;
    value: string;
    timeoutMs?: number;
} | {
    type: 'type';
    selector: string;
    value: string;
    timeoutMs?: number;
} | {
    type: 'press';
    key: string;
    selector?: string;
} | {
    type: 'select';
    selector: string;
    value: string;
} | {
    type: 'check';
    selector: string;
    checked?: boolean;
} | {
    type: 'hover';
    selector: string;
} | {
    type: 'scroll';
    deltaY?: number;
    waitMs?: number;
} | {
    type: 'extract';
    selector?: string;
    mode?: 'text' | 'html' | 'links' | 'attribute';
    attribute?: string;
    limit?: number;
} | {
    type: 'assert';
    selector?: string;
    text?: string;
    timeoutMs?: number;
} | {
    type: 'screenshot';
};
export interface RecipeStepResult {
    step: number;
    action: BrowserRecipeStep['type'];
    ok: boolean;
    value?: string;
}
export declare function validateRecipe(steps: readonly BrowserRecipeStep[]): void;
export declare function recipeNeedsApproval(steps: readonly BrowserRecipeStep[]): boolean;
export declare function runRecipe(page: any, steps: readonly BrowserRecipeStep[], captureScreenshot: () => Promise<string>, signal?: AbortSignal): Promise<RecipeStepResult[]>;
