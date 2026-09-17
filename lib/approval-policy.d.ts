/** Approval classification for multi-action and arbitrary-code browser tools. */
import { type AutomationMode } from './freedom.ts';
export type BrowserPolicyDecision = {
    kind: 'allow';
} | {
    kind: 'deny';
    reason: string;
} | {
    kind: 'ask';
    reason: string;
};
export declare function browserPolicyDecision(name: string, args: unknown, mode?: AutomationMode, assetKind?: 'recipe' | 'userscript'): BrowserPolicyDecision;
