/** Approval classification for multi-action and arbitrary-code browser tools. */
export type BrowserPolicyDecision = {
    kind: 'allow';
} | {
    kind: 'deny';
    reason: string;
} | {
    kind: 'ask';
    reason: string;
};
export declare function browserPolicyDecision(name: string, args: unknown): BrowserPolicyDecision;
